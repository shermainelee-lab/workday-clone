import type { Row } from "@/lib/format";

// Roles whose members can act on role-owned tasks (mirrors complete_checklist_task in the database).
export function ownedRoles(role: string): string[] {
  if (role === "hr") return ["hr"];
  return [];
}

export function canActOnTask(task: Row, me: Row): boolean {
  if (me.role === "hr") return true;
  if (task.assignee_id === me.id) return true;
  return task.assignee_id === null && ownedRoles(me.role).includes(task.owner_role);
}

export const KIND_LABEL: Record<string, string> = { onboarding: "Onboarding", offboarding: "Offboarding" };
