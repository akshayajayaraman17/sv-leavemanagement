# 13. Design System

## Part A — Current Design System (As-Implemented)

There is no named design system, no CSS framework (no Tailwind/Bootstrap/CSS-in-JS), and no component library. What exists is a small, consistent set of helpers centralized in `leave-app/src/components/UI.jsx` (174 lines) plus one shared `leave-app/src/index.css` (187 lines) for layout/breakpoints. Every value below was read directly from source.

### Color Tokens (`UI.jsx:2-21`, the complete palette — nothing else is used anywhere)

| Token | Value | Typical use |
|---|---|---|
| `bg` | `#ffffff` | Page/card background |
| `bgSec` | `#f5f4f0` | Page body background, secondary fill |
| `bgTert` | `#eeecea` | Tertiary fill (cancelled badge, draft timesheet badge) |
| `border` | `rgba(0,0,0,0.1)` | Default hairline border |
| `borderMed` | `rgba(0,0,0,0.18)` | Stronger border (inputs, dashed upload zones) |
| `text` | `#1a1a1a` | Primary text |
| `textSec` | `#6b6a65` | Secondary text (labels, metadata) |
| `textTert` | `#9e9d98` | Tertiary text (timestamps, hints) — **contrast concern, see `16_ACCESSIBILITY.md`** |
| `green` | `#1D9E75` | Success / primary action / Annual leave accent / PWA theme color |
| `greenBg` | `#E1F5EE` | Success tint |
| `blue` | `#378ADD` | Info / Sick leave accent / links |
| `blueBg` | `#E6F1FB` | Info tint |
| `amber` | `#BA7517` | Warning / Casual leave accent |
| `amberBg` | `#FAEEDA` | Warning tint |
| `purple` | `#7F77DD` | Comp-off accent |
| `purpleBg` | `#EEEDFE` | Comp-off tint |
| `red` | `#A32D2D` | Destructive / rejected status |
| `redBg` | `#FCEBEB` | Destructive/error tint |

**Inconsistency**: form-validation error borders/text use a separate hardcoded `#E24B4A` (`UI.jsx:35,91`, also `ApplyLeave.jsx:145,156`) that is close to but not identical to `C.red` (`#A32D2D`) and was never promoted into the token object. Two "error reds" exist in practice.

### Layout Primitives (`UI.jsx`)
- **`card`** (`UI.jsx:23-28`): `{ background: C.bg, border: '0.5px solid '+C.border, borderRadius: 12, padding: 16 }` — the single dominant container primitive, used for list rows, form sections, summary tiles, calendar day cells, and the `Confirm` modal body. No other structural component exists.
- **`inputStyle(err)`** (`UI.jsx:30-40`): `{ width:'100%', padding:'9px 12px', fontSize:14, border: err?'1px solid #E24B4A':'0.5px solid '+C.borderMed, borderRadius:8, outline:'none' }` — used by every input/select/textarea in the app.
- **`btnStyle(bg,color,border)`** (`UI.jsx:42-51`): `{ background, color, border: border||'none', borderRadius:8, padding:'10px 20px', fontSize:14, fontWeight:500, cursor:'pointer' }` — no named primary/secondary/tertiary variants; each call site passes its own color combo (typically `C.green`/`#fff` for primary, `C.bgSec`/`C.textSec` for secondary).

### Typography
DM Sans, loaded at `body` level (`index.css:4`) and redundantly re-set inline at the app root (`App.jsx:97`). **No defined type scale** — every component sets `fontSize` as a raw pixel literal inline; values cluster around 10/11/12/13/14/15/17px in practice but nothing enforces this — a rebrand or accessibility resize would require touching every file individually.

### Components (`UI.jsx`)
`Avatar` (54-65, circular initials, no photos anywhere in the app), `Badge` (67-83, status pill — see below), `Field` (86-97, label+inline-error+hint wrapper for every form field), `SecTitle` (100-106, uppercase 10px eyebrow text), `Spinner` (109-120, CSS-animated 24px ring), `Empty` (123-125, centered placeholder text), `Toast` (128-144, fixed top-center pill, see `14_UI_UX_AUDIT.md` for its state-collision bug), `Confirm` (147-163, the app's only modal — Yes/Cancel over a dim backdrop, no escape-key/click-outside dismiss).

### Status Badges — 3 Separate Implementations
`Badge` (`UI.jsx:67-83`, approved/pending/rejected/cancelled) is reused by `MyLeaves.jsx`, `Dashboard.jsx`, `Team.jsx`. But `Timesheet.jsx` defines its own `TsBadge`/`TS_STATUS` map (draft/submitted/approved/rejected/locked), and `Attendance.jsx`'s regularization status pill is a third, fully bespoke inline implementation. All three reuse the same `C` tokens for green/red so they read as consistent today, but a change to "approved" styling requires touching three files.

### PWA Identity
`vite.config.js:5-25` — manifest name "Leave Manager", `theme_color: '#1D9E75'` (= `C.green`), `background_color: '#ffffff'`, `display: 'standalone'`.

---

## Part B — Recommended Semantic Design System

The current palette is functionally sound (a real accessibility audit in `16_ACCESSIBILITY.md` found only one true contrast failure) — the recommendation is to **formalize what already exists in practice**, not replace it. Proposed semantic layer, mapping 1:1 onto current literal tokens so no visual change is required to adopt it:

### Semantic Color Tokens
| Semantic name | Maps to current token | Notes |
|---|---|---|
| `color.primary` | `C.green` (`#1D9E75`) | Matches PWA theme color already — good anchor |
| `color.primary.tint` | `C.greenBg` | |
| `color.success` | `C.green` / `C.greenBg` | Same as primary today — acceptable, primary action = positive action in this domain |
| `color.info` | `C.blue` / `C.blueBg` | |
| `color.warning` | `C.amber` / `C.amberBg` | |
| `color.danger` | `C.red` / `C.redBg` | **Retire `#E24B4A`** — replace all 3 call sites with `C.red` or a new `color.danger.border` alias set to the *same* hex as `C.red`, closing the two-reds inconsistency in one token-file change |
| `color.accent.compoff` | `C.purple` / `C.purpleBg` | |
| `color.bg.page` | `C.bgSec` | |
| `color.bg.surface` | `C.bg` | |
| `color.bg.surfaceAlt` | `C.bgTert` | |
| `color.border.default` | `C.border` | |
| `color.border.strong` | `C.borderMed` | |
| `color.text.primary` | `C.text` | |
| `color.text.secondary` | `C.textSec` | |
| `color.text.tertiary` | `C.textTert` | **Flag for a slightly darker replacement** — current value fails contrast at small sizes, see `16_ACCESSIBILITY.md` |
| `color.disabled` | new — recommend `#c8c7c2` on `bgSec` | No disabled-state color exists today (opacity-based instead, see Buttons below) |

### Recommended Type Scale (rem-based, replacing ad hoc pixel literals)
| Token | Size | Current usage it would replace |
|---|---|---|
| `text.display` | 24px / 1.5rem | (none exists today — recommended for a future dashboard headline) |
| `text.h1` | 20px | Screen headers currently hardcoded per-file (Login, AdminPanel) |
| `text.h2` | 17px | Section headers |
| `text.body` | 14px | Default body/input text (matches `inputStyle` today) |
| `text.bodySmall` | 13px | Secondary row text |
| `text.caption` | 11px | Hints, timestamps |
| `text.label` | 10px, uppercase, `letterSpacing:0.09em` | `SecTitle` today |

### Spacing Scale (recommended 4px base, replacing scattered literals like `16`, `14`, `9 12`, `10 20`)
`space.1`=4px · `space.2`=8px · `space.3`=12px · `space.4`=16px (= current `card` padding) · `space.5`=20px · `space.6`=24px (= desktop `.app-content` padding) · `space.8`=32px.

### Border Radius
`radius.sm`=8px (current `inputStyle`/`btnStyle`) · `radius.md`=12px (current `card`) · `radius.pill`=20px (current `Badge`).

### Shadows
None exist in the current app (flat design throughout, hairline borders only). Recommend introducing exactly one subtle elevation level (`shadow.sm: 0 1px 3px rgba(0,0,0,0.08)`) reserved for the `Confirm` modal and `Toast` only, to visually separate them from page content without adopting a full elevation system the rest of the app doesn't need.

### Button Variants (formalizing `btnStyle` call-site conventions into named variants)
| Variant | bg / color / border | Current equivalent |
|---|---|---|
| Primary | `C.green` / `#fff` / none | Most Save/Submit/Approve buttons |
| Secondary | `C.bgSec` / `C.textSec` / none | Cancel buttons |
| Destructive | `C.red` / `#fff` / none | Reject/Deactivate/Remove, `Confirm`'s "Yes" button |
| Ghost | transparent / `C.textSec` / `C.border` | Not currently used consistently — recommended for tertiary actions |
| Disabled | current: `opacity: submitting ? 0.7 : 1` repeated ad hoc at dozens of call sites | Recommend folding into `btnStyle(bg, color, border, disabled)` itself so disabled styling is defined once |

None of the variants currently have hover/focus/active states except the desktop sidebar nav item (`index.css:116-119`) — see `16_ACCESSIBILITY.md` for the focus-visibility gap this creates on every form input.

### Status Component Consolidation (highest-value design-system fix)
Recommend collapsing `Badge`, `TsBadge`, and `Attendance.jsx`'s inline regularization pill into one shared `<StatusBadge status={value} domain="leave"|"timesheet"|"attendance">` component with a single status-vocabulary map, so a future color change to "approved" only touches one file instead of three.
