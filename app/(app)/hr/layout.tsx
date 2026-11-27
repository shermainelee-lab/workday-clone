import Link from "next/link";
import { redirect } from "next/navigation";
import { requireEmployee, HR_VIEW_ROLES } from "@/lib/session";

export default async function HrLayout({ children }: { children: React.ReactNode }) {
  const { me } = await requireEmployee();
  if (!HR_VIEW_ROLES.includes(me.role)) redirect("/");
  return (
    <>
      <div className="inline" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <Link className="btn secondary small" href="/hr">
          Master Leave Record
        </Link>
        <Link className="btn secondary small" href="/hr/record-leave">
          Record leave
        </Link>
        <Link className="btn secondary small" href="/hr/entitlements">
          Entitlements
        </Link>
        <Link className="btn secondary small" href="/hr/staff">
          Staff
        </Link>
        <Link className="btn secondary small" href="/hr/holidays">
          Public holidays
        </Link>
        <Link className="btn secondary small" href="/hr/report">
          Monthly report
        </Link>
        <Link className="btn secondary small" href="/hr/onboarding">
          Onboarding
        </Link>
        <Link className="btn secondary small" href="/hr/performance">
          Review cycles
        </Link>
        <Link className="btn secondary small" href="/hr/recruiting">
          Recruiting
        </Link>
      </div>
      {children}
    </>
  );
}
