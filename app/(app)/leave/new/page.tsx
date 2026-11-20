import { PageHeader } from "@/components/badges";
import { requireMe } from "@/lib/session";
import LeaveForm from "./form";

export default async function NewLeave() {
  const { supabase } = await requireMe();
  const { data: types } = await supabase
    .from("leave_types")
    .select("id, name, requires_certificate")
    .eq("is_active", true)
    .order("sort_order");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
  return (
    <>
      <PageHeader title="Request leave" subtitle="Working days exclude weekends and Singapore public holidays. The check on the right runs the same rules as submission." />
      <LeaveForm types={types ?? []} today={today} />
    </>
  );
}
