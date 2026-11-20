import { requireEmployee } from "@/lib/session";
import { todaySG } from "@/lib/format";
import ClaimForm from "@/components/ClaimForm";

export default async function NewClaimPage() {
  const { supabase } = await requireEmployee();
  const { data: categories } = await supabase.from("claim_categories").select("*").eq("is_active", true).order("sort_order");
  return (
    <>
      <div className="page-head">
        <div>
          <h1>New expense claim</h1>
          <p className="muted">Add one line per receipt. Receipts that are missing or already claimed are blocked with a clear message.</p>
        </div>
      </div>
      <ClaimForm categories={categories ?? []} today={todaySG()} />
    </>
  );
}
