import Link from "next/link";
import { requireEmployee } from "@/lib/session";
import { fmtDate, REVIEW_STATUS, type Row } from "@/lib/format";
import { GoalManager } from "@/components/Performance";

export default async function PerformancePage() {
  const { supabase, me } = await requireEmployee();
  const select = "id, status, cycle:review_cycles(name, status, self_due, manager_due), employee:employees!reviews_employee_id_fkey(full_name)";

  const [{ data: mine }, { data: team }, { data: goals }] = await Promise.all([
    supabase.from("reviews").select(select).eq("employee_id", me.id).order("created_at", { ascending: false }),
    supabase.from("reviews").select(select).eq("reviewer_id", me.id).neq("employee_id", me.id).order("created_at", { ascending: false }),
    supabase.from("goals").select("*").eq("employee_id", me.id).order("created_at", { ascending: false }),
  ]);

  const toWrite = ((team ?? []) as Row[]).filter((r) => r.status === "pending_manager" && r.cycle?.status === "open");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Performance</h1>
          <p className="muted">Your reviews and goals.</p>
        </div>
      </div>

      {toWrite.length > 0 && (
        <div className="alert alert-info">
          {toWrite.length} {toWrite.length === 1 ? "person is" : "people are"} waiting for your assessment.
        </div>
      )}

      <div className="grid cols-2">
        <div className="card">
          <h2>My reviews</h2>
          {(mine ?? []).length === 0 ? (
            <p className="empty">No reviews yet.</p>
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
          <h2>Reviews I write</h2>
          {(team ?? []).length === 0 ? (
            <p className="empty">You are not a reviewer in any cycle.</p>
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
