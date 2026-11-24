"use client";

import { useState } from "react";
import { useRpc } from "@/components/ActionButtons";
import { useDb } from "@/components/HrForms";
import { ErrorList } from "@/components/ui";
import { fmtDate, type Row } from "@/lib/format";

export const RATING_LABEL: Record<number, string> = {
  1: "1 - Needs significant improvement",
  2: "2 - Below expectations",
  3: "3 - Meets expectations",
  4: "4 - Exceeds expectations",
  5: "5 - Outstanding",
};

function ReviewForm({ id, fn, heading, hint }: { id: string; fn: string; heading: string; hint: string }) {
  const { call, busy, errors } = useRpc();
  const [rating, setRating] = useState("");
  const [comments, setComments] = useState("");
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        if (window.confirm("Submit now? You will not be able to change it afterwards.")) {
          call(fn, { p_id: id, p_rating: rating ? Number(rating) : null, p_comments: comments });
        }
      }}
    >
      <h3>{heading}</h3>
      <p className="muted small">{hint}</p>
      <ErrorList errors={errors} />
      <div className="field">
        <label>Rating</label>
        <select value={rating} onChange={(e) => setRating(e.target.value)} required>
          <option value="">Choose...</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {RATING_LABEL[n]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Comments</label>
        <textarea value={comments} onChange={(e) => setComments(e.target.value)} required style={{ minHeight: 120 }} />
      </div>
      <button disabled={busy}>Submit</button>
    </form>
  );
}

export const SelfReviewForm = ({ id }: { id: string }) => (
  <ReviewForm id={id} fn="submit_self_review" heading="Your self review" hint="What went well, what you learned, and where you want to grow. Your manager sees this before writing their assessment." />
);
export const ManagerReviewForm = ({ id }: { id: string }) => (
  <ReviewForm id={id} fn="submit_manager_review" heading="Your assessment" hint="The employee will see your rating and comments once you submit." />
);

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
  const blank = { name: "", period_start: "", period_end: "", self_due: "", manager_due: "" };
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
            <input required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Annual review 2026" />
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
            <label>Manager review due</label>
            <input type="date" value={f.manager_due} onChange={(e) => set("manager_due", e.target.value)} />
          </div>
        </div>
        <button disabled={working}>Create draft</button>
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
                      Self {fmtDate(c.self_due)} &middot; Manager {fmtDate(c.manager_due)}
                    </div>
                  </td>
                  <td className="nowrap">
                    {fmtDate(c.period_start)} to {fmtDate(c.period_end)}
                  </td>
                  <td>
                    <span className={`badge badge-${c.status === "open" ? "pending" : c.status === "closed" ? "approved" : "cancelled"}`}>{c.status}</span>
                  </td>
                  <td className="small">
                    {c.total ? `${c.completed} complete, ${c.pending_manager} with managers, ${c.pending_self} awaiting self review` : "-"}
                  </td>
                  <td className="right nowrap">
                    {c.status === "draft" && (
                      <>
                        <button
                          className="small"
                          disabled={working}
                          onClick={() =>
                            window.confirm("Launch this cycle? A review is created for every active staff member and they are notified.") &&
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
