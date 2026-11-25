import { notFound } from "next/navigation";
import { requireEmployee } from "@/lib/session";
import { fmtDate, fmtDateTime, REVIEW_STATUS as STATUS, type Row } from "@/lib/format";
import { AckButton, DiscussionForm, EdForm, HistoricalResultForm, SelfAppraisalForm, SupervisorForm } from "@/components/Performance";
import { COMPETENCIES, KIND_LABEL, RATING_LABEL } from "@/lib/appraisal";

const rate = (n: number | null | undefined) => (n ? RATING_LABEL[n] : "-");

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me } = await requireEmployee();

  const { data } = await supabase
    .from("reviews")
    .select(
      "*, cycle:review_cycles(name, kind, status, is_historical, period_start, period_end, self_due, manager_due), employee:employees!reviews_employee_id_fkey(full_name, job_title), reviewer:employees!reviews_reviewer_id_fkey(full_name), ed:employees!reviews_ed_id_fkey(full_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const r = data as Row;
  // The supervisor and ED assessments are hidden from the employee until the discussion stage (the database enforces this).
  const { data: assessment } = await supabase.from("review_assessments").select("*").eq("review_id", id).maybeSingle();
  const a = (assessment ?? null) as Row | null;

  const signedUrl: string | null = r.signed_file_path
    ? ((await supabase.storage.from("appraisal-forms").createSignedUrl(r.signed_file_path, 300)).data?.signedUrl ?? null)
    : null;

  const historical = !!r.cycle?.is_historical;
  const open = r.cycle?.status === "open";
  const isSelf = r.employee_id === me.id;
  const isSupervisor = !isSelf && (r.reviewer_id === me.id || me.role === "hr");
  const isEd = r.ed_id === me.id && !isSelf;
  const canSelf = isSelf && open && r.status === "pending_self";
  const canSupervisor = isSupervisor && open && r.status === "pending_supervisor";
  const canEd = isEd && open && r.status === "pending_ed";
  const discussing = r.status === "pending_discussion";
  const canDiscuss = isSupervisor && discussing && !r.ack_employee_at && !r.ack_supervisor_at && !r.ack_ed_at;
  const myAckDone = isSelf ? r.ack_employee_at : isEd ? r.ack_ed_at : isSupervisor ? r.ack_supervisor_at : true;
  const canAck = discussing && !!r.discussion_date && !myAckDone && (isSelf || isEd || isSupervisor);
  const ackLabel = isSelf ? "I acknowledge this appraisal" : isEd ? "Sign off as Executive Director" : "Sign off as supervisor";
  const kpis = (r.kpis ?? []) as Row[];
  const dev = (r.dev_needs ?? []) as Row[];
  const next = (r.next_objectives ?? []) as Row[];
  const hasSelf = !!r.self_submitted_at;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {r.cycle?.name}: {r.employee?.full_name}
          </h1>
          <p className="muted">
            {r.employee?.job_title ?? "Staff"} &middot; {KIND_LABEL[r.cycle?.kind] ?? ""} &middot; Period {fmtDate(r.cycle?.period_start)} to {fmtDate(r.cycle?.period_end)} &middot; Supervisor{" "}
            {r.reviewer?.full_name ?? "not assigned"}
            {r.ed && <> &middot; Executive Director {r.ed.full_name}</>} &middot; {STATUS[r.status]}
            {!open && r.status !== "completed" && <> &middot; cycle {r.cycle?.status}</>}
          </p>
        </div>
      </div>

      {historical && (
        <div className="card">
          <h2>Past appraisal</h2>
          <dl className="kv">
            <dt>Final overall rating</dt>
            <dd>{rate(r.final_rating)}</dd>
            <dt>Signed form</dt>
            <dd>
              {r.signed_file_path ? (
                signedUrl ? (
                  <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                    Open the signed form
                  </a>
                ) : (
                  "Attached"
                )
              ) : (
                "Not attached yet"
              )}
            </dd>
          </dl>
        </div>
      )}
      {historical && me.role === "hr" && <HistoricalResultForm id={id} final={r.final_rating} hasFile={!!r.signed_file_path} />}

      {!historical && (
        <>
          {r.status === "completed" && (
            <div className="alert alert-ok">
              Complete. Final overall rating: <strong>{rate(r.final_rating)}</strong>
            </div>
          )}

          {hasSelf && (
            <div className="card">
              <h2>Section 1: Key results and work objectives</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Objective / KPI</th>
                      <th>Progress status</th>
                      <th>Achievements / evidence / comments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.map((k, i) => (
                      <tr key={i}>
                        <td style={{ whiteSpace: "pre-wrap" }}>{k.objective}</td>
                        <td>{k.status}</td>
                        <td style={{ whiteSpace: "pre-wrap" }}>{k.evidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted small">Submitted {fmtDateTime(r.self_submitted_at)}</p>
            </div>
          )}

          {hasSelf && (
            <div className="card">
              <h2>Section 2: Core competencies</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Competency</th>
                      <th>Self-rating</th>
                      <th>Supervisor rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPETENCIES.map((c) => (
                      <tr key={c.key}>
                        <td>{c.name}</td>
                        <td>{rate(Number(r.self_competencies?.[c.key]))}</td>
                        <td>{a ? rate(Number(a.sup_competencies?.[c.key])) : <span className="muted">Not shown yet</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {hasSelf && (dev.length > 0 || r.aspirations) && (
            <div className="card">
              {dev.length > 0 && (
                <>
                  <h2>Section 3: Training and development needs</h2>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Development area / skill</th>
                          <th>Recommended action</th>
                          <th>Support required / target timeline</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dev.map((d, i) => (
                          <tr key={i}>
                            <td>{d.area}</td>
                            <td>{d.action}</td>
                            <td>{d.support}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {r.aspirations && (
                <>
                  <h2 style={{ marginTop: dev.length ? 16 : 0 }}>Section 4: Areas of interest and career aspirations</h2>
                  <p style={{ whiteSpace: "pre-wrap" }}>{r.aspirations}</p>
                </>
              )}
            </div>
          )}

          <div className="card">
            <h2>Section 5: Overall performance assessment</h2>
            {a ? (
              <dl className="kv">
                <dt>Supervisor's proposed rating</dt>
                <dd>
                  <strong>{rate(a.sup_rating)}</strong>
                  <div style={{ whiteSpace: "pre-wrap" }}>{a.sup_comments}</div>
                </dd>
                {r.ed_id && (
                  <>
                    <dt>Executive Director's proposed rating</dt>
                    <dd>
                      {a.ed_rating ? (
                        <>
                          <strong>{rate(a.ed_rating)}</strong>
                          <div style={{ whiteSpace: "pre-wrap" }}>{a.ed_comments}</div>
                        </>
                      ) : (
                        <span className="muted">Not submitted yet</span>
                      )}
                    </dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="muted">
                {isSelf ? "The assessments are shown to you at the discussion stage." : "Not submitted yet"}
                {r.cycle?.manager_due ? ` (supervisor due ${fmtDate(r.cycle.manager_due)})` : ""}.
              </p>
            )}
          </div>

          {r.discussion_date && (
            <div className="card">
              <h2>Section 6: Objectives for the next appraisal period</h2>
              <p className="muted small">Discussion held {fmtDate(r.discussion_date)}</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Key responsibility / objective</th>
                      <th>Expected outcome / KPI</th>
                      <th>Target / timeline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {next.map((n, i) => (
                      <tr key={i}>
                        <td>{n.objective}</td>
                        <td>{n.outcome}</td>
                        <td>{n.target}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {r.discussion_notes && (
                <>
                  <h3>Discussion notes / agreed follow-up actions</h3>
                  <p style={{ whiteSpace: "pre-wrap" }}>{r.discussion_notes}</p>
                </>
              )}
            </div>
          )}

          {(discussing || r.status === "completed") && (
            <div className="card">
              <h2>Section 7: Sign-off</h2>
              <dl className="kv">
                <dt>Employee</dt>
                <dd>{r.ack_employee_at ? `Signed ${fmtDateTime(r.ack_employee_at)}` : "Waiting"}</dd>
                <dt>Supervisor</dt>
                <dd>{r.ack_supervisor_at ? `Signed ${fmtDateTime(r.ack_supervisor_at)}` : "Waiting"}</dd>
                {r.ed_id && (
                  <>
                    <dt>Executive Director</dt>
                    <dd>{r.ack_ed_at ? `Signed ${fmtDateTime(r.ack_ed_at)}` : "Waiting"}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          {!hasSelf && (
            <div className="card">
              <p className="muted">Self-appraisal not submitted yet{r.cycle?.self_due ? ` (due ${fmtDate(r.cycle.self_due)})` : ""}.</p>
            </div>
          )}

          {canSelf && <SelfAppraisalForm id={id} />}
          {canSupervisor && <SupervisorForm id={id} />}
          {canEd && <EdForm id={id} />}
          {canDiscuss && <DiscussionForm id={id} />}
          {canAck && <AckButton id={id} label={ackLabel} />}
        </>
      )}
    </>
  );
}
