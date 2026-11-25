import { STATUS_LABEL, fmtDateTime, type Row } from "@/lib/format";

// A claim line's receipt: the attached file (or the old receipt number on claims made before uploads).
export function ReceiptLink({ line, urls }: { line: Row; urls: Record<string, string> }) {
  if (line.receipt_path) {
    const url = urls[line.receipt_path];
    return url ? (
      <a href={url} target="_blank" rel="noopener noreferrer">
        Open receipt
      </a>
    ) : (
      <span className="muted">Attached</span>
    );
  }
  return <>{line.receipt_no ?? "-"}</>;
}

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

// Shows where a request that needs two approvals has got to.
export function ApprovalSteps({ r }: { r: Row }) {
  if (!r.requires_second) return null;
  const done = ["approved", "submitted_to_finance", "paid", "returned"].includes(r.status);
  const first = r.first_decided_at
    ? `Step 1 (manager): approved by ${r.first_approver?.full_name ?? "the manager"} on ${fmtDateTime(r.first_decided_at)}`
    : r.status === "pending"
      ? `Step 1 (manager): waiting for ${r.approver?.full_name ?? "the manager"}`
      : "Step 1 (manager): not approved";
  const second = r.first_decided_at
    ? r.status === "pending"
      ? `Step 2 (Executive Director): waiting for ${r.approver?.full_name ?? "the Executive Director"}`
      : done
        ? "Step 2 (Executive Director): approved"
        : "Step 2 (Executive Director): not approved"
    : "Step 2 (Executive Director): after step 1";
  return (
    <div className="alert alert-info" style={{ marginTop: 8 }}>
      <strong>Needs two approvals</strong>
      <ul>
        <li>{first}</li>
        <li>{second}</li>
      </ul>
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  submitted: "Submitted",
  first_approved: "First approval given (now with the second approver)",
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
