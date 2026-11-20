import Link from "next/link";
import { requireEmployee } from "@/lib/session";
import { todaySG, type Row } from "@/lib/format";

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const { supabase } = await requireEmployee();

  const ym = m && /^\d{4}-\d{2}$/.test(m) ? m : todaySG().slice(0, 7);
  const [year, month] = ym.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const from = `${ym}-01`;
  const to = `${ym}-${String(daysInMonth).padStart(2, "0")}`;

  const [{ data: cal }, { data: holidays }, { data: staff }] = await Promise.all([
    supabase.rpc("team_calendar", { p_from: from, p_to: to }),
    supabase.from("public_holidays").select("holiday_date, name").gte("holiday_date", from).lte("holiday_date", to),
    supabase.from("employees").select("id, full_name, department:departments!employees_department_id_fkey(name)").eq("is_active", true).order("full_name"),
  ]);

  const phSet = new Map<string, string>();
  ((holidays ?? []) as Row[]).forEach((h) => phSet.set(h.holiday_date as string, h.name as string));
  const entries = (cal ?? []) as Row[];
  const dayList = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-SG", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Team calendar</h1>
          <p className="muted">See who is away before you apply. Pending requests are shown in amber.</p>
        </div>
        <div className="inline">
          <Link className="btn secondary small" href={`/calendar?m=${shiftMonth(ym, -1)}`}>
            &larr; Prev
          </Link>
          <strong>{label}</strong>
          <Link className="btn secondary small" href={`/calendar?m=${shiftMonth(ym, 1)}`}>
            Next &rarr;
          </Link>
        </div>
      </div>
      <div className="card table-wrap">
        <table className="cal">
          <thead>
            <tr>
              <th className="name">Staff</th>
              {dayList.map((d) => {
                const date = `${ym}-${String(d).padStart(2, "0")}`;
                const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
                const cls = dow === 0 || dow === 6 ? "we" : phSet.has(date) ? "ph" : "";
                return (
                  <th key={d} className={cls} title={phSet.get(date) ?? undefined}>
                    {d}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {(staff ?? []).map((s) => {
              const mine = entries.filter((e) => e.employee_id === s.id);
              return (
                <tr key={s.id}>
                  <td className="name">
                    {s.full_name}
                    <div className="muted small">{s.department?.name}</div>
                  </td>
                  {dayList.map((d) => {
                    const date = `${ym}-${String(d).padStart(2, "0")}`;
                    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
                    const hit = mine.find((e) => e.start_date <= date && e.end_date >= date);
                    const base = dow === 0 || dow === 6 ? "we" : phSet.has(date) ? "ph" : "";
                    const cls = hit && !(dow === 0 || dow === 6 || phSet.has(date)) ? `lv-${hit.status}` : base;
                    return <td key={d} className={cls} title={hit ? `${hit.leave_type} (${hit.status})` : undefined} />;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="small legend muted" style={{ marginTop: 10 }}>
          <span style={{ background: "#7bcf9d" }} />
          Approved
          <span style={{ background: "#f7d27a" }} />
          Pending
          <span style={{ background: "#fde7f1" }} />
          Public holiday
          <span style={{ background: "#eceff3" }} />
          Weekend
        </p>
      </div>
    </>
  );
}
