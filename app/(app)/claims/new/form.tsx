"use client";
import { useActionState, useMemo, useState } from "react";
import { SubmitButton } from "@/components/ui";
import { submitClaim } from "../actions";
import type { FormState } from "../../leave/actions";

type Category = { id: string; name: string; per_line_limit: number | null; requires_receipt: boolean };
type Line = { expense_date: string; category_id: string; description: string; receipt_no: string; amount: string };

export default function ClaimForm({ categories, today }: { categories: Category[]; today: string }) {
  const [state, action] = useActionState<FormState, FormData>(submitClaim, null);
  const blank = (): Line => ({ expense_date: today, category_id: categories[0]?.id ?? "", description: "", receipt_no: "", amount: "" });
  const [lines, setLines] = useState<Line[]>([blank()]);

  const total = useMemo(() => lines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [lines]);
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="lines" value={JSON.stringify(lines.map((l) => ({ ...l, amount: Number(l.amount) })))} />
      <div className="card p-5">
        <label className="label" htmlFor="description">Claim title</label>
        <input id="description" name="description" className="input" placeholder="e.g. Client visit — November" required />
      </div>

      <div className="card overflow-x-auto">
        <div className="card-header"><h2 className="card-title">Expense lines</h2></div>
        <table className="w-full min-w-[820px]">
          <thead className="border-b border-line">
            <tr><th className="th">Date</th><th className="th">Category</th><th className="th">Description</th><th className="th">Receipt no.</th><th className="th">Amount (SGD)</th><th className="th" /></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l, i) => {
              const cat = categories.find((c) => c.id === l.category_id);
              return (
                <tr key={i} className="align-top">
                  <td className="td"><input type="date" max={today} className="input" value={l.expense_date} onChange={(e) => set(i, { expense_date: e.target.value })} /></td>
                  <td className="td">
                    <select className="input" value={l.category_id} onChange={(e) => set(i, { category_id: e.target.value })}>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {cat?.per_line_limit != null && <div className="mt-1 text-xs text-muted">Limit SGD {cat.per_line_limit}</div>}
                  </td>
                  <td className="td"><input className="input" value={l.description} onChange={(e) => set(i, { description: e.target.value })} /></td>
                  <td className="td">
                    <input className="input" value={l.receipt_no} onChange={(e) => set(i, { receipt_no: e.target.value })} placeholder={cat?.requires_receipt ? "Required" : "Optional"} />
                  </td>
                  <td className="td"><input type="number" step="0.01" min="0" className="input" value={l.amount} onChange={(e) => set(i, { amount: e.target.value })} /></td>
                  <td className="td">
                    {lines.length > 1 && (
                      <button type="button" className="text-xs font-semibold text-red-600" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Remove</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <button type="button" className="btn-secondary" onClick={() => setLines((ls) => [...ls, blank()])}>+ Add line</button>
          <div className="text-sm">Total <b className="text-lg">SGD {total.toFixed(2)}</b></div>
        </div>
      </div>

      <div className="card space-y-3 p-5">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="declaration" className="mt-1" />
          <span>I declare that these expenses are genuine, business-related, and have not been claimed before.</span>
        </label>
        {state?.errors?.length ? (
          <ul className="space-y-1 rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
            {state.errors.map((e) => <li key={e}>• {e}</li>)}
          </ul>
        ) : null}
        <SubmitButton pendingText="Submitting…">Submit claim</SubmitButton>
      </div>
    </form>
  );
}
