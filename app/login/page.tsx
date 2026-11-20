import { Flash } from "@/components/badges";
import { SubmitButton } from "@/components/ui";
import { firstParam } from "@/lib/utils";
import { signIn, signUp } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-accent text-2xl font-black text-white">W</div>
          <h1 className="text-2xl font-semibold">Workday Clone</h1>
          <p className="text-sm text-muted">Leave, claims and approvals in one place</p>
        </div>
        <div className="card p-6">
          <Flash ok={firstParam(sp.ok)} err={firstParam(sp.err)} />
          <form className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Work email</label>
              <input id="email" name="email" type="email" required className="input" autoComplete="email" />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" name="password" type="password" required minLength={8} className="input" autoComplete="current-password" />
            </div>
            <div className="flex gap-2">
              <SubmitButton className="btn-primary flex-1" pendingText="Signing in…">Sign in</SubmitButton>
              <button formAction={signUp} className="btn-secondary flex-1">Create account</button>
            </div>
          </form>
          <p className="mt-4 text-xs text-muted">
            New accounts are linked automatically to the staff record that has the same email. If yours isn&apos;t listed, ask HR.
          </p>
        </div>
      </div>
    </main>
  );
}
