import Link from "next/link";
import { redirect } from "next/navigation";
import { requireEmployee, HR_ROLES } from "@/lib/session";
import { REVIEW_STATUS, type Row } from "@/lib/format";
import { CycleManager } from "@/components/Performance";
import { RATING_LABEL } from "@/lib/appraisal";

export default async function HrPerformancePage() {
  const { supabase, me } = await requireEmployee();
  if (!HR_ROLES.includes(me.role)) redirect("/hr");

  const [{ data: cycles }, { data: reviews }] = await Promise.all([
    supabase.from("review_cycles").select("*").order("period_start", { ascending: false }),
    supabase
      .from("reviews")
      .select(
        "id, status, cycle_id, final_rating, signed_file_path, employee:employees!reviews_employee_id_fkey(full_name), reviewer:employees!reviews_reviewer_id_fkey(full_name), cycle:review_cycles(name, is_historical)",
      )
      .order("created_at", { ascending: false }),
  ]);

  const all = (reviews ?? []) as Row[];
  const withCounts: Row[] = ((cycles ?? []) as Row[]).map((c) => {
    const mine = all.filter((r) => r.cycle_id === c.id);
    return {
      ...c,
      total: mine.length,
      completed: mine.filter((r) => r.status === "completed").length,
      pending_self: mine.filter((r) => r.status === "pending_self").length,
      in_progress: mine.filter((r) => !["pending_self", "completed"].includes(r.status)).length,
    };
  });
  const latest = withCounts.find((c) => c.status === "open") ?? withCounts[0];
  const shown = latest ? all.filter((r) => r.cycle_id === latest.id) : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Performance appraisals</h1>
          <p className="muted">
            Launching a cycle creates one appraisal per active staff member, with their manager as supervisor and the Executive Director as the second assessor. Past paper appraisals can be added as a closed cycle.
          </p>
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
                <th>Supervisor</th>
                <th>Final rating</th>
                <th>{latest.is_historical ? "Signed form" : "Status"}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/performance/${r.id}`}>{r.employee?.full_name}</Link>
                  </td>
                  <td>{r.reviewer?.full_name ?? "-"}</td>
                  <td>{r.final_rating ? RATING_LABEL[r.final_rating] : "-"}</td>
                  <td>{latest.is_historical ? (r.signed_file_path ? "Attached" : "Not yet") : REVIEW_STATUS[r.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
