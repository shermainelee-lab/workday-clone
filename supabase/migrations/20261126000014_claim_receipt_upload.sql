-- Claims: attach the receipt as a file on each expense line instead of typing a receipt number.
-- Files live in a private bucket (one folder per signed-in user). Only the claimant, the approvers on that claim, HR and the Director can open them.
alter table public.claim_lines add column if not exists receipt_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('claim-receipts', 'claim-receipts', false, 5242880,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists receipt_upload on storage.objects;
create policy receipt_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'claim-receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists receipt_read on storage.objects;
create policy receipt_read on storage.objects for select to authenticated
  using (bucket_id = 'claim-receipts' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_role('hr', 'director')
    or exists (select 1 from public.claim_lines l join public.claims c on c.id = l.claim_id
                where l.receipt_path = storage.objects.name
                  and public.current_employee_id() in (c.approver_id, c.escalated_to, c.first_decided_by))));

do $fix$
declare d text; d0 text;
begin
  select pg_get_functiondef(oid) into d from pg_proc where pronamespace = 'public'::regnamespace and proname = 'submit_claim';
  d0 := d;
  d := replace(d, 'v_receipt := nullif(btrim(coalesce(rec.value->>''receipt_no'', '''')), '''');',
                  'v_receipt := nullif(btrim(coalesce(rec.value->>''receipt_path'', '''')), '''');');
  d := replace(d, 'format(''Line %s: a receipt number is required for %s.'', rec.ordinality, cat.name)',
                  'format(''Line %s: attach the receipt for %s.'', rec.ordinality, cat.name)');
  d := replace(d, E'    if v_receipt is not null then\n      if lower(v_receipt) = any(seen) then errs := errs || format(''Line %s: receipt no. %s is used twice in this claim.'', rec.ordinality, v_receipt); end if;\n      seen := seen || lower(v_receipt);\n      select c.ref into v_dup from public.claim_lines l join public.claims c on c.id = l.claim_id\n       where lower(l.receipt_no) = lower(v_receipt) and c.status not in (''rejected'',''cancelled'',''returned'') limit 1;\n      if v_dup is not null then errs := errs || format(''Line %s: receipt no. %s was already claimed in %s.'', rec.ordinality, v_receipt, v_dup); end if;\n    end if;\n',
                  E'    if v_receipt is not null then\n      if v_receipt not like auth.uid()::text || ''/%'' then errs := errs || format(''Line %s: upload the receipt again.'', rec.ordinality); end if;\n      if lower(v_receipt) = any(seen) then errs := errs || format(''Line %s: the same receipt file is attached twice in this claim.'', rec.ordinality); end if;\n      seen := seen || lower(v_receipt);\n    end if;\n');
  d := replace(d, 'description, receipt_no, amount)', 'description, receipt_path, amount)');
  d := replace(d, 'nullif(btrim(coalesce(value->>''receipt_no'', '''')), '''')', 'nullif(btrim(coalesce(value->>''receipt_path'', '''')), '''')');
  if d = d0 or d ~ 'receipt_no' then raise exception 'submit_claim not fully changed'; end if;
  execute d;
end $fix$;
