import Link from "next/link";
import { requireEmployee } from "@/lib/session";
import { days, fmtRange, todaySG } from "@/lib/format";
import { Flags, StatusBadge } from "@/components/ui";
import { CancelButton } from "@/components/ActionButtons";

export default async function MyLeavePage() {
  const { supabase, me } = await requireEmployee();
  const { data } = await supabase
    .from("leave_requests")
    .select("id, ref, start_date, end_date, days, status, flags, decision_remark, leave_type:leave_types(name), approver:employees!leave_requests_approver_id_fkey(full_name)")
    .eq("employee_id", me.id)
    .order("start_date", { ascending: false });
  const today = todaySG();
  const rows = data ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My leave</h1>
          <p className="muted">All your requests and where they stand.</p>
        </div>
        <Link className="btn" href="/leave/new">
          Apply for leave
        </Link>
      </div>
      <div className="card table-wrap">
        {rows.length === 0 ? (
          <p className="empty">You have not applied for any leave yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ref</th>
                <th>Type</th>
                <th>Dates</th>
                <th>Days</th>
                <th>Approver</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/leave/${r.id}`}>{r.ref}</Link>
                  </td>
                  <td>
                    {r.leave_type?.name}
                    <Flags flags={r.flags} />
                  </td>
                  <td className="nowrap">{fmtRange(r.start_date, r.end_date)}</td>
                  <td>{days(r.days)}</td>
                  <td>{r.approver?.full_name ?? "-"}</td>
                  <td>
                    <StatusBadge status={r.status} />
                    {r.status === "rejected" && r.decision_remark && <div className="small muted">{r.decision_remark}</div>}
                  </td>
                  <td className="right">
                    {(r.status === "pending" || (r.status === "approved" && r.end_date >= today)) && <CancelButton kind="leave" id={r.id} label="Cancel" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
