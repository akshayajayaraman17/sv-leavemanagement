# 10. API Specification

There is no hand-written REST/GraphQL API. All data access goes through **Supabase's auto-generated PostgREST API** (direct table reads/writes via `supabase-js`, gated by RLS), a small number of **Postgres RPCs** (`supabase.rpc(...)`), and **3 Edge Functions** (`supabase.functions.invoke(...)`). This document catalogues the actual API surface as used by `leave-app/src/lib/api.js` (668 lines, the single data-access module for the whole app).

## 1. Authentication Endpoints (Supabase Auth / GoTrue)

| Operation | Call | Used by |
|---|---|---|
| Sign in | `supabase.auth.signInWithPassword({email, password})` | `Login.jsx` |
| Sign out | `supabase.auth.signOut()` | `App.jsx` sidebar/topbar, `ForcePasswordChange.jsx` |
| Get session | `supabase.auth.getSession()` | `AuthContext.jsx` on mount |
| Auth state subscription | `supabase.auth.onAuthStateChange(...)` | `AuthContext.jsx` |
| Request password reset OTP | `supabase.auth.resetPasswordForEmail(email)` | `Login.jsx` ForgotPassword step 1 |
| Verify OTP | `supabase.auth.verifyOtp({email, token, type:'recovery'})` | `Login.jsx` ForgotPassword step 2 |
| Set new password | `supabase.auth.updateUser({password})` | `Login.jsx` step 3, `ForcePasswordChange.jsx`, `Profile.jsx` |
| Re-verify current password | `supabase.auth.signInWithPassword({email, password: current})` | `Profile.jsx` changePassword (verification step before allowing change) |

## 2. Postgres RPCs (`supabase.rpc(...)`)

| RPC | Signature | Security | Purpose | Called from |
|---|---|---|---|---|
| `get_leave_balance` | `(emp_id uuid) → table(type_code, label, color, bg_color, total, used, remaining)` | `stable`, standard RLS caller context, **no row-level restriction on which `emp_id` can be queried** | Computes per-leave-type balance combining pro-rated entitlement, adjustments, and approved usage | `api.js:173` |
| `get_approver` | `(emp_id uuid) → uuid` | `stable`, no RLS restriction | Resolves the priority-1 active `approver_config` entry, falling back to active `manager_id` | `api.js:301` (leave apply), `api.js:446` (regularization) |
| `get_team_calendar` | `(p_from date, p_to date) → table(employee_id, full_name, avatar_initials, leave_type, from_date, to_date)` | `SECURITY DEFINER`, revoked from `public`, granted to `authenticated` only | Narrow read of **approved-only** leave events across all employees — deliberately excludes `reason`/`reject_reason`/certificate URL regardless of caller's normal RLS visibility | `api.js:575` (Team Calendar) |

## 3. Edge Functions (`supabase.functions.invoke(...)`)

### `POST /functions/v1/create-employee`
- **Auth**: caller's JWT required; function independently verifies `employees.role = 'admin'` for the caller before proceeding (403 otherwise) — then switches to a `service_role` client for the actual writes.
- **Request body**: `{ email, password, full_name, employee_code, department, designation, role, joining_date, manager_id, phone? }`
- **Behavior**: `adminClient.auth.admin.createUser({email, password, email_confirm:true})` → insert `public.employees` row with `must_change_password: true` → on employees-insert failure, rolls back by deleting the just-created auth user.
- **Response**: `{ id, ...employeeRow }` (201) or `{ error }` (400/403/500).
- **Called from**: `createEmployee()` in `api.js:37-67`, used by both single-add (`AdminPanel.jsx`) and bulk-add (`BulkAddEmployees.jsx`, called once per CSV row, sequentially).

### `POST /functions/v1/post-jira-worklog`
- **Auth**: caller's own JWT (not service role) — reads `jira_accounts` scoped by RLS to the caller.
- **Request body**: `{ issueKey, timeSpentSeconds, started, comment }` — 400 if `issueKey`/`timeSpentSeconds`/`started` missing.
- **Behavior**: fetches caller's `jira_accounts` row, builds HTTP Basic Auth (`base64(jira_email:jira_api_token)`), POSTs to `${jira_host}/rest/api/3/issue/${issueKey}/worklog`.
- **Response**: proxies Jira's response status/body.
- **Called from**: `Timesheet.jsx` submit flow, once per unsynced Jira-linked entry.

### `POST /functions/v1/send-notification`
- **Auth**: caller's own JWT — re-queries the target row using the caller's RLS context (so it can never leak data the caller couldn't already see).
- **Request body**: `{ table, recordId }` — `table` must be one of `leave_requests | comp_off_requests | timesheets | attendance_regularizations` (400 otherwise).
- **Behavior**: re-fetches the row server-side, refuses (400) unless `row.status IN ('approved','rejected')`, builds subject/body from a per-table config map, sends via Resend to the row's own `employee.email` (recipient cannot be redirected by the caller).
- **Response**: `{ sent: true }` or `{ error }`; 501 if `RESEND_API_KEY` unset.
- **Called from**: `notifyDecision()` in `api.js:218-222`, fire-and-forget after every leave/comp-off/timesheet/regularization decision — failures are only `console.error`'d, never surfaced to the approver.

## 4. PostgREST Table Access (direct `supabase.from(table)` calls)

Every other data operation in the app is a direct table call — `select`/`insert`/`update`/`delete`/`upsert` through PostgREST, with **RLS as the only enforcement**, no server-side validation layer. The table below lists every distinct data-access function in `api.js` grouped by resource; full RLS policy text is in `03_ROLES_AND_PERMISSIONS.md` and `11_DATABASE_SPECIFICATION.md`.

| Resource | Functions in `api.js` | Operations |
|---|---|---|
| Employees | `fetchEmployees`, `fetchEmployee`, `updateEmployee`, `deactivateEmployee` | select, select-one, update, update (soft-delete) |
| Jira accounts | `fetchJiraAccount`, `upsertJiraAccount`, `deleteJiraAccount` | select, upsert, delete |
| Salary | `fetchSalary`, `upsertSalary` | select, upsert (`onConflict:'employee_id'`) |
| Approver config | `fetchApprovers`, `setApprovers` | select, delete+insert (replace) |
| Leave requests | `fetchMyLeaves`, `fetchAllLeaveRequests`, `fetchPendingForApprover`, `applyLeave`, `cancelLeave`, `decideLeave` | select ×3, insert, update, update |
| Comp-off requests | `fetchMyCompRequests`, `fetchPendingCompForApprover`, `applyCompOff`, `decideCompOff`, `grantCompOff` | select ×2, insert ×2, update |
| Attendance | `fetchTodayAttendance`, `fetchAttendanceHistory`, `fetchAttendanceForDate`, `checkIn`, `checkOut`, `updateAttendanceStatus` | select ×3, upsert ×2, update |
| Attendance punches | (embedded in checkIn/checkOut) | insert |
| Regularizations | `createRegularization`, `fetchPendingRegularizations`, `decideRegularization` | insert, select, update |
| Timesheets | `fetchOrCreateTimesheet`, `submitTimesheet`, `fetchPendingTimesheets`, `decideTimesheet`, `requestLateTimesheetSubmission` | select-or-insert, update, select, update, update |
| Timesheet entries | `fetchTimesheetEntries`, `addTimesheetEntry`, `markEntriesJiraSynced` | select, insert, update |
| Leave types | (fetched inline where needed) | select |
| Leave adjustments | `fetchLeaveAdjustments`, `upsertLeaveAdjustment` | select, upsert |
| Company holidays | `fetchHolidays`, `createHoliday`, `deleteHoliday` | select, insert, delete |
| Audit log | `fetchAuditLog` | select (latest 100-200) |
| Medical certificates | `uploadMedicalCertificate`, `getMedicalCertificateUrl` | Storage upload, Storage `createSignedUrl` (60s TTL) |
| Profile | `updateProfile`, `clearMustChangePassword` | update ×2 (both column-restricted by DB trigger) |

## 5. Error Handling Pattern

No centralized error-handling layer. Every `api.js` function returns/throws whatever PostgREST/Supabase returns; each calling component wraps calls in local `try/catch` and shows a toast (`onToast(msg, 'error')`). One special case: `ApplyLeave.jsx:86-90` pattern-matches the error message for the string `'no_overlapping_leave'` (the DB exclusion constraint's name) to show a friendlier message instead of the raw Postgres error — the only place in the app that does this kind of error-message translation.

## 6. Authentication & Authorization Summary for the API Layer

- **Every** PostgREST/RPC call is authenticated via the Supabase JWT attached automatically by `supabase-js` from the current session.
- **Authorization** is enforced exclusively by RLS policies (see `03_ROLES_AND_PERMISSIONS.md`) — `api.js` contains **zero** client-side authorization checks (no `if (role !== 'admin') throw`); it relies entirely on the database to reject unauthorized operations.
- The 3 Edge Functions are the only places with server-side authorization logic beyond RLS (`create-employee`'s explicit admin check; `send-notification`'s status-must-be-decided check).
