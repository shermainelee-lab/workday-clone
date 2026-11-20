import Link from "next/link";
import { redirect } from "next/navigation";
import { requireEmployee, FINANCE_ROLES } from "@/lib/session";
import { fmtDate, money, type Row } from "@/lib/format";
import { Flags, StatusBadge } from "@/components/ui";
import { FinancePanel } from "@/components/ActionButtons";

export default async function FinancePage() {
  const { supabase, me } = await requireEmployee();
  if (!FINANCE_ROLES.includes(me.role)) redirect("/");

  const [queue, paid] = await Promise.all([
    supabase
      .from("claims")
      .select("*, employee:employees!claims_employee_id_fkey(full_name), lines:claim_lines(line_no, receipt_no, amount, description, category:claim_categories(name))")
      .eq("status", "submitted_to_finance")
      .order("decided_at"),
    supabase
      .from("claims")
      .select("id, ref, description, total_amount, currency, paid_on, payment_reference, status, employee:employees!claims_employee_id_fkey(full_name)")
      .eq("status", "paid")
      .order("paid_on", { ascending: false })
      .limit(15),
  ]);
  const rows = (queue.data ?? []) as Row[];
  const total = rows.reduce((s, c) => s + Number(c.total_amount), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Finance: claims to pay</h1>
          <p className="muted">
            {rows.length} approved claim(s) ready for the next payroll &middot; {money(total)}
          </p>
        </div>
        <div className="inline">
          <a className="btn secondary" href="/api/export/claims?status=submitted_to_finance">
            Export queue (CSV)
          </a>
          <a className="btn secondary" href="/api/export/claims?status=paid">
            Export paid (CSV)
          </a>
        </div>
      </div>

      {rows.length === 0 && <div className="card empty">Nothing waiting for payment.</div>}
      {rows.map((c) => (
        <div className="card" key={c.id}>
          <div className="grid cols-2">
            <div>
              <h3>
                <Link href={`/claims/${c.id}`}>{c.ref}</Link> &middot; {c.employee?.full_name}
              </h3>
              <p>
                {c.description} &middot; <strong>{money(c.total_amount, c.currency)}</strong>
              </p>
              <Flags flags={c.flags} />
              <table>
                <tbody>
                  {[...(c.lines ?? [])]
                    .sort((a: Row, b: Row) => a.line_no - b.line_no)
                    .map((l: Row) => (
                      <tr key={l.line_no}>
                        <td>{l.line_no}</td>
                        <td>
                          {l.category?.name}
                          <div className="muted small">{l.description}</div>
                        </td>
                        <td>{l.receipt_no ?? "no receipt"}</td>
                        <td className="right">{Number(l.amount).toFixed(2)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {c.employee_id === me.id ? <div className="alert alert-warn">You cannot pay your own claim.</div> : <FinancePanel id={c.id} />}
          </div>
        </div>
      ))}

      <h2 style={{ marginTop: 24 }}>Recently paid</h2>
      <div className="card table-wrap">
        {(paid.data ?? []).length === 0 ? (
          <p className="empty">No payments recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ref</th>
                <th>Claimant</th>
                <th>Title</th>
                <th>Paid</th>
                <th>Reference</th>
                <th className="right">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(paid.data ?? []).map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/claims/${c.id}`}>{c.ref}</Link>
                  </td>
                  <td>{c.employee?.full_name}</td>
                  <td>{c.description}</td>
                  <td>{fmtDate(c.paid_on)}</td>
                  <td>{c.payment_reference}</td>
                  <td className="right nowrap">{money(c.total_amount, c.currency)}</td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
