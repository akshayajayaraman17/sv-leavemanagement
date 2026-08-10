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
  address         text,
  date_of_birth   date,
  must_change_password boolean not null default false,
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
  medical_certificate_url text,
  applied_on   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- Admin leave overrides — per-employee, per-type adjustment to the base entitlement
create table public.leave_adjustments (
  id           uuid primary key default uuid_generate_v4(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  type_code    text not null references public.leave_types(code),
  adjustment   numeric(5,1) not null default 0,
  reason       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(employee_id, type_code)
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

-- Company holidays — admin-managed, used for working-day / comp-off math
create table public.company_holidays (
  id           uuid primary key default uuid_generate_v4(),
  holiday_date date not null unique,
  name         text not null,
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

-- Returns the effective approver for an employee: the highest-priority
-- active approver from approver_config, falling back to the manager only
-- if the manager is themselves active (a deactivated approver is skipped
-- rather than silently stalling every request routed to them).
create or replace function public.get_approver(emp_id uuid)
returns uuid language sql stable as $$
  select coalesce(
    (
      select ac.approver_id
      from public.approver_config ac
      join public.employees e on e.id = ac.approver_id
      where ac.employee_id = emp_id and e.is_active = true
      order by ac.priority asc
      limit 1
    ),
    (
      select m.id
      from public.employees emp
      join public.employees m on m.id = emp.manager_id
      where emp.id = emp_id and m.is_active = true
    )
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
  ),
  adj_per_type as (
    select type_code, coalesce(sum(adjustment),0) as adj_days
    from public.leave_adjustments
    where employee_id = emp_id
    group by type_code
  )
  select
    lt.code,
    lt.label,
    lt.color,
    lt.bg_color,
    case when lt.is_comp_off then (select days from comp_earned)
         else public.prorated_days((select joining_date from emp), lt.annual_days)
              + coalesce((select adj_days from adj_per_type where type_code = lt.code), 0)
    end as total,
    coalesce((select used_days from used_per_type where leave_type = lt.code), 0) as used,
    greatest(0,
      case when lt.is_comp_off then (select days from comp_earned)
           else public.prorated_days((select joining_date from emp), lt.annual_days)
                + coalesce((select adj_days from adj_per_type where type_code = lt.code), 0)
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
create trigger trg_leave_adjustments_updated_at before update on public.leave_adjustments
  for each row execute function public.handle_updated_at();

-- Narrow, purpose-built read for the team calendar: only ever returns
-- name/type/dates for approved leave, never reason or certificate links,
-- regardless of the caller's own RLS visibility into leave_requests.
create or replace function public.get_team_calendar(p_from date, p_to date)
returns table (
  employee_id     uuid,
  full_name       text,
  avatar_initials text,
  leave_type      text,
  from_date       date,
  to_date         date
) language sql stable security definer
set search_path = public
as $$
  select
    lr.employee_id,
    e.full_name,
    e.avatar_initials,
    lr.leave_type,
    lr.from_date,
    lr.to_date
  from public.leave_requests lr
  join public.employees e on e.id = lr.employee_id
  where lr.status = 'approved'
    and lr.from_date <= p_to
    and lr.to_date   >= p_from;
$$;

revoke all on function public.get_team_calendar(date, date) from public;
grant execute on function public.get_team_calendar(date, date) to authenticated;

-- ────────────────────────────────────────────────────────────
-- AUDIT TRAIL — salary changes, leave adjustments, role changes
-- ────────────────────────────────────────────────────────────
create table public.audit_log (
  id          uuid primary key default uuid_generate_v4(),
  actor_id    uuid references public.employees(id),
  action      text not null,
  table_name  text not null,
  record_id   uuid,
  old_values  jsonb,
  new_values  jsonb,
  created_at  timestamptz not null default now()
);

create or replace function public.log_salary_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, action, table_name, record_id, old_values, new_values)
  values (
    auth.uid(), 'salary_change', 'salary_details', coalesce(new.id, old.id),
    case when tg_op = 'DELETE' then to_jsonb(old) else (case when tg_op = 'UPDATE' then to_jsonb(old) else null end) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger trg_audit_salary
  after insert or update or delete on public.salary_details
  for each row execute function public.log_salary_change();

create or replace function public.log_leave_adjustment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, action, table_name, record_id, old_values, new_values)
  values (
    auth.uid(), 'leave_adjustment', 'leave_adjustments', coalesce(new.id, old.id),
    case when tg_op = 'DELETE' then to_jsonb(old) else (case when tg_op = 'UPDATE' then to_jsonb(old) else null end) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger trg_audit_leave_adjustments
  after insert or update or delete on public.leave_adjustments
  for each row execute function public.log_leave_adjustment();

create or replace function public.log_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    insert into public.audit_log (actor_id, action, table_name, record_id, old_values, new_values)
    values (
      auth.uid(), 'role_change', 'employees', new.id,
      jsonb_build_object('role', old.role),
      jsonb_build_object('role', new.role)
    );
  end if;
  return new;
end;
$$;

create trigger trg_audit_role_change
  after update on public.employees
  for each row execute function public.log_role_change();

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
alter table public.leave_adjustments enable row level security;
alter table public.company_holidays  enable row level security;
alter table public.audit_log         enable row level security;

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

-- jira_accounts: owner-only. Admins have no legitimate need to read another
-- employee's raw API token, so they are deliberately excluded here.
create policy "jira_accounts_select_own" on public.jira_accounts for select using (
  auth.uid() = employee_id
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

-- ── employees ──
-- Everyone can read basic employee info (needed for dropdowns)
create policy "employees_read_all"       on public.employees for select using (true);
-- Only admins can insert/update/delete employees
create policy "employees_admin_insert"   on public.employees for insert with check (public.is_admin());
create policy "employees_admin_update"   on public.employees for update using (public.is_admin());
create policy "employees_admin_delete"   on public.employees for delete using (public.is_admin());
-- Employees may also reach (and, per the trigger below, only touch a
-- narrow set of fields on) their own row.
create policy "employees_update_own"     on public.employees for update using (id = auth.uid());

-- A bare "id = auth.uid()" policy has no column-level granularity on its
-- own — this trigger restricts a non-admin self-update to exactly the
-- fields Profile.jsx and the forced password-change flow need to touch.
create or replace function public.enforce_employee_self_update()
returns trigger language plpgsql as $$
begin
  if auth.uid() = old.id and not public.is_admin() then
    if new.employee_code is distinct from old.employee_code
       or new.full_name     is distinct from old.full_name
       or new.email          is distinct from old.email
       or new.department     is distinct from old.department
       or new.designation    is distinct from old.designation
       or new.role            is distinct from old.role
       or new.joining_date    is distinct from old.joining_date
       or new.manager_id      is distinct from old.manager_id
       or new.is_active       is distinct from old.is_active
    then
      raise exception 'You can only update your own phone, address, date of birth, and password-change status';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_employee_self_update before update on public.employees
  for each row execute function public.enforce_employee_self_update();

-- ── salary_details — ADMIN ONLY ──
create policy "salary_admin_only"        on public.salary_details for all using (public.is_admin());

-- ── approver_config ──
create policy "approver_read_all"        on public.approver_config for select using (true);
create policy "approver_admin_write"     on public.approver_config for all using (public.is_admin());

-- ── leave_types ──
create policy "leave_types_read_all"     on public.leave_types for select using (true);
create policy "leave_types_admin_write"  on public.leave_types for all using (public.is_admin());

-- ── company_holidays ──
create policy "holidays_read_all"        on public.company_holidays for select using (true);
create policy "holidays_admin_write"     on public.company_holidays for all using (public.is_admin());

-- ── audit_log — admin read-only, all writes come from SECURITY DEFINER triggers ──
create policy "audit_log_admin_read"     on public.audit_log for select using (public.is_admin());

-- ── leave_adjustments ── employees can see their own override, only admins can write
create policy "leave_adjustments_select" on public.leave_adjustments for select using (
  employee_id = auth.uid() or public.is_admin()
);
create policy "leave_adjustments_admin_write" on public.leave_adjustments for insert with check (public.is_admin());
create policy "leave_adjustments_admin_update" on public.leave_adjustments for update using (public.is_admin());
create policy "leave_adjustments_admin_delete" on public.leave_adjustments for delete using (public.is_admin());

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
-- Employees may also reach (and, per the trigger below, only cancel) their own row
create policy "leave_requests_cancel_own" on public.leave_requests for update using (
  employee_id = auth.uid()
);

-- A client update reaching leave_requests_cancel_own could otherwise change
-- any field alongside status — this trigger constrains a self-service edit
-- to exactly one transition: pending or not-yet-started-approved → cancelled,
-- with every other column left untouched. Approver/admin updates (approve
-- and reject) are unaffected.
create or replace function public.enforce_leave_cancellation()
returns trigger language plpgsql as $$
begin
  if auth.uid() = old.employee_id
     and not (auth.uid() = old.approver_id or public.is_admin())
  then
    if new.status is distinct from 'cancelled'
       or old.status not in ('pending', 'approved')
       or (old.status = 'approved' and old.from_date < current_date)
       or new.leave_type   is distinct from old.leave_type
       or new.from_date    is distinct from old.from_date
       or new.to_date      is distinct from old.to_date
       or new.days         is distinct from old.days
       or new.reason       is distinct from old.reason
       or new.employee_id  is distinct from old.employee_id
       or new.approver_id  is distinct from old.approver_id
    then
      raise exception 'You can only cancel your own pending, or not-yet-started approved, leave requests';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_leave_cancellation before update on public.leave_requests
  for each row execute function public.enforce_leave_cancellation();

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
