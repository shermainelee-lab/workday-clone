"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { RpcResult } from "@/lib/utils";
import type { FormState } from "../leave/actions";

export async function submitClaim(_prev: FormState, formData: FormData): Promise<FormState> {
  let lines: unknown;
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { errors: ["The expense lines could not be read. Please try again."] };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_claim", {
    p_description: String(formData.get("description") ?? ""),
    p_declaration: formData.get("declaration") === "on",
    p_lines: lines,
  });
  const res = data as RpcResult | null;
  if (error || !res?.ok) return { errors: res?.errors ?? [error?.message ?? "Could not submit the claim."] };
  revalidatePath("/", "layout");
  redirect(`/claims/${res.id}?ok=${encodeURIComponent(`Submitted as ${res.ref}. Your approver has been notified.`)}`);
}

export async function cancelClaim(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_claim", { p_id: id });
  const res = data as RpcResult | null;
  revalidatePath("/", "layout");
  if (error || !res?.ok) redirect(`/claims/${id}?err=${encodeURIComponent(res?.errors?.[0] ?? error?.message ?? "Could not cancel.")}`);
  redirect(`/claims/${id}?ok=${encodeURIComponent("Claim cancelled.")}`);
}
