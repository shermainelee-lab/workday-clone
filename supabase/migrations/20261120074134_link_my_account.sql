create function public.link_my_account() returns boolean language plpgsql security definer set search_path = public as $$
declare v_email text; n int;
begin
  select email into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then return false; end if;
  update public.employees set auth_user_id = auth.uid()
   where lower(email) = lower(v_email) and auth_user_id is null and is_active;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.link_my_account() from public, anon;
grant execute on function public.link_my_account() to authenticated;
