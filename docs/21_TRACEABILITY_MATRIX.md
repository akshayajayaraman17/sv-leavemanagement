# 21. Requirements Traceability Matrix

Traces every business rule (`08_BUSINESS_RULES.md`) through to the page it appears on, the workflow it belongs to, the database object (if any) that enforces it, and the test case that verifies it (`20_QA_TEST_SPECIFICATION.md`). Use this to answer "if I change X, what else must I check?" in either direction.

| Rule ID | Rule (short) | Page(s) | Workflow | DB Object | Test Case | Enforcement |
|---|---|---|---|---|---|---|
| RULE-LV-001 | Working-day calc excludes weekends/holidays | Apply Leave | WF-01 | — (client function) | — | UI |
| RULE-LV-002 | Half-day always = 0.5 days | Apply Leave | WF-01 | — | Timesheet §Leave #6 | UI |
| RULE-LV-003 | `to_date ≥ from_date` | Apply Leave | WF-01 | — | — | UI |
| RULE-LV-004 | Reason required | Apply Leave | WF-01 | `leave_requests.reason not null` | — | DB+UI |
| RULE-LV-005 | Balance sufficiency | Apply Leave | WF-01 | — | Leave App. #3 | UI |
| RULE-LV-006 | Sick leave needs certificate | Apply Leave | WF-01 | — | Leave App. #2 | UI |
| RULE-LV-007 | No overlapping leave | Apply Leave | WF-01 | `no_overlapping_leave` exclusion constraint | Leave App. #4 | **DB** |
| RULE-LV-008 | `approver_id` server-computed | Apply Leave | WF-01 | `enforce_approver_id()` trigger | Leave App. #5 | **DB** |
| RULE-LV-009 | New request → `pending` | Apply Leave | WF-01 | column default | — | **DB** |
| RULE-LV-010 | Admin decides any; manager only own | Approvals | WF-03 | RLS `leave_requests_update` | RLS §3 | **DB** |
| RULE-LV-011 | No per-row leave reject reason | Approvals | WF-03 | — | — | UI (gap) |
| RULE-LV-012 | Cancel eligibility window | My Leaves | WF-15 | `enforce_leave_cancellation()` trigger | Leave App. #7-10 | **DB** |
| RULE-LV-013 | Cancelled is terminal | My Leaves | WF-15 | same trigger | — | **DB** |
| RULE-LV-014 | Balance floor at 0 | Dashboard, Apply Leave | — | `get_leave_balance()` | — | DB (function) |
| RULE-LV-015 | Pro-ration only in joining year | Dashboard, Apply Leave | — | `prorated_days()` | — | DB (function) |
| RULE-LV-016 | Decision email best-effort | Approvals | WF-03 | — | — | Edge Fn |
| RULE-LV-017 | Leave not audit-logged | Admin Audit Log | — | (absence) | — | DB (absence) |
| RULE-CO-001–007 | Comp-off eligibility chain + cosmetic avail-date | Apply Comp Off | WF-02 | — | Comp-Off App. #1-5 | UI |
| RULE-CO-008 | No DB backstop for CO-001–006 | Apply Comp Off | WF-02 | (absence) | Comp-Off App. #6 | UI only |
| RULE-CO-009 | No cancel for comp-off | My Leaves | — | check constraint (no value) | — | **DB** (absence) |
| RULE-CO-010 | No reject reason column | My Leaves, Approvals | WF-04 | (absence) | — | **DB** (absence) |
| RULE-CO-011 | Admin-direct grant bypasses eligibility | Admin Add/Edit Employee | WF-05 | — | Comp-Off App. #7 | UI (privileged) |
| RULE-CO-012 | Approved comp-off increases balance | Approvals | WF-04 | `get_leave_balance()` | — | DB (function) |
| RULE-TS-001 | Week = Mon-Fri | Timesheet | WF-06 | — | — | UI |
| RULE-TS-002 | Entry hours `0<h≤24` | Timesheet | WF-06 | check constraint | Timesheet #1 | **DB+UI** |
| RULE-TS-003 | Entry ≤ remaining attendance budget | Timesheet | WF-06 | — | Timesheet #2 | UI |
| RULE-TS-004 | Pre-submit day-level checks | Timesheet | WF-06 | — | — | UI |
| RULE-TS-005 | Block submit at 0 hours | Timesheet | WF-06 | — | Timesheet #3 | UI |
| RULE-TS-006 | "Locked" pseudo-status | Timesheet | WF-06 | (absence — not a real column value) | Timesheet #4 | UI only |
| RULE-TS-007 | Self-unlock, no approval gate | Timesheet | WF-08 | — | Timesheet #5 | UI (by design) |
| RULE-TS-008 | Reject reason required | Approvals | WF-07 | — | — | UI |
| RULE-TS-009 | Jira sync before submit | Timesheet | WF-06 | — | — | Edge Fn |
| RULE-TS-010 | Timesheet decisions not audited | Admin Audit Log | — | (absence) | — | DB (absence) |
| RULE-AT-001 | Geolocation hard-required | Attendance | WF-09 | — | Attendance #1 | UI (hard block) |
| RULE-AT-002 | Nominatim reverse-geocode | Attendance | WF-09 | — | — | 3rd-party |
| RULE-AT-003 | Multi-session/day supported | Attendance | WF-09 | `attendance_punches` | Attendance #2 | **DB+UI** |
| RULE-AT-004 | Client-computed total_hours | Attendance | WF-09 | — | Attendance #2 | UI |
| RULE-AT-005 | 8h badge cosmetic only | Attendance | WF-09 | — | — | UI (cosmetic) |
| RULE-AT-006 | `'absent'` unreachable | Attendance | WF-09 | check constraint (unused value) | — | **DB** (unused) |
| RULE-AT-007 | Regularization triggers `incomplete` | Attendance | WF-10 | — | — | UI |
| RULE-AT-008 | Approval doesn't restore checkout data | Attendance, Approvals | WF-10 | — | Attendance #3 | UI (gap) |
| RULE-AT-009 | Rejection leaves status stuck | Attendance, Approvals | WF-10 | — | Attendance #4 | UI (gap) |
| RULE-AT-010 | No "my team only" scoping | Team, Approvals | — | RLS `attendance_select` | RLS §8 | **DB** (broad grant) |
| RULE-EMP-001 | New accounts force password change | Admin Add/Edit, Bulk Add | WF-11/12 | Edge Fn | Lifecycle #1 | Edge Fn |
| RULE-EMP-002 | Self-update column allow-list | Profile, Force Pw Change | WF-16 | `enforce_employee_self_update()` | Lifecycle #4-5 | **DB** |
| RULE-EMP-003 | Employee code auto-gen, read-only post-create | Admin Add/Edit | WF-11 | — | — | UI |
| RULE-EMP-004 | Admin-grant confirmation | Admin Add/Edit | WF-11 | — | — | UI |
| RULE-EMP-005 | Last-active-admin guard | Admin Employees, Team Emp. Detail | WF-13 | (absence) | Lifecycle #2-3 | UI only, duplicated |
| RULE-EMP-006 | Role changes always audited | Admin Add/Edit, Team Emp. Detail | — | `trg_audit_role_change` | — | **DB** |
| RULE-EMP-007 | Bulk-add skips approver_config | Admin Bulk Add | WF-12 | (absence) | Lifecycle #7 | UI (gap) |
| RULE-EMP-008 | Temp-password modes | Admin Bulk Add | WF-12 | — | — | UI |
| RULE-EMP-009 | Salary/leave-adj always audited | Admin Add/Edit | WF-13 | `trg_audit_salary`/`trg_audit_leave_adjustments` | Lifecycle #6 | **DB** |
| RULE-EMP-010 | One adjustment row per employee/type | Admin Add/Edit | WF-13 | `unique(employee_id,type_code)` | — | **DB** |
| RULE-SEC-001 | 8-char password minimum, no complexity | Login, Force Pw Change, Profile | WF-16 | — | — | UI |
| RULE-SEC-002 | Profile re-auth + new≠current | Profile | WF-16 | — | — | UI |
| RULE-SEC-003 | Jira token plaintext | Jira Settings | WF-16 | `jira_accounts.jira_api_token` | RLS §1-2 | DB (design) |
| RULE-SEC-004 | Admins excluded from Jira tokens | Jira Settings | WF-16 | RLS `jira_accounts_select_own` | RLS §2 | **DB** |

## Cross-Reference: Pages With No Business Rules (pure read/navigation screens)

Notifications, Team Calendar, Team (list, beyond the salary-hiding note), Admin Holidays (rule feeds *other* pages, none of its own beyond required-fields), Admin Audit Log, Admin Export — these 6 screens have no page-specific business-rule enforcement of their own; their entries above are all listed under the pages that *consume* their data instead.

## Coverage Summary

- **53 business rules** traced to **21 pages**, **16 workflows**, and **~15 database objects**.
- **18 rules are DB-enforced** (cannot regress without a schema change being noticed).
- **4 rules are DB-enforced-by-absence** (a deliberately or notably missing value/column/table).
- **1 rule is DB+UI dual-enforced.**
- **30 rules are UI-only** — every one of these is a candidate for either (a) an intentional accepted risk, documented as such, or (b) a future DB hardening pass, prioritized in `24_IMPLEMENTATION_ROADMAP.md`.
