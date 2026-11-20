import Link from "next/link";
import { notFound } from "next/navigation";
import { Flags, Flash, PageHeader, StatusBadge } from "@/components/badges";
import { can, requireMe } from "@/lib/session";
import { firstParam, money, sgDate } from "@/lib/utils";
import { payClaim, returnClaim } from "./actions";

export default async function Finance({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, me } = await requireMe();
  if (!me || !can.financeView(me.role)) notFound();
  const canPay = can.finance(me.role);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });

  const [{ data: queue }, { data: recent }] = await Promise.all([
    supabase
      .from("claims")
      .select("id, ref, description, total_amount, currency, flags, decided_at, employee:employees!claims_employee_id_fkey(full_name)")
      .eq("status", "submitted_to_finance")
      .order("decided_at"),
    supabase
      .from("claims")
      .select("id, ref, description, total_amount, currency, status, paid_on, payment_reference, employee:employees!claims_employee_id_fkey(full_name)")
      .in("status", ["paid", "returned"])
      .order("updated_at", { ascending: false })
      .limit(15),
  ]);
  const queueTotal = (queue ?? []).reduce((s, c) => s + Number(c.total_amount), 0);

  return (
    <>
      <PageHeader
        title="Finance — payment queue"
        subtitle={`${queue?.length ?? 0} approved claim(s) ready to pay · ${money(queueTotal)}`}
        action={<a href="/api/export/claims" className="btn-secondary">Export claims CSV</a>}
      />
      <Flash ok={firstParam(sp.ok)} err={firstParam(sp.err)} />

      <div className="mb-8 space-y-3">
        {(queue ?? []).map((c) => (
          <div key={c.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <b>{(c.employee as unknown as { full_name: string } | null)?.full_name}</b> ·{" "}
                <Link href={`/claims/${c.id}`} className="text-brand">{c.ref}</Link>
                <div className="text-sm">{c.description} · <b>{money(c.total_amount, c.currency)}</b></div>
                <div className="text-xs text-muted">Approved {sgDate(c.decided_at)}</div>
              </div>
              <Flags flags={c.flags} />
            </div>
            {canPay && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <form action={payClaim} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="date" name="paid_on" defaultValue={today} className="input w-40" required />
                  <input name="reference" placeholder="Payment ref e.g. PAYROLL-2026-11" className="input w-64" required />
                  <button className="btn-primary">Mark paid</button>
                </form>
                <form action={returnClaim} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="remark" placeholder="Reason for returning (e.g. receipt missing)" className="input w-72" required />
                  <button className="btn-secondary">Return</button>
                </form>
              </div>
            )}
          </div>
        ))}
        {!queue?.length && <div className="card p-6 text-center text-sm text-muted">No claims waiting for payment.</div>}
      </div>

      <h2 className="mb-2 text-sm font-semibold text-muted">RECENTLY PROCESSED</h2>
      <div className="card overflow-x-auto">
        <table className="w-full">
          <tbody className="divide-y divide-line">
            {(recent ?? []).map((c) => (
              <tr key={c.id}>
                <td className="td"><Link href={`/claims/${c.id}`} className="font-semibold text-brand">{c.ref}</Link></td>
                <td className="td">{(c.employee as unknown as { full_name: string } | null)?.full_name}</td>
                <td className="td">{c.description}</td>
                <td className="td whitespace-nowrap">{money(c.total_amount, c.currency)}</td>
                <td className="td"><StatusBadge status={c.status} /></td>
                <td className="td text-xs">{c.paid_on ? `${sgDate(c.paid_on)} · ${c.payment_reference}` : ""}</td>
              </tr>
            ))}
            {!recent?.length && <tr><td className="td py-6 text-center text-muted">Nothing processed yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
