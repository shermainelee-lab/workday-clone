"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ErrorList, Flags } from "@/components/ui";
import { days, fmtDate, fmtRange, type Row } from "@/lib/format";

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

const CHILD_TYPES = ["MAT", "PAT", "SPL"];

export default function LeaveForm({ types, children }: { types: Row[]; children: Row[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [part, setPart] = useState<"full" | "am" | "pm">("full");
  const [childId, setChildId] = useState("");
  const [reason, setReason] = useState("");
  const [mc, setMc] = useState(""); // storage path of the uploaded medical certificate
  const [mcName, setMcName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const type = types.find((t) => t.id === typeId);
  const needsChild = CHILD_TYPES.includes(type?.code);
  const childParam = needsChild ? childId || null : null;

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
        p_child: childParam,
      });
      setPreview(error ? { errors: [error.message] } : (data as Preview));
    }, 300);
    return () => clearTimeout(handle);
  }, [supabase, typeId, start, end, part, mc, childParam]);

  async function uploadCert(file: File | undefined) {
    if (!file) return;
    setSubmitErrors([]);
    if (file.size > 5 * 1024 * 1024) {
      setSubmitErrors(["The file is larger than 5 MB. Upload a smaller photo or PDF."]);
      return;
    }
    setUploading(true);
    const { data: auth } = await supabase.auth.getUser();
    const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
    const path = `${auth.user?.id}/${Date.now()}-${safe}`;
    const { error } = await supabase.storage.from("medical-certificates").upload(path, file, { contentType: file.type || undefined });
    setUploading(false);
    if (error) {
      setSubmitErrors([`Could not upload the file: ${error.message}`]);
      return;
    }
    setMc(path);
    setMcName(file.name);
  }

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
      p_child: childParam,
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

  const canSubmit = !busy && !uploading && !!preview && (preview.errors ?? []).length === 0 && !!start && !!end;

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
        {needsChild && (
          <div className="field">
            <label htmlFor="child">Child</label>
            <select id="child" value={childId} onChange={(e) => setChildId(e.target.value)}>
              <option value="">Select a child</option>
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.child_name} (born {fmtDate(c.date_of_birth)})
                </option>
              ))}
            </select>
            {children.length === 0 && <div className="muted">Add your child under Family details on your profile first.</div>}
          </div>
        )}
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
            <label htmlFor="mc">Medical certificate</label>
            {mc ? (
              <div>
                {mcName}{" "}
                <button type="button" className="secondary small" onClick={() => { setMc(""); setMcName(""); }}>
                  Remove
                </button>
              </div>
            ) : (
              <input id="mc" type="file" accept="application/pdf,image/*" disabled={uploading} onChange={(e) => uploadCert(e.target.files?.[0])} />
            )}
            <div className="muted">{uploading ? "Uploading..." : "Attach a photo or PDF (up to 5 MB). Only you, your approver and HR can see it."}</div>
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
