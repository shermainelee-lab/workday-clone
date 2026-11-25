import type { Row } from "@/lib/format";

// Mirrors decide_leave_request / decide_claim in the database, which is what actually enforces it.
// Step 2 of a double approval can only be given by the second approver, never by the person who gave step 1.
export function canDecideRequest(r: Row, me: Row): boolean {
  if (r.status !== "pending" || r.employee_id === me.id) return false;
  if (r.requires_second && r.first_decided_at) {
    return r.first_decided_by !== me.id && (r.approver_id === me.id || r.escalated_to === me.id);
  }
  return r.approver_id === me.id || r.escalated_to === me.id || me.role === "director";
}
