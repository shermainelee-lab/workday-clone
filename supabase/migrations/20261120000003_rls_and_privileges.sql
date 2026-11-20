-- Workday Clone: row-level security and table privileges.
-- Staff read what they need; all leave/claim writes go through the functions in the previous migration.

alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.public_holidays enable row level security;
alter table public.leave_types enable row level security;
alter table public.leave_entitlements enable row level security;
alter table public.leave_requests enable row level security;
alter table public.leave_ledger enable row level security;
alter table public.claim_categories enable row level security;
alter table public.claims enable row level security;
alter table public.claim_lines enable row level security;
alter table public.request_events enable row level security;
alter table public.notifications enable row level security;

-- company directory + reference data: readable by linked staff, editable by HR/admin
create policy employees_read on public.employees for select to authenticated
  using (auth_user_id = (select auth.uid()) or (select public.current_employee_id()) is not null);
create policy employees_hr_write on public.employees for all to authenticated
  using ((select public.has_role('hr','admin'))) with check ((select public.has_role('hr','admin')));

create policy departments_read on public.departments for select to authenticated using ((select public.current_employee_id()) is not null);
create policy departments_hr_write on public.departments for all to authenticated
  using ((select public.has_role('hr','admin'))) with check ((select public.has_role('hr','admin')));

create policy holidays_read on public.public_holidays for select to authenticated using ((select public.current_employee_id()) is not null);
create policy holidays_hr_write on public.public_holidays for all to authenticated
  using ((select public.has_role('hr','admin'))) with check ((select public.has_role('hr','admin')));

create policy leave_types_read on public.leave_types for select to authenticated using ((select public.current_employee_id()) is not null);
create policy leave_types_hr_write on public.leave_types for all to authenticated
  using ((select public.has_role('hr','admin'))) with check ((select public.has_role('hr','admin')));

create policy claim_categories_read on public.claim_categories for select to authenticated using ((select public.current_employee_id()) is not null);
create policy claim_categories_hr_write on public.claim_categories for all to authenticated
  using ((select public.has_role('hr','admin','finance'))) with check ((select public.has_role('hr','admin','finance')));

-- leave records
create policy entitlements_read on public.leave_entitlements for select to authenticated
  using (employee_id = (select public.current_employee_id()) or (select public.has_role('hr','admin','director','office_manager')));
create policy entitlements_hr_write on public.leave_entitlements for all to authenticated
  using ((select public.has_role('hr','admin'))) with check ((select public.has_role('hr','admin')));

create policy ledger_read on public.leave_ledger for select to authenticated
  using (employee_id = (select public.current_employee_id()) or (select public.has_role('hr','admin','director','office_manager')));

create policy leave_requests_read on public.leave_requests for select to authenticated
  using (employee_id = (select public.current_employee_id())
         or approver_id = (select public.current_employee_id())
         or escalated_to = (select public.current_employee_id())
         or (select public.has_role('hr','admin','director','office_manager')));

-- claims
create policy claims_read on public.claims for select to authenticated
  using (employee_id = (select public.current_employee_id())
         or approver_id = (select public.current_employee_id())
         or escalated_to = (select public.current_employee_id())
         or (select public.has_role('hr','admin','director','finance')));

create policy claim_lines_read on public.claim_lines for select to authenticated
  using (exists (select 1 from public.claims c where c.id = claim_id));

-- audit trail: visible wherever the underlying request is visible
create policy events_read on public.request_events for select to authenticated
  using ((entity_type = 'leave' and exists (select 1 from public.leave_requests r where r.id = entity_id))
      or (entity_type = 'claim' and exists (select 1 from public.claims c where c.id = entity_id)));

-- notifications
create policy notifications_read on public.notifications for select to authenticated using (recipient_id = (select public.current_employee_id()));
create policy notifications_mark_read on public.notifications for update to authenticated
  using (recipient_id = (select public.current_employee_id())) with check (recipient_id = (select public.current_employee_id()));

-- table privileges: nothing for anon, read-only for signed-in users except where a write policy exists
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
grant insert, update, delete on public.departments, public.employees, public.public_holidays, public.leave_types,
  public.claim_categories, public.leave_entitlements to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select on public.leave_balances to authenticated;
revoke all on all sequences in schema public from anon, authenticated;
