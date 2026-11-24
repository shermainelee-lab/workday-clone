import Link from "next/link";
import { requireEmployee, HR_ROLES } from "@/lib/session";
import { fmtDate, todaySG, type Row } from "@/lib/format";
import { KIND_LABEL } from "@/lib/checklist";
import { StartChecklistForm } from "@/components/Onboarding";

export default async function HrOnboardingPage() {
  const { supabase, me } = await requireEmployee();
  const canEdit = HR_ROLES.includes(me.role);

  const [{ data: employees }, { data: templates }, { data: lists }] = await Promise.all([
    supabase.from("employees").select("id, full_name, employee_no").eq("is_active", true).order("full_name"),
    canEdit ? supabase.from("checklist_templates").select("id, name, kind").eq("is_active", true).order("name") : Promise.resolve({ data: [] as Row[] }),
    supabase
      .from("checklists")
      .select("id, kind, status, anchor_date, employee:employees!checklists_employee_id_fkey(full_name)")
      .eq("status", "open")
      .order("anchor_date"),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Onboarding &amp; offboarding</h1>
          <p className="muted">Start a checklist for a joiner or leaver, and follow the open ones.</p>
        </div>
        {canEdit && (
          <Link className="btn secondary small" href="/hr/templates">
            Edit templates
          </Link>
        )}
      </div>
      {canEdit && <StartChecklistForm employees={(employees ?? []) as Row[]} templates={(templates ?? []) as Row[]} today={todaySG()} />}
      <div className="card table-wrap">
        <h2>Open checklists</h2>
        {(lists ?? []).length === 0 ? (
          <p className="empty">None open.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Type</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {(lists as Row[]).map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link href={`/onboarding/${l.id}`}>{l.employee?.full_name}</Link>
                  </td>
                  <td>{KIND_LABEL[l.kind]}</td>
                  <td>{fmtDate(l.anchor_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
