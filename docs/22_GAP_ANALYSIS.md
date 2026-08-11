# 22. Gap Analysis

Priority framework used throughout (per source brief Part 22): **P0 Critical** (security, broken workflows, data integrity, major accessibility) · **P1 High** (important workflow/UX problems) · **P2 Medium** (usability/consistency) · **P3 Enhancement** (nice-to-have). This file covers *functional/architectural* gaps — things the product doesn't do, or does only partially. UI/UX-specific gaps are in `18_UI_UX_IMPROVEMENT_MATRIX.md`; pure security gaps are in `19_SECURITY.md` §5/§10.

## 1. UI-Promises-Something-Backend-Doesn't-Deliver Gaps

| Gap | Where | Priority | Detail |
|---|---|---|---|
| "Date to Avail Comp-Off" is cosmetic | Apply Comp Off | **P1** | Validated in the UI, silently dropped before the insert (RULE-CO-007) |
| Balance sufficiency check is UI-only | Apply Leave | **P0** | A modified client can over-draw leave balance — no DB check ties `days` to `get_leave_balance()` |
| Sick-certificate requirement is UI-only | Apply Leave | **P1** | No DB constraint requires `medical_certificate_url` when `leave_type='sick'` |
| Comp-off eligibility chain is entirely UI-only | Apply Comp Off | **P0** | Past-date, weekend/holiday, ≥8h, 30-day-window, no-duplicate — none have a DB backstop (RULE-CO-008) |
| "Last active admin" is UI-only, duplicated | Admin Employees, Team Emp. Detail | **P0** | No DB constraint; two independently-maintained copies of the same guard can drift or race |
| Timesheet "locked" is a UI-only pseudo-status | Timesheet | **P2** | Real DB `status` never leaves `'draft'`; purely a derived display state |
| `attendance.status='absent'` is unreachable | Attendance | **P2** | Defined in the schema, never written by any code path |
| Regularization approval doesn't restore checkout data | Attendance, Approvals | **P1** | Only flips a status label; `check_out_time`/`total_hours` remain unset — a manager approving believes the record is fixed when it isn't |
| Regularization rejection leaves status permanently stuck | Attendance | **P1** | No code path resets `attendance.status` off `'incomplete'` after a rejection |

## 2. Functional Gaps (capability entirely absent, relative to a comparable product)

| Gap | Priority | Notes |
|---|---|---|
| No automated test suite, no CI pipeline | **P1** | Confirmed absent — no test script, no test framework dependency, no `.github/workflows/` (`20_QA_TEST_SPECIFICATION.md`) |
| No DB-level "last active admin" protection | **P0** | See §1 above — the single highest-value DB hardening item in the whole audit |
| No MFA/2FA | **P2** | Single-factor password auth only |
| No push notifications, no notifications table | **P2** | Notifications feed is entirely client-synthesized from 5 existing tables on every visit; no read/unread state |
| No "Reactivate" action for deactivated employees | **P2** | Only reachable via the generic Team edit form's Status field |
| No date-range/status filtering on any export | **P1** | Leave Requests export is always full-table; Attendance export silently truncates at 1,000 rows with no on-screen indication |
| Audit log covers only 3 of ~16 workflow types | **P1** | Approvals, employee lifecycle, holiday CRUD, Jira connects, logins — none logged |
| No filtering/sorting/pagination on My Leaves history | **P3** | Grows in priority as tenure/history accumulates |
| No recurring/bulk-import holiday support | **P3** | Every year's calendar re-entered one row at a time |
| No self-service account signup | **P3** (by design) | Intentional — admin-gated onboarding is the correct model for this product's trust boundary, not a gap to close |
| No multi-tenant/organization concept | **P3** (by design, out of scope) | Single-company product — not a gap unless the business intends to support multiple companies |
| No statutory/compliant payslip generation | **P3** (by design, explicitly documented as non-goal) | `payslip.js` is explicitly a non-statutory print view |
| No "my direct reports only" scoping for manager reads | **P2** | Any manager can read any employee's attendance/timesheet via RLS's broad `is_manager()` grant — not exploitable without API access, but a real completeness gap relative to the principle of least privilege |
| No approver_config set by Bulk Add | **P2** | Bulk-onboarded employees need a manual follow-up edit before their approval routing works (RULE-EMP-007) |
| No CSP/security headers configured | **P2** | Relies entirely on hosting-platform (Vercel) defaults |
| No rate limiting at the application layer | **P2** | Entirely dependent on Supabase-platform defaults, not configurable from this repo |
| No dark mode / `prefers-color-scheme` handling | **P3** | Light-only palette throughout |
| No tablet-specific responsive layout | **P2** | Jumps directly from capped-mobile to full-desktop-sidebar at 768px |

## 3. Accessibility Gaps (full detail in `16_ACCESSIBILITY.md`)

| Gap | Priority |
|---|---|
| No focus-visible indicator on any form input | **P0** |
| `textTert` fails WCAG AA contrast at the sizes actually used | **P0** |
| 3 non-keyboard-operable interactive elements (Team row, 2 upload dropzones) | **P1** |
| No `aria-label` on bare-glyph buttons | **P2** |
| No live-region for async state changes (Toast) | **P2** |
| Form errors not linked via `aria-describedby`/`role="alert"` | **P2** |
| No skip-links / landmark roles | **P3** |

## 4. Design-System Gaps (full detail in `13_DESIGN_SYSTEM.md`)

| Gap | Priority |
|---|---|
| 3 divergent status-badge implementations instead of 1 shared component | **P2** |
| Two different "error red" values (`C.red` vs. hardcoded `#E24B4A`) | **P2** |
| No formal type scale — raw pixel literals throughout | **P3** |
| No shared spacing scale | **P3** |
| No disabled-state styling baked into `btnStyle` (ad hoc opacity instead) | **P3** |
| No hover/focus state on any button except the desktop sidebar nav | **P1** |

## 5. Gap Count Summary

| Priority | Count |
|---|---|
| P0 (Critical) | 5 |
| P1 (High) | 8 |
| P2 (Medium) | 12 |
| P3 (Enhancement) | 8 |
| **Total** | **33** |

Note: several P3 items are explicitly **by-design non-goals** (self-signup, multi-tenant, statutory payslips) rather than oversights — flagged as such above so they aren't mistaken for unintentional gaps in `24_IMPLEMENTATION_ROADMAP.md` sequencing.
