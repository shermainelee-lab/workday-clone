import type { SupabaseClient } from "@supabase/supabase-js";

// Receipts are private files: build short-lived signed links for the lines the signed-in person is allowed to open.
export async function receiptUrls(supabase: SupabaseClient, lines: { receipt_path?: string | null }[]): Promise<Record<string, string>> {
  const paths = lines.map((l) => l.receipt_path).filter((p): p is string => !!p);
  if (paths.length === 0) return {};
  const { data } = await supabase.storage.from("claim-receipts").createSignedUrls(paths, 300);
  const out: Record<string, string> = {};
  (data ?? []).forEach((d) => {
    if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  });
  return out;
}
