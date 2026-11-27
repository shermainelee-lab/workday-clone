"use client";

import { useState } from "react";
import { ErrorList } from "@/components/ui";
import { fmtDate, type Row } from "@/lib/format";
import { useDb } from "@/components/HrForms";

// Gender and children, used to check eligibility for maternity, paternity, shared parental and childcare leave.
export function FamilyDetails({ employeeId, gender, marriageDate, children }: { employeeId: string; gender: string | null; marriageDate: string | null; children: Row[] }) {
  const { supabase, run, errors, busy } = useDb();
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [citizen, setCitizen] = useState(true);
  const [married, setMarried] = useState(true);

  return (
    <div>
      <ErrorList errors={errors} />
      <div className="field">
        <label htmlFor="gender">Gender (for maternity and paternity leave)</label>
        <select
          id="gender"
          value={gender ?? ""}
          disabled={busy}
          onChange={(e) =>
            run(() =>
              supabase.from("employee_private").upsert({ employee_id: employeeId, gender: e.target.value || null })
            )
          }
        >
          <option value="">Not set</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="mdate">Date of marriage (only if getting married, for marriage leave)</label>
        <input
          id="mdate"
          type="date"
          defaultValue={marriageDate ?? ""}
          disabled={busy}
          onBlur={(e) => {
            if ((e.target.value || null) !== marriageDate) run(() => supabase.from("employee_private").upsert({ employee_id: employeeId, marriage_date: e.target.value || null }));
          }}
        />
        <div className="muted">Enter the wedding date, or the planned date. Leave blank if not applicable.</div>
      </div>

      {children.length === 0 ? (
        <p className="empty">No children added.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Child</th>
              <th>Date of birth</th>
              <th>SG citizen</th>
              <th>Parents married</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {children.map((c) => (
              <tr key={c.id}>
                <td>{c.child_name}</td>
                <td>{fmtDate(c.date_of_birth)}</td>
                <td>{c.is_sg_citizen ? "Yes" : "No"}</td>
                <td>{c.parents_married ? "Yes" : "No"}</td>
                <td className="right">
                  <button className="secondary small" disabled={busy} onClick={() => run(() => supabase.from("employee_children").delete().eq("id", c.id))}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form
        style={{ marginTop: 12 }}
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(() =>
            supabase.from("employee_children").insert({ employee_id: employeeId, child_name: name.trim(), date_of_birth: dob, is_sg_citizen: citizen, parents_married: married })
          );
          if (ok) {
            setName("");
            setDob("");
            setCitizen(true);
            setMarried(true);
          }
        }}
      >
        <div className="row">
          <div className="field">
            <label htmlFor="cname">Child&apos;s name</label>
            <input id="cname" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="cdob">Date of birth (or expected date)</label>
            <input id="cdob" type="date" required value={dob} onChange={(e) => setDob(e.target.value)} />
          </div>
        </div>
        <div className="row">
          <label>
            <input type="checkbox" checked={citizen} onChange={(e) => setCitizen(e.target.checked)} /> Singapore citizen
          </label>
          <label>
            <input type="checkbox" checked={married} onChange={(e) => setMarried(e.target.checked)} /> Parents married (needed for paternity leave)
          </label>
        </div>
        <button type="submit" className="secondary" disabled={busy || !name.trim() || !dob}>
          Add child
        </button>
      </form>
    </div>
  );
}
