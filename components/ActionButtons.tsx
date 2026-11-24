"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ErrorList } from "@/components/ui";

type Result = { ok?: boolean; errors?: string[] };

export function useRpc() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function call(fn: string, args: Record<string, unknown>, after?: () => void): Promise<boolean> {
    setBusy(true);
    setErrors([]);
    const { data, error } = await supabase.rpc(fn, args);
    setBusy(false);
    const res = (data ?? {}) as Result;
    if (error || !res.ok) {
      setErrors(res.errors ?? [error?.message ?? "Something went wrong."]);
      return false;
    }
    if (after) after();
    router.refresh();
    return true;
  }
  return { call, busy, errors };
}

// Approve / reject a leave request or a claim (rejecting needs a remark).
export function DecisionPanel({ kind, id }: { kind: "leave" | "claim"; id: string }) {
  const { call, busy, errors } = useRpc();
  const [remark, setRemark] = useState("");
  const fn = kind === "leave" ? "decide_leave_request" : "decide_claim";
  return (
    <div>
      <ErrorList errors={errors} />
      <div className="field">
        <label htmlFor={`remark-${id}`}>Remark (required to reject)</label>
        <input id={`remark-${id}`} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Optional when approving" />
      </div>
      <div className="inline">
        <button className="good" disabled={busy} onClick={() => call(fn, { p_id: id, p_approve: true, p_remark: remark || null })}>
          Approve
        </button>
        <button className="danger" disabled={busy} onClick={() => call(fn, { p_id: id, p_approve: false, p_remark: remark || null })}>
          Reject
        </button>
      </div>
    </div>
  );
}

export function CancelButton({ kind, id, label = "Cancel request" }: { kind: "leave" | "claim"; id: string; label?: string }) {
  const { call, busy, errors } = useRpc();
  return (
    <div>
      <ErrorList errors={errors} />
      <button
        className="secondary small"
        disabled={busy}
        onClick={() => {
          if (window.confirm("Cancel this request?")) {
            call(kind === "leave" ? "cancel_leave_request" : "cancel_claim", { p_id: id });
          }
        }}
      >
        {label}
      </button>
    </div>
  );
}

// Finance: record payment or return a claim.
export function FinancePanel({ id }: { id: string }) {
  const { call, busy, errors } = useRpc();
  const [paidOn, setPaidOn] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" }));
  const [reference, setReference] = useState("");
  const [remark, setRemark] = useState("");
  return (
    <div>
      <ErrorList errors={errors} />
      <div className="row">
        <div className="field">
          <label htmlFor={`paid-${id}`}>Payment date</label>
          <input id={`paid-${id}`} type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`ref-${id}`}>Payment reference</label>
          <input id={`ref-${id}`} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. PAYROLL-2026-11" />
        </div>
      </div>
      <button className="good" disabled={busy} onClick={() => call("finance_pay_claim", { p_id: id, p_paid_on: paidOn, p_reference: reference })}>
        Mark as paid
      </button>
      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor={`ret-${id}`}>Or return to staff (say why)</label>
        <input id={`ret-${id}`} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="e.g. Receipt missing for line 2" />
      </div>
      <button className="danger small" disabled={busy} onClick={() => call("finance_return_claim", { p_id: id, p_remark: remark })}>
        Return claim
      </button>
    </div>
  );
}

export function MarkAllRead({ ids }: { ids: string[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (ids.length === 0) return null;
  return (
    <button
      className="secondary small"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
        setBusy(false);
        router.refresh();
      }}
    >
      Mark all as read
    </button>
  );
}
