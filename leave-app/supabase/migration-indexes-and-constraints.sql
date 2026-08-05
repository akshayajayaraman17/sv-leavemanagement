-- ============================================================
-- INDEXES & DATA INTEGRITY — run in Supabase SQL Editor
-- ============================================================
-- 1. Indexes on foreign key / filter columns that Postgres does not index
--    automatically, matching the query patterns in src/lib/api.js.
-- 2. A DB-level constraint stopping an employee from having two
--    overlapping pending/approved leave requests — previously only the
--    client enforced this (or didn't), so it could be bypassed entirely
--    by calling the API directly.
--
-- IMPORTANT — read before running part 2:
-- The exclusion constraint below will fail to create if any employee
-- currently has overlapping pending/approved leave requests already in
-- the table (Postgres will report the exact conflicting rows in the
-- error). If that happens, resolve/cancel the conflicting request(s)
-- first, then re-run this file. Part 1 (indexes) is independent and safe
-- to run regardless.

-- ── 1. Indexes ───────────────────────────────────────────────────────────
create index if not exists idx_leave_requests_employee   on public.leave_requests (employee_id);
create index if not exists idx_leave_requests_approver    on public.leave_requests (approver_id, status);

create index if not exists idx_comp_off_employee          on public.comp_off_requests (employee_id);
create index if not exists idx_comp_off_approver           on public.comp_off_requests (approver_id, status);

create index if not exists idx_attendance_punches_attendance on public.attendance_punches (attendance_id);

create index if not exists idx_att_regularizations_employee  on public.attendance_regularizations (employee_id);
create index if not exists idx_att_regularizations_approver  on public.attendance_regularizations (approver_id, status);

create index if not exists idx_timesheets_approver         on public.timesheets (approver_id, status);
create index if not exists idx_timesheet_entries_timesheet on public.timesheet_entries (timesheet_id);

create index if not exists idx_salary_details_employee     on public.salary_details (employee_id, effective_from desc);

-- ── 2. Prevent overlapping leave requests per employee ──────────────────
create extension if not exists btree_gist;

alter table public.leave_requests
  drop constraint if exists no_overlapping_leave;

alter table public.leave_requests
  add constraint no_overlapping_leave
  exclude using gist (
    employee_id with =,
    daterange(from_date, to_date, '[]') with &&
  )
  where (status in ('pending','approved'));
