# 20. QA / Test Specification

## 1. Current Automated Test Coverage

**None.** `leave-app/package.json` has no `test` script, no test runner dependency (no Jest/Vitest/Playwright/Cypress/Testing Library in `devDependencies`), and no `.github/workflows/` CI config exists in the repository. All verification today is manual. This is tracked as a P1 item in `23_TECHNICAL_DEBT.md` and `24_IMPLEMENTATION_ROADMAP.md`.

## 2. Recommended Test Strategy

Given the architecture (RLS as the real security/business-rule boundary for many rules, thin React components), test investment should prioritize in this order:

1. **DB-level tests** (pgTAP or a Supabase-local test harness) for every constraint/trigger in `11_DATABASE_SPECIFICATION.md` §3 — these protect the rules that actually can't be bypassed, and regressions here are the highest-severity kind (a broken trigger silently reopens a closed security hole).
2. **Component/unit tests** for every `validate()` function catalogued in `08_BUSINESS_RULES.md` — these are pure functions in most cases and cheap to test in isolation.
3. **Integration/E2E tests** for the 16 workflows in `06_BUSINESS_WORKFLOWS.md`, prioritized by traffic (leave apply/approve, attendance check-in/out, timesheet submit/approve first).

## 3. Critical Test Cases by Workflow

### Leave Application (WF-01)
| # | Case | Expected |
|---|---|---|
| 1 | Submit with `to_date < from_date` | Blocked client-side (RULE-LV-003) |
| 2 | Submit sick leave with no certificate | Blocked client-side (RULE-LV-006) |
| 3 | Submit with `days > remaining` balance | Blocked client-side; **and** verify a direct `insert` (bypassing the UI) succeeds anyway — confirms RULE-LV-005 is UI-only, should be asserted as a *known* gap, not a false negative |
| 4 | Submit two overlapping pending requests for the same employee | Second insert rejected by `no_overlapping_leave` (DB-level — must fail even via direct API) |
| 5 | Submit with a client-supplied `approver_id` different from the real approver | Trigger overwrites it silently — assert the stored value equals `get_approver()`'s result, not the submitted one |
| 6 | Half Day checked with a 5-day range | `days` stored = 0.5 (RULE-LV-002 — regression test for the known silent-collapse behavior) |
| 7 | Self-cancel a `pending` request | Succeeds, `status='cancelled'` |
| 8 | Self-cancel an `approved` request with `from_date` in the past | **Blocked** by `enforce_leave_cancellation()` — must fail even via direct API |
| 9 | Self-cancel an `approved` request with `from_date` in the future | Succeeds |
| 10 | Attempt to change `reason` in the same update that cancels | Blocked — trigger requires all other columns unchanged |

### Comp-Off Application (WF-02)
| # | Case | Expected |
|---|---|---|
| 1 | Worked date = today or future | Blocked client-side (RULE-CO-001) |
| 2 | Worked date = a weekday with no matching holiday | Blocked client-side (RULE-CO-002) |
| 3 | Duplicate request for a worked date with an existing non-rejected request | Blocked client-side (RULE-CO-003) |
| 4 | Attendance for the worked date has `total_hours=7.5` | Blocked client-side (RULE-CO-004, `≥8` required) |
| 5 | Avail date > 30 days after worked date | Blocked client-side (RULE-CO-006) |
| 6 | Direct API insert bypassing all of the above | **Succeeds** — regression test asserting RULE-CO-008 (no DB backstop) remains a documented, intentional-until-fixed gap, not silently "passing" a security review |
| 7 | Admin grant via `grantCompOff()` with no attendance record at all | Succeeds, `status='approved'` immediately (WF-05, by design) |

### Timesheet (WF-06/WF-08)
| # | Case | Expected |
|---|---|---|
| 1 | Entry with `hours=0` or `hours=25` | Blocked both client-side and DB-side (RULE-TS-002, dual-enforced — verify DB rejects even a direct insert) |
| 2 | Entry hours exceed remaining attendance budget for the day | Blocked client-side only (RULE-TS-003) — verify a direct insert succeeds (documents the gap) |
| 3 | Submit with `totalHours=0` | Blocked (RULE-TS-005) |
| 4 | Submit on a day past the Friday deadline, status still `draft` | UI shows "locked"; verify `status` column itself is unaffected (still `'draft'`) — regression test for RULE-TS-006 |
| 5 | `requestLateTimesheetSubmission()` with an arbitrary reason string | Succeeds unconditionally, no approval gate (RULE-TS-007 — intentional, verify it stays that way if this is ever "fixed" to require approval) |

### Attendance (WF-09/WF-10)
| # | Case | Expected |
|---|---|---|
| 1 | Check-in with geolocation denied | Blocked entirely, no manual fallback exists today (RULE-AT-001 — regression test that should start *failing* once the recommended fallback ships) |
| 2 | Two check-in/check-out cycles in one day | Both persisted as separate `attendance_punches` rows; `total_hours` sums both sessions (RULE-AT-003/004) |
| 3 | Approve a regularization | `attendance.status→'present'`; verify `check_out_time`/`total_hours` are **still unset** (RULE-AT-008 — documents the known gap) |
| 4 | Reject a regularization | `attendance.status` remains `'incomplete'` permanently (RULE-AT-009 — documents the known gap) |

### Employee Lifecycle (WF-11/WF-12/WF-13)
| # | Case | Expected |
|---|---|---|
| 1 | Non-admin calls `create-employee` directly | 403, even with a hand-crafted request (server-side role check independent of RLS) |
| 2 | Attempt to demote the sole active admin via the UI | Blocked with a toast (RULE-EMP-005) |
| 3 | Attempt to demote the sole active admin via a **direct** `update employees` call | **Succeeds** — regression test documenting the confirmed DB-level gap; should start failing once a DB trigger is added per `24_IMPLEMENTATION_ROADMAP.md` |
| 4 | Non-admin attempts to self-update `role` | Blocked by `enforce_employee_self_update()` even via direct API |
| 5 | Non-admin attempts to self-update `phone` | Succeeds |
| 6 | Save a leave adjustment | `audit_log` gains exactly one `leave_adjustment` row with correct old/new values |
| 7 | Bulk-add a row with an invalid `joining_date` format | Excluded from `readyRows`, not sent to `create-employee` |

### Security / RLS Boundary Tests (highest ROI, run against a Supabase local instance, not just the UI)
| # | Case | Expected |
|---|---|---|
| 1 | Employee A queries `salary_details` for any `employee_id` | 0 rows returned (RLS, not just UI-hidden) |
| 2 | Employee A queries another employee's `jira_accounts` row, including as an admin | 0 rows returned for anyone but the owner |
| 3 | Manager B (not the assigned approver) attempts to `update` a leave request's status | Rejected by RLS |
| 4 | Employee queries `audit_log` | 0 rows (admin-only read policy) |
| 5 | Any authenticated user calls `get_team_calendar()` | Returns only `status='approved'` rows, never `reason`/`reject_reason`/certificate URL, for **any** employee including ones they'd otherwise have no relationship to |

## 4. Manual QA Checklist (until automation exists)

Per-release smoke test, covering the Critical/High items from `18_UI_UX_IMPROVEMENT_MATRIX.md`:
- [ ] Check-in/out works with geolocation granted; confirm the (currently absent) denial behavior matches what's documented before shipping the recommended fallback.
- [ ] Apply Leave: half-day + multi-day range behavior matches documented RULE-LV-002 (or the fix, once shipped).
- [ ] Approvals: bulk-approve/reject across all 4 sub-tabs; verify partial-failure reporting still works.
- [ ] Admin: create, edit, deactivate, and (if implemented) reactivate an employee; verify the last-admin guard still blocks the correct case.
- [ ] Bulk Add: upload a CSV with a mix of valid/invalid rows; verify only valid rows create employees and the results/CSV-export step is correct.
- [ ] Every form: tab through with keyboard only, confirm focus is visible once the accessibility fixes ship.
- [ ] Every destructive `Confirm` dialog: verify Yes/Cancel behavior; confirm Escape/click-outside once that fix ships.

## 5. Test Environment Notes

No staging environment or seed-data script beyond the placeholder bootstrap SQL scripts (`11_DATABASE_SPECIFICATION.md` §7) was found in the repo — a test suite would need its own Supabase project (local `supabase start` or a dedicated test project) seeded via those same template scripts with clearly-fake data, consistent with the project's own "never commit real data" convention.
