import { STATUS_LABEL, fmtDateTime, type Row } from "@/lib/format";

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function Flags({ flags }: { flags?: string[] | null }) {
  if (!flags || flags.length === 0) return null;
  return (
    <div>
      {flags.map((f) => (
        <span className="flag" key={f}>
          {f}
        </span>
      ))}
    </div>
  );
}

export function ErrorList({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="alert alert-error" role="alert">
      {errors.length === 1 ? (
        errors[0]
      ) : (
        <ul>
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  escalated: "Escalated (no response in 2 working days)",
  paid: "Marked as paid",
  returned: "Returned by Finance",
};

// Append-only audit trail for one request.
export function Timeline({ events, names }: { events: Row[]; names: Record<string, string> }) {
  if (events.length === 0) return <p className="muted small">No activity yet.</p>;
  return (
    <ul className="timeline">
      {events.map((ev) => (
        <li key={ev.id}>
          <strong>{ACTION_LABEL[ev.action] ?? ev.action}</strong>
          {ev.actor_id ? <> by {names[ev.actor_id] ?? "someone"}</> : <> (automatic)</>}
          <div className="muted small">{fmtDateTime(ev.created_at)}</div>
          {ev.remark && <div className="small">&ldquo;{ev.remark}&rdquo;</div>}
        </li>
      ))}
    </ul>
  );
}
