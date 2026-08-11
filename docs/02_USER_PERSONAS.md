# 02. User Personas

Three roles exist in the database (`employees.role check (role in ('admin','manager','employee'))`, `schema.sql:22`). There is no separate "HR" role — HR-type functions (salary, holidays, audit log, bulk onboarding) are folded entirely into `admin`. `is_manager()` (`schema.sql:374-377`) returns true for both `manager` and `admin`, so every manager capability below is also available to admins.

---

## Persona 1: Employee

### Role
`employee` — the default role for every new hire (`schema.sql:22` default).

### Who they are
Any individual contributor with no direct reports configured as an approver. In practice this is the majority of the user base — every account starts here unless explicitly promoted.

### Responsibilities
Show up, check in/out, log timesheet hours against real work, apply for leave/comp-off through the system instead of side-channel requests, keep their own profile (phone/address/DOB) current, keep their password secure.

### Goals
- Know their current leave balance before deciding whether to ask for time off.
- Get a leave/comp-off decision without having to chase anyone.
- Not lose track of a missed checkout or a locked timesheet.
- See the team calendar to know who else is out before requesting overlapping dates.

### Common tasks
Check in/out daily (`Attendance` tab); log timesheet entries and submit weekly by Friday (`Timesheet` tab); apply for leave (`Apply` tab) or comp-off (`Comp Off` tab); view request history and cancel a pending/not-yet-started request (`History`/`MyLeaves` tab); view the team calendar; connect a personal Jira account for worklog sync; edit phone/address/DOB and change password (`Profile` tab).

### Information they need
Remaining balance per leave type, whose approving their request (shown as an "approver preview" on Apply Leave), company holiday list, their own attendance/timesheet history, decision reasons on rejected requests.

### Actions they perform
Create: leave request, comp-off request, timesheet entries, attendance punches, regularization request, Jira connection. Read: own history, team calendar (narrow RPC — never sees others' leave reason/certificate), dashboard summary, notifications feed. Update: own profile fields (phone/address/DOB only — enforced by `enforce_employee_self_update()` DB trigger, not just hidden UI), own password, cancel own pending/not-yet-started-approved leave, unlock own locked timesheet via late-submission request. Delete: nothing (no delete capability anywhere in the employee role).

### Restrictions
Cannot see any other employee's salary, leave reason, medical certificate, or Jira token (RLS-enforced, not just UI-hidden). Cannot approve anything (no `approvals`/`team`/`admin` tabs in nav). Cannot edit `role`, `employee_code`, `is_active`, `manager_id`, `email` on their own record — DB trigger blocks it even if attempted via a raw API call.

### Pain points in current application
- No actionable button on the Dashboard — must switch tabs to act on anything seen there (`13_UI_UX_Documentation.md` §Page 3).
- Half-day + multi-day range silently collapses to 0.5 days with no warning (`ApplyLeave.jsx:46-49`) — see `08_BUSINESS_RULES.md` RULE-LV-007.
- Comp-off rejection gives no reason (no `reject_reason` column on `comp_off_requests` at all).
- Locked timesheet gives no proactive explanation — the Friday deadline banner is easy to miss, and nothing fires the moment it locks.
- Refreshing the browser mid-flow (e.g., mid-edit) always returns to Dashboard — no URL routing exists.

### Recommended UX improvements
Add a dashboard quick-action ("Apply Leave" / "Check In"); disable/clear the end-date field when Half Day is checked instead of silently overriding; add a reason field to comp-off rejection at the DB level; fire a toast the instant a timesheet's Friday deadline passes if the tab is open.

---

## Persona 2: Manager

### Role
`manager` — assigned by an admin, either as an employee's `manager_id` (fallback approver) or explicitly via `approver_config` (priority-ordered primary approver).

### Who they are
A team lead responsible for a subset of employees, either through the org's reporting line (`manager_id`) or an explicit approver assignment that doesn't require being someone's literal manager (e.g., a delegated approver).

### Responsibilities
Everything an Employee does, plus: review and decide on pending leave/comp-off/timesheet/attendance-regularization requests routed to them; view their team's roster, leave/timesheet/attendance history (not salary — see restrictions); view the team calendar with full visibility.

### Goals
- Clear their approval queue quickly without losing context on each request (balance impact, attendance backing for comp-off, entry-level detail for timesheets).
- Avoid approving something that later turns out to violate a rule (the app does most of this validation client-side before the request ever reaches them, so by the time it's in their queue it has already passed the requester's own checks — but not server-side re-validation, see `08_BUSINESS_RULES.md` §UI-only rules).
- Understand who on their team is unavailable when planning work.

### Common tasks
Everything in Persona 1, plus: `Approvals` tab (4 sub-tabs: Comp Off / Leave Requests / Timesheets / Regularizations) with per-item and bulk approve/reject; `Team` tab to search the roster and drill into an employee's leave/timesheet/attendance detail (`EmployeeDetail` sub-view).

### Information they need
Per-request: employee name, dates/hours, reason, balance impact (leave), attendance backing (comp-off/timesheet), certificate (sick leave). Team-wide: who's out today/this week (team calendar), pending-count badges.

### Actions they perform
All Employee actions, plus: Approve/Reject (single or bulk) leave, comp-off, timesheet, regularization requests routed to them; view (not edit) team members' leave/timesheet/attendance history; view medical certificates for sick-leave requests they're deciding (short-lived signed URL).

### Restrictions
Cannot see salary (`salary_details` RLS is `is_admin()`-only — a manager gets zero rows even if they try). Cannot create/edit/deactivate employees, manage holidays, view the audit log, or export data — no `admin` tab. Per RLS, `leave_requests_update` actually allows **any** admin to decide **any** pending request regardless of assigned approver (`schema.sql:473-475`) — a manager, by contrast, can only decide requests where they are specifically `approver_id`.

### Pain points in current application
- A single typed rejection reason applies to every item in a bulk-reject batch, regardless of employee/context.
- No per-row reject reason for leave decisions specifically (only bulk-reject has an optional reason field, and only for timesheets/regularizations is a reason mandatory).
- Approving an attendance regularization doesn't actually write the proposed checkout time back into the attendance row — only flips a status label (`06_BUSINESS_WORKFLOWS.md` workflow 1.9) — a manager could reasonably believe they've "fixed" the record when only the status changed.

### Recommended UX improvements
Allow per-item reason override within a bulk-reject batch; add a reason field for leave rejections at the DB level; surface team-impact ("N others on leave same week") on the approval screen.

---

## Persona 3: Admin

### Role
`admin` — the highest-privilege role; also functions as this app's "HR" role since there is no separate HR persona.

### Who they are
Typically a founder, HR lead, or ops person responsible for the company's employee roster, compensation records, and system configuration. Also implicitly a manager for RLS purposes (`is_manager()` includes admins).

### Responsibilities
Everything a Manager does (admins can approve anything, not just requests routed to them), plus: employee lifecycle (create/edit/deactivate/reactivate), salary records, approver routing configuration, per-employee leave-type adjustments, company holiday calendar, reviewing the audit log, CSV exports, and — the one DB-enforced invariant they must personally not violate — keeping at least one active admin in the system at all times (a rule enforced only client-side, see `08_BUSINESS_RULES.md` RULE-LV-025).

### Goals
- Onboard new hires quickly (single add or CSV bulk-add) without hand-writing SQL.
- Keep salary and leave-adjustment changes auditable in case of a dispute.
- Avoid accidentally locking themselves (or the whole company) out by demoting/deactivating the last admin.
- Export data for external reporting (payroll, compliance) without building a reporting feature.

### Common tasks
Add/edit/deactivate employees (`AdminPanel` → Employees); bulk-add via CSV (`BulkAddEmployees`); manage salary, approver config, and leave adjustments per employee; manage company holidays; review the audit log (salary/leave-adjustment/role-change events only); export employee roster / leave requests / attendance to CSV; grant/revoke the admin role (with a confirmation step); everything Manager and Employee can do.

### Information they need
Full employee roster with salary and role, audit trail of privileged changes, holiday calendar, export-ready data.

### Actions they perform
Full CRUD on `employees` (except literal SQL delete — deactivation is soft via `is_active`), full CRUD on `salary_details`, `approver_config`, `leave_adjustments`, `company_holidays`; read on `audit_log`; CSV export; role grant/revoke; admin-direct comp-off credit grant (bypasses the normal apply→approve flow entirely, `06_BUSINESS_WORKFLOWS.md` workflow 1.5).

### Restrictions
None at the RLS layer beyond `is_admin()` gating — admins can read/write every table. The one restriction that exists is entirely self-imposed by the UI/business-rule design: the "last active admin" guard, which — critically — is **not** backed by a database constraint, so a raw API call could still violate it (`19_SECURITY.md` finding).

### Pain points in current application
- No visible "Reactivate" button on inactive employee rows in the Admin Employees list — reactivation requires opening Edit and manually flipping the Status field (in `Team.jsx`'s edit form, not `AdminPanel.jsx`'s).
- Audit log covers only 3 of many privileged actions (salary, leave adjustment, role change) — approvals, employee creation/deactivation, holiday CRUD, and Jira connects are not logged, which could mislead an admin into treating it as a complete activity trail.
- The "last admin" guard is duplicated independently in `AdminPanel.jsx` and `Team.jsx` rather than shared — a third edit surface, if ever added, could reopen the gap.
- Bulk-add doesn't set `approver_config` — only `manager_id` — so bulk-onboarded employees need a manual follow-up edit before their approval routing is fully configured.

### Recommended UX improvements
Add a direct "Reactivate" action on inactive rows; add an on-page caveat to the Audit Log stating exactly what is and isn't covered; move the last-admin check into a DB trigger so it can't regress; extend bulk-add to also accept an `approver_employee_code` column.
