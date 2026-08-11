# 18. UI/UX Improvement Matrix

Every improvement identified across `05_PAGE_BY_PAGE_SPECIFICATION.md`, `14_UI_UX_AUDIT.md`, and `16_ACCESSIBILITY.md`, consolidated into one prioritized matrix. Severity follows the `22_GAP_ANALYSIS.md`/`24_IMPLEMENTATION_ROADMAP.md` P0-P3 scale (defined there); this table's own Severity column uses Critical/High/Medium/Low as specified.

| Screen | Current Problem | Severity | Proposed Improvement | Business Benefit | UX Benefit |
|---|---|---|---|---|---|
| Attendance | Geolocation denial hard-blocks check-in/out with no fallback | **Critical** | Add manual location/notes fallback when geolocation is denied/unavailable | Prevents lost attendance records on affected devices | Removes a hard failure mode from the most-used daily action |
| App-wide | No focus-visible indicator on any input/select/textarea | **High** | Restore a visible focus ring in `inputStyle()` (currently `outline:'none'` with no substitute) | Reduces support requests from keyboard users, narrows accessibility liability | Keyboard users can track their position through any form |
| App-wide | `textTert` (`#9e9d98`) fails WCAG AA contrast at the small sizes it's actually used | **High** | Darken the token (e.g., toward `#84837d`) and re-verify | Reduces accessibility risk exposure | Secondary metadata (timestamps, hints) becomes reliably readable |
| Team (list) | Employee row is a plain `<div onClick>` — not keyboard-operable | **High** | Convert to `<button>` or add `role="button"`+`tabIndex`+`onKeyDown` | Closes a confirmed WCAG 2.1.1 failure | Keyboard-only managers/admins can actually use the Team screen |
| Apply Leave | Half Day + multi-day range silently forces 0.5 days, no warning | **High** | Disable/clear End Date when Half Day is checked, or show explicit inline warning | Fewer balance disputes/support tickets | Removes a silent-surprise moment in the most balance-sensitive form |
| Apply Comp Off | "Date to Avail Comp-Off" is validated then dropped before the API call — cosmetic only | **High** | Either enforce it server-side or remove the field/copy | Stops the UI from promising an unenforced rule | Sets accurate expectations for the requester |
| Approvals | Single bulk-reject reason applies to every item regardless of context | **High** | Allow per-item reason override within a bulk-reject batch | More accurate rejection records for disputes | Approvers don't have to choose between batch speed and message accuracy |
| Admin Bulk Add | CSV dropzone not keyboard-operable; plaintext temp passwords shown raw with no mask/copy control | **High** | Add keyboard support to the dropzone; add per-row masked value + copy button | Reduces credential shoulder-surfing exposure, closes an accessibility gap | Safer, more usable bulk-onboarding flow |
| Admin Audit Log | No on-page indication that only 3 of many privileged actions are covered | **High** | Add a visible scope caveat directly on the page | Prevents false sense of completeness during a real investigation/dispute | Sets accurate trust expectations for admins |
| Admin Export | Attendance export silently truncates at 1,000 rows; no date-range filtering anywhere | **High** | Surface the cap in the card copy; add date-range filters to all 3 exports | Prevents silently incomplete compliance/payroll exports | Admin knows exactly what they're getting before downloading |
| Team Employee Detail / Admin Panel | "Last active admin" guard duplicated independently in 2 UI surfaces, DB has no backstop | **High** | Move the check into a DB trigger/constraint | Closes a real (if narrow) data-integrity gap even under direct API access | One authoritative rule instead of two that can drift |
| Dashboard | Zero actionable buttons on the most-visited screen | **High** | Add a primary "Apply Leave"/"Check In" quick-action row | Shortens the most common two-step journeys | Turns a read-only summary into a launch point |
| Timesheet | "Locked" state is silent — no proactive notice when the Friday deadline passes | **High** | Fire a toast the instant the deadline passes if the tab is open; disable controls with an explanatory tooltip rather than a silent no-op | Fewer "why can't I submit" support questions | Confusing dead-end becomes an explained state |
| App-wide | 3 separate status-badge implementations (`Badge`, `TsBadge`, Attendance's inline pill) | Medium | Consolidate into one `StatusBadge` component with a single status-vocabulary map | Future status-color changes touch 1 file instead of 3 | Visual consistency guaranteed, not just coincidental |
| App-wide | No hover/focus state on any button except the desktop sidebar nav item | Medium | Add a shared hover/active/focus-visible treatment inside `btnStyle()` | — | Clear press feedback on every interactive element |
| App-wide | `Confirm` modal has no Escape-key or click-outside dismiss | Medium | Add both, matching standard modal conventions | — | Reflexive dismissal works as users expect |
| App-wide | No skeleton loaders; abrupt spinner-then-content transitions | Medium | Add layout-matching skeletons on the highest-traffic screens (Dashboard, Approvals, My Leaves) first | Perceived-performance improvement without backend changes | Less jarring layout shift on load |
| App-wide | `Empty` component has no built-in CTA slot | Medium | Add an optional action-button slot to `Empty` | Empty states become next-step prompts instead of dead ends | Especially valuable on My Leaves / Notifications |
| App-wide | Toast state-collision: single state slot + uncancelled per-call timers can dismiss an unrelated toast early | Medium | Add a toast ID/generation guard so a stale timeout can't clear a newer toast; consider a small queue instead of hard-replace | Fewer silently-lost success/error confirmations during rapid actions (bulk approve, multi-error loads) | Users reliably see the message meant for their action |
| Notifications | No read/unread state, no dismiss | Medium | Track a lightweight last-viewed timestamp (client-side is sufficient) to visually distinguish new items | — | Feed becomes skimmable instead of requiring a full re-read every visit |
| Team Calendar | "+N more" chip overflow is static, not interactive | Medium | Make it open a day-detail popover with full names (preserving the RPC's privacy boundary) | — | Full visibility without redesigning the grid |
| Jira Settings | Real plaintext token round-tripped into the form on every load | Medium | Show a masked placeholder; only send a new value if the user explicitly edits it | Reduces live-secret exposure surface in the DOM | Less unnecessary exposure of a sensitive credential |
| Admin Employees | No direct "Reactivate" action on inactive rows | Medium | Add a symmetric Reactivate button, mirroring Deactivate | Faster, less error-prone reversal of a deactivation | Discoverable without a detour through the full edit form |
| Admin Add/Edit Employee | Employee Code becomes read-only post-creation with no explanation | Medium | Add a one-line inline note explaining why | — | Removes a small but recurring point of confusion |
| Profile | Password-change success message auto-reverts on a fixed 4s timer | Low | Replace with manual dismiss, matching the app's own `Toast` pattern | — | Removes unnecessary time pressure on a security confirmation |
| My Leaves | No filtering/sorting/pagination on history | Low (grows over time) | Add year/status filters as history accumulates | — | Keeps the screen usable multi-year without a rewrite |
| Admin Holidays | No bulk-import/recurring-holiday support — full manual re-entry every year | Low | Offer "copy last year's holidays" or CSV import (reusing the Bulk Add pattern) | Saves recurring annual admin time | Turns an annual chore into one click |
| Large desktop (≥1100px), all screens | `.content-max` stays 720px at every desktop width — large unused whitespace on wide monitors, most visible on data-dense admin screens | Low-Medium | Raise the cap specifically for Admin Employees/Audit Log/Export at ≥1100px; keep 720px elsewhere for readability | — | Uses available space where density actually helps (admin/data screens) without hurting readability elsewhere |
| Admin Employees / Audit Log | Card-list-at-every-width on the app's most data-dense, highest-row-count screens | Low-Medium | Introduce a genuine `<table>` at ≥1100px for these two screens specifically (the app's only 2 existing table usages, in Bulk Add, prove the pattern already works well here) | Faster admin scanning/comparison of many rows | Matches layout density to actual data density |

## Severity Distribution

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 10 |
| Medium | 9 |
| Low | 4 |

**Total: 24 consolidated improvements** (some page-level findings from `05_PAGE_BY_PAGE_SPECIFICATION.md` are cross-cutting and appear once here rather than once per affected page — see that document for the full per-page enumeration, which lists 21 page-specific problems individually).
