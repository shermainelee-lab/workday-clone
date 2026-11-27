-- MOM statutory family leave: maternity, paternity, shared parental, childcare and extended childcare leave.
-- Eligibility is checked when someone applies, from the employee's Family details (gender, children's birth dates and citizenship).
-- Entitlements are computed per request (not stored in leave_entitlements), counted in working days on a 5-day week:
--   maternity 16 weeks = 80 days (Singapore citizen child) or 12 weeks = 60 days; paternity 4 weeks = 20 days;
--   shared parental 10 weeks = 50 days (children born from 1 Apr 2026; 6 weeks = 30 days for births 1 Apr 2025 - 31 Mar 2026);
--   childcare 6 days (citizen child under 7) or 2 days (non-citizen); extended childcare 2 days (youngest child 7 to 12, citizen).
-- Source: MOM leave pages, retrieved 27 Nov 2026. HR should confirm anything unusual with MOM.

create table public.employee_private (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  gender text check (gender in ('female', 'male'))
);
create table public.employee_children (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  child_name text not null,
  date_of_birth date not null,
  is_sg_citizen boolean not null default true,
  parents_married boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.employee_children(employee_id);
alter table public.employee_private enable row level security;
alter table public.employee_children enable row level security;
revoke all on public.employee_private, public.employee_children from anon, authenticated;
grant select, insert, update, delete on public.employee_private, public.employee_children to authenticated;

create policy private_own_or_hr on public.employee_private for all to authenticated
  using (employee_id = (select public.current_employee_id()) or (select public.has_role('hr')))
  with check (employee_id = (select public.current_employee_id()) or (select public.has_role('hr')));
create policy children_own_or_hr on public.employee_children for all to authenticated
  using (employee_id = (select public.current_employee_id()) or (select public.has_role('hr')))
  with check (employee_id = (select public.current_employee_id()) or (select public.has_role('hr')));

alter table public.leave_requests add column child_id uuid references public.employee_children(id) on delete set null;

insert into public.leave_types(code, name, is_paid, default_entitlement, prorate_for_joiners, over_limit_action, requires_certificate, min_notice_days, is_active, sort_order) values
 ('MAT',  'Maternity Leave',        true, 0, false, 'block', false, 0, true, 10),
 ('PAT',  'Paternity Leave',        true, 0, false, 'block', false, 0, true, 11),
 ('SPL',  'Shared Parental Leave',  true, 0, false, 'block', false, 0, true, 12),
 ('CCL',  'Childcare Leave',        true, 0, false, 'block', false, 0, true, 13),
 ('ECCL', 'Extended Childcare Leave', true, 0, false, 'block', false, 0, true, 14)
on conflict (code) do nothing;

create or replace function public._statutory_entitlement(p_emp uuid, p_code text, p_start date, p_end date, p_child uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e public.employees; g text; c public.employee_children; v_age int;
begin
  select * into e from public.employees where id = p_emp;
  select gender into g from public.employee_private where employee_id = p_emp;

  if p_code in ('MAT', 'PAT', 'SPL') then
    if p_child is null then return jsonb_build_object('error', 'Choose the child this leave is for. Add your child under Family details first.'); end if;
    select * into c from public.employee_children where id = p_child and employee_id = p_emp;
    if not found then return jsonb_build_object('error', 'Choose one of your own children.'); end if;
    if e.join_date + interval '3 months' > c.date_of_birth then
      return jsonb_build_object('error', 'You need at least 3 months of continuous service before the birth to qualify for this leave.');
    end if;
  end if;

  if p_code = 'MAT' then
    if g is distinct from 'female' then return jsonb_build_object('error', 'Maternity leave is for mothers. If this is wrong, ask HR to check the gender on your Family details.'); end if;
    return jsonb_build_object('days', case when c.is_sg_citizen then 80 else 60 end);
  elsif p_code = 'PAT' then
    if g is distinct from 'male' then return jsonb_build_object('error', 'Paternity leave is for fathers. If this is wrong, ask HR to check the gender on your Family details.'); end if;
    if not c.is_sg_citizen then return jsonb_build_object('error', 'Government-paid paternity leave needs a Singapore citizen child.'); end if;
    if not c.parents_married then return jsonb_build_object('error', 'Government-paid paternity leave needs you to be or have been married to the child''s mother (between conception and 12 months after birth).'); end if;
    return jsonb_build_object('days', case when c.date_of_birth >= date '2025-04-01' then 20 else 10 end);
  elsif p_code = 'SPL' then
    if not c.is_sg_citizen then return jsonb_build_object('error', 'Shared parental leave needs a Singapore citizen child.'); end if;
    if c.date_of_birth < date '2025-04-01' then return jsonb_build_object('error', 'Shared parental leave is only for children born from 1 April 2025.'); end if;
    if p_end > (c.date_of_birth + interval '12 months')::date then
      return jsonb_build_object('error', 'Shared parental leave must be taken within 12 months of the child''s birth.');
    end if;
    return jsonb_build_object('days', case when c.date_of_birth >= date '2026-04-01' then 50 else 30 end);
  elsif p_code in ('CCL', 'ECCL') then
    if e.join_date + interval '3 months' > p_start then return jsonb_build_object('error', 'You need at least 3 months of service to qualify for this leave.'); end if;
    select * into c from public.employee_children where employee_id = p_emp order by date_of_birth desc limit 1;
    if not found then return jsonb_build_object('error', 'Add your children under Family details first.'); end if;
    v_age := extract(year from age(p_start, c.date_of_birth))::int;
    if p_code = 'CCL' then
      if v_age >= 7 then return jsonb_build_object('error', 'Childcare leave is for parents whose youngest child is under 7. See Extended Childcare Leave for children aged 7 to 12.'); end if;
      return jsonb_build_object('days', case when c.is_sg_citizen then 6 else 2 end);
    else
      if v_age < 7 or v_age > 12 then return jsonb_build_object('error', 'Extended childcare leave is for parents whose youngest child is aged 7 to 12.'); end if;
      if not c.is_sg_citizen then return jsonb_build_object('error', 'Extended childcare leave needs a Singapore citizen child.'); end if;
      return jsonb_build_object('days', 2);
    end if;
  end if;
  return jsonb_build_object('error', 'Unknown leave type.');
end $$;

-- _evaluate_leave: takes the chosen child; the statutory types use their own eligibility and entitlement instead of leave_entitlements
do $fix$
declare d text; d0 text;
begin
  select pg_get_functiondef(oid) into d from pg_proc where pronamespace = 'public'::regnamespace and proname = '_evaluate_leave';
  d0 := d;
  d := replace(d, 'p_mc text)', 'p_mc text, p_child uuid DEFAULT NULL::uuid)');
  d := replace(d, 'v_clashes jsonb; v_approver uuid;', 'v_clashes jsonb; v_stat boolean; v_ent jsonb; v_used numeric; v_approver uuid;');
  d := replace(d, E'  if extract(year from p_start) <> extract(year from p_end) then\n',
                  E'  v_stat := t.code in (''MAT'', ''PAT'', ''SPL'', ''CCL'', ''ECCL'');\n  if extract(year from p_start) <> extract(year from p_end) and t.code not in (''MAT'', ''PAT'', ''SPL'') then\n');
  d := replace(d, E'  v_avail := public._leave_balance(p_emp, p_type, v_year) - public._leave_pending(p_emp, p_type, v_year);\n  if t.over_limit_action = ''block'' and v_days > v_avail then',
    E'  if v_stat then\n    v_ent := public._statutory_entitlement(p_emp, t.code, p_start, p_end, p_child);\n    if v_ent->>''error'' is not null then\n      errs := errs || (v_ent->>''error'');\n      v_avail := 0;\n    else\n      select coalesce(sum(r.days), 0) into v_used from public.leave_requests r\n       where r.employee_id = p_emp and r.leave_type_id = p_type and r.status in (''pending'', ''approved'')\n         and case when t.code in (''MAT'', ''PAT'', ''SPL'') then r.child_id is not distinct from p_child else r.year = v_year end;\n      v_avail := (v_ent->>''days'')::numeric - v_used;\n    end if;\n  else\n    v_avail := public._leave_balance(p_emp, p_type, v_year) - public._leave_pending(p_emp, p_type, v_year);\n  end if;\n  if v_stat and v_ent->>''error'' is not null then\n    null;\n  elsif t.over_limit_action = ''block'' and v_days > v_avail then');
  if d = d0 or d !~ 'v_stat and v_ent' or d !~ 'p_child uuid' then raise exception '_evaluate_leave not changed'; end if;
  drop function public._evaluate_leave(uuid, uuid, date, date, day_part, text);
  execute d;

  select pg_get_functiondef(oid) into d from pg_proc where pronamespace = 'public'::regnamespace and proname = 'leave_preview';
  d0 := d;
  d := replace(d, 'p_mc text DEFAULT NULL::text)', 'p_mc text DEFAULT NULL::text, p_child uuid DEFAULT NULL::uuid)');
  d := replace(d, 'p_part, p_mc);', 'p_part, p_mc, p_child);');
  if d = d0 then raise exception 'leave_preview not changed'; end if;
  drop function public.leave_preview(uuid, date, date, day_part, text);
  execute d;

  select pg_get_functiondef(oid) into d from pg_proc where pronamespace = 'public'::regnamespace and proname = 'submit_leave_request';
  d0 := d;
  d := replace(d, 'p_mc text DEFAULT NULL::text)', 'p_mc text DEFAULT NULL::text, p_child uuid DEFAULT NULL::uuid)');
  d := replace(d, 'p_part, p_mc);', 'p_part, p_mc, p_child);');
  d := replace(d, 'reason, certificate_path,', 'reason, certificate_path, child_id,');
  d := replace(d, 'nullif(btrim(p_mc), ''''),', 'nullif(btrim(p_mc), ''''), p_child,');
  if d = d0 or d !~ 'child_id' or d !~ 'p_child' then raise exception 'submit_leave_request not changed'; end if;
  drop function public.submit_leave_request(uuid, date, date, day_part, text, text);
  execute d;

  -- approval re-checks the balance; statutory types have no stored balance (they were checked when submitted)
  select pg_get_functiondef(oid) into d from pg_proc where pronamespace = 'public'::regnamespace and proname = 'decide_leave_request';
  d0 := d;
  d := replace(d, 'if t.over_limit_action = ''block'' and r.days > v_bal then',
                  'if t.over_limit_action = ''block'' and t.code not in (''MAT'', ''PAT'', ''SPL'', ''CCL'', ''ECCL'') and r.days > v_bal then');
  if d = d0 then raise exception 'decide_leave_request not changed'; end if;
  execute d;
end $fix$;

grant execute on function public.leave_preview(uuid, date, date, day_part, text, uuid), public.submit_leave_request(uuid, date, date, day_part, text, text, uuid) to authenticated;
revoke execute on function public.leave_preview(uuid, date, date, day_part, text, uuid), public.submit_leave_request(uuid, date, date, day_part, text, text, uuid), public._statutory_entitlement(uuid, text, date, date, uuid), public._evaluate_leave(uuid, uuid, date, date, day_part, text, uuid) from public, anon;
grant execute on function public.leave_preview(uuid, date, date, day_part, text, uuid), public.submit_leave_request(uuid, date, date, day_part, text, text, uuid) to authenticated;
