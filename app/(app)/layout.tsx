import Link from "next/link";
import { can, requireMe } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, me } = await requireMe();

  if (!me) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="card max-w-md p-6 text-center">
          <h1 className="text-lg font-semibold">Your login isn&apos;t linked to a staff record</h1>
          <p className="mt-2 text-sm text-muted">
            Sign in with the email address HR has on file for you (and confirm it via the email we sent). HR can correct your email on the
            employee record if it is different.
          </p>
          <form action="/auth/signout" method="post" className="mt-4">
            <button className="btn-secondary">Sign out</button>
          </form>
        </div>
      </main>
    );
  }

  const [{ count: unread }, { count: waiting }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .or(`approver_id.eq.${me.id},escalated_to.eq.${me.id}`),
  ]);
  const { count: claimsWaiting } = await supabase
    .from("claims")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .or(`approver_id.eq.${me.id},escalated_to.eq.${me.id}`);
  const approvals = (waiting ?? 0) + (claimsWaiting ?? 0);

  const nav: { href: string; label: string; show: boolean; badge?: number }[] = [
    { href: "/", label: "Home", show: true },
    { href: "/leave", label: "My leave", show: true },
    { href: "/claims", label: "My claims", show: true },
    { href: "/calendar", label: "Team calendar", show: true },
    { href: "/approvals", label: "Approvals", show: true, badge: approvals },
    { href: "/finance", label: "Finance", show: can.financeView(me.role) },
    { href: "/hr", label: "HR & leave record", show: can.hrView(me.role) },
    { href: "/notifications", label: "Notifications", show: true, badge: unread ?? 0 },
  ];

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-line bg-white md:min-h-screen md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-lg font-black text-white">W</div>
          <div>
            <div className="text-sm font-bold leading-tight">Workday Clone</div>
            <div className="text-xs text-muted">Leave &amp; Claims</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0">
          {nav
            .filter((n) => n.show)
            .map((n) => (
              <Link key={n.href} href={n.href} className="flex items-center justify-between whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-ink hover:bg-canvas">
                {n.label}
                {!!n.badge && <span className="ml-2 rounded-full bg-accent px-2 text-xs font-bold text-white">{n.badge}</span>}
              </Link>
            ))}
        </nav>
        <div className="hidden border-t border-line px-4 py-4 md:mt-6 md:block">
          <div className="text-sm font-semibold">{me.full_name}</div>
          <div className="text-xs text-muted">{me.job_title}</div>
          <div className="mt-0.5 text-xs capitalize text-muted">{me.role.replace("_", " ")}</div>
          <form action="/auth/signout" method="post" className="mt-3">
            <button className="text-xs font-semibold text-brand hover:underline">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
