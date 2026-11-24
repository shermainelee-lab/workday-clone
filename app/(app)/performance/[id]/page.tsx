import { notFound } from "next/navigation";
import { requireEmployee } from "@/lib/session";
import { fmtDate, fmtDateTime, REVIEW_STATUS as STATUS, type Row } from "@/lib/format";
import { ManagerReviewForm, RATING_LABEL, SelfReviewForm } from "@/components/Performance";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me } = await requireEmployee();

  const { data } = await supabase
    .from("reviews")
    .select(
      "*, cycle:review_cycles(name, status, period_start, period_end, self_due, manager_due), employee:employees!reviews_employee_id_fkey(full_name, job_title), reviewer:employees!reviews_reviewer_id_fkey(full_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const r = data as Row;

  const open = r.cycle?.status === "open";
  const isSelf = r.employee_id === me.id;
  const canSelf = isSelf && open && r.status === "pending_self";
  const canManager = !isSelf && open && r.status === "pending_manager" && (r.reviewer_id === me.id || ["hr", "admin"].includes(me.role));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {r.cycle?.name}: {r.employee?.full_name}
          </h1>
          <p className="muted">
            {r.employee?.job_title ?? "Staff"} &middot; Period {fmtDate(r.cycle?.period_start)} to {fmtDate(r.cycle?.period_end)} &middot; Reviewer {r.reviewer?.full_name ?? "not assigned"} &middot;{" "}
            {STATUS[r.status]}
            {!open && r.status !== "completed" && <> &middot; cycle {r.cycle?.status}</>}
          </p>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>Self review</h2>
          {r.self_submitted_at ? (
            <>
              <p>
                <strong>{RATING_LABEL[r.self_rating]}</strong>
              </p>
              <p style={{ whiteSpace: "pre-wrap" }}>{r.self_comments}</p>
              <p className="muted small">Submitted {fmtDateTime(r.self_submitted_at)}</p>
            </>
          ) : (
            <p className="muted">Not submitted yet{r.cycle?.self_due ? ` (due ${fmtDate(r.cycle.self_due)})` : ""}.</p>
          )}
        </div>
        <div className="card">
          <h2>Manager assessment</h2>
          {r.manager_submitted_at ? (
            <>
              <p>
                <strong>{RATING_LABEL[r.manager_rating]}</strong>
              </p>
              <p style={{ whiteSpace: "pre-wrap" }}>{r.manager_comments}</p>
              <p className="muted small">Submitted {fmtDateTime(r.manager_submitted_at)}</p>
            </>
          ) : (
            <p className="muted">Not submitted yet{r.cycle?.manager_due ? ` (due ${fmtDate(r.cycle.manager_due)})` : ""}.</p>
          )}
        </div>
      </div>

      {canSelf && <SelfReviewForm id={id} />}
      {canManager && <ManagerReviewForm id={id} />}
    </>
  );
}
