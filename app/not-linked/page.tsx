import { getSession } from "@/lib/session";
import { signOut } from "@/app/actions";

export default async function NotLinkedPage() {
  const { user } = await getSession();
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>No staff record yet</h1>
        <p>
          You are signed in as <strong>{user.email}</strong>, but that email is not on the staff list, so there is no
          leave balance or approver attached to it.
        </p>
        <p className="muted small">
          Ask HR to add or correct your email on your staff record, then sign out and sign in again. (The link is made
          automatically when a confirmed email matches.)
        </p>
        <form action={signOut}>
          <button type="submit" className="secondary">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
