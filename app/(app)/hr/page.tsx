import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/badges";
import { can, requireMe } from "@/lib/session";
import { firstParam, label, num, sgDate } from "@/lib/utils";

type Bal = { employee_id: string; full_name: string; leave_code: string; entitled_days: number; carried_over_days: number; used_days: number; pending_days: number; available_days: number };
type Report = { employee_id: string; full_name: string; department: string | null; total_days: number; sick_days: number; sick_requests: number; mon_fri_requests: number; flagged: boolean };

export default async function HrPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, me } = await requireMe();
  if (!me || !can.hrView(me.role)) notFound();

  const tab = firstParam(sp.tab) ?? "record";
  const year = Number(firstParam(sp.year)) || new Date().getFullYear();
  const month = Number(firstParam(sp.month)) || new Date().getMonth() + 1;

  const tabs = [
    ["record", "Master leave record"],
    ["report", "Monthly report"],
    ["staff", "Directory"],
    ["holidays", "Public holidays"],
  ];

  return (
    <>
      <PageHeader
        title="HR & leave record"
        subtitle="Balances update automatically on approval — no re-keying."
        action={<a href={`/api/export/leave?year=${year}`} className="btn-secondary">Export leave CSV</a>}
      />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`/hr?tab=${k}&year=${year}`} className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold ${tab === k ? "border-brand text-brand" : "border-transparent text-muted"}`}>
            {l}
          </Link>
        ))}
      </div>

      {tab === "record" && <LeaveRecord supabase={supabase} year={year} />}
      {tab === "report" && <MonthReport supabase={supabase} year={year} month={month} />}
      {tab === "staff" && <Staff supabase={supabase} />}
      {tab === "holidays" && <Holidays supabase={supabase} />}
    </>
  );
}

type Sb = Awaited<ReturnType<typeof requireMe>>["supabase"];

async function LeaveRecord({ supabase, year }: { supabase: Sb; year: number }) {
  const { data } = await supabase
    .from("leave_balances")
    .select("employee_id, full_name, leave_code, entitled_days, carried_over_days, used_days, pending_days, available_days")
    .eq("year", year)
    .order("full_name");
  const rows = (data ?? []) as Bal[];
  const codes = [...new Set(rows.filter((r) => num(r.entitled_days) + num(r.carried_over_days) > 0).map((r) => r.leave_code))];
  const byEmp = new Map<string, { name: string; items: Map<string, Bal> }>();
  for (const r of rows) {
    if (!byEmp.has(r.employee_id)) byEmp.set(r.employee_id, { name: r.full_name, items: new Map() });
    byEmp.get(r.employee_id)!.items.set(r.leave_code, r);
  }
  return (
    <div className="card overflow-x-auto">
      <div className="card-header"><h2 className="card-title">{year} — used / entitled (pending in brackets)</h2></div>
      <table className="w-full">
        <thead className="border-b border-line">
          <tr><th className="th">Employee</th>{codes.map((c) => <th key={c} className="th">{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {[...byEmp.entries()].map(([id, e]) => (
            <tr key={id}>
              <td className="td font-medium">{e.name}</td>
              {codes.map((c) => {
                const b = e.items.get(c);
                if (!b) return <td key={c} className="td text-muted">—</td>;
                const total = num(b.entitled_days) + num(b.carried_over_days);
                return (
                  <td key={c} className="td whitespace-nowrap">
                    <b>{num(b.used_days)}</b> / {total}
                    {num(b.pending_days) > 0 && <span className="text-amber-700"> ({num(b.pending_days)})</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function MonthReport({ supabase, year, month }: { supabase: Sb; year: number; month: number }) {
  const { data } = await supabase.rpc("monthly_leave_report", { p_year: year, p_month: month });
  const rows = (data ?? []) as Report[];
  return (
    <div className="card overflow-x-auto">
      <div className="card-header">
        <h2 className="card-title">Approved leave starting in {new Date(year, month - 1).toLocaleDateString("en-SG", { month: "long", year: "numeric" })}</h2>
        <form className="flex items-center gap-2">
          <input type="hidden" name="tab" value="report" />
          <input type="number" name="year" defaultValue={year} className="input w-24" />
          <select name="month" defaultValue={month} className="input w-32">
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{new Date(2000, i).toLocaleDateString("en", { month: "long" })}</option>)}
          </select>
          <button className="btn-secondary">Go</button>
        </form>
      </div>
      <table className="w-full">
        <thead className="border-b border-line"><tr><th className="th">Employee</th><th className="th">Department</th><th className="th">Days</th><th className="th">Sick days</th><th className="th">Sick requests</th><th className="th">Mon/Fri</th><th className="th">Pattern</th></tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.employee_id}>
              <td className="td font-medium">{r.full_name}</td>
              <td className="td">{r.department}</td>
              <td className="td">{num(r.total_days)}</td>
              <td className="td">{num(r.sick_days)}</td>
              <td className="td">{r.sick_requests}</td>
              <td className="td">{r.mon_fri_requests}</td>
              <td className="td">{r.flagged ? <span className="rounded bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700 ring-1 ring-orange-200">⚑ Review</span> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-3 text-xs text-muted">Flagged when an employee has 3+ sick-leave requests, or 3+ requests starting on a Monday / ending on a Friday, in the month.</p>
    </div>
  );
}

async function Staff({ supabase }: { supabase: Sb }) {
  const { data } = await supabase
    .from("employees")
    .select("id, employee_no, full_name, email, job_title, role, join_date, is_active, departments!employees_department_id_fkey(name), manager:employees!employees_manager_id_fkey(full_name)")
    .order("employee_no");
  return (
    <div className="card overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-line"><tr><th className="th">No.</th><th className="th">Name</th><th className="th">Email</th><th className="th">Title</th><th className="th">Department</th><th className="th">Reports to</th><th className="th">Role</th><th className="th">Joined</th></tr></thead>
        <tbody className="divide-y divide-line">
          {(data ?? []).map((e) => (
            <tr key={e.id} className={e.is_active ? "" : "opacity-50"}>
              <td className="td">{e.employee_no}</td>
              <td className="td font-medium">{e.full_name}</td>
              <td className="td">{e.email}</td>
              <td className="td">{e.job_title}</td>
              <td className="td">{(e.departments as unknown as { name: string } | null)?.name}</td>
              <td className="td">{(e.manager as unknown as { full_name: string } | null)?.full_name ?? "—"}</td>
              <td className="td">{label(e.role)}</td>
              <td className="td whitespace-nowrap">{sgDate(e.join_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-3 text-xs text-muted">Edit staff, managers, roles and entitlements in the Supabase table editor (HR/admin write access is enforced by RLS). Staff sign in with the email shown here.</p>
    </div>
  );
}

async function Holidays({ supabase }: { supabase: Sb }) {
  const { data } = await supabase.from("public_holidays").select("holiday_date, name, is_in_lieu").order("holiday_date");
  return (
    <div className="card">
      <ul className="divide-y divide-line">
        {(data ?? []).map((h) => (
          <li key={h.holiday_date} className="flex justify-between px-4 py-2 text-sm">
            <span>{h.name}</span><span className="text-muted">{sgDate(h.holiday_date)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
