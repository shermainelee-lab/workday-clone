-- Past appraisals: HR can set the final rating and attach the signed form; the supervisor can enter the final rating
-- for their direct reports; the employee can attach their own signed form. Nobody can touch anyone else's.
create or replace function public.set_historical_result(p_id uuid, p_final int, p_file text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_r public.reviews; v_hist boolean; v_me uuid := public.current_employee_id(); v_hr boolean := coalesce(public.has_role('hr'), false);
begin
  select * into v_r from public.reviews where id = p_id;
  if not found then return public._hr_err('Appraisal not found.'); end if;
  select c.is_historical into v_hist from public.review_cycles c where c.id = v_r.cycle_id;
  if not coalesce(v_hist, false) then return public._hr_err('This is not a past appraisal.'); end if;
  if p_final is not null then
    if not (v_hr or v_r.reviewer_id = v_me) then return public._hr_err('Only HR or the supervisor can enter the final rating.'); end if;
    if p_final not between 1 and 3 then return public._hr_err('Choose a rating from 1 to 3.'); end if;
  end if;
  if p_file is not null then
    if not (v_hr or v_r.employee_id = v_me) then return public._hr_err('Only HR or the employee can attach the signed form.'); end if;
    if p_file not like p_id::text || '/%' then return public._hr_err('Upload the file again.'); end if;
  end if;
  update public.reviews set final_rating = coalesce(p_final, final_rating), signed_file_path = coalesce(p_file, signed_file_path) where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

drop policy if exists appraisal_upload on storage.objects;
create policy appraisal_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'appraisal-forms' and (
    public.has_role('hr')
    or exists (select 1 from public.reviews r join public.review_cycles c on c.id = r.cycle_id
                where r.id::text = (storage.foldername(name))[1] and c.is_historical
                  and r.employee_id = public.current_employee_id())));
