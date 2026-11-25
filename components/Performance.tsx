"use client";

import { useState } from "react";
import { useRpc } from "@/components/ActionButtons";
import { useDb } from "@/components/HrForms";
import { ErrorList } from "@/components/ui";
import { fmtDate, type Row } from "@/lib/format";
import { COMPETENCIES, KPI_STATUS, RATING_HELP, RATING_LABEL, KIND_LABEL } from "@/lib/appraisal";

const ratingOptions = [3, 2, 1];

function CompetencyTable({ value, onChange }: { value: Record<string, string>; onChange: (key: string, v: string) => void }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Competency</th>
            <th style={{ minWidth: 190 }}>Rating</th>
          </tr>
        </thead>
        <tbody>
          {COMPETENCIES.map((c) => (
            <tr key={c.key}>
              <td>
                <strong>{c.name}</strong>
                <div className="muted small">{c.hint}</div>
              </td>
              <td>
                <select value={value[c.key] ?? ""} onChange={(e) => onChange(c.key, e.target.value)} required aria-label={c.name}>
                  <option value="">Choose...</option>
                  {ratingOptions.map((n) => (
                    <option key={n} value={n}>
                      {RATING_LABEL[n]}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const toRatings = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v]));

// Sections 1-4: the employee's self-appraisal.
export function SelfAppraisalForm({ id }: { id: string }) {
  const { call, busy, errors } = useRpc();
  const [kpis, setKpis] = useState([
    { objective: "", status: "", evidence: "" },
    { objective: "", status: "", evidence: "" },
    { objective: "", status: "", evidence: "" },
  ]);
  const [comp, setComp] = useState<Record<string, string>>({});
  const [dev, setDev] = useState([
    { area: "", action: "", support: "" },
    { area: "", action: "", support: "" },
  ]);
  const [aspirations, setAspirations] = useState("");
  const setKpi = (i: number, k: string, v: string) => setKpis((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const setDevRow = (i: number, k: string, v: string) => setDev((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!window.confirm("Submit your self-appraisal? You will not be able to change it afterwards.")) return;
        call("save_self_appraisal", {
          p_id: id,
          p_kpis: kpis.filter((k) => k.objective.trim() || k.status || k.evidence.trim()),
          p_comp: toRatings(comp),
          p_dev: dev.filter((d) => d.area.trim() || d.action.trim() || d.support.trim()),
          p_aspirations: aspirations,
        });
      }}
    >
      <h2>Your self-appraisal</h2>
      <ErrorList errors={errors} />

      <h3>Section 1: Key results and work objectives</h3>
      <p className="muted small">Your progress against the objectives you agreed. Leave unused rows blank.</p>
      {kpis.map((k, i) => (
        <div key={i} className="row" style={{ alignItems: "flex-start" }}>
          <div className="field" style={{ flex: 2 }}>
            <label>Objective / KPI {i + 1}</label>
            <textarea value={k.objective} onChange={(e) => setKpi(i, "objective", e.target.value)} />
          </div>
          <div className="field">
            <label>Progress status</label>
            <select value={k.status} onChange={(e) => setKpi(i, "status", e.target.value)}>
              <option value="">Choose...</option>
              {KPI_STATUS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 3 }}>
            <label>Achievements / evidence / comments</label>
            <textarea value={k.evidence} onChange={(e) => setKpi(i, "evidence", e.target.value)} />
          </div>
        </div>
      ))}
      <button type="button" className="secondary small" onClick={() => setKpis((r) => [...r, { objective: "", status: "", evidence: "" }])}>
        Add objective
      </button>

      <h3 style={{ marginTop: 20 }}>Section 2: Core competencies (your self-rating)</h3>
      <CompetencyTable value={comp} onChange={(k, v) => setComp((c) => ({ ...c, [k]: v }))} />

      <h3 style={{ marginTop: 20 }}>Section 3: Training and development needs</h3>
      {dev.map((d, i) => (
        <div key={i} className="row">
          <div className="field">
            <label>Development area / skill</label>
            <input value={d.area} onChange={(e) => setDevRow(i, "area", e.target.value)} />
          </div>
          <div className="field">
            <label>Recommended action (training, coaching, job exposure)</label>
            <input value={d.action} onChange={(e) => setDevRow(i, "action", e.target.value)} />
          </div>
          <div className="field">
            <label>Support required / target timeline</label>
            <input value={d.support} onChange={(e) => setDevRow(i, "support", e.target.value)} />
          </div>
        </div>
      ))}
      <button type="button" className="secondary small" onClick={() => setDev((r) => [...r, { area: "", action: "", support: "" }])}>
        Add row
      </button>

      <h3 style={{ marginTop: 20 }}>Section 4: Areas of interest and career aspirations (optional)</h3>
      <div className="field">
        <textarea value={aspirations} onChange={(e) => setAspirations(e.target.value)} style={{ minHeight: 90 }} />
      </div>
      <button disabled={busy}>Submit self-appraisal</button>
    </form>
  );
}

// Section 2 (supervisor ratings) and Section 5 (overall assessment).
export function SupervisorForm({ id }: { id: string }) {
  const { call, busy, errors } = useRpc();
  const [comp, setComp] = useState<Record<string, string>>({});
  const [rating, setRating] = useState("");
  const [comments, setComments] = useState("");
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        if (window.confirm("Submit your assessment? You will not be able to change it afterwards.")) {
          call("submit_supervisor_assessment", { p_id: id, p_comp: toRatings(comp), p_rating: rating ? Number(rating) : null, p_comments: comments });
        }
      }}
    >
      <h2>Your assessment as supervisor</h2>
      <ErrorList errors={errors} />
      <h3>Section 2: Core competencies (your rating)</h3>
      <CompetencyTable value={comp} onChange={(k, v) => setComp((c) => ({ ...c, [k]: v }))} />
      <h3 style={{ marginTop: 20 }}>Section 5: Overall assessment</h3>
      <OverallFields rating={rating} setRating={setRating} comments={comments} setComments={setComments} />
      <button disabled={busy}>Submit assessment</button>
    </form>
  );
}

function OverallFields({ rating, setRating, comments, setComments }: { rating: string; setRating: (v: string) => void; comments: string; setComments: (v: string) => void }) {
  return (
    <>
      <div className="field">
        <label>Proposed overall rating</label>
        <select value={rating} onChange={(e) => setRating(e.target.value)} required>
          <option value="">Choose...</option>
          {ratingOptions.map((n) => (
            <option key={n} value={n}>
              {RATING_LABEL[n]}
            </option>
          ))}
        </select>
        {rating && <div className="muted small">{RATING_HELP[Number(rating)]}</div>}
      </div>
      <div className="field">
        <label>Overall assessment and supporting reasons</label>
        <textarea value={comments} onChange={(e) => setComments(e.target.value)} required style={{ minHeight: 110 }} />
      </div>
    </>
  );
}

export function EdForm({ id }: { id: string }) {
  const { call, busy, errors } = useRpc();
  const [rating, setRating] = useState("");
  const [comments, setComments] = useState("");
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        if (window.confirm("Submit your assessment? You will not be able to change it afterwards.")) {
          call("submit_ed_assessment", { p_id: id, p_rating: rating ? Number(rating) : null, p_comments: comments });
        }
      }}
    >
      <h2>Executive Director's overall assessment</h2>
      <ErrorList errors={errors} />
      <OverallFields rating={rating} setRating={setRating} comments={comments} setComments={setComments} />
      <button disabled={busy}>Submit assessment</button>
    </form>
  );
}

// Section 6: record the discussion and agree the next period's objectives.
export function DiscussionForm({ id }: { id: string }) {
  const { call, busy, errors } = useRpc();
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [next, setNext] = useState([
    { objective: "", outcome: "", target: "" },
    { objective: "", outcome: "", target: "" },
    { objective: "", outcome: "", target: "" },
  ]);
  const setRow = (i: number, k: string, v: string) => setNext((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        call("record_discussion", { p_id: id, p_date: date || null, p_notes: notes, p_next: next.filter((n) => n.objective.trim() || n.outcome.trim() || n.target.trim()) });
      }}
    >
      <h2>Record the appraisal discussion</h2>
      <p className="muted small">Hold the discussion with the employee, then record it here. Everyone then signs off.</p>
      <ErrorList errors={errors} />
      <div className="field">
        <label>Date of appraisal discussion</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <h3>Section 6: Objectives for the next appraisal period</h3>
      {next.map((n, i) => (
        <div key={i} className="row">
          <div className="field" style={{ flex: 2 }}>
            <label>Key responsibility / objective</label>
            <input value={n.objective} onChange={(e) => setRow(i, "objective", e.target.value)} />
          </div>
          <div className="field" style={{ flex: 2 }}>
            <label>Expected outcome / KPI</label>
            <input value={n.outcome} onChange={(e) => setRow(i, "outcome", e.target.value)} />
          </div>
          <div className="field">
            <label>Target / timeline</label>
            <input value={n.target} onChange={(e) => setRow(i, "target", e.target.value)} />
          </div>
        </div>
      ))}
      <button type="button" className="secondary small" onClick={() => setNext((r) => [...r, { objective: "", outcome: "", target: "" }])}>
        Add objective
      </button>
      <div className="field" style={{ marginTop: 12 }}>
        <label>Discussion notes / agreed follow-up actions</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button disabled={busy}>Save discussion</button>
    </form>
  );
}

// Section 7: acknowledgement. The employee's sign-off confirms receipt and discussion, not necessarily agreement.
export function AckButton({ id, label }: { id: string; label: string }) {
  const { call, busy, errors } = useRpc();
  return (
    <div className="card">
      <h2>Section 7: Sign off</h2>
      <p className="muted small">By signing off, you acknowledge that the appraisal has been discussed. An employee's sign-off confirms receipt and discussion and does not necessarily indicate agreement with every assessment or comment.</p>
      <ErrorList errors={errors} />
      <button disabled={busy} onClick={() => window.confirm("Sign off this appraisal?") && call("acknowledge_review", { p_id: id })}>
        {label}
      </button>
    </div>
  );
}

// HR: attach the signed paper form and final rating to a past appraisal.
export function HistoricalResultForm({ id, final, hasFile }: { id: string; final: number | null; hasFile: boolean }) {
  const { supabase, errors: dbErrors, setErrors } = useDb();
  const { call, busy, errors } = useRpc();
  const [rating, setRating] = useState(final ? String(final) : "");
  const [uploading, setUploading] = useState(false);
  return (
    <div className="card">
      <h2>Past appraisal record</h2>
      <p className="muted small">Attach the signed form and enter the final overall rating from the paper appraisal.</p>
      <ErrorList errors={[...errors, ...dbErrors]} />
      <div className="row">
        <div className="field">
          <label>Final overall rating</label>
          <select value={rating} onChange={(e) => setRating(e.target.value)}>
            <option value="">Not set</option>
            {ratingOptions.map((n) => (
              <option key={n} value={n}>
                {RATING_LABEL[n]}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 2 }}>
          <label>{hasFile ? "Replace the signed form" : "Signed form"} (PDF, Word or photo, up to 10 MB)</label>
          <input
            type="file"
            accept=".pdf,.docx,image/*"
            disabled={uploading || busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setErrors([]);
              if (f.size > 10 * 1024 * 1024) {
                setErrors(["The file is larger than 10 MB."]);
                return;
              }
              setUploading(true);
              const path = `${id}/${Date.now()}-${f.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80)}`;
              const { error } = await supabase.storage.from("appraisal-forms").upload(path, f, { contentType: f.type || undefined });
              setUploading(false);
              if (error) {
                setErrors([`Could not upload the file: ${error.message}`]);
                return;
              }
              call("set_historical_result", { p_id: id, p_final: rating ? Number(rating) : null, p_file: path });
            }}
          />
        </div>
      </div>
      <button className="secondary" disabled={busy || uploading} onClick={() => call("set_historical_result", { p_id: id, p_final: rating ? Number(rating) : null, p_file: null })}>
        Save rating
      </button>
    </div>
  );
}

// Personal goals: the person edits their own; HR can edit anyone's.
export function GoalManager({ employeeId, goals, canEdit }: { employeeId: string; goals: Row[]; canEdit: boolean }) {
  const { supabase, run, errors, busy } = useDb();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  return (
    <div>
      <ErrorList errors={errors} />
      {goals.length === 0 ? (
        <p className="empty">No goals yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Goal</th>
                <th>Due</th>
                <th>Progress</th>
                <th>Status</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {goals.map((g) => (
                <tr key={g.id}>
                  <td>{g.title}</td>
                  <td className="nowrap">{fmtDate(g.due_date)}</td>
                  <td style={{ minWidth: 150 }}>
                    {canEdit ? (
                      <select
                        value={g.progress}
                        disabled={busy}
                        onChange={(e) => run(() => supabase.from("goals").update({ progress: Number(e.target.value) }).eq("id", g.id))}
                        aria-label="Progress"
                      >
                        {[0, 25, 50, 75, 100].map((n) => (
                          <option key={n} value={n}>
                            {n}%
                          </option>
                        ))}
                      </select>
                    ) : (
                      `${g.progress}%`
                    )}
                  </td>
                  <td>
                    {canEdit ? (
                      <select
                        value={g.status}
                        disabled={busy}
                        onChange={(e) => run(() => supabase.from("goals").update({ status: e.target.value }).eq("id", g.id))}
                        aria-label="Status"
                      >
                        <option value="active">Active</option>
                        <option value="achieved">Achieved</option>
                        <option value="dropped">Dropped</option>
                      </select>
                    ) : (
                      g.status
                    )}
                  </td>
                  {canEdit && (
                    <td className="right">
                      <button className="secondary small" disabled={busy} onClick={() => window.confirm("Delete this goal?") && run(() => supabase.from("goals").delete().eq("id", g.id))}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && (
        <form
          className="row"
          style={{ marginTop: 12, alignItems: "flex-end" }}
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => supabase.from("goals").insert({ employee_id: employeeId, title: title.trim(), due_date: due || null }));
            if (ok) {
              setTitle("");
              setDue("");
            }
          }}
        >
          <div className="field" style={{ flex: 3 }}>
            <label>New goal</label>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>Due (optional)</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button disabled={busy}>Add goal</button>
          </div>
        </form>
      )}
    </div>
  );
}

// HR: create review cycles, launch them (creates one review per active person) and close them.
export function CycleManager({ cycles }: { cycles: Row[] }) {
  const { supabase, run, errors, busy } = useDb();
  const { call, busy: rpcBusy, errors: rpcErrors } = useRpc();
  const blank = { name: "", kind: "year_end", period_start: "", period_end: "", self_due: "", manager_due: "" };
  const [hist, setHist] = useState({ name: "", kind: "year_end", period_start: "", period_end: "" });
  const [f, setF] = useState(blank);
  const set = (k: keyof typeof blank, v: string) => setF((s) => ({ ...s, [k]: v }));
  const working = busy || rpcBusy;

  return (
    <div>
      <ErrorList errors={[...errors, ...rpcErrors]} />
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(() =>
            supabase.from("review_cycles").insert({
              name: f.name.trim(),
              kind: f.kind,
              period_start: f.period_start,
              period_end: f.period_end,
              self_due: f.self_due || null,
              manager_due: f.manager_due || null,
            }),
          );
          if (ok) setF(blank);
        }}
      >
        <h3>New review cycle</h3>
        <div className="row">
          <div className="field" style={{ flex: 2 }}>
            <label>Name</label>
            <input required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Year-End Review Nov 2027" />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={f.kind} onChange={(e) => set("kind", e.target.value)}>
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Period start</label>
            <input type="date" required value={f.period_start} onChange={(e) => set("period_start", e.target.value)} />
          </div>
          <div className="field">
            <label>Period end</label>
            <input type="date" required value={f.period_end} onChange={(e) => set("period_end", e.target.value)} />
          </div>
          <div className="field">
            <label>Self review due</label>
            <input type="date" value={f.self_due} onChange={(e) => set("self_due", e.target.value)} />
          </div>
          <div className="field">
            <label>Supervisor assessment due</label>
            <input type="date" value={f.manager_due} onChange={(e) => set("manager_due", e.target.value)} />
          </div>
        </div>
        <button disabled={working}>Create draft</button>
      </form>

      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          await call("create_historical_cycle", { p_name: hist.name, p_kind: hist.kind, p_start: hist.period_start || null, p_end: hist.period_end || null });
        }}
      >
        <h3>Add a past appraisal done on paper</h3>
        <p className="muted small">Creates a closed cycle with one record per person. Open each person to attach their signed form and final rating.</p>
        <div className="row">
          <div className="field" style={{ flex: 2 }}>
            <label>Name</label>
            <input required value={hist.name} onChange={(e) => setHist({ ...hist, name: e.target.value })} placeholder="Year-End Review Nov 2026" />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={hist.kind} onChange={(e) => setHist({ ...hist, kind: e.target.value })}>
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Period start</label>
            <input type="date" required value={hist.period_start} onChange={(e) => setHist({ ...hist, period_start: e.target.value })} />
          </div>
          <div className="field">
            <label>Period end</label>
            <input type="date" required value={hist.period_end} onChange={(e) => setHist({ ...hist, period_end: e.target.value })} />
          </div>
        </div>
        <button className="secondary" disabled={working}>
          Create past appraisal cycle
        </button>
      </form>

      <div className="card table-wrap">
        <h3>Cycles</h3>
        {cycles.length === 0 ? (
          <p className="empty">No cycles yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Cycle</th>
                <th>Period</th>
                <th>Status</th>
                <th>Reviews</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cycles.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.name}
                    <div className="muted small">
                      {c.is_historical ? "Past appraisal (paper)" : `${KIND_LABEL[c.kind] ?? ""} · Self ${fmtDate(c.self_due)} · Supervisor ${fmtDate(c.manager_due)}`}
                    </div>
                  </td>
                  <td className="nowrap">
                    {fmtDate(c.period_start)} to {fmtDate(c.period_end)}
                  </td>
                  <td>
                    <span className={`badge badge-${c.status === "open" ? "pending" : c.status === "closed" ? "approved" : "cancelled"}`}>{c.status}</span>
                  </td>
                  <td className="small">
                    {c.total ? (c.is_historical ? `${c.total} people` : `${c.completed} complete, ${c.in_progress} in progress, ${c.pending_self} awaiting self-appraisal`) : "-"}
                  </td>
                  <td className="right nowrap">
                    {c.status === "draft" && (
                      <>
                        <button
                          className="small"
                          disabled={working}
                          onClick={() =>
                            window.confirm("Launch this cycle? An appraisal is created for every active staff member and they are notified.") &&
                            call("launch_review_cycle", { p_cycle: c.id })
                          }
                        >
                          Launch
                        </button>{" "}
                        <button className="secondary small" disabled={working} onClick={() => window.confirm("Delete this draft?") && run(() => supabase.from("review_cycles").delete().eq("id", c.id))}>
                          Delete
                        </button>
                      </>
                    )}
                    {c.status === "open" && (
                      <button className="secondary small" disabled={working} onClick={() => window.confirm("Close this cycle? Open reviews can no longer be submitted.") && call("close_review_cycle", { p_cycle: c.id })}>
                        Close
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
