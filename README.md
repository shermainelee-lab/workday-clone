# Workday Clone — Leave & Claims

A Workday-style HR portal for small teams, built from the workflow blueprints in the AIA activity sheets
(Activities 1.1–1.2): **one online form for leave and expense claims, routed automatically to the right approver,
with the Master Leave Record and Finance payment queue updating on approval — zero re-keying.**

**Stack:** Next.js 15 (App Router, Server Actions) · Supabase (Postgres, Auth, RLS, `pg_cron`) · Tailwind 4 · deploys to Vercel.

## What it does

| Blueprint step | Where it lives |
| --- | --- |
| Online leave form checks balance, public holidays, MC, notice period, team clashes — live | `/leave/new` → `leave_preview()` |
| Routes to the employee's supervisor (falls back to Director/HR), approve/reject with remark in one click | `/approvals` → `decide_leave_request()` / `decide_claim()` |
| Reminder after 1 working day, escalation after 2 | `process_approval_reminders()` via `pg_cron` (weekdays 09:00 SGT) |
| Approved leave posts to the leave ledger; balances = entitlement − approved days | `leave_ledger`, `leave_balances` view, `/hr` |
| Expense claims: multi-line, receipt numbers, duplicate-receipt block, per-category limits (flagged), declaration | `/claims/new` → `submit_claim()` |
| Approved claims → Finance queue → paid (date + ref) or returned | `/finance` |
| Notifications + append-only audit trail on every request | `notifications`, `request_events` |
| Team calendar, monthly HR report (sick-leave / Mon-Fri patterns), CSV exports | `/calendar`, `/hr?tab=report`, `/api/export/*` |

Business rules (from the sheets): no one approves their own request; rejecting needs a remark; requests can't span two
years; unpaid leave only after annual leave is used up; sick leave counts toward the hospitalisation cap; short-notice,
retrospective and over-limit items are **flags**, not blocks; joiners get pro-rated annual leave.
Every rule is enforced **in the database** (security-definer RPCs + constraints), so the UI can't bypass them.

## Database schema

SQL lives in [`supabase/migrations`](supabase/migrations) (apply in timestamp order).

```
departments ──< employees >── employees (manager_id)         roles: employee | office_manager | hr | finance | director | admin
                   │
                   ├──< leave_entitlements >── leave_types   (per employee / type / year; pro-rated for joiners)
                   ├──< leave_requests >── leave_types       (ref LV-YYYY-nnnn, status, flags[], clashes, approver/escalation)
                   │        └──< leave_ledger                (append-only Master Leave Record: usage / reversal / adjustment)
                   ├──< claims ──< claim_lines >── claim_categories   (ref CL-YYYY-nnnn, Pending → With Finance → Paid)
                   └──< notifications
request_events  (immutable audit log for leave + claims)       public_holidays (MOM list 2026–27)
leave_balances  (view: entitled, used, pending, balance, available)
```

Security: RLS on every table; `anon` has no access; signed-in users read only what their role allows
(own records, their reports' requests, HR/Finance views) and **write only through the RPC functions**.
HR/admin can edit staff, entitlements, holidays and leave/claim types directly (RLS-enforced).

## Run locally

```bash
npm install
cp .env.example .env.local     # points at the Supabase project below
npm run dev
```

Supabase project: **workday-clone** (`tfjyrxliosvhuwutepzi`, ap-southeast-1). The two env vars are the project URL and the
*publishable* key (safe for the browser; RLS protects the data).

## First login (important)

Sign-in links to the staff record with the **same email** (auth users are matched by confirmed email). The seeded staff use
`@example.com` addresses, so before anyone can sign in, set real emails in the Supabase SQL editor, e.g. make yourself the HR user:

```sql
update public.employees set email = 'you@yourcompany.com' where employee_no = 'E002';  -- Priya Nair, HR
```

Then **Create account** on `/login` with that email, confirm via the emailed link, sign in. HR can then replace the demo
staff (table editor or SQL), set `manager_id`, `role`, and run `select public.ensure_entitlements(2026);`.

Replace the default entitlements (`leave_types.default_entitlement`) and claim limits (`claim_categories.per_line_limit`)
with your contract / finance-policy figures.

## Deploy to Vercel

1. Import the GitHub repo in Vercel (framework: Next.js — detected automatically; `vercel.json` pins region `sin1`).
2. Add env vars `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (values in `.env.example`).
3. In Supabase → Authentication → URL Configuration, set **Site URL** to your Vercel URL and add
   `https://<your-domain>/auth/callback` to **Redirect URLs** (needed for the email-confirmation link).

## Not built yet

Email delivery (notifications are in-app), Microsoft Teams/Outlook integration from the original blueprint, an HR UI for editing
staff/entitlements (use the Supabase table editor for now), and AI-written monthly summaries.
