"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { RpcResult } from "@/lib/utils";

export type FormState = { errors?: string[] } | null;

export async function submitLeave(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_leave_request", {
    p_type: String(formData.get("type")),
    p_start: String(formData.get("start")),
    p_end: String(formData.get("end")),
    p_part: String(formData.get("part") || "full"),
    p_reason: String(formData.get("reason") ?? ""),
    p_mc: String(formData.get("mc") ?? ""),
  });
  const res = data as RpcResult | null;
  if (error || !res?.ok) return { errors: res?.errors ?? [error?.message ?? "Could not submit the request."] };
  revalidatePath("/", "layout");
  redirect(`/leave/${res.id}?ok=${encodeURIComponent(`Submitted as ${res.ref}. Your approver has been notified.`)}`);
}

export async function cancelLeave(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_leave_request", { p_id: id, p_remark: String(formData.get("remark") ?? "") });
  const res = data as RpcResult | null;
  revalidatePath("/", "layout");
  if (error || !res?.ok) redirect(`/leave/${id}?err=${encodeURIComponent(res?.errors?.[0] ?? error?.message ?? "Could not cancel.")}`);
  redirect(`/leave/${id}?ok=${encodeURIComponent("Request cancelled.")}`);
}
