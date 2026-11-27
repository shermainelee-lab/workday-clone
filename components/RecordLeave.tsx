"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ErrorList } from "@/components/ui";
import { days, type Row } from "@/lib/format";

// HR enters leave that was already approved elsewhere (Excel tracker, email). It is saved as approved and deducts the balance.
export default function RecordLeave({ employees, types }: { employees: Row[]; types: Row[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [emp, setEmp] = useState("");
  const [type, setType] = useState(types[0]?.id ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [part, setPart] = useState<"full" | "am" | "pm">("full");
  const [approver, setApprover] = useState("");
  const [remark, setRemark] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<{ ref: string; name: string; days: number; after: number; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    setDone(null);
    const { data, error } = await supabase.rpc("hr_record_leave", {
      p_employee: emp,
      p_type: type,
      p_start: start,
      p_end: end,
      p_part: part,
      p_approver: approver || null,
      p_remark: remark || null,
    });
    setBusy(false);
    const res = (data ?? {}) as { ok?: boolean; ref?: string; days?: number; balance_after?: number; warnings?: string[]; errors?: string[] };
    if (error || !res.ok) {
      setErrors(res.errors ?? [error?.message ?? "Could not record the leave."]);
      return;
    }
    setDone({ ref: res.ref ?? "", name: employees.find((x) => x.id === emp)?.full_name ?? "", days: res.days ?? 0, after: res.balance_after ?? 0, warnings: res.warnings ?? [] });
    setStart("");
    setEnd("");
    setRemark("");
    router.refresh();
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Record approved leave</h2>
      <p className="muted">For leave already approved outside the system. It is saved as approved, takes the days off the balance and shows on the calendar. Leave that crosses a year end needs one entry per year.</p>
      <ErrorList errors={errors} />
      {done && (
        <div className="alert alert-ok">
          Recorded {done.ref} for {done.name}: {days(done.days)} day(s). Balance after: {days(done.after)}.
          {done.warnings.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
      )}
      <div className="row">
        <div className="field">
          <label htmlFor="rl-emp">Employee</label>
          <select id="rl-emp" required value={emp} onChange={(e) => setEmp(e.target.value)}>
            <option value="">Select</option>
            {employees.map((x) => (
              <option key={x.id} value={x.id}>
                {x.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rl-type">Leave type</label>
          <select id="rl-type" value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="rl-start">From</label>
          <input
            id="rl-start"
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
          <label htmlFor="rl-end">To</label>
          <input id="rl-end" type="date" required value={end} min={start || undefined} disabled={part !== "full"} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rl-part">Day type</label>
          <select
            id="rl-part"
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
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="rl-approver">Approved by (optional)</label>
          <select id="rl-approver" value={approver} onChange={(e) => setApprover(e.target.value)}>
            <option value="">Not recorded</option>
            {employees.map((x) => (
              <option key={x.id} value={x.id}>
                {x.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rl-remark">Note (optional)</label>
          <input id="rl-remark" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="e.g. approved by email on 20 Nov" />
        </div>
      </div>
      <button type="submit" disabled={busy || !emp || !start || !end}>
        {busy ? "Recording..." : "Record leave"}
      </button>
    </form>
  );
}
