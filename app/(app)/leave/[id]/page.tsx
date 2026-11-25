import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEmployee } from "@/lib/session";
import { days, fmtDateTime, fmtRange, todaySG, type Row } from "@/lib/format";
import { ApprovalSteps, Flags, StatusBadge, Timeline } from "@/components/ui";
import { canDecideRequest } from "@/lib/approval";
import { CancelButton, DecisionPanel } from "@/components/ActionButtons";

export default async function LeaveDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me } = await requireEmployee();

  const { data } = await supabase
    .from("leave_requests")
    .select(
      "*, leave_type:leave_types(name, code), employee:employees!leave_requests_employee_id_fkey(full_name, job_title), approver:employees!leave_requests_approver_id_fkey(full_name), first_approver:employees!leave_requests_first_decided_by_fkey(full_name), decider:employees!leave_requests_decided_by_fkey(full_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const r = data as Row;

  const [{ data: events }, { data: people }] = await Promise.all([
    supabase.from("request_events").select("*").eq("entity_type", "leave").eq("entity_id", id).order("id"),
    supabase.from("employees").select("id, full_name"),
  ]);
  const names: Record<string, string> = {};
  (people ?? []).forEach((p) => (names[p.id] = p.full_name));

  const mine = r.employee_id === me.id;
  const canDecide = canDecideRequest(r, me);
  const canCancel = (mine || me.role === "hr") && (r.status === "pending" || (r.status === "approved" && r.end_date >= todaySG()));
  const clashes = (r.clashes ?? []) as { name: string; start: string; end: string; status: string; ref: string }[];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {r.ref} <StatusBadge status={r.status} />
          </h1>
          <p className="muted">
            <Link href={mine ? "/leave" : "/approvals"}>&larr; Back</Link>
          </p>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>Request</h2>
          <dl className="kv">
            <dt>Employee</dt>
            <dd>{r.employee?.full_name}</dd>
            <dt>Leave type</dt>
            <dd>{r.leave_type?.name}</dd>
            <dt>Dates</dt>
            <dd>
              {fmtRange(r.start_date, r.end_date)}
              {r.day_part !== "full" ? ` (${r.day_part === "am" ? "morning" : "afternoon"} only)` : ""}
            </dd>
            <dt>Working days</dt>
            <dd>{days(r.days)}</dd>
            <dt>Balance</dt>
            <dd>
              {days(r.balance_before)} before &rarr; {days(r.balance_after)} after
            </dd>
            {r.mc_number && (
              <>
                <dt>MC number</dt>
                <dd>{r.mc_number}</dd>
              </>
            )}
            <dt>Reason</dt>
            <dd>{r.reason ?? "-"}</dd>
            <dt>Submitted</dt>
            <dd>{fmtDateTime(r.submitted_at)}</dd>
            <dt>Approver</dt>
            <dd>{r.approver?.full_name ?? "-"}</dd>
            {r.decided_at && (
              <>
                <dt>Decision</dt>
                <dd>
                  {r.decider?.full_name} on {fmtDateTime(r.decided_at)}
                  {r.decision_remark ? ` - "${r.decision_remark}"` : ""}
                </dd>
              </>
            )}
          </dl>
          {r.flags?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h3>Flags for the approver</h3>
              <Flags flags={r.flags} />
            </div>
          )}
          {clashes.length > 0 && (
            <div className="alert alert-info" style={{ marginTop: 8 }}>
              <strong>Teammates away on overlapping dates (when submitted):</strong>
              <ul>
                {clashes.map((c) => (
                  <li key={c.ref}>
                    {c.name}, {fmtRange(c.start, c.end)} ({c.status})
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ApprovalSteps r={r} />
          {r.escalated_at && <div className="alert alert-warn">Escalated on {fmtDateTime(r.escalated_at)} after no response.</div>}
          {canCancel && <CancelButton kind="leave" id={r.id} />}
        </div>

        <div>
          {canDecide && (
            <div className="card">
              <h2>Your decision</h2>
              <DecisionPanel kind="leave" id={r.id} />
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
