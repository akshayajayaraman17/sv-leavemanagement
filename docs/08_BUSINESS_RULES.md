# 08. Business Rules

Every rule below was verified directly against source (component line numbers + matching SQL where applicable) — none are assumed. **Enforcement** column: `DB` = enforced by a Postgres constraint/trigger (cannot be bypassed even via a raw API call), `UI` = enforced only in the React client (a modified/direct API call can violate it), `DB+UI` = both layers check it independently.

## Leave (RULE-LV)

| ID | Rule | Enforcement | Source |
|---|---|---|---|
| RULE-LV-001 | Working days = calendar days in range, excluding Sat/Sun and company holidays | UI | `ApplyLeave.jsx:5-14` |
| RULE-LV-002 | Half-day request always deducts exactly 0.5 days, regardless of how many days the selected date range spans | UI | `ApplyLeave.jsx:46-49` |
| RULE-LV-003 | `to_date` must be ≥ `from_date` | UI | `ApplyLeave.jsx:53-62` |
| RULE-LV-004 | Reason is required (non-empty, trimmed) | UI | `ApplyLeave.jsx:53-62` |
| RULE-LV-005 | Requested days must not exceed remaining balance | UI | `ApplyLeave.jsx:59` |
| RULE-LV-006 | Sick leave requires a medical certificate upload (max 5MB, private storage) | UI | `ApplyLeave.jsx:60,175` |
| RULE-LV-007 | No two overlapping pending/approved leave requests for the same employee | **DB** | GiST exclusion constraint `no_overlapping_leave`, `schema.sql:717-723` |
| RULE-LV-008 | `approver_id` is always server-computed via `get_approver()`, never trusted from the client | **DB** | trigger `enforce_approver_id()`, `schema.sql:735-745` |
| RULE-LV-009 | New leave requests always start at `status='pending'` | **DB** | column default, `schema.sql:93` |
| RULE-LV-010 | Any admin may approve/reject **any** pending leave request; a manager may only decide requests where they are the specifically assigned `approver_id` | **DB** | RLS `leave_requests_update`, `schema.sql:473-475` |
| RULE-LV-011 | Per-row leave rejection has no reason-capture UI; bulk-reject can optionally supply one but it is not required and is rarely populated for leaves specifically | UI | `Approvals.jsx:30,117-124` |
| RULE-LV-012 | Employee may cancel own leave only when `status='pending'`, or `status='approved'` **and** `from_date ≥ current_date` (not yet started); no other field may change in the same update | **DB** | trigger `enforce_leave_cancellation()`, `schema.sql:486-511` |
| RULE-LV-013 | Once cancelled, a leave request cannot be reopened | **DB** | same trigger — only one valid transition exists |
| RULE-LV-014 | `remaining = GREATEST(0, total − used)`; `total` = pro-rated entitlement + adjustments; `used` = sum of approved days in the current calendar year | **DB** (function) | `get_leave_balance()`, `schema.sql:189-239` — floor is display-time only, not a row-level constraint |
| RULE-LV-015 | Entitlement pro-ration applies only in the employee's joining year; every subsequent year uses the full `annual_days` | **DB** (function) | `prorated_days()`, `schema.sql:175-186` |
| RULE-LV-016 | A decision (approve/reject) triggers a best-effort email notification; failures are silent (`console.error` only, never surfaced to the approver) | UI/Edge Fn | `api.js:218-222`, `send-notification/index.ts` |
| RULE-LV-017 | Leave request lifecycle events are never audit-logged | **DB** (absence) | no trigger exists on `leave_requests` |

## Comp-Off (RULE-CO)

| ID | Rule | Enforcement | Source |
|---|---|---|---|
| RULE-CO-001 | Worked date must be strictly in the past | UI | `ApplyLeave.jsx:232-236` |
| RULE-CO-002 | Worked date must be a weekend day or a company holiday | UI | `ApplyLeave.jsx:239-246` |
| RULE-CO-003 | No duplicate request for the same worked date unless the prior one was rejected | UI | `ApplyLeave.jsx:249-256` |
| RULE-CO-004 | Requires a matching attendance record: check-in and check-out present, status not `absent`/`incomplete`, `total_hours ≥ 8` | UI | `ApplyLeave.jsx:261-283` |
| RULE-CO-005 | `earned_days` is always exactly 1 if `total_hours ≥ 8`, else 0 — binary, never fractional, via self-service application | UI | `ApplyLeave.jsx:291` |
| RULE-CO-006 | Avail-by date must be after the worked date and within 30 days of it | UI | `ApplyLeave.jsx:293-308` |
| RULE-CO-007 | The "Date to Avail Comp-Off" field and its 30-day messaging are validated in the UI but never sent to or stored by the backend — the rule is cosmetic only | UI (dead) | field collected, dropped before `applyCompOff()` insert |
| RULE-CO-008 | RULE-CO-001 through CO-006 have **no matching database enforcement** | UI only | `comp_off_requests` has no check constraints beyond NOT NULL/numeric type |
| RULE-CO-009 | Comp-off requests cannot be cancelled by the employee once submitted | **DB** (absence) | no `'cancelled'` value in the status check constraint; no Cancel button in `MyLeaves.jsx` for the Comp Off tab |
| RULE-CO-010 | Rejected comp-off requests show no reason to the employee | **DB** (absence) | `comp_off_requests` has no `reject_reason` column at all |
| RULE-CO-011 | Admin can directly grant comp-off credit (`status='approved'` immediately), bypassing the apply→approve flow and skipping all attendance validation | UI (privileged) | `AdminPanel.jsx:173-200`, `api.js:285-296` |
| RULE-CO-012 | Approving a comp-off request immediately increases the employee's "comp" leave-type balance | **DB** (function) | `get_leave_balance()` sums `earned_days` of approved rows, `schema.sql:200-204` |

## Timesheet (RULE-TS)

| ID | Rule | Enforcement | Source |
|---|---|---|---|
| RULE-TS-001 | Timesheet week always starts Monday; only Mon–Fri are tracked | UI | `Timesheet.jsx:11-25` |
| RULE-TS-002 | Entry requires `task_description` and `0 < hours ≤ 24` | **DB+UI** | check constraint `schema.sql:576`, matched by client `Timesheet.jsx:68-73` |
| RULE-TS-003 | A single entry's hours cannot exceed the day's remaining attendance-hours budget | UI | `Timesheet.jsx:68-73` |
| RULE-TS-004 | Submit is blocked if: a day has logged hours but no attendance record; a day has check-in but no check-out; or a day's logged hours exceed that day's attendance hours | UI | `getSubmitErrors()`, `Timesheet.jsx:263-282` |
| RULE-TS-005 | Submit is blocked entirely if total weekly hours = 0 | UI | `Timesheet.jsx:284-320` |
| RULE-TS-006 | A timesheet is "locked" once today is past that week's Friday, status is still `draft`, and it's not a future week | UI (pseudo-status) | `Timesheet.jsx:258,331` — never written to the DB `status` column |
| RULE-TS-007 | An employee may self-unlock their own locked timesheet at any time by supplying any non-empty reason — no approval gate | **DB (write allowed)+UI (no gate)** | `requestLateTimesheetSubmission()`, `api.js:484-490` |
| RULE-TS-008 | Rejecting a timesheet requires a reason | UI | `Approvals.jsx:30,136` |
| RULE-TS-009 | On submit, unsynced Jira-linked entries are pushed to Jira before the timesheet status flips to `submitted` | UI/Edge Fn | `Timesheet.jsx` submit flow → `post-jira-worklog` |
| RULE-TS-010 | Timesheet approval/rejection is never audit-logged | **DB** (absence) | no trigger on `timesheets` |

## Attendance (RULE-AT)

| ID | Rule | Enforcement | Source |
|---|---|---|---|
| RULE-AT-001 | Check-in/out require browser Geolocation permission; no manual fallback exists | UI (hard block) | `Attendance.jsx:14-26` |
| RULE-AT-002 | Reverse geocoding calls the public, keyless OpenStreetMap Nominatim API directly from the browser on every punch | UI/3rd-party | `Attendance.jsx:28-45` |
| RULE-AT-003 | Multiple check-in/check-out sessions per day are explicitly supported by design | **DB+UI** | `attendance_punches` table, comment `schema.sql:634` |
| RULE-AT-004 | `total_hours` is computed client-side by pairing punches chronologically and summing durations — no server-side recomputation | UI | `calcHoursFromPunches()`, `Attendance.jsx:68-79` |
| RULE-AT-005 | An "8-hour minimum" badge is purely informational — never a blocking gate on any action | UI (cosmetic) | `MIN_HOURS=8`, `Attendance.jsx:11` |
| RULE-AT-006 | `attendance.status='absent'` is a defined constraint value with **no writer anywhere in the codebase** | **DB** (unused value) | `schema.sql:544-545` |
| RULE-AT-007 | A regularization request is offered for any day with check-in but no check-out (not already `incomplete`); filing one sets `attendance.status='incomplete'` | UI | `Attendance.jsx:243-248,210-234` |
| RULE-AT-008 | Approving a regularization flips `attendance.status` back to `'present'` but does **not** copy the proposed checkout time into `attendance.check_out_time`, nor recompute `total_hours` | UI (gap) | `Approvals.jsx:152-155` |
| RULE-AT-009 | Rejecting a regularization leaves `attendance.status` permanently `'incomplete'` — no code path resets it | UI (gap) | no reset logic found |
| RULE-AT-010 | Manager/admin attendance visibility is not scoped to "my direct reports only" — any manager can read any employee's attendance | **DB** (broad grant) | RLS `attendance_select`, `is_manager()` clause has no per-employee scoping |

## Employee / Admin (RULE-EMP)

| ID | Rule | Enforcement | Source |
|---|---|---|---|
| RULE-EMP-001 | New accounts always start with `must_change_password=true` | **DB/Edge Fn** | `create-employee/index.ts:74` |
| RULE-EMP-002 | Non-admin self-updates to `employees` are restricted to `phone`/`address`/`date_of_birth`/`must_change_password` | **DB** | trigger `enforce_employee_self_update()`, `schema.sql:413-435` |
| RULE-EMP-003 | Employee code is auto-generated (`EMP###` incrementing) and read-only once the employee exists | UI | `employeeCode.js`, `AdminPanel.jsx:231` |
| RULE-EMP-004 | Granting admin role requires an explicit confirmation step | UI | `AdminPanel.jsx:476-482` |
| RULE-EMP-005 | At least one active admin must remain in the system | UI only, **duplicated in 2 places** | `AdminPanel.jsx:54,118,731-737`, `Team.jsx:71-79` — no DB constraint |
| RULE-EMP-006 | Role changes are always audit-logged, regardless of which UI surface caused them | **DB** | trigger `log_role_change()`, `schema.sql:334-351` |
| RULE-EMP-007 | Bulk-add does not configure `approver_config` — only `manager_id` | UI (gap) | `BulkAddEmployees.jsx` — no approver-setting code path |
| RULE-EMP-008 | Bulk-add temp passwords: per-employee random (crypto-random, guaranteed character-class diversity) or one shared password (≥8 chars) for the whole batch; shown once, exportable to CSV | UI | `password.js:28-38`, `BulkAddEmployees.jsx:330-335` |
| RULE-EMP-009 | Salary and leave-adjustment changes are always audit-logged; nearly every other action (approvals, employee lifecycle, holiday CRUD, Jira connects, logins) is not | **DB** (partial coverage) | `schema.sql:300-332` |
| RULE-EMP-010 | Leave adjustments store one override row per employee per leave type; re-saving replaces rather than accumulates | **DB** | `unique(employee_id, type_code)`, `schema.sql:111` |

## Security-Adjacent (RULE-SEC)

| ID | Rule | Enforcement | Source |
|---|---|---|---|
| RULE-SEC-001 | Password minimum length is 8 characters, checked independently in 3 places with no shared validator and no complexity rule | UI | `Login.jsx:157`, `ForcePasswordChange.jsx:16`, `Profile.jsx:47-49` |
| RULE-SEC-002 | Profile's change-password flow requires the new password to differ from the current one and re-verifies the current password via a live sign-in call; ForcePasswordChange has neither check | UI (inconsistent) | `Profile.jsx:43-63` vs `ForcePasswordChange.jsx:15-17` |
| RULE-SEC-003 | Jira API tokens are stored in plaintext and round-tripped to the client on every load | **DB** (design) | `jira_accounts.jira_api_token text`, `JiraSettings.jsx:23` |
| RULE-SEC-004 | Admins are deliberately excluded from reading any other employee's Jira token | **DB** | RLS `jira_accounts_select_own`, `schema.sql:381-383` |

---

**Total: 53 documented business rules** across 6 categories. 18 are DB-enforced (cannot be bypassed by a modified client), 4 are DB-enforced-but-absent (a value/table/trigger deliberately or notably doesn't exist), 1 is DB+UI dual-enforced, and 30 are UI-only (would not survive a direct API call). See `03_ROLES_AND_PERMISSIONS.md` §3 for the subset of these that constitute genuine security-relevant gaps versus acceptable UX-only conveniences.
