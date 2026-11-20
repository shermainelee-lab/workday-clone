import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEmployee, FINANCE_ROLES } from "@/lib/session";
import { fmtDate, fmtDateTime, money, type Row } from "@/lib/format";
import { Flags, StatusBadge, Timeline } from "@/components/ui";
import { CancelButton, DecisionPanel, FinancePanel } from "@/components/ActionButtons";

export default async function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me } = await requireEmployee();

  const { data } = await supabase
    .from("claims")
    .select(
      "*, employee:employees!claims_employee_id_fkey(full_name), approver:employees!claims_approver_id_fkey(full_name), lines:claim_lines(*, category:claim_categories(name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const c = data as Row;

  const [{ data: events }, { data: people }] = await Promise.all([
    supabase.from("request_events").select("*").eq("entity_type", "claim").eq("entity_id", id).order("id"),
    supabase.from("employees").select("id, full_name"),
  ]);
  const names: Record<string, string> = {};
  (people ?? []).forEach((p) => (names[p.id] = p.full_name));

  const mine = c.employee_id === me.id;
  const canDecide = c.status === "pending" && !mine && (c.approver_id === me.id || c.escalated_to === me.id || ["director", "admin"].includes(me.role));
  const canPay = c.status === "submitted_to_finance" && !mine && FINANCE_ROLES.includes(me.role);
  const lines = [...((c.lines ?? []) as Row[])].sort((a, b) => a.line_no - b.line_no);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {c.ref} <StatusBadge status={c.status} />
          </h1>
          <p className="muted">
            <Link href={mine ? "/claims" : "/approvals"}>&larr; Back</Link>
          </p>
        </div>
      </div>

      <div className="grid cols-2">
        <div>
          <div className="card">
            <h2>Claim</h2>
            <dl className="kv">
              <dt>Claimant</dt>
              <dd>{c.employee?.full_name}</dd>
              <dt>Title</dt>
              <dd>{c.description}</dd>
              <dt>Total</dt>
              <dd>
                <strong>{money(c.total_amount, c.currency)}</strong>
              </dd>
              <dt>Submitted</dt>
              <dd>{fmtDateTime(c.submitted_at)}</dd>
              <dt>Approver</dt>
              <dd>{c.approver?.full_name ?? "-"}</dd>
              {c.decision_remark && (
                <>
                  <dt>Approver remark</dt>
                  <dd>{c.decision_remark}</dd>
                </>
              )}
              {c.status === "paid" && (
                <>
                  <dt>Paid</dt>
                  <dd>
                    {fmtDate(c.paid_on)} &middot; ref {c.payment_reference}
                  </dd>
                </>
              )}
              {c.finance_remark && (
                <>
                  <dt>Finance remark</dt>
                  <dd>{c.finance_remark}</dd>
                </>
              )}
            </dl>
            <Flags flags={c.flags} />
            {mine && c.status === "pending" && <CancelButton kind="claim" id={c.id} label="Cancel claim" />}
          </div>
          <div className="card table-wrap">
            <h2>Expense lines</h2>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Receipt</th>
                  <th className="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.line_no}</td>
                    <td className="nowrap">{fmtDate(l.expense_date)}</td>
                    <td>
                      {l.category?.name}
                      <div className="muted small">{l.description}</div>
                    </td>
                    <td>{l.receipt_no ?? "-"}</td>
                    <td className="right">{Number(l.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          {canDecide && (
            <div className="card">
              <h2>Your decision</h2>
              <DecisionPanel kind="claim" id={c.id} />
            </div>
          )}
          {canPay && (
            <div className="card">
              <h2>Finance</h2>
              <FinancePanel id={c.id} />
            </div>
          )}
          <div className="card">
            <h2>Audit trail</h2>
            <Timeline events={(events ?? []) as Row[]} names={names} />
          </div>
        </div>
      </div>
    </>
  );
}
