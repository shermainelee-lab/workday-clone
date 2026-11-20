import Link from "next/link";
import { PageHeader } from "@/components/badges";
import { requireMe } from "@/lib/session";
import { firstParam } from "@/lib/utils";

type Entry = { request_id: string; full_name: string; department: string | null; leave_type: string; start_date: string; end_date: string; status: string; is_mine: boolean };

const pad = (n: number) => String(n).padStart(2, "0");

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, me } = await requireMe();
  if (!me) return null;

  const now = new Date();
  const m = firstParam(sp.m) ?? `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const [y, mo] = m.split("-").map(Number);
  const first = new Date(Date.UTC(y, mo - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const from = `${y}-${pad(mo)}-01`;
  const to = `${y}-${pad(mo)}-${pad(daysInMonth)}`;
  const prev = new Date(Date.UTC(y, mo - 2, 1));
  const next = new Date(Date.UTC(y, mo, 1));
  const ym = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;

  const [{ data }, { data: holidays }] = await Promise.all([
    supabase.rpc("team_calendar", { p_from: from, p_to: to }),
    supabase.from("public_holidays").select("holiday_date, name").gte("holiday_date", from).lte("holiday_date", to),
  ]);
  const entries = (data ?? []) as Entry[];
  const hol = new Map((holidays ?? []).map((h) => [h.holiday_date, h.name]));

  const lead = (first.getUTCDay() + 6) % 7; // Monday-first grid
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  return (
    <>
      <PageHeader
        title="Team calendar"
        subtitle="Approved and pending leave. Leave types are only shown for your own and your reports’ requests."
        action={
          <div className="flex items-center gap-2">
            <Link href={`/calendar?m=${ym(prev)}`} className="btn-secondary">←</Link>
            <span className="w-36 text-center text-sm font-semibold">{first.toLocaleDateString("en-SG", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
            <Link href={`/calendar?m=${ym(next)}`} className="btn-secondary">→</Link>
          </div>
        }
      />
      <div className="card overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-7 border-b border-line bg-canvas text-center text-xs font-semibold text-muted">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid min-w-[760px] grid-cols-7">
          {cells.map((d, i) => {
            const iso = d ? `${y}-${pad(mo)}-${pad(d)}` : "";
            const weekend = i % 7 >= 5;
            const off = d ? entries.filter((e) => e.start_date <= iso && e.end_date >= iso) : [];
            return (
              <div key={i} className={`min-h-24 border-b border-r border-line p-1.5 ${weekend ? "bg-canvas/60" : ""}`}>
                {d && (
                  <>
                    <div className="text-xs font-semibold text-muted">{d}</div>
                    {hol.has(iso) && <div className="mb-1 rounded bg-sky-100 px-1 text-[10px] font-medium text-sky-800">{hol.get(iso)}</div>}
                    {!weekend && off.map((e) => (
                      <div
                        key={e.request_id}
                        title={`${e.full_name} — ${e.leave_type} (${e.status})`}
                        className={`mb-0.5 truncate rounded px-1 text-[11px] ${e.status === "approved" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"} ${e.is_mine ? "ring-1 ring-brand" : ""}`}
                      >
                        {e.full_name.split(" ")[0]}
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">Green = approved · Amber = pending · Blue = public holiday · Outlined = you</p>
    </>
  );
}
