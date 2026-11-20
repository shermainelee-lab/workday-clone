import { notFound } from "next/navigation";
import { Flags, Flash, PageHeader, StatusBadge } from "@/components/badges";
import { SubmitButton } from "@/components/ui";
import { Timeline } from "@/components/timeline";
import { requireMe } from "@/lib/session";
import { firstParam, money, sgDate, sgDateTime } from "@/lib/utils";
import { cancelClaim } from "../actions";

export default async function ClaimDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase, me } = await requireMe();
  if (!me) return null;

  const { data: c } = await supabase
    .from("claims")
    .select(
      "*, employee:employees!claims_employee_id_fkey(full_name), approver:employees!claims_approver_id_fkey(full_name), claim_lines(id, line_no, expense_date, description, receipt_no, amount, claim_categories(name))"
    )
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  const { data: events } = await supabase
    .from("request_events")
    .select("id, action, remark, created_at, actor:employees(full_name)")
    .eq("entity_type", "claim")
    .eq("entity_id", id)
    .order("created_at");

  const lines = [...(c.claim_lines ?? [])].sort((a: { line_no: number }, b: { line_no: number }) => a.line_no - b.line_no);
  const canCancel = c.employee_id === me.id && c.status === "pending";

  return (
    <>
      <PageHeader
        title={c.ref}
        subtitle={`${(c.employee as { full_name: string } | null)?.full_name} · ${c.description} · submitted ${sgDateTime(c.submitted_at)}`}
        action={<StatusBadge status={c.status} />}
      />
      <Flash ok={firstParam(sp.ok)} err={firstParam(sp.err)} />
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card overflow-x-auto lg:col-span-2">
          <table className="w-full">
            <thead className="border-b border-line"><tr><th className="th">#</th><th className="th">Date</th><th className="th">Category</th><th className="th">Description</th><th className="th">Receipt</th><th className="th text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-line">
              {lines.map((l: { id: string; line_no: number; expense_date: string; description: string; receipt_no: string | null; amount: number; claim_categories: { name: string } | null }) => (
                <tr key={l.id}>
                  <td className="td">{l.line_no}</td>
                  <td className="td whitespace-nowrap">{sgDate(l.expense_date)}</td>
                  <td className="td">{l.claim_categories?.name}</td>
                  <td className="td">{l.description}</td>
                  <td className="td">{l.receipt_no ?? "—"}</td>
                  <td className="td text-right">{money(l.amount, c.currency)}</td>
                </tr>
              ))}
              <tr><td colSpan={5} className="td text-right font-semibold">Total</td><td className="td text-right font-semibold">{money(c.total_amount, c.currency)}</td></tr>
            </tbody>
          </table>
          <div className="space-y-3 border-t border-line p-5 text-sm">
            <Flags flags={c.flags} />
            <div>Approver: <b>{(c.approver as { full_name: string } | null)?.full_name ?? "—"}</b></div>
            {c.decision_remark && <div>Approver remark: “{c.decision_remark}”</div>}
            {c.finance_remark && <div>Finance remark: “{c.finance_remark}”</div>}
            {c.paid_on && <div>Paid on <b>{sgDate(c.paid_on)}</b> · ref <b>{c.payment_reference}</b></div>}
            {canCancel && (
              <form action={cancelClaim}>
                <input type="hidden" name="id" value={c.id} />
                <SubmitButton className="btn-secondary">Cancel claim</SubmitButton>
              </form>
            )}
          </div>
        </section>
        <Timeline events={(events ?? []) as never} />
      </div>
    </>
  );
}
