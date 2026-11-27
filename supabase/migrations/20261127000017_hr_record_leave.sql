-- HR records leave that was already approved elsewhere (Excel tracker, email). It is saved as approved, deducts the balance
-- (posts a usage entry in leave_ledger), shows on the calendar and reports, and is logged. No approver step, no balance block.
create or replace function public.hr_record_leave(
  p_employee uuid, p_type uuid, p_start date, p_end date, p_part day_part default 'full',
  p_approver uuid default null, p_remark text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := public.current_employee_id(); t public.leave_types; v_days numeric; v_year int; rid uuid; rref text;
        v_overlap text; v_bal numeric; v_name text; v_note text; v_warn text[] := '{}';
begin
  if me is null or not public.has_role('hr') then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Only HR can record leave.'));
  end if;
  if p_employee = me then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('You cannot record your own leave. Ask another HR person.'));
  end if;
  select * into t from public.leave_types where id = p_type;
  if not found then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Choose a leave type.')); end if;
  select full_name into v_name from public.employees where id = p_employee;
  if v_name is null then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Choose an employee.')); end if;
  if p_start is null or p_end is null or p_end < p_start then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Check the dates.'));
  end if;
  if extract(year from p_start) <> extract(year from p_end) then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Record leave that crosses a year end as two entries, one for each year.'));
  end if;
  if p_part <> 'full' and p_start <> p_end then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('A half day must be a single date.'));
  end if;
  v_days := case when p_part <> 'full' then (case when public.working_days(p_start, p_start) > 0 then 0.5 else 0 end) else public.working_days(p_start, p_end) end;
  if v_days = 0 then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('These dates have no working days (weekends and public holidays are not counted).'));
  end if;
  select ref into v_overlap from public.leave_requests
   where employee_id = p_employee and status in ('pending', 'approved')
     and daterange(start_date, end_date, '[]') && daterange(p_start, p_end, '[]') limit 1;
  if v_overlap is not null then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array(format('These dates overlap an existing request (%s).', v_overlap)));
  end if;

  v_year := extract(year from p_start)::int;
  perform pg_advisory_xact_lock(hashtext('leave:' || p_employee::text));
  v_bal := public._leave_balance(p_employee, p_type, v_year);
  if t.code in ('AL', 'WL', 'CPL', 'OIL') and v_days > v_bal then
    v_warn := v_warn || format('This takes %s over the balance (%s day(s) left before it).', v_name, v_bal);
  end if;

  v_note := 'Recorded by HR from an existing approval' || coalesce(': ' || nullif(btrim(p_remark), ''), '.');
  insert into public.leave_requests(employee_id, leave_type_id, start_date, end_date, day_part, days, year, reason, status,
                                    approver_id, decided_at, decided_by, decision_remark, flags, balance_before, balance_after)
  values (p_employee, p_type, p_start, p_end, p_part, v_days, v_year, nullif(btrim(p_remark), ''), 'approved',
          coalesce(p_approver, me), now(), coalesce(p_approver, me), v_note, array['Recorded by HR'], v_bal, v_bal - v_days)
  returning id, ref into rid, rref;
  insert into public.leave_ledger(employee_id, leave_type_id, year, entry_type, days, request_id, note, created_by)
  values (p_employee, p_type, v_year, 'usage', v_days, rid, 'Recorded by HR ' || rref, me);
  perform public._log_event('leave', rid, rref, 'recorded', me, null, 'approved', nullif(btrim(p_remark), ''),
                            jsonb_build_object('days', v_days, 'approver', p_approver));
  return jsonb_build_object('ok', true, 'id', rid, 'ref', rref, 'days', v_days, 'balance_after', v_bal - v_days, 'warnings', to_jsonb(v_warn));
end $$;
revoke execute on function public.hr_record_leave(uuid, uuid, date, date, day_part, uuid, text) from public, anon;
grant execute on function public.hr_record_leave(uuid, uuid, date, date, day_part, uuid, text) to authenticated;
