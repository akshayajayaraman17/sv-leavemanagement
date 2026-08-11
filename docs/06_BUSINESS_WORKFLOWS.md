# 06. Business Workflows

16 distinct business workflows, each documented against actual code. Sequence diagrams for the four highest-traffic flows (Leave Apply, Approval Decision, Attendance Check-In/Out, Employee Onboarding) live in `12_DATA_FLOW.md` — referenced below rather than repeated. Rule IDs (`RULE-LV-###` etc.) refer to `08_BUSINESS_RULES.md`.

---

## WF-01: Leave Application
- **Trigger**: Employee submits the Apply Leave form. **Actor**: any role. **Diagram**: `12_DATA_FLOW.md` §2.
- **Preconditions**: authenticated session; `get_leave_balance`, `get_approver`, `company_holidays` loaded.
- **Steps**: pick leave type → pick dates/half-day → (if sick) attach certificate → enter reason → submit.
- **Validation**: RULE-LV-001 through LV-006.
- **API**: `applyLeave()` → `insert leave_requests`; `uploadMedicalCertificate()` → Storage insert (sick only).
- **DB changes**: 1 row inserted into `leave_requests` (`status='pending'`, `approver_id` server-overwritten per RULE-LV-008); GiST exclusion constraint checked (RULE-LV-007).
- **Status transition**: (none) → `pending`.
- **Success**: toast + form reset; row appears in requester's own History and the approver's queue.
- **Failure**: overlap → friendly "already have a pending/approved request" message (constraint-name pattern match); any other Postgres error → raw message in toast.
- **Cancellation**: see WF-15 (self-cancel is a separate workflow, not part of apply).
- **Audit**: not logged (RULE-LV-017).

## WF-02: Comp-Off Application
- **Trigger**: Employee submits the Apply Comp Off form. **Actor**: any role.
- **Preconditions**: existing attendance record for the chosen worked date.
- **Steps**: pick worked date → auto-validation chain runs (past-date → weekend/holiday → duplicate → attendance lookup → hours check) → pick avail-by date → enter reason → submit.
- **Validation**: RULE-CO-001 through CO-006 (all UI-only, RULE-CO-008).
- **API**: `applyCompOff()` → `insert comp_off_requests`.
- **DB changes**: 1 row, `status='pending'`, `earned_days` per RULE-CO-005, `approver_id` server-overwritten.
- **Status transition**: (none) → `pending`.
- **Success**: toast; row appears in requester's History (Comp Off tab) and approver's queue.
- **Failure**: any Postgres error surfaces raw in toast (no custom friendly-message handling here, unlike leave's overlap case).
- **Cancellation**: not possible (RULE-CO-009).
- **Audit**: not logged.

## WF-03: Leave Approval (Decide)
- **Trigger**: Manager/admin approves or rejects a pending leave request. **Actor**: manager (own `approver_id` only) or admin (any). **Diagram**: `12_DATA_FLOW.md` §3.
- **Preconditions**: request exists with `status='pending'` and is visible under `leave_requests_read` RLS.
- **Steps**: open Approvals → Leave Requests tab → review (dates, days, reason, balance impact shown, certificate viewable for sick leave) → Approve or Reject (single or bulk, RULE-LV-011).
- **Validation**: none beyond RLS-scoped visibility.
- **API**: `decideLeave()` → `update leave_requests`.
- **DB changes**: `status`, `decided_on`, (rarely) `reject_reason` updated.
- **Status transition**: `pending → approved` or `pending → rejected`.
- **Notifications**: `notifyDecision()` → `send-notification` edge function → Resend email to employee, best-effort (RULE-LV-016).
- **Success/Failure**: toast either way; notification failure is invisible to the approver.
- **Audit**: not logged.

## WF-04: Comp-Off Approval (Decide)
- **Trigger/Actor**: same pattern as WF-03.
- **API**: `decideCompOff()` → `update comp_off_requests`.
- **DB changes**: `status`, `decided_on` only — no `reject_reason` column exists (RULE-CO-010).
- **Status transition**: `pending → approved` (increases balance per RULE-CO-012) or `pending → rejected`.
- **Notifications**: same `send-notification` pattern.
- **Audit**: not logged.

## WF-05: Admin-Granted Comp-Off Credit
- **Trigger**: Admin, editing an employee, fills the Comp Off tab and saves. **Actor**: admin only.
- **Preconditions**: editing an existing employee (tab hidden on create).
- **Steps**: enter worked date, hours (default 8), earned days (default 1), reason → save.
- **Validation**: date/hours/days/reason required (`AdminPanel.jsx:173-180`) — **no attendance check at all** (RULE-CO-011).
- **API**: `grantCompOff()` → `insert comp_off_requests` with `status='approved'` pre-set.
- **DB changes**: 1 row, immediately approved, `decided_on=now()`; `approver_id` still server-overwritten by the insert trigger even though no one "approved" it in the normal sense.
- **Status transition**: (none) → `approved` directly, bypassing `pending`.
- **Notifications**: none (this path doesn't call `notifyDecision`).
- **Audit**: not logged.

## WF-06: Timesheet Entry & Submission
- **Trigger**: Employee logs daily task hours and submits by week's end. **Actor**: any role.
- **Preconditions**: a `timesheets` row is lazily created per ISO week on first visit (`fetchOrCreateTimesheet`).
- **Steps**: for each Mon–Fri day, add one or more entries (task, optional Jira key/project, hours) → review week total vs. 40h target → Submit.
- **Validation**: RULE-TS-002 through TS-005.
- **API**: `addTimesheetEntry()` → `insert timesheet_entries`; `submitTimesheet()` → `update timesheets`; `postJiraWorklog()` per unsynced entry (RULE-TS-009).
- **DB changes**: entry rows inserted; `timesheets.status`, `submitted_at`, `total_hours` updated on submit.
- **Status transition**: `draft → submitted`.
- **Success**: toast; row appears in approver's Timesheets queue.
- **Failure**: submit blocked client-side with inline per-day errors (RULE-TS-004) before any API call is made.
- **Audit**: not logged.

## WF-07: Timesheet Approval (Decide)
- **Trigger/Actor**: manager (own `approver_id`) / admin (any), from Approvals → Timesheets tab, with per-day entry drill-down.
- **Validation**: reject requires a typed reason (RULE-TS-008).
- **API**: `decideTimesheet()` → `update timesheets`.
- **Status transition**: `submitted → approved` or `submitted → rejected`.
- **Notifications**: `send-notification`, same pattern.
- **Audit**: not logged.

## WF-08: Late Timesheet Submission Unlock
- **Trigger**: Employee's timesheet shows the locked-pseudo-status banner past Friday's deadline. **Actor**: the owning employee only.
- **Steps**: type a reason → submit unlock request.
- **Validation**: reason non-empty (button-disabled gate only).
- **API**: `requestLateTimesheetSubmission()` → `update timesheets`.
- **DB changes**: `status` reset to `'draft'`; `reject_reason` overwritten with `'Late submission: {reason}'`.
- **Status transition**: (locked-draft, UI pseudo-state) `→ draft` (real DB value unchanged, was already `'draft'`).
- **Note**: this is genuinely self-service with **no approval gate** (RULE-TS-007) — worth flagging as a designed-in trust decision, not a bug, but a real one.
- **Audit**: not logged.

## WF-09: Attendance Check-In / Check-Out
- **Trigger**: Employee taps Check In / Check Out. **Actor**: any role. **Diagram**: `12_DATA_FLOW.md` §4.
- **Preconditions**: browser geolocation permission granted (RULE-AT-001, hard blocker if denied).
- **Steps**: get GPS coords → reverse-geocode via Nominatim (RULE-AT-002) → upsert `attendance` row (keyed on employee+date) → insert `attendance_punches` row.
- **DB changes**: `attendance` upserted; `attendance_punches` row inserted; on checkout, `total_hours` recomputed client-side (RULE-AT-004) and written.
- **Status transition**: `attendance.status` → `'present'` on check-in (RULE-AT-006: `'absent'` never written by any code path).
- **Audit**: not logged.

## WF-10: Attendance Regularization Request & Approval
- **Trigger**: System detects a day with check-in but no check-out. **Actor**: employee (request), manager/admin (decide).
- **Steps (request)**: employee provides proposed checkout time + mandatory reason → submit.
- **API**: `createRegularization()` → `insert attendance_regularizations`; `updateAttendanceStatus(..., 'incomplete')`.
- **Steps (decide)**: approver reviews date/check-in/proposed-checkout/reason → approve or reject (reject requires reason, same pattern as timesheets).
- **API**: `decideRegularization()` → `update attendance_regularizations`; on approval only, `updateAttendanceStatus(..., 'present')` (RULE-AT-008: does **not** write the checkout time back).
- **Status transition**: `attendance_regularizations.status`: `pending → approved/rejected`. `attendance.status`: `present → incomplete` (on request) → `present` (on approval) or **stuck at `incomplete`** on rejection (RULE-AT-009).
- **Notifications**: `send-notification`, same pattern.
- **Audit**: not logged.

## WF-11: Employee Onboarding — Single Add
- **Trigger**: Admin fills "+ Add Employee". **Actor**: admin only. **Diagram**: `12_DATA_FLOW.md` §5.
- **Steps**: Details tab (name/email/code/joining date/role/password) → optional Salary tab → optional Approvers tab → save → Edge Function creates auth user + employee row → admin then separately upserts salary/approvers/leave-adjustments.
- **Validation**: `AdminPanel.jsx:106-114` (RULE-EMP-003, EMP-004).
- **DB changes**: `auth.users` + `employees` row created atomically (rollback on partial failure); `must_change_password=true` always set.
- **Status transition**: n/a (creation, not a request lifecycle).
- **Audit**: role assignment is captured if the created role is non-default, via the same `trg_audit_role_change` mechanism (fires on the insert's implicit role value only if compared against a prior row — in practice, creation itself is **not** audit-logged since there's no "old" row to diff against; only subsequent role **changes** are).
- **Notifications**: none sent to the new hire.

## WF-12: Employee Onboarding — Bulk Add (CSV)
- **Trigger**: Admin uploads a CSV in the 3-step wizard. **Actor**: admin only.
- **Steps**: Upload → client-side `parseCsv()` + `validateRows()` (RULE-EMP-007 gap noted) → choose password mode (RULE-EMP-008) → sequential `createEmployee()` call per valid row → Results screen with CSV-exportable temp passwords.
- **Validation**: per-row (`BulkAddEmployees.jsx:35-104`) — email format/uniqueness, employee_code auto-gen/uniqueness, role whitelist, date format/validity, DOB not-future (warning), manager lookup (warning if not found).
- **DB changes**: N employee rows created via the same `create-employee` Edge Function as single-add, one call per row (not parallelized).
- **Audit**: role changes only, same caveat as WF-11.

## WF-13: Leave / Salary Adjustment by Admin
- **Trigger**: Admin edits an employee's Leave or Salary tab. **Actor**: admin only.
- **Steps (leave)**: enter `+`/`-` day delta and optional reason per leave type → save → upsert keyed on `(employee_id, type_code)` (RULE-EMP-010).
- **Steps (salary)**: enter compensation fields + `effective_from` → save → upsert keyed on `employee_id` (see `23_TECHNICAL_DEBT.md` for the missing-unique-constraint risk).
- **DB changes**: `leave_adjustments` or `salary_details` row upserted.
- **Audit**: **yes** — both are DB-audit-logged via trigger (RULE-EMP-009), old/new values captured as jsonb.
- **Notifications**: leave adjustments appear in the employee's in-app Notifications feed (client-synthesized, not a push notification).

## WF-14: Holiday Management
- **Trigger**: Admin adds or removes a company holiday. **Actor**: admin only.
- **Steps (add)**: enter date + name → validate both required → insert.
- **Steps (remove)**: confirm dialog → delete.
- **DB changes**: `company_holidays` row inserted/deleted (unique on `holiday_date`).
- **Downstream effect**: feeds working-day math (WF-01), weekend/holiday eligibility (WF-02), Team Calendar highlighting, Dashboard's "this month's holidays" widget.
- **Audit**: not logged.

## WF-15: Leave Cancellation (Self-Service)
- **Trigger**: Employee clicks Cancel on their own leave request in My Leaves. **Actor**: the owning employee.
- **Preconditions**: `status='pending'`, or `status='approved'` and `from_date` not yet passed (RULE-LV-012, DB-enforced).
- **API**: `cancelLeave()` → `update leave_requests set status='cancelled'`.
- **DB changes**: single-column-effective update; trigger rejects any attempt to change other fields in the same call.
- **Status transition**: `pending|approved(future) → cancelled` (terminal — RULE-LV-013).
- **Audit**: not logged.

## WF-16: Password Reset / Forced Password Change / Jira Connect
Three related but distinct account-management workflows, grouped here for brevity (full detail in `08_BUSINESS_RULES.md` RULE-SEC-001/002 and `19_SECURITY.md` §1):
- **Self-service forgot-password**: 3-step OTP (`resetPasswordForEmail` → `verifyOtp` → `updateUser`), entirely Supabase Auth-managed.
- **Forced password change**: shown whenever `must_change_password=true`; on success, clears the flag and unblocks the app shell.
- **In-app change password** (Profile): re-verifies current password via a live sign-in call before allowing the change; the only password flow with a "new ≠ current" check.
- **Jira connect**: upsert `jira_accounts` keyed on `employee_id`; no format validation beyond HTML5 input types; RLS owner-only, admins deliberately excluded.

---

## Workflow Summary Table

| # | Workflow | Actors | Audited? | Notified? |
|---|---|---|---|---|
| WF-01 | Leave Application | All | No | No |
| WF-02 | Comp-Off Application | All | No | No |
| WF-03 | Leave Approval | Manager, Admin | No | Yes (best-effort) |
| WF-04 | Comp-Off Approval | Manager, Admin | No | Yes (best-effort) |
| WF-05 | Admin-Granted Comp-Off | Admin | No | No |
| WF-06 | Timesheet Submission | All | No | No |
| WF-07 | Timesheet Approval | Manager, Admin | No | Yes (best-effort) |
| WF-08 | Late Timesheet Unlock | Self only | No | No |
| WF-09 | Attendance Check-In/Out | All | No | No |
| WF-10 | Regularization Request/Approval | All / Manager, Admin | No | Yes (best-effort) |
| WF-11 | Onboarding — Single Add | Admin | Partial (role only) | No |
| WF-12 | Onboarding — Bulk Add | Admin | Partial (role only) | No |
| WF-13 | Leave/Salary Adjustment | Admin | **Yes** | In-app feed only |
| WF-14 | Holiday Management | Admin | No | No |
| WF-15 | Leave Cancellation | Self only | No | No |
| WF-16 | Password/Jira Account Mgmt | All | No | No |

Only **2 of 16 workflows** (Leave/Salary Adjustment, and Role Change as a byproduct of onboarding/editing) are genuinely audit-logged — see `22_GAP_ANALYSIS.md` for the implication.
