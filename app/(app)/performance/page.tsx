import Link from "next/link";
import { requireEmployee } from "@/lib/session";
import { fmtDate, REVIEW_STATUS, type Row } from "@/lib/format";
import { GoalManager } from "@/components/Performance";

export default async function PerformancePage() {
  const { supabase, me } = await requireEmployee();
  const select = "id, status, ed_id, cycle:review_cycles(name, status, self_due, manager_due), employee:employees!reviews_employee_id_fkey(full_name)";

  const [{ data: mine }, { data: team }, { data: goals }] = await Promise.all([
    supabase.from("reviews").select(select).eq("employee_id", me.id).order("created_at", { ascending: false }),
    supabase.from("reviews").select(select).or(`reviewer_id.eq.${me.id},ed_id.eq.${me.id}`).neq("employee_id", me.id).order("created_at", { ascending: false }),
    supabase.from("goals").select("*").eq("employee_id", me.id).order("created_at", { ascending: false }),
  ]);

  const toWrite = ((team ?? []) as Row[]).filter(
    (r) => r.cycle?.status === "open" && (r.status === "pending_supervisor" || r.status === "pending_discussion" || (r.status === "pending_ed" && r.ed_id === me.id)),
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Performance</h1>
          <p className="muted">Your appraisals and goals.</p>
        </div>
      </div>

      {toWrite.length > 0 && (
        <div className="alert alert-info">
          {toWrite.length} {toWrite.length === 1 ? "person is" : "people are"} waiting for something from you.
        </div>
      )}

      <div className="grid cols-2">
        <div className="card">
          <h2>My appraisals</h2>
          {(mine ?? []).length === 0 ? (
            <p className="empty">No appraisals yet.</p>
          ) : (
            <table>
              <tbody>
                {(mine as Row[]).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/performance/${r.id}`}>{r.cycle?.name}</Link>
                      {r.status === "pending_self" && r.cycle?.self_due && <div className="muted small">Due {fmtDate(r.cycle.self_due)}</div>}
                    </td>
                    <td className="right">{REVIEW_STATUS[r.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h2>Appraisals I handle</h2>
          {(team ?? []).length === 0 ? (
            <p className="empty">You are not a supervisor in any cycle.</p>
          ) : (
            <table>
              <tbody>
                {(team as Row[]).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/performance/${r.id}`}>{r.employee?.full_name}</Link>
                      <div className="muted small">{r.cycle?.name}</div>
                    </td>
                    <td className="right">{REVIEW_STATUS[r.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h2>My goals</h2>
        <GoalManager employeeId={me.id} goals={(goals ?? []) as Row[]} canEdit />
      </div>
    </>
  );
}
