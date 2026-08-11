# 24. Implementation Roadmap

Sequenced implementation plan consolidating every P0-P3 item from `22_GAP_ANALYSIS.md`, `23_TECHNICAL_DEBT.md`, `18_UI_UX_IMPROVEMENT_MATRIX.md`, and `19_SECURITY.md`. Phases are ordered by risk-reduction-per-unit-effort, not strictly by priority label alone — some P1 items are sequenced early because they're prerequisites for later work (e.g., a shared `StatusBadge` component should exist before the page-by-page visual improvements build on top of it).

## Phase 1 — Data-Integrity & Accessibility Foundations (do first, low effort/high risk-reduction)

These are small, mechanical, high-confidence changes with no design decisions required:

1. **Add a DB trigger enforcing "at least one active admin"** (closes `22_GAP_ANALYSIS.md` §1 P0 item, `RULE-EMP-005`) — the single highest-value hardening item in the whole audit; currently two independent, un-backstopped UI copies of this guard exist.
2. **Verify/fix the `salary_details` unique-constraint ambiguity** (`23_TECHNICAL_DEBT.md` §1) — confirm whether a unique index exists in the live DB; if not, add one before the upsert behavior causes a real duplicate-row incident.
3. **Restore a visible focus indicator on all inputs** — remove the unconditional `outline:'none'` in `inputStyle()`, add a `box-shadow` ring or border-color-on-focus substitute (`16_ACCESSIBILITY.md` §4).
4. **Darken `textTert`** to pass WCAG AA at the sizes it's actually used, and re-verify (`16_ACCESSIBILITY.md` §5).
5. **Make the 3 non-keyboard-operable elements operable** (Team row, medical-certificate dropzone, Bulk-Add CSV dropzone) — add `role="button"`/`tabIndex`/`onKeyDown` or convert to real `<button>`s (`16_ACCESSIBILITY.md` §3).

## Phase 2 — Critical Workflow Fixes

6. **Add a manual location/notes fallback for Attendance check-in/out** when geolocation is denied or unavailable — currently a hard block on the app's most-used daily action (`18_UI_UX_IMPROVEMENT_MATRIX.md` Critical item).
7. **Fix or remove the "Date to Avail Comp-Off" field** — either wire it to a real, enforced column, or remove the field/copy so the UI stops implying an unenforced rule (`RULE-CO-007`).
8. **Disable/clear End Date when Half Day is checked** on Apply Leave, or add an explicit inline warning — closes the silent 0.5-day-collapse surprise (`RULE-LV-002`).
9. **Surface the Admin Export attendance row cap and add date-range filters** to all 3 exports — closes a silent-data-completeness risk on exactly the exports most likely to feed compliance/payroll (`22_GAP_ANALYSIS.md` §2).
10. **Add an on-page scope caveat to the Admin Audit Log** stating exactly what is and isn't covered — cheap messaging fix that prevents a false sense of completeness during a real investigation.

## Phase 3 — Design System Consolidation (unblocks later page-level work)

11. **Build the unified `StatusBadge` component** replacing `Badge`/`TsBadge`/Attendance's inline pill (`13_DESIGN_SYSTEM.md` Part B).
12. **Retire the second "error red"** (`#E24B4A`) in favor of `C.red` everywhere.
13. **Add hover/active/focus-visible states to `btnStyle()`** so every button gets consistent press feedback, not just the desktop sidebar nav.
14. **Add Escape-key and click-outside dismiss to `Confirm`.**
15. **Add an optional CTA slot to `Empty`.**
16. **Fix the Toast state-collision bug** — add a toast ID/generation guard so a stale `setTimeout` can never clear a newer toast.

## Phase 4 — High-Value UX Improvements (per-page, from `18_UI_UX_IMPROVEMENT_MATRIX.md`)

17. Add a Dashboard quick-action row (Apply Leave / Check In).
18. Add per-item reason override within Approvals' bulk-reject flow.
19. Add a proactive toast + explanatory disabled-state tooltip for Timesheet's Friday-deadline lock.
20. Add a direct "Reactivate" action on inactive Admin Employees rows.
21. Add keyboard support + masked/copy-button treatment to Admin Bulk Add's dropzone and results table.
22. Add skeleton loaders to the highest-traffic screens (Dashboard, Approvals, My Leaves).

## Phase 5 — Testing & CI Foundation (parallelizable with Phases 2-4, blocks safe future iteration)

23. Stand up a minimal test framework (Vitest recommended, given the existing Vite toolchain) and write unit tests for every `validate()` function catalogued in `08_BUSINESS_RULES.md`.
24. Add pgTAP (or equivalent) tests for every DB constraint/trigger in `11_DATABASE_SPECIFICATION.md` §3 — highest ROI given these are the rules that actually can't regress silently once tested.
25. Add a CI workflow (lint + the new test suite) on PRs — none exists today.
26. Work through the E2E critical-path test cases in `20_QA_TEST_SPECIFICATION.md` §3, prioritized leave-apply/approve → attendance → timesheet.

## Phase 6 — Broader Hardening & Enhancements (lower urgency, larger scope)

27. Extend audit-log trigger coverage beyond salary/leave-adjustment/role-change to approvals and employee lifecycle events, per the gap in `19_SECURITY.md` §4.
28. Consider DB-level enforcement for the highest-risk UI-only rules identified in `22_GAP_ANALYSIS.md` §1 (leave balance sufficiency, comp-off eligibility) — larger effort, evaluate cost/benefit given these currently require a deliberately crafted API call to exploit.
29. Add CSP/security headers via `vercel.json` or an Edge Middleware layer.
30. Add basic application-level rate limiting to the 3 Edge Functions if usage patterns ever warrant it beyond Supabase-platform defaults.
31. Introduce a real tablet-width responsive treatment (600-900px) instead of the current mobile-or-desktop-only split.
32. Introduce a `<table>` layout at ≥1100px for Admin Employees and Audit Log specifically.
33. Add year/status filtering to My Leaves as history accumulates.
34. Add a "copy last year's holidays" or CSV-import shortcut to Admin Holidays.
35. Pin/verify the `@supabase/supabase-js` version drift and add Dependabot/Renovate.

## Sequencing Rationale

- **Phase 1 before everything else**: no design decisions needed, pure risk reduction, and Phase 1 item #1 (last-admin trigger) closes the single highest-severity gap in the entire audit.
- **Phase 3 before Phase 4**: page-level UX work references the unified `StatusBadge` and hardened `btnStyle`/`Confirm`/`Empty` components — building those first avoids rework.
- **Phase 5 can run in parallel** with Phases 2-4 once a developer is free, since test-writing doesn't block feature/fix work, but should be in place *before* Phase 6's larger architectural changes (DB-level rule enforcement) to avoid shipping those without regression coverage.
- **Phase 6 is intentionally last** — largest scope, lowest immediate risk (all P2/P3 items, or P0/P1 items where the fix itself carries meaningful implementation risk that benefits from the test foundation in Phase 5 being in place first).

## Effort/Impact Snapshot

| Phase | Item Count | Relative Effort | Risk Reduction |
|---|---|---|---|
| 1 | 5 | Low | Very High |
| 2 | 5 | Medium | High |
| 3 | 6 | Low-Medium | Medium (enables Phase 4) |
| 4 | 6 | Medium | Medium-High |
| 5 | 4 | Medium-High | High (durable, compounding) |
| 6 | 9 | High | Medium (broad but lower-urgency) |
