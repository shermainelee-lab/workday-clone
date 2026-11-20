import Link from "next/link";
import { PageHeader } from "@/components/badges";
import { requireMe } from "@/lib/session";
import { sgDateTime } from "@/lib/utils";
import { markAllRead } from "./actions";

export default async function Notifications() {
  const { supabase } = await requireMe();
  const { data } = await supabase
    .from("notifications")
    .select("id, subject, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  return (
    <>
      <PageHeader
        title="Notifications"
        action={<form action={markAllRead}><button className="btn-secondary">Mark all read</button></form>}
      />
      <div className="card divide-y divide-line">
        {(data ?? []).map((n) => (
          <div key={n.id} className={`px-4 py-3 ${n.read_at ? "" : "bg-sky-50/60"}`}>
            <div className="flex justify-between gap-2">
              {n.link ? <Link href={n.link} className="text-sm font-semibold text-brand">{n.subject}</Link> : <b className="text-sm">{n.subject}</b>}
              <span className="text-xs text-muted">{sgDateTime(n.created_at)}</span>
            </div>
            {n.body && <div className="text-sm text-muted">{n.body}</div>}
          </div>
        ))}
        {!data?.length && <div className="px-4 py-8 text-center text-sm text-muted">You&apos;re all caught up.</div>}
      </div>
    </>
  );
}
