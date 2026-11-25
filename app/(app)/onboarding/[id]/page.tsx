import { notFound } from "next/navigation";
import { requireEmployee } from "@/lib/session";
import { fmtDate, fmtDateTime, todaySG, type Row } from "@/lib/format";
import { KIND_LABEL, canActOnTask } from "@/lib/checklist";
import { CancelChecklistButton, OWNER_LABEL, TaskToggle } from "@/components/Onboarding";

export default async function ChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me } = await requireEmployee();

  const { data: list } = await supabase
    .from("checklists")
    .select("*, employee:employees!checklists_employee_id_fkey(full_name, job_title)")
    .eq("id", id)
    .maybeSingle();
  if (!list) notFound();

  const [{ data: tasks }, { data: people }] = await Promise.all([
    supabase.from("checklist_tasks").select("*").eq("checklist_id", id).order("sort_order"),
    supabase.from("employees").select("id, full_name"),
  ]);
  const names: Record<string, string> = {};
  (people ?? []).forEach((p) => (names[p.id] = p.full_name));

  const today = todaySG();
  const rows = (tasks ?? []) as Row[];
  const done = rows.filter((t) => t.done_at).length;
  const canCancel = me.role === "hr" && list.status === "open";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {KIND_LABEL[list.kind]}: {list.employee?.full_name}
          </h1>
          <p className="muted">
            {list.employee?.job_title ?? "Staff"} &middot; {list.kind === "offboarding" ? "Last working day" : "Start date"} {fmtDate(list.anchor_date)} &middot; {done} of {rows.length} done
            {list.status !== "open" && <> &middot; {list.status}</>}
          </p>
        </div>
        {canCancel && <CancelChecklistButton id={id} />}
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th />
              <th>Task</th>
              <th>Owner</th>
              <th>Due</th>
              <th>Done</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td style={{ width: 40 }}>
                  <TaskToggle id={t.id} done={!!t.done_at} canAct={list.status !== "cancelled" && canActOnTask(t, me)} />
                </td>
                <td style={t.done_at ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{t.title}</td>
                <td>
                  {OWNER_LABEL[t.owner_role]}
                  {t.assignee_id && <div className="muted small">{names[t.assignee_id]}</div>}
                </td>
                <td className="nowrap">
                  {fmtDate(t.due_date)}
                  {!t.done_at && t.due_date < today && list.status === "open" && (
                    <div>
                      <span className="flag">Overdue</span>
                    </div>
                  )}
                </td>
                <td className="small muted">{t.done_at ? `${fmtDateTime(t.done_at)} by ${names[t.done_by] ?? "someone"}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
