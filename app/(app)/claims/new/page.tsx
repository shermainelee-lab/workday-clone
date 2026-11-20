import { PageHeader } from "@/components/badges";
import { requireMe } from "@/lib/session";
import ClaimForm from "./form";

export default async function NewClaim() {
  const { supabase } = await requireMe();
  const { data } = await supabase
    .from("claim_categories")
    .select("id, name, per_line_limit, requires_receipt")
    .eq("is_active", true)
    .order("sort_order");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
  const categories = (data ?? []).map((c) => ({ ...c, per_line_limit: c.per_line_limit == null ? null : Number(c.per_line_limit) }));
  return (
    <>
      <PageHeader title="New expense claim" subtitle="One claim can hold several lines. Lines over a category limit are allowed but flagged for your approver." />
      <ClaimForm categories={categories} today={today} />
    </>
  );
}
