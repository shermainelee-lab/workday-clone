import Link from "next/link";
import { requireEmployee } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import { MarkAllRead } from "@/components/ActionButtons";

export default async function NotificationsPage() {
  const { supabase } = await requireEmployee();
  const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(60);
  const rows = data ?? [];
  const unreadIds = rows.filter((n) => !n.read_at).map((n) => n.id as string);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Notifications</h1>
          <p className="muted">Decisions, approval requests, reminders and escalations.</p>
        </div>
        <MarkAllRead ids={unreadIds} />
      </div>
      <div className="card">
        {rows.length === 0 ? (
          <p className="empty">You are all caught up.</p>
        ) : (
          <table>
            <tbody>
              {rows.map((n) => (
                <tr key={n.id} style={n.read_at ? { opacity: 0.65 } : undefined}>
                  <td>
                    <strong>{n.link ? <Link href={n.link}>{n.subject}</Link> : n.subject}</strong>
                    {n.body && <div className="small muted">{n.body}</div>}
                  </td>
                  <td className="right small muted nowrap">{fmtDateTime(n.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
