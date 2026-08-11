# 09. System Architecture

## 1. Architecture Style

A **serverless SPA-on-BaaS** architecture: a single-page React app talks directly to Supabase (Postgres + Auth + Storage + Edge Functions) with no custom backend server or API gateway in between. Authorization is enforced at the database layer (Row Level Security), not in an application middle tier.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (PWA-installable SPA)                                       │
│  leave-app/  — React 18 + Vite 6, no router, no state library        │
│                                                                        │
│  App.jsx (shell/nav) → 13 lazy-loaded tab components                 │
│  lib/AuthContext.jsx (session)  lib/api.js (data access, 668 lines)  │
└───────────────┬───────────────────────────┬──────────────────────────┘
                │ supabase-js (anon key)     │ supabase-js (anon key)
                │ PostgREST + RPC calls      │ functions.invoke()
                ▼                            ▼
┌───────────────────────────────┐  ┌─────────────────────────────────┐
│  Supabase Postgres              │  │  Supabase Edge Functions (Deno) │
│  — 15 tables, RLS on all        │  │  create-employee (service role) │
│  — 3 callable RPCs              │  │  post-jira-worklog (user JWT)   │
│  — 7 trigger functions          │  │  send-notification (user JWT)   │
│  — GoTrue (auth.users)          │  │                                  │
│  — Storage (medical-certificates│  └───────────┬─────────────────────┘
│     private bucket)             │              │
└───────────────────────────────┘              ▼
                                    ┌─────────────────────────┐
                                    │ Third-party APIs          │
                                    │ Resend (email)             │
                                    │ Jira Cloud REST API (per-  │
                                    │   user Basic Auth)          │
                                    │ OpenStreetMap Nominatim     │
                                    │   (reverse geocoding,        │
                                    │   called directly from        │
                                    │   the browser, not via edge)  │
                                    └─────────────────────────┘
```

## 2. Frontend Architecture

- **Framework**: React 18.2, function components + hooks only (no class components except `ErrorBoundary.jsx`, which must be a class per React's error-boundary API).
- **Build**: Vite 6, `@vitejs/plugin-react`, `vite-plugin-pwa` for offline shell caching + installability.
- **Code splitting**: 13 of 19 component files are `React.lazy()`-loaded (`App.jsx:11-23`), each behind the single `<Suspense fallback={<Spinner/>}>` wrapper — only the shell plus whichever tab is active loads initially.
- **Error handling**: one `ErrorBoundary` class component wraps the active tab, keyed by `tab` id (`key={tab}`) so switching tabs resets any prior error state; shows a "Try again" retry button.
- **State management**: no Redux/Zustand/Context beyond `AuthContext` (session + employee row) — every screen manages its own local `useState`/`useEffect` data fetching independently; no global cache, no React Query/SWR.
- **Styling**: no CSS framework — one shared `index.css` (187 lines, responsive breakpoints + a handful of desktop-only classes) plus per-component inline `style={{}}` objects using shared helpers from `components/UI.jsx` (`C` color tokens, `card`, `inputStyle`, `btnStyle`).
- **Forms**: no schema validation library (no Yup/Zod/react-hook-form) — every screen defines its own local `validate()` function.
- **Routing**: none — `useState('dash')` in-memory tab switch (see `04_INFORMATION_ARCHITECTURE.md` §3 for full consequences).

## 3. Backend Architecture

**No custom backend server exists.** All backend logic lives in one of three places:

1. **Postgres RLS policies** — the primary authorization boundary, evaluated on every PostgREST request (`schema.sql`, 40+ policies). See `19_SECURITY.md` §5 for the full analysis of this design choice.
2. **Postgres functions/triggers** — for logic RLS can't express (column-level restrictions, server-computed values, cross-row aggregation, audit logging). 3 callable RPCs + 7 trigger functions (full catalogue in `11_DATABASE_SPECIFICATION.md`).
3. **Supabase Edge Functions (Deno)** — for the 3 operations that need either elevated (service-role) privilege or a server-side call to a third-party API with a secret the browser must never see:
   - `create-employee` — service-role client, creates `auth.users` + `employees` atomically; independently re-verifies the caller is an admin (defense in depth beyond RLS, since it uses service-role and thus bypasses RLS entirely).
   - `post-jira-worklog` — uses the **caller's own JWT** (not service role), reads their `jira_accounts` row via RLS, posts to Jira's REST API.
   - `send-notification` — uses the **caller's own JWT**, re-reads the target row via RLS (so it can't be tricked into emailing about a row the caller couldn't see), sends via Resend.

## 4. Environments & Configuration

- **Env vars** (client, `VITE_`-prefixed, safe to expose): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ENABLE_DEMO_MODE`. Declared in `.env.example` (tracked, placeholders only); real values live in `.env.local` (gitignored, confirmed never committed).
- **Env vars (Edge Functions, server-side only)**: `SUPABASE_SERVICE_ROLE_KEY` (`create-employee`), `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `APP_URL` (`send-notification`) — never shipped to the browser bundle.
- **Hosting**: Vercel (`vercel.json` — SPA rewrite rule only, no security headers configured).
- **PWA**: `vite-plugin-pwa`, `registerType: 'autoUpdate'`, manifest name "Leave Manager", theme color `#1D9E75` (matches the `C.green` design token).

## 5. Third-Party Integrations

| Integration | Purpose | Auth | Called from |
|---|---|---|---|
| Supabase (Postgres/Auth/Storage/Edge Functions) | Entire backend | Anon key (client) / Service role (edge fn only) / User JWT | Everywhere |
| Resend | Decision-notification emails | `RESEND_API_KEY` | `send-notification` edge function only |
| Jira Cloud REST API | Worklog sync | Per-user Basic Auth (email:token) | `post-jira-worklog` edge function only |
| OpenStreetMap Nominatim | Reverse-geocode attendance GPS coords | None (public, keyless) | Directly from the browser (`Attendance.jsx:28-45`) — the one integration **not** proxied through an Edge Function, adding external latency directly to the check-in/out critical path |

## 6. Deployment Topology

Single environment implied by the repo (no staging/prod config split visible — one Supabase project, one `.env.local`). No CI/CD pipeline config found in-repo (no `.github/workflows/`). No automated test suite found (`leave-app/package.json` has no `test` script) — see `20_QA_TEST_SPECIFICATION.md` and `18_UI_UX_IMPROVEMENT_MATRIX.md`/`23_TECHNICAL_DEBT.md` for the implications.

## 7. Notable Architectural Decisions & Their Consequences

| Decision | Consequence |
|---|---|
| No router | Refresh always returns to Dashboard; no deep-linking; no back/forward (see `04_INFORMATION_ARCHITECTURE.md`) |
| RLS as sole security boundary | Small, auditable attack surface (40+ policies in one file) but the JS layer adds zero authorization of its own — any gap in a policy is a real gap, not caught by a second layer (see `19_SECURITY.md` §5 for the 3 confirmed gaps) |
| No custom backend server | Minimal ops surface, but also no place to add cross-cutting concerns (rate limiting, request logging, server-side validation of business rules) without adding Edge Functions one at a time |
| Direct third-party call from browser (Nominatim) | Simpler than proxying, but couples check-in/out latency to a public API's availability and exposes the user's coarse location query to a third party directly |
| No automated tests, no CI | Regressions rely entirely on manual testing; see `20_QA_TEST_SPECIFICATION.md` |
