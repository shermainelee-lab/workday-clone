import Link from "next/link";
import { requireEmployee } from "@/lib/session";
import { fmtDate, todaySG, type Row } from "@/lib/format";
import { KIND_LABEL, ownedRoles } from "@/lib/checklist";
import { TaskToggle } from "@/components/Onboarding";

export default async function OnboardingPage() {
  const { supabase, me } = await requireEmployee();
  const today = todaySG();
  const roles = ownedRoles(me.role);
  const mine = [`assignee_id.eq.${me.id}`, roles.length ? `and(assignee_id.is.null,owner_role.in.(${roles.join(",")}))` : null].filter(Boolean).join(",");

  const [{ data: tasks }, { data: lists }] = await Promise.all([
    supabase
      .from("checklist_tasks")
      .select("*, checklists!inner(id, kind, status, employee:employees!checklists_employee_id_fkey(full_name))")
      .eq("checklists.status", "open")
      .is("done_at", null)
      .or(mine)
      .order("due_date"),
    supabase
      .from("checklists")
      .select("id, kind, status, anchor_date, employee:employees!checklists_employee_id_fkey(full_name)")
      .order("created_at", { ascending: false }),
  ]);

  const ids = (lists ?? []).map((l) => l.id);
  const { data: counts } = ids.length
    ? await supabase.from("checklist_tasks").select("checklist_id, done_at").in("checklist_id", ids)
    : { data: [] as Row[] };
  const progress: Record<string, { done: number; total: number }> = {};
  (counts ?? []).forEach((t: Row) => {
    const p = (progress[t.checklist_id] ??= { done: 0, total: 0 });
    p.total += 1;
    if (t.done_at) p.done += 1;
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Onboarding &amp; offboarding</h1>
          <p className="muted">Your open tasks, and the checklists you can see.</p>
        </div>
      </div>

      <div className="card">
        <h2>My open tasks</h2>
        {(tasks ?? []).length === 0 ? (
          <p className="empty">Nothing waiting on you.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <tbody>
                {(tasks as Row[]).map((t) => (
                  <tr key={t.id}>
                    <td style={{ width: 40 }}>
                      <TaskToggle id={t.id} done={false} canAct />
                    </td>
                    <td>
                      {t.title}
                      <div className="muted small">
                        <Link href={`/onboarding/${t.checklists.id}`}>
                          {KIND_LABEL[t.checklists.kind]}: {t.checklists.employee?.full_name}
                        </Link>
                      </div>
                    </td>
                    <td className="right nowrap">
                      {fmtDate(t.due_date)}
                      {t.due_date < today && <div><span className="flag">Overdue</span></div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Checklists</h2>
        {(lists ?? []).length === 0 ? (
          <p className="empty">No checklists yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Type</th>
                  <th>{"Start / last day"}</th>
                  <th>Progress</th>
                  <th>Status</th>
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
                    <td>
                      {progress[l.id]?.done ?? 0} of {progress[l.id]?.total ?? 0}
                    </td>
                    <td>
                      <span className={`badge badge-${l.status === "completed" ? "approved" : l.status === "cancelled" ? "cancelled" : "pending"}`}>{l.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
