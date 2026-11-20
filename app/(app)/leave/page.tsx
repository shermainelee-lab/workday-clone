import Link from "next/link";
import { Flags, Flash, PageHeader, StatusBadge } from "@/components/badges";
import { requireMe } from "@/lib/session";
import { firstParam, num, sgDate } from "@/lib/utils";

export default async function MyLeave({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, me } = await requireMe();
  if (!me) return null;
  const { data } = await supabase
    .from("leave_requests")
    .select("id, ref, start_date, end_date, days, status, flags, submitted_at, leave_types(name)")
    .eq("employee_id", me.id)
    .order("start_date", { ascending: false });

  return (
    <>
      <PageHeader title="My leave" action={<Link href="/leave/new" className="btn-primary">Request leave</Link>} />
      <Flash ok={firstParam(sp.ok)} err={firstParam(sp.err)} />
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-line"><tr><th className="th">Ref</th><th className="th">Type</th><th className="th">Dates</th><th className="th">Days</th><th className="th">Status</th><th className="th">Flags</th></tr></thead>
          <tbody className="divide-y divide-line">
            {(data ?? []).map((r) => (
              <tr key={r.id}>
                <td className="td"><Link href={`/leave/${r.id}`} className="font-semibold text-brand">{r.ref}</Link></td>
                <td className="td">{(r.leave_types as unknown as { name: string } | null)?.name}</td>
                <td className="td whitespace-nowrap">{sgDate(r.start_date)} – {sgDate(r.end_date)}</td>
                <td className="td">{num(r.days)}</td>
                <td className="td"><StatusBadge status={r.status} /></td>
                <td className="td"><Flags flags={r.flags} /></td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={6} className="td py-8 text-center text-muted">No leave requests yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
