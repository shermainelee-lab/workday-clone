"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ErrorList } from "@/components/ui";
import { ROLE_LABEL, fmtDate, type Row } from "@/lib/format";

export function useDb() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>): Promise<boolean> {
    setBusy(true);
    setErrors([]);
    const { error } = await fn();
    setBusy(false);
    if (error) {
      setErrors([error.message]);
      return false;
    }
    router.refresh();
    return true;
  }
  return { supabase, run, errors, busy, setErrors };
}

export function GenerateEntitlements({ year }: { year: number }) {
  const { supabase, errors, busy, setErrors } = useDb();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <ErrorList errors={errors} />
      {msg && <div className="alert alert-ok">{msg}</div>}
      <button
        className="secondary"
        disabled={busy}
        onClick={async () => {
          setErrors([]);
          setMsg(null);
          const { data, error } = await supabase.rpc("ensure_entitlements", { p_year: year });
          if (error) setErrors([error.message]);
          else {
            setMsg(`${data ?? 0} new entitlement row(s) created for ${year}. Existing rows were left as they are.`);
            router.refresh();
          }
        }}
      >
        Generate {year} entitlements (pro-rates joiners)
      </button>
    </div>
  );
}

export function EntitlementEditor({ rows }: { rows: Row[] }) {
  const { supabase, run, errors, busy } = useDb();
  const [draft, setDraft] = useState<Record<string, { entitled: string; carried: string }>>({});
  const val = (r: Row) => draft[r.id] ?? { entitled: String(r.entitled_days), carried: String(r.carried_over_days) };
  return (
    <div>
      <ErrorList errors={errors} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Leave type</th>
              <th>Entitled (days)</th>
              <th>Carried over</th>
              <th>Note</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = val(r);
              const dirty = draft[r.id] !== undefined;
              return (
                <tr key={r.id}>
                  <td>{r.employee?.full_name}</td>
                  <td>{r.leave_type?.name}</td>
                  <td style={{ width: 130 }}>
                    <input type="number" step="0.5" min="0" value={v.entitled} onChange={(e) => setDraft({ ...draft, [r.id]: { ...v, entitled: e.target.value } })} />
                  </td>
                  <td style={{ width: 130 }}>
                    <input type="number" step="0.5" min="0" value={v.carried} onChange={(e) => setDraft({ ...draft, [r.id]: { ...v, carried: e.target.value } })} />
                  </td>
                  <td className="muted small">{r.note}</td>
                  <td className="right">
                    <button
                      className="small"
                      disabled={busy || !dirty}
                      onClick={async () => {
                        const ok = await run(() =>
                          supabase
                            .from("leave_entitlements")
                            .update({ entitled_days: Number(v.entitled), carried_over_days: Number(v.carried), note: "Set by HR" })
                            .eq("id", r.id),
                        );
                        if (ok) {
                          const next = { ...draft };
                          delete next[r.id];
                          setDraft(next);
                        }
                      }}
                    >
                      Save
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StaffManager({ employees, departments }: { employees: Row[]; departments: Row[] }) {
  const { supabase, run, errors, busy } = useDb();
  const blank = { employee_no: "", full_name: "", email: "", job_title: "", department_id: "", manager_id: "", role: "employee", join_date: "" };
  const [form, setForm] = useState(blank);
  const set = (k: keyof typeof blank, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const patch = (id: string, fields: Row) => run(() => supabase.from("employees").update(fields).eq("id", id));

  return (
    <div>
      <ErrorList errors={errors} />
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(() =>
            supabase.from("employees").insert({
              employee_no: form.employee_no.trim(),
              full_name: form.full_name.trim(),
              email: form.email.trim(),
              job_title: form.job_title.trim() || null,
              department_id: form.department_id || null,
              manager_id: form.manager_id || null,
              role: form.role,
              join_date: form.join_date,
            }),
          );
          if (ok) setForm(blank);
        }}
      >
        <h3>Add a staff member</h3>
        <div className="row">
          <div className="field">
            <label>Employee no.</label>
            <input required value={form.employee_no} onChange={(e) => set("employee_no", e.target.value)} />
          </div>
          <div className="field">
            <label>Full name</label>
            <input required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
          </div>
          <div className="field">
            <label>Work email (used to link their sign-in)</label>
            <input type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>Job title</label>
            <input value={form.job_title} onChange={(e) => set("job_title", e.target.value)} />
          </div>
          <div className="field">
            <label>Department</label>
            <select value={form.department_id} onChange={(e) => set("department_id", e.target.value)}>
              <option value="">-</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Reports to (approver)</label>
            <select value={form.manager_id} onChange={(e) => set("manager_id", e.target.value)}>
              <option value="">-</option>
              {employees.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Role</label>
            <select value={form.role} onChange={(e) => set("role", e.target.value)}>
              {Object.entries(ROLE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Join date</label>
            <input type="date" required value={form.join_date} onChange={(e) => set("join_date", e.target.value)} />
          </div>
        </div>
        <button type="submit" disabled={busy}>
          Add staff member
        </button>
        <p className="muted small" style={{ marginTop: 8 }}>
          Leave entitlements are created automatically, pro-rated if they joined part-way through the year.
        </p>
      </form>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Name</th>
              <th>Email</th>
              <th>Department</th>
              <th>Reports to</th>
              <th>Role</th>
              <th title="Their leave and claims need a second approval from the Executive Director after their manager">2nd approval</th>
              <th title="Can record payment of approved claims (HR only)">Pays claims</th>
              <th>Joined</th>
              <th>Sign-in</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} style={e.is_active ? undefined : { opacity: 0.55 }}>
                <td>{e.employee_no}</td>
                <td>
                  {e.full_name}
                  <div className="muted small">{e.job_title}</div>
                </td>
                <td className="small">{e.email}</td>
                <td>
                  <select value={e.department_id ?? ""} disabled={busy} onChange={(ev) => patch(e.id, { department_id: ev.target.value || null })}>
                    <option value="">-</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={e.manager_id ?? ""} disabled={busy} onChange={(ev) => patch(e.id, { manager_id: ev.target.value || null })}>
                    <option value="">-</option>
                    {employees
                      .filter((m) => m.id !== e.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name}
                        </option>
                      ))}
                  </select>
                </td>
                <td>
                  <select value={e.role} disabled={busy} onChange={(ev) => patch(e.id, { role: ev.target.value })}>
                    {Object.entries(ROLE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label="Needs second approval"
                    checked={!!e.needs_second_approval}
                    disabled={busy}
                    onChange={(ev) => patch(e.id, { needs_second_approval: ev.target.checked })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label="Pays claims"
                    checked={!!e.can_pay_claims}
                    disabled={busy || e.role !== "hr"}
                    onChange={(ev) => patch(e.id, { can_pay_claims: ev.target.checked })}
                  />
                </td>
                <td className="nowrap">{fmtDate(e.join_date)}</td>
                <td>{e.auth_user_id ? <span className="badge badge-approved">Linked</span> : <span className="badge">Not yet</span>}</td>
                <td>
                  <input type="checkbox" checked={e.is_active} disabled={busy} onChange={(ev) => patch(e.id, { is_active: ev.target.checked })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function HolidayManager({ holidays }: { holidays: Row[] }) {
  const { supabase, run, errors, busy } = useDb();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [inLieu, setInLieu] = useState(false);
  return (
    <div>
      <ErrorList errors={errors} />
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(() => supabase.from("public_holidays").insert({ holiday_date: date, name: name.trim(), is_in_lieu: inLieu }));
          if (ok) {
            setDate("");
            setName("");
            setInLieu(false);
          }
        }}
      >
        <h3>Add a holiday</h3>
        <div className="row">
          <div className="field">
            <label>Date</label>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 2 }}>
            <label>Name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={inLieu} onChange={(e) => setInLieu(e.target.checked)} />
          <span>Holiday in lieu (observed on a weekday because the holiday fell on a rest day)</span>
        </label>
        <div style={{ marginTop: 10 }}>
          <button type="submit" disabled={busy}>
            Add holiday
          </button>
        </div>
      </form>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Holiday</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {holidays.map((h) => (
              <tr key={h.holiday_date}>
                <td className="nowrap">{fmtDate(h.holiday_date)}</td>
                <td>
                  {h.name} {h.is_in_lieu && <span className="badge">in lieu</span>}
                </td>
                <td className="right">
                  <button
                    className="secondary small"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Remove ${h.name} (${h.holiday_date})?`)) {
                        run(() => supabase.from("public_holidays").delete().eq("holiday_date", h.holiday_date));
                      }
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
