-- Workday Clone: onboarding/offboarding checklists, performance reviews and goals, recruiting pipeline.
-- Same pattern as leave and claims: row-level security for reads, SECURITY DEFINER functions for guarded writes.

create function public._hr_err(p_msg text) returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object('ok', false, 'errors', jsonb_build_array(p_msg)) $$;

-- =====================================================================
-- ONBOARDING / OFFBOARDING
-- =====================================================================
create type public.checklist_kind as enum ('onboarding', 'offboarding');

create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  kind public.checklist_kind not null,
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  sort_order int not null default 0,
  title text not null check (length(btrim(title)) > 0),
  owner_role text not null check (owner_role in ('employee', 'manager', 'hr', 'finance', 'office_manager')),
  due_offset_days int not null default 0
);
create index on public.checklist_template_items(template_id, sort_order);

create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  kind public.checklist_kind not null,
  template_id uuid references public.checklist_templates(id) on delete set null,
  anchor_date date not null,
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);
create index on public.checklists(employee_id);
create unique index one_open_checklist_per_kind on public.checklists(employee_id, kind) where status = 'open';

create table public.checklist_tasks (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  sort_order int not null default 0,
  title text not null,
  owner_role text not null check (owner_role in ('employee', 'manager', 'hr', 'finance', 'office_manager')),
  assignee_id uuid references public.employees(id),
  due_date date not null,
  done_at timestamptz,
  done_by uuid references public.employees(id),
  note text
);
create index on public.checklist_tasks(checklist_id, sort_order);
create index on public.checklist_tasks(assignee_id) where done_at is null;

-- =====================================================================
-- PERFORMANCE
-- =====================================================================
create table public.review_cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  period_start date not null,
  period_end date not null,
  self_due date,
  manager_due date,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.review_cycles(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  reviewer_id uuid references public.employees(id),
  self_rating int check (self_rating between 1 and 5),
  self_comments text,
  self_submitted_at timestamptz,
  manager_rating int check (manager_rating between 1 and 5),
  manager_comments text,
  manager_submitted_at timestamptz,
  status text not null default 'pending_self' check (status in ('pending_self', 'pending_manager', 'completed')),
  created_at timestamptz not null default now(),
  unique (cycle_id, employee_id)
);
create index on public.reviews(employee_id);
create index on public.reviews(reviewer_id);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  title text not null check (length(btrim(title)) > 0),
  description text,
  due_date date,
  progress int not null default 0 check (progress between 0 and 100),
  status text not null default 'active' check (status in ('active', 'achieved', 'dropped')),
  created_at timestamptz not null default now()
);
create index on public.goals(employee_id);

-- =====================================================================
-- RECRUITING
-- =====================================================================
create table public.job_openings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  department_id uuid references public.departments(id),
  hiring_manager_id uuid references public.employees(id),
  headcount int not null default 1 check (headcount > 0),
  status text not null default 'draft' check (status in ('draft', 'open', 'on_hold', 'filled', 'closed')),
  description text,
  opened_on date,
  created_at timestamptz not null default now()
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.job_openings(id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) > 0),
  email text,
  phone text,
  source text,
  stage text not null default 'applied' check (stage in ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn')),
  notes text,
  applied_on date not null default public.sg_today(),
  stage_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on public.candidates(job_id, stage);

create function public.candidates_stage_touch() returns trigger language plpgsql set search_path = public as $$
begin
  if new.stage is distinct from old.stage then new.stage_changed_at := now(); end if;
  return new;
end $$;
create trigger candidates_stage_touch before update on public.candidates
  for each row execute function public.candidates_stage_touch();

-- =====================================================================
-- ROW-LEVEL SECURITY
-- =====================================================================
alter table public.checklist_templates enable row level security;
alter table public.checklist_template_items enable row level security;
alter table public.checklists enable row level security;
alter table public.checklist_tasks enable row level security;
alter table public.review_cycles enable row level security;
alter table public.reviews enable row level security;
alter table public.goals enable row level security;
alter table public.job_openings enable row level security;
alter table public.candidates enable row level security;

-- templates: HR only
create policy templates_hr on public.checklist_templates for all to authenticated
  using ((select public.has_role('hr','admin'))) with check ((select public.has_role('hr','admin')));
create policy template_items_hr on public.checklist_template_items for all to authenticated
  using ((select public.has_role('hr','admin'))) with check ((select public.has_role('hr','admin')));

-- checklists: the person, their manager, and the roles that own tasks
create policy checklists_read on public.checklists for select to authenticated
  using (employee_id = (select public.current_employee_id())
         or exists (select 1 from public.employees e where e.id = employee_id and e.manager_id = (select public.current_employee_id()))
         or (select public.has_role('hr','admin','director','office_manager','finance')));
create policy checklist_tasks_read on public.checklist_tasks for select to authenticated
  using (exists (select 1 from public.checklists c where c.id = checklist_id));

-- review cycles: everyone linked can see names and dates; HR edits
create policy cycles_read on public.review_cycles for select to authenticated
  using ((select public.current_employee_id()) is not null);
create policy cycles_hr_write on public.review_cycles for all to authenticated
  using ((select public.has_role('hr','admin'))) with check ((select public.has_role('hr','admin')));

-- reviews: the person, their reviewer, HR and the director
create policy reviews_read on public.reviews for select to authenticated
  using (employee_id = (select public.current_employee_id())
         or reviewer_id = (select public.current_employee_id())
         or (select public.has_role('hr','admin','director')));

-- goals: the person manages their own; manager, HR and the director can read
create policy goals_read on public.goals for select to authenticated
  using (employee_id = (select public.current_employee_id())
         or exists (select 1 from public.employees e where e.id = employee_id and e.manager_id = (select public.current_employee_id()))
         or (select public.has_role('hr','admin','director')));
create policy goals_write on public.goals for all to authenticated
  using (employee_id = (select public.current_employee_id()) or (select public.has_role('hr','admin')))
  with check (employee_id = (select public.current_employee_id()) or (select public.has_role('hr','admin')));

-- recruiting: candidate details are personal data, so HR, admin, director, and the hiring manager of that opening only
create policy openings_read on public.job_openings for select to authenticated
  using ((select public.has_role('hr','admin','director')) or hiring_manager_id = (select public.current_employee_id()));
create policy openings_hr_write on public.job_openings for all to authenticated
  using ((select public.has_role('hr','admin'))) with check ((select public.has_role('hr','admin')));
create policy candidates_read on public.candidates for select to authenticated
  using ((select public.has_role('hr','admin','director'))
         or exists (select 1 from public.job_openings j where j.id = job_id and j.hiring_manager_id = (select public.current_employee_id())));
create policy candidates_hr_write on public.candidates for all to authenticated
  using ((select public.has_role('hr','admin'))) with check ((select public.has_role('hr','admin')));

-- table privileges: nothing for anon; read-only for signed-in users except where a write policy exists
revoke all on public.checklist_templates, public.checklist_template_items, public.checklists, public.checklist_tasks,
  public.review_cycles, public.reviews, public.goals, public.job_openings, public.candidates from anon;
revoke insert, update, delete, truncate on public.checklist_templates, public.checklist_template_items, public.checklists,
  public.checklist_tasks, public.review_cycles, public.reviews, public.goals, public.job_openings, public.candidates from authenticated;
grant insert, update, delete on public.checklist_templates, public.checklist_template_items, public.goals,
  public.job_openings, public.candidates to authenticated;
-- cycle status only changes through launch_review_cycle / close_review_cycle
grant insert (name, period_start, period_end, self_due, manager_due), update (name, period_start, period_end, self_due, manager_due),
  delete on public.review_cycles to authenticated;

-- =====================================================================
-- FUNCTIONS: onboarding / offboarding
-- =====================================================================
create function public.start_checklist(p_employee uuid, p_template uuid, p_anchor date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t public.checklist_templates; v_emp public.employees; v_id uuid; v_me uuid := public.current_employee_id(); v_role text;
begin
  if not public.has_role('hr','admin') then return public._hr_err('Only HR can start a checklist.'); end if;
  select * into v_t from public.checklist_templates where id = p_template and is_active;
  if not found then return public._hr_err('Choose an active template.'); end if;
  select * into v_emp from public.employees where id = p_employee;
  if not found then return public._hr_err('Choose an employee.'); end if;
  if p_anchor is null then
    return public._hr_err(case v_t.kind when 'onboarding' then 'Enter the start date.' else 'Enter the last working day.' end);
  end if;
  if exists (select 1 from public.checklists where employee_id = p_employee and kind = v_t.kind and status = 'open') then
    return public._hr_err(v_emp.full_name || ' already has an open ' || v_t.kind::text || ' checklist.');
  end if;
  if not exists (select 1 from public.checklist_template_items where template_id = p_template) then
    return public._hr_err('That template has no items yet.');
  end if;

  insert into public.checklists(employee_id, kind, template_id, anchor_date, created_by)
  values (p_employee, v_t.kind, p_template, p_anchor, v_me) returning id into v_id;

  insert into public.checklist_tasks(checklist_id, sort_order, title, owner_role, assignee_id, due_date)
  select v_id, i.sort_order, i.title, i.owner_role,
         case i.owner_role when 'employee' then v_emp.id when 'manager' then v_emp.manager_id else null end,
         p_anchor + i.due_offset_days
    from public.checklist_template_items i where i.template_id = p_template;

  -- tell the people who own tasks
  perform public._notify(a.assignee_id, 'New ' || v_t.kind::text || ' tasks: ' || v_emp.full_name,
                         'Open the checklist to see your tasks.', '/onboarding/' || v_id, 'checklist', v_id)
     from (select distinct assignee_id from public.checklist_tasks where checklist_id = v_id and assignee_id is not null) a;
  foreach v_role in array array['finance', 'office_manager'] loop
    if exists (select 1 from public.checklist_tasks where checklist_id = v_id and owner_role = v_role) then
      perform public._notify_roles(array[v_role]::public.app_role[], 'New ' || v_t.kind::text || ' tasks: ' || v_emp.full_name,
                                   'Open the checklist to see your tasks.', '/onboarding/' || v_id, 'checklist', v_id, array[v_me]);
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create function public.complete_checklist_task(p_id uuid, p_done boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_task public.checklist_tasks; v_list public.checklists; v_me uuid := public.current_employee_id(); v_ok boolean; v_open int;
begin
  if v_me is null then return public._hr_err('Sign in with a linked staff account first.'); end if;
  select * into v_task from public.checklist_tasks where id = p_id;
  if not found then return public._hr_err('Task not found.'); end if;
  select * into v_list from public.checklists where id = v_task.checklist_id;
  if v_list.status = 'cancelled' then return public._hr_err('This checklist was cancelled.'); end if;

  v_ok := coalesce(public.has_role('hr','admin')
       or v_task.assignee_id = v_me
       or (v_task.owner_role = 'finance' and public.has_role('finance'))
       or (v_task.owner_role = 'office_manager' and public.has_role('office_manager')), false);
  if not v_ok then return public._hr_err('This task is not assigned to you.'); end if;

  update public.checklist_tasks
     set done_at = case when p_done then now() else null end,
         done_by = case when p_done then v_me else null end,
         note = coalesce(nullif(btrim(p_note), ''), note)
   where id = p_id;

  select count(*) into v_open from public.checklist_tasks where checklist_id = v_list.id and done_at is null;
  update public.checklists set status = case when v_open = 0 then 'completed' else 'open' end where id = v_list.id;
  if v_open = 0 and v_list.status <> 'completed' then
    perform public._notify_roles(array['hr']::public.app_role[], 'Checklist complete',
      'All tasks on a ' || v_list.kind::text || ' checklist are done.', '/onboarding/' || v_list.id, 'checklist', v_list.id, array[v_me]);
  end if;
  return jsonb_build_object('ok', true);
end $$;

create function public.cancel_checklist(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('hr','admin') then return public._hr_err('Only HR can cancel a checklist.'); end if;
  update public.checklists set status = 'cancelled' where id = p_id and status = 'open';
  if not found then return public._hr_err('Only an open checklist can be cancelled.'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
-- FUNCTIONS: performance
-- =====================================================================
create function public.launch_review_cycle(p_cycle uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_c public.review_cycles; n int;
begin
  if not public.has_role('hr','admin') then return public._hr_err('Only HR can launch a review cycle.'); end if;
  select * into v_c from public.review_cycles where id = p_cycle;
  if not found then return public._hr_err('Cycle not found.'); end if;
  if v_c.status <> 'draft' then return public._hr_err('Only a draft cycle can be launched.'); end if;

  insert into public.reviews(cycle_id, employee_id, reviewer_id)
  select p_cycle, e.id, public._resolve_approver(e.id)
    from public.employees e where e.is_active and e.join_date <= v_c.period_end;
  get diagnostics n = row_count;
  if n = 0 then return public._hr_err('No active staff joined before the end of this period.'); end if;

  update public.review_cycles set status = 'open' where id = p_cycle;
  perform public._notify(r.employee_id, 'Self review open: ' || v_c.name,
                         'Please complete your self review' || coalesce(' by ' || to_char(v_c.self_due, 'DD Mon YYYY'), '') || '.',
                         '/performance/' || r.id, 'review', r.id)
     from public.reviews r where r.cycle_id = p_cycle;
  return jsonb_build_object('ok', true, 'reviews', n);
end $$;

create function public.close_review_cycle(p_cycle uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('hr','admin') then return public._hr_err('Only HR can close a review cycle.'); end if;
  update public.review_cycles set status = 'closed' where id = p_cycle and status = 'open';
  if not found then return public._hr_err('Only an open cycle can be closed.'); end if;
  return jsonb_build_object('ok', true);
end $$;

create function public.submit_self_review(p_id uuid, p_rating int, p_comments text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_r public.reviews; v_c public.review_cycles; v_me uuid := public.current_employee_id();
begin
  select * into v_r from public.reviews where id = p_id;
  if not found or v_r.employee_id is distinct from v_me then return public._hr_err('You can only submit your own review.'); end if;
  select * into v_c from public.review_cycles where id = v_r.cycle_id;
  if v_c.status <> 'open' then return public._hr_err('This review cycle is not open.'); end if;
  if v_r.status <> 'pending_self' then return public._hr_err('You have already submitted your self review.'); end if;
  if p_rating is null or p_rating not between 1 and 5 then return public._hr_err('Choose a rating from 1 to 5.'); end if;
  if p_comments is null or length(btrim(p_comments)) = 0 then return public._hr_err('Add a few comments on your year.'); end if;

  update public.reviews
     set self_rating = p_rating, self_comments = btrim(p_comments), self_submitted_at = now(), status = 'pending_manager'
   where id = p_id;
  perform public._notify(v_r.reviewer_id, 'Review ready: ' || (select full_name from public.employees where id = v_r.employee_id),
                         'Their self review is in. Please add your assessment' || coalesce(' by ' || to_char(v_c.manager_due, 'DD Mon YYYY'), '') || '.',
                         '/performance/' || p_id, 'review', p_id);
  return jsonb_build_object('ok', true);
end $$;

create function public.submit_manager_review(p_id uuid, p_rating int, p_comments text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_r public.reviews; v_c public.review_cycles; v_me uuid := public.current_employee_id();
begin
  select * into v_r from public.reviews where id = p_id;
  if not found then return public._hr_err('Review not found.'); end if;
  if v_r.employee_id = v_me then return public._hr_err('You cannot assess your own review.'); end if;
  if not coalesce(v_r.reviewer_id = v_me or public.has_role('hr','admin'), false) then return public._hr_err('You are not the reviewer for this person.'); end if;
  select * into v_c from public.review_cycles where id = v_r.cycle_id;
  if v_c.status <> 'open' then return public._hr_err('This review cycle is not open.'); end if;
  if v_r.status = 'pending_self' then return public._hr_err('Wait for the employee to submit their self review first.'); end if;
  if v_r.status = 'completed' then return public._hr_err('This review is already complete.'); end if;
  if p_rating is null or p_rating not between 1 and 5 then return public._hr_err('Choose a rating from 1 to 5.'); end if;
  if p_comments is null or length(btrim(p_comments)) = 0 then return public._hr_err('Add your comments.'); end if;

  update public.reviews
     set manager_rating = p_rating, manager_comments = btrim(p_comments), manager_submitted_at = now(),
         reviewer_id = coalesce(reviewer_id, v_me), status = 'completed'
   where id = p_id;
  perform public._notify(v_r.employee_id, 'Your review is complete: ' || v_c.name,
                         'Your manager has added their assessment.', '/performance/' || p_id, 'review', p_id);
  return jsonb_build_object('ok', true);
end $$;

-- only signed-in users may call the new functions
revoke all on function public.start_checklist(uuid, uuid, date), public.complete_checklist_task(uuid, boolean, text),
  public.cancel_checklist(uuid), public.launch_review_cycle(uuid), public.close_review_cycle(uuid),
  public.submit_self_review(uuid, int, text), public.submit_manager_review(uuid, int, text) from public, anon;
grant execute on function public.start_checklist(uuid, uuid, date), public.complete_checklist_task(uuid, boolean, text),
  public.cancel_checklist(uuid), public.launch_review_cycle(uuid), public.close_review_cycle(uuid),
  public.submit_self_review(uuid, int, text), public.submit_manager_review(uuid, int, text) to authenticated;

-- =====================================================================
-- STARTER TEMPLATES (HR can edit these in the app)
-- =====================================================================
with t as (
  insert into public.checklist_templates(kind, name) values
    ('onboarding', 'Standard onboarding'), ('offboarding', 'Standard offboarding')
  returning id, name
)
insert into public.checklist_template_items(template_id, sort_order, title, owner_role, due_offset_days)
select t.id, i.n, i.title, i.owner_role, i.off from t join (values
  ('Standard onboarding', 1, 'Send the offer pack and collect the signed employment contract', 'hr', -7),
  ('Standard onboarding', 2, 'Collect personal particulars and emergency contact', 'hr', -3),
  ('Standard onboarding', 3, 'Prepare workstation, laptop and email account', 'office_manager', -2),
  ('Standard onboarding', 4, 'Plan the first-week schedule and assign a buddy', 'manager', -1),
  ('Standard onboarding', 5, 'Read and acknowledge the staff handbook', 'employee', 0),
  ('Standard onboarding', 6, 'Walk through leave and claims in this portal', 'hr', 0),
  ('Standard onboarding', 7, 'Hold the 30-day check-in', 'manager', 30),
  ('Standard onboarding', 8, 'Complete the probation review (adjust to the contract)', 'hr', 90),
  ('Standard offboarding', 1, 'Plan the handover of work and contacts', 'manager', -14),
  ('Standard offboarding', 2, 'Submit outstanding leave and claims', 'employee', -7),
  ('Standard offboarding', 3, 'Settle outstanding claims and advances', 'finance', -3),
  ('Standard offboarding', 4, 'Collect the laptop, access card and company property', 'office_manager', 0),
  ('Standard offboarding', 5, 'Disable email and system access', 'office_manager', 0),
  ('Standard offboarding', 6, 'Hold the exit interview', 'hr', 0),
  ('Standard offboarding', 7, 'Record the end date and untick Active on the Staff page', 'hr', 0),
  ('Standard offboarding', 8, 'Issue final documents as the contract requires', 'hr', 7)
) as i(tname, n, title, owner_role, off) on i.tname = t.name;
