# 04. Information Architecture

## 1. Full Application Hierarchy

Generated from actual code (`App.jsx:25-67` NAV definitions, `AdminPanel.jsx` internal `section`/`view` state, `Team.jsx` internal `selected` state) — not a template. Indentation reflects reachability, not URL structure (there is no URL structure — see §3).

```
Login  (gating screen, unauthenticated)
└── Forgot Password (embedded 3-step subflow: email → OTP → reset → done)

Force Password Change  (gating screen, must_change_password = true)

Dashboard                              [tab: dash]      all roles
Notifications                          [tab: notifications] all roles
Attendance                             [tab: attendance] all roles
  └── Regularization request (inline card, not a separate screen)
Timesheet                              [tab: timesheet]  all roles
  └── Late Submission Request (inline card)
Apply Leave                            [tab: apply]      all roles
Apply Comp Off                         [tab: comp]        all roles      (nav label "Comp Off", title "Request Comp Off")
My Leaves (History)                    [tab: history]     all roles      (2 sub-tabs: Leave Requests / Comp Off)
Team Calendar                          [tab: calendar]    all roles      (nav label "Calendar")
Approvals                              [tab: approvals]   manager, admin (4 sub-tabs: Comp Off / Leave Requests / Timesheets / Regularizations)
Team                                   [tab: team]        manager, admin
  └── Team Employee Detail                                manager, admin  (sub-view via row click; tabs: Profile/Leaves/Timesheet/Attendance/[Salary if admin])
Admin Panel                            [tab: admin]       admin only
  ├── Admin Employees            (section: employees, view: list — default)
  │     ├── Admin Add Employee   (view: add)   — tabs: Details / Salary / Approvers
  │     ├── Admin Edit Employee  (view: edit)  — tabs: Details / Salary / Approvers / Leave / Comp Off
  │     └── Admin Bulk Add       (view: bulk)  — 3-step wizard: Upload → Preview → Results
  ├── Admin Holidays             (section: holidays)
  ├── Admin Audit Log            (section: audit)
  └── Admin Export               (section: export)
Jira Settings                          [tab: jira]        all roles
Profile                                [tab: profile]     all roles      (title "My Profile")
```

**Total distinct user-facing screens: 21** — 13 top-level nav tabs + 2 gating screens (Login, Force Password Change) + 1 embedded subflow (Forgot Password) + 1 drill-in sub-view (Team Employee Detail) + 4 Admin Panel sub-sections, where Admin Employees further splits into 3 view-states (list/add-edit/bulk) counted as 2 additional distinct screens (Add/Edit is one spec entry per `13_UI_UX_Documentation.md`'s own page count, Bulk Add is a separate wizard). This matches the 21-page inventory used throughout this documentation set and in `05_PAGE_BY_PAGE_SPECIFICATION.md`.

---

## 2. Role-Scoped Navigation Sets (exact, from `App.jsx:25-67`)

| Tab id | Nav label | Topbar title | Employee | Manager | Admin |
|---|---|---|---|---|---|
| `dash` | Home | Dashboard | ✓ | ✓ | ✓ |
| `notifications` | Notifications | Notifications | ✓ | ✓ | ✓ |
| `attendance` | Attendance | Attendance | ✓ | ✓ | ✓ |
| `timesheet` | Timesheet | Timesheet | ✓ | ✓ | ✓ |
| `apply` | Apply | Apply Leave | ✓ | ✓ | ✓ |
| `comp` | Comp Off | Request Comp Off | ✓ | ✓ | ✓ |
| `history` | History | My Leaves | ✓ | ✓ | ✓ |
| `calendar` | Calendar | Team Calendar | ✓ | ✓ | ✓ |
| `approvals` | Approvals | Approvals | — | ✓ | ✓ |
| `team` | Team | Team | — | ✓ | ✓ |
| `admin` | Admin | Admin Panel | — | — | ✓ |
| `jira` | Jira | Jira | ✓ | ✓ | ✓ |
| `profile` | Profile | My Profile | ✓ | ✓ | ✓ |

Nav array sizes: `NAV.employee` = 10 tabs, `NAV.manager` = 12 tabs, `NAV.admin` = 13 tabs. Note several label/title mismatches surfaced by research (nav says "Apply", topbar says "Apply Leave"; nav "History" → topbar "My Leaves"; nav "Calendar" → topbar "Team Calendar"; nav "Comp Off" → topbar "Request Comp Off"; nav "Admin" → topbar "Admin Panel"; nav "Profile" → topbar "My Profile") — cosmetic inconsistency, not a functional issue, flagged in `14_UI_UX_AUDIT.md`.

---

## 3. Navigation Mechanism

**No router exists.** `const [tab, setTab] = useState('dash')` (`App.jsx:76`) is the entire navigation state. Clicking a sidebar item (desktop) or bottom-nav icon (mobile) calls `setTab(id)`, which conditionally renders one of 13 lazy-loaded components inside a shared `<Suspense>`/`<ErrorBoundary key={tab}>` wrapper (`App.jsx:159-176`). No `react-router`, no hash routing, no query parameters tied to app state, in the dependency tree at all.

**Consequences (all verified in code, not speculative):**
- **Refresh always lands on Dashboard.** `tab` is pure component state with zero persistence (not URL, not `localStorage`) — F5 resets to `'dash'` regardless of where the user was.
- **No bookmarking or deep-linking.** Exactly one URL exists for the whole app.
- **No browser back/forward support for in-app navigation** — no `history.pushState` anywhere.
- **No breadcrumbs.** Only hand-rolled per-screen `‹ Back` buttons that pop local view-state (`AdminPanel.jsx` list ↔ add/edit ↔ bulk; `Team.jsx` list ↔ `EmployeeDetail`) — these are React state transitions, not navigation history, so refreshing mid-edit drops the user back to Dashboard and loses in-progress work.
- The PWA installability (`vite-plugin-pwa`, `vite.config.js:5-25`) partly mitigates the refresh problem in daily use (an installed app is opened fresh, not refreshed mid-session) but doesn't change the underlying architecture.

**Secondary/in-page navigation** that does exist: sub-tabs within a screen (Approvals' 4 sub-tabs, MyLeaves' 2 sub-tabs, EmployeeForm's Details/Salary/Approvers/Leave/Comp Off tabs, AdminPanel's Employees/Holidays/Audit/Export section pills) — all local `useState`, same refresh-loses-position characteristic.

---

## 4. Entry Points & Exit Points (per screen category)

| Screen category | Entry points | Exit points |
|---|---|---|
| Login | Only URL of the app, when unauthenticated | Successful sign-in → Dashboard (or Force Password Change if flagged) |
| Force Password Change | Automatic redirect post-login when `must_change_password=true` | Successful password change → Dashboard; "Sign out" escape hatch → Login |
| Any of the 13 tabs | Sidebar (desktop) / bottom nav (mobile) click; default landing (`dash`) on every fresh load | Any other sidebar/bottom-nav tab; sign-out |
| Team Employee Detail | Clicking an employee row in Team tab | `‹ Back` button → Team list (local state pop, not history) |
| Admin Add/Edit/Bulk | Buttons on Admin Employees list | `‹ Back`/Cancel → Admin Employees list |

---

## 5. Data Entities Referenced Across the IA

Cross-reference only — full detail in `11_DATABASE_SPECIFICATION.md`. 15 tables: `employees`, `salary_details`, `approver_config`, `jira_accounts`, `leave_types`, `leave_requests`, `leave_adjustments`, `comp_off_requests`, `company_holidays`, `audit_log`, `attendance`, `timesheets`, `timesheet_entries`, `attendance_punches`, `attendance_regularizations`.

---

## 6. Component File Map (`leave-app/src/`)

| File | Screen(s) it renders |
|---|---|
| `App.jsx` | Shell, nav, tab routing, toast, error boundary |
| `main.jsx` | React entry point (wraps `App` in `AuthProvider`) |
| `index.css` | Global styles, responsive breakpoints |
| `components/UI.jsx` | Design-system primitives (no screen of its own) |
| `components/ErrorBoundary.jsx` | Fallback error screen |
| `components/Login.jsx` | Login + Forgot Password subflow |
| `components/ForcePasswordChange.jsx` | Force Password Change |
| `components/Dashboard.jsx` | Dashboard |
| `components/Notifications.jsx` | Notifications |
| `components/Attendance.jsx` | Attendance (+ inline regularization form) |
| `components/Timesheet.jsx` | Timesheet (+ inline late-submission form) |
| `components/ApplyLeave.jsx` | Apply Leave AND Apply Comp Off (two named exports, one file) |
| `components/MyLeaves.jsx` | My Leaves / History |
| `components/Calendar.jsx` | Team Calendar |
| `components/Approvals.jsx` | Approvals (4 sub-tabs) |
| `components/Team.jsx` | Team list + Team Employee Detail sub-view |
| `components/AdminPanel.jsx` | Admin Employees, Add/Edit Employee, Holidays, Audit Log, Export |
| `components/BulkAddEmployees.jsx` | Admin Bulk Add wizard |
| `components/Profile.jsx` | Profile |
| `components/JiraSettings.jsx` | Jira Settings |
| `lib/AuthContext.jsx` | Session/employee state (no screen) |
| `lib/api.js` | Data access layer (no screen) |
| `lib/supabase.js` | Supabase client init (no screen) |
| `lib/payslip.js`, `employeeCode.js`, `password.js`, `csv.js` | Helpers (no screen) |

19 component files total; 13 lazy-loaded via `React.lazy()` for code-splitting (commit `e0b59b7`).
