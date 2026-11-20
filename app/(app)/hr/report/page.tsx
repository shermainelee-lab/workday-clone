import Link from "next/link";
import { requireEmployee } from "@/lib/session";
import { days, todaySG, type Row } from "@/lib/format";

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function MonthlyReportPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const { supabase } = await requireEmployee();
  const ym = m && /^\d{4}-\d{2}$/.test(m) ? m : todaySG().slice(0, 7);
  const [year, month] = ym.split("-").map(Number);

  const { data, error } = await supabase.rpc("monthly_leave_report", { p_year: year, p_month: month });
  const rows = (data ?? []) as Row[];
  const totalDays = rows.reduce((s, r) => s + Number(r.total_days), 0);
  const flagged = rows.filter((r) => r.flagged);
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-SG", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Monthly leave summary</h1>
          <p className="muted">Approved leave starting in the month, with simple pattern flags for HR to review.</p>
        </div>
        <div className="inline">
          <Link className="btn secondary small" href={`/hr/report?m=${shiftMonth(ym, -1)}`}>
            &larr; Prev
          </Link>
          <strong>{label}</strong>
          <Link className="btn secondary small" href={`/hr/report?m=${shiftMonth(ym, 1)}`}>
            Next &rarr;
          </Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error.message}</div>}

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="stat">
          <div className="label">Leave days taken</div>
          <div className="value">{days(totalDays)}</div>
        </div>
        <div className="stat">
          <div className="label">Staff with leave</div>
          <div className="value">{rows.filter((r) => Number(r.total_days) > 0).length}</div>
        </div>
        <div className="stat">
          <div className="label">Pattern flags</div>
          <div className="value">{flagged.length}</div>
          <div className="sub">3+ sick requests, or 3+ leaves starting Monday / ending Friday</div>
        </div>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Department</th>
              <th className="right">Total days</th>
              <th className="right">Sick days</th>
              <th className="right">Sick requests</th>
              <th className="right">Mon/Fri leaves</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee_id}>
                <td>{r.full_name}</td>
                <td>{r.department ?? "-"}</td>
                <td className="right">{days(r.total_days)}</td>
                <td className="right">{days(r.sick_days)}</td>
                <td className="right">{r.sick_requests}</td>
                <td className="right">{r.mon_fri_requests}</td>
                <td>{r.flagged && <span className="flag">Review</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
