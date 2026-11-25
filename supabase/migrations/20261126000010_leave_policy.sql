-- Leave policy for the 1 January 2027 rollout:
--  * everyone gets 18 days annual leave; unused days carry forward in full and can be used until the end of the following year
--  * everyone gets 3 days Flexible Wellness Leave, use-it-or-lose-it within the calendar year (it never carries forward)
--  * Childcare Leave is removed
update public.leave_types set default_entitlement = 18 where code = 'AL';
update public.leave_entitlements e set entitled_days = 18
  from public.leave_types t where t.id = e.leave_type_id and t.code = 'AL' and e.year >= 2027 and e.note is null;

insert into public.leave_types(code, name, is_paid, default_entitlement, prorate_for_joiners, over_limit_action, requires_certificate, min_notice_days, is_active, sort_order)
values ('WL', 'Flexible Wellness Leave', true, 3, false, 'block', false, 0, true, 4)
on conflict (code) do nothing;

do $rm$
declare v_id uuid;
begin
  select id into v_id from public.leave_types where code = 'CCL';
  if v_id is not null then
    if exists (select 1 from public.leave_requests where leave_type_id = v_id) or exists (select 1 from public.leave_ledger where leave_type_id = v_id) then
      update public.leave_types set is_active = false where id = v_id;  -- keep history if anyone ever used it
    else
      delete from public.leave_entitlements where leave_type_id = v_id;
      delete from public.leave_types where id = v_id;
    end if;
  end if;
end $rm$;

select public.ensure_entitlements(2027);

-- Year-end: carry the unused annual leave of p_year into p_year + 1 (all of it, never more than the year's own entitlement,
-- because days already carried into p_year expire at the end of p_year). Safe to run again; it overwrites the carry-over only.
create or replace function public.carry_forward_annual_leave(p_year integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_al uuid; n int;
begin
  if auth.uid() is not null and not public.has_role('hr') then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Only HR can carry leave forward.'));
  end if;
  select id into v_al from public.leave_types where code = 'AL';
  perform public.ensure_entitlements(p_year + 1);
  update public.leave_entitlements nx
     set carried_over_days = greatest(0, least(cur.entitled_days, public._leave_balance(cur.employee_id, v_al, p_year))),
         note = coalesce(nx.note, 'Carried forward from ' || p_year)
    from public.leave_entitlements cur
   where cur.leave_type_id = v_al and cur.year = p_year
     and nx.employee_id = cur.employee_id and nx.leave_type_id = v_al and nx.year = p_year + 1;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'count', n);
end $$;
grant execute on function public.carry_forward_annual_leave(integer) to authenticated;
