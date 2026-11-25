import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Row } from "@/lib/format";

export const HR_ROLES = ["hr"];
export const HR_VIEW_ROLES = ["hr", "director"];
export const FINANCE_ROLES = ["hr"];

const EMPLOYEE_SELECT = "*, department:departments!employees_department_id_fkey(name)";

export async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let { data } = await supabase.from("employees").select(EMPLOYEE_SELECT).eq("auth_user_id", user.id).maybeSingle();

  if (!data) {
    // A confirmed email that matches a staff record links itself on first sign-in.
    const { data: linked } = await supabase.rpc("link_my_account");
    if (linked) {
      const retry = await supabase.from("employees").select(EMPLOYEE_SELECT).eq("auth_user_id", user.id).maybeSingle();
      data = retry.data;
    }
  }

  return { supabase, user, me: (data as Row | null) ?? null };
}

// Same as getSession, but sends unlinked sign-ins to the "not linked" screen.
export async function requireEmployee() {
  const s = await getSession();
  if (!s.me) redirect("/not-linked");
  return { supabase: s.supabase, user: s.user, me: s.me as Row };
}
