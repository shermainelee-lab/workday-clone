import { requireEmployee } from "@/lib/session";
import LeaveForm from "@/components/LeaveForm";

export default async function NewLeavePage() {
  const { supabase, me } = await requireEmployee();
  const { data: types } = await supabase.from("leave_types").select("*").eq("is_active", true).order("sort_order");
  const { data: children } = await supabase.from("employee_children").select("id, child_name, date_of_birth").eq("employee_id", me.id).order("date_of_birth");
  const { data: priv } = await supabase.from("employee_private").select("marriage_date").eq("employee_id", me.id).maybeSingle();
  const offered = (types ?? []).filter((t) => t.code !== "MRL" || priv?.marriage_date);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Apply for leave</h1>
          <p className="muted">Your balance and team clashes are checked as you pick dates. Nothing is saved until you submit.</p>
        </div>
      </div>
      <LeaveForm types={offered} children={children ?? []} />
    </>
  );
}
