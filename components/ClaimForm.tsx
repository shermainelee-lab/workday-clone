"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ErrorList } from "@/components/ui";
import { money, type Row } from "@/lib/format";

type Line = { expense_date: string; category_id: string; description: string; receipt_path: string; receipt_name: string; amount: string };

export default function ClaimForm({ categories, today }: { categories: Row[]; today: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const blank = (): Line => ({ expense_date: today, category_id: categories[0]?.id ?? "", description: "", receipt_path: "", receipt_name: "", amount: "" });
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [declared, setDeclared] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);

  const total = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  async function uploadReceipt(i: number, file: File | undefined) {
    if (!file) return;
    setErrors([]);
    if (file.size > 5 * 1024 * 1024) {
      setErrors([`Line ${i + 1}: the file is larger than 5 MB. Upload a smaller photo or PDF.`]);
      return;
    }
    setUploading(i);
    const { data: auth } = await supabase.auth.getUser();
    const path = `${auth.user?.id}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80)}`;
    const { error } = await supabase.storage.from("claim-receipts").upload(path, file, { contentType: file.type || undefined });
    setUploading(null);
    if (error) {
      setErrors([`Line ${i + 1}: could not upload the file: ${error.message}`]);
      return;
    }
    update(i, { receipt_path: path, receipt_name: file.name });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    const { data, error } = await supabase.rpc("submit_claim", {
      p_description: title,
      p_declaration: declared,
      p_lines: lines.map((l) => ({ expense_date: l.expense_date, category_id: l.category_id, description: l.description, receipt_path: l.receipt_path, amount: Number(l.amount) })),
    });
    setBusy(false);
    const res = (data ?? {}) as { ok?: boolean; id?: string; errors?: string[] };
    if (error || !res.ok) {
      setErrors(res.errors ?? [error?.message ?? "Could not submit the claim."]);
      return;
    }
    router.push(`/claims/${res.id}`);
    router.refresh();
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="field">
        <label htmlFor="title">Claim title</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Client visit, 10 Nov" required />
      </div>

      <h3>Expense lines</h3>
      {lines.map((l, i) => (
        <div className="card" key={i} style={{ background: "#fafbfc" }}>
          <div className="row">
            <div className="field">
              <label>Date</label>
              <input type="date" required value={l.expense_date} max={today} onChange={(e) => update(i, { expense_date: e.target.value })} />
            </div>
            <div className="field">
              <label>Category</label>
              <select value={l.category_id} onChange={(e) => update(i, { category_id: e.target.value })}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Amount (SGD)</label>
              <input type="number" step="0.01" min="0.01" required value={l.amount} onChange={(e) => update(i, { amount: e.target.value })} />
            </div>
          </div>
          <div className="row">
            <div className="field" style={{ flex: 2 }}>
              <label>Description</label>
              <input required value={l.description} onChange={(e) => update(i, { description: e.target.value })} />
            </div>
            <div className="field">
              <label>Receipt (photo or PDF, up to 5 MB)</label>
              {l.receipt_path ? (
                <div>
                  {l.receipt_name}{" "}
                  <button type="button" className="secondary small" onClick={() => update(i, { receipt_path: "", receipt_name: "" })}>
                    Remove
                  </button>
                </div>
              ) : (
                <input type="file" accept="application/pdf,image/*" disabled={uploading === i} onChange={(e) => uploadReceipt(i, e.target.files?.[0])} />
              )}
              {uploading === i && <div className="muted small">Uploading...</div>}
            </div>
          </div>
          {lines.length > 1 && (
            <button type="button" className="secondary small" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
              Remove line
            </button>
          )}
        </div>
      ))}
      <button type="button" className="secondary" onClick={() => setLines((ls) => [...ls, blank()])}>
        + Add another line
      </button>
      <p style={{ marginTop: 14 }}>
        <strong>Total: {money(total)}</strong>
      </p>

      <div className="field">
        <label className="check">
          <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
          <span>I declare these expenses are genuine, business-related, and have not been claimed before.</span>
        </label>
      </div>
      <ErrorList errors={errors} />
      <button type="submit" disabled={busy || uploading !== null}>
        {busy ? "Submitting..." : "Submit claim"}
      </button>
    </form>
  );
}
