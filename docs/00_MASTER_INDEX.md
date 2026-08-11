# 00. Master Documentation Index

Complete regenerated documentation package for the **Leave Manager** application (`leave-app/`), a single-tenant React + Supabase leave/attendance/timesheet/HR-admin app. Every fact in this package was verified directly against source code (component files, `schema.sql`, migrations, Edge Functions) as of commit `e0b59b7` — nothing here is templated or assumed. Where the codebase diverges from what the UI implies, that divergence is documented explicitly rather than smoothed over.

## Document Index

| # | Document | Contents |
|---|---|---|
| 01 | [Product Specification](01_PRODUCT_SPECIFICATION.md) | Overview, tech stack, scale snapshot |
| 02 | [User Personas](02_USER_PERSONAS.md) | Employee, Manager, Admin — goals, tasks, pain points |
| 03 | [Roles & Permissions](03_ROLES_AND_PERMISSIONS.md) | Full permission matrix, frontend/backend mismatches |
| 04 | [Information Architecture](04_INFORMATION_ARCHITECTURE.md) | Full screen hierarchy, nav mechanism, component file map |
| 05 | [Page-by-Page Specification](05_PAGE_BY_PAGE_SPECIFICATION.md) | All 21 screens, 38-point template each |
| 06 | [Business Workflows](06_BUSINESS_WORKFLOWS.md) | 16 workflows with Mermaid diagrams (4) and full detail |
| 07 | [State Machines](07_STATE_MACHINES.md) | All 6 status fields, Mermaid state diagrams, gaps |
| 08 | [Business Rules](08_BUSINESS_RULES.md) | 53 rules, DB-enforced vs. UI-only, by module |
| 09 | [System Architecture](09_SYSTEM_ARCHITECTURE.md) | Serverless SPA-on-BaaS architecture diagram |
| 10 | [API Specification](10_API_SPECIFICATION.md) | Auth, 3 RPCs, 3 Edge Functions, PostgREST surface |
| 11 | [Database Specification](11_DATABASE_SPECIFICATION.md) | All 15 tables, RLS summary, triggers, constraints |
| 12 | [Data Flow](12_DATA_FLOW.md) | 6 Mermaid sequence/flow diagrams for key operations |
| 13 | [Design System](13_DESIGN_SYSTEM.md) | Current tokens + recommended semantic system |
| 14 | [UI/UX Audit](14_UI_UX_AUDIT.md) | Cross-cutting pattern audit (cards, buttons, modals, toasts...) |
| 15 | [Responsive Design](15_RESPONSIVE_DESIGN.md) | Breakpoint audit, tablet gap, whitespace problem |
| 16 | [Accessibility](16_ACCESSIBILITY.md) | 9-category audit, 6 real issues found |
| 17 | [Design Generation Prompts](17_DESIGN_GENERATION_PROMPTS.md) | 21 AI-design-tool-ready prompts, one per screen |
| 18 | [UI/UX Improvement Matrix](18_UI_UX_IMPROVEMENT_MATRIX.md) | 24 consolidated improvements, severity-ranked |
| 19 | [Security](19_SECURITY.md) | 15 findings across 9 concern areas |
| 20 | [QA Test Specification](20_QA_TEST_SPECIFICATION.md) | Test strategy + critical test cases (no automation exists today) |
| 21 | [Traceability Matrix](21_TRACEABILITY_MATRIX.md) | Every rule ↔ page ↔ workflow ↔ DB object ↔ test |
| 22 | [Gap Analysis](22_GAP_ANALYSIS.md) | 33 functional/architectural gaps, P0-P3 |
| 23 | [Technical Debt](23_TECHNICAL_DEBT.md) | 15 debt items, code/architecture/dependency/docs |
| 24 | [Implementation Roadmap](24_IMPLEMENTATION_ROADMAP.md) | 35 items across 6 sequenced phases |

**24 documents, ~2,900 lines.**

---

## Final Master Summary

### Product
- **Modules**: 8 (Leave, Comp-Off, Attendance, Timesheet, Team Calendar, Approvals, Admin/HR, Profile/Integrations)
- **Screens analysed**: 21 (13 top-level nav tabs + Login + Force Password Change + Forgot Password subflow + Team Employee Detail sub-view + 4 Admin Panel sub-sections, 2 of which split into further view-states)
- **Roles**: 3 (`admin`, `manager`, `employee`)
- **Workflows**: 16
- **Major database entities**: 15 tables
- **RLS policies**: 40+
- **Callable RPCs**: 3 · **Trigger functions**: 7 · **Edge Functions**: 3

### Current State
- **What works well**: RLS-based authorization is comprehensive and is genuinely the app's primary security boundary (verified, not assumed); the leave-overlap constraint, self-approval prevention, and self-update column restriction are all real, tested-by-history DB-level guarantees (visible via `migration-security-hardening.sql`'s fix history); bulk actions on Approvals report partial failures explicitly rather than swallowing them; the leave-cancellation and comp-off-approval flows are cleanly modeled state machines.
- **What partially works**: attendance regularization (approval doesn't restore checkout data); timesheet late-submission unlock (works, but has no approval gate — an intentional but notable trust decision); the audit log (real, but covers only 3 of ~16 workflow types); the "last active admin" guard (works via UI, absent at the DB level).
- **What is broken/gap**: no DB backstop for leave-balance sufficiency or comp-off eligibility (30 of 53 catalogued business rules are UI-only); "Date to Avail Comp-Off" is a fully cosmetic field; `attendance.status='absent'` is unreachable; no automated tests or CI exist at all.
- **What is mock/non-functional**: none found — no fake data, no stubbed integrations; the payslip feature is explicitly and correctly self-documented as non-statutory rather than being a misleading mock.
- **What is missing** (by design, not oversight): multi-tenant support, MFA/SSO, self-service signup, statutory payroll — all confirmed absent and consistent with a single-company internal tool's actual scope.

### UX
- **Biggest UX problems**: zero actionable buttons on Dashboard; silent half-day-collapses-to-0.5-days behavior on Apply Leave; a cosmetic comp-off avail-date field; single-reason bulk-reject in Approvals; a hard geolocation-or-nothing block on Attendance check-in/out.
- **Biggest accessibility problems**: no focus-visible indicator on any form input app-wide; `textTert` fails WCAG AA contrast at the sizes it's actually used; 3 non-keyboard-operable interactive elements (Team row, 2 upload dropzones).
- **Biggest consistency problems**: 3 divergent status-badge implementations instead of 1 shared component; 2 different "error red" values; no shared button hover/focus state except the desktop sidebar nav.

### Technical
- **Biggest architecture problems**: no router (refresh always returns to Dashboard, no deep-linking); no automated tests/CI; 100% RLS reliance means every new business rule needs either a Postgres trigger or stays UI-only by default.
- **Biggest security problems**: "last active admin" rule has zero DB backstop despite being duplicated in 2 UI surfaces; Jira API tokens stored in plaintext; audit-log coverage gap.
- **Biggest technical debt**: `salary_details` upsert-vs-unique-constraint ambiguity (verify before it causes a real duplicate-row incident); duplicated last-admin-guard logic; no test suite protecting any of the 30 UI-only business rules from silent regression.

### Product Improvement Counts
- **P0 (Critical)**: 5 — last-active-admin DB backstop, leave-balance/comp-off DB enforcement gaps, focus-indicator + contrast accessibility fixes
- **P1 (High)**: 8 — test suite/CI, export filtering/caps, audit-log coverage messaging, regularization data-restoration gap, keyboard-operability gaps, no-hover-state buttons
- **P2 (Medium)**: 12 — status-badge consolidation, MFA, notifications read-state, reactivate action, my-team-only scoping, bulk-add approver_config, security headers, rate limiting, tablet layout, and others
- **P3 (Enhancement)**: 8 — history filtering, holiday bulk-import, dark mode, dependency pinning, and others

### Design
- **Current design strengths**: a genuinely consistent, if minimal, design system in practice (one dominant `card` primitive, one `Field`/`inputStyle`/`btnStyle` set, a real if informal color palette that mostly passes contrast); a deliberate mobile-first card-over-table choice that's the right call on 19 of 21 screens (the 2 exceptions, both in Bulk Add, correctly use `<table>` where density genuinely matters); status conveyed by color + text label together, never color alone.
- **Recommended design direction**: formalize what already exists (semantic token layer over the current literal `C` palette) rather than replace it; consolidate the 3 status-badge implementations into 1; close the focus-indicator and contrast gaps mechanically; extend the existing card-vs-table judgment to Admin Employees/Audit Log at desktop widths, where data density now genuinely outgrows the card pattern.
- **Design-system changes**: see `13_DESIGN_SYSTEM.md` Part B for the full semantic token proposal (color, type scale, spacing, radius, button variants).
- **Component-system changes**: unified `StatusBadge`; `btnStyle` with built-in disabled/hover/focus states; `Empty` with an optional CTA slot; `Confirm` with Escape/click-outside dismiss; `Toast` with a generation-guarded dismiss timer.

---

## Top 20 Recommended Improvements (ranked)

1. Add a DB trigger enforcing "at least one active admin" (closes the highest-severity gap found)
2. Restore visible focus indicators on all form inputs
3. Fix `textTert` contrast to pass WCAG AA
4. Add a manual fallback for Attendance check-in/out when geolocation is denied
5. Make the Team row and both upload dropzones keyboard-operable
6. Verify/fix the `salary_details` unique-constraint ambiguity
7. Fix or remove the cosmetic "Date to Avail Comp-Off" field
8. Disable/clear End Date when Half Day is checked on Apply Leave
9. Surface the Admin Export attendance-row cap and add date-range filters
10. Add an on-page scope caveat to the Admin Audit Log
11. Build a unified `StatusBadge` component
12. Add hover/active/focus-visible states to `btnStyle`
13. Add a Dashboard quick-action row (Apply Leave / Check In)
14. Allow per-item reason override in Approvals' bulk-reject flow
15. Add a proactive toast + explained disabled-state for Timesheet's Friday lock
16. Add a direct "Reactivate" action for inactive employees
17. Add keyboard support + masked/copy-button treatment to Admin Bulk Add
18. Fix the Toast state-collision bug (generation-guarded dismiss timer)
19. Stand up a minimal test suite (Vitest) + CI, starting with the `validate()` functions and DB triggers
20. Extend audit-log trigger coverage to approvals and employee lifecycle events

## Recommended Implementation Sequence

Follow `24_IMPLEMENTATION_ROADMAP.md`'s 6 phases in order: **Phase 1** (data-integrity + accessibility mechanics, no design decisions needed) → **Phase 2** (critical workflow fixes) → **Phase 3** (design-system consolidation, unblocks page-level work) → **Phase 4** (high-value per-page UX) → **Phase 5** (testing/CI, parallelizable with 2-4) → **Phase 6** (broader hardening + enhancements, intentionally last given its scope).

---

*This documentation package supersedes any prior version. It was generated through direct source verification (component files, `schema.sql`, all migrations, all 3 Edge Functions) rather than templated assumptions — every file/line reference throughout the 24 documents can be independently re-verified against the current repository state.*
