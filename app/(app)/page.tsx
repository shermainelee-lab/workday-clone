import Link from "next/link";
import { requireEmployee } from "@/lib/session";
import { days, fmtRange, money, yearSG } from "@/lib/format";
import { StatusBadge } from "@/components/ui";

export default async function HomePage() {
  const { supabase, me } = await requireEmployee();
  const year = yearSG();

  const [bal, leaves, claims] = await Promise.all([
    supabase.from("leave_balances").select("*").eq("employee_id", me.id).eq("year", year).order("leave_type"),
    supabase
      .from("leave_requests")
      .select("id, ref, start_date, end_date, days, status, leave_type:leave_types(name)")
      .eq("employee_id", me.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("claims")
      .select("id, ref, description, total_amount, currency, status")
      .eq("employee_id", me.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const balances = (bal.data ?? []).filter((b) => Number(b.entitled_days) + Number(b.carried_over_days) > 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hello, {me.full_name.split(" ")[0]}</h1>
          <p className="muted">
            {me.job_title ?? "Staff"}
            {me.department?.name ? ` · ${me.department.name}` : ""}
          </p>
        </div>
        <div className="inline">
          <Link className="btn" href="/leave/new">
            Apply for leave
          </Link>
          <Link className="btn secondary" href="/claims/new">
            Submit a claim
          </Link>
        </div>
      </div>

      <h2>My leave balances, {year}</h2>
      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        {balances.length === 0 && <div className="card empty">No leave entitlements are set up for you yet. Ask HR.</div>}
        {balances.map((b) => (
          <div className="stat" key={b.leave_type_id}>
            <div className="label">{b.leave_type}</div>
            <div className="value">{days(b.available_days)}</div>
            <div className="sub">
              available &middot; {days(b.used_days)} used of {days(Number(b.entitled_days) + Number(b.carried_over_days))}
              {Number(b.pending_days) > 0 ? ` · ${days(b.pending_days)} pending` : ""}
            </div>
          </div>
        ))}
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>Recent leave requests</h2>
          {(leaves.data ?? []).length === 0 ? (
            <p className="empty">Nothing yet.</p>
          ) : (
            <table>
              <tbody>
                {(leaves.data ?? []).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/leave/${r.id}`}>{r.ref}</Link>
                      <div className="muted small">{r.leave_type?.name}</div>
                    </td>
                    <td>
                      {fmtRange(r.start_date, r.end_date)}
                      <div className="muted small">{days(r.days)} day(s)</div>
                    </td>
                    <td className="right">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h2>Recent claims</h2>
          {(claims.data ?? []).length === 0 ? (
            <p className="empty">Nothing yet.</p>
          ) : (
            <table>
              <tbody>
                {(claims.data ?? []).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/claims/${c.id}`}>{c.ref}</Link>
                      <div className="muted small">{c.description}</div>
                    </td>
                    <td className="right nowrap">{money(c.total_amount, c.currency)}</td>
                    <td className="right">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
