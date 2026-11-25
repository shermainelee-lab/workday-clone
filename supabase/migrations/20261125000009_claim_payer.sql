-- Who pays claims is a per-person setting, so HR can stay HR-only while one person also pays claims.
alter table public.employees add column if not exists can_pay_claims boolean not null default false;
update public.employees set can_pay_claims = true where full_name = 'Michele Ng';

create or replace function public._can_pay_claims() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.has_role('hr') and exists (select 1 from public.employees where id = public.current_employee_id() and can_pay_claims), false)
$$;

create or replace function public._notify_payers(p_subject text, p_body text, p_link text, p_type text, p_id uuid, p_exclude uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications(recipient_id, subject, body, link, entity_type, entity_id)
  select e.id, p_subject, p_body, p_link, p_type, p_id
    from public.employees e
   where e.is_active and e.can_pay_claims and e.id <> all(coalesce(p_exclude, '{}'::uuid[]));
end $$;

do $fix$
declare r record; d text; d0 text;
begin
  for r in select oid, proname from pg_proc where pronamespace = 'public'::regnamespace
            and proname in ('finance_pay_claim', 'finance_return_claim', 'decide_claim') loop
    d := pg_get_functiondef(r.oid); d0 := d;
    d := replace(d, 'not public.has_role(''hr'') then return jsonb_build_object', 'not public._can_pay_claims() then return jsonb_build_object');
    d := replace(d, 'Only HR & Finance can', 'Only the person who pays claims can');
    d := replace(d, 'public._notify_roles(array[''hr'']::public.app_role[], format(''Claim ready to pay', 'public._notify_payers(format(''Claim ready to pay');
    if d = d0 then raise exception 'nothing changed in %', r.proname; end if;
    execute d;
  end loop;
end $fix$;
