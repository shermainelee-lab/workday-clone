import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEmployee, HR_ROLES } from "@/lib/session";
import { days, fmtDate, REVIEW_STATUS, ROLE_LABEL, yearSG, type Row } from "@/lib/format";
import { KIND_LABEL } from "@/lib/checklist";
import { GoalManager } from "@/components/Performance";
import { FamilyDetails } from "@/components/FamilyDetails";

// Each section is filtered by the database's row-level security, so it only shows what the viewer is allowed to see.
export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me } = await requireEmployee();

  const { data } = await supabase
    .from("employees")
    .select("*, department:departments!employees_department_id_fkey(name), manager:employees!employees_manager_id_fkey(id, full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const p = data as Row;

  const [{ data: reports }, { data: balances }, { data: lists }, { data: goals }, { data: reviews }, { data: priv }, { data: kids }] = await Promise.all([
    supabase.from("employees").select("id, full_name, job_title").eq("manager_id", id).eq("is_active", true).order("full_name"),
    supabase.from("leave_balances").select("*").eq("employee_id", id).eq("year", yearSG()).order("leave_type"),
    supabase.from("checklists").select("id, kind, status, anchor_date").eq("employee_id", id).order("created_at", { ascending: false }),
    supabase.from("goals").select("*").eq("employee_id", id).order("created_at", { ascending: false }),
    supabase.from("reviews").select("id, status, cycle:review_cycles(name)").eq("employee_id", id).order("created_at", { ascending: false }),
    supabase.from("employee_private").select("gender").eq("employee_id", id).maybeSingle(),
    supabase.from("employee_children").select("*").eq("employee_id", id).order("date_of_birth"),
  ]);

  const showBalances = (balances ?? []).filter((b) => Number(b.entitled_days) + Number(b.carried_over_days) > 0);
  const isMe = id === me.id;
  const canEditGoals = isMe || HR_ROLES.includes(me.role);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{p.full_name}</h1>
          <p className="muted">
            {p.job_title ?? "Staff"}
            {p.department?.name ? ` · ${p.department.name}` : ""}
            {!p.is_active && " · Inactive"}
          </p>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>Details</h2>
          <dl className="kv">
            <dt>Employee no.</dt>
            <dd>{p.employee_no}</dd>
            <dt>Email</dt>
            <dd>{p.email}</dd>
            <dt>Reports to</dt>
            <dd>{p.manager ? <Link href={`/directory/${p.manager.id}`}>{p.manager.full_name}</Link> : "-"}</dd>
            <dt>Joined</dt>
            <dd>{fmtDate(p.join_date)}</dd>
            {p.end_date && (
              <>
                <dt>Left</dt>
                <dd>{fmtDate(p.end_date)}</dd>
              </>
            )}
            <dt>App role</dt>
            <dd>{ROLE_LABEL[p.role]}</dd>
          </dl>
        </div>
        <div className="card">
          <h2>Direct reports</h2>
          {(reports ?? []).length === 0 ? (
            <p className="empty">None.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {(reports as Row[]).map((r) => (
                <li key={r.id}>
                  <Link href={`/directory/${r.id}`}>{r.full_name}</Link> <span className="muted small">{r.job_title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showBalances.length > 0 && (
        <div className="card">
          <h2>Leave balances, {yearSG()}</h2>
          <div className="grid cols-4">
            {showBalances.map((b) => (
              <div className="stat" key={b.leave_type_id}>
                <div className="label">{b.leave_type}</div>
                <div className="value">{days(b.available_days)}</div>
                <div className="sub">available of {days(Number(b.entitled_days) + Number(b.carried_over_days))}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(isMe || HR_ROLES.includes(me.role)) && (
        <div className="card">
          <h2>Family details</h2>
          <p className="muted">Used to check eligibility for maternity, paternity, shared parental and childcare leave. Only the employee and HR can see this.</p>
          <FamilyDetails employeeId={id} gender={(priv as Row | null)?.gender ?? null} children={(kids ?? []) as Row[]} />
        </div>
      )}

      {(lists ?? []).length > 0 && (
        <div className="card">
          <h2>Onboarding &amp; offboarding</h2>
          <table>
            <tbody>
              {(lists as Row[]).map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link href={`/onboarding/${l.id}`}>{KIND_LABEL[l.kind]}</Link>
                  </td>
                  <td>{fmtDate(l.anchor_date)}</td>
                  <td className="right">{l.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {((goals ?? []).length > 0 || canEditGoals) && (
        <div className="card">
          <h2>Goals</h2>
          <GoalManager employeeId={id} goals={(goals ?? []) as Row[]} canEdit={canEditGoals} />
        </div>
      )}

      {(reviews ?? []).length > 0 && (
        <div className="card">
          <h2>Performance reviews</h2>
          <table>
            <tbody>
              {(reviews as Row[]).map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/performance/${r.id}`}>{r.cycle?.name}</Link>
                  </td>
                  <td className="right">{REVIEW_STATUS[r.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
