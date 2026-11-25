import { requireEmployee, HR_ROLES } from "@/lib/session";
import { fmtDate, ROLE_LABEL, type Row } from "@/lib/format";
import { StaffManager } from "@/components/HrForms";

export default async function StaffPage() {
  const { supabase, me } = await requireEmployee();
  const canEdit = HR_ROLES.includes(me.role);
  const [{ data: employees }, { data: departments }] = await Promise.all([
    supabase.from("employees").select("*").order("employee_no"),
    supabase.from("departments").select("id, name").order("name"),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Staff</h1>
          <p className="muted">
            &ldquo;Reports to&rdquo; decides who approves each person&rsquo;s leave and claims. People with no manager (such as the Director) route to the
            Director or HR & Finance instead. Tick &ldquo;2nd approval&rdquo; for people whose leave and claims need a second approval from the Executive Director (the Director who reports to nobody) after their manager.
          </p>
        </div>
      </div>
      {canEdit ? (
        <StaffManager employees={(employees ?? []) as Row[]} departments={(departments ?? []) as Row[]} />
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>No.</th>
                <th>Name</th>
                <th>Role</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {((employees ?? []) as Row[]).map((e) => (
                <tr key={e.id}>
                  <td>{e.employee_no}</td>
                  <td>{e.full_name}</td>
                  <td>{ROLE_LABEL[e.role]}</td>
                  <td>{fmtDate(e.join_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
