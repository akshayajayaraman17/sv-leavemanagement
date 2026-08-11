# 16. Accessibility

Honest assessment based only on what is actually present or absent in the code — no assumptions, all verified against source.

## 1. ARIA Labels
**Zero `aria-*` attributes exist anywhere in the codebase** (verified by searching every component file). This matters most for icon/symbol-only interactive elements whose accessible name would otherwise just be the raw glyph:
- Toast dismiss button renders `×` as its entire content, no label (`UI.jsx:141`).
- Medical-certificate "remove selected file" button is likewise a bare `×` (`ApplyLeave.jsx:156`).
- Sidebar/bottom-nav items pair an emoji icon with a visible text label (`App.jsx:120-121,185-186`) — **fine**, the text label supplies the accessible name; the several bare `×`/`‹`/`›` buttons elsewhere do not have that safety net.

## 2. Images / Alt Text
**No `<img>` elements exist anywhere in the app.** Every "avatar" is a styled `<div>` with text initials (`Avatar`, `UI.jsx:54-65`) — no photos, illustrations, or icon images. This is a neutral finding, not a violation: there is nothing to add `alt` text to.

## 3. Keyboard Navigation
Native elements (`<button>`, `<input>`, `<select>`, `<textarea>`) are all natively focusable/activatable, covering the majority of the app. Keyboard navigation **breaks** in specific, identifiable places — plain `<div onClick=...>` elements with no `tabIndex`, no `role="button"`, no `onKeyDown`:
- Team directory employee row (`Team.jsx:490-493`) — the entire clickable card opening an employee's detail view.
- Medical-certificate upload dropzone (`ApplyLeave.jsx:144-150`).
- Bulk-Add CSV upload dropzone (`BulkAddEmployees.jsx:202-214`).

All three are genuinely unreachable and unactivatable by keyboard alone.

## 4. Focus Indicators
**No visible focus indicator on any text input, select, or textarea in the entire app.** `inputStyle()` sets `outline:'none'` unconditionally (`UI.jsx:39`) with no substitute (`box-shadow` ring, border-color change on `:focus`) — this affects every form field across all 21 screens. Buttons are unaffected (`btnStyle` doesn't set `outline`) and retain the browser's native focus ring. For a keyboard user tabbing through any form (Admin Add Employee, Apply Leave, Profile), there is no visual signal of which field currently has focus.

## 5. Color Contrast (computed WCAG relative-luminance ratios from actual token values, `UI.jsx:2-21`)

| Token pair | Ratio | WCAG AA (normal text, 4.5:1) |
|---|---|---|
| `textSec` (`#6b6a65`) on `bg`/`bgSec` | ≈5.4:1 | **Passes** |
| `textTert` (`#9e9d98`) on `bg`/`bgSec` | ≈3.0:1 | **Fails** — and doesn't qualify for the 3:1 large-text exemption either, since `textTert` is used almost exclusively at small sizes (10-11px: timestamps, "of X remaining" captions, hint text, the tertiary metadata line under every list row) |

This is the single most concrete, reproducible accessibility issue in the visual design — a meaningful amount of secondary information across the whole app (applied-on dates, hint copy, "X used" labels) renders below the accepted minimum readability contrast. Fix is mechanical: darken `textTert` by roughly 1-2 luminance steps (e.g., toward `#84837d`) and re-verify against both `bg` and `bgSec`.

## 6. Status Communicated by Color Alone
Status badges (`Badge`, `TsBadge`, and the Attendance regularization pill) rely on background-color + text-color pairing, but **all three implementations also render a text label** ("Approved"/"Pending"/"Rejected"/"Cancelled" etc.) alongside the color — so status is never communicated by color alone. This is a genuine positive finding, not a gap.

## 7. Skip Links, Landmarks, Live Regions
- No skip-links anywhere.
- No ARIA landmark roles — `<nav>`/`<main>`-equivalent structures are plain styled `<div>`s used for CSS targeting, not paired with landmark semantics beyond whatever implicit role a bare `<div>` carries (none).
- **No live-region announcements** for async state changes — a `Toast` appearing after a form submission is not associated with `aria-live`, so a screen-reader user who isn't focused on the toast's fixed-position DOM node at the moment it appears may never learn whether their save succeeded or failed.

## 8. Touch Targets
Not independently measured pixel-by-pixel in this pass, but `btnStyle`'s `padding:'10px 20px'` combined with 14px text produces roughly 40-44px tall buttons — in the acceptable range for the 44×44px touch-target guideline. The bare-glyph `×`/`‹`/`›` buttons (Toast dismiss, cert-remove) are smaller and not independently verified — flagged for a follow-up manual check alongside their missing `aria-label`s (§1).

## 9. Error Announcements
Form validation errors render as inline text next to the field label via `Field`'s `error` prop (`UI.jsx:86-97`) — visually adjacent to the field, but with no `aria-describedby` linking the error text to its input and no `role="alert"`/`aria-live` on the error text itself. A screen-reader user tabbing to an invalid field will not automatically hear why it's invalid unless they separately discover the adjacent error text.

## 10. Summary Table

| # | Issue | Severity | Scope |
|---|---|---|---|
| 1 | No focus-visible indicator on any input/select/textarea | **High** | 21 screens, every form |
| 2 | `textTert` fails WCAG AA contrast at the sizes it's actually used | **High** | App-wide (timestamps, hints, secondary metadata) |
| 3 | 3 non-keyboard-operable `<div onClick>` interactive elements | **Medium** | Team row, 2 upload dropzones |
| 4 | No `aria-label` on bare-glyph buttons (`×`/`‹`/`›`) | **Medium** | Toast, cert-remove, back/forward affordances |
| 5 | No live-region for Toast / async state changes | **Medium** | App-wide |
| 6 | Form errors not linked via `aria-describedby`/`role="alert"` | **Medium** | 21 screens |
| 7 | No skip-links, no landmark roles | **Low** | App-wide (mitigated by the app's overall shallow structure — few screens have enough content for skip-links to matter much) |
| 8 | Status never conveyed by color alone | **Positive finding** | — |
| 9 | No `<img>` alt-text gaps (no images used) | **Neutral finding** | — |

**9 categories audited, 6 real issues found (2 High, 4 Medium), 1 Low, 2 positive/neutral findings.** Fixes for items 1, 2, and 6 are mechanical (token/CSS-level) and should be prioritized first — see `18_UI_UX_IMPROVEMENT_MATRIX.md` and `24_IMPLEMENTATION_ROADMAP.md` for sequencing.
