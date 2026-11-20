import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "employee" | "office_manager" | "hr" | "finance" | "director" | "admin";

export type Me = {
  id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  role: Role;
  department_id: string | null;
  manager_id: string | null;
  join_date: string;
};

/** Signed-in user + linked employee record. Redirects to /login when signed out. */
export const requireMe = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cols = "id, full_name, email, job_title, role, department_id, manager_id, join_date";
  let { data: me } = await supabase.from("employees").select(cols).eq("auth_user_id", user.id).maybeSingle();
  if (!me) {
    // First sign-in: link this login to the staff record with the same (confirmed) email.
    await supabase.rpc("link_my_account");
    ({ data: me } = await supabase.from("employees").select(cols).eq("auth_user_id", user.id).maybeSingle());
  }
  return { supabase, user, me: me as Me | null };
});

export const can = {
  approve: (r: Role) => true, // anyone with direct reports can be an approver; the DB decides per request
  hr: (r: Role) => r === "hr" || r === "admin",
  hrView: (r: Role) => ["hr", "admin", "director", "office_manager"].includes(r),
  finance: (r: Role) => r === "finance" || r === "admin",
  financeView: (r: Role) => ["finance", "hr", "admin", "director"].includes(r),
};
