"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ErrorList, Flags } from "@/components/ui";
import { days, fmtRange, type Row } from "@/lib/format";

type Preview = {
  errors: string[];
  flags?: string[];
  days?: number;
  balance?: number;
  balance_after?: number;
  clashes?: { name: string; start: string; end: string; status: string; ref: string }[];
  approver_name?: string | null;
  leave_type?: string;
};

export default function LeaveForm({ types }: { types: Row[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [part, setPart] = useState<"full" | "am" | "pm">("full");
  const [reason, setReason] = useState("");
  const [mc, setMc] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const type = types.find((t) => t.id === typeId);

  useEffect(() => {
    if (!typeId || !start || !end) {
      setPreview(null);
      return;
    }
    const handle = setTimeout(async () => {
      const { data, error } = await supabase.rpc("leave_preview", {
        p_type: typeId,
        p_start: start,
        p_end: end,
        p_part: part,
        p_mc: mc || null,
      });
      setPreview(error ? { errors: [error.message] } : (data as Preview));
    }, 300);
    return () => clearTimeout(handle);
  }, [supabase, typeId, start, end, part, mc]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSubmitErrors([]);
    const { data, error } = await supabase.rpc("submit_leave_request", {
      p_type: typeId,
      p_start: start,
      p_end: end,
      p_part: part,
      p_reason: reason || null,
      p_mc: mc || null,
    });
    setBusy(false);
    const res = (data ?? {}) as { ok?: boolean; id?: string; errors?: string[] };
    if (error || !res.ok) {
      setSubmitErrors(res.errors ?? [error?.message ?? "Could not submit the request."]);
      return;
    }
    router.push(`/leave/${res.id}`);
    router.refresh();
  }

  const canSubmit = !busy && !!preview && (preview.errors ?? []).length === 0 && !!start && !!end;

  return (
    <div className="grid cols-2">
      <form className="card" onSubmit={submit}>
        <h2>Leave details</h2>
        <div className="field">
          <label htmlFor="type">Leave type</label>
          <select id="type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="start">From</label>
            <input
              id="start"
              type="date"
              required
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (!end || end < e.target.value || part !== "full") setEnd(e.target.value);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="end">To</label>
            <input id="end" type="date" required value={end} min={start || undefined} disabled={part !== "full"} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="part">Day type</label>
          <select
            id="part"
            value={part}
            onChange={(e) => {
              const v = e.target.value as "full" | "am" | "pm";
              setPart(v);
              if (v !== "full" && start) setEnd(start);
            }}
          >
            <option value="full">Full day(s)</option>
            <option value="am">Half day (morning)</option>
            <option value="pm">Half day (afternoon)</option>
          </select>
        </div>
        {type?.requires_certificate && (
          <div className="field">
            <label htmlFor="mc">MC number</label>
            <input id="mc" value={mc} onChange={(e) => setMc(e.target.value)} placeholder="Medical certificate no." />
          </div>
        )}
        <div className="field">
          <label htmlFor="reason">Reason (optional)</label>
          <textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <ErrorList errors={submitErrors} />
        <button type="submit" disabled={!canSubmit}>
          {busy ? "Submitting..." : "Submit for approval"}
        </button>
      </form>

      <div className="card">
        <h2>Check before you submit</h2>
        {!preview && <p className="muted">Pick your dates to see working days, your balance and any team clashes.</p>}
        {preview && (
          <>
            <ErrorList errors={preview.errors ?? []} />
            {(preview.errors ?? []).length === 0 && (
              <dl className="kv">
                <dt>Working days</dt>
                <dd>
                  <strong>{days(preview.days)}</strong> (weekends and public holidays excluded)
                </dd>
                <dt>Balance</dt>
                <dd>
                  {days(preview.balance)} available &rarr; <strong>{days(preview.balance_after)}</strong> after this leave
                </dd>
                <dt>Goes to</dt>
                <dd>{preview.approver_name ?? "No approver set. Ask HR."}</dd>
              </dl>
            )}
            {(preview.flags ?? []).length > 0 && (
              <div className="alert alert-warn" style={{ marginTop: 12 }}>
                <strong>Your approver will see these flags:</strong>
                <div style={{ marginTop: 6 }}>
                  <Flags flags={preview.flags} />
                </div>
              </div>
            )}
            {(preview.clashes ?? []).length > 0 && (
              <div className="alert alert-info">
                <strong>Teammates also away on these dates:</strong>
                <ul>
                  {preview.clashes!.map((c) => (
                    <li key={c.ref}>
                      {c.name}, {fmtRange(c.start, c.end)} ({c.status})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
