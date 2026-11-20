import Link from "next/link";
import { requireEmployee } from "@/lib/session";
import { days, fmtDateTime, fmtRange, money, type Row } from "@/lib/format";
import { Flags, StatusBadge } from "@/components/ui";
import { DecisionPanel } from "@/components/ActionButtons";

export default async function ApprovalsPage() {
  const { supabase, me } = await requireEmployee();
  const canOverride = ["director", "admin"].includes(me.role);
  const decidable = (r: Row) => r.employee_id !== me.id && (r.approver_id === me.id || r.escalated_to === me.id || canOverride);

  const [leaveQ, claimQ, doneLeave, doneClaims] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("*, leave_type:leave_types(name), employee:employees!leave_requests_employee_id_fkey(full_name)")
      .eq("status", "pending")
      .order("submitted_at"),
    supabase
      .from("claims")
      .select("*, employee:employees!claims_employee_id_fkey(full_name), lines:claim_lines(line_no, expense_date, description, receipt_no, amount, category:claim_categories(name))")
      .eq("status", "pending")
      .order("submitted_at"),
    supabase
      .from("leave_requests")
      .select("id, ref, start_date, end_date, status, decided_at, employee:employees!leave_requests_employee_id_fkey(full_name)")
      .eq("decided_by", me.id)
      .order("decided_at", { ascending: false })
      .limit(8),
    supabase
      .from("claims")
      .select("id, ref, description, status, decided_at, employee:employees!claims_employee_id_fkey(full_name)")
      .eq("decided_by", me.id)
      .order("decided_at", { ascending: false })
      .limit(8),
  ]);

  const leaves = ((leaveQ.data ?? []) as Row[]).filter(decidable);
  const claims = ((claimQ.data ?? []) as Row[]).filter(decidable);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Approvals</h1>
          <p className="muted">Requests waiting for your decision. Please decide within 1 working day; unanswered requests escalate after 2.</p>
        </div>
      </div>

      <h2>Leave ({leaves.length})</h2>
      {leaves.length === 0 && <div className="card empty">No leave requests waiting for you.</div>}
      {leaves.map((r) => {
        const clashes = (r.clashes ?? []) as { name: string; start: string; end: string; status: string; ref: string }[];
        return (
          <div className="card" key={r.id}>
            <div className="grid cols-2">
              <div>
                <h3>
                  <Link href={`/leave/${r.id}`}>{r.ref}</Link> &middot; {r.employee?.full_name}
                </h3>
                <dl className="kv">
                  <dt>Type</dt>
                  <dd>{r.leave_type?.name}</dd>
                  <dt>Dates</dt>
                  <dd>
                    {fmtRange(r.start_date, r.end_date)} ({days(r.days)} day(s))
                  </dd>
                  <dt>Balance</dt>
                  <dd>
                    {days(r.balance_before)} &rarr; {days(r.balance_after)} after
                  </dd>
                  <dt>Reason</dt>
                  <dd>{r.reason ?? "-"}</dd>
                  <dt>Submitted</dt>
                  <dd>{fmtDateTime(r.submitted_at)}</dd>
                </dl>
                <Flags flags={r.flags} />
                {r.escalated_at && <div className="alert alert-warn">Escalated to you: not answered within 2 working days.</div>}
                {clashes.length > 0 && (
                  <div className="alert alert-info">
                    <strong>Team clash:</strong>
                    <ul>
                      {clashes.map((c) => (
                        <li key={c.ref}>
                          {c.name}, {fmtRange(c.start, c.end)} ({c.status})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <DecisionPanel kind="leave" id={r.id} />
            </div>
          </div>
        );
      })}

      <h2 style={{ marginTop: 24 }}>Claims ({claims.length})</h2>
      {claims.length === 0 && <div className="card empty">No claims waiting for you.</div>}
      {claims.map((c) => (
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
              <div className="table-wrap">
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
                    {[...(c.lines ?? [])]
                      .sort((a: Row, b: Row) => a.line_no - b.line_no)
                      .map((l: Row) => (
                        <tr key={l.line_no}>
                          <td>{l.line_no}</td>
                          <td className="nowrap">{l.expense_date}</td>
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
            <DecisionPanel kind="claim" id={c.id} />
          </div>
        </div>
      ))}

      <h2 style={{ marginTop: 24 }}>Recently decided by you</h2>
      <div className="card table-wrap">
        {(doneLeave.data ?? []).length + (doneClaims.data ?? []).length === 0 ? (
          <p className="empty">Nothing yet.</p>
        ) : (
          <table>
            <tbody>
              {(doneLeave.data ?? []).map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/leave/${r.id}`}>{r.ref}</Link>
                  </td>
                  <td>{r.employee?.full_name}</td>
                  <td>{fmtRange(r.start_date, r.end_date)}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="muted small">{fmtDateTime(r.decided_at)}</td>
                </tr>
              ))}
              {(doneClaims.data ?? []).map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/claims/${c.id}`}>{c.ref}</Link>
                  </td>
                  <td>{c.employee?.full_name}</td>
                  <td>{c.description}</td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="muted small">{fmtDateTime(c.decided_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
