import { label, sgDateTime } from "@/lib/utils";

type Ev = { id: number; action: string; remark: string | null; created_at: string; actor?: { full_name: string } | null };

export function Timeline({ events }: { events: Ev[] }) {
  return (
    <section className="card">
      <div className="card-header"><h2 className="card-title">Audit trail</h2></div>
      <ol className="divide-y divide-line">
        {events.map((e) => (
          <li key={e.id} className="px-4 py-3 text-sm">
            <div className="flex justify-between gap-2">
              <b>{label(e.action)}</b>
              <span className="text-xs text-muted">{sgDateTime(e.created_at)}</span>
            </div>
            <div className="text-xs text-muted">{e.actor?.full_name ?? "System"}</div>
            {e.remark && <div className="mt-1 rounded bg-canvas px-2 py-1">“{e.remark}”</div>}
          </li>
        ))}
        {!events.length && <li className="px-4 py-4 text-sm text-muted">No events.</li>}
      </ol>
    </section>
  );
}
