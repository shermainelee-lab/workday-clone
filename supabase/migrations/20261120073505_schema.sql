-- Workday Clone — core schema: people, leave, claims, audit trail, notifications.
create extension if not exists btree_gist with schema extensions;

create type public.app_role as enum ('employee','office_manager','hr','finance','director','admin');
create type public.leave_status as enum ('pending','approved','rejected','cancelled');
create type public.claim_status as enum ('pending','rejected','submitted_to_finance','paid','returned','cancelled');
create type public.day_part as enum ('full','am','pm');
create type public.ledger_entry_type as enum ('usage','reversal','adjustment');

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  head_id uuid,
  created_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  employee_no text not null unique,
  full_name text not null,
  email text not null,
  job_title text,
  department_id uuid references public.departments(id) on delete set null,
  manager_id uuid references public.employees(id) on delete set null,
  role public.app_role not null default 'employee',
  join_date date not null,
  end_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_no_self_manager check (manager_id is distinct from id)
);
create unique index employees_email_lower_key on public.employees (lower(email));
create index employees_department_idx on public.employees (department_id);
create index employees_manager_idx on public.employees (manager_id);

alter table public.departments
  add constraint departments_head_fk foreign key (head_id) references public.employees(id) on delete set null;

create table public.public_holidays (
  holiday_date date primary key,
  name text not null,
  is_in_lieu boolean not null default false
);

create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_paid boolean not null default true,
  default_entitlement numeric(5,1) not null default 0,
  prorate_for_joiners boolean not null default false,
  over_limit_action text not null default 'block' check (over_limit_action in ('block','flag','none')),
  requires_certificate boolean not null default false,
  must_exhaust_type_id uuid references public.leave_types(id),
  cap_group text,
  cap_group_limit numeric(5,1),
  min_notice_days int not null default 0,
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table public.leave_entitlements (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete cascade,
  year int not null,
  entitled_days numeric(5,1) not null default 0 check (entitled_days >= 0),
  carried_over_days numeric(5,1) not null default 0 check (carried_over_days >= 0),
  note text,
  unique (employee_id, leave_type_id, year)
);

create sequence public.leave_ref_seq;
create sequence public.claim_ref_seq;

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('LV-' || to_char(now() at time zone 'Asia/Singapore','YYYY') || '-' || lpad(nextval('public.leave_ref_seq')::text, 4, '0')),
  employee_id uuid not null references public.employees(id),
  leave_type_id uuid not null references public.leave_types(id),
  start_date date not null,
  end_date date not null,
  day_part public.day_part not null default 'full',
  days numeric(4,1) not null check (days > 0),
  year int generated always as (extract(year from start_date)::int) stored,
  reason text,
  mc_number text,
  status public.leave_status not null default 'pending',
  approver_id uuid references public.employees(id),
  flags text[] not null default '{}',
  clashes jsonb not null default '[]',
  balance_before numeric(5,1),
  balance_after numeric(5,1),
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.employees(id),
  decision_remark text,
  last_reminder_at timestamptz,
  escalated_at timestamptz,
  escalated_to uuid references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_dates_ordered check (end_date >= start_date),
  constraint leave_same_year check (extract(year from start_date) = extract(year from end_date)),
  constraint leave_no_self_approval check (approver_id is distinct from employee_id),
  constraint leave_reject_needs_remark check (status <> 'rejected' or nullif(btrim(decision_remark), '') is not null),
  constraint leave_no_overlap exclude using gist (
    employee_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status in ('pending','approved'))
);
create index leave_requests_employee_idx on public.leave_requests (employee_id, start_date);
create index leave_requests_approver_idx on public.leave_requests (approver_id) where status = 'pending';
create index leave_requests_dates_idx on public.leave_requests using gist (daterange(start_date, end_date, '[]'));

-- Append-only ledger: the Master Leave Record. balance = entitlement + carry-over - sum(days).
create table public.leave_ledger (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id),
  year int not null,
  entry_type public.ledger_entry_type not null,
  days numeric(5,1) not null,
  request_id uuid references public.leave_requests(id) on delete set null,
  note text,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);
create index leave_ledger_emp_idx on public.leave_ledger (employee_id, leave_type_id, year);

create table public.claim_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  per_line_limit numeric(10,2),
  requires_receipt boolean not null default true,
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('CL-' || to_char(now() at time zone 'Asia/Singapore','YYYY') || '-' || lpad(nextval('public.claim_ref_seq')::text, 4, '0')),
  employee_id uuid not null references public.employees(id),
  description text not null,
  currency text not null default 'SGD',
  total_amount numeric(10,2) not null default 0,
  declaration_accepted boolean not null,
  status public.claim_status not null default 'pending',
  approver_id uuid references public.employees(id),
  flags text[] not null default '{}',
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.employees(id),
  decision_remark text,
  last_reminder_at timestamptz,
  escalated_at timestamptz,
  escalated_to uuid references public.employees(id),
  paid_on date,
  payment_reference text,
  paid_by uuid references public.employees(id),
  finance_remark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint claim_declaration_required check (declaration_accepted),
  constraint claim_no_self_approval check (approver_id is distinct from employee_id),
  constraint claim_reject_needs_remark check (status <> 'rejected' or nullif(btrim(decision_remark), '') is not null),
  constraint claim_paid_needs_reference check (status <> 'paid' or (nullif(btrim(payment_reference), '') is not null and paid_on is not null)),
  constraint claim_returned_needs_remark check (status <> 'returned' or nullif(btrim(finance_remark), '') is not null)
);
create index claims_employee_idx on public.claims (employee_id);
create index claims_status_idx on public.claims (status);

create table public.claim_lines (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  line_no int not null,
  expense_date date not null,
  category_id uuid not null references public.claim_categories(id),
  description text not null,
  receipt_no text,
  amount numeric(10,2) not null check (amount > 0),
  unique (claim_id, line_no)
);
create index claim_lines_receipt_idx on public.claim_lines (lower(receipt_no)) where receipt_no is not null;

create table public.request_events (
  id bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('leave','claim')),
  entity_id uuid not null,
  ref text,
  action text not null,
  actor_id uuid references public.employees(id),
  from_status text,
  to_status text,
  remark text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index request_events_entity_idx on public.request_events (entity_type, entity_id, created_at);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.employees(id) on delete cascade,
  subject text not null,
  body text,
  link text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

create function public.block_audit_changes() returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'request_events is append-only';
end $$;
create trigger request_events_immutable before update or delete on public.request_events
  for each row execute function public.block_audit_changes();

create function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
create trigger employees_touch before update on public.employees for each row execute function public.touch_updated_at();
create trigger leave_requests_touch before update on public.leave_requests for each row execute function public.touch_updated_at();
create trigger claims_touch before update on public.claims for each row execute function public.touch_updated_at();
