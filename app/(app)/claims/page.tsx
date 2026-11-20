import Link from "next/link";
import { requireEmployee } from "@/lib/session";
import { fmtDate, money } from "@/lib/format";
import { Flags, StatusBadge } from "@/components/ui";

export default async function MyClaimsPage() {
  const { supabase, me } = await requireEmployee();
  const { data } = await supabase
    .from("claims")
    .select("id, ref, description, total_amount, currency, status, flags, submitted_at, paid_on, payment_reference, finance_remark, decision_remark")
    .eq("employee_id", me.id)
    .order("submitted_at", { ascending: false });
  const rows = data ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My claims</h1>
          <p className="muted">Track each claim from approval through to payment.</p>
        </div>
        <Link className="btn" href="/claims/new">
          New claim
        </Link>
      </div>
      <div className="card table-wrap">
        {rows.length === 0 ? (
          <p className="empty">No claims yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ref</th>
                <th>Title</th>
                <th>Submitted</th>
                <th className="right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/claims/${c.id}`}>{c.ref}</Link>
                  </td>
                  <td>
                    {c.description}
                    <Flags flags={c.flags} />
                  </td>
                  <td className="nowrap">{fmtDate(c.submitted_at)}</td>
                  <td className="right nowrap">{money(c.total_amount, c.currency)}</td>
                  <td>
                    <StatusBadge status={c.status} />
                    {c.status === "paid" && (
                      <div className="small muted">
                        {fmtDate(c.paid_on)} &middot; {c.payment_reference}
                      </div>
                    )}
                    {c.status === "returned" && c.finance_remark && <div className="small muted">{c.finance_remark}</div>}
                    {c.status === "rejected" && c.decision_remark && <div className="small muted">{c.decision_remark}</div>}
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
