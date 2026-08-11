# 19. Security Documentation

Findings verified directly against source (no speculation). No secret values are reproduced anywhere in this document — only variable names, shapes, and locations. Severity: Critical / High / Medium / Low / Info.

## 1. Authentication

- **Provider**: Supabase Auth (GoTrue) via `supabase-js`, default client options — `persistSession`/`autoRefreshToken` are library defaults, not overridden (`lib/supabase.js:1-6`).
- **Sign-in**: `signInWithPassword`. **No self-service signup** anywhere client-side — every account is created via the admin-gated `create-employee` Edge Function. **No MFA/2FA.** **No SSO/social login.**
- **Session handling**: `AuthContext.jsx` uses only `getSession()` + `onAuthStateChange` — no custom token storage; confirmed no `localStorage`/`sessionStorage` usage anywhere in `leave-app/src`.
- **Password reset**: 3-step OTP (`resetPasswordForEmail` → `verifyOtp({type:'recovery'})` → `updateUser`), entirely Supabase-managed.
- **Password strength**: minimum 8 characters, checked independently in 3 places (`Login.jsx:157`, `ForcePasswordChange.jsx:16`, `Profile.jsx:47-49`) with **no shared validator and no complexity rule** (no uppercase/digit/symbol requirement for user-typed passwords). The only character-diversity logic in the codebase is for *generating* random temp passwords (`password.js`), not validating typed ones. **Severity: Low-Medium** (no evidence either way of a server-side Supabase Auth password policy — that config, if any, lives in the Supabase dashboard, outside this repo).

## 2. Secrets Management

- **Client Supabase init** (`lib/supabase.js:3-6`) uses only the **anon/public key** (`VITE_SUPABASE_ANON_KEY`) — safe by design. No hardcoded URL/key literal anywhere in source.
- `.env.example` (tracked) contains placeholders only. `.env.local` (real values) is gitignored and **confirmed never committed**, via full git history scan.
- **`SUPABASE_SERVICE_ROLE_KEY`** never referenced in client code (`leave-app/src`) — only read server-side inside the `create-employee` Edge Function via `Deno.env.get(...)`, correctly never shipped to the browser bundle. **`RESEND_API_KEY`** similarly Edge-Function-only.
- Full git history scanned for `.env`/credential-shaped filenames and JWT-shaped strings — no leaked secrets found (one false-positive `sha512-` npm integrity-hash substring, not a real secret).
- **Overall: no leaked secrets found in the repository or its history.** — Info, positive.

## 3. Third-Party Integration Security — Jira Token Handling

- `JiraSettings.jsx:23` loads the **stored plaintext token directly into form state** on every visit and re-displays it in a `type="password"` field — visually masked, but the raw value is fully present in React state/DOM and inspectable via devtools.
- **Storage**: `jira_accounts.jira_api_token` is `text not null` (`schema.sql:67`) — **plaintext, no encryption/hashing, no pgcrypto/pgsodium wrapping.**
- **Access control (mitigating)**: RLS restricts all 4 operations to the owning employee only (`schema.sql:381-397`) — **admins are deliberately excluded**, a stricter posture than the rest of the app's generally admin-can-read-everything pattern; this was tightened by `migration-security-hardening.sql` after a previously broader admin-inclusive policy.
- **Usage**: `post-jira-worklog/index.ts:52` reads the token using the caller's own JWT (not service role) to build a Basic-Auth header sent to Jira over HTTPS.
- **Severity: Medium.** Plaintext-at-rest is the real gap — protected against app-level misuse by strong RLS, but not against DB/backup/service-role compromise.

## 4. Audit Logging

`audit_log` (`schema.sql:289-298`) is append-only: **no insert/update/delete RLS policy exists for any role** — the table is writable only via 3 SECURITY DEFINER trigger functions.

**Covered**: `salary_change` (`salary_details` INSERT/UPDATE/DELETE), `leave_adjustment` (`leave_adjustments` INSERT/UPDATE/DELETE), `role_change` (`employees.role` UPDATE only when the value actually changes).

**NOT covered** (verified absent — no trigger/insert path exists for any of these): login/logout/failed-login events, password resets/changes, leave/comp-off/timesheet/regularization approvals-rejections-cancellations, employee creation/deactivation/profile edits, Jira account connect/disconnect, attendance check-in/out, timesheet submissions, holiday CRUD, approver-config changes, medical-certificate uploads/downloads, CSV exports.

**Severity: Medium/Info** (a deliberate design choice, but a real gap for anyone treating the Audit Log as a complete activity trail — see `05_PAGE_BY_PAGE_SPECIFICATION.md` Page 18 UX recommendation to surface this scope explicitly on the page itself).

## 5. Authorization / RLS Reliance

**RLS is the app's primary — and for nearly every table, its only — access-control mechanism.** There is no custom backend API layer; `lib/api.js` (668 lines) issues `supabase.from(...)`/`.rpc(...)`/`.functions.invoke(...)` calls with **zero client-side authorization logic** of its own (no `if (role!=='admin') throw` anywhere) — it trusts the database to reject unauthorized operations.

- RLS is enabled on **all 15 tables**. Two helper functions (`is_admin()`, `is_manager()`) drive the majority of policies.
- **Server-side enforcement beyond RLS** (triggers compensating for RLS's lack of column-level granularity): `enforce_employee_self_update()`, `enforce_leave_cancellation()`, `enforce_approver_id()` (closes a genuine, previously-real self-approval hole — documented as fixed in `migration-security-hardening.sql`).
- **`create-employee` is the one privileged path independently re-verified server-side** — the Edge Function checks `role='admin'` for the caller using the caller's own JWT *before* switching to a service-role client, so this path cannot be reached by a non-admin even via a hand-crafted request.

### Confirmed Gaps (all verified against actual RLS policy text, not assumed)

| # | Gap | Detail | Severity |
|---|---|---|---|
| 1 | "Last active admin" rule is client-only | No DB constraint prevents demoting/deactivating the sole remaining admin; `employees_admin_update/_delete` check only `is_admin()`. Duplicated independently in `AdminPanel.jsx` and `Team.jsx` — a race between two simultaneous admin actions could zero out active admins even under the UI's own logic | **Medium** |
| 2 | Leave/comp-off business rules are UI-only | Balance sufficiency, sick-certificate requirement, all comp-off eligibility checks — none have a matching DB constraint; a modified client could insert requests violating any of them | Medium |
| 3 | Admin-direct comp-off grant relies on a UI-only gate | RLS `comp_insert` technically allows any employee to insert a pre-approved (`status='approved'`) row for themselves — the app never does this from the self-service form, but RLS doesn't block it either | Medium |
| 4 | "My team only" scoping doesn't exist for attendance/timesheet | `is_manager()` grants read access to **every** employee's attendance/timesheet-entries, not just direct reports — any manager can read any employee's records via direct API calls | Low-Medium |
| 5 | `get_leave_balance`/`get_approver` RPCs accept an arbitrary `emp_id` with no relationship check | Any authenticated user can query any other employee's leave balance or approver via a direct RPC call | Low |
| 6 | `salary_details` upsert relies on `onConflict:'employee_id'` with no visible matching unique constraint in the tracked schema | Could silently create duplicate salary rows rather than updating, if no untracked index exists in the live DB | Low (data-integrity, not exposure) |

**Conclusion: RLS is comprehensive and genuinely the primary security boundary.** Historical self-approval and admin-over-broad-Jira-read holes were found and fixed (visible in `migration-security-hardening.sql`) — a healthy sign of an iterating security posture, not a static one.

## 6. Repository / History Scan

No `credentials.json`, service-account keys, `.pem`/`.key` files, or similar tracked in git (full-history scan). `.env`/`.env.local` never committed. The "direct SQL" bootstrap scripts (`create-employee-direct-sql.sql`, `bulk-create-employees-direct-sql.sql`) contain explicit "never commit real data" header warnings and only placeholder values (`admin@yourcompany.com`, `REPLACE_WITH_STRONG_PASSWORD`) — verified, no real PII present. `.claude/settings.local.json` contains only benign tool-permission entries. **Conclusion: no exposed credentials found anywhere in the repository or its history.** — Info.

## 7. Password/Token Storage Practices

- User login passwords: entirely delegated to Supabase Auth's managed `auth.users` — no custom hashing in application code anywhere.
- One narrow, well-scoped exception: `create-employee/index.ts` passes a plaintext password straight to `adminClient.auth.admin.createUser(...)` — Supabase's own Admin API does the hashing; the function never persists/logs/returns it.
- The only place custom hashing appears at all is `create-employee-direct-sql.sql` (a manual, documented, unsupported first-admin bootstrap script), using `crypt(password, gen_salt('bf'))` — bcrypt via `pgcrypto`, same algorithm family Supabase Auth itself uses. Not part of normal operation.
- Residual plaintext exposure exists in exactly two places: Jira tokens (§3) and bulk-created employees' temporary passwords, which are deliberately exported to CSV once with an explicit "shown only once" warning (`BulkAddEmployees.jsx:330-335`) — an intentional trade-off for onboarding usability, not an oversight.

## 8. CORS / Rate Limiting / Security Headers

- **CORS**: all 3 Edge Functions set `Access-Control-Allow-Origin: *` — wildcard, not scoped to the app's deployed origin. Auth is bearer-JWT (not cookie-based), which limits classic CSRF risk, but this still removes origin-based defense-in-depth. **Severity: Low-Medium.**
- **Rate limiting**: none at the application level anywhere in the repo — whatever exists is entirely Supabase-platform-level, not configurable from this codebase.
- **Security headers**: `vercel.json` contains only an SPA rewrite rule — **no CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy configured anywhere.** Relies entirely on hosting-platform defaults. **Severity: Low-Medium.**

## 9. Dependency Posture

Only 3 runtime dependencies ship to the browser: `@supabase/supabase-js` (declared `^2.39.3`, lockfile-resolved `2.101.0` — a large caret-range drift worth reviewing/pinning), `react`, `react-dom`. Dev-only tooling otherwise (ESLint, Prettier, Vite, `vite-plugin-pwa`). No deprecated/typosquat-shaped package names. Prior remediation exists in commit history ("npm audit fix for dev-dependency vulnerabilities"), but it's manual/ad hoc — no Dependabot/Renovate config, no CI audit step found. **Severity: Info/Low** — recommend an actual `npm audit`/`npm outdated` pass as a follow-up outside this documentation exercise.

## 10. Summary Table (Severity Ranking)

| # | Area | Finding | Severity |
|---|---|---|---|
| 1 | Secrets Mgmt | Jira API tokens stored + round-tripped in plaintext | Medium |
| 2 | Secrets Mgmt | Bulk-import temp passwords exported to plaintext CSV (intentional, one-time-shown) | Medium |
| 3 | Authorization | "Last active admin" enforced client-side only, duplicated in 2 places, no DB backstop | Medium |
| 4 | Audit Logging | Only salary/leave-adjustment/role-change actions audited | Medium |
| 5 | Authorization | Admin-direct comp-off grant relies on a UI-only gate | Medium |
| 6 | Third-Party Integration | Wildcard CORS on all 3 Edge Functions | Low-Medium |
| 7 | Security Headers | No CSP/HSTS/X-Frame-Options anywhere | Low-Medium |
| 8 | Authorization | No "my direct reports only" scoping for manager attendance/timesheet reads | Low-Medium |
| 9 | Authentication | Password policy = 8-char minimum only, no complexity rule, triplicated logic | Low-Medium |
| 10 | Authorization | `get_leave_balance`/`get_approver` RPCs have no caller-relationship check | Low |
| 11 | Dependency Posture | Large lockfile version drift on `supabase-js`; no automated audit/CI gate | Low |
| 12 | Authentication | No MFA/2FA available | Info |
| 13 | Secrets Mgmt | Anon key correctly used client-side; no leaked secrets in repo/history | Info (positive) |
| 14 | Authorization | RLS is comprehensive, is the deliberate primary boundary; historical self-approval/over-broad-Jira-read holes were found and fixed | Info (positive) |
| 15 | Password Storage | No custom password hashing outside Supabase Auth / documented bcrypt bootstrap | Info (positive) |

**15 findings: 0 Critical, 0 High, 5 Medium, 5 Low/Low-Medium, 5 Info (3 positive).** No leaked secrets, no broken authentication, no SQL injection surface (PostgREST/parameterized RPCs throughout) — the security posture is notably stronger than a typical BaaS-direct app of this size, with the "last active admin" gap and the audit-log coverage gap being the two most actionable items. Full remediation sequencing in `24_IMPLEMENTATION_ROADMAP.md`.
