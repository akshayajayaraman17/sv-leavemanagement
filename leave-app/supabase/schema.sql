-- ============================================================
-- LEAVE MANAGEMENT APP — SUPABASE SCHEMA
-- Run this entire file in Supabase SQL Editor (once)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ────────────────────────────────────────────────────────────
-- TABLES
-- ────────────────────────────────────────────────────────────

-- Employee profiles (extends Supabase auth.users)
create table public.employees (
  id              uuid primary key references auth.users(id) on delete cascade,
  employee_code   text unique not null,
  full_name       text not null,
  email           text unique not null,
  phone           text,
  department      text,
  designation     text,
  role            text not null default 'employee' check (role in ('admin','manager','employee')),
  joining_date    date not null,
  manager_id      uuid references public.employees(id),
  avatar_initials text generated always as (
    upper(left(split_part(full_name,' ',1),1) || left(split_part(full_name,' ',2),1))
  ) stored,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Salary details — admin-only visibility enforced via RLS
create table public.salary_details (
  id                uuid primary key default uuid_generate_v4(),
  employee_id       uuid not null references public.employees(id) on delete cascade,
  basic_salary      numeric(12,2) not null default 0,
  hra               numeric(12,2) not null default 0,
  transport_allowance numeric(12,2) not null default 0,
  other_allowances  numeric(12,2) not null default 0,
  pf_deduction      numeric(12,2) not null default 0,
  tax_deduction     numeric(12,2) not null default 0,
  other_deductions  numeric(12,2) not null default 0,
  effective_from    date not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Approver configuration — admin sets who approves whom
create table public.approver_config (
  id          uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  approver_id uuid not null references public.employees(id) on delete cascade,
  priority    int not null default 1,  -- 1 = first approver
  created_at  timestamptz not null default now(),
  unique(employee_id, approver_id)
);

-- Jira account links for per-user worklog posting
create table public.jira_accounts (
  employee_id   uuid primary key references public.employees(id) on delete cascade,
  jira_host     text not null,
  jira_email    text not null,
  jira_api_token text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Leave types (seeded below)
create table public.leave_types (
  id          uuid primary key default uuid_generate_v4(),
  code        text unique not null,
  label       text not null,
  annual_days int not null default 0,
  color       text not null default '#378ADD',
  bg_color    text not null default '#E6F1FB',
  is_comp_off boolean not null default false,
  is_active   boolean not null default true
);

-- Leave requests
create table public.leave_requests (
  id           uuid primary key default uuid_generate_v4(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  leave_type   text not null references public.leave_types(code),
  from_date    date not null,
  to_date      date not null,
  days         numeric(4,1) not null,
  reason       text not null,
  status       text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approver_id  uuid references public.employees(id),
  decided_on   timestamptz,
  reject_reason text,
  applied_on   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- Comp off requests (work done on holiday → earns balance)
create table public.comp_off_requests (
  id           uuid primary key default uuid_generate_v4(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  worked_date  date not null,
  worked_hours numeric(4,1) not null,
  earned_days  numeric(4,1) not null,
  reason       text not null,
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  approver_id  uuid references public.employees(id),
  decided_on   timestamptz,
  applied_on   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- SEED LEAVE TYPES
-- ────────────────────────────────────────────────────────────
insert into public.leave_types (code, label, annual_days, color, bg_color, is_comp_off) values
  ('annual',  'Annual Leave',  20, '#1D9E75', '#E1F5EE', false),
  ('sick',    'Sick Leave',    10, '#378ADD', '#E6F1FB', false),
  ('casual',  'Casual Leave',  6,  '#BA7517', '#FAEEDA', false),
  ('comp',    'Comp Off',      0,  '#7F77DD', '#EEEDFE', true);

-- ────────────────────────────────────────────────────────────
-- HELPER FUNCTIONS
-- ────────────────────────────────────────────────────────────

-- Returns the effective approver for an employee
-- (first custom approver if set, otherwise manager)
create or replace function public.get_approver(emp_id uuid)
returns uuid language sql stable as $$
  select coalesce(
    (select approver_id from public.approver_config
      where employee_id = emp_id order by priority asc limit 1),
    (select manager_id from public.employees where id = emp_id)
  );
$$;

-- Pro-rate annual entitlement based on joining date
create or replace function public.prorated_days(joining date, annual_days int)
returns int language sql immutable as $$
  select case
    when extract(year from joining) = extract(year from current_date) then
      round(
        ((date_trunc('year', joining) + interval '1 year - 1 day')::date - joining + 1)::numeric
        / (extract(doy from (date_trunc('year', joining) + interval '1 year - 1 day')))
        * annual_days
      )::int
    else annual_days
  end;
$$;

-- Get leave balance for an employee for the current year
create or replace function public.get_leave_balance(emp_id uuid)
returns table (
  type_code   text,
  label       text,
  color       text,
  bg_color    text,
  total       numeric,
  used        numeric,
  remaining   numeric
) language sql stable as $$
  with emp as (select * from public.employees where id = emp_id),
  comp_earned as (
    select coalesce(sum(earned_days),0) as days
    from public.comp_off_requests
    where employee_id = emp_id and status = 'approved'
  ),
  used_per_type as (
    select leave_type, coalesce(sum(days),0) as used_days
    from public.leave_requests
    where employee_id = emp_id
      and status = 'approved'
      and extract(year from from_date) = extract(year from current_date)
    group by leave_type
  )
  select
    lt.code,
    lt.label,
    lt.color,
    lt.bg_color,
    case when lt.is_comp_off then (select days from comp_earned)
         else public.prorated_days((select joining_date from emp), lt.annual_days)
    end as total,
    coalesce((select used_days from used_per_type where leave_type = lt.code), 0) as used,
    greatest(0,
      case when lt.is_comp_off then (select days from comp_earned)
           else public.prorated_days((select joining_date from emp), lt.annual_days)
      end
      - coalesce((select used_days from used_per_type where leave_type = lt.code), 0)
    ) as remaining
  from public.leave_types lt
  where lt.is_active = true
  order by lt.is_comp_off, lt.annual_days desc;
$$;

-- Auto-update updated_at timestamps
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_employees_updated_at before update on public.employees
  for each row execute function public.handle_updated_at();
create trigger trg_salary_updated_at before update on public.salary_details
  for each row execute function public.handle_updated_at();
create trigger trg_jira_accounts_updated_at before update on public.jira_accounts
  for each row execute function public.handle_updated_at();

-- ────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ────────────────────────────────────────────────────────────
alter table public.employees         enable row level security;
alter table public.salary_details    enable row level security;
alter table public.approver_config   enable row level security;
alter table public.leave_requests    enable row level security;
alter table public.comp_off_requests enable row level security;
alter table public.leave_types       enable row level security;
alter table public.jira_accounts     enable row level security;

create policy "jira_accounts_select_own_or_admin" on public.jira_accounts for select using (
  auth.uid() = employee_id or public.is_admin()
);

create policy "jira_accounts_insert_own" on public.jira_accounts for insert with check (
  auth.uid() = employee_id
);

create policy "jira_accounts_update_own" on public.jira_accounts for update using (
  auth.uid() = employee_id
) with check (
  auth.uid() = employee_id
);

create policy "jira_accounts_delete_own" on public.jira_accounts for delete using (
  auth.uid() = employee_id
);

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select exists (select 1 from public.employees where id = auth.uid() and role = 'admin');
$$;

-- Helper: is the current user a manager?
create or replace function public.is_manager()
returns boolean language sql stable as $$
  select exists (select 1 from public.employees where id = auth.uid() and role in ('admin','manager'));
$$;

-- ── employees ──
-- Everyone can read basic employee info (needed for dropdowns)
create policy "employees_read_all"       on public.employees for select using (true);
-- Only admins can insert/update/delete employees
create policy "employees_admin_insert"   on public.employees for insert with check (public.is_admin());
create policy "employees_admin_update"   on public.employees for update using (public.is_admin());
create policy "employees_admin_delete"   on public.employees for delete using (public.is_admin());

-- ── salary_details — ADMIN ONLY ──
create policy "salary_admin_only"        on public.salary_details for all using (public.is_admin());

-- ── approver_config ──
create policy "approver_read_all"        on public.approver_config for select using (true);
create policy "approver_admin_write"     on public.approver_config for all using (public.is_admin());

-- ── leave_types ──
create policy "leave_types_read_all"     on public.leave_types for select using (true);
create policy "leave_types_admin_write"  on public.leave_types for all using (public.is_admin());

-- ── leave_requests ──
-- Employees see their own; managers/approvers see requests assigned to them; admins see all
create policy "leave_requests_read" on public.leave_requests for select using (
  employee_id = auth.uid()
  or approver_id = auth.uid()
  or public.is_admin()
);
create policy "leave_requests_insert" on public.leave_requests for insert with check (
  employee_id = auth.uid()
);
create policy "leave_requests_update" on public.leave_requests for update using (
  approver_id = auth.uid() or public.is_admin()
);

-- ── comp_off_requests ──
create policy "comp_read" on public.comp_off_requests for select using (
  employee_id = auth.uid()
  or approver_id = auth.uid()
  or public.is_admin()
);
create policy "comp_insert" on public.comp_off_requests for insert with check (
  employee_id = auth.uid()
);
create policy "comp_update" on public.comp_off_requests for update using (
  approver_id = auth.uid() or public.is_admin()
);

-- ============================================================
-- TIMESHEET MANAGEMENT — run below in Supabase SQL Editor
-- ============================================================

-- ── Attendance (daily check-in / check-out) ──────────────────────────────────
create table public.attendance (
  id                uuid primary key default uuid_generate_v4(),
  employee_id       uuid not null references public.employees(id) on delete cascade,
  date              date not null,
  check_in_time     timestamptz,
  check_in_lat      double precision,
  check_in_lng      double precision,
  check_in_address  text,
  check_out_time    timestamptz,
  check_out_lat     double precision,
  check_out_lng     double precision,
  check_out_address text,
  total_hours       double precision,
  created_at        timestamptz not null default now(),
  unique(employee_id, date)
);

-- ── Timesheets (one per employee per week) ───────────────────────────────────
create table public.timesheets (
  id            uuid primary key default uuid_generate_v4(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  week_start    date not null,           -- always a Monday
  status        text not null default 'draft'
                  check (status in ('draft','submitted','approved','rejected')),
  approver_id   uuid references public.employees(id),
  submitted_at  timestamptz,
  approved_at   timestamptz,
  reject_reason text,
  total_hours   double precision not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(employee_id, week_start)
);

-- ── Timesheet entries (one row per task per day) ─────────────────────────────
create table public.timesheet_entries (
  id                  uuid primary key default uuid_generate_v4(),
  timesheet_id        uuid not null references public.timesheets(id) on delete cascade,
  employee_id         uuid not null references public.employees(id) on delete cascade,
  date                date not null,
  jira_issue_key      text,
  project             text,
  task_description    text not null,
  hours               double precision not null check (hours > 0 and hours <= 24),
  jira_synced         boolean not null default false,
  created_at          timestamptz not null default now()
);

-- ── Auto-updated_at trigger for timesheets ───────────────────────────────────
create trigger trg_timesheets_updated_at before update on public.timesheets
  for each row execute function public.handle_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.attendance        enable row level security;
alter table public.timesheets        enable row level security;
alter table public.timesheet_entries enable row level security;

-- Attendance: own records + managers/admins see all
create policy "attendance_select" on public.attendance for select using (
  employee_id = auth.uid() or public.is_manager()
);
create policy "attendance_insert" on public.attendance for insert with check (
  employee_id = auth.uid()
);
create policy "attendance_update" on public.attendance for update using (
  employee_id = auth.uid()
);

-- Timesheets: own + assigned approver + admin
create policy "timesheets_select" on public.timesheets for select using (
  employee_id = auth.uid()
  or approver_id = auth.uid()
  or public.is_admin()
);
create policy "timesheets_insert" on public.timesheets for insert with check (
  employee_id = auth.uid()
);
create policy "timesheets_update" on public.timesheets for update using (
  employee_id = auth.uid()
  or approver_id = auth.uid()
  or public.is_admin()
);

-- Timesheet entries: own + managers/admins
create policy "ts_entries_select" on public.timesheet_entries for select using (
  employee_id = auth.uid() or public.is_manager()
);
create policy "ts_entries_insert" on public.timesheet_entries for insert with check (
  employee_id = auth.uid()
);
create policy "ts_entries_update" on public.timesheet_entries for update using (
  employee_id = auth.uid()
);
create policy "ts_entries_delete" on public.timesheet_entries for delete using (
  employee_id = auth.uid()
);
