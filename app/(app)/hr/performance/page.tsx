import Link from "next/link";
import { redirect } from "next/navigation";
import { requireEmployee, HR_ROLES } from "@/lib/session";
import { REVIEW_STATUS, type Row } from "@/lib/format";
import { CycleManager, RATING_LABEL } from "@/components/Performance";

export default async function HrPerformancePage() {
  const { supabase, me } = await requireEmployee();
  if (!HR_ROLES.includes(me.role)) redirect("/hr");

  const [{ data: cycles }, { data: reviews }] = await Promise.all([
    supabase.from("review_cycles").select("*").order("period_start", { ascending: false }),
    supabase
      .from("reviews")
      .select(
        "id, status, cycle_id, self_rating, manager_rating, employee:employees!reviews_employee_id_fkey(full_name), reviewer:employees!reviews_reviewer_id_fkey(full_name), cycle:review_cycles(name)",
      )
      .order("created_at", { ascending: false }),
  ]);

  const all = (reviews ?? []) as Row[];
  const withCounts = ((cycles ?? []) as Row[]).map((c) => {
    const mine = all.filter((r) => r.cycle_id === c.id);
    return {
      ...c,
      total: mine.length,
      completed: mine.filter((r) => r.status === "completed").length,
      pending_manager: mine.filter((r) => r.status === "pending_manager").length,
      pending_self: mine.filter((r) => r.status === "pending_self").length,
    };
  });
  const latest = withCounts.find((c) => c.status === "open") ?? withCounts[0];
  const shown = latest ? all.filter((r) => r.cycle_id === latest.id) : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Performance cycles</h1>
          <p className="muted">Launching a cycle creates one review per active staff member, with their manager as reviewer.</p>
        </div>
      </div>
      <CycleManager cycles={withCounts} />
      {latest && (
        <div className="card table-wrap">
          <h2>{latest.name}: progress</h2>
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Reviewer</th>
                <th>Self</th>
                <th>Manager</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/performance/${r.id}`}>{r.employee?.full_name}</Link>
                  </td>
                  <td>{r.reviewer?.full_name ?? "-"}</td>
                  <td>{r.self_rating ? RATING_LABEL[r.self_rating].split(" - ")[0] : "-"}</td>
                  <td>{r.manager_rating ? RATING_LABEL[r.manager_rating].split(" - ")[0] : "-"}</td>
                  <td>{REVIEW_STATUS[r.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
