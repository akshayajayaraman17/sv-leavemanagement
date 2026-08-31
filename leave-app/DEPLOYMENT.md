# Leave Management App — Deployment Guide

Stack: **Supabase** (Postgres + Auth + Edge Functions) + **Vercel** (frontend hosting)
Both are 100% free on their respective free tiers.

---

## PART 1 — SUPABASE SETUP

### Step 1: Create a Supabase project
1. Go to https://supabase.com and sign up / log in
2. Click **New Project**
3. Enter a project name (e.g. `leave-manager`), set a strong database password, choose a region
4. Wait ~2 minutes for it to provision

### Step 2: Run the database schema
Run each of these files, in order, in the Supabase **SQL Editor** (New query → paste → Run):

1. `supabase/schema.sql` — base tables, functions, RLS
2. `supabase/migration-attendance-policies.sql` — attendance/timesheet tables
3. `supabase/migration-leave-adjustments-balance.sql` — admin leave adjustments
4. `supabase/migration-security-hardening.sql` — approver self-approval fix, Jira token RLS, private medical-certificates bucket
5. `supabase/migration-indexes-and-constraints.sql` — query indexes + a constraint preventing overlapping leave requests
6. `supabase/migration-holidays-and-escalation.sql` — company holidays table + approver fallback when an approver is deactivated
7. `supabase/migration-enhancements.sql` — team calendar RPC + admin audit trail
8. `supabase/migration-leave-cancellation.sql` — lets an employee cancel their own pending/not-yet-started-approved leave request
9. `supabase/migration-self-service-profile.sql` — adds `employees.address` (Profile's address field previously had nowhere to save), a self-update RLS policy + column-restricting trigger (employees could not previously update even their own phone/address), and `must_change_password` for the forced password-change flow
10. `supabase/migration-employee-offboarding.sql` — adds `employees.exit_date` / `exit_reason`, and extends the self-update guard from file 9 so an employee can't set those on their own row
11. `supabase/migration-probation-tiered-leave.sql` — real leave policy, not reflected anywhere before: tenure-tiered Annual (16/18/20 days) and Medical/"sick" (14/18/22 days) entitlement, and a 6-month probation from `joining_date` during which no leave of any kind accrues. **Changes the current-year balance shown for every existing employee immediately on running it** — e.g. someone with 3 years' service previously saw a flat 20 annual days, now sees 18 (tiered)

All eleven are idempotent (`if not exists` / `create or replace` / `drop policy if exists`), so re-running any of them is safe. You should see "Success. No rows returned" after each.

**Note on file 5:** the overlap constraint will fail to create if any employee already has two overlapping pending/approved leave requests in the table — Postgres reports the exact conflicting rows in the error if so. Resolve those first, then re-run.

**Important on file 9 + the create-employee Edge Function:** `must_change_password` is only ever set to `true` by the `create-employee` Edge Function (updated this session) — running the SQL migration alone is not enough. You must also **redeploy** `create-employee` (see Step 4) for newly created employees to actually be flagged. Existing employees are unaffected either way (the column defaults to `false`).

**Storage bucket:** `migration-security-hardening.sql` creates the `medical-certificates` bucket as private. If you previously created it manually as a public bucket, the migration flips it to private and installs RLS policies — any old public certificate links will stop working (the app now generates short-lived signed URLs on demand instead).

### Step 3: Get your API credentials
1. Go to **Project Settings → API** (gear icon in sidebar)
2. Copy:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon / public** key (long string starting with `eyJ…`)
   - **service_role** key (keep this secret — only used in the Edge Function)
3. Save these for the next steps

### Step 4: Deploy the Edge Functions
There are four Edge Functions:

- `create-employee` — creates auth users + employee records in one atomic operation.
- `offboard-employee` — deactivates/reactivates an employee: bans/unbans their Supabase Auth account (via `service_role`) and updates `is_active`/`exit_date`/`exit_reason` together. Without this deployed, the Admin/Team "Deactivate" button will fail — there's no client-side fallback, since banning an auth user can only be done server-side.
- `send-notification` — emails an employee when their leave/comp-off/timesheet/regularization request is approved or rejected. **Optional** — the app works fully without it; skip it if you don't want email notifications yet.
- `post-jira-worklog` — posts worklogs to a user's personal Jira account (only needed if you use the Jira integration).

Option A — Supabase Dashboard (no CLI needed):
1. Go to **Edge Functions** in the sidebar
2. Click **New Function**, name it to match the folder (e.g. `create-employee`)
3. Paste the contents of the matching `supabase/functions/<name>/index.ts`
4. Click **Deploy**
5. Repeat for each function you want

Option B — Supabase CLI:
```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_ID
npx supabase functions deploy create-employee
npx supabase functions deploy offboard-employee
npx supabase functions deploy send-notification
npx supabase functions deploy post-jira-worklog
```

**To enable email notifications**, `send-notification` needs a [Resend](https://resend.com) account (free tier is generous — check current limits on their site) and its API key set as a function secret:

```bash
npx supabase secrets set RESEND_API_KEY=re_your_key_here
```

Optional secrets for `send-notification`:
- `NOTIFY_FROM_EMAIL` — the "from" address (defaults to Resend's shared `notifications@resend.dev` sender, which works without any domain setup but looks less polished; verify your own domain in Resend for a custom "from" address)
- `APP_URL` — your deployed app's URL, included as a "View in Leave Manager" link in each email if set

If `RESEND_API_KEY` isn't set, the function returns a clear "not configured" error and the rest of the app is unaffected — approving/rejecting requests still works, it just won't send an email.

### Step 5: Create the first Admin user
Since only admins can add employees, you need to bootstrap the first admin manually.

1. Go to **Authentication → Users** in Supabase dashboard
2. Click **Invite user** (or **Add user**), enter admin email + password
3. Copy the new user's UUID from the users list
4. Go to **SQL Editor**, run this (replace values):

```sql
INSERT INTO public.employees (
  id, employee_code, full_name, email, role, joining_date
) VALUES (
  'PASTE-USER-UUID-HERE',
  'EMP-001',
  'Your Admin Name',
  'admin@yourcompany.com',
  'admin',
  '2024-01-01'
);
```

That's the Supabase setup done ✓

---

## PART 2 — FRONTEND SETUP (LOCAL)

### Step 6: Install dependencies
```bash
cd leave-app
npm install
```

### Step 7: Set environment variables
```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE
```

### Step 8: Run locally to test
```bash
npm run dev
```
Open http://localhost:5173 — log in with your admin credentials.

---

## PART 3 — DEPLOY TO VERCEL (FREE)

### Step 9: Push to GitHub
```bash
git init
git add .
git commit -m "initial commit"
# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/leave-manager.git
git push -u origin main
```

### Step 10: Deploy on Vercel
1. Go to https://vercel.com and sign up / log in with GitHub
2. Click **Add New → Project**
3. Import your `leave-manager` GitHub repository
4. Vercel auto-detects Vite — no build settings needed
5. Before deploying, click **Environment Variables** and add:
   - `VITE_SUPABASE_URL` → your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` → your anon key
6. Click **Deploy**

Your app will be live at `https://leave-manager-xxx.vercel.app` in ~60 seconds.

### Step 11 (optional): Custom domain
In Vercel project settings → Domains → add your own domain for free.

### Step 12: Install as an app (optional)
The app is an installable PWA — useful mainly for the Attendance check-in/check-out flow, which is phone-first. On Android/Chrome, visit the site and use "Add to Home Screen" (or the install prompt); on iOS Safari, use Share → "Add to Home Screen". It launches full-screen with its own icon, no browser chrome.

---

## PART 4 — FIRST USE

### Admin workflow
1. Log in as admin
2. Go to **Admin tab** → **Add Employee**
3. Fill in details across the tabs: Details / Salary / Approvers / Leave / Comp Off
4. There's no self-serve signup or email invite — the admin sets (or, for bulk add, chooses/generates) the employee's initial password directly and shares it with them out of band. Every employee created this way must set their own password the moment they first log in (see below) before they can use the app
5. **Bulk Add** (next to Add Employee) — upload a CSV of new hires (template provided in the UI). Choose either a random password per employee (recommended — shown/exportable once after creation) or one shared password for the whole batch; either way, each employee is forced to replace it on first login
6. **Holidays** tab (within Admin) — add company holidays; these are excluded from leave-day counts and count toward comp-off eligibility
7. **Audit Log** tab (within Admin) — history of salary changes, leave adjustments, and role changes
8. **Export** tab (within Admin) — CSV export of the employee roster, all leave requests, or attendance
9. From an employee's **Salary** tab, **Print / Download Payslip** opens a print-ready payslip (use the browser's "Save as PDF")

### Employee workflow
1. Employee logs in with the credentials the admin gave them
2. If the admin set/generated that password (always true for admin-created accounts), they land on a **required "Set a new password"** screen first — the app is otherwise unusable until they replace it
3. Dashboard shows their pro-rated leave balance for the year
4. **Apply** tab → submit leave request
5. **Comp Off** tab → submit comp off for holiday work
6. **History** tab → track all requests, including self-cancelling a pending or not-yet-started approved one

### Manager/Approver workflow
1. Log in as manager
2. **Approvals** tab shows pending comp off and leave requests
3. Approve or reject with one tap — the employee gets an email if `send-notification` is deployed and configured
4. **Calendar** tab (all roles) shows a month view of who's approved for leave, plus company holidays

---

## FREE TIER LIMITS

| Service | Free Limit | Notes |
|---------|-----------|-------|
| Supabase DB | 500 MB storage | Plenty for hundreds of employees |
| Supabase Auth | 50,000 MAU | More than enough |
| Supabase Edge Functions | 500K invocations/month | Employee creation, Jira worklogs, decision emails |
| Resend (optional) | Free tier — check current limits at resend.com | Only used if `send-notification` is deployed and configured |
| Vercel | 100 GB bandwidth/month | More than enough |
| Vercel builds | Unlimited | |

Both services stay free indefinitely at this scale.

---

## PROJECT FILE STRUCTURE

```
leave-app/
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
├── .env.example
├── .gitignore
├── supabase/
│   ├── schema.sql                          ← See Step 2 for the full migration run order
│   ├── migration-*.sql
│   └── functions/
│       ├── create-employee/index.ts        ← Deploy as Edge Function
│       ├── offboard-employee/index.ts      ← Deploy as Edge Function
│       ├── send-notification/index.ts      ← Deploy as Edge Function (optional, needs Resend)
│       └── post-jira-worklog/index.ts      ← Deploy as Edge Function (optional, needs Jira)
└── src/
    ├── main.jsx
    ├── App.jsx                             ← Shell + navigation
    ├── index.css
    └── lib/
    │   ├── supabase.js                     ← Supabase client
    │   ├── api.js                          ← All DB calls
    │   └── AuthContext.jsx                 ← Session management
    └── components/
        ├── UI.jsx                          ← Shared atoms
        ├── Login.jsx
        ├── Dashboard.jsx
        ├── ApplyLeave.jsx                  ← Apply Leave + Comp Off
        ├── MyLeaves.jsx
        ├── Approvals.jsx
        └── AdminPanel.jsx                  ← Employee CRUD + Salary + Approvers
```

---

## SECURITY NOTES

- **Salary data** is protected by Supabase Row Level Security — only admin role can read/write
- **Employee creation** requires admin JWT verified server-side in the `create-employee` Edge Function — the frontend always calls this function rather than creating auth users directly, so the admin check can't be bypassed by calling the client SDK's `signUp` directly
- The `service_role` key is never exposed to the browser — it only lives in the Edge Function runtime
- All other DB access uses the `anon` key + RLS policies that enforce per-user access
- **Approver assignment** (`approver_id` on leave/comp-off/regularization requests) is computed server-side by a trigger on insert, not trusted from client input — this prevents a user from naming themselves as their own approver
- **Jira API tokens** are readable only by the employee who owns them — not by admins
- **Medical certificates** live in a private storage bucket; the app mints short-lived signed URLs on demand rather than using permanent public links
- **Approver fallback** — if the highest-priority configured approver (or the reporting manager) has been deactivated, `get_approver()` automatically skips to the next one, so a request never silently stalls on a former employee
- **Audit trail** — salary changes, leave-balance adjustments, and role changes are logged to `audit_log` (admin-read-only) by `SECURITY DEFINER` triggers; rows can't be inserted directly by client code
- **Team calendar** exposes only name/leave-type/dates for *approved* leave via a narrow `SECURITY DEFINER` function — it never has access to `reason`, `reject_reason`, or medical certificate links, regardless of caller
- **send-notification** builds every email server-side from a record the caller's own JWT can already see (RLS still applies) — the client can only say *which* existing record to notify about, never supply arbitrary recipient addresses or message content
- **Forced password change** — any employee created by an admin (single-add or bulk-add, random or shared password) has `must_change_password = true` and cannot use the app until they set their own password. A bare `id = auth.uid()` self-update RLS policy on `employees` would let an employee push a change to *any* column on their own row (including `role`); a trigger restricts a non-admin self-update to only `phone`, `address`, and `must_change_password`
- **Offboarding** — Deactivate actually bans the employee's Supabase Auth account via `offboard-employee` (service_role only — not something client code can trigger directly), not just `employees.is_active`, which nothing at the Auth layer ever checked. Note this doesn't kill an already-issued access token instantly — it blocks new sign-ins/refreshes, and the app force-signs-out a deactivated employee the next time their record loads, but a token already in hand keeps working until it expires (default 1 hour)
