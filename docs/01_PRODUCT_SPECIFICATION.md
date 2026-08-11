# 01. Product Specification

## 1. Product Overview

**Product name**: Leave Manager (PWA manifest name; internally "Leave Management App", `leave-app/package.json` name `leave-management-app`).

**Product purpose**: A single-tenant, mobile-first web application for one company to run leave, attendance, timesheet, and basic HR-admin operations in one place — replacing spreadsheet- or email-based leave requests, manual attendance registers, and ad hoc timesheet tracking.

**Business problem it solves**: Before a tool like this, a small/mid-size company typically tracks leave balances in spreadsheets (error-prone, no audit trail, no self-service), attendance on paper or trust, and timesheets in disconnected tools or not at all. This app centralizes all three around one `employees` table with role-based approval routing.

**Target users**: Employees, managers, and admins of a single company (the app has no multi-tenant/organization concept — one Supabase project = one company). Confirmed by schema: no `organization_id`/`tenant_id` column exists anywhere.

**Business objectives**:
- Give every employee self-service leave/comp-off application with real-time balance visibility.
- Give managers a single approval queue across four request types (leave, comp-off, timesheet, attendance regularization) instead of ad hoc email/Slack approvals.
- Give admins a system of record for salary, approver routing, holidays, and a partial audit trail, plus bulk employee onboarding.
- Track daily attendance (GPS-stamped check-in/out) and weekly timesheets with optional Jira worklog sync.

**Product scope**:
- In scope: leave & comp-off lifecycle, attendance capture, weekly timesheets, team calendar, employee directory/admin, salary records, holiday calendar, a narrow audit log, CSV export, one external integration (Jira Cloud worklogs via personal API token), email notifications on request decisions (via Resend).
- Out of scope (confirmed absent from the codebase — not partial, simply not built): payroll processing/statutory payslips (the "payslip" feature is explicitly a non-statutory print view, `leave-app/src/lib/payslip.js:7-8`), multi-company/tenant support, SSO/MFA, mobile native apps (PWA-installable web app only), in-app push notifications (email only, best-effort), org charts beyond a single `manager_id` field, a general-purpose HRIS (no onboarding checklists, no performance reviews, no recruiting).

**Key capabilities**:
1. Role-based self-service leave and comp-off request + cancellation.
2. Two-tier approver routing (per-employee `approver_config`, falling back to `manager_id`) enforced server-side.
3. GPS-stamped attendance check-in/out with multi-session-per-day support and regularization requests for missed checkouts.
4. Weekly timesheet entry with attendance-hour cross-validation and optional Jira worklog push.
5. Unified manager/admin approval queue (leave, comp-off, timesheet, regularization) with bulk actions.
6. Admin employee lifecycle: single add, CSV bulk-add (with generated temp passwords), edit, deactivate, salary, approver config, per-type leave adjustments.
7. Company holiday calendar feeding leave/comp-off date logic and the team calendar.
8. Narrow, trigger-based audit log (salary changes, leave adjustments, role changes only).
9. CSV export (employee roster, leave requests, attendance).
10. Personal Jira Cloud connection for worklog sync.
11. Installable PWA (offline shell caching via `vite-plugin-pwa`, `autoUpdate` mode).

**Major workflows**: see `06_BUSINESS_WORKFLOWS.md` for the full 16-workflow catalogue (leave/comp-off apply+approve, timesheet submit+approve, attendance check-in/out+regularize, employee onboarding single/bulk, salary/leave adjustment, holiday CRUD, role grant/revoke, password reset/forced change, Jira connect).

**System boundaries**: The frontend (`leave-app/`, a Vite+React SPA) talks directly to Supabase — Postgres via PostgREST (`supabase-js`), Auth (GoTrue), Storage (medical certificates, private bucket), and three Deno Edge Functions for the three operations that need elevated/service-role privilege or a third-party API call (`create-employee`, `post-jira-worklog`, `send-notification`). There is no separate custom backend server — Postgres Row Level Security (RLS) is the primary authorization boundary (see `19_SECURITY.md` §5). One external third-party dependency beyond Supabase/Resend: the public, keyless OpenStreetMap Nominatim API for reverse-geocoding attendance GPS coordinates.

---

## 2. Technology Stack (verified from `leave-app/package.json`, `vite.config.js`)

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Frontend framework | React | ^18.2.0 | No Redux/Zustand/Context beyond `AuthContext` |
| Build tool | Vite | ^6.0.0 | `vite build` / `vite dev` / `vite preview` |
| Backend/DB | Supabase (Postgres + Auth + Storage + Edge Functions) | supabase-js ^2.39.3 (lockfile resolves 2.101.0) | No separate application server |
| Styling | Inline `style={{}}` objects + one shared `index.css` | — | No Tailwind/Bootstrap/CSS-in-JS/component library |
| Routing | None | — | In-memory `useState('dash')` tab switch (`App.jsx:76`) — no `react-router` |
| PWA | `vite-plugin-pwa` | ^1.3.0 | `registerType: 'autoUpdate'`, manifest name "Leave Manager" |
| Edge runtime | Deno (Supabase Edge Functions) | — | 3 functions: `create-employee`, `post-jira-worklog`, `send-notification` |
| Email | Resend API | — | Used only by `send-notification` edge function |
| Linting/formatting | ESLint 9 + Prettier 3 | — | Dev-only |
| Hosting | Vercel (per `vercel.json` SPA rewrite) | — | No CSP/security headers configured |

Only **3 runtime npm dependencies** ship to the browser (`react`, `react-dom`, `@supabase/supabase-js`) — everything else (design system, forms, validation, routing-by-state) is hand-rolled.

---

## 3. Product Scale Snapshot

| Metric | Count | Source |
|---|---|---|
| Top-level navigable screens/tabs | 13 unique tab ids (21 distinct user-facing screens counting sub-views and gating screens) | `App.jsx:25-67`, see `04_INFORMATION_ARCHITECTURE.md` |
| Roles | 3 (`admin`, `manager`, `employee`) | `schema.sql:22` |
| Database tables | 15 | `schema.sql` |
| RLS policies | 40+ across all tables | `schema.sql` |
| DB functions/RPCs | 3 callable RPCs (`get_approver`, `get_leave_balance`, `get_team_calendar`) + 7 trigger functions | `schema.sql` |
| Edge Functions | 3 | `supabase/functions/` |
| Business workflows | 16 | `06_BUSINESS_WORKFLOWS.md` |
| React components | ~19 files under `leave-app/src/components/` | see `04_INFORMATION_ARCHITECTURE.md` |

---

See `02_USER_PERSONAS.md`, `03_ROLES_AND_PERMISSIONS.md`, and `04_INFORMATION_ARCHITECTURE.md` for the next layer of detail.
