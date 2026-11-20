import Link from "next/link";
import { Flags, Flash, PageHeader } from "@/components/badges";
import { requireMe } from "@/lib/session";
import { firstParam, money, num, sgDate, sgDateTime } from "@/lib/utils";
import { decide } from "./actions";

type Clash = { name: string; start: string; end: string; status: string };

function DecisionForm({ kind, id }: { kind: "leave" | "claim"; id: string }) {
  return (
    <form action={decide} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input name="remark" placeholder="Remark (required to reject)" className="input max-w-xs" />
      <button name="decision" value="approve" className="btn-primary">Approve</button>
      <button name="decision" value="reject" className="btn-danger">Reject</button>
    </form>
  );
}

export default async function Approvals({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, me } = await requireMe();
  if (!me) return null;
  const mine = `approver_id.eq.${me.id},escalated_to.eq.${me.id}`;
  const director = me.role === "director" || me.role === "admin";

  const leaveQ = supabase
    .from("leave_requests")
    .select("id, ref, start_date, end_date, days, reason, flags, clashes, balance_before, balance_after, submitted_at, escalated_at, employee:employees!leave_requests_employee_id_fkey(full_name), leave_types(name)")
    .eq("status", "pending")
    .neq("employee_id", me.id)
    .order("submitted_at");
  const claimQ = supabase
    .from("claims")
    .select("id, ref, description, total_amount, currency, flags, submitted_at, escalated_at, employee:employees!claims_employee_id_fkey(full_name), claim_lines(line_no, description, amount, receipt_no)")
    .eq("status", "pending")
    .neq("employee_id", me.id)
    .order("submitted_at");

  const [{ data: leave }, { data: claims }] = await Promise.all([director ? leaveQ : leaveQ.or(mine), director ? claimQ : claimQ.or(mine)]);

  return (
    <>
      <PageHeader title="Approvals" subtitle="Decide within 1 working day — reminders go out after 1 day and the request escalates after 2." />
      <Flash ok={firstParam(sp.ok)} err={firstParam(sp.err)} />

      <h2 className="mb-2 text-sm font-semibold text-muted">LEAVE REQUESTS ({leave?.length ?? 0})</h2>
      <div className="mb-8 space-y-3">
        {(leave ?? []).map((r) => {
          const clashes = (r.clashes ?? []) as Clash[];
          return (
            <div key={r.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <b>{(r.employee as unknown as { full_name: string } | null)?.full_name}</b> ·{" "}
                  <Link href={`/leave/${r.id}`} className="text-brand">{r.ref}</Link>
                  {r.escalated_at && <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Escalated</span>}
                  <div className="text-sm">{(r.leave_types as unknown as { name: string } | null)?.name} · {num(r.days)} day(s) · {sgDate(r.start_date)} – {sgDate(r.end_date)}</div>
                  <div className="text-xs text-muted">Balance {num(r.balance_before)} → {num(r.balance_after)} · submitted {sgDateTime(r.submitted_at)}</div>
                  {r.reason && <div className="mt-1 text-sm">“{r.reason}”</div>}
                </div>
                <Flags flags={r.flags} />
              </div>
              {!!clashes.length && (
                <div className="mt-2 rounded bg-orange-50 p-2 text-xs text-orange-900">
                  Overlaps: {clashes.map((c) => `${c.name} (${sgDate(c.start)}–${sgDate(c.end)}, ${c.status})`).join("; ")}
                </div>
              )}
              <DecisionForm kind="leave" id={r.id} />
            </div>
          );
        })}
        {!leave?.length && <div className="card p-6 text-center text-sm text-muted">Nothing waiting.</div>}
      </div>

      <h2 className="mb-2 text-sm font-semibold text-muted">EXPENSE CLAIMS ({claims?.length ?? 0})</h2>
      <div className="space-y-3">
        {(claims ?? []).map((c) => (
          <div key={c.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <b>{(c.employee as unknown as { full_name: string } | null)?.full_name}</b> ·{" "}
                <Link href={`/claims/${c.id}`} className="text-brand">{c.ref}</Link>
                {c.escalated_at && <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Escalated</span>}
                <div className="text-sm">{c.description} · <b>{money(c.total_amount, c.currency)}</b></div>
                <div className="text-xs text-muted">{c.claim_lines?.length ?? 0} line(s) · submitted {sgDateTime(c.submitted_at)}</div>
              </div>
              <Flags flags={c.flags} />
            </div>
            <DecisionForm kind="claim" id={c.id} />
          </div>
        ))}
        {!claims?.length && <div className="card p-6 text-center text-sm text-muted">Nothing waiting.</div>}
      </div>
    </>
  );
}
