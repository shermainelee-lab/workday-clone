import Link from "next/link";
import { Flags, Flash, PageHeader, StatusBadge } from "@/components/badges";
import { requireMe } from "@/lib/session";
import { firstParam, money, sgDate } from "@/lib/utils";

export default async function MyClaims({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, me } = await requireMe();
  if (!me) return null;
  const { data } = await supabase
    .from("claims")
    .select("id, ref, description, total_amount, currency, status, flags, submitted_at, paid_on, payment_reference")
    .eq("employee_id", me.id)
    .order("submitted_at", { ascending: false });

  return (
    <>
      <PageHeader title="My claims" action={<Link href="/claims/new" className="btn-primary">New claim</Link>} />
      <Flash ok={firstParam(sp.ok)} err={firstParam(sp.err)} />
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-line"><tr><th className="th">Ref</th><th className="th">Title</th><th className="th">Total</th><th className="th">Submitted</th><th className="th">Status</th><th className="th">Payment</th></tr></thead>
          <tbody className="divide-y divide-line">
            {(data ?? []).map((c) => (
              <tr key={c.id}>
                <td className="td"><Link href={`/claims/${c.id}`} className="font-semibold text-brand">{c.ref}</Link></td>
                <td className="td">{c.description}<Flags flags={c.flags} /></td>
                <td className="td whitespace-nowrap">{money(c.total_amount, c.currency)}</td>
                <td className="td whitespace-nowrap">{sgDate(c.submitted_at)}</td>
                <td className="td"><StatusBadge status={c.status} /></td>
                <td className="td text-xs">{c.paid_on ? `${sgDate(c.paid_on)} · ${c.payment_reference}` : "—"}</td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={6} className="td py-8 text-center text-muted">No claims yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
