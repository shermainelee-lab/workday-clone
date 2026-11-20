"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { RpcResult } from "@/lib/utils";

export async function decide(formData: FormData) {
  const kind = String(formData.get("kind"));
  const id = String(formData.get("id"));
  const approve = formData.get("decision") === "approve";
  const remark = String(formData.get("remark") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(kind === "claim" ? "decide_claim" : "decide_leave_request", {
    p_id: id,
    p_approve: approve,
    p_remark: remark,
  });
  const res = data as RpcResult | null;
  revalidatePath("/", "layout");
  if (error || !res?.ok) redirect(`/approvals?err=${encodeURIComponent(res?.errors?.[0] ?? error?.message ?? "Could not record the decision.")}`);
  redirect(`/approvals?ok=${encodeURIComponent(approve ? "Approved." : "Rejected — the applicant has been told why.")}`);
}
