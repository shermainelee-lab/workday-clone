import type { Row } from "@/lib/format";

// Roles whose members can act on role-owned tasks (mirrors complete_checklist_task in the database).
export function ownedRoles(role: string): string[] {
  if (role === "admin") return ["hr", "finance", "office_manager"];
  if (role === "hr") return ["hr"];
  if (role === "finance") return ["finance"];
  if (role === "office_manager") return ["office_manager"];
  return [];
}

export function canActOnTask(task: Row, me: Row): boolean {
  if (["hr", "admin"].includes(me.role)) return true;
  if (task.assignee_id === me.id) return true;
  return task.assignee_id === null && ownedRoles(me.role).includes(task.owner_role);
}

export const KIND_LABEL: Record<string, string> = { onboarding: "Onboarding", offboarding: "Offboarding" };
