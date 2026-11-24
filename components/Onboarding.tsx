"use client";

import { useState } from "react";
import { useRpc } from "@/components/ActionButtons";
import { useDb } from "@/components/HrForms";
import { ErrorList } from "@/components/ui";
import { type Row } from "@/lib/format";

export const OWNER_LABEL: Record<string, string> = {
  employee: "The employee",
  manager: "Their manager",
  hr: "HR",
  finance: "Finance",
  office_manager: "Office Manager",
};

// Tick a task done (or reopen it). The database decides who is allowed.
export function TaskToggle({ id, done, canAct }: { id: string; done: boolean; canAct: boolean }) {
  const { call, busy, errors } = useRpc();
  return (
    <div>
      <input
        type="checkbox"
        style={{ width: "auto" }}
        aria-label={done ? "Mark as not done" : "Mark as done"}
        checked={done}
        disabled={busy || !canAct}
        onChange={(e) => call("complete_checklist_task", { p_id: id, p_done: e.target.checked })}
      />
      <ErrorList errors={errors} />
    </div>
  );
}

export function CancelChecklistButton({ id }: { id: string }) {
  const { call, busy, errors } = useRpc();
  return (
    <div>
      <ErrorList errors={errors} />
      <button
        className="secondary small"
        disabled={busy}
        onClick={() => window.confirm("Cancel this checklist? Completed tasks stay on record.") && call("cancel_checklist", { p_id: id })}
      >
        Cancel checklist
      </button>
    </div>
  );
}

export function StartChecklistForm({ employees, templates, today }: { employees: Row[]; templates: Row[]; today: string }) {
  const { call, busy, errors } = useRpc();
  const [emp, setEmp] = useState("");
  const [tpl, setTpl] = useState(templates[0]?.id ?? "");
  const [anchor, setAnchor] = useState(today);
  const kind = templates.find((t) => t.id === tpl)?.kind;
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        call("start_checklist", { p_employee: emp, p_template: tpl, p_anchor: anchor });
      }}
    >
      <h3>Start a checklist</h3>
      <ErrorList errors={errors} />
      <div className="row">
        <div className="field">
          <label>Template</label>
          <select value={tpl} onChange={(e) => setTpl(e.target.value)} required>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Employee</label>
          <select value={emp} onChange={(e) => setEmp(e.target.value)} required>
            <option value="">Choose...</option>
            {employees.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} ({p.employee_no})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{kind === "offboarding" ? "Last working day" : "Start date"}</label>
          <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} required />
        </div>
      </div>
      <p className="muted small">Task due dates are counted from this date. Tasks owned by the employee or their manager are assigned to them automatically.</p>
      <button disabled={busy || templates.length === 0}>Start checklist</button>
    </form>
  );
}

// Edit the starter templates: add/remove items, change who owns them and when they fall due.
export function TemplateEditor({ templates }: { templates: (Row & { items: Row[] })[] }) {
  const { supabase, run, errors, busy } = useDb();
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState("onboarding");
  const [draft, setDraft] = useState<Record<string, { title: string; owner_role: string; due_offset_days: string }>>({});
  const d = (id: string) => draft[id] ?? { title: "", owner_role: "hr", due_offset_days: "0" };
  const setD = (id: string, k: string, v: string) => setDraft((s) => ({ ...s, [id]: { ...d(id), [k]: v } }));

  return (
    <div>
      <ErrorList errors={errors} />
      {templates.map((t) => {
        const next = Math.max(0, ...t.items.map((i) => i.sort_order)) + 1;
        return (
          <div className="card" key={t.id}>
            <div className="page-head" style={{ marginBottom: 8 }}>
              <div>
                <h3 style={{ marginBottom: 0 }}>
                  {t.name} <span className="badge">{t.kind}</span> {!t.is_active && <span className="badge badge-cancelled">Inactive</span>}
                </h3>
              </div>
              <button className="secondary small" disabled={busy} onClick={() => run(() => supabase.from("checklist_templates").update({ is_active: !t.is_active }).eq("id", t.id))}>
                {t.is_active ? "Deactivate" : "Activate"}
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Task</th>
                    <th>Owner</th>
                    <th>Due (days from date)</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {t.items.map((i) => (
                    <tr key={i.id}>
                      <td>{i.sort_order}</td>
                      <td>{i.title}</td>
                      <td>{OWNER_LABEL[i.owner_role]}</td>
                      <td>{i.due_offset_days > 0 ? `+${i.due_offset_days}` : i.due_offset_days}</td>
                      <td className="right">
                        <button className="secondary small" disabled={busy} onClick={() => run(() => supabase.from("checklist_template_items").delete().eq("id", i.id))}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form
              className="row"
              style={{ marginTop: 12, alignItems: "flex-end" }}
              onSubmit={async (e) => {
                e.preventDefault();
                const x = d(t.id);
                const ok = await run(() =>
                  supabase.from("checklist_template_items").insert({
                    template_id: t.id,
                    sort_order: next,
                    title: x.title.trim(),
                    owner_role: x.owner_role,
                    due_offset_days: Number(x.due_offset_days || 0),
                  }),
                );
                if (ok) setDraft((s) => ({ ...s, [t.id]: { title: "", owner_role: x.owner_role, due_offset_days: "0" } }));
              }}
            >
              <div className="field" style={{ flex: 3 }}>
                <label>New task</label>
                <input required value={d(t.id).title} onChange={(e) => setD(t.id, "title", e.target.value)} />
              </div>
              <div className="field">
                <label>Owner</label>
                <select value={d(t.id).owner_role} onChange={(e) => setD(t.id, "owner_role", e.target.value)}>
                  {Object.entries(OWNER_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Due (+/- days)</label>
                <input type="number" value={d(t.id).due_offset_days} onChange={(e) => setD(t.id, "due_offset_days", e.target.value)} />
              </div>
              <div className="field" style={{ flex: "0 0 auto" }}>
                <button disabled={busy}>Add task</button>
              </div>
            </form>
          </div>
        );
      })}
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(() => supabase.from("checklist_templates").insert({ name: newName.trim(), kind: newKind }));
          if (ok) setNewName("");
        }}
      >
        <h3>New template</h3>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 3 }}>
            <label>Name</label>
            <input required value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={newKind} onChange={(e) => setNewKind(e.target.value)}>
              <option value="onboarding">Onboarding</option>
              <option value="offboarding">Offboarding</option>
            </select>
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}>
            <button disabled={busy}>Create</button>
          </div>
        </div>
      </form>
    </div>
  );
}
