"use client";
import { useActionState, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SubmitButton } from "@/components/ui";
import { submitLeave, type FormState } from "../actions";

type LeaveType = { id: string; name: string; requires_certificate: boolean };
type Clash = { name: string; start: string; end: string; status: string; ref: string };
type Preview = {
  errors?: string[];
  flags?: string[];
  days?: number;
  balance?: number;
  balance_after?: number;
  clashes?: Clash[];
  approver_name?: string;
};

export default function LeaveForm({ types, today }: { types: LeaveType[]; today: string }) {
  const [state, action] = useActionState<FormState, FormData>(submitLeave, null);
  const [type, setType] = useState(types[0]?.id ?? "");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [part, setPart] = useState("full");
  const [mc, setMc] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);

  const t = types.find((x) => x.id === type);

  useEffect(() => {
    if (!type || !start || !end) return;
    const supabase = createClient();
    const handle = setTimeout(async () => {
      const { data, error } = await supabase.rpc("leave_preview", { p_type: type, p_start: start, p_end: end, p_part: part, p_mc: mc });
      setPreview(error ? { errors: [error.message] } : (data as Preview));
    }, 300);
    return () => clearTimeout(handle);
  }, [type, start, end, part, mc]);

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-3">
      <div className="card space-y-4 p-5 lg:col-span-2">
        <div>
          <label className="label" htmlFor="type">Leave type</label>
          <select id="type" name="type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="start">From</label>
            <input id="start" name="start" type="date" className="input" value={start} onChange={(e) => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }} required />
          </div>
          <div>
            <label className="label" htmlFor="end">To</label>
            <input id="end" name="end" type="date" className="input" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="part">Day part</label>
            <select id="part" name="part" className="input" value={part} onChange={(e) => setPart(e.target.value)}>
              <option value="full">Full day(s)</option>
              <option value="am">Half day — AM</option>
              <option value="pm">Half day — PM</option>
            </select>
          </div>
        </div>
        {t?.requires_certificate && (
          <div>
            <label className="label" htmlFor="mc">Medical certificate (MC) no.</label>
            <input id="mc" name="mc" className="input" value={mc} onChange={(e) => setMc(e.target.value)} />
          </div>
        )}
        <div>
          <label className="label" htmlFor="reason">Reason (optional)</label>
          <textarea id="reason" name="reason" rows={3} className="input" />
        </div>
        {state?.errors?.length ? (
          <ul className="space-y-1 rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
            {state.errors.map((e) => <li key={e}>• {e}</li>)}
          </ul>
        ) : null}
        <SubmitButton pendingText="Submitting…">Submit for approval</SubmitButton>
      </div>

      <aside className="card h-fit space-y-3 p-5 text-sm">
        <h2 className="card-title">Live check</h2>
        {!preview && <p className="text-muted">Checking…</p>}
        {preview?.days != null && (
          <>
            <div className="flex justify-between"><span className="text-muted">Working days</span><b>{preview.days}</b></div>
            <div className="flex justify-between"><span className="text-muted">Available now</span><b>{preview.balance}</b></div>
            <div className="flex justify-between"><span className="text-muted">Balance after</span><b>{preview.balance_after}</b></div>
            <div className="flex justify-between"><span className="text-muted">Approver</span><b>{preview.approver_name ?? "—"}</b></div>
          </>
        )}
        {preview?.errors?.map((e) => (
          <p key={e} className="rounded bg-red-50 p-2 text-red-800">✕ {e}</p>
        ))}
        {preview?.flags?.map((f) => (
          <p key={f} className="rounded bg-orange-50 p-2 text-orange-800">⚑ {f} <span className="block text-xs">Allowed, but your approver will see this.</span></p>
        ))}
        {!!preview?.clashes?.length && (
          <div className="rounded bg-orange-50 p-2 text-xs text-orange-900">
            <b>Teammates off on these dates:</b>
            <ul className="mt-1">
              {preview.clashes.map((c) => (
                <li key={c.ref}>{c.name}: {c.start} → {c.end} ({c.status})</li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </form>
  );
}
