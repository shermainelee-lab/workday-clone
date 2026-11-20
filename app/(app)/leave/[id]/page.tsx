import { notFound } from "next/navigation";
import { Flags, Flash, PageHeader, StatusBadge } from "@/components/badges";
import { SubmitButton } from "@/components/ui";
import { Timeline } from "@/components/timeline";
import { can, requireMe } from "@/lib/session";
import { firstParam, num, sgDate, sgDateTime } from "@/lib/utils";
import { cancelLeave } from "../actions";

type Clash = { name: string; start: string; end: string; status: string; ref: string };

export default async function LeaveDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase, me } = await requireMe();
  if (!me) return null;

  const { data: r } = await supabase
    .from("leave_requests")
    .select(
      "*, leave_types(name), employee:employees!leave_requests_employee_id_fkey(full_name), approver:employees!leave_requests_approver_id_fkey(full_name), decider:employees!leave_requests_decided_by_fkey(full_name)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!r) notFound();

  const { data: events } = await supabase
    .from("request_events")
    .select("id, action, remark, created_at, actor:employees(full_name)")
    .eq("entity_type", "leave")
    .eq("entity_id", id)
    .order("created_at");

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
  const canCancel =
    (r.employee_id === me.id || can.hr(me.role)) && (r.status === "pending" || (r.status === "approved" && r.end_date >= today));
  const clashes = (r.clashes ?? []) as Clash[];
  const emp = r.employee as { full_name: string } | null;

  return (
    <>
      <PageHeader title={r.ref} subtitle={`${emp?.full_name} · submitted ${sgDateTime(r.submitted_at)}`} action={<StatusBadge status={r.status} />} />
      <Flash ok={firstParam(sp.ok)} err={firstParam(sp.err)} />
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <dl className="grid gap-x-8 gap-y-3 p-5 text-sm sm:grid-cols-2">
            <Item k="Type" v={(r.leave_types as { name: string } | null)?.name} />
            <Item k="Dates" v={`${sgDate(r.start_date)} – ${sgDate(r.end_date)}${r.day_part !== "full" ? ` (${r.day_part.toUpperCase()})` : ""}`} />
            <Item k="Working days" v={String(num(r.days))} />
            <Item k="Balance before → after" v={r.balance_before != null ? `${num(r.balance_before)} → ${num(r.balance_after)}` : "—"} />
            <Item k="Approver" v={(r.approver as { full_name: string } | null)?.full_name} />
            <Item k="MC no." v={r.mc_number} />
            <Item k="Reason" v={r.reason} />
            {r.decided_at && (
              <Item k="Decision" v={`${(r.decider as { full_name: string } | null)?.full_name ?? "—"} · ${sgDateTime(r.decided_at)}`} />
            )}
            {r.decision_remark && <Item k="Remark" v={r.decision_remark} />}
          </dl>
          <div className="space-y-3 border-t border-line p-5">
            <Flags flags={r.flags} />
            {!!clashes.length && (
              <div className="rounded-lg bg-orange-50 p-3 text-sm text-orange-900">
                <b>Team overlap when submitted</b>
                <ul className="mt-1 text-xs">
                  {clashes.map((c) => (
                    <li key={c.ref}>{c.name}: {sgDate(c.start)} – {sgDate(c.end)} ({c.status})</li>
                  ))}
                </ul>
              </div>
            )}
            {canCancel && (
              <form action={cancelLeave} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={r.id} />
                <input name="remark" placeholder="Reason (optional)" className="input max-w-xs" />
                <SubmitButton className="btn-secondary">Cancel request</SubmitButton>
              </form>
            )}
          </div>
        </section>
        <Timeline events={(events ?? []) as never} />
      </div>
    </>
  );
}

function Item({ k, v }: { k: string; v?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="font-medium">{v || "—"}</dd>
    </div>
  );
}
