-- Reminders after 1 working day, escalation after 2. Runs weekdays 09:00 Singapore time (01:00 UTC).
-- (Already scheduled in the live project as job "approval-reminders"; shown here so a fresh project gets it too.)
create extension if not exists pg_cron;
select cron.schedule('approval-reminders', '0 1 * * 1-5', 'select public.process_approval_reminders()');
