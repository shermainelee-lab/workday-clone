import Link from "next/link";
import { requireEmployee } from "@/lib/session";
import { days, fmtDateTime, yearSG, type Row } from "@/lib/format";

export default async function MasterLeaveRecordPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireEmployee();
  const year = Number(sp.year) || yearSG();

  const [{ data: bal }, { data: ledger }, { data: types }] = await Promise.all([
    supabase.from("leave_balances").select("*").eq("year", year).order("full_name"),
    supabase
      .from("leave_ledger")
      .select("*, employee:employees!leave_ledger_employee_id_fkey(full_name), leave_type:leave_types(code, name), request:leave_requests(ref)")
      .eq("year", year)
      .order("id", { ascending: false })
      .limit(40),
    supabase.from("leave_types").select("id, code, name").eq("is_active", true).order("sort_order"),
  ]);

  const byEmployee = new Map<string, { name: string; cells: Record<string, Row> }>();
  ((bal ?? []) as Row[]).forEach((b) => {
    const e = byEmployee.get(b.employee_id) ?? { name: b.full_name, cells: {} };
    e.cells[b.leave_type_id] = b;
    byEmployee.set(b.employee_id, e);
  });
  const typeList = ((types ?? []) as Row[]).filter((t) => ((bal ?? []) as Row[]).some((b) => b.leave_type_id === t.id));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Master Leave Record, {year}</h1>
          <p className="muted">Balance = contract entitlement + carried over &minus; approved days. Posted automatically on approval.</p>
        </div>
        <div className="inline">
          <Link className="btn secondary small" href={`/hr?year=${year - 1}`}>
            &larr; {year - 1}
          </Link>
          <Link className="btn secondary small" href={`/hr?year=${year + 1}`}>
            {year + 1} &rarr;
          </Link>
          <a className="btn small" href={`/api/export/balances?year=${year}`}>
            Export balances (CSV)
          </a>
          <a className="btn small" href={`/api/export/leave?year=${year}`}>
            Export leave (CSV)
          </a>
        </div>
      </div>

      <div className="card table-wrap">
        <h2>Balances (available / entitled)</h2>
        {byEmployee.size === 0 ? (
          <p className="empty">No entitlements for {year}. Generate them on the Entitlements tab.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                {typeList.map((t) => (
                  <th key={t.id}>{t.code}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...byEmployee.entries()].map(([id, e]) => (
                <tr key={id}>
                  <td>{e.name}</td>
                  {typeList.map((t) => {
                    const c = e.cells[t.id];
                    return (
                      <td key={t.id} className="nowrap">
                        {c ? (
                          <>
                            <strong>{days(c.available_days)}</strong> / {days(Number(c.entitled_days) + Number(c.carried_over_days))}
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card table-wrap">
        <h2>Latest postings</h2>
        {(ledger ?? []).length === 0 ? (
          <p className="empty">No leave has been posted in {year} yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Employee</th>
                <th>Type</th>
                <th>Entry</th>
                <th className="right">Days</th>
                <th>Request</th>
              </tr>
            </thead>
            <tbody>
              {(ledger ?? []).map((l) => (
                <tr key={l.id}>
                  <td className="nowrap small">{fmtDateTime(l.created_at)}</td>
                  <td>{l.employee?.full_name}</td>
                  <td>{l.leave_type?.name}</td>
                  <td>{l.entry_type}</td>
                  <td className="right">{Number(l.days) > 0 ? `-${days(l.days)}` : `+${days(Math.abs(Number(l.days)))}`}</td>
                  <td>{l.request?.ref ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
