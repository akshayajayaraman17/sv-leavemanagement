# 03. Roles & Permissions

## 1. Role Model

Three roles, stored in `employees.role`, enforced by a single check constraint (`schema.sql:22`): `admin`, `manager`, `employee`. No sub-roles, no per-module permission flags, no custom claims — the entire authorization model is these three string values plus two SQL helper functions:

- `is_admin()` (`schema.sql:368-371`): `exists (select 1 from employees where id = auth.uid() and role = 'admin')`
- `is_manager()` (`schema.sql:374-377`): `exists (select 1 from employees where id = auth.uid() and role in ('admin','manager'))`

Both are used directly inside RLS policies (not just app code), so this matrix reflects **actual enforced** permissions, not merely intended ones — verified against `schema.sql` line-by-line in `19_SECURITY.md` §5.

Frontend gating (which nav tabs render) is a *convenience* layer only — `NAV.employee`/`NAV.manager`/`NAV.admin` in `App.jsx:25-67` control visibility, not access. Every capability below is cross-checked against the RLS policy that actually enforces it; where frontend and backend diverge, it's called out explicitly.

---

## 2. Permission Matrix

Legend: ✅ = allowed and RLS-enforced · ➖ = not applicable to role · ❌ = blocked · 🟡 = UI-only restriction (no matching DB enforcement — see note)

| Module | Function | Admin | Manager | Employee | Backend enforcement |
|---|---|---|---|---|---|
| **Leave** | View own leave requests | ✅ | ✅ | ✅ | `leave_requests_read`: `employee_id=auth.uid() OR approver_id=auth.uid() OR is_admin()` |
| | View others' leave requests (as approver) | ✅ (all) | ✅ (only if `approver_id`=self) | ❌ | same policy — admin's `is_admin()` clause is unconditional; manager only via `approver_id` match |
| | Create leave request | ✅ | ✅ | ✅ | `leave_requests_insert`: `employee_id=auth.uid()` |
| | Approve/Reject leave request | ✅ (any pending request) | ✅ (only own `approver_id` matches) | ❌ | `leave_requests_update`: `approver_id=auth.uid() OR is_admin()` |
| | Cancel own leave request | ✅ | ✅ | ✅ | `leave_requests_cancel_own` + `enforce_leave_cancellation()` trigger — restricted to `pending→cancelled` or not-yet-started `approved→cancelled` |
| | View leave balance | ✅ (any employee, via Team/Admin) | ✅ (own only, no UI to view others') | ✅ (own only) | `get_leave_balance(emp_id)` RPC — **no RLS on the RPC itself**, callable by any authenticated user for any `emp_id` 🟡 (see `19_SECURITY.md`) |
| **Comp-Off** | View own comp-off requests | ✅ | ✅ | ✅ | `comp_read`: same pattern as leave |
| | Create comp-off request | ✅ | ✅ | ✅ | `comp_insert`: `employee_id=auth.uid()` |
| | Approve/Reject comp-off | ✅ (any) | ✅ (own `approver_id` only) | ❌ | `comp_update`: `approver_id=auth.uid() OR is_admin()` |
| | Cancel own comp-off request | ❌ (no cancel exists for anyone) | ❌ | ❌ | no `status='cancelled'` value exists in the `comp_off_requests` check constraint |
| | Grant comp-off credit directly (bypass approval) | ✅ | ❌ | ❌ | UI-only gate (`AdminPanel.jsx`) — RLS `comp_insert` would technically allow any employee to insert a pre-approved row for themselves 🟡 **notable gap**, see `19_SECURITY.md` |
| **Attendance** | Check in/out (own) | ✅ | ✅ | ✅ | `attendance_insert`: `employee_id=auth.uid()`; `attendance_update`: `employee_id=auth.uid() OR is_manager()` |
| | View own attendance | ✅ | ✅ | ✅ | `attendance_select`: `employee_id=auth.uid() OR is_manager()` |
| | View others' attendance | ✅ (all) | ✅ (all — not just own reports) | ❌ | `is_manager()` clause has no per-employee scoping — any manager/admin can read **any** employee's attendance, not just their own reports 🟡 (documented behavior, not a bug, but worth flagging: no "my team only" filter exists at the DB layer) |
| | Request regularization | ✅ | ✅ | ✅ | `reg_insert`: `employee_id=auth.uid()` |
| | Approve/Reject regularization | ✅ (any) | ✅ (own `approver_id` only) | ❌ | `reg_update`: `approver_id=auth.uid() OR is_admin()` |
| **Timesheet** | Create/edit own entries | ✅ | ✅ | ✅ | `ts_entries_insert/update/delete`: `employee_id=auth.uid()` |
| | Submit own timesheet | ✅ | ✅ | ✅ | `timesheets_insert`: `employee_id=auth.uid()` |
| | View own timesheet | ✅ | ✅ | ✅ | `timesheets_select`: `employee_id=auth.uid() OR approver_id=auth.uid() OR is_admin()` |
| | Approve/Reject timesheet | ✅ (any) | ✅ (own `approver_id` only) | ❌ | `timesheets_update`: `employee_id=auth.uid() OR approver_id=auth.uid() OR is_admin()` — note: employee's own update clause is also present here (needed for self-submit), so RLS alone does not prevent an employee from updating `status` on their own row outside the submit flow; the app never does this, but it is not DB-blocked 🟡 |
| | View any employee's timesheet entries | ✅ (all) | ✅ (all, via `is_manager()`) | ❌ (own only) | `ts_entries_select`: `employee_id=auth.uid() OR is_manager()` |
| **Team Calendar** | View team leave calendar | ✅ | ✅ | ✅ | `get_team_calendar()` — SECURITY DEFINER RPC, revoked from `public`, granted to `authenticated`; every authenticated user (any role) can see every approved leave's employee/dates/type — **never** reason/certificate |
| **Employee Directory** | View employee list (name/dept/role) | ✅ | ✅ | ✅ (own directory-level fields only via `employees_read_all`) | `employees_read_all`: `true` for select — **every authenticated user can read every employee row** including `role`, `manager_id`, `is_active`, `must_change_password` (not just directory fields — no column-level restriction on SELECT) 🟡 |
| | Create employee | ✅ | ❌ | ❌ | `employees_admin_insert`: `is_admin()`; also re-checked server-side in `create-employee` Edge Function independent of RLS |
| | Edit any employee (privileged fields) | ✅ | ❌ | ❌ | `employees_admin_update`: `is_admin()` |
| | Edit own profile (phone/address/DOB/password-flag only) | ✅ | ✅ | ✅ | `employees_update_own` + `enforce_employee_self_update()` trigger — column-restricted, not just row-restricted |
| | Deactivate employee | ✅ | ❌ | ❌ | `employees_admin_delete` (used for soft-deactivate update, not literal delete): `is_admin()` |
| | Grant/revoke admin role | ✅ | ❌ | ❌ | same as edit — `is_admin()`; audited via `trg_audit_role_change` |
| | Prevent removing the last active admin | 🟡 UI-only | ➖ | ➖ | **no DB constraint** — `is_admin()` alone would permit it; see `19_SECURITY.md` finding #3 |
| **Salary** | View/edit salary | ✅ | ❌ | ❌ | `salary_admin_only`: `is_admin()` for all operations — a manager gets **zero rows**, not filtered rows |
| **Approver Config** | View | ✅ | ✅ | ✅ | `approver_read_all`: `true` |
| | Edit | ✅ | ❌ | ❌ | `approver_admin_write`: `is_admin()` |
| **Leave Adjustments** | View own | ✅ | ✅ (own only) | ✅ (own only) | `leave_adjustments_select`: `employee_id=auth.uid() OR is_admin()` |
| | Create/edit/delete | ✅ | ❌ | ❌ | `leave_adjustments_admin_write/update/delete`: `is_admin()` |
| **Holidays** | View | ✅ | ✅ | ✅ | `holidays_read_all`: `true` |
| | Create/edit/delete | ✅ | ❌ | ❌ | `holidays_admin_write`: `is_admin()` |
| **Audit Log** | View | ✅ | ❌ | ❌ | `audit_log_admin_read`: `is_admin()` — no insert/update/delete policy for **any** role; writes only via SECURITY DEFINER triggers |
| **Export (CSV)** | Employee roster / leave requests / attendance | ✅ | ❌ (no Export UI for managers) | ❌ | UI-only gate (no `admin` tab for non-admins) — the underlying `fetchEmployees`/`fetchAllLeaveRequests`/attendance queries are RLS-gated the same way regardless of caller, so this is enforced indirectly by RLS on the source tables, not a separate export permission 🟡 |
| **Jira Integration** | Connect/view/disconnect own account | ✅ | ✅ | ✅ | `jira_accounts_select/insert/update/delete_own`: `auth.uid()=employee_id` |
| | View another employee's Jira token | ❌ (deliberately, even for admin) | ❌ | ❌ | no policy grants this to any role — explicit design decision, hardened in `migration-security-hardening.sql` after a prior admin-inclusive policy was removed |
| **Notifications** | View own notification feed | ✅ | ✅ | ✅ | client-side synthesis from tables the viewer already has RLS access to — no dedicated `notifications` table exists |

---

## 3. Frontend vs. Backend Mismatches (verified, not assumed)

These are the specific places where the UI is more restrictive than the database, or vice versa — the ones worth tracking because a determined or buggy client could reach a state the UI never intends:

| # | Area | Frontend behavior | Backend (RLS/constraint) reality | Risk |
|---|---|---|---|---|
| 1 | Last active admin | Blocks demote/deactivate of the last admin (`AdminPanel.jsx:54,118`, duplicated in `Team.jsx:71-79`) | No DB constraint — `is_admin()` alone permits it | A raw API call (or a bug in either of the two duplicated UI checks) can zero out active admins |
| 2 | Leave balance sufficiency | Blocks submit if `days > remaining` (`ApplyLeave.jsx:59`) | `leave_requests` has no check tying `days` to `get_leave_balance()` | A modified client can over-draw balance |
| 3 | Sick leave certificate requirement | Blocks submit without a file (`ApplyLeave.jsx:60`) | No `medical_certificate_url IS NOT NULL WHEN leave_type='sick'` constraint | A modified client can submit sick leave with no certificate |
| 4 | Comp-off eligibility (past-date, weekend/holiday, ≥8h, 30-day window, no duplicate) | Fully validated client-side (`ApplyLeave.jsx:224-308`) | `comp_off_requests` only enforces NOT NULL/numeric types | A modified client can insert an arbitrary comp-off request |
| 5 | Admin-direct comp-off grant | Restricted to the Admin Panel UI | RLS `comp_insert` allows any employee to insert `status='approved'` for themselves — the *app* never sends `status` on self-service inserts, but RLS doesn't block it either | An employee crafting a raw insert could self-grant approved comp-off |
| 6 | "My team only" attendance/timesheet visibility for managers | UI never filters by direct-report vs. not | `is_manager()` grants read access to **every** employee's attendance/timesheet, not just direct reports | Any manager can read any employee's attendance/timesheet via direct API calls, even outside their reporting line |
| 7 | Timesheet reject reason required | Blocks the Reject button until a reason is typed (`Approvals.jsx:30,136`) | `reject_reason` column is nullable, no constraint | A modified client can reject with no reason |

---

## 4. Summary

3 roles, 15 tables, 40+ RLS policies, 2 boolean helper functions driving nearly all of them, 7 UI-only business rules with no DB backstop (cross-referenced fully in `08_BUSINESS_RULES.md`). RLS is comprehensive and is genuinely the primary security boundary — most gaps found are narrow, specific, and would require a deliberately crafted API call rather than casual UI misuse.
