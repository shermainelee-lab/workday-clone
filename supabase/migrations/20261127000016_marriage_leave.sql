-- Marriage leave (code MRL): 5 days, once per employee for their whole time at the company, marriage certificate required.
-- (The type and its once-only check were added directly in the database; this records them with the certificate requirement.)
insert into public.leave_types(code, name, is_paid, default_entitlement, prorate_for_joiners, over_limit_action, requires_certificate, min_notice_days, is_active, sort_order)
values ('MRL', 'Marriage Leave', true, 0, false, 'block', true, 0, true, 7) on conflict (code) do update set requires_certificate = true;
-- _evaluate_leave: the missing-certificate error says "marriage certificate" for MRL.
-- _statutory_entitlement: MRL returns 5 days; used days are counted across all years (case when t.code = 'MRL' then true ...).
-- decide_leave_request: skips the stored-balance check for MRL like the other statutory types.
-- Only for employees getting married: employee_private.marriage_date must be set (Family details), otherwise _statutory_entitlement returns an error for MRL.
alter table public.employee_private add column marriage_date date;
