import Link from "next/link";
import { requireEmployee, HR_ROLES } from "@/lib/session";
import { yearSG, type Row } from "@/lib/format";
import { EntitlementEditor, GenerateEntitlements } from "@/components/HrForms";

export default async function EntitlementsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const sp = await searchParams;
  const { supabase, me } = await requireEmployee();
  const year = Number(sp.year) || yearSG();
  const canEdit = HR_ROLES.includes(me.role);

  const { data } = await supabase
    .from("leave_entitlements")
    .select("*, employee:employees!leave_entitlements_employee_id_fkey(full_name), leave_type:leave_types(name, sort_order)")
    .eq("year", year);
  const rows = ((data ?? []) as Row[]).sort(
    (a, b) => a.employee.full_name.localeCompare(b.employee.full_name) || a.leave_type.sort_order - b.leave_type.sort_order,
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Entitlements, {year}</h1>
          <p className="muted">The defaults are placeholders. Replace them with the figures in each employment contract.</p>
        </div>
        <div className="inline">
          <Link className="btn secondary small" href={`/hr/entitlements?year=${year - 1}`}>
            &larr; {year - 1}
          </Link>
          <Link className="btn secondary small" href={`/hr/entitlements?year=${year + 1}`}>
            {year + 1} &rarr;
          </Link>
        </div>
      </div>
      {canEdit ? (
        <>
          <div className="card">
            <GenerateEntitlements year={year} />
          </div>
          <div className="card">
            <EntitlementEditor rows={rows} />
          </div>
        </>
      ) : (
        <div className="alert alert-info">Only HR can change entitlements.</div>
      )}
    </>
  );
}
