-- Workday Clone: performance appraisal rebuilt around the SRA Performance Appraisal Form (Mid-Year in May, Year-End in November).
-- Flow: employee self-appraisal -> supervisor assessment -> Executive Director assessment -> discussion recorded -> everyone signs off.
-- Rating scale: 3 Exceeds, 2 Meets, 1 Needs Improvement. Supervisor and ED ratings stay hidden from the employee until the discussion stage.
-- Past appraisals done on paper are kept as a closed "historical" cycle with the signed form attached and the final rating.

alter table public.review_cycles
  add column kind text not null default 'year_end' check (kind in ('mid_year', 'year_end')),
  add column is_historical boolean not null default false;

alter table public.reviews
  drop column self_rating, drop column self_comments, drop column manager_rating,
  drop column manager_comments, drop column manager_submitted_at;
alter table public.reviews drop constraint reviews_status_check;
alter table public.reviews
  add column ed_id uuid references public.employees(id),
  add column kpis jsonb not null default '[]',
  add column self_competencies jsonb not null default '{}',
  add column dev_needs jsonb not null default '[]',
  add column aspirations text,
  add column supervisor_submitted_at timestamptz,
  add column ed_submitted_at timestamptz,
  add column discussion_date date,
  add column discussion_notes text,
  add column next_objectives jsonb not null default '[]',
  add column ack_employee_at timestamptz,
  add column ack_supervisor_at timestamptz,
  add column ack_ed_at timestamptz,
  add column final_rating int check (final_rating between 1 and 3),
  add column signed_file_path text;
alter table public.reviews add constraint reviews_status_check
  check (status in ('pending_self', 'pending_supervisor', 'pending_ed', 'pending_discussion', 'completed'));

-- Supervisor and ED assessments live apart so the employee cannot read them before the discussion.
create table public.review_assessments (
  review_id uuid primary key references public.reviews(id) on delete cascade,
  sup_competencies jsonb not null default '{}',
  sup_rating int check (sup_rating between 1 and 3),
  sup_comments text,
  ed_rating int check (ed_rating between 1 and 3),
  ed_comments text
);
alter table public.review_assessments enable row level security;
revoke all on public.review_assessments from anon, authenticated;
grant select on public.review_assessments to authenticated;

drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select to authenticated
  using (employee_id = (select public.current_employee_id())
         or reviewer_id = (select public.current_employee_id())
         or ed_id = (select public.current_employee_id())
         or (select public.has_role('hr', 'director')));

create policy assessments_read on public.review_assessments for select to authenticated
  using (exists (
    select 1 from public.reviews r
     where r.id = review_assessments.review_id
       and ((r.employee_id is distinct from (select public.current_employee_id())
             and (r.reviewer_id = (select public.current_employee_id())
                  or r.ed_id = (select public.current_employee_id())
                  or (select public.has_role('hr', 'director'))))
            or (r.employee_id = (select public.current_employee_id()) and r.status in ('pending_discussion', 'completed')))));

create or replace function public._executive_director() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.employees where is_active and role = 'director' and manager_id is null order by created_at limit 1
$$;

create or replace function public._competencies_ok(p jsonb) returns boolean
language sql immutable as $$
  select coalesce(jsonb_typeof(p) = 'object'
         and p ?& array['quality', 'communication', 'teamwork', 'initiative', 'adaptability']
         and not exists (select 1 from jsonb_each_text(p) e where e.value not in ('1', '2', '3')), false)
$$;

-- one review per active person; the ED step is skipped when the supervisor or the employee is the ED
create or replace function public.launch_review_cycle(p_cycle uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_c public.review_cycles; n int; v_ed uuid := public._executive_director();
begin
  if not public.has_role('hr') then return public._hr_err('Only HR can launch a review cycle.'); end if;
  select * into v_c from public.review_cycles where id = p_cycle;
  if not found then return public._hr_err('Cycle not found.'); end if;
  if v_c.status <> 'draft' or v_c.is_historical then return public._hr_err('Only a draft cycle can be launched.'); end if;

  insert into public.reviews(cycle_id, employee_id, reviewer_id, ed_id)
  select p_cycle, e.id, public._resolve_approver(e.id),
         case when e.id = v_ed or public._resolve_approver(e.id) is not distinct from v_ed then null else v_ed end
    from public.employees e where e.is_active and e.join_date <= v_c.period_end;
  get diagnostics n = row_count;
  if n = 0 then return public._hr_err('No active staff joined before the end of this period.'); end if;

  update public.review_cycles set status = 'open' where id = p_cycle;
  perform public._notify(r.employee_id, 'Appraisal open: ' || v_c.name,
                         'Please complete your self-appraisal' || coalesce(' by ' || to_char(v_c.self_due, 'DD Mon YYYY'), '') || '.',
                         '/performance/' || r.id, 'review', r.id)
     from public.reviews r where r.cycle_id = p_cycle;
  return jsonb_build_object('ok', true, 'reviews', n);
end $$;

drop function if exists public.submit_self_review(uuid, int, text);
drop function if exists public.submit_manager_review(uuid, int, text);

-- Sections 1-4: the employee's self-appraisal
create function public.save_self_appraisal(p_id uuid, p_kpis jsonb, p_comp jsonb, p_dev jsonb, p_aspirations text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_r public.reviews; v_c public.review_cycles; v_me uuid := public.current_employee_id();
begin
  select * into v_r from public.reviews where id = p_id;
  if not found or v_r.employee_id is distinct from v_me then return public._hr_err('You can only complete your own appraisal.'); end if;
  select * into v_c from public.review_cycles where id = v_r.cycle_id;
  if v_c.status <> 'open' then return public._hr_err('This appraisal cycle is not open.'); end if;
  if v_r.status <> 'pending_self' then return public._hr_err('You have already submitted your self-appraisal.'); end if;
  if jsonb_typeof(p_kpis) is distinct from 'array' or jsonb_array_length(p_kpis) = 0
     or exists (select 1 from jsonb_array_elements(p_kpis) k
                 where nullif(btrim(k->>'objective'), '') is null or nullif(btrim(k->>'status'), '') is null) then
    return public._hr_err('Fill in at least one work objective with its progress status.');
  end if;
  if not public._competencies_ok(p_comp) then return public._hr_err('Rate yourself on all five core competencies.'); end if;

  update public.reviews
     set kpis = p_kpis, self_competencies = p_comp,
         dev_needs = case when jsonb_typeof(p_dev) = 'array' then p_dev else '[]'::jsonb end,
         aspirations = nullif(btrim(coalesce(p_aspirations, '')), ''),
         self_submitted_at = now(), status = 'pending_supervisor'
   where id = p_id;
  perform public._notify(v_r.reviewer_id, 'Appraisal ready: ' || (select full_name from public.employees where id = v_r.employee_id),
                         'Their self-appraisal is in. Please add your assessment' || coalesce(' by ' || to_char(v_c.manager_due, 'DD Mon YYYY'), '') || '.',
                         '/performance/' || p_id, 'review', p_id);
  return jsonb_build_object('ok', true);
end $$;

-- Section 2 (supervisor ratings) and Section 5 (supervisor overall assessment)
create function public.submit_supervisor_assessment(p_id uuid, p_comp jsonb, p_rating int, p_comments text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_r public.reviews; v_c public.review_cycles; v_me uuid := public.current_employee_id(); v_next text;
begin
  select * into v_r from public.reviews where id = p_id;
  if not found then return public._hr_err('Appraisal not found.'); end if;
  if v_r.employee_id = v_me then return public._hr_err('You cannot assess your own appraisal.'); end if;
  if not coalesce(v_r.reviewer_id = v_me or public.has_role('hr'), false) then return public._hr_err('You are not the supervisor for this person.'); end if;
  select * into v_c from public.review_cycles where id = v_r.cycle_id;
  if v_c.status <> 'open' then return public._hr_err('This appraisal cycle is not open.'); end if;
  if v_r.status = 'pending_self' then return public._hr_err('Wait for the employee to submit their self-appraisal first.'); end if;
  if v_r.status <> 'pending_supervisor' then return public._hr_err('The supervisor assessment has already been submitted.'); end if;
  if not public._competencies_ok(p_comp) then return public._hr_err('Rate all five core competencies.'); end if;
  if p_rating is null or p_rating not between 1 and 3 then return public._hr_err('Choose an overall rating.'); end if;
  if nullif(btrim(coalesce(p_comments, '')), '') is null then return public._hr_err('Give your supporting reasons for the overall rating.'); end if;

  insert into public.review_assessments(review_id, sup_competencies, sup_rating, sup_comments)
  values (p_id, p_comp, p_rating, btrim(p_comments))
  on conflict (review_id) do update set sup_competencies = excluded.sup_competencies, sup_rating = excluded.sup_rating, sup_comments = excluded.sup_comments;
  v_next := case when v_r.ed_id is null then 'pending_discussion' else 'pending_ed' end;
  update public.reviews set status = v_next, supervisor_submitted_at = now(), reviewer_id = coalesce(reviewer_id, v_me) where id = p_id;
  if v_next = 'pending_ed' then
    perform public._notify(v_r.ed_id, 'Appraisal needs your assessment: ' || (select full_name from public.employees where id = v_r.employee_id),
                           'The supervisor has submitted their assessment.', '/performance/' || p_id, 'review', p_id);
  end if;
  return jsonb_build_object('ok', true, 'next', v_next);
end $$;

-- Section 5: the Executive Director's overall assessment
create function public.submit_ed_assessment(p_id uuid, p_rating int, p_comments text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_r public.reviews; v_c public.review_cycles; v_me uuid := public.current_employee_id();
begin
  select * into v_r from public.reviews where id = p_id;
  if not found then return public._hr_err('Appraisal not found.'); end if;
  if v_r.ed_id is distinct from v_me then return public._hr_err('Only the Executive Director can add this assessment.'); end if;
  select * into v_c from public.review_cycles where id = v_r.cycle_id;
  if v_c.status <> 'open' then return public._hr_err('This appraisal cycle is not open.'); end if;
  if v_r.status <> 'pending_ed' then return public._hr_err('This appraisal is not waiting for the Executive Director.'); end if;
  if p_rating is null or p_rating not between 1 and 3 then return public._hr_err('Choose an overall rating.'); end if;
  if nullif(btrim(coalesce(p_comments, '')), '') is null then return public._hr_err('Give your supporting reasons for the overall rating.'); end if;

  update public.review_assessments set ed_rating = p_rating, ed_comments = btrim(p_comments) where review_id = p_id;
  update public.reviews set status = 'pending_discussion', ed_submitted_at = now() where id = p_id;
  perform public._notify(v_r.reviewer_id, 'Ready for the appraisal discussion: ' || (select full_name from public.employees where id = v_r.employee_id),
                         'Both assessments are in. Hold the discussion, then record it.', '/performance/' || p_id, 'review', p_id);
  return jsonb_build_object('ok', true);
end $$;

-- Section 6: the discussion and next-period objectives
create function public.record_discussion(p_id uuid, p_date date, p_notes text, p_next jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_r public.reviews; v_me uuid := public.current_employee_id();
begin
  select * into v_r from public.reviews where id = p_id;
  if not found then return public._hr_err('Appraisal not found.'); end if;
  if v_r.employee_id = v_me then return public._hr_err('You cannot record the discussion for your own appraisal.'); end if;
  if not coalesce(v_r.reviewer_id = v_me or public.has_role('hr'), false) then return public._hr_err('Only the supervisor can record the discussion.'); end if;
  if v_r.status <> 'pending_discussion' then return public._hr_err('The assessments must be complete before the discussion is recorded.'); end if;
  if v_r.ack_employee_at is not null or v_r.ack_supervisor_at is not null or v_r.ack_ed_at is not null then
    return public._hr_err('Someone has already signed off, so the discussion can no longer be changed.');
  end if;
  if p_date is null then return public._hr_err('Enter the date of the appraisal discussion.'); end if;
  if jsonb_typeof(p_next) is distinct from 'array' or jsonb_array_length(p_next) = 0
     or exists (select 1 from jsonb_array_elements(p_next) k where nullif(btrim(k->>'objective'), '') is null) then
    return public._hr_err('Add at least one objective for the next appraisal period.');
  end if;

  update public.reviews set discussion_date = p_date, discussion_notes = nullif(btrim(coalesce(p_notes, '')), ''), next_objectives = p_next where id = p_id;
  perform public._notify(r.n, 'Please sign off your appraisal', 'The discussion has been recorded. Review it and acknowledge.', '/performance/' || p_id, 'review', p_id)
     from (select v_r.employee_id as n union select v_r.ed_id where v_r.ed_id is not null) r;
  return jsonb_build_object('ok', true);
end $$;

-- Section 7: acknowledgement by the employee, the supervisor and (when involved) the Executive Director
create function public.acknowledge_review(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_r public.reviews; v_me uuid := public.current_employee_id(); v_a public.review_assessments;
begin
  select * into v_r from public.reviews where id = p_id for update;
  if not found then return public._hr_err('Appraisal not found.'); end if;
  if v_r.status <> 'pending_discussion' or v_r.discussion_date is null then
    return public._hr_err('The discussion has to be recorded before anyone signs off.');
  end if;
  if v_me = v_r.employee_id then update public.reviews set ack_employee_at = coalesce(ack_employee_at, now()) where id = p_id;
  elsif v_me is not null and v_me = v_r.ed_id then update public.reviews set ack_ed_at = coalesce(ack_ed_at, now()) where id = p_id;
  elsif coalesce(v_me = v_r.reviewer_id or public.has_role('hr'), false) then update public.reviews set ack_supervisor_at = coalesce(ack_supervisor_at, now()) where id = p_id;
  else return public._hr_err('You are not part of this appraisal.');
  end if;

  select * into v_r from public.reviews where id = p_id;
  if v_r.ack_employee_at is not null and v_r.ack_supervisor_at is not null and (v_r.ed_id is null or v_r.ack_ed_at is not null) then
    select * into v_a from public.review_assessments where review_id = p_id;
    update public.reviews set status = 'completed', final_rating = coalesce(v_a.ed_rating, v_a.sup_rating) where id = p_id;
    perform public._notify(v_r.employee_id, 'Your appraisal is complete', 'Everyone has signed off.', '/performance/' || p_id, 'review', p_id);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Past appraisals done on paper: a closed cycle with one empty record per person, ready for the signed form and final rating
create function public.create_historical_cycle(p_name text, p_kind text, p_start date, p_end date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; n int;
begin
  if not public.has_role('hr') then return public._hr_err('Only HR can add past appraisals.'); end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null or p_start is null or p_end is null or p_end < p_start then
    return public._hr_err('Enter a name and a valid period.');
  end if;
  if p_kind not in ('mid_year', 'year_end') then return public._hr_err('Choose Mid-Year or Year-End.'); end if;
  if exists (select 1 from public.review_cycles where name = btrim(p_name)) then return public._hr_err('A cycle with that name already exists.'); end if;
  insert into public.review_cycles(name, kind, period_start, period_end, status, is_historical)
  values (btrim(p_name), p_kind, p_start, p_end, 'closed', true) returning id into v_id;
  insert into public.reviews(cycle_id, employee_id, reviewer_id, status)
  select v_id, e.id, public._resolve_approver(e.id), 'completed'
    from public.employees e where e.is_active and e.join_date <= p_end;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'id', v_id, 'reviews', n);
end $$;

create function public.set_historical_result(p_id uuid, p_final int, p_file text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_hist boolean;
begin
  if not public.has_role('hr') then return public._hr_err('Only HR can do this.'); end if;
  select c.is_historical into v_hist from public.reviews r join public.review_cycles c on c.id = r.cycle_id where r.id = p_id;
  if not coalesce(v_hist, false) then return public._hr_err('This is not a past appraisal.'); end if;
  if p_final is not null and p_final not between 1 and 3 then return public._hr_err('Choose a rating from 1 to 3.'); end if;
  if p_file is not null and p_file not like p_id::text || '/%' then return public._hr_err('Upload the file again.'); end if;
  update public.reviews set final_rating = p_final, signed_file_path = coalesce(p_file, signed_file_path) where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.save_self_appraisal(uuid, jsonb, jsonb, jsonb, text), public.submit_supervisor_assessment(uuid, jsonb, int, text),
  public.submit_ed_assessment(uuid, int, text), public.record_discussion(uuid, date, text, jsonb), public.acknowledge_review(uuid),
  public.create_historical_cycle(text, text, date, date), public.set_historical_result(uuid, int, text) from public, anon;
grant execute on function public.save_self_appraisal(uuid, jsonb, jsonb, jsonb, text), public.submit_supervisor_assessment(uuid, jsonb, int, text),
  public.submit_ed_assessment(uuid, int, text), public.record_discussion(uuid, date, text, jsonb), public.acknowledge_review(uuid),
  public.create_historical_cycle(text, text, date, date), public.set_historical_result(uuid, int, text) to authenticated;

-- Signed forms from past appraisals: private bucket, folder per appraisal record. HR uploads; the employee, their supervisor, HR and the Director read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('appraisal-forms', 'appraisal-forms', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists appraisal_upload on storage.objects;
create policy appraisal_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'appraisal-forms' and public.has_role('hr'));
drop policy if exists appraisal_read on storage.objects;
create policy appraisal_read on storage.objects for select to authenticated
  using (bucket_id = 'appraisal-forms' and (
    public.has_role('hr', 'director')
    or exists (select 1 from public.reviews r
                where r.signed_file_path = storage.objects.name
                  and public.current_employee_id() in (r.employee_id, r.reviewer_id))));
