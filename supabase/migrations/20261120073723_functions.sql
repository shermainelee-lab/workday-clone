-- ===== helpers =====
create function public.sg_today() returns date language sql stable set search_path = public as $$
  select (now() at time zone 'Asia/Singapore')::date $$;

create function public.current_employee_id() returns uuid language sql stable security definer set search_path = public as $$
  select id from public.employees where auth_user_id = auth.uid() and is_active limit 1 $$;

create function public.has_role(variadic roles public.app_role[]) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.employees where auth_user_id = auth.uid() and is_active and role = any(roles)) $$;

create function public.working_days(p_start date, p_end date) returns numeric language sql stable set search_path = public as $$
  select count(*)::numeric
  from generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') d
  where extract(isodow from d) < 6
    and not exists (select 1 from public.public_holidays h where h.holiday_date = d::date) $$;

create function public._resolve_approver(p_emp uuid) returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  select m.id into v from public.employees e join public.employees m on m.id = e.manager_id
   where e.id = p_emp and m.is_active;
  if v is not null then return v; end if;
  select id into v from public.employees
   where is_active and id <> p_emp and role in ('director','admin','hr')
   order by case role when 'director' then 1 when 'admin' then 2 else 3 end, created_at limit 1;
  return v;
end $$;

create function public._leave_balance(p_emp uuid, p_type uuid, p_year int) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select entitled_days + carried_over_days from public.leave_entitlements
                    where employee_id = p_emp and leave_type_id = p_type and year = p_year), 0)
       - coalesce((select sum(days) from public.leave_ledger
                    where employee_id = p_emp and leave_type_id = p_type and year = p_year), 0) $$;

create function public._leave_pending(p_emp uuid, p_type uuid, p_year int) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(days), 0) from public.leave_requests
   where employee_id = p_emp and leave_type_id = p_type and year = p_year and status = 'pending' $$;

create function public._notify(p_recipient uuid, p_subject text, p_body text, p_link text, p_type text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_recipient is null then return; end if;
  insert into public.notifications(recipient_id, subject, body, link, entity_type, entity_id)
  values (p_recipient, p_subject, p_body, p_link, p_type, p_id);
end $$;

create function public._notify_roles(p_roles public.app_role[], p_subject text, p_body text, p_link text, p_type text, p_id uuid, p_exclude uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications(recipient_id, subject, body, link, entity_type, entity_id)
  select e.id, p_subject, p_body, p_link, p_type, p_id
    from public.employees e
   where e.is_active and e.role = any(p_roles) and e.id <> all(coalesce(p_exclude, '{}'::uuid[]));
end $$;

create function public._log_event(p_type text, p_id uuid, p_ref text, p_action text, p_actor uuid, p_from text, p_to text, p_remark text, p_meta jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.request_events(entity_type, entity_id, ref, action, actor_id, from_status, to_status, remark, metadata)
  values (p_type, p_id, p_ref, p_action, p_actor, p_from, p_to, p_remark, coalesce(p_meta, '{}'));
end $$;

-- ===== balances view =====
create view public.leave_balances with (security_invoker = true) as
select e.employee_id, emp.full_name, emp.department_id, e.leave_type_id, lt.code as leave_code, lt.name as leave_type,
       e.year, e.entitled_days, e.carried_over_days,
       coalesce(u.used, 0) as used_days,
       coalesce(p.pending, 0) as pending_days,
       e.entitled_days + e.carried_over_days - coalesce(u.used, 0) as balance_days,
       e.entitled_days + e.carried_over_days - coalesce(u.used, 0) - coalesce(p.pending, 0) as available_days
  from public.leave_entitlements e
  join public.employees emp on emp.id = e.employee_id
  join public.leave_types lt on lt.id = e.leave_type_id
  left join lateral (select sum(l.days) as used from public.leave_ledger l
                      where l.employee_id = e.employee_id and l.leave_type_id = e.leave_type_id and l.year = e.year) u on true
  left join lateral (select sum(r.days) as pending from public.leave_requests r
                      where r.employee_id = e.employee_id and r.leave_type_id = e.leave_type_id and r.year = e.year and r.status = 'pending') p on true;

-- ===== entitlements =====
create function public.ensure_entitlements(p_year int) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is not null and not public.has_role('hr','admin') then
    raise exception 'Only HR can generate entitlements';
  end if;
  insert into public.leave_entitlements(employee_id, leave_type_id, year, entitled_days, note)
  select e.id, t.id, p_year,
         case when t.prorate_for_joiners and extract(year from e.join_date) = p_year
              then round(t.default_entitlement * (12 - extract(month from e.join_date) + case when extract(day from e.join_date) = 1 then 1 else 0 end) / 12.0 * 2) / 2
              else t.default_entitlement end,
         case when t.prorate_for_joiners and extract(year from e.join_date) = p_year then 'Pro-rated for joiner' end
    from public.employees e cross join public.leave_types t
   where e.is_active and t.is_active and t.default_entitlement > 0 and extract(year from e.join_date) <= p_year
  on conflict (employee_id, leave_type_id, year) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create function public.employees_after_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.ensure_entitlements(extract(year from public.sg_today())::int);
  perform public.ensure_entitlements(extract(year from public.sg_today())::int + 1);
  return new;
end $$;
create trigger employees_entitlements after insert on public.employees for each row execute function public.employees_after_insert();

-- link a confirmed sign-in to its staff record by email
create function public.handle_auth_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.employees set auth_user_id = new.id
   where lower(email) = lower(new.email) and auth_user_id is null;
  return new;
end $$;
create trigger on_auth_user_confirmed after insert or update of email_confirmed_at on auth.users
  for each row when (new.email_confirmed_at is not null) execute function public.handle_auth_user();

-- ===== leave: evaluation (validation + flags) =====
create function public._evaluate_leave(p_emp uuid, p_type uuid, p_start date, p_end date, p_part public.day_part, p_mc text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t public.leave_types%rowtype; e public.employees%rowtype;
  errs text[] := '{}'; flgs text[] := '{}';
  v_days numeric; v_avail numeric; v_year int; v_overlap text; v_group numeric; v_ex numeric;
  v_clashes jsonb; v_approver uuid; v_approver_name text; v_today date := public.sg_today();
begin
  select * into e from public.employees where id = p_emp;
  select * into t from public.leave_types where id = p_type and is_active;
  if not found then return jsonb_build_object('errors', jsonb_build_array('Choose a valid leave type.')); end if;
  if p_start is null or p_end is null then return jsonb_build_object('errors', jsonb_build_array('Choose a start and end date.')); end if;
  if p_end < p_start then return jsonb_build_object('errors', jsonb_build_array('The end date cannot be before the start date.')); end if;
  if extract(year from p_start) <> extract(year from p_end) then
    return jsonb_build_object('errors', jsonb_build_array('A request cannot span two calendar years. Submit one request per year.'));
  end if;
  if p_part <> 'full' and p_start <> p_end then
    return jsonb_build_object('errors', jsonb_build_array('Half-day leave must be for a single day.'));
  end if;
  v_year := extract(year from p_start)::int;
  v_days := case when p_part = 'full' then public.working_days(p_start, p_end) else public.working_days(p_start, p_start) * 0.5 end;
  if v_days = 0 then
    return jsonb_build_object('errors', jsonb_build_array('The selected dates fall only on weekends or public holidays, so there is no working day to take as leave.'));
  end if;

  select ref into v_overlap from public.leave_requests
   where employee_id = p_emp and status in ('pending','approved')
     and daterange(start_date, end_date, '[]') && daterange(p_start, p_end, '[]') limit 1;
  if v_overlap is not null then errs := errs || format('These dates overlap your existing request %s.', v_overlap); end if;

  if t.requires_certificate and nullif(btrim(coalesce(p_mc, '')), '') is null then
    errs := errs || format('A medical certificate (MC) number is required for %s.', t.name);
  end if;

  v_avail := public._leave_balance(p_emp, p_type, v_year) - public._leave_pending(p_emp, p_type, v_year);
  if t.over_limit_action = 'block' and v_days > v_avail then
    errs := errs || format('Insufficient %s balance: %s day(s) available, %s requested.', t.name, v_avail, v_days);
  elsif t.over_limit_action = 'flag' and v_days > v_avail then
    flgs := flgs || format('Over %s entitlement by %s day(s)', t.name, v_days - v_avail);
  end if;

  if t.must_exhaust_type_id is not null then
    v_ex := public._leave_balance(p_emp, t.must_exhaust_type_id, v_year) - public._leave_pending(p_emp, t.must_exhaust_type_id, v_year);
    if v_ex > 0 then
      errs := errs || format('Use your remaining %s day(s) of %s before applying for %s.', v_ex,
        (select name from public.leave_types where id = t.must_exhaust_type_id), t.name);
    end if;
  end if;

  if t.cap_group is not null and t.cap_group_limit is not null then
    select coalesce((select sum(l.days) from public.leave_ledger l join public.leave_types lt on lt.id = l.leave_type_id
                      where l.employee_id = p_emp and l.year = v_year and lt.cap_group = t.cap_group), 0)
         + coalesce((select sum(r.days) from public.leave_requests r join public.leave_types lt on lt.id = r.leave_type_id
                      where r.employee_id = p_emp and r.year = v_year and r.status = 'pending' and lt.cap_group = t.cap_group), 0)
      into v_group;
    if v_group + v_days > t.cap_group_limit then
      flgs := flgs || format('Exceeds the combined %s cap of %s days', t.cap_group, t.cap_group_limit);
    end if;
  end if;

  if p_start < v_today then flgs := flgs || 'Retrospective request (start date has passed)';
  elsif t.min_notice_days > 0 and p_start - v_today < t.min_notice_days then
    flgs := flgs || format('Short notice (less than %s days)', t.min_notice_days);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', x.full_name, 'start', r.start_date, 'end', r.end_date, 'status', r.status, 'ref', r.ref)), '[]'::jsonb)
    into v_clashes
    from public.leave_requests r join public.employees x on x.id = r.employee_id
   where x.department_id is not distinct from e.department_id and e.department_id is not null and x.id <> p_emp
     and r.status in ('pending','approved')
     and daterange(r.start_date, r.end_date, '[]') && daterange(p_start, p_end, '[]');
  if jsonb_array_length(v_clashes) > 0 then flgs := flgs || 'Team clash'; end if;

  v_approver := public._resolve_approver(p_emp);
  select full_name into v_approver_name from public.employees where id = v_approver;

  return jsonb_build_object('errors', to_jsonb(errs), 'flags', to_jsonb(flgs), 'days', v_days,
    'balance', v_avail, 'balance_after', v_avail - v_days, 'clashes', v_clashes,
    'approver_id', v_approver, 'approver_name', v_approver_name, 'leave_type', t.name, 'year', v_year);
end $$;

create function public.leave_preview(p_type uuid, p_start date, p_end date, p_part public.day_part default 'full', p_mc text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.current_employee_id();
begin
  if me is null then return jsonb_build_object('errors', jsonb_build_array('Your login is not linked to a staff record. Ask HR to link your email.')); end if;
  return public._evaluate_leave(me, p_type, p_start, p_end, p_part, p_mc);
end $$;

create function public.submit_leave_request(p_type uuid, p_start date, p_end date, p_part public.day_part default 'full', p_reason text default null, p_mc text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := public.current_employee_id(); ev jsonb; rid uuid; rref text; v_name text;
begin
  if me is null then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Your login is not linked to a staff record. Ask HR to link your email.')); end if;
  perform pg_advisory_xact_lock(hashtext('leave:' || me::text));
  ev := public._evaluate_leave(me, p_type, p_start, p_end, p_part, p_mc);
  if jsonb_array_length(ev->'errors') > 0 then return jsonb_build_object('ok', false, 'errors', ev->'errors'); end if;
  if (ev->>'approver_id') is null then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('No approver is configured for you. Ask HR to set your manager.'));
  end if;
  insert into public.leave_requests(employee_id, leave_type_id, start_date, end_date, day_part, days, reason, mc_number,
                                    approver_id, flags, clashes, balance_before, balance_after)
  values (me, p_type, p_start, p_end, p_part, (ev->>'days')::numeric, nullif(btrim(p_reason), ''), nullif(btrim(p_mc), ''),
          (ev->>'approver_id')::uuid, array(select jsonb_array_elements_text(ev->'flags')), ev->'clashes',
          (ev->>'balance')::numeric, (ev->>'balance_after')::numeric)
  returning id, ref into rid, rref;
  select full_name into v_name from public.employees where id = me;
  perform public._log_event('leave', rid, rref, 'submitted', me, null, 'pending', null, jsonb_build_object('days', ev->'days', 'flags', ev->'flags'));
  perform public._notify((ev->>'approver_id')::uuid, format('Leave approval needed: %s', v_name),
    format('%s requested %s day(s) of %s (%s to %s).', v_name, ev->>'days', ev->>'leave_type', p_start, p_end), '/approvals', 'leave', rid);
  return jsonb_build_object('ok', true, 'id', rid, 'ref', rref, 'flags', ev->'flags');
end $$;

create function public.decide_leave_request(p_id uuid, p_approve boolean, p_remark text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := public.current_employee_id(); r public.leave_requests%rowtype; t public.leave_types%rowtype; v_bal numeric; v_word text;
begin
  if me is null then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Your login is not linked to a staff record.')); end if;
  select * into r from public.leave_requests where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Request not found.')); end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'errors', jsonb_build_array(format('This request is already %s.', r.status))); end if;
  if r.employee_id = me then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('You cannot decide your own request.')); end if;
  if not (me = r.approver_id or me = r.escalated_to or public.has_role('director','admin')) then
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

create function public.cancel_leave_request(p_id uuid, p_remark text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := public.current_employee_id(); r public.leave_requests%rowtype; was text;
begin
  if me is null then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Your login is not linked to a staff record.')); end if;
  select * into r from public.leave_requests where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Request not found.')); end if;
  if r.employee_id <> me and not public.has_role('hr','admin') then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Only the applicant or HR can cancel a request.'));
  end if;
  if r.status = 'pending' then
    null;
  elsif r.status = 'approved' and r.end_date >= public.sg_today() then
    insert into public.leave_ledger(employee_id, leave_type_id, year, entry_type, days, request_id, note, created_by)
    values (r.employee_id, r.leave_type_id, r.year, 'reversal', -r.days, r.id, 'Cancelled ' || r.ref, me);
  else
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array(format('A %s request that has already ended cannot be cancelled.', r.status)));
  end if;
  was := r.status::text;
  update public.leave_requests set status = 'cancelled' where id = p_id;
  perform public._log_event('leave', r.id, r.ref, 'cancelled', me, was, 'cancelled', nullif(btrim(p_remark), ''));
  perform public._notify(r.approver_id, format('Leave cancelled: %s', r.ref), format('%s to %s was cancelled.', r.start_date, r.end_date), '/leave/' || r.id, 'leave', r.id);
  if was = 'approved' then
    perform public._notify_roles(array['office_manager','hr']::public.app_role[], format('Approved leave cancelled: %s', r.ref),
      format('%s to %s was cancelled and the balance restored.', r.start_date, r.end_date), '/leave/' || r.id, 'leave', r.id, array[me]);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ===== claims =====
create function public.submit_claim(p_description text, p_declaration boolean, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_employee_id(); rec record; cat public.claim_categories%rowtype;
  errs text[] := '{}'; flgs text[] := '{}'; seen text[] := '{}'; v_total numeric := 0; v_amt numeric; v_date date; v_cat uuid;
  v_receipt text; v_desc text; v_bad boolean; v_dup text; v_today date := public.sg_today();
  cid uuid; cref text; v_approver uuid; v_name text;
begin
  if me is null then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Your login is not linked to a staff record. Ask HR to link your email.')); end if;
  if nullif(btrim(coalesce(p_description, '')), '') is null then errs := errs || 'Add a title for this claim.'; end if;
  if not coalesce(p_declaration, false) then errs := errs || 'Tick the declaration that the expenses are genuine and business-related.'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    return jsonb_build_object('ok', false, 'errors', to_jsonb(errs || 'Add at least one expense line.'));
  end if;
  for rec in select value, ordinality from jsonb_array_elements(p_lines) with ordinality loop
    v_bad := false;
    begin
      v_amt := (rec.value->>'amount')::numeric; v_date := (rec.value->>'expense_date')::date; v_cat := (rec.value->>'category_id')::uuid;
    exception when others then
      errs := errs || format('Line %s: enter a valid date, amount and category.', rec.ordinality); v_bad := true;
    end;
    if v_bad then continue; end if;
    v_receipt := nullif(btrim(coalesce(rec.value->>'receipt_no', '')), '');
    v_desc := nullif(btrim(coalesce(rec.value->>'description', '')), '');
    select * into cat from public.claim_categories where id = v_cat and is_active;
    if not found then errs := errs || format('Line %s: choose a valid category.', rec.ordinality); continue; end if;
    if v_desc is null then errs := errs || format('Line %s: add a description.', rec.ordinality); end if;
    if v_amt is null or v_amt <= 0 or v_amt > 100000 then errs := errs || format('Line %s: amount must be greater than 0.', rec.ordinality); continue; end if;
    if v_date > v_today then errs := errs || format('Line %s: the expense date is in the future.', rec.ordinality); end if;
    if cat.requires_receipt and v_receipt is null then errs := errs || format('Line %s: a receipt number is required for %s.', rec.ordinality, cat.name); end if;
    if v_receipt is not null then
      if lower(v_receipt) = any(seen) then errs := errs || format('Line %s: receipt no. %s is used twice in this claim.', rec.ordinality, v_receipt); end if;
      seen := seen || lower(v_receipt);
      select c.ref into v_dup from public.claim_lines l join public.claims c on c.id = l.claim_id
       where lower(l.receipt_no) = lower(v_receipt) and c.status not in ('rejected','cancelled','returned') limit 1;
      if v_dup is not null then errs := errs || format('Line %s: receipt no. %s was already claimed in %s.', rec.ordinality, v_receipt, v_dup); end if;
    end if;
    if cat.per_line_limit is not null and v_amt > cat.per_line_limit then
      flgs := flgs || format('Line %s exceeds the %s limit of %s', rec.ordinality, cat.name, cat.per_line_limit);
    end if;
    if v_date < v_today - 90 then flgs := flgs || format('Line %s is older than 90 days', rec.ordinality); end if;
    v_total := v_total + v_amt;
  end loop;
  if array_length(errs, 1) > 0 then return jsonb_build_object('ok', false, 'errors', to_jsonb(errs)); end if;

  v_approver := public._resolve_approver(me);
  if v_approver is null then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('No approver is configured for you. Ask HR to set your manager.')); end if;
  insert into public.claims(employee_id, description, total_amount, declaration_accepted, approver_id, flags)
  values (me, btrim(p_description), v_total, true, v_approver, flgs) returning id, ref into cid, cref;
  insert into public.claim_lines(claim_id, line_no, expense_date, category_id, description, receipt_no, amount)
  select cid, ordinality, (value->>'expense_date')::date, (value->>'category_id')::uuid, btrim(value->>'description'),
         nullif(btrim(coalesce(value->>'receipt_no', '')), ''), (value->>'amount')::numeric
    from jsonb_array_elements(p_lines) with ordinality;
  select full_name into v_name from public.employees where id = me;
  perform public._log_event('claim', cid, cref, 'submitted', me, null, 'pending', null, jsonb_build_object('total', v_total, 'flags', to_jsonb(flgs)));
  perform public._notify(v_approver, format('Claim approval needed: %s', v_name), format('%s submitted %s for SGD %s.', v_name, btrim(p_description), v_total), '/approvals', 'claim', cid);
  return jsonb_build_object('ok', true, 'id', cid, 'ref', cref, 'flags', to_jsonb(flgs));
end $$;

create function public.decide_claim(p_id uuid, p_approve boolean, p_remark text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := public.current_employee_id(); c public.claims%rowtype; v_status public.claim_status;
begin
  if me is null then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Your login is not linked to a staff record.')); end if;
  select * into c from public.claims where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Claim not found.')); end if;
  if c.status <> 'pending' then return jsonb_build_object('ok', false, 'errors', jsonb_build_array(format('This claim is already %s.', c.status))); end if;
  if c.employee_id = me then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('You cannot decide your own claim.')); end if;
  if not (me = c.approver_id or me = c.escalated_to or public.has_role('director','admin')) then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('You are not the approver for this claim.'));
  end if;
  if not p_approve and nullif(btrim(coalesce(p_remark, '')), '') is null then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('A remark is required when rejecting a claim.'));
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

create function public.finance_pay_claim(p_id uuid, p_paid_on date, p_reference text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := public.current_employee_id(); c public.claims%rowtype;
begin
  if not public.has_role('finance','admin') then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Only Finance can record payments.')); end if;
  select * into c from public.claims where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Claim not found.')); end if;
  if c.status <> 'submitted_to_finance' then return jsonb_build_object('ok', false, 'errors', jsonb_build_array(format('Only claims submitted to Finance can be paid (this one is %s).', c.status))); end if;
  if c.employee_id = me then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('You cannot pay your own claim.')); end if;
  if p_paid_on is null then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Enter the payment date.')); end if;
  if nullif(btrim(coalesce(p_reference, '')), '') is null then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Enter a payment reference (for example PAYROLL-2026-11).')); end if;
  update public.claims set status = 'paid', paid_on = p_paid_on, payment_reference = btrim(p_reference), paid_by = me where id = p_id;
  perform public._log_event('claim', c.id, c.ref, 'paid', me, 'submitted_to_finance', 'paid', null, jsonb_build_object('paid_on', p_paid_on, 'reference', btrim(p_reference)));
  perform public._notify(c.employee_id, format('Claim paid: %s', c.ref), format('SGD %s paid on %s (ref %s).', c.total_amount, p_paid_on, btrim(p_reference)), '/claims/' || c.id, 'claim', c.id);
  return jsonb_build_object('ok', true);
end $$;

create function public.finance_return_claim(p_id uuid, p_remark text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := public.current_employee_id(); c public.claims%rowtype;
begin
  if not public.has_role('finance','admin') then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Only Finance can return claims.')); end if;
  select * into c from public.claims where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Claim not found.')); end if;
  if c.status <> 'submitted_to_finance' then return jsonb_build_object('ok', false, 'errors', jsonb_build_array(format('Only claims submitted to Finance can be returned (this one is %s).', c.status))); end if;
  if nullif(btrim(coalesce(p_remark, '')), '') is null then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Say why the claim is being returned.')); end if;
  update public.claims set status = 'returned', finance_remark = btrim(p_remark) where id = p_id;
  perform public._log_event('claim', c.id, c.ref, 'returned', me, 'submitted_to_finance', 'returned', btrim(p_remark));
  perform public._notify(c.employee_id, format('Claim returned: %s', c.ref), 'Finance returned your claim: ' || btrim(p_remark), '/claims/' || c.id, 'claim', c.id);
  return jsonb_build_object('ok', true);
end $$;

create function public.cancel_claim(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := public.current_employee_id(); c public.claims%rowtype;
begin
  select * into c from public.claims where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Claim not found.')); end if;
  if c.employee_id <> me then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Only the claimant can cancel a claim.')); end if;
  if c.status <> 'pending' then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Only claims awaiting approval can be cancelled.')); end if;
  update public.claims set status = 'cancelled' where id = p_id;
  perform public._log_event('claim', c.id, c.ref, 'cancelled', me, 'pending', 'cancelled', null);
  perform public._notify(c.approver_id, format('Claim cancelled: %s', c.ref), c.description, '/claims/' || c.id, 'claim', c.id);
  return jsonb_build_object('ok', true);
end $$;

-- ===== reminders: after 1 working day remind, after 2 escalate =====
create function public.process_approval_reminders() returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_today date := public.sg_today(); elapsed numeric; v_next uuid; n_rem int := 0; n_esc int := 0;
begin
  for r in
    select 'leave'::text as kind, id, ref, employee_id, approver_id, submitted_at, last_reminder_at, escalated_at from public.leave_requests where status = 'pending'
    union all
    select 'claim'::text, id, ref, employee_id, approver_id, submitted_at, last_reminder_at, escalated_at from public.claims where status = 'pending'
  loop
    elapsed := public.working_days((r.submitted_at at time zone 'Asia/Singapore')::date + 1, v_today);
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

-- ===== reporting =====
create function public.monthly_leave_report(p_year int, p_month int)
returns table(employee_id uuid, full_name text, department text, total_days numeric, sick_days numeric, sick_requests bigint, mon_fri_requests bigint, flagged boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role('hr','admin','director','office_manager') then raise exception 'Not allowed'; end if;
  return query
  select e.id, e.full_name, d.name,
         coalesce(sum(r.days), 0),
         coalesce(sum(r.days) filter (where t.code in ('SL','HL')), 0),
         count(r.id) filter (where t.code in ('SL','HL')),
         count(r.id) filter (where extract(isodow from r.start_date) = 1 or extract(isodow from r.end_date) = 5),
         (count(r.id) filter (where t.code in ('SL','HL')) >= 3 or count(r.id) filter (where extract(isodow from r.start_date) = 1 or extract(isodow from r.end_date) = 5) >= 3)
    from public.employees e
    left join public.departments d on d.id = e.department_id
    left join public.leave_requests r on r.employee_id = e.id and r.status = 'approved'
         and r.start_date >= make_date(p_year, p_month, 1) and r.start_date < (make_date(p_year, p_month, 1) + interval '1 month')::date
    left join public.leave_types t on t.id = r.leave_type_id
   where e.is_active
   group by e.id, e.full_name, d.name
   order by e.full_name;
end $$;

create function public.team_calendar(p_from date, p_to date)
returns table(request_id uuid, employee_id uuid, full_name text, department text, leave_type text, start_date date, end_date date, days numeric, status public.leave_status, is_mine boolean)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.current_employee_id(); priv boolean := public.has_role('hr','admin','director','office_manager');
begin
  if me is null then return; end if;
  return query
  select r.id, r.employee_id, e.full_name, d.name,
         case when priv or r.employee_id = me or r.approver_id = me then t.name else 'Leave' end,
         r.start_date, r.end_date, r.days, r.status, r.employee_id = me
    from public.leave_requests r
    join public.employees e on e.id = r.employee_id
    left join public.departments d on d.id = e.department_id
    join public.leave_types t on t.id = r.leave_type_id
   where r.status in ('pending','approved') and r.start_date <= p_to and r.end_date >= p_from
   order by r.start_date, e.full_name;
end $$;

-- ===== function privileges: signed-in users only; internal helpers not callable from the API =====
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.sg_today(), public.current_employee_id(), public.has_role(public.app_role[]),
  public.working_days(date, date), public.leave_preview(uuid, date, date, public.day_part, text),
  public.submit_leave_request(uuid, date, date, public.day_part, text, text),
  public.decide_leave_request(uuid, boolean, text), public.cancel_leave_request(uuid, text),
  public.submit_claim(text, boolean, jsonb), public.decide_claim(uuid, boolean, text),
  public.finance_pay_claim(uuid, date, text), public.finance_return_claim(uuid, text), public.cancel_claim(uuid),
  public.ensure_entitlements(int), public.monthly_leave_report(int, int), public.team_calendar(date, date)
  to authenticated;
