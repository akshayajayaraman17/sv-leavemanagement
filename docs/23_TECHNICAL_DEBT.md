# 23. Technical Debt

Debt items are things that work correctly today but carry a maintenance, drift, or latent-bug risk. Distinct from `22_GAP_ANALYSIS.md` (missing capability) — everything here already exists but in a form that will cost more to change or is one edge case away from a real bug.

## 1. Code-Level Debt

| Item | Location | Risk | Priority |
|---|---|---|---|
| `salary_details` upsert relies on `onConflict:'employee_id'` with no visible matching unique constraint in the tracked schema | `api.js:135-142`, `schema.sql` (only a non-unique index exists) | Could silently create duplicate salary history rows instead of updating, depending on what actually exists in the live DB vs. the checked-in migration files | **High** |
| "Last active admin" guard duplicated independently in 2 files | `AdminPanel.jsx:54,118,731-737` and `Team.jsx:71-79` | Any future change to the rule (e.g., loosening it, adding a new condition) must be made twice; a third edit surface, if added, could reopen the gap by omission | **High** |
| Three separate status-badge implementations (`Badge`, `TsBadge`, Attendance's inline pill) | `UI.jsx:67-83`, `Timesheet.jsx:42-56`, `Attendance.jsx:555-563` | A future status-color/label change requires touching 3 files and remembering all 3 exist | Medium |
| No shared password validator — the same `length≥8` check reimplemented 3 times | `Login.jsx:157`, `ForcePasswordChange.jsx:16`, `Profile.jsx:47-49` | Inconsistent already (Profile has extra checks ForcePasswordChange lacks) — will drift further with each edit | Medium |
| Two "error red" values that are almost, but not exactly, the same color | `UI.jsx:35,91` (`#E24B4A`) vs. `C.red` (`#A32D2D`) | Visual inconsistency that's easy to accidentally "fix" incorrectly by someone who doesn't realize both exist | Low |
| No formal type scale — raw pixel literals repeated across every component | All 19 component files | A rebrand or accessibility-driven resize requires touching every file individually | Low |
| `attendance.status='absent'` defined but unreachable by any code path | `schema.sql:544-545` | Dead constraint value; a future feature assuming it's actively maintained (e.g., an "absent days" report) would silently return nothing | Low |
| `timesheets.reject_reason` column repurposed to also store late-submission-unlock reasons (prefixed `'Late submission: '`) | `api.js:484-490` | String-prefix-based dual-purpose column is fragile — any future feature reading `reject_reason` expecting only rejection text needs to account for this, and the prefix could theoretically collide with a genuine reject reason typed to start with the same words | Low |

## 2. Architecture-Level Debt

| Item | Risk | Priority |
|---|---|---|
| No router — in-memory `tab` state only | Every feature added has to independently re-solve "what happens on refresh" rather than getting it for free from URL state; growing screen count makes the lack of deep-linking increasingly costly (e.g., can't link a manager directly to "Approvals → Timesheets") | **High** |
| No global data cache/store — every screen independently re-fetches on mount | Duplicate network requests when navigating between related screens (e.g., Dashboard and Apply Leave both fetch `get_leave_balance` independently); no single source of truth means two open tabs could show stale/inconsistent data with no invalidation mechanism | Medium |
| No custom backend layer — 100% reliance on RLS for authorization | Correct and secure today (verified in `19_SECURITY.md`), but every new business rule that needs anything beyond row-visibility (e.g., "balance can't go negative," "comp-off needs 8 attendance hours") has no natural home except either a Postgres trigger (higher friction to write/test) or staying UI-only (the current default, and the source of most gaps in `22_GAP_ANALYSIS.md`) | Medium |
| Nominatim reverse-geocoding called directly from the browser, not proxied | Couples check-in/out latency and reliability to a public third-party API's uptime; also the only external call in the app not funneled through an Edge Function (inconsistent with the Resend/Jira pattern) | Medium |
| No automated tests, no CI | Every refactor from this point forward is verified manually only; the 30 UI-only business rules cannot be regression-tested without either E2E coverage or a conscious decision to accept manual QA indefinitely | **High** |

## 3. Dependency Debt

| Item | Risk | Priority |
|---|---|---|
| `@supabase/supabase-js` declared `^2.39.3`, lockfile resolves to `2.101.0` | Large caret-range drift for a security-relevant SDK — behavior differences between the declared floor and what's actually installed are unverified | Medium |
| No Dependabot/Renovate, no CI audit step | Dependency updates happen only when someone manually runs `npm audit`/`npm outdated` (confirmed happened once, commit `ad7ba2a`) — no ongoing automated signal | Low |

## 4. Documentation Debt

| Item | Risk | Priority |
|---|---|---|
| No inline code comments explaining *why* for the non-obvious business logic (e.g., why `enforce_approver_id` overwrites client input, why `medical-certificates` bucket is private) | Onboarding a new engineer requires reading this documentation package or the migration file history rather than the code itself explaining its own rationale | Low (this documentation package is the current mitigation) |

## 5. Debt Summary

| Priority | Count |
|---|---|
| High | 4 |
| Medium | 6 |
| Low | 5 |
| **Total** | **15** |

The two **High**-priority items worth addressing before the codebase grows further: (1) resolving the `salary_details` unique-constraint ambiguity (cheap to verify, potentially expensive to leave unresolved if it's silently creating duplicate rows today), and (2) establishing even a minimal test suite before the next round of feature work, since every UI-only business rule catalogued in this documentation package is currently unprotected against silent regression.
