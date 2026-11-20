"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { RpcResult } from "@/lib/utils";

export async function payClaim(formData: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_pay_claim", {
    p_id: String(formData.get("id")),
    p_paid_on: String(formData.get("paid_on") ?? ""),
    p_reference: String(formData.get("reference") ?? ""),
  });
  const res = data as RpcResult | null;
  revalidatePath("/", "layout");
  if (error || !res?.ok) redirect(`/finance?err=${encodeURIComponent(res?.errors?.[0] ?? error?.message ?? "Could not record payment.")}`);
  redirect(`/finance?ok=${encodeURIComponent("Payment recorded.")}`);
}

export async function returnClaim(formData: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_return_claim", {
    p_id: String(formData.get("id")),
    p_remark: String(formData.get("remark") ?? ""),
  });
  const res = data as RpcResult | null;
  revalidatePath("/", "layout");
  if (error || !res?.ok) redirect(`/finance?err=${encodeURIComponent(res?.errors?.[0] ?? error?.message ?? "Could not return the claim.")}`);
  redirect(`/finance?ok=${encodeURIComponent("Claim returned to the employee.")}`);
}
