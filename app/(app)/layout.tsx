import Link from "next/link";
import { requireEmployee, FINANCE_ROLES, HR_VIEW_ROLES } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/format";
import { signOut } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, me } = await requireEmployee();

  const mine = `approver_id.eq.${me.id},escalated_to.eq.${me.id}`;
  const [leaveQ, claimQ, unreadQ] = await Promise.all([
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending").or(mine),
    supabase.from("claims").select("id", { count: "exact", head: true }).eq("status", "pending").or(mine),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  const approvals = (leaveQ.count ?? 0) + (claimQ.count ?? 0);
  const unread = unreadQ.count ?? 0;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">
            Workday<span>Clone</span>
          </Link>
          <div className="spacer" />
          <Link href="/notifications" className="bell" aria-label="Notifications">
            Notifications
            {unread > 0 && <span className="count">{unread}</span>}
          </Link>
          <span className="who">
            {me.full_name} &middot; {ROLE_LABEL[me.role] ?? me.role}
          </span>
          <form action={signOut}>
            <button type="submit" className="link">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <nav className="nav">
        <div className="nav-inner">
          <Link href="/">Home</Link>
          <Link href="/leave/new">Apply for leave</Link>
          <Link href="/leave">My leave</Link>
          <Link href="/calendar">Team calendar</Link>
          <Link href="/claims/new">New claim</Link>
          <Link href="/claims">My claims</Link>
          <Link href="/approvals">
            Approvals
            {approvals > 0 && <span className="count">{approvals}</span>}
          </Link>
          {FINANCE_ROLES.includes(me.role) && <Link href="/finance">Finance</Link>}
          {HR_VIEW_ROLES.includes(me.role) && <Link href="/hr">HR</Link>}
        </div>
      </nav>
      <main className="container">{children}</main>
    </>
  );
}
