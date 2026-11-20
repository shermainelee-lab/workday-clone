import { requireEmployee } from "@/lib/session";
import LeaveForm from "@/components/LeaveForm";

export default async function NewLeavePage() {
  const { supabase } = await requireEmployee();
  const { data: types } = await supabase.from("leave_types").select("*").eq("is_active", true).order("sort_order");
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Apply for leave</h1>
          <p className="muted">Your balance and team clashes are checked as you pick dates. Nothing is saved until you submit.</p>
        </div>
      </div>
      <LeaveForm types={types ?? []} />
    </>
  );
}
