# 11. Database Specification

Source of truth: `leave-app/supabase/schema.sql` (776 lines, canonical fresh-install bootstrap as of commit `e0b59b7`, "harden schema.sql"), cross-checked against 9 incremental `migration-*.sql` files that were folded into it. Postgres via Supabase. Extensions used: `uuid-ossp`, `btree_gist` (required for the exclusion constraint below), `pgcrypto` (bootstrap scripts only).

## 1. Entity-Relationship Overview

```
auth.users (Supabase-managed)
   └─1:1─ employees ──self-FK──▶ employees.manager_id
        ├─1:1─ jira_accounts
        ├─1:N─ salary_details
        ├─N:N─ approver_config (employee_id, approver_id both → employees)
        ├─1:N─ leave_requests ──FK──▶ leave_types.code
        ├─1:N─ leave_adjustments ──FK──▶ leave_types.code   (unique per employee+type)
        ├─1:N─ comp_off_requests
        ├─1:N─ attendance  (unique per employee+date)
        │       └─1:N─ attendance_punches
        │       └─1:N─ attendance_regularizations
        ├─1:N─ timesheets  (unique per employee+week_start)
        │       └─1:N─ timesheet_entries
        └─1:N─ audit_log.actor_id (nullable)

company_holidays  (standalone reference table)
leave_types       (standalone reference/lookup table, seeded)
```

## 2. Tables (all 15, full column detail)

### `public.employees`
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, FK → `auth.users(id)` on delete cascade |
| `employee_code` | text | unique, not null |
| `full_name` | text | not null |
| `email` | text | unique, not null |
| `phone` | text | nullable |
| `department` | text | nullable |
| `designation` | text | nullable |
| `role` | text | not null, default `'employee'`, check ∈ (`admin`,`manager`,`employee`) |
| `joining_date` | date | not null |
| `manager_id` | uuid | FK → `employees(id)`, nullable, self-referential |
| `avatar_initials` | text | generated always as `upper(left(split_part(full_name,' ',1),1) \|\| left(split_part(full_name,' ',2),1))` stored |
| `is_active` | boolean | not null, default `true` |
| `address` | text | nullable |
| `date_of_birth` | date | nullable |
| `must_change_password` | boolean | not null, default `false` |
| `created_at` / `updated_at` | timestamptz | not null default now(); `updated_at` auto-touched |

### `public.salary_details`
`id` uuid PK · `employee_id` uuid not null FK→employees cascade · `basic_salary`, `hra`, `transport_allowance`, `other_allowances`, `pf_deduction`, `tax_deduction`, `other_deductions` — all `numeric(12,2) not null default 0` · `effective_from` date not null · `created_at`/`updated_at` timestamptz. Index: `(employee_id, effective_from desc)`. **No unique constraint on `employee_id`** despite the app's `upsertSalary()` using `onConflict:'employee_id'` — see `23_TECHNICAL_DEBT.md`.

### `public.approver_config`
`id` uuid PK · `employee_id`, `approver_id` uuid not null FK→employees cascade · `priority` int not null default 1 (1 = first) · `created_at` · **unique(employee_id, approver_id)**.

### `public.jira_accounts`
`employee_id` uuid **PK** (1:1) FK→employees cascade · `jira_host`, `jira_email` text not null · `jira_api_token` text not null (**plaintext, no encryption** — see `19_SECURITY.md`) · `created_at`/`updated_at`.

### `public.leave_types`
`id` uuid PK · `code` text unique not null · `label` text not null · `annual_days` int not null default 0 · `color` text default `'#378ADD'` · `bg_color` text default `'#E6F1FB'` · `is_comp_off` boolean default false · `is_active` boolean default true. Seed rows: `annual`(20d), `sick`(10d), `casual`(6d), `comp`(0d, is_comp_off=true).

### `public.leave_requests`
`id` uuid PK · `employee_id` uuid not null FK→employees cascade · `leave_type` text not null FK→`leave_types(code)` · `from_date`/`to_date` date not null · `days` numeric(4,1) not null · `reason` text not null · `status` text not null default `'pending'`, check ∈ (`pending`,`approved`,`rejected`,`cancelled`) · `approver_id` uuid FK→employees, nullable, **server-overwritten on insert** · `decided_on` timestamptz · `reject_reason` text · `medical_certificate_url` text · `applied_on`/`created_at` timestamptz default now(). Indexes: `(employee_id)`, `(approver_id, status)`. **Constraint**: `no_overlapping_leave` — GiST exclusion on `(employee_id WITH =, daterange(from_date,to_date,'[]') WITH &&)` where `status IN ('pending','approved')`.

### `public.leave_adjustments`
`id` uuid PK · `employee_id` uuid not null FK→employees cascade · `type_code` text not null FK→`leave_types(code)` · `adjustment` numeric(5,1) not null default 0 (signed) · `reason` text nullable · `created_at`/`updated_at` · **unique(employee_id, type_code)**.

### `public.comp_off_requests`
`id` uuid PK · `employee_id` uuid not null FK→employees cascade · `worked_date` date not null · `worked_hours` numeric(4,1) not null · `earned_days` numeric(4,1) not null · `reason` text not null · `status` text not null default `'pending'`, check ∈ (`pending`,`approved`,`rejected`) — **no `cancelled` value exists**, and **no `reject_reason` column exists**. `approver_id` uuid FK→employees, server-overwritten · `decided_on`, `applied_on`, `created_at`.

### `public.company_holidays`
`id` uuid PK · `holiday_date` date not null unique · `name` text not null · `created_at`.

### `public.audit_log`
`id` uuid PK · `actor_id` uuid FK→employees nullable · `action` text not null · `table_name` text not null · `record_id` uuid nullable · `old_values`/`new_values` jsonb · `created_at`. **Append-only** — no insert/update/delete RLS policy exists for any role; the only writers are 3 SECURITY DEFINER trigger functions.

### `public.attendance`
`id` uuid PK · `employee_id` uuid not null FK→employees cascade · `date` date not null · `check_in_time`/`check_out_time` timestamptz · `check_in_lat`/`lng`, `check_out_lat`/`lng` double precision · `check_in_address`/`check_out_address` text · `total_hours` double precision · `status` text not null default `'present'`, check ∈ (`present`,`incomplete`,`absent`) — **`'absent'` has no writer anywhere in the codebase**, it's a defined-but-unused constraint value · `created_at`. **unique(employee_id, date)**.

### `public.timesheets`
`id` uuid PK · `employee_id` uuid not null FK→employees cascade · `week_start` date not null (always a Monday by convention, not constraint) · `status` text not null default `'draft'`, check ∈ (`draft`,`submitted`,`approved`,`rejected`) — **`'locked'` is a UI-only derived pseudo-status, never written to this column** · `approver_id` uuid FK→employees nullable · `submitted_at`/`approved_at` timestamptz · `reject_reason` text (also repurposed to store late-submission reason text, prefixed `'Late submission: '`) · `total_hours` double precision default 0 · `created_at`/`updated_at`. **unique(employee_id, week_start)**. Index: `(approver_id, status)`.

### `public.timesheet_entries`
`id` uuid PK · `timesheet_id` uuid not null FK→`timesheets(id)` cascade · `employee_id` uuid not null FK→employees cascade · `date` date not null · `jira_issue_key`, `project` text nullable · `task_description` text not null · `hours` double precision, **check (hours > 0 AND hours <= 24)** · `jira_synced` boolean default false · `created_at`. Index: `(timesheet_id)`.

### `public.attendance_punches`
`id` uuid PK · `attendance_id` uuid not null FK→`attendance(id)` cascade · `employee_id` uuid not null FK→employees cascade · `punch_type` text not null, check ∈ (`check_in`,`check_out`) · `punch_time` timestamptz not null · `lat`/`lng` double precision · `address` text · `created_at`. Index: `(attendance_id)`. Supports multiple check-in/out sessions per day by design.

### `public.attendance_regularizations`
`id` uuid PK · `attendance_id` uuid not null FK→`attendance(id)` cascade · `employee_id` uuid not null FK→employees cascade · `approver_id` uuid FK→employees nullable, server-overwritten · `reason` text not null · `check_out_time` timestamptz (proposed — **note: approving a regularization does not copy this value back into `attendance.check_out_time`**, only flips `attendance.status`) · `status` text not null default `'pending'`, check ∈ (`pending`,`approved`,`rejected`) · `decided_at`, `reject_reason`, `created_at`.

**No SQL views exist anywhere in the repository** — all read-shaping happens via the RPC functions below instead.

## 3. Functions, Triggers & RPCs

| Function | Type | Purpose |
|---|---|---|
| `get_approver(emp_id)` | `SQL STABLE` | Highest-priority active `approver_config` row; falls back to active `manager_id`; else null |
| `prorated_days(joining, annual_days)` | `SQL IMMUTABLE` | Pro-rates entitlement by remaining-year fraction if `joining` is in the current year |
| `get_leave_balance(emp_id)` | `SQL STABLE` | Per-type `total`/`used`/`remaining`; `remaining = GREATEST(0, total-used)` — floors at zero, display-time only, not a stored constraint |
| `handle_updated_at()` | `plpgsql` trigger | Generic `updated_at = now()`, attached to 5 tables |
| `get_team_calendar(from, to)` | `SQL STABLE SECURITY DEFINER` | Approved-only, 6-column narrow read across all employees; revoked from `public`, granted to `authenticated` |
| `log_salary_change()` | `plpgsql SECURITY DEFINER` trigger | Writes `audit_log` on any `salary_details` INSERT/UPDATE/DELETE |
| `log_leave_adjustment()` | `plpgsql SECURITY DEFINER` trigger | Writes `audit_log` on any `leave_adjustments` INSERT/UPDATE/DELETE |
| `log_role_change()` | `plpgsql SECURITY DEFINER` trigger | Writes `audit_log` only when `employees.role` actually changes |
| `enforce_employee_self_update()` | `plpgsql` trigger (BEFORE UPDATE) | Non-admin self-updates on `employees` limited to `phone`/`address`/`date_of_birth`/`must_change_password` |
| `enforce_leave_cancellation()` | `plpgsql` trigger (BEFORE UPDATE) | Self-service leave update limited to exactly one transition: `pending→cancelled`, or not-yet-started `approved→cancelled` |
| `enforce_approver_id()` | `plpgsql` trigger (BEFORE INSERT, 3 tables) | Forcibly overwrites client-supplied `approver_id` via `get_approver()` — closes a self-approval hole |

**No PL/pgSQL "last active admin" protection exists** — that rule lives only in client code (`AdminPanel.jsx`, `Team.jsx`). See `19_SECURITY.md`.

## 4. Row Level Security — Summary

RLS is enabled on all 15 tables. Full per-policy detail is in `03_ROLES_AND_PERMISSIONS.md` §2. Two helper functions (`is_admin()`, `is_manager()`) drive the majority of policies. Notable pattern: several tables (`leave_requests`, `comp_off_requests`, `timesheets`, `attendance_regularizations`) use the `employee_id=auth.uid() OR approver_id=auth.uid() OR is_admin()` three-way pattern for select, giving requester, assigned approver, and admin visibility without a fourth "manager of requester" clause.

## 5. Business-Rule-Encoding Constraints

| Rule | Mechanism | Table |
|---|---|---|
| No two overlapping pending/approved leave requests per employee | GiST exclusion constraint `no_overlapping_leave` | `leave_requests` |
| One attendance row per employee per day | `unique(employee_id, date)` | `attendance` |
| One timesheet per employee per week | `unique(employee_id, week_start)` | `timesheets` |
| One leave-adjustment override per employee per type | `unique(employee_id, type_code)` | `leave_adjustments` |
| Timesheet entry hours must be sane | `check (hours > 0 AND hours <= 24)` | `timesheet_entries` |
| Leave balance never displays negative | `GREATEST(0, ...)` inside `get_leave_balance()` — **display-time only, not a stored constraint**; true usage can still exceed entitlement at the row level | n/a (function) |
| At least one active admin | **No DB enforcement** — client-only | n/a |

## 6. Storage

One private Storage bucket: `medical-certificates` (`public: false`, hardened from a previously public bucket per `migration-security-hardening.sql`). RLS on `storage.objects`: insert restricted to the uploading employee's own folder (`(storage.foldername(name))[1] = auth.uid()::text`); select restricted to the owner or `is_manager()`. Signed URLs generated client-side on demand, 60-second TTL.

## 7. Bootstrap / Utility SQL Scripts (repo-root `leave-app/supabase/`, outside `schema.sql`)

All contain placeholder data only (verified, no real PII) with explicit "never commit real data" header comments:
- `create-employee-direct-sql.sql` — bootstraps the very first admin (bypasses the app UI, needed before any admin exists to use it).
- `bulk-create-employees-direct-sql.sql` — unsupported direct-SQL bulk-onboarding template, bypasses the app's own validation/Edge Function.
- `set-managers-and-approvers.sql` — recovery companion for partial bulk-create failures.
- `fix-auth-users-null-tokens.sql` — one-off remediation for a GoTrue null-token sign-in bug affecting direct-SQL-created users.
- `truncate-all-tables.sql` — destructive full-reset script (removes the operator's own login too).
- 9 `migration-*.sql` files — idempotent incremental deltas, all now folded into `schema.sql` as the canonical source; kept for historical/audit value.

## 8. Known Schema-Level Gaps (cross-referenced in `19_SECURITY.md` and `23_TECHNICAL_DEBT.md`)

1. `salary_details` has no unique constraint on `employee_id` despite the app upserting with `onConflict:'employee_id'` — a live risk of either the upsert silently behaving as insert-only (creating duplicate salary history rows) or relying on an untracked index not present in the checked-in schema.
2. No DB-level check ties `leave_requests.days` to `get_leave_balance()` — balance sufficiency is UI-only.
3. No DB-level check ties `comp_off_requests` fields to attendance eligibility — the entire comp-off eligibility rule set (past-date, weekend/holiday, ≥8h, 30-day window, no-duplicate) is UI-only.
4. `comp_off_requests` has no `reject_reason` column and no `cancelled` status value.
5. No "last active admin" constraint/trigger.
6. `get_leave_balance`/`get_approver` RPCs accept an arbitrary `emp_id` parameter with no check that the caller has any relationship to that employee — any authenticated user can query any other employee's leave balance or approver via direct RPC call (mitigated by these being low-sensitivity data, but still a gap relative to RLS's otherwise-tight posture).
