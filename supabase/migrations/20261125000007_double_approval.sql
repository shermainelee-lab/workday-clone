-- Workday Clone: optional double approval for leave and claims.
-- A person flagged "needs second approval" has their manager approve first, then the Executive Director
-- (the active Director who reports to nobody). Leave is only booked, and a claim only goes to Finance,
-- after the second approval. Either approver can reject. The same person cannot give both approvals.

alter table public.employees add column needs_second_approval boolean not null default false;

alter table public.leave_requests
  add column requires_second boolean not null default false,
  add column first_decided_by uuid references public.employees(id),
  add column first_decided_at timestamptz,
  add column first_remark text;

alter table public.claims
  add column requires_second boolean not null default false,
  add column first_decided_by uuid references public.employees(id),
  add column first_decided_at timestamptz,
  add column first_remark text;

-- the second approver: the active Director with no manager
create function public._second_approver(p_emp uuid) returns uuid language sql stable security definer set search_path = public as $$
  select id from public.employees
   where is_active and role = 'director' and manager_id is null and id <> p_emp
   order by created_at limit 1 $$;

-- stamp each new request with whether it needs two approvals (so later changes to the staff setting do not alter requests in flight)
create function public._set_requires_second() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.requires_second := coalesce((select needs_second_approval from public.employees where id = new.employee_id), false);
  if new.requires_second and public._second_approver(new.employee_id) is null then
    raise exception 'Second approval is required for you, but no Executive Director is set up (a Director who reports to nobody). Ask HR.';
  end if;
  return new;
end $$;
create trigger leave_requests_requires_second before insert on public.leave_requests for each row execute function public._set_requires_second();
create trigger claims_requires_second before insert on public.claims for each row execute function public._set_requires_second();

revoke all on function public._second_approver(uuid), public._set_requires_second() from public, anon, authenticated;

-- the first approver keeps read access after handing over
drop policy leave_requests_read on public.leave_requests;
create policy leave_requests_read on public.leave_requests for select to authenticated
  using (employee_id = (select public.current_employee_id())
         or approver_id = (select public.current_employee_id())
         or escalated_to = (select public.current_employee_id())
         or first_decided_by = (select public.current_employee_id())
         or (select public.has_role('hr','admin','director','office_manager')));

drop policy claims_read on public.claims;
create policy claims_read on public.claims for select to authenticated
  using (employee_id = (select public.current_employee_id())
         or approver_id = (select public.current_employee_id())
         or escalated_to = (select public.current_employee_id())
         or first_decided_by = (select public.current_employee_id())
         or (select public.has_role('hr','admin','director','finance')));

-- ===== leave decision =====
create or replace function public.decide_leave_request(p_id uuid, p_approve boolean, p_remark text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := public.current_employee_id(); r public.leave_requests%rowtype; t public.leave_types%rowtype; v_bal numeric; v_word text;
        v_stage2 boolean; v_second uuid; v_name text;
begin
  if me is null then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Your login is not linked to a staff record.')); end if;
  select * into r from public.leave_requests where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Request not found.')); end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'errors', jsonb_build_array(format('This request is already %s.', r.status))); end if;
  if r.employee_id = me then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('You cannot decide your own request.')); end if;

  v_stage2 := r.requires_second and r.first_decided_at is not null;
  if v_stage2 then
    if me = r.first_decided_by then
      return jsonb_build_object('ok', false, 'errors', jsonb_build_array('You gave the first approval. A different person must give the second.'));
    end if;
    if not coalesce(me = r.approver_id or me = r.escalated_to or public.has_role('admin'), false) then
      return jsonb_build_object('ok', false, 'errors', jsonb_build_array('This request is waiting for second approval from the Executive Director.'));
    end if;
  elsif not coalesce(me = r.approver_id or me = r.escalated_to or public.has_role('director','admin'), false) then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('You are not the approver for this request.'));
  end if;
  if not p_approve and nullif(btrim(coalesce(p_remark, '')), '') is null then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('A remark is required when rejecting a request.'));
  end if;
  select * into t from public.leave_types where id = r.leave_type_id;
  if p_approve then
    v_bal := public._leave_balance(r.employee_id, r.leave_type_id, r.year);
    if t.over_limit_action = 'block' and r.days > v_bal then
      return jsonb_build_object('ok', false, 'errors', jsonb_build_array(format('Cannot approve: the employee now has only %s day(s) of %s left.', v_bal, t.name)));
    end if;

    -- first of two approvals: hand the request to the second approver and stop here
    if r.requires_second and not v_stage2 then
      v_second := public._second_approver(r.employee_id);
      if v_second is not null and v_second <> me then
        update public.leave_requests
           set first_decided_by = me, first_decided_at = now(), first_remark = nullif(btrim(p_remark), ''),
               approver_id = v_second, escalated_to = null, escalated_at = null, last_reminder_at = null
         where id = p_id;
        select full_name into v_name from public.employees where id = r.employee_id;
        perform public._log_event('leave', r.id, r.ref, 'first_approved', me, 'pending', 'pending', nullif(btrim(p_remark), ''), jsonb_build_object('second_approver', v_second));
        perform public._notify(v_second, format('Second approval needed: %s', v_name),
          format('%s requested %s day(s) of %s (%s to %s). Their manager has approved it.', v_name, r.days, t.name, r.start_date, r.end_date), '/approvals', 'leave', r.id);
        perform public._notify(r.employee_id, format('Leave first-approved: %s', r.ref),
          'Your manager approved this request. It now needs the Executive Director''s approval.', '/leave/' || r.id, 'leave', r.id);
        return jsonb_build_object('ok', true, 'status', 'pending', 'stage', 2);
      end if;
    end if;

    update public.leave_requests set status = 'approved', decided_at = now(), decided_by = me, decision_remark = nullif(btrim(p_remark), '') where id = p_id;
    insert into public.leave_ledger(employee_id, leave_type_id, year, entry_type, days, request_id, note, created_by)
    values (r.employee_id, r.leave_type_id, r.year, 'usage', r.days, r.id, 'Approved ' || r.ref, me);
  else
    update public.leave_requests set status = 'rejected', decided_at = now(), decided_by = me, decision_remark = btrim(p_remark) where id = p_id;
  end if;
  v_word := case when p_approve then 'approved' else 'rejected' end;
  perform public._log_event('leave', r.id, r.ref, v_word, me, 'pending', v_word, nullif(btrim(p_remark), ''));
  perform public._notify(r.employee_id, format('Leave %s: %s', v_word, r.ref),
    format('Your %s request (%s to %s) was %s.%s', t.name, r.start_date, r.end_date, v_word, coalesce(' Remark: ' || nullif(btrim(p_remark), ''), '')), '/leave/' || r.id, 'leave', r.id);
  perform public._notify_roles(array['office_manager','hr']::public.app_role[], format('Leave %s: %s', v_word, r.ref),
    format('%s request (%s to %s) was %s.', t.name, r.start_date, r.end_date, v_word), '/leave/' || r.id, 'leave', r.id, array[r.employee_id, me]);
  return jsonb_build_object('ok', true, 'status', v_word);
end $$;

-- ===== claim decision =====
create or replace function public.decide_claim(p_id uuid, p_approve boolean, p_remark text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := public.current_employee_id(); c public.claims%rowtype; v_status public.claim_status;
        v_stage2 boolean; v_second uuid; v_name text;
begin
  if me is null then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Your login is not linked to a staff record.')); end if;
  select * into c from public.claims where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Claim not found.')); end if;
  if c.status <> 'pending' then return jsonb_build_object('ok', false, 'errors', jsonb_build_array(format('This claim is already %s.', c.status))); end if;
  if c.employee_id = me then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('You cannot decide your own claim.')); end if;

  v_stage2 := c.requires_second and c.first_decided_at is not null;
  if v_stage2 then
    if me = c.first_decided_by then
      return jsonb_build_object('ok', false, 'errors', jsonb_build_array('You gave the first approval. A different person must give the second.'));
    end if;
    if not coalesce(me = c.approver_id or me = c.escalated_to or public.has_role('admin'), false) then
      return jsonb_build_object('ok', false, 'errors', jsonb_build_array('This claim is waiting for second approval from the Executive Director.'));
    end if;
  elsif not coalesce(me = c.approver_id or me = c.escalated_to or public.has_role('director','admin'), false) then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('You are not the approver for this claim.'));
  end if;
  if not p_approve and nullif(btrim(coalesce(p_remark, '')), '') is null then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('A remark is required when rejecting a claim.'));
  end if;

  -- first of two approvals: hand the claim to the second approver and stop here
  if p_approve and c.requires_second and not v_stage2 then
    v_second := public._second_approver(c.employee_id);
    if v_second is not null and v_second <> me then
      update public.claims
         set first_decided_by = me, first_decided_at = now(), first_remark = nullif(btrim(p_remark), ''),
             approver_id = v_second, escalated_to = null, escalated_at = null, last_reminder_at = null
       where id = p_id;
      select full_name into v_name from public.employees where id = c.employee_id;
      perform public._log_event('claim', c.id, c.ref, 'first_approved', me, 'pending', 'pending', nullif(btrim(p_remark), ''), jsonb_build_object('second_approver', v_second));
      perform public._notify(v_second, format('Second approval needed: %s', v_name),
        format('%s - SGD %s. Their manager has approved it.', c.description, c.total_amount), '/approvals', 'claim', c.id);
      perform public._notify(c.employee_id, format('Claim first-approved: %s', c.ref),
        'Your manager approved this claim. It now needs the Executive Director''s approval.', '/claims/' || c.id, 'claim', c.id);
      return jsonb_build_object('ok', true, 'status', 'pending', 'stage', 2);
    end if;
  end if;

  v_status := case when p_approve then 'submitted_to_finance' else 'rejected' end;
  update public.claims set status = v_status, decided_at = now(), decided_by = me, decision_remark = nullif(btrim(p_remark), '') where id = p_id;
  perform public._log_event('claim', c.id, c.ref, case when p_approve then 'approved' else 'rejected' end, me, 'pending', v_status::text, nullif(btrim(p_remark), ''));
  perform public._notify(c.employee_id, format('Claim %s: %s', case when p_approve then 'approved' else 'rejected' end, c.ref),
    format('%s (SGD %s) was %s.%s', c.description, c.total_amount, case when p_approve then 'approved and sent to Finance' else 'rejected' end, coalesce(' Remark: ' || nullif(btrim(p_remark), ''), '')), '/claims/' || c.id, 'claim', c.id);
  if p_approve then
    perform public._notify_roles(array['finance']::public.app_role[], format('Claim ready to pay: %s', c.ref), format('%s - SGD %s', c.description, c.total_amount), '/finance', 'claim', c.id, array[c.employee_id]);
  end if;
  return jsonb_build_object('ok', true, 'status', v_status);
end $$;

-- ===== reminders: the clock restarts when a request reaches the second approver =====
create or replace function public.process_approval_reminders() returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_today date := public.sg_today(); elapsed numeric; v_next uuid; n_rem int := 0; n_esc int := 0;
begin
  for r in
    select 'leave'::text as kind, id, ref, employee_id, approver_id, coalesce(first_decided_at, submitted_at) as since, last_reminder_at, escalated_at from public.leave_requests where status = 'pending'
    union all
    select 'claim'::text, id, ref, employee_id, approver_id, coalesce(first_decided_at, submitted_at), last_reminder_at, escalated_at from public.claims where status = 'pending'
  loop
    elapsed := public.working_days((r.since at time zone 'Asia/Singapore')::date + 1, v_today);
    if elapsed >= 1 and (r.last_reminder_at is null or (r.last_reminder_at at time zone 'Asia/Singapore')::date < v_today) then
      perform public._notify(r.approver_id, format('Reminder: %s is waiting for your decision', r.ref), 'Please approve or reject within 1 working day.', '/approvals', r.kind, r.id);
      if r.kind = 'leave' then update public.leave_requests set last_reminder_at = now() where id = r.id;
      else update public.claims set last_reminder_at = now() where id = r.id; end if;
      n_rem := n_rem + 1;
    end if;
    if elapsed >= 2 and r.escalated_at is null then
      v_next := public._resolve_approver(r.approver_id);
      if v_next is not null and v_next <> r.employee_id then
        if r.kind = 'leave' then update public.leave_requests set escalated_at = now(), escalated_to = v_next where id = r.id;
        else update public.claims set escalated_at = now(), escalated_to = v_next where id = r.id; end if;
        perform public._log_event(r.kind, r.id, r.ref, 'escalated', null, 'pending', 'pending', null, jsonb_build_object('escalated_to', v_next));
        perform public._notify(v_next, format('Escalated: %s unanswered for 2 working days', r.ref), 'The approver has not responded. You can approve or reject it.', '/approvals', r.kind, r.id);
        n_esc := n_esc + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('reminders', n_rem, 'escalations', n_esc);
end $$;
