-- Workday Clone: simplify roles to Employee, HR & Finance, Director.
-- Removed: Office Manager, Finance (merged into HR) and Admin.
-- The old values stay in the database enum (Postgres cannot safely drop enum values that rules refer to), but the
-- check constraint below means nobody can hold them any more.

-- 1. move people off the removed roles: Admin and Finance become HR & Finance, Office Manager becomes Employee
update public.employees set role = 'hr' where role in ('admin', 'finance');
update public.employees set role = 'employee' where role = 'office_manager';
alter table public.employees add constraint employees_role_allowed check (role in ('employee', 'hr', 'director'));

-- 2. onboarding tasks owned by Finance or the Office Manager now belong to HR & Finance
alter table public.checklist_template_items drop constraint checklist_template_items_owner_role_check;
alter table public.checklist_tasks drop constraint checklist_tasks_owner_role_check;
update public.checklist_template_items set owner_role = 'hr' where owner_role in ('finance', 'office_manager');
update public.checklist_tasks set owner_role = 'hr' where owner_role in ('finance', 'office_manager');
alter table public.checklist_template_items add constraint checklist_template_items_owner_role_check check (owner_role in ('employee', 'manager', 'hr'));
alter table public.checklist_tasks add constraint checklist_tasks_owner_role_check check (owner_role in ('employee', 'manager', 'hr'));

-- 3. re-point the rules in every function: HR & Finance pays claims and gets the notifications; no Admin override; no Office Manager copies
do $fix$
declare
  r record; d text; d0 text; i int;
  lit text[][] := array[
    ['public.has_role(''hr'',''admin'',''director'',''office_manager'')', 'public.has_role(''hr'',''director'')'],
    ['public.has_role(''hr'',''admin'')',                               'public.has_role(''hr'')'],
    ['public.has_role(''director'',''admin'')',                         'public.has_role(''director'')'],
    ['public.has_role(''finance'',''admin'')',                          'public.has_role(''hr'')'],
    [' or public.has_role(''admin''), false)',                          ', false)'],
    ['Only Finance can',                                                'Only HR & Finance can'],
    ['array[''finance'']::public.app_role[]',                           'array[''hr'']::public.app_role[]'],
    ['array[''office_manager'',''hr'']::public.app_role[]',             'array[''hr'']::public.app_role[]'],
    ['role in (''director'',''admin'',''hr'')',                         'role in (''director'',''hr'')'],
    ['when ''admin'' then 2 else 3',                                    'else 2'],
    [E'\n       or (v_task.owner_role = ''finance'' and public.has_role(''finance''))', ''],
    [E'\n       or (v_task.owner_role = ''office_manager'' and public.has_role(''office_manager'')), false);', E', false);']
  ];
begin
  for r in select p.oid, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
            and pg_get_functiondef(p.oid) ~ '(office_manager|''finance''|''admin'')' loop
    d := pg_get_functiondef(r.oid); d0 := d;
    for i in 1 .. array_length(lit, 1) loop d := replace(d, lit[i][1], lit[i][2]); end loop;
    -- HR does its own checklist tasks, so the per-role notification loop is no longer needed
    d := regexp_replace(d, E'  foreach v_role in array array\\[''finance'', ''office_manager''\\] loop.*?  end loop;\\n', '', 's');
    if d <> d0 then execute d; end if;
  end loop;

  -- policies: drop the removed roles from every role list
  for r in select * from pg_policies where schemaname = 'public'
            and (coalesce(qual,'') || coalesce(with_check,'')) ~ '(office_manager|finance|admin)' loop
    execute format('alter policy %I on %I.%I using (%s)%s', r.policyname, r.schemaname, r.tablename,
      regexp_replace(r.qual, ', ''(admin|office_manager|finance)''::app_role', '', 'g'),
      case when r.with_check is null then '' else ' with check (' ||
        regexp_replace(r.with_check, ', ''(admin|office_manager|finance)''::app_role', '', 'g') || ')' end);
  end loop;

  -- safety net: nothing should still mention the removed roles
  for r in select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
            and p.proname <> 'has_role' and pg_get_functiondef(p.oid) ~ '(office_manager|''finance''|''admin'')' loop
    raise exception 'function % still mentions a removed role', r.proname;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and (coalesce(qual,'') || coalesce(with_check,'')) ~ '(office_manager|finance|admin)') then
    raise exception 'a policy still mentions a removed role';
  end if;
end $fix$;
