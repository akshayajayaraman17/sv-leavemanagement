# 14. UI/UX Audit

Audit of the application **as implemented**, verified against source. Design-token detail lives in `13_DESIGN_SYSTEM.md`; per-page UX problems/improvements live in `05_PAGE_BY_PAGE_SPECIFICATION.md` §36-38 per page. This file covers cross-cutting patterns only.

## Layout
Two layout modes, one breakpoint switch, no separate tablet layout:
- **Mobile (<768px, default)**: single scrollable column capped at `max-width:480px`, centered (`.app-main`, `index.css:33-41`); sticky top bar with the current tab's title (`.app-topbar`); fixed bottom nav (`.app-bottomnav`, `index.css:58-70`).
- **Desktop (≥768px)**: persistent left sidebar (`.app-sidebar`, 220px, 240px at ≥1100px) replaces the bottom nav entirely (`display:none` at desktop, `index.css:153-155`); sign-out moves from the top bar into the sidebar footer.
No CSS grid/flex framework — every component builds its own inline `style={{display:'flex'|'grid',...}}` object using `card`/`btnStyle`/`inputStyle` where applicable.

## Navigation
See `04_INFORMATION_ARCHITECTURE.md` §3 for the full architectural consequences (no router → refresh always returns to Dashboard, no deep-linking, no back/forward, no breadcrumbs). The only "back" affordances are hand-rolled per-screen `‹ Back` buttons popping local view-state, which do not survive a page refresh.

## Spacing
No formal spacing scale — literals like `16`, `14`, `'9 12'`, `'10 20'` are repeated ad hoc across components (mirrors the typography finding in `13_DESIGN_SYSTEM.md`). In practice, values cluster tightly enough that the app reads as visually consistent, but nothing enforces it.

## Cards
`card` (`UI.jsx:23-28`) is the single dominant layout primitive — spread into every list row (leave/comp-off/timesheet/regularization history, employee directory rows, audit-log entries, holiday rows), every form section, every summary tile, calendar day cells, and the `Confirm` modal body. Background/border are frequently overridden per call site to signal state (red border for over-attendance timesheet days, amber background for warnings, green tint for success/verified states) — the base shape (12px radius, hairline border, 16px padding) stays constant, which is what gives the app its visual rhythm despite having no other structural component.

## Buttons
`btnStyle()` produces a flat 8px-radius button with **no default hover/active/focus styling** — visual feedback relies entirely on native browser button behavior. The only custom `:hover` anywhere in the app is the desktop sidebar nav item (`index.css:116-119`) — no primary submit, secondary cancel, destructive reject, or icon-only close button has a defined hover/focus-visible state. Disabled states are handled ad hoc via `opacity: submitting?0.7:1` repeated at dozens of call sites rather than a shared branch inside `btnStyle` itself.

## Inputs / Forms
Every field uses the shared `Field` wrapper (`UI.jsx:86-97`) — label, inline error next to the label (not below the input), optional hint, then the field. All inputs use `inputStyle(err)`. Validation is synchronous, client-only, per-component — each screen defines its own local `validate()` (cross-referenced fully in `08_BUSINESS_RULES.md`); no shared validation-schema library, no server-side error surfacing beyond raw Postgres/PostgREST messages passed through to a toast on write failure. `inputStyle()` sets `outline:'none'` unconditionally with no substitute focus indicator — see `16_ACCESSIBILITY.md`.

## Tables
`<table>` is used in exactly **two places** in the entire app, both inside `BulkAddEmployees.jsx` (CSV row-preview table, and the post-creation credentials-results table). Everywhere else — including data-dense screens like Admin Employees, Audit Log, Export — tabular data is a vertical stack of `card`-styled rows. This is a deliberate mobile-first pattern choice (tables reflow poorly on narrow screens), at the cost of desktop density in the 19 screens that don't use one.

## Status Badges
Three separate implementations exist (`Badge`, `Timesheet.jsx`'s `TsBadge`, `Attendance.jsx`'s bespoke inline pill) — see `13_DESIGN_SYSTEM.md` for the consolidation recommendation.

## Modals
Exactly one true modal component: `Confirm` (`UI.jsx:147-163`) — fixed full-viewport `rgba(0,0,0,0.4)` backdrop centering a `card` with Yes/Cancel. Used for destructive/high-consequence confirmations (deactivate employee, remove holiday, grant admin, cancel leave). No size variants, no reusable header/footer slots, no scroll-locking behind it, **no keyboard escape-to-close, no click-outside-to-dismiss** (the backdrop `div` has no `onClick`). Everything else that looks modal-like (medical-certificate upload panel, attendance regularization form, timesheet late-submission form) is actually an inline `card` pushed into normal page flow, not an overlay.

## Toasts
`Toast` (`UI.jsx:128-144`) — fixed top-center pill, green/red by type, manual `×` dismiss. Driven by a **single** state slot in `App.jsx` (`const [toast,setToast]=useState(null)`, `App.jsx:76`). **Confirmed bug, not hypothetical**: because there is only one state slot, a second `showToast()` call while a toast is visible immediately replaces the displayed message (first toast silently swapped, not queued) — and because each call schedules its own independent 3500ms `setTimeout` that is never cancelled, toast A's timer can fire *after* toast B has replaced it on screen, dismissing B early (roughly 1s early in the worst observed timing). A rapid third/fourth toast in quick succession (e.g., bulk-approve, or a page load reporting two separate errors) can be dismissed prematurely by a stale timer that has nothing to do with it. No toast ID/generation check guards the timeout callback.

## Icons
No icon library — every icon is an emoji or Unicode glyph rendered as plain text (nav icons in `App.jsx:25-67`, `×`/`‹`/`›` throughout). See `16_ACCESSIBILITY.md` for the accessible-name implications of bare-glyph buttons.

## Interaction States (Loading / Empty / Error / Disabled)
- **Loading**: a single shared `Spinner` (`UI.jsx:109-120`) — no skeleton loaders anywhere; every screen either shows the full-page spinner or nothing while fetching, never a layout-matching skeleton.
- **Empty**: a single shared `Empty` component (`UI.jsx:123-125`) — centered placeholder text only, **no primary-action CTA** built into the component itself (e.g., "No leave requests yet" never pairs with an "Apply for Leave" button at the component level; any such CTA would have to be added ad hoc per call site, and none currently are).
- **Error**: no shared error-state component — network/query failures surface only via a toast (which auto-dismisses in 3.5s) or, if the error occurs during render, are caught by the top-level `ErrorBoundary` (full-screen "Something went wrong" + Try Again). There is no per-section inline error+retry pattern (e.g., a failed Dashboard widget just silently shows nothing rather than "Unable to load — Retry").
- **Disabled**: ad hoc `opacity` reduction per call site, no shared disabled visual language, see Buttons above.

## Responsive Behaviour — full breakpoint audit in `15_RESPONSIVE_DESIGN.md`.
## Accessibility — full audit in `16_ACCESSIBILITY.md`.

## Cross-Cutting UX Problems Summary (highest-value fixes, expanded per-page in `05_PAGE_BY_PAGE_SPECIFICATION.md` and prioritized in `18_UI_UX_IMPROVEMENT_MATRIX.md`)

| # | Problem | Impact | Scope |
|---|---|---|---|
| 1 | No router — refresh always returns to Dashboard, no deep-linking, no back/forward | Lost in-progress work on any multi-step form after an accidental refresh | App-wide |
| 2 | Toast state-collision (single slot + uncancelled timers) | A toast can be dismissed ~1s early by an unrelated stale timer during rapid sequential actions (bulk approve, multi-error page loads) | App-wide |
| 3 | Three separate status-badge implementations | A future "approved" color/label change requires touching 3 files, risk of drift | Leave/Timesheet/Attendance |
| 4 | No focus-visible indicator on any input/select/textarea | Keyboard users lose track of focus position on every form | App-wide, 21 screens |
| 5 | No hover/focus state on any button except desktop sidebar nav | No visual press feedback beyond native browser default | App-wide |
| 6 | `Confirm` modal has no escape-key or click-outside dismiss | Users must always click a button, can't dismiss reflexively | Every destructive-action confirmation |
| 7 | No skeleton loaders — abrupt full-spinner-then-content transitions | Perceived slowness, layout shift on load | App-wide |
| 8 | `Empty` component has no built-in CTA slot | Empty states are dead ends rather than next-step prompts | App-wide |
