import Link from "next/link";
import { Flags, PageHeader, StatusBadge } from "@/components/badges";
import { requireMe } from "@/lib/session";
import { money, num, sgDate } from "@/lib/utils";

export default async function Home() {
  const { supabase, me } = await requireMe();
  if (!me) return null;
  const year = new Date().getFullYear();

  const [{ data: balances }, { data: leave }, { data: claims }] = await Promise.all([
    supabase
      .from("leave_balances")
      .select("leave_code, leave_type, entitled_days, carried_over_days, used_days, pending_days, available_days")
      .eq("employee_id", me.id)
      .eq("year", year)
      .order("leave_code"),
    supabase
      .from("leave_requests")
      .select("id, ref, start_date, end_date, days, status, flags, leave_types(name)")
      .eq("employee_id", me.id)
      .order("submitted_at", { ascending: false })
      .limit(5),
    supabase
      .from("claims")
      .select("id, ref, description, total_amount, status, currency")
      .eq("employee_id", me.id)
      .order("submitted_at", { ascending: false })
      .limit(5),
  ]);

  const shown = (balances ?? []).filter((b) => num(b.entitled_days) + num(b.carried_over_days) > 0);

  return (
    <>
      <PageHeader
        title={`Hello, ${me.full_name.split(" ")[0]}`}
        subtitle={`${me.job_title ?? ""} · your leave balances for ${year}`}
        action={
          <div className="flex gap-2">
            <Link href="/leave/new" className="btn-primary">Request leave</Link>
            <Link href="/claims/new" className="btn-secondary">New claim</Link>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {shown.map((b) => (
          <div key={b.leave_code} className="card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">{b.leave_type}</div>
            <div className="mt-1 text-3xl font-semibold">{num(b.available_days)}</div>
            <div className="text-xs text-muted">
              of {num(b.entitled_days) + num(b.carried_over_days)} days · {num(b.used_days)} used
              {num(b.pending_days) > 0 && ` · ${num(b.pending_days)} pending`}
            </div>
          </div>
        ))}
        {!shown.length && <div className="card col-span-full p-4 text-sm text-muted">No entitlements set up for {year} yet — ask HR.</div>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Recent leave requests</h2>
            <Link href="/leave" className="text-xs font-semibold text-brand">View all</Link>
          </div>
          <ul className="divide-y divide-line">
            {(leave ?? []).map((r) => (
              <li key={r.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <Link href={`/leave/${r.id}`} className="text-sm font-semibold text-brand">{r.ref}</Link>
                  <StatusBadge status={r.status} />
                </div>
                <div className="text-sm">{(r.leave_types as unknown as { name: string } | null)?.name} · {num(r.days)} day(s)</div>
                <div className="text-xs text-muted">{sgDate(r.start_date)} – {sgDate(r.end_date)}</div>
                <Flags flags={r.flags} />
              </li>
            ))}
            {!leave?.length && <li className="px-4 py-6 text-sm text-muted">No requests yet.</li>}
          </ul>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Recent claims</h2>
            <Link href="/claims" className="text-xs font-semibold text-brand">View all</Link>
          </div>
          <ul className="divide-y divide-line">
            {(claims ?? []).map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <Link href={`/claims/${c.id}`} className="text-sm font-semibold text-brand">{c.ref}</Link>
                  <StatusBadge status={c.status} />
                </div>
                <div className="text-sm">{c.description}</div>
                <div className="text-xs text-muted">{money(c.total_amount, c.currency)}</div>
              </li>
            ))}
            {!claims?.length && <li className="px-4 py-6 text-sm text-muted">No claims yet.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
