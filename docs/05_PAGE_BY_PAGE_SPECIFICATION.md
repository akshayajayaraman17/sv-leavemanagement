# 05. Page-by-Page Specification

Full specification for all 21 screens, verified against source. Shared elements referenced rather than repeated per page: design tokens (`13_DESIGN_SYSTEM.md`), business rules (`08_BUSINESS_RULES.md`, cited as `RULE-XX-###`), workflows (`06_BUSINESS_WORKFLOWS.md`, cited as `WF-##`), RLS/API (`10_API_SPECIFICATION.md`, `11_DATABASE_SPECIFICATION.md`). Loading state is the shared `Spinner` (`UI.jsx:109-120`) unless noted; render-time errors are caught by the shared `ErrorBoundary` (`components/ErrorBoundary.jsx`) unless noted; all toasts use the shared `Toast` (`UI.jsx:128-144`, see its state-collision bug in `14_UI_UX_AUDIT.md`).

---

# PAGE 1 — Login

**1. Page Purpose**: Authenticate an existing employee and recover a forgotten password. **2. Primary User**: Any unauthenticated visitor with an account. **3. Secondary Users**: None. **4. User Goal**: Get into the app; regain access if password forgotten. **5. Business Goal**: Gate all app functionality behind Supabase Auth. **6. Entry Points**: The app's single URL when no session exists (`App.jsx:90`). **7. Exit Points**: Successful sign-in → Dashboard or Force Password Change (§`App.jsx:92`).

**8. Navigation**: None (no sidebar/bottomnav render pre-auth). No breadcrumb, no tabs. Internal 4-step dot indicator for the Forgot Password subflow (`Login.jsx:171-190`).

**9. Page Layout**: Centered white card on the `bgSec` page background, single column.

**10. Header**: No app chrome; card contains a title ("Sign In") only — no subtitle, no notifications icon.

**11. Content Sections**: Sign-in form; Forgot Password link → 4-step subflow (email → OTP → reset → done).

**12. Components**: `card`, `Field`, `inputStyle`, `btnStyle`, step-indicator dots.

**13. Fields**:
| Field | Type | Required | Validation | Data Source |
|---|---|---|---|---|
| Email | email | Yes | HTML5 `type=email` only | user input |
| Password | password | Yes | none beyond required | user input |
| (Forgot) Email | email | Yes | non-empty | user input |
| (Forgot) OTP | text, numeric-filtered | Yes | length ≥6, digits only | user input |
| (Forgot) New Password | password | Yes | `length≥8` | user input |
| (Forgot) Confirm Password | password | Yes | must match New Password | user input |

**14. Buttons**:
| Button | Purpose | Action | API |
|---|---|---|---|
| Sign In | authenticate | `signInWithPassword` | Supabase Auth |
| Forgot password? | open subflow | local state change | — |
| Send code | request OTP | `resetPasswordForEmail` | Supabase Auth |
| Verify | verify OTP | `verifyOtp` | Supabase Auth |
| Reset Password | set new password | `updateUser` → `signOut` | Supabase Auth |

**15. Tables**: None. **16. Cards**: Single sign-in card. **17. Tabs**: None. **18. Filters**: None.

**19. Modals**: None (subflow is inline, not a modal). **20. Drawers/Inline Forms**: The 4-step Forgot Password flow is inline, replacing the sign-in form within the same card.

**21. Statuses**: None (no request/status entity on this page).

**22. Business Rules**: RULE-SEC-001 (password ≥8 chars, no complexity rule).

**23. Validation**: Client-only, see Fields table; server validation is whatever Supabase Auth itself enforces (credentials match, OTP validity/expiry) — errors surfaced verbatim.

**24. API**: `signInWithPassword`, `resetPasswordForEmail`, `verifyOtp({type:'recovery'})`, `updateUser({password})`, `signOut` — all Supabase Auth (GoTrue), no custom table interaction on this page. **25. Database**: `auth.users` (Supabase-managed) only.

**26. Notifications**: None (no toast on this screen beyond inline error text). **27. Audit**: Not logged (no login-event audit trail exists anywhere in the app — see `19_SECURITY.md`).

**28. Loading State**: Button shows a disabled/submitting state (no dedicated spinner overlay). **29. Empty State**: N/A. **30. Error State**: Inline error text below the form (e.g., "Invalid login credentials", "Incorrect current password" is Profile-only) — no retry button needed, user can just resubmit. **31. Success State**: Immediate navigation to Dashboard/Force Password Change. **32. Disabled State**: Submit button disabled while a request is in flight. **33. Permission State**: N/A (pre-auth).

**34. Responsive**: Single centered card at all widths, no sidebar/bottomnav present to reflow (`App.jsx:90` renders Login outside the app shell entirely).

**35. Accessibility**: Standard `<form>`/`<input>` semantics (keyboard-operable); no `aria-live` on the inline error text (§`16_ACCESSIBILITY.md` §9); no focus ring on inputs (`16_ACCESSIBILITY.md` §4).

**36. Current UX Problems**: No password-strength feedback beyond a bare length check at the final reset step; "Contact your admin if you don't have access" is the only recovery path if the registered email itself is unreachable (no self-service signup exists).

**37. Recommended UX Improvements**: **Current** — strength feedback only appears after a failed submit. **Problem** — user can't self-correct while typing. **Improved** — live strength/requirements checklist as the Confirm/New Password fields are typed. **Benefit** — fewer failed resets, less support burden.

**38. Design Priority**: Medium.

---

# PAGE 2 — Force Password Change

**1. Purpose**: Force a password change before any other screen is reachable, for accounts created by an admin (who therefore knows the initial password). **2. Primary User**: Any newly-created employee on first login. **3. Secondary Users**: None. **4. User Goal**: Set a private password quickly. **5. Business Goal**: Close the window where an admin-known password remains valid. **6. Entry Points**: Automatic redirect immediately after successful login when `employee.must_change_password===true` (`App.jsx:92`). **7. Exit Points**: Successful change → Dashboard; "Sign out" escape hatch → Login.

**8. Navigation**: None — full-screen, blocks the entire shell (no sidebar/bottomnav render). **9. Layout**: Centered card matching Login's visual style. **10. Header**: Title + explanatory copy on *why* this screen is unavoidable (`ForcePasswordChange.jsx:47-50`).

**11. Content Sections**: Explanation text; New/Confirm password form. **12. Components**: `card`, `Field`, `inputStyle`, `btnStyle`.

**13. Fields**: New Password (password, required, `length≥8`), Confirm Password (password, required, must match).

**14. Buttons**: Save/Change Password (`updateUser`→`clearMustChangePassword`→`refreshEmployee`); Sign Out (escape hatch, `signOut`).

**15-20**: None/N-A (no tables, extra cards beyond the one form card, tabs, filters, modals, or inline sub-forms).

**21. Statuses**: N/A. **22. Business Rules**: RULE-EMP-001 (accounts always start `must_change_password=true`); RULE-SEC-001/002 (note: this screen, unlike Profile, has **no** "new ≠ temp password" check — a documented inconsistency).

**23. Validation**: `length≥8`, match-confirm — both client-only. **24. API**: `supabase.auth.updateUser({password})`, `clearMustChangePassword()` → `update employees set must_change_password=false`, `refreshEmployee()`. **25. Database**: `employees.must_change_password` — write is column-restricted by `enforce_employee_self_update()` trigger (self-editable even for a non-admin, since it's on the explicit allow-list).

**26. Notifications**: None. **27. Audit**: Not logged.

**28. Loading**: Button disabled while submitting. **29. Empty**: N/A. **30. Error**: Inline error text (e.g., weak password / mismatch). **31. Success**: Immediate transition to Dashboard via `refreshEmployee()` re-fetch. **32. Disabled**: Save disabled until both fields non-empty and matching. **33. Permission**: N/A (this screen has no role branching).

**34. Responsive**: Single centered card, identical at all widths. **35. Accessibility**: Same input-focus-ring gap as Login.

**36. Current UX Problems**: Same client-only 8-char check as every other password form; no live match/strength indicator until Save is clicked; missing the "new ≠ temp" check that Profile's equivalent flow has.

**37. Recommended Improvements**: **Current** — match feedback only on submit. **Problem** — user learns of a typo only after clicking Save. **Improved** — real-time match indicator as Confirm is typed, and add the missing "new ≠ temp password" check for consistency with Profile. **Benefit** — fewer failed attempts, consistent security posture across both password-change surfaces.

**38. Design Priority**: Medium.

---

# PAGE 3 — Dashboard

**1. Purpose**: At-a-glance summary landing screen. **2. Primary User**: All roles. **3. Secondary Users**: None (same view shape for all roles, minor content differences). **4. User Goal**: Quickly see balance, upcoming events, recent activity. **5. Business Goal**: Reduce need to visit multiple tabs for routine status checks. **6. Entry Points**: Default tab on every login/app open (`tab` initializes to `'dash'`). **7. Exit Points**: Any other nav tab (no in-page action leads anywhere — see UX Problem).

**8. Navigation**: Sidebar/bottomnav per role; no breadcrumb; no tabs; no back button (it's the root). **9. Layout**: Profile summary card → leave-balance grid → This Month (holidays/birthdays) cards → pending comp-off → recent leaves, top to bottom, single scrolling column. **10. Header**: Topbar title "Dashboard"; no search, no page-level actions.

**11. Content Sections**: Profile summary; Leave balance grid (2-col mobile / 4-col desktop via `.balance-grid`); This Month holidays; This Month birthdays; Pending comp-off; Recent leaves list.

**12. Components**: `card` ×N, `Avatar`, progress bars (inline, per-tile usage bar), `Badge` (recent leaves statuses).

**13. Fields**: None (read-only screen, no form). **14. Buttons**: None (zero actionable buttons — see UX Problem). **15. Tables**: None. **16. Cards**: Profile summary, per-leave-type balance tiles (with usage progress bar), holidays-this-month, birthdays-this-month, pending comp-off summary, recent leaves (list of cards). **17. Tabs**: None. **18. Filters**: None. **19-20. Modals/Drawers**: None.

**21. Statuses**: Recent leaves show `Badge` (approved/pending/rejected/cancelled).

**22. Business Rules**: RULE-LV-014/015 (balance calculation feeds the tiles directly from `get_leave_balance()`).

**23. Validation**: N/A (read-only). **24. API**: `Promise.all` of 5 calls on mount — `get_leave_balance` RPC, `fetchMyLeaves` (recent), `fetchMyCompRequests` (pending), `fetchHolidays` (this month), birthdays fetch. **25. Database**: `leave_requests`, `comp_off_requests`, `company_holidays`, `employees.date_of_birth` (read-only on all).

**26. Notifications**: None generated by this page. **27. Audit**: N/A (read-only).

**28. Loading**: Shared `Spinner` while the 5 parallel fetches resolve. **29. Empty**: Sections with no data (e.g., no holidays this month) render `Empty` or are omitted — verified pattern is per-section conditional rendering rather than a single page-level empty state. **30. Error**: A failed fetch in any of the 5 calls has no dedicated per-section retry UI (`14_UI_UX_AUDIT.md` Interaction States). **31. Success**: N/A (no mutating action). **32. Disabled**: N/A. **33. Permission**: Identical content shape for all 3 roles — no role-gated section exists on Dashboard itself.

**34. Responsive**: `.balance-grid` 2-col mobile → 4-col desktop (`index.css:158-160`); everything else single-column at all widths.

**35. Accessibility**: Progress bars are purely visual (no `aria-valuenow` equivalent verified); no other page-specific gaps beyond the app-wide ones in `16_ACCESSIBILITY.md`.

**36. Current UX Problems**: Zero actionable buttons on the busiest screen in the app — user must switch tabs manually to act on anything they see.

**37. Recommended Improvements**: **Current** — pure read-only summary. **Problem** — every insight requires a second navigation step to act on. **Improved** — add a primary "Apply Leave"/"Check In" quick-action row near the top. **Benefit** — collapses the most common two-step journeys (see balance → apply leave) into one tap.

**38. Design Priority**: High.

---

# PAGE 4 — Notifications

**1. Purpose**: Reverse-chronological feed synthesized client-side from 5 tables, plus a pinned "N pending your approval" banner for approvers. **2. Primary User**: All roles. **3. Secondary Users**: Managers/admins see extra approver-oriented items. **4. User Goal**: See what changed since last check without digging through each module. **5. Business Goal**: Avoid building a dedicated notifications table/push infra while still giving visibility. **6. Entry Points**: Nav tab. **7. Exit Points**: Any other nav tab (feed items are not click-through links to the source record — verified, no `onClick` navigation exists on feed rows).

**8. Navigation**: Standard sidebar/bottomnav; no sub-tabs, no breadcrumb. **9. Layout**: Pinned approver banner (if applicable) → reverse-chronological single-column feed. **10. Header**: Topbar title "Notifications".

**11. Content Sections**: Pending-approval banner (manager/admin only); feed list. **12. Components**: `card` per feed item, banner card.

**13-14. Fields/Buttons**: None (read-only feed, no actions). **15. Tables**: None. **16. Cards**: One per feed item + one pinned banner. **17-20**: None.

**21. Statuses**: Feed items reflect source-table statuses (approved/pending/rejected) as descriptive text, not `Badge` components.

**22. Business Rules**: Synthesizes from `leave_requests`, `comp_off_requests`, `timesheets`, `attendance_regularizations`, `leave_adjustments` — no dedicated rule beyond "if role is admin/manager, also include pending-for-approver items."

**23. Validation**: N/A. **24. API**: 5 parallel `select` queries (RLS-scoped to the viewer automatically — an employee only ever sees their own rows; a manager/admin additionally sees pending items routed to them). **25. Database**: same 5 tables, read-only.

**26. Notifications**: This *is* the notification surface — it does not itself trigger anything. **27. Audit**: N/A.

**28. Loading**: Spinner. **29. Empty**: `Empty` placeholder if the merged feed is empty. **30. Error**: No per-section retry (same gap as Dashboard). **31-33**: N/A (read-only, no role-gated permission-denied state — content just varies by role).

**34. Responsive**: Single column at all widths. **35. Accessibility**: No `aria-live` — a screen-reader user must actively revisit the tab to learn of new items (no push mechanism exists anyway).

**36. Current UX Problems**: No read/unread state and no dismiss — every visit re-shows the same history with no indication of what's new since last visit.

**37. Recommended Improvements**: **Current** — full history, every time. **Problem** — can't tell new from old at a glance. **Improved** — track a lightweight last-viewed timestamp (even client-only, e.g. `localStorage`) to visually distinguish new items. **Benefit** — the feed becomes actually skimmable instead of requiring a full re-read each visit.

**38. Design Priority**: Medium.

---

# PAGE 5 — Attendance

**1. Purpose**: Daily GPS-stamped check-in/out, punch history, missing-checkout detection, and regularization requests. **2. Primary User**: All roles (self-service). **3. Secondary Users**: None on this page (manager/admin view others' attendance via Team, not here). **4. User Goal**: Log a day's presence accurately and fix a missed checkout without email back-and-forth. **5. Business Goal**: Maintain an attendance record that timesheet hour-validation and comp-off eligibility both depend on. **6. Entry Points**: Nav tab. **7. Exit Points**: Other nav tabs.

**8. Navigation**: Standard shell nav; no sub-tabs. **9. Layout**: Primary Check In/Check Out button+status → live accumulated-hours readout → 5-day week strip → today's punch log → missing-checkout warning card (conditional) → inline regularization form (conditional). **10. Header**: Topbar title "Attendance".

**11. Content Sections**: Check-in/out control, week strip, punch log, regularization warning+form. **12. Components**: `card`, big primary button, warning card (amber/red), inline `Field` form for regularization.

**13. Fields** (regularization form only): Proposed Check-Out Time (HTML `time` input, optional), Reason (text, required).

**14. Buttons**:
| Button | Purpose | API |
|---|---|---|
| Check In | start a session | `checkIn()` → upsert `attendance` + insert `attendance_punches` |
| Check Out | end a session | `checkOut()` → update `attendance` + insert punch |
| Check In Again | start a second session same day | same as Check In (RULE-AT-003) |
| Regularize | open inline form | local state |
| Submit (regularization) | file the request | `createRegularization()` + `updateAttendanceStatus(...,'incomplete')` |

**15. Tables**: None (punch log is a card list, not a `<table>`). **16. Cards**: Status card, week-strip day cards, punch-log rows, warning card. **17. Tabs**: None. **18. Filters**: None (week strip is navigation, not filtering). **19. Modals**: None. **20. Drawers/Inline Forms**: Regularization request form is inline, pushed into page flow.

**21. Statuses**: `attendance.status` (present/incomplete/absent — RULE-AT-006 absent unreachable); `attendance_regularizations.status` (pending/approved/rejected).

**22. Business Rules**: RULE-AT-001 through AT-009.

**23. Validation**: Reason required for regularization (button-disabled gate only, RULE-AT-007). **24. API**: `fetchTodayAttendance`, `fetchAttendanceHistory`, `checkIn`, `checkOut`, `createRegularization`, `updateAttendanceStatus`. **25. Database**: `attendance`, `attendance_punches`, `attendance_regularizations`.

**26. Notifications**: Regularization decision triggers `send-notification` (best-effort email). **27. Audit**: Not logged.

**28. Loading**: Spinner on initial fetch. **29. Empty**: No punches today → punch log shows `Empty`/placeholder. **30. Error**: Geolocation denial is a hard block with an inline error, no manual fallback (RULE-AT-001); Nominatim failure falls back to a raw lat/lng string rather than blocking. **31. Success**: Toast + immediate UI update (punch appears, hours recalculate). **32. Disabled**: Check In/Out disabled while a geolocation/DB call is in flight. **33. Permission**: No role branching on this page.

**34. Responsive**: Week strip likely reflows via standard `.form-grid`-style classes at desktop; single column at mobile. **35. Accessibility**: The primary Check In/Out button is a real `<button>` (keyboard-fine); the `time` input for regularization is native HTML.

**36. Current UX Problems**: Hard-depends on browser Geolocation with no manual fallback — a denied permission blocks check-in/out entirely; reverse-geocoding calls a public, keyless third-party API on every punch, adding external latency/dependency to a time-sensitive action.

**37. Recommended Improvements**: **Current** — geolocation-or-nothing. **Problem** — a denied permission (common on shared/kiosk devices, or simply a user who declines the browser prompt) fully blocks the core action of this screen. **Improved** — provide a manual location/notes fallback when geolocation is denied or unavailable, and consider proxying Nominatim through an Edge Function to decouple from the public API's availability. **Benefit** — removes a hard failure mode from the single most frequently used action in the app.

**38. Design Priority**: Critical (blocks a core daily action for some users).

---

# PAGE 6 — Timesheet

**1. Purpose**: Weekly per-task hour logging, cross-validated against attendance, with a Friday submission deadline and Jira worklog sync. **2. Primary User**: All roles. **3. Secondary Users**: None on this page. **4. User Goal**: Log real work accurately and submit on time without being blocked by confusing validation. **5. Business Goal**: Produce a submitted/approved weekly record usable for Jira sync and (implicitly) billing/reporting. **6. Entry Points**: Nav tab. **7. Exit Points**: Other nav tabs.

**8. Navigation**: Standard shell nav; week navigator (prev/next) acts as in-page pseudo-navigation, not a route. **9. Layout**: Week navigator → per-day cards (Mon-Fri) with inline add-entry forms → running weekly total vs. 40h target → lock/deadline banner (conditional) → Submit action. **10. Header**: Topbar title "Timesheet".

**11. Content Sections**: Week selector, 5 day-cards, entry list per day, weekly total, submit control, late-submission request form (conditional).

**12. Components**: `card` per day, `TsBadge` (separate status-badge implementation, see `13_DESIGN_SYSTEM.md`), inline `EntryForm`.

**13. Fields** (per entry): Jira Issue Key (optional, only shown if Jira connected), Project (optional), Task Description (required), Hours (required, `0<h≤24`).

**14. Buttons**: Add Entry (per day); Submit (week-level, blocked per RULE-TS-004/005); Request Late Submission (conditional, appears only when locked).

**15. Tables**: None (card-based). **16. Cards**: One per weekday. **17. Tabs**: None (week navigator, not tabs). **18. Filters**: None. **19. Modals**: None. **20. Drawers/Inline Forms**: `EntryForm` inline per day; late-submission request form inline.

**21. Statuses**: `timesheets.status` (draft/submitted/approved/rejected) + UI-only "locked" pseudo-state (RULE-TS-006).

**22. Business Rules**: RULE-TS-001 through TS-010.

**23. Validation**: Per-entry (RULE-TS-002/003) and pre-submit (RULE-TS-004/005), all client-only except the DB-enforced `hours` check constraint. **24. API**: `fetchOrCreateTimesheet`, `fetchTimesheetEntries`, `addTimesheetEntry`, `submitTimesheet`, `postJiraWorklog` (per unsynced entry), `requestLateTimesheetSubmission`. **25. Database**: `timesheets`, `timesheet_entries`.

**26. Notifications**: Decision (approve/reject) triggers `send-notification`. **27. Audit**: Not logged.

**28. Loading**: Spinner. **29. Empty**: A day with no entries shows an empty day-card with just the Add Entry action. **30. Error**: Submit errors are surfaced inline per-day *before* any API call (client pre-validates fully); a Jira sync failure during submit is handled per-entry (not fully specified in code beyond try/catch → toast). **31. Success**: Toast; status badge updates to "Submitted". **32. Disabled**: Submit disabled while `totalHours===0` or any pre-submit error exists; Add Entry disabled while `remaining≤0` for that day. **33. Permission**: No role branching on this page itself.

**34. Responsive**: Day cards stack single-column mobile; likely a wider multi-column layout at desktop via `.form-grid` classes.

**35. Accessibility**: Standard form semantics; the "locked" state is communicated via a banner (text + color), not solely by disabling controls silently — acceptable, but see UX Problem below for discoverability.

**36. Current UX Problems**: "Locked" is a purely date-derived, non-persisted state — a user who misses the red banner has no other explanation for why Add/Submit stopped responding.

**37. Recommended Improvements**: **Current** — a static page banner is the only signal. **Problem** — easy to miss if the user doesn't revisit the tab exactly when it locks. **Improved** — fire a toast the moment a week's deadline passes if the user has that tab open, and disable (with a tooltip explaining why) rather than silently no-op. **Benefit** — turns a confusing dead-end into an explained state.

**38. Design Priority**: High.

---

# PAGE 7 — Apply Leave

**1. Purpose**: Submit a new leave request against a specific leave type and date range. **2. Primary User**: All roles (self-service). **3. Secondary Users**: None. **4. User Goal**: Get time off approved without guessing at balance or approver. **5. Business Goal**: Funnel every leave request through consistent validation and routing before it reaches an approver. **6. Entry Points**: Nav tab ("Apply"). **7. Exit Points**: Successful submit → toast + form reset (stays on page); other nav tabs.

**8. Navigation**: Standard shell nav. **9. Layout**: Approver preview card → leave-type dropdown (live balances) → date range + half-day checkbox → real-time working-day/balance banner → reason → (conditional) certificate upload → Submit. **10. Header**: Topbar title "Apply Leave".

**11. Content Sections**: Approver preview, form, live banner, certificate uploader (sick only).

**12. Components**: `card`, `Field`, `inputStyle`, dropzone (non-keyboard-operable, `16_ACCESSIBILITY.md` §3), live banner (color-coded).

**13. Fields**:
| Field | Type | Required | Validation | Data Source |
|---|---|---|---|---|
| Leave Type | select | Yes | must be an active type | `leave_types` |
| From Date | date | Yes | — | user input |
| To Date | date | Yes | `≥ From Date` | user input |
| Half Day | checkbox | No | forces `days=0.5` (RULE-LV-002) | user input |
| Reason | textarea | Yes | non-empty trimmed | user input |
| Medical Certificate | file | Conditional (sick only) | required if sick, ≤5MB | user upload |

**14. Buttons**: Submit (`applyLeave()`); implicit Cancel is just navigating away (no explicit Cancel button on this form).

**15. Tables**: None. **16. Cards**: Approver preview card, live working-days/balance banner card. **17. Tabs**: None. **18. Filters**: None. **19. Modals**: None. **20. Drawers**: None.

**21. Statuses**: N/A (this page only creates `pending` requests, doesn't display status). **22. Business Rules**: RULE-LV-001 through LV-009.

**23. Validation**: RULE-LV-003 through LV-006 (client-only); server enforces RULE-LV-007 (overlap) and LV-008 (approver) at the DB level. **24. API**: `get_leave_balance`, `get_approver`, `fetchHolidays` on load; `uploadMedicalCertificate` + `applyLeave` on submit. **25. Database**: `leave_requests` insert; Storage insert (sick only).

**26. Notifications**: None on submission (only on decision — Approvals page). **27. Audit**: Not logged.

**28. Loading**: Spinner while balance/approver/holidays load. **29. Empty**: N/A (form, not a list). **30. Error**: Overlap constraint → friendly message (RULE-LV-007); other errors → raw toast. **31. Success**: Toast + form reset. **32. Disabled**: Submit disabled while `submitting` (opacity 0.7 pattern) or while validation errors exist. **33. Permission**: No role branching.

**34. Responsive**: Single column mobile; `.form-grid-2` desktop for date fields.

**35. Accessibility**: Certificate dropzone is a non-keyboard-operable `<div onClick>` (`ApplyLeave.jsx:144-150`, `16_ACCESSIBILITY.md` §3).

**36. Current UX Problems**: A half-day request spanning a multi-day range is silently forced to 0.5 days with no warning (RULE-LV-002) — a user could select a full week with Half Day checked and only discover afterward that only 0.5 days were deducted.

**37. Recommended Improvements**: **Current** — End Date remains editable and independently meaningful-looking even with Half Day checked. **Problem** — the value it implies (a multi-day half-day request) is not what actually happens. **Improved** — disable/clear the End Date field the moment Half Day is checked, or show an explicit inline warning if a range >1 day is combined with Half Day. **Benefit** — removes a silent-data-loss-feeling surprise from the leave balance.

**38. Design Priority**: High.

---

# PAGE 8 — Apply Comp Off

**1. Purpose**: Submit a comp-off (earned leave) request for a day worked on a weekend/holiday. **2. Primary User**: All roles. **3. Secondary Users**: None. **4. User Goal**: Get credit for a day worked outside normal schedule. **5. Business Goal**: Ensure comp-off is only granted for genuinely-worked, verifiable days. **6. Entry Points**: Nav tab ("Comp Off"). **7. Exit Points**: Successful submit → toast + reset; other tabs.

**8. Navigation**: Standard shell nav. **9. Layout**: Policy-explainer card → worked-date picker (live-validating) → attendance-verified summary card → avail-by date → reason → Submit. **10. Header**: Topbar title "Request Comp Off" (note: nav label says "Comp Off" — a labeling inconsistency, see `04_INFORMATION_ARCHITECTURE.md` §2).

**11. Content Sections**: Policy explainer, worked-date validation chain, attendance summary, avail-date field, reason, submit.

**12. Components**: `card`, `Field`, real-time validation banner.

**13. Fields**:
| Field | Type | Required | Validation |
|---|---|---|---|
| Worked Date | date | Yes | past, weekend/holiday, no duplicate, has valid ≥8h attendance (RULE-CO-001–004) |
| Date to Avail Comp-Off | date | Yes | `>worked date`, within 30 days — **collected and validated but never persisted (RULE-CO-007)** |
| Reason | textarea | Yes | non-empty |

**14. Buttons**: Submit (`applyCompOff()`).

**15-20**: None/N-A (no table/extra cards beyond summary/tabs/filters/modals/drawers).

**21. Statuses**: N/A on this page (creates `pending` only). **22. Business Rules**: RULE-CO-001 through CO-008.

**23. Validation**: Fully client-side chain, see Fields table; **zero** matching DB enforcement (RULE-CO-008). **24. API**: `applyCompOff()`, plus `fetchAttendanceForDate` during the validation chain. **25. Database**: `comp_off_requests` insert.

**26. Notifications**: None on submission. **27. Audit**: Not logged.

**28. Loading**: Spinner. **29. Empty**: N/A. **30. Error**: Raw Postgres error in toast on failure (no custom friendly-message handling, unlike Apply Leave's overlap case). **31. Success**: Toast + reset. **32. Disabled**: Submit disabled until the full validation chain passes. **33. Permission**: No role branching.

**34. Responsive**: Single column mobile, standard desktop reflow. **35. Accessibility**: Same app-wide input-focus gap.

**36. Current UX Problems**: The "Date to Avail Comp-Off" field and its 30-day-window messaging are entirely cosmetic — validated with real error text but dropped before the API call ever fires (RULE-CO-007), so the UI promises a rule the backend doesn't have.

**37. Recommended Improvements**: **Current** — field exists, is validated, is discarded. **Problem** — implies a rule (comp-off expires if not availed within 30 days) that isn't actually tracked or enforced anywhere once submitted. **Improved** — either add an `avail_by_date` column and enforce it, or remove the field and its copy entirely. **Benefit** — the UI stops making a promise the system can't keep.

**38. Design Priority**: High.

---

# PAGE 9 — My Leaves (History)

**1. Purpose**: View and manage the employee's own leave/comp-off request history. **2. Primary User**: All roles (self only). **3. Secondary Users**: None. **4. User Goal**: Check status, see rejection reasons, cancel if still possible. **5. Business Goal**: Give visibility without needing to ask an approver directly. **6. Entry Points**: Nav tab ("History"). **7. Exit Points**: Other tabs.

**8. Navigation**: Standard shell nav; 2 in-page sub-tabs (Leave Requests / Comp Off). **9. Layout**: Sub-tab switcher → reverse-chronological card list. **10. Header**: Topbar title "My Leaves".

**11. Content Sections**: 2 sub-tab lists. **12. Components**: `card` per request, `Badge`, conditional Cancel button, certificate link (sick leave, signed URL).

**13-14. Fields/Buttons**: No form fields; one conditional button — Cancel (`isCancellable` check, `MyLeaves.jsx:6`, mirrors RULE-LV-012 exactly) → `cancelLeave()`.

**15. Tables**: None (card list). **16. Cards**: One per request. **17. Tabs**: Leave Requests / Comp Off. **18. Filters**: **None** — no year/status/date filter exists (see UX Problem). **19-20**: None.

**21. Statuses**: `Badge` shows approved/pending/rejected/cancelled (leave) or approved/pending/rejected (comp-off, no cancelled value — RULE-CO-009).

**22. Business Rules**: RULE-LV-012/013 (cancel eligibility), RULE-CO-009/010 (no cancel, no reject reason for comp-off).

**23. Validation**: N/A (read + one conditional action). **24. API**: `fetchMyLeaves`, `fetchMyCompRequests`, `cancelLeave`, `getMedicalCertificateUrl`. **25. Database**: `leave_requests`, `comp_off_requests` (own rows only, RLS-scoped).

**26. Notifications**: None generated here. **27. Audit**: Not logged.

**28. Loading**: Spinner. **29. Empty**: `Empty` per sub-tab if no history. **30. Error**: No dedicated retry (standard gap). **31. Success**: Cancel → toast + row updates to "Cancelled". **32. Disabled**: Cancel button only rendered when `isCancellable` is true (not disabled — absent). **33. Permission**: No role branching (always own data).

**34. Responsive**: Single column at all widths (card list doesn't reflow to multi-column even at desktop — confirmed no `.form-grid`/`.balance-grid` class used here).

**35. Accessibility**: Cancel is a real `<button>` — keyboard-fine.

**36. Current UX Problems**: No filtering/sorting (by date, type, status) and no pagination on what can become a long multi-year history.

**37. Recommended Improvements**: **Current** — full unfiltered history every time. **Problem** — becomes unwieldy after a year or two of use. **Improved** — add year/status filters as history accumulates (and pagination or lazy-load beyond, say, 50 rows). **Benefit** — keeps the screen usable long-term without a rewrite.

**38. Design Priority**: Low (not urgent for a new deployment, grows in priority over time).

---

# PAGE 10 — Team Calendar

**1. Purpose**: Month-grid view of team leave + company holidays. **2. Primary User**: All roles. **3. Secondary Users**: None. **4. User Goal**: Know who's out before planning work or requesting overlapping leave. **5. Business Goal**: Give visibility without exposing sensitive per-request detail (reason/certificate). **6. Entry Points**: Nav tab ("Calendar"). **7. Exit Points**: Other tabs.

**8. Navigation**: Standard shell nav; prev/next/Today controls act as in-page navigation. **9. Layout**: Month grid, Monday-first, with holiday highlighting and per-employee leave chips. **10. Header**: Topbar title "Team Calendar".

**11. Content Sections**: Month grid only. **12. Components**: `card` per day cell, colored leave chips (first-name only, ≤3 per day + "+N more").

**13-14. Fields/Buttons**: Prev/Next/Today navigation buttons only; no form. **15. Tables**: None (grid, not `<table>`). **16. Cards**: Each day cell is a `card`. **17-18. Tabs/Filters**: None. **19-20. Modals/Drawers**: None ("+N more" is static text, not interactive — see UX Problem).

**21. Statuses**: Implicit — only `approved` leave ever appears (per `get_team_calendar`'s definition). **22. Business Rules**: `get_team_calendar()` RPC design — never exposes reason/reject_reason/certificate regardless of caller role.

**23. Validation**: N/A. **24. API**: `get_team_calendar(from, to)` RPC + `fetchHolidays`. **25. Database**: SECURITY DEFINER RPC over `leave_requests` (approved-only, 6 columns) + `company_holidays`.

**26. Notifications**: None. **27. Audit**: N/A (read-only).

**28. Loading**: Spinner. **29. Empty**: A month with no leave/holidays just shows a plain grid. **30. Error**: No dedicated retry. **31-33**: N/A (read-only, no permission branching — the narrow RPC applies identically to every role).

**34. Responsive**: Grid presumably reflows cell sizing at breakpoints (standard `card`-based day cells); no distinct tablet treatment (`15_RESPONSIVE_DESIGN.md`). **35. Accessibility**: Chip truncation text ("+N more") is static, not a button — so also not a keyboard-accessibility gap (nothing to activate), but see UX Problem.

**36. Current UX Problems**: First-name-only chips truncated to 3 per day can be ambiguous with repeated first names, and "+N more" isn't interactive.

**37. Recommended Improvements**: **Current** — "+N more" is dead text. **Problem** — a day with 5 people out is only 60% visible at a glance. **Improved** — make "+N more" open a day-detail popover listing full names (still respecting the RPC's privacy boundary — no reason/certificate). **Benefit** — full visibility without redesigning the grid or loosening data exposure.

**38. Design Priority**: Medium.

---

# PAGE 11 — Approvals

**1. Purpose**: Unified queue for deciding pending leave, comp-off, timesheet, and regularization requests. **2. Primary User**: Manager, Admin. **3. Secondary Users**: None (Employee has no access — no nav entry). **4. User Goal**: Clear the queue accurately and quickly, with enough context to decide confidently. **5. Business Goal**: Centralize all 4 approval types instead of scattering them across separate screens or side-channels. **6. Entry Points**: Nav tab (manager/admin only). **7. Exit Points**: Other tabs.

**8. Navigation**: Standard shell nav; 4 in-page sub-tabs (Comp Off / Leave Requests / Timesheets / Regularizations). **9. Layout**: Sub-tab switcher → bulk-select header (checkbox-all + bulk actions) → per-item cards with expandable detail (timesheets show entry drill-down). **10. Header**: Topbar title "Approvals"; sub-tabs double as an implicit count-per-category indicator.

**11. Content Sections**: 4 sub-tab queues, each with its own list + bulk-action bar.

**12. Components**: `card` per request, expandable entry list (timesheets only), certificate-view link (sick leave), bulk checkbox row.

**13. Fields**: Bulk Reject Reason (textarea, required only for Timesheets/Regularizations sub-tabs — RULE-TS-008/`08_BUSINESS_RULES.md` RULE pattern; optional/rarely used for Leave per RULE-LV-011).

**14. Buttons**:
| Button | Purpose | Scope | API |
|---|---|---|---|
| Approve (per-row) | decide one | all 4 tabs | `decideLeave`/`decideCompOff`/`decideTimesheet`/`decideRegularization` |
| Reject (per-row) | decide one | all 4 tabs | same, `status='rejected'` |
| Select All | bulk-select checkbox | all 4 tabs | local state |
| Bulk Approve | decide many | all 4 tabs | loop of decide calls |
| Bulk Reject | decide many, one shared reason | all 4 tabs | loop of decide calls |
| View Certificate | open signed URL | Leave tab (sick only) | `getMedicalCertificateUrl` |
| Expand entries | show timesheet detail | Timesheets tab | `fetchTimesheetEntries` (lazy) |

**15. Tables**: None (card-based, timesheet entries expand as a sub-list not a `<table>`). **16. Cards**: One per pending request. **17. Tabs**: Comp Off / Leave Requests / Timesheets / Regularizations. **18. Filters**: None beyond the 4 sub-tabs (no date/employee filter within a tab). **19. Modals**: None (bulk-reject reason is inline, not a modal). **20. Drawers**: Timesheet entry expansion is inline.

**21. Statuses**: All 4 request types shown are always `pending` at load (queue only ever shows undecided items) — post-decision they disappear from the list.

**22. Business Rules**: RULE-LV-010/011, RULE-TS-008, RULE-AT (regularization decide pattern), WF-03/04/07/10.

**23. Validation**: Reject-reason-required is UI-blocked for Timesheets/Regularizations, optional for Leave/Comp-Off. **24. API**: `fetchPendingForApprover`, `fetchPendingCompForApprover`, `fetchPendingTimesheets`, `fetchPendingRegularizations`, plus the 4 decide functions and `notifyDecision`. **25. Database**: `leave_requests`, `comp_off_requests`, `timesheets`, `attendance_regularizations` — all update-only from this screen.

**26. Notifications**: Every decision (single or bulk) triggers `send-notification` per item, best-effort. **27. Audit**: Not logged (none of the 4 decision types are DB-audited).

**28. Loading**: Spinner per sub-tab on switch. **29. Empty**: `Empty` ("Nothing pending") per sub-tab. **30. Error**: Bulk actions report partial failure explicitly (`"${failed} failed"` toast) rather than silently swallowing errors — a genuine strength. **31. Success**: Toast; row disappears from the queue. **32. Disabled**: Approve/Reject disabled while a decision is in flight; Bulk Reject disabled until a reason is typed (Timesheets/Regularizations only). **33. Permission**: Manager sees only rows where `approver_id=self`; Admin sees all pending rows regardless of assigned approver (RULE-LV-010) — same list UI, different underlying RLS-filtered dataset.

**34. Responsive**: Card list single-column mobile; presumably wider at desktop (no `<table>` alternative exists even here, despite this being one of the more data-dense screens — see `15_RESPONSIVE_DESIGN.md` recommendation #4).

**35. Accessibility**: Bulk checkboxes are native `<input type=checkbox>` (keyboard-fine); Approve/Reject are real buttons.

**36. Current UX Problems**: A single typed rejection reason applies to every item in a bulk-reject batch regardless of employee/context.

**37. Recommended Improvements**: **Current** — one reason field, applied to N items. **Problem** — a manager batch-rejecting 5 people's leave for different underlying reasons is forced to write one generic message that goes to all 5. **Improved** — allow per-item reason override within a bulk-reject batch (default to the shared reason, editable per row before confirming). **Benefit** — decisions stay batch-efficient without sacrificing message accuracy.

**38. Design Priority**: High.

---

# PAGE 12 — Team (List)

**1. Purpose**: Searchable directory of all employees. **2. Primary User**: Manager, Admin. **3. Secondary Users**: None. **4. User Goal**: Find a specific employee's record quickly. **5. Business Goal**: Give managers/admins a single roster view instead of querying the DB directly. **6. Entry Points**: Nav tab. **7. Exit Points**: Click a row → Team Employee Detail (Page 13); other nav tabs.

**8. Navigation**: Standard shell nav; no sub-tabs. **9. Layout**: Search box → flat list of employee cards. **10. Header**: Topbar title "Team"; search box functions as the page-level search.

**11. Content Sections**: Search bar, employee list. **12. Components**: `card` per employee row, `Avatar`, active/inactive + role badges.

**13. Fields**: Search (text input, filters across name/department/designation/code simultaneously, `Team.jsx:466-471`). **14. Buttons**: None beyond the (non-keyboard-operable) row click itself. **15. Tables**: None (card list). **16. Cards**: One per employee. **17-18. Tabs/Filters**: Search is the only filter; no dedicated department/role filter dropdown exists. **19-20. Modals/Drawers**: None.

**21. Statuses**: Active/Inactive badge, role badge (admin/manager/employee) — distinct from the request-status `Badge` component, a separate small badge pattern. **22. Business Rules**: Salary is intentionally never shown here (only in Employee Detail, admin-gated).

**23. Validation**: N/A. **24. API**: `fetchEmployees()` (RLS: `employees_read_all`, every authenticated user, not just managers — see `03_ROLES_AND_PERMISSIONS.md` §2 note on directory-wide read). **25. Database**: `employees` (read-only on this page).

**26. Notifications**: None. **27. Audit**: N/A (read-only).

**28. Loading**: Spinner. **29. Empty**: `Empty` if search yields nothing. **30. Error**: No dedicated retry. **31-33**: N/A on this list page (mutations happen in Detail).

**34. Responsive**: Single column mobile; likely unchanged at desktop (no multi-column grid class referenced for this list). **35. Accessibility**: **Row is a plain `<div onClick>`** (`Team.jsx:490-493`) — not keyboard-focusable or activatable, a real, confirmed accessibility gap (`16_ACCESSIBILITY.md` §3).

**36. Current UX Problems**: Each row is a plain `<div onClick>`, not a button/link — not keyboard-focusable or activatable.

**37. Recommended Improvements**: **Current** — mouse/touch-only row activation. **Problem** — keyboard-only users cannot open an employee's detail view at all from this screen. **Improved** — convert rows to `<button>` elements or add `role="button"`+`tabIndex`+`onKeyDown`. **Benefit** — closes a real, testable WCAG 2.1.1 (Keyboard) failure.

**38. Design Priority**: High (accessibility).

---

# PAGE 13 — Team Employee Detail

**1. Purpose**: Drill-down into one employee's profile/leaves/timesheet/attendance/(salary if admin). **2. Primary User**: Manager, Admin. **3. Secondary Users**: None. **4. User Goal**: Review or (admin-only) edit one employee's record without leaving the Team context. **5. Business Goal**: Consolidate per-employee review into one place instead of separate admin screens. **6. Entry Points**: Click a row on Team (Page 12). **7. Exit Points**: `‹ Back` → Team list (local state pop, not history — lost on refresh).

**8. Navigation**: Back header; 4-5 in-page tabs (Profile/Leaves/Timesheet/Attendance/[Salary if admin]); no breadcrumb. **9. Layout**: Back header → tab switcher → tab content (reuses the same card-list patterns as the employee's own screens). **10. Header**: Employee name/avatar + `‹ Back`.

**11. Content Sections**: Profile tab (admin can inline-edit), Leaves tab (history, read-only here), Timesheet tab (history), Attendance tab (history), Salary tab (admin only).

**12. Components**: `card`, `Field` (edit mode), `Badge`, tab switcher.

**13. Fields** (Profile edit, admin only): Employee Code (required), Joining Date (required), plus the same duplicated last-admin-demotion/deactivation guard logic as `AdminPanel.jsx` (`Team.jsx:71-79`, RULE-EMP-005).

**14. Buttons**: Edit (admin only, Profile tab); Save/Cancel (edit mode).

**15. Tables**: None. **16. Cards**: Per-record cards within each tab. **17. Tabs**: Profile / Leaves / Timesheet / Attendance / (Salary, admin only). **18. Filters**: None. **19. Modals**: `Confirm` for the last-admin-guard block message (if triggered). **20. Drawers**: Inline edit form on the Profile tab.

**21. Statuses**: Same `Badge` reuse as My Leaves for the Leaves tab. **22. Business Rules**: RULE-EMP-005 (duplicated guard).

**23. Validation**: `Team.jsx:67-79` — employee_code/joining_date required, plus admin-guard checks. **24. API**: `fetchEmployee`, `updateEmployee`, plus per-tab history fetches (leaves/timesheet/attendance), `fetchSalary` (admin/Salary tab only). **25. Database**: `employees` (update), `leave_requests`/`comp_off_requests`/`timesheets`/`attendance` (read), `salary_details` (admin only).

**26. Notifications**: None generated here. **27. Audit**: Role changes made here are audit-logged identically to AdminPanel's path (same trigger).

**28. Loading**: Spinner per tab switch. **29. Empty**: `Empty` per tab if no history. **30. Error**: Save failure → toast. **31. Success**: Save → toast + tab returns to read mode. **32. Disabled**: Save disabled during submit or while the last-admin guard blocks it. **33. Permission**: Non-admin managers see Profile/Leaves/Timesheet/Attendance read-only, no edit controls, no Salary tab at all (not just hidden — `salary_admin_only` RLS returns zero rows even if attempted).

**34. Responsive**: Same tab-content patterns as the equivalent self-service screens. **35. Accessibility**: Standard form semantics in edit mode; back header presumably a real button.

**36. Current UX Problems**: The last-admin guard is still UI-only in both this screen and AdminPanel (RULE-EMP-005) — duplicating it adds consistency, not a backend guarantee.

**37. Recommended Improvements**: **Current** — 2 independent client-side copies of the same guard. **Problem** — a third edit surface, if ever added, could reopen the gap; and the guard itself has no DB backstop regardless. **Improved** — move the last-admin check into a DB trigger so it can't regress structurally. **Benefit** — removes an entire class of future duplication risk, not just today's two copies.

**38. Design Priority**: High (data-integrity-adjacent).

---

# PAGE 14 — Admin Employees

**1. Purpose**: Searchable employee roster with lifecycle actions. **2. Primary User**: Admin. **3. Secondary Users**: None. **4. User Goal**: Manage the roster (add, edit, adjust leave, deactivate) from one list. **5. Business Goal**: Central admin console for headcount management. **6. Entry Points**: Admin nav tab (default section). **7. Exit Points**: Add/Edit/Bulk buttons → sub-views (Pages 15/16); other nav tabs.

**8. Navigation**: Admin section pills (Employees/Holidays/Audit/Export) at the top; this is the default (`section:'employees', view:'list'`). **9. Layout**: Search + header actions (Bulk Add, + Add Employee) → employee list with inline row actions. **10. Header**: Topbar title "Admin Panel"; section pills function as secondary nav.

**11. Content Sections**: Search, employee list. **12. Components**: `card` per row, `Avatar`, role/status badges, inline action buttons.

**13. Fields**: Search (name/dept/designation/code). **14. Buttons**: + Add Employee, Bulk Add, per-row Edit, per-row "Add/Remove Leaves" (jumps directly into Edit's Leave tab), per-row Deactivate (→ `Confirm` if target is an admin and would be the last one).

**15. Tables**: None (card list, despite this being one of the most data-dense screens in the app — `14_UI_UX_AUDIT.md` Tables). **16. Cards**: One per employee. **17-18. Tabs/Filters**: Search only. **19. Modals**: `Confirm` for Deactivate. **20. Drawers**: None (Add/Edit/Bulk are separate views, not inline).

**21. Statuses**: Active/Inactive, role badge. **22. Business Rules**: RULE-EMP-005 (deactivate-guard).

**23. Validation**: N/A on the list itself. **24. API**: `fetchEmployees`, `deactivateEmployee`. **25. Database**: `employees` (read + soft-delete update).

**26. Notifications**: None. **27. Audit**: Deactivation itself is **not** audited (only role changes are).

**28. Loading**: Spinner. **29. Empty**: `Empty` on empty search. **30. Error**: No dedicated retry. **31. Success**: Deactivate → toast + row updates. **32. Disabled**: Deactivate blocked (toast error, no modal) if target is the last active admin. **33. Permission**: Admin-only screen (no manager/employee access at all).

**34. Responsive**: Single-column card list at all widths — the one screen in the app where `15_RESPONSIVE_DESIGN.md`'s "use a table at desktop" recommendation would have the highest payoff, given both row count and column-worthy data (code/name/dept/designation/role/status).

**35. Accessibility**: Row action buttons are real `<button>`s (unlike Team's row-click pattern) — no equivalent keyboard gap here.

**36. Current UX Problems**: No visible "Reactivate" action on inactive rows — reactivating requires opening Edit and manually flipping Status.

**37. Recommended Improvements**: **Current** — reactivate is a 2-step detour through the full edit form. **Problem** — the most common follow-up action for an inactive row (bring them back) is the least discoverable. **Improved** — add a direct "Reactivate" button on inactive rows, mirroring the existing Deactivate pattern. **Benefit** — symmetric, discoverable lifecycle actions.

**38. Design Priority**: Medium.

---

# PAGE 15 — Admin Add/Edit Employee

**1. Purpose**: Create a new employee or edit an existing one's full record. **2. Primary User**: Admin. **3. Secondary Users**: None. **4. User Goal**: Onboard or correct an employee record completely in one flow. **5. Business Goal**: Keep employee/salary/approver/leave data consistent and admin-only-writable. **6. Entry Points**: "+ Add Employee" or per-row "Edit"/"Add/Remove Leaves" from Page 14. **7. Exit Points**: Save → back to Admin Employees list; `‹ Back`/Cancel → same.

**8. Navigation**: Back header; in-page tabs (Details/Salary/Approvers, +Leave/+Comp Off when editing). **9. Layout**: Tab switcher → tab-specific form → one bottom Save spanning all tabs. **10. Header**: "Add Employee" or "Edit Employee" + `‹ Back`.

**11. Content Sections**: Details, Salary, Approvers, (edit-only) Leave, (edit-only) Comp Off.

**12. Components**: `card`, `Field`, `inputStyle`, tab switcher, `Confirm` (admin-grant confirmation).

**13. Fields** (Details tab): Full Name*, Email* (read-only when editing), Employee Code* (auto-generated, read-only when editing), Department, Designation, Role* (select), Joining Date*, Manager (select), Password* (create only). Salary tab: Basic Salary, HRA, Transport Allowance, Other Allowances, PF Deduction, Tax Deduction, Other Deductions, Effective From. Approvers tab: up to 3 approver rows (employee select + priority). Leave tab (edit only): per-leave-type adjustment (+/− days) + reason. Comp Off tab (edit only): Worked Date, Worked Hours (default 8), Earned Days (default 1), Reason.

**14. Buttons**: Save (all tabs, single action); `‹ Back`/Cancel; per-approver-row Remove; Comp-Off tab's own "Grant" action (WF-05).

**15. Tables**: None. **16. Cards**: Per-tab form sections. **17. Tabs**: Details / Salary / Approvers / [Leave] / [Comp Off]. **18. Filters**: None. **19. Modals**: `Confirm` — "Grant admin access...?" when `isGrantingAdmin` (RULE-EMP-004); implicit block (toast, not modal) for last-admin-demotion. **20. Drawers**: None.

**21. Statuses**: N/A (this is a data-entry form, not a status-bearing entity). **22. Business Rules**: RULE-EMP-003 through EMP-006, RULE-EMP-010, RULE-CO-011.

**23. Validation**: `full_name`/`email`/`employee_code`/`joining_date` required always; `password` required only on create (`AdminPanel.jsx:106-114`); comp-off grant fields (`validateCompForm`, `AdminPanel.jsx:173-180`). **24. API**: `createEmployee` (Edge Function) or `updateEmployee`; `upsertSalary`; `setApprovers`; `upsertLeaveAdjustment` (per type); `grantCompOff`. **25. Database**: `employees`, `salary_details`, `approver_config`, `leave_adjustments`, `comp_off_requests`.

**26. Notifications**: None sent to the new hire. **27. Audit**: Role changes audited (`trg_audit_role_change`); salary changes audited (`trg_audit_salary`); leave adjustments audited (`trg_audit_leave_adjustments`) — this is the single screen touching the most audited tables in the app.

**28. Loading**: Spinner while existing employee data loads (edit mode). **29. Empty**: N/A (form). **30. Error**: Save failure → toast; edge-function failure (e.g., duplicate email) → toast with the raw error. **31. Success**: Toast + navigate back to list. **32. Disabled**: Save disabled while submitting or while `isLastAdminDemotion` blocks it. **33. Permission**: Admin-only screen entirely.

**34. Responsive**: `.form-grid-2`/`.form-grid-3` desktop column layouts for Details/Salary fields; single column mobile.

**35. Accessibility**: Standard form semantics; no page-specific gap beyond the app-wide input-focus issue.

**36. Current UX Problems**: All tabs share a single Save — there is no per-tab save/draft state, so a mistake on one tab requires resubmitting the whole form.

**37. Recommended Improvements**: **Current** — one Save commits Details+Salary+Approvers+Leave+CompOff together. **Problem** — a typo caught on the Salary tab after already being happy with Details means re-confirming everything at once, and a partial failure (e.g., salary upsert fails after employees update succeeds) can leave tabs in an inconsistent saved state with only one combined toast. **Improved** — add a short inline note explaining why Employee Code becomes read-only post-creation (currently unexplained) as a quick win, and consider (larger) per-section save confirmation. **Benefit** — reduces re-entry risk and clarifies an otherwise-silent field-lock behavior.

**38. Design Priority**: Medium.

---

# PAGE 16 — Admin Bulk Add

**1. Purpose**: CSV-driven bulk employee creation. **2. Primary User**: Admin. **3. Secondary Users**: None. **4. User Goal**: Onboard many employees at once without repeating the single-add form N times. **5. Business Goal**: Reduce admin time cost for batch hiring events (e.g., new cohort/team). **6. Entry Points**: "Bulk Add" button on Page 14. **7. Exit Points**: Done/Back → Admin Employees list.

**8. Navigation**: Back header; 3-step wizard (Upload → Preview → Results), no persistent tabs. **9. Layout**: Step-appropriate single-column content; downloadable CSV template link on step 1. **10. Header**: "Bulk Add Employees" + `‹ Back`.

**11. Content Sections**: Step 1 Upload (dropzone + template download); Step 2 Preview (validation table); Step 3 Results (created/failed summary + password export).

**12. Components**: Non-keyboard-operable dropzone (`16_ACCESSIBILITY.md` §3), `<table>` (one of only 2 real HTML tables in the app), progress indicator during creation.

**13. Fields**: Password Mode (radio: random per-employee / shared), Shared Password (conditional, ≥8 chars) — plus every CSV column implicitly (full_name, email, employee_code, department, designation, role, joining_date, date_of_birth, manager_employee_code).

**14. Buttons**: Download Template; Upload (dropzone trigger); Back (step nav); Create Employees (step 2→3); Export Results CSV (step 3); Done.

**15. Tables**: **Yes** — CSV row-preview table (step 2) and post-creation credentials-results table (step 3), the app's only two `<table>` usages.

**16. Cards**: Summary counts card (step 3). **17. Tabs**: None (wizard steps, not tabs). **18. Filters**: None. **19-20. Modals/Drawers**: None.

**21. Statuses**: Per-row validation state (ready / warning / error) shown in the preview table, not a `Badge`.

**22. Business Rules**: RULE-EMP-007 (no approver_config set), RULE-EMP-008 (password modes).

**23. Validation**: `validateRows()` — see `08_BUSINESS_RULES.md` RULE-EMP context and `06_BUSINESS_WORKFLOWS.md` WF-12 for the full per-column rule breakdown. **24. API**: `createEmployee` (Edge Function), called once per valid row, sequentially. **25. Database**: `employees` (+ `auth.users` via the Edge Function) — no `approver_config` writes (RULE-EMP-007 gap).

**26. Notifications**: None. **27. Audit**: Same partial coverage as single-add (role changes only, and only if a created role differs from default in a way the trigger can observe).

**28. Loading**: Per-row progress indicator during Step 2→3 creation (sequential, not parallel — visible incremental progress). **29. Empty**: N/A. **30. Error**: Rows with validation errors are excluded from creation and shown with inline error text in the preview table; per-row creation failures are reported in the Results summary counts. **31. Success**: Results screen with created count + CSV-exportable temp passwords, explicit "shown only once" warning. **32. Disabled**: "Create Employees" disabled until at least one ready row exists and (if shared mode) the shared password is valid. **33. Permission**: Admin-only.

**34. Responsive**: The preview/results tables are the one place in the app that would genuinely suffer most from being force-fit into cards on mobile — the existing `<table>` choice here is the right call already (`14_UI_UX_AUDIT.md` Tables).

**35. Accessibility**: Upload dropzone is a non-keyboard-operable `<div onClick>` (`BulkAddEmployees.jsx:202-214`); results table displays every plaintext temporary password in-page with no hide/reveal toggle or copy button, just raw selectable text.

**36. Current UX Problems**: The CSV upload dropzone has no keyboard support; the results table shows every plaintext temp password with no hide/reveal toggle or per-row copy button.

**37. Recommended Improvements**: **Current** — dropzone is click/drop-only; passwords sit exposed in plain page text. **Problem** — unkeyboard-operable upload trigger (accessibility failure) and passwords are needlessly exposed to anyone glancing at the admin's screen during the reveal window. **Improved** — add keyboard support (`tabIndex`+`onKeyDown`+hidden native file input already exists, just needs to be reachable) and add a per-row "copy password" button with the raw value masked by default. **Benefit** — closes an accessibility gap and reduces shoulder-surfing exposure of live credentials.

**38. Design Priority**: High.

---

# PAGE 17 — Admin Holidays

**1. Purpose**: Manage the company holiday calendar. **2. Primary User**: Admin. **3. Secondary Users**: None. **4. User Goal**: Keep the holiday list accurate so leave/comp-off date logic and the Team Calendar stay correct. **5. Business Goal**: Single source of truth for company-wide non-working days. **6. Entry Points**: Admin → Holidays section pill. **7. Exit Points**: Other Admin section pills; other nav tabs.

**8. Navigation**: Admin section pills. **9. Layout**: Add-holiday form (date + name) above a flat list with per-row Remove. **10. Header**: Topbar "Admin Panel"; section pill "Holidays" active.

**11. Content Sections**: Add form, holiday list. **12. Components**: `card` per holiday row, `Field`, `Confirm` (remove).

**13. Fields**: Holiday Date (date, required), Name (text, required). **14. Buttons**: Add; per-row Remove (behind `Confirm`).

**15. Tables**: None. **16. Cards**: One per holiday. **17-18. Tabs/Filters**: None (section pills are the only navigation here). **19. Modals**: `Confirm` for Remove. **20. Drawers**: None.

**21. Statuses**: N/A. **22. Business Rules**: Feeds RULE-LV-001 (working-day math), RULE-CO-002 (comp-off eligibility), Team Calendar highlighting, Dashboard's "this month" widget.

**23. Validation**: Both fields required (`AdminPanel.jsx:507-511`); DB `unique(holiday_date)` backs it further. **24. API**: `fetchHolidays`, `createHoliday`, `deleteHoliday`. **25. Database**: `company_holidays`.

**26. Notifications**: None. **27. Audit**: Not logged (no trigger on `company_holidays`).

**28. Loading**: Spinner. **29. Empty**: `Empty` if no holidays configured yet. **30. Error**: Duplicate-date insert → toast with the raw unique-constraint error. **31. Success**: Toast + list updates. **32. Disabled**: Add disabled until both fields filled. **33. Permission**: Admin-only.

**34. Responsive**: Single column at all widths. **35. Accessibility**: Standard form + button semantics, no page-specific gap.

**36. Current UX Problems**: No bulk-import and no recurring/yearly-holiday concept — every year's calendar must be re-entered one row at a time.

**37. Recommended Improvements**: **Current** — fully manual, one row at a time, every year. **Problem** — most company holidays repeat annually on the same or a predictable date; re-entering ~10-15 rows every January is pure toil. **Improved** — offer a "copy last year's holidays" shortcut (with an editable preview to adjust for date-shifting holidays) or CSV import matching the Bulk Add pattern already established elsewhere in the app. **Benefit** — turns an annual chore into a one-click action, reusing a pattern (CSV import) the app already has precedent for.

**38. Design Priority**: Low.

---

# PAGE 18 — Admin Audit Log

**1. Purpose**: Read-only view of the 3 audited action types. **2. Primary User**: Admin. **3. Secondary Users**: None. **4. User Goal**: Investigate a specific salary/leave-adjustment/role-change event. **5. Business Goal**: Provide some accountability trail for the highest-sensitivity data changes. **6. Entry Points**: Admin → Audit section pill. **7. Exit Points**: Other section pills/tabs.

**8. Navigation**: Admin section pills. **9. Layout**: Reverse-chronological flat list, latest 100-200 rows. **10. Header**: Topbar "Admin Panel"; section pill "Audit Log" active.

**11. Content Sections**: Single list. **12. Components**: `card` per entry.

**13-14. Fields/Buttons**: None (read-only). **15. Tables**: None (card list). **16. Cards**: One per audit entry, each showing actor, timestamp, and a diff-style "field: old → new" summary. **17-18. Tabs/Filters**: None — **no filter by actor/date/action-type exists** (see UX Problem). **19-20. Modals/Drawers**: None.

**21. Statuses**: N/A. **22. Business Rules**: RULE-EMP-006, RULE-EMP-009 (only these 3 action types are ever written here).

**23. Validation**: N/A. **24. API**: `fetchAuditLog()` (`api.js:580-587`, requests 200, table shows ~100). **25. Database**: `audit_log`, admin-read-only RLS, no insert/update/delete policy for any role — writes exclusively via the 3 SECURITY DEFINER trigger functions.

**26. Notifications**: None. **27. Audit**: This *is* the audit surface; it doesn't itself generate entries.

**28. Loading**: Spinner. **29. Empty**: `Empty` if no audited events exist yet. **30. Error**: No dedicated retry. **31-33**: N/A (read-only, admin-only screen with no further permission branching).

**34. Responsive**: Single column at all widths. **35. Accessibility**: No page-specific gap.

**36. Current UX Problems**: Covers only 3 of many privileged actions app-wide (employee creation/deactivation, holiday CRUD, approver changes, and every leave/comp-off/timesheet/regularization decision are not logged at all), which could mislead an admin into treating it as a complete activity trail.

**37. Recommended Improvements**: **Current** — no on-page indication of scope. **Problem** — an admin investigating "who approved this leave" or "who deactivated this account" will find nothing here and might incorrectly conclude no record exists at all, rather than realizing this log simply doesn't cover that action type. **Improved** — add a visible on-page caveat stating exactly what is and isn't covered (and, longer-term, expand trigger coverage per `24_IMPLEMENTATION_ROADMAP.md`). **Benefit** — prevents a false sense of completeness that could matter during an actual investigation or dispute.

**38. Design Priority**: High (trust/compliance-adjacent, cheap to fix the messaging even before expanding coverage).

---

# PAGE 19 — Admin Export

**1. Purpose**: One-click CSV export of 3 datasets. **2. Primary User**: Admin. **3. Secondary Users**: None. **4. User Goal**: Get data out for external reporting (payroll, compliance) without a dedicated reporting feature. **5. Business Goal**: Cheap escape hatch instead of building real reporting. **6. Entry Points**: Admin → Export section pill. **7. Exit Points**: Other section pills/tabs.

**8. Navigation**: Admin section pills. **9. Layout**: Three single-purpose export cards, each with a short description. **10. Header**: Topbar "Admin Panel"; section pill "Export" active.

**11. Content Sections**: Employee Roster card, Leave Requests card, Attendance card. **12. Components**: `card` ×3.

**13-14. Fields/Buttons**: One Export button per card (no configuration fields — no date range, no status filter). **15. Tables**: None (the export *produces* a CSV, but the page itself has no table). **16. Cards**: 3, one per dataset. **17-18. Tabs/Filters**: **None** — this is the core UX Problem (see below). **19-20. Modals/Drawers**: None.

**21. Statuses**: N/A. **22. Business Rules**: Attendance export silently truncates to the most recent 1,000 rows (`fetchAttendanceHistory`-equivalent limit) with no on-screen indication of the cap.

**23. Validation**: N/A. **24. API**: `fetchEmployees`, `fetchAllLeaveRequests`, `fetchAttendanceHistory` (capped) → client-side `rowsToCsv`/`downloadCsv`. **25. Database**: `employees`, `leave_requests`, `attendance` — full-table reads (RLS: `is_admin()`), no server-side filtering.

**26. Notifications**: None. **27. Audit**: Exports are not logged (no export-event audit trail exists).

**28. Loading**: Button shows a brief loading/disabled state while the client-side CSV is assembled. **29. Empty**: N/A (export always produces at least a header row). **30. Error**: Fetch failure → toast. **31. Success**: Browser file-download triggers immediately, no confirmation screen. **32. Disabled**: Export button disabled while a prior export is still in flight. **33. Permission**: Admin-only.

**34. Responsive**: 3 cards stack single-column mobile, likely 3-across or stacked at desktop. **35. Accessibility**: Standard button semantics, no page-specific gap.

**36. Current UX Problems**: No date-range or status filtering before export — Leave Requests exports everything, and Attendance silently truncates to the most recent 1,000 rows with no on-screen indication of that cap.

**37. Recommended Improvements**: **Current** — all-or-1000-rows, no visibility into the cap. **Problem** — an admin exporting attendance for a full-year audit could unknowingly receive an incomplete file and not realize it. **Improved** — surface the 1,000-row attendance cap in the UI copy directly on the card, and add basic date-range filters to all three exports. **Benefit** — prevents a silent data-completeness surprise in exactly the kind of export (compliance/payroll) where it matters most.

**38. Design Priority**: High (data-integrity-adjacent — a silent truncation on an audit export is a real risk).

---

# PAGE 20 — Jira Settings

**1. Purpose**: Connect a personal Jira Cloud account for timesheet worklog sync. **2. Primary User**: All roles. **3. Secondary Users**: None. **4. User Goal**: Enable one-click worklog push from Timesheet instead of manual double-entry in Jira. **5. Business Goal**: Reduce duplicate time-tracking effort for teams already using Jira. **6. Entry Points**: Nav tab ("Jira"). **7. Exit Points**: Other nav tabs.

**8. Navigation**: Standard shell nav. **9. Layout**: Explanatory copy → connect/update form → (if connected) "Connected account" summary card + Disconnect action. **10. Header**: Topbar title "Jira".

**11. Content Sections**: Explainer, form, connected-account summary (conditional). **12. Components**: `card`, `Field`.

**13. Fields**: Jira Site URL (`type=url`), Jira Email (`type=email`), Jira API Token (`type=password`) — **no custom validation beyond HTML5 input types** (`08_BUSINESS_RULES.md` notes this is the one integration form with zero custom `validate()` function).

**14. Buttons**: Save/Update Connection; Disconnect (conditional, when already connected).

**15-18**: None/N-A (no tables, extra cards beyond the connected-summary, tabs, filters). **19. Modals**: None (Disconnect is a direct action, not behind `Confirm` — worth noting as an inconsistency, since other destructive actions in the app do use `Confirm`). **20. Drawers**: None.

**21. Statuses**: Implicit connected/not-connected state (derived from whether a `jira_accounts` row exists). **22. Business Rules**: RULE-SEC-003/004.

**23. Validation**: None beyond HTML5 input types. **24. API**: `fetchJiraAccount`, `upsertJiraAccount`, `deleteJiraAccount`. **25. Database**: `jira_accounts` (owner-only RLS, admins deliberately excluded even from their own admin privilege).

**26. Notifications**: None. **27. Audit**: Not logged.

**28. Loading**: Spinner on initial fetch. **29. Empty**: Not-connected state shows the empty connect form (no distinct `Empty` component used — the form itself *is* the empty state). **30. Error**: Save failure → toast. **31. Success**: Toast + summary card appears. **32. Disabled**: Save disabled while submitting. **33. Permission**: No role branching (every role can connect their own account); no role can ever see another's token, admin included (RULE-SEC-004).

**34. Responsive**: Single column at all widths. **35. Accessibility**: Token field uses `type=password` (visually masked) but the raw value is fully present in React state/DOM.

**36. Current UX Problems**: The previously-saved plaintext token is round-tripped back into the form on load and shown in a `type=password` field that can still be revealed via the browser's built-in show-password control or devtools — consistent with the plaintext-storage finding in `19_SECURITY.md`.

**37. Recommended Improvements**: **Current** — real token value loaded into the form every visit. **Problem** — unnecessarily exposes the live secret in the DOM/React state on every page load, and implies the token is being "re-entered" when it isn't. **Improved** — show a masked placeholder (e.g., `••••••••1234` using only the last 4 characters, which would require storing/exposing a partial value) instead of the real saved token, and only send a new value to the backend if the user explicitly changes the field. **Benefit** — reduces the live secret's exposure surface without changing the underlying plaintext-storage architecture (a separate, larger fix tracked in `19_SECURITY.md`).

**38. Design Priority**: Medium (UI hardening; the deeper plaintext-storage issue is tracked separately as a backend fix).

---

# PAGE 21 — Profile

**1. Purpose**: Self-service profile editing and password change. **2. Primary User**: All roles. **3. Secondary Users**: None. **4. User Goal**: Keep contact info current and manage account security. **5. Business Goal**: Reduce admin workload for routine self-service updates (phone/address/DOB) while keeping privileged fields admin-only. **6. Entry Points**: Nav tab ("Profile"). **7. Exit Points**: Other nav tabs; Sign Out.

**8. Navigation**: Standard shell nav (desktop sign-out lives in the sidebar footer; mobile has an additional `.mobile-signout` button on this or the topbar). **9. Layout**: Avatar/name header → read-only "Account Info" block (admin-managed fields) → editable phone/address/DOB form → separate change-password form. **10. Header**: Topbar title "My Profile".

**11. Content Sections**: Account Info (read-only), Editable Details form, Change Password form. **12. Components**: `Avatar`, `card`, `Field`.

**13. Fields**: Read-only: Employee Code, Email, Department, Designation, Role, Manager, Joining Date. Editable: Phone, Address, Date of Birth. Change Password: Current Password (required), New Password (required, ≥8 chars), Confirm Password (required, must match, **must differ from Current** — RULE-SEC-002).

**14. Buttons**: Save (profile fields); Change Password (submit).

**15-18**: None/N-A. **19-20. Modals/Drawers**: None (both forms are always inline, not modal/drawer).

**21. Statuses**: N/A. **22. Business Rules**: RULE-EMP-002 (DB-enforced column allow-list), RULE-SEC-001/002.

**23. Validation**: Profile: trims and nulls empty phone/address/DOB, no explicit `validate()` function. Password: `changePassword()` (`Profile.jsx:43-63`) — current required, new ≥8 chars, confirm matches, new≠current, **plus a live re-authentication** (`signInWithPassword` with the current password) before allowing the change. **24. API**: `updateProfile()` → `update employees` (column-restricted by DB trigger regardless of what's sent); `signInWithPassword()` (verification step); `updateUser({password})`. **25. Database**: `employees` (self-update, trigger-restricted), `auth.users` (password).

**26. Notifications**: None. **27. Audit**: Not logged (profile field edits are not audited — only role/salary/leave-adjustment are).

**28. Loading**: Spinner on initial fetch. **29. Empty**: N/A (always shows the current record). **30. Error**: "Incorrect current password" shown specifically on the `current` field if re-auth fails; other errors → toast. **31. Success**: Profile save → toast; password change → success confirmation that **auto-reverts after a fixed 4-second timeout** (`Profile.jsx:73`) — see UX Problem. **32. Disabled**: Save/Change Password disabled while submitting. **33. Permission**: No role branching — every role sees the identical layout; only the *values* of the read-only Account Info block differ.

**34. Responsive**: Single column mobile; `.form-grid-2` desktop for the editable-details fields.

**35. Accessibility**: Standard form semantics; the password re-verification flow is a genuinely good UX/security pattern (live check, not just a same-as-typed comparison) but has no distinct accessibility treatment beyond the app-wide input-focus gap.

**36. Current UX Problems**: The same client-only 8-character minimum as every other password form; the success confirmation auto-reverts after a fixed 4-second timeout with no way for a slower reader to keep it visible.

**37. Recommended Improvements**: **Current** — success message vanishes on a hard 4s timer regardless of whether the user has finished reading it. **Problem** — a user who looks away (interrupted, or simply reading slowly) may come back to a form that silently reverted to its normal state with no lasting confirmation the change worked. **Improved** — replace the fixed auto-revert with a manual dismiss (matching the app's own `Toast` pattern, which already requires a manual `×`), or leave the success state visible until the user navigates away. **Benefit** — removes an unnecessary time-pressure element from a security-sensitive confirmation.

**38. Design Priority**: Low.

---

## Cross-Page Summary

| Priority | Count | Pages |
|---|---|---|
| Critical | 1 | Attendance (geolocation hard-block) |
| High | 9 | Dashboard, Timesheet, Apply Leave, Apply Comp Off, Approvals, Team (list), Team Employee Detail, Admin Bulk Add, Admin Audit Log, Admin Export |
| Medium | 7 | Login, Force Password Change, Notifications, Team Calendar, Admin Employees, Jira Settings |
| Low | 3 | My Leaves, Admin Holidays, Profile |

(Counts sum to 20 categorized + Attendance's Critical = 21 total pages, matching the full inventory.) Full prioritization rationale and sequencing in `18_UI_UX_IMPROVEMENT_MATRIX.md` and `24_IMPLEMENTATION_ROADMAP.md`.
