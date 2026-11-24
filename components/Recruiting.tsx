"use client";

import { useState } from "react";
import { useDb } from "@/components/HrForms";
import { ErrorList } from "@/components/ui";
import { fmtDate, type Row } from "@/lib/format";

export const STAGES = ["applied", "screening", "interview", "offer", "hired", "rejected", "withdrawn"] as const;
export const OPENING_STATUS = ["draft", "open", "on_hold", "filled", "closed"] as const;
const label = (s: string) => s.replace("_", " ").replace(/^./, (c) => c.toUpperCase());

export function Recruiting({ openings, candidates, departments, managers, canEdit }: { openings: Row[]; candidates: Row[]; departments: Row[]; managers: Row[]; canEdit: boolean }) {
  const { supabase, run, errors, busy } = useDb();
  const blank = { title: "", department_id: "", hiring_manager_id: "", headcount: "1", description: "" };
  const [job, setJob] = useState(blank);
  const [cand, setCand] = useState({ job_id: "", full_name: "", email: "", phone: "", source: "" });
  const [selected, setSelected] = useState<string>("");
  const activeId = selected || openings[0]?.id || "";
  const list = candidates.filter((c) => c.job_id === activeId);
  const active = openings.find((o) => o.id === activeId);

  return (
    <div>
      <ErrorList errors={errors} />

      {canEdit && (
        <form
          className="card"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() =>
              supabase.from("job_openings").insert({
                title: job.title.trim(),
                department_id: job.department_id || null,
                hiring_manager_id: job.hiring_manager_id || null,
                headcount: Number(job.headcount || 1),
                description: job.description.trim() || null,
              }),
            );
            if (ok) setJob(blank);
          }}
        >
          <h3>New job opening</h3>
          <div className="row">
            <div className="field" style={{ flex: 2 }}>
              <label>Job title</label>
              <input required value={job.title} onChange={(e) => setJob({ ...job, title: e.target.value })} />
            </div>
            <div className="field">
              <label>Department</label>
              <select value={job.department_id} onChange={(e) => setJob({ ...job, department_id: e.target.value })}>
                <option value="">-</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Hiring manager</label>
              <select value={job.hiring_manager_id} onChange={(e) => setJob({ ...job, hiring_manager_id: e.target.value })}>
                <option value="">-</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ maxWidth: 110 }}>
              <label>Headcount</label>
              <input type="number" min={1} value={job.headcount} onChange={(e) => setJob({ ...job, headcount: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Description (optional)</label>
            <textarea value={job.description} onChange={(e) => setJob({ ...job, description: e.target.value })} />
          </div>
          <button disabled={busy}>Add opening</button>
        </form>
      )}

      <div className="card table-wrap">
        <h2>Openings</h2>
        {openings.length === 0 ? (
          <p className="empty">No openings yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Hiring manager</th>
                <th>Headcount</th>
                <th>Candidates</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {openings.map((o) => (
                <tr key={o.id} style={o.id === activeId ? { background: "var(--blue-soft)" } : undefined}>
                  <td>
                    {o.title}
                    <div className="muted small">
                      {o.department?.name ?? "No department"}
                      {o.opened_on ? ` · opened ${fmtDate(o.opened_on)}` : ""}
                    </div>
                  </td>
                  <td>{o.hiring_manager?.full_name ?? "-"}</td>
                  <td>{o.headcount}</td>
                  <td>{candidates.filter((c) => c.job_id === o.id && !["rejected", "withdrawn"].includes(c.stage)).length} active</td>
                  <td>
                    {canEdit ? (
                      <select
                        value={o.status}
                        disabled={busy}
                        aria-label="Status"
                        onChange={(e) =>
                          run(() =>
                            supabase
                              .from("job_openings")
                              .update({ status: e.target.value, opened_on: e.target.value === "open" && !o.opened_on ? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" }) : o.opened_on })
                              .eq("id", o.id),
                          )
                        }
                      >
                        {OPENING_STATUS.map((s) => (
                          <option key={s} value={s}>
                            {label(s)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      label(o.status)
                    )}
                  </td>
                  <td className="right nowrap">
                    <button className="secondary small" onClick={() => setSelected(o.id)}>
                      View candidates
                    </button>
                    {canEdit && (
                      <>
                        {" "}
                        <button
                          className="secondary small"
                          disabled={busy}
                          onClick={() => window.confirm("Delete this opening and all its candidates?") && run(() => supabase.from("job_openings").delete().eq("id", o.id))}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {active && (
        <div className="card table-wrap">
          <h2>Candidates for {active.title}</h2>
          {list.length === 0 ? (
            <p className="empty">No candidates yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Source</th>
                  <th>Applied</th>
                  <th>Stage</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.full_name}
                      {c.notes && <div className="muted small">{c.notes}</div>}
                    </td>
                    <td className="small">
                      {c.email}
                      {c.phone && <div>{c.phone}</div>}
                    </td>
                    <td>{c.source ?? "-"}</td>
                    <td className="nowrap">{fmtDate(c.applied_on)}</td>
                    <td>
                      {canEdit ? (
                        <select value={c.stage} disabled={busy} aria-label="Stage" onChange={(e) => run(() => supabase.from("candidates").update({ stage: e.target.value }).eq("id", c.id))}>
                          {STAGES.map((s) => (
                            <option key={s} value={s}>
                              {label(s)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        label(c.stage)
                      )}
                    </td>
                    <td className="right">
                      {canEdit && (
                        <button className="secondary small" disabled={busy} onClick={() => window.confirm(`Delete ${c.full_name}? Their details are removed permanently.`) && run(() => supabase.from("candidates").delete().eq("id", c.id))}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canEdit && (
            <form
              className="row"
              style={{ marginTop: 12, alignItems: "flex-end" }}
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await run(() =>
                  supabase.from("candidates").insert({
                    job_id: activeId,
                    full_name: cand.full_name.trim(),
                    email: cand.email.trim() || null,
                    phone: cand.phone.trim() || null,
                    source: cand.source.trim() || null,
                  }),
                );
                if (ok) setCand({ job_id: "", full_name: "", email: "", phone: "", source: "" });
              }}
            >
              <div className="field">
                <label>Name</label>
                <input required value={cand.full_name} onChange={(e) => setCand({ ...cand, full_name: e.target.value })} />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="email" value={cand.email} onChange={(e) => setCand({ ...cand, email: e.target.value })} />
              </div>
              <div className="field">
                <label>Phone</label>
                <input value={cand.phone} onChange={(e) => setCand({ ...cand, phone: e.target.value })} />
              </div>
              <div className="field">
                <label>Source</label>
                <input value={cand.source} onChange={(e) => setCand({ ...cand, source: e.target.value })} placeholder="Referral, JobStreet..." />
              </div>
              <div className="field" style={{ flex: "0 0 auto" }}>
                <button disabled={busy}>Add candidate</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
