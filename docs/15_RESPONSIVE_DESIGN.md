# 15. Responsive Design

## 1. Current Breakpoints (exact, `leave-app/src/index.css`)

Exactly two `@media (min-width: ...)` rules exist — no tablet-specific breakpoint, no distinct large-desktop layout beyond a sidebar-width bump.

| Breakpoint | Range | What changes |
|---|---|---|
| **Base (mobile-first, no media query)** | < 768px | `.app-shell` column flex; `.app-sidebar{display:none}`; `.app-bottomnav` fixed+visible; `.app-main{max-width:480px, centered}`; `.app-content{padding:16px 14px 88px}` (bottom padding clears the fixed nav) |
| **`@media (min-width:768px)`** (`index.css:73-178`) | ≥768px | `.app-shell{flex-direction:row}`; `.app-sidebar` becomes visible (220px, sticky, full-height, own scroll); `.app-bottomnav{display:none}`; `.app-main` unconstrains max-width; `.app-content{padding:24px 28px 32px}`; `.content-max{max-width:720px}`; grid classes switch column counts (`.balance-grid→repeat(4,1fr)!important`, `.form-grid-2→1fr 1fr!important`, `.form-grid-3→1fr 1fr 1fr!important`); `.mobile-signout{display:none}` (moves to sidebar footer) |
| **`@media (min-width:1100px)`** (`index.css:181-186`) | ≥1100px | `.app-sidebar` widens to 240px. **Nothing else changes** — `.content-max` stays capped at 720px, so very wide monitors show large unused whitespace on both sides of content |

Mobile-default grid values (e.g., `Dashboard.jsx`'s 2-column `balance-grid`) are set inline per-component with `style={{gridTemplateColumns:'1fr 1fr'}}` — `index.css` only ever *overrides* them at desktop width with `!important`, it never defines the mobile default itself.

## 2. What Genuinely Differs Between Mobile and Desktop

Only **layout container + column count** — typography, spacing, and component sizing are otherwise **identical at every viewport width**. This is a real, confirmed finding: there is no responsive typography (no `clamp()`, no breakpoint-based font-size changes anywhere), no responsive spacing scale, and no component that renders meaningfully different content (not just different column count) between mobile and desktop.

## 3. Absence of a True Tablet Layout

Nothing exists between the mobile layout and the 768px desktop switch. A device in the ~600-900px range either gets the capped 480px mobile column (if <768px) or the full sidebar+flexible-width desktop layout (if ≥768px) — there is no intermediate 2-column-but-still-compact treatment. For a company where employees might use company-issued tablets for attendance check-in, this is a real gap: a tablet in portrait orientation under 768px gets the narrow mobile column even though it has meaningfully more width to work with than a phone.

## 4. Per-Screen Responsive Priority (recommended, not yet implemented)

Per Part 16 of the source brief, screens ranked by how much they'd benefit from deliberate (not just automatic) responsive treatment:

| Priority | Screens | Why |
|---|---|---|
| **Mobile-critical** | Apply Leave, Approvals, Attendance (check-in/out), Notifications, Team Calendar | Time-sensitive, frequently used away from a desk |
| **Desktop-critical** | Admin Employees, Admin Bulk Add, Admin Export, Audit Log | Data-dense, benefit most from table layouts and multi-column forms that the current design deliberately avoids in favor of card stacks (see `14_UI_UX_AUDIT.md` Tables) |
| **Either** | Dashboard, Profile, Jira Settings, My Leaves, Timesheet | Already reasonably balanced by the existing 2-mode layout |

## 5. Large-Desktop Whitespace Problem

Confirmed via `index.css:170-172` — `.content-max{max-width:720px}` applies at every desktop width including ≥1100px. On a 1920px+ monitor, this leaves roughly 1200px of unused horizontal space outside the 240px sidebar + 720px content column. No component currently uses the extra room for anything (no secondary panel, no wider tables, no side-by-side content) — this is the single most visible "not actually optimized for desktop" symptom in the app, most noticeable on the Admin Employees, Audit Log, and Export screens, which are exactly the screens that would benefit most from using it (see Recommended Improvement below).

## 6. Recommended Responsive Improvements

1. **Introduce a real tablet treatment** (e.g., 2-column card grids instead of single-column, sidebar collapsed to icon-only) somewhere in the 600-900px range rather than jumping straight from capped-480px mobile to full desktop sidebar.
2. **Raise `.content-max` on data-dense admin screens only** (Admin Employees, Audit Log, Export) at ≥1100px, rather than applying the same 720px cap uniformly — this is the one place data density genuinely matters more than a comfortable reading line-length.
3. **Add responsive typography** for the few screens with genuinely long-form content (none currently exist, but Dashboard's summary cards would benefit from a slightly larger headline at desktop width than the current fixed pixel size).
4. Continue using the card-stack pattern for the 19 non-Bulk-Add screens on mobile (it works well and shouldn't change) but consider a `<table>` for Admin Employees and Audit Log specifically at ≥1100px, where the existing card-row density is now visibly wasteful of the available width (cross-reference `18_UI_UX_IMPROVEMENT_MATRIX.md`).
