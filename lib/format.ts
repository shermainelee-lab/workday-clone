// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export function fmtDate(d?: string | null): string {
  if (!d) return "-";
  return new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtRange(start: string, end: string): string {
  return start === end ? fmtDate(start) : `${fmtDate(start)} to ${fmtDate(end)}`;
}

export function fmtDateTime(ts?: string | null): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  });
}

export function money(n: number | string | null | undefined, currency = "SGD"): string {
  const v = Number(n ?? 0);
  return `${currency} ${v.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function days(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function todaySG(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
}

export function yearSG(): number {
  return Number(todaySG().slice(0, 4));
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  submitted_to_finance: "With Finance",
  paid: "Paid",
  returned: "Returned",
};

export const ROLE_LABEL: Record<string, string> = {
  employee: "Employee",
  hr: "HR",
  director: "Director",
};

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Row[], columns: { key: string; label: string }[]): string {
  const head = columns.map((c) => csvEscape(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => csvEscape(r[c.key])).join(","));
  return [head, ...body].join("\r\n");
}

export const REVIEW_STATUS: Record<string, string> = {
  pending_self: "Awaiting self-appraisal",
  pending_supervisor: "With supervisor",
  pending_ed: "With Executive Director",
  pending_discussion: "Discussion and sign-off",
  completed: "Complete",
};
