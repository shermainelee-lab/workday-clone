import { label } from "@/lib/utils";

const COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  submitted_to_finance: "bg-sky-100 text-sky-800",
  paid: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  returned: "bg-orange-100 text-orange-800",
  cancelled: "bg-gray-100 text-gray-600",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLORS[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status === "submitted_to_finance" ? "With Finance" : label(status)}
    </span>
  );
}

export function Flags({ flags }: { flags?: string[] | null }) {
  if (!flags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f} className="rounded bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-orange-200">
          ⚑ {f}
        </span>
      ))}
    </div>
  );
}

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <div
      className={`mb-4 rounded-lg px-4 py-3 text-sm ${err ? "bg-red-50 text-red-800 ring-1 ring-red-200" : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"}`}
    >
      {err ?? ok}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
