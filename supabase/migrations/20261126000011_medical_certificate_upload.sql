-- Sick and hospitalisation leave: attach the medical certificate as a file instead of typing an MC number.
-- Files live in a private bucket, one folder per signed-in user (auth.uid()). Only the owner, the request's approvers and HR can open them.
alter table public.leave_requests add column if not exists certificate_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('medical-certificates', 'medical-certificates', false, 5242880,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists medcert_upload on storage.objects;
create policy medcert_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'medical-certificates' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists medcert_read on storage.objects;
create policy medcert_read on storage.objects for select to authenticated
  using (bucket_id = 'medical-certificates' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_role('hr')
    or exists (select 1 from public.leave_requests r
                where r.certificate_path = storage.objects.name
                  and public.current_employee_id() in (r.approver_id, r.escalated_to, r.first_decided_by))));

do $fix$
declare d text; d0 text;
begin
  select pg_get_functiondef(oid) into d from pg_proc where pronamespace = 'public'::regnamespace and proname = '_evaluate_leave';
  d0 := d;
  d := replace(d, 'format(''A medical certificate (MC) number is required for %s.'', t.name)',
                  'format(''Attach your medical certificate for %s.'', t.name)');
  if d = d0 then raise exception '_evaluate_leave not changed'; end if;
  execute d;

  select pg_get_functiondef(oid) into d from pg_proc where pronamespace = 'public'::regnamespace and proname = 'submit_leave_request';
  d0 := d;
  d := replace(d, 'p_reason, mc_number,', 'p_reason, certificate_path,');
  d := replace(d, 'insert into public.leave_requests(employee_id, leave_type_id, start_date, end_date, day_part, days, reason, mc_number,',
                  'insert into public.leave_requests(employee_id, leave_type_id, start_date, end_date, day_part, days, reason, certificate_path,');
  d := replace(d, '  perform pg_advisory_xact_lock',
    E'  if nullif(btrim(coalesce(p_mc, \'\')), \'\') is not null and p_mc not like auth.uid()::text || \'/%\' then\n    return jsonb_build_object(\'ok\', false, \'errors\', jsonb_build_array(\'Upload the medical certificate again.\'));\n  end if;\n  perform pg_advisory_xact_lock');
  if d = d0 or d !~ 'certificate_path' or d !~ 'Upload the medical certificate again' then raise exception 'submit_leave_request not changed'; end if;
  execute d;
end $fix$;
