# Workday Clone: Leave & Claims

A small-company HR portal in the style of Workday, built on **Next.js (App Router)** and **Supabase** (Postgres, Auth, Row-Level Security). It replaces the "Excel form, email, forward, re-key into a tracker" routine with one online workflow.

It implements the workflows from the AIA activity sheets:

| Activity | What it needs | Where it lives |
|---|---|---|
| **1.1** Automated Leave Request & Approval | Online form, balance + team-clash check at apply time, routing to the right supervisor, one-click approve/reject, reminder after 1 working day and escalation after 2, tracker and balance update on approval, notifications, audit trail, monthly summary for HR | `leave_*` tables, `submit_leave_request`, `decide_leave_request`, `process_approval_reminders`, `monthly_leave_report`, `/leave`, `/approvals`, `/calendar`, `/hr/report` |
| **1.2** Leave & Claims Approval Portal | Standard templates with `LV-` / `CL-` references, validation (blocks and flags), Department Head approval, Master Leave Record against contract entitlements, claims register, Finance payment queue, status tracking, CSV export | `claims`, `claim_lines`, `leave_ledger`, `leave_entitlements`, `/claims`, `/finance`, `/hr`, `/api/export/*` |

## Roles

| Role | Can do |
|---|---|
| Employee | Apply for leave, submit claims, see own balances and requests, see the team calendar |
| Approver (anyone with direct reports) | Approve or reject their reports' leave and claims (reject needs a remark) |
| Office Manager | Read-only view of all leave, copied on every decision |
| HR | Staff, entitlements, public holidays, Master Leave Record, monthly report, CSV export |
| Finance | Pay (date + reference) or return approved claims, export CSV |
| Director | Approves for people with no manager and can step in when an approver is away |
| Admin | HR and Finance powers plus approval override |

Nobody can approve or pay their own request, enforced in the database.

## Business rules (enforced in Postgres, not in the browser)

Blocking errors, shown with a clear message and nothing saved:
overlapping leave, working days = 0 (weekend or public-holiday-only), request across two calendar years, over balance (annual, childcare, compassionate), unpaid leave while annual leave remains, missing MC number for sick leave, missing receipt number, duplicate receipt, future-dated expense, no declaration, reject without a remark, pay without a payment reference.

Flags shown to the approver (do not block): short notice, retrospective request, team clash, over the sick-leave entitlement or the combined 60-day cap, claim line over the category limit, expense older than 90 days.

Joiners are pro-rated (completed months in the joining year, rounded to half a day). Working days exclude weekends and the public holidays in `public_holidays` (MOM 2026 and 2027 are loaded).

## Database

Migrations are in `supabase/migrations/`, applied in order:

1. `schema`: tables, enums, constraints (including a no-overlap exclusion constraint and an append-only audit trail)
2. `functions`: all rules, routing, reminders, reports
3. `rls_and_privileges`: row-level security; signed-in users get read access only, writes go through the functions
4. `seed_reference_and_demo_data`: leave types, claim categories, MOM holidays, a fictional 8-person company
5. `schedule_reminders`: `pg_cron` job, weekdays 09:00 Singapore time

The Supabase project for this repo is **`workday-clone`** (ref `tfjyrxliosvhuwutepzi`, region `ap-southeast-1`) and already has these applied. To start a fresh project instead, run the five files in order in the SQL editor.

## Run locally

```bash
npm install
cp .env.example .env.local     # URL + publishable key of your Supabase project
npm run dev
```

## Deploy to Vercel

1. Import the GitHub repo in Vercel (framework is detected as Next.js; `vercel.json` pins the Singapore region).
2. Add two environment variables (Production and Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. In Supabase, go to **Authentication > URL Configuration**: set **Site URL** to your Vercel domain and add `https://<your-domain>/auth/callback` to **Redirect URLs**.
4. Keep **Confirm email** switched on (Authentication > Sign In / Providers > Email). Staff records link to a sign-in by email, and confirmation is what proves the person owns that address.

Only the public (publishable) key is used. Never add the `service_role` key to this app.

## First sign-in: claim your staff record

Sign-ins link to a staff record by **confirmed email**. The demo staff use `@example.com` addresses, so point one of them at your real email first (SQL editor in Supabase):

```sql
update public.employees set email = 'you@yourcompany.com' where employee_no = 'E002'; -- HR Manager
```

Then open the app, choose **Create an account** with that email, confirm it, and sign in. As HR you can edit every other person's email, manager, department and role on the **HR > Staff** page; each person links automatically the first time they sign in with the matching confirmed email.

To use your own people instead of the demo company, add them on the Staff page and untick Active for the demo rows.

## Replace the defaults before go-live

- **Entitlements**: HR > Entitlements. Defaults (annual 14, outpatient sick 14, hospitalisation 46, childcare 6, compassionate 3) are placeholders. Replace them with each contract's figures.
- **Claim limits**: the per-line limits on `claim_categories` are placeholders for finance policy.
- **Approval chain**: set "Reports to" for each person. Department Heads should report to the Director.

## Known limitations

- Notifications are **in-app only** (bell and Notifications page). Email, Outlook or Teams delivery needs an email provider wired to the `notifications` table, for example a Supabase Edge Function or Database Webhook.
- Claims record **receipt numbers**, not receipt images. Add Supabase Storage if you need uploads.
- Public-holiday and entitlement defaults are Singapore-specific.
- The Supabase client is untyped and `noImplicitAny` is off in `tsconfig.json`. Generate types (`supabase gen types typescript`) and re-enable it when you want stricter checking.

## Project layout

```
app/                 Next.js routes ((app) = signed-in area, hr/ = HR tabs, api/export = CSV)
components/          Client forms and action buttons
lib/                 Supabase clients, session helper, formatting
middleware.ts        Session refresh and redirect to /login
supabase/migrations/ Database schema, rules, RLS, seed data
```
