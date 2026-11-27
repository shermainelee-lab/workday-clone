import Link from "next/link";
import { requireEmployee, HR_ROLES } from "@/lib/session";
import { fmtRange, days, type Row } from "@/lib/format";
import RecordLeave from "@/components/RecordLeave";

export default async function RecordLeavePage() {
  const { supabase, me } = await requireEmployee();
  if (!HR_ROLES.includes(me.role)) return <div className="alert alert-info">Only HR can record leave.</div>;
  const [{ data: emps }, { data: types }, { data: recent }] = await Promise.all([
    supabase.from("employees").select("id, full_name").eq("is_active", true).neq("id", me.id).order("full_name"),
    supabase.from("leave_types").select("id, name").eq("is_active", true).order("sort_order"),
    supabase
      .from("leave_requests")
      .select("id, ref, start_date, end_date, days, employee:employees!leave_requests_employee_id_fkey(full_name), leave_type:leave_types(name)")
      .contains("flags", ["Recorded by HR"])
      .order("created_at", { ascending: false })
      .limit(15),
  ]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Record approved leave</h1>
        </div>
      </div>
      <RecordLeave employees={(emps ?? []) as Row[]} types={(types ?? []) as Row[]} />
      {(recent ?? []).length > 0 && (
        <div className="card table-wrap">
          <h2>Recently recorded</h2>
          <table>
            <tbody>
              {(recent as Row[]).map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/leave/${r.id}`}>{r.ref}</Link>
                  </td>
                  <td>{r.employee?.full_name}</td>
                  <td>{r.leave_type?.name}</td>
                  <td>{fmtRange(r.start_date, r.end_date)}</td>
                  <td className="right">{days(r.days)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
