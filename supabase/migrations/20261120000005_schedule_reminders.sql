-- Daily reminder / escalation job: 09:00 Singapore time (01:00 UTC), Monday to Friday.
-- Reminds approvers after 1 working day and escalates after 2. Requires the pg_cron extension.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('approval-reminders', '0 1 * * 1-5', $$select public.process_approval_reminders()$$);

-- First leave / claim reference numbers should start at 0001.
alter sequence public.leave_ref_seq restart with 1;
alter sequence public.claim_ref_seq restart with 1;
