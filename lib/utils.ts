export const sgDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Singapore" }) : "—";

export const sgDateTime = (d: string | Date | null | undefined) =>
  d
    ? new Date(d).toLocaleString("en-SG", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Singapore" })
    : "—";

export const money = (n: number | string | null | undefined, cur = "SGD") =>
  `${cur} ${Number(n ?? 0).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const num = (n: number | string | null | undefined) => Number(n ?? 0);

export const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function csv(rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

export type RpcResult = { ok: boolean; errors?: string[]; id?: string; ref?: string; flags?: string[]; status?: string };

export const firstParam = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
