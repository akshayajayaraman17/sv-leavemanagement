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
1. In your Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **New query**
3. Open the file `supabase/schema.sql` from this project
4. Paste the entire contents into the editor
5. Click **Run** (or press Ctrl+Enter)
6. You should see "Success. No rows returned" — all tables, functions, and RLS policies are now created

### Step 3: Get your API credentials
1. Go to **Project Settings → API** (gear icon in sidebar)
2. Copy:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon / public** key (long string starting with `eyJ…`)
   - **service_role** key (keep this secret — only used in the Edge Function)
3. Save these for the next steps

### Step 4: Deploy the Edge Function
The Edge Function creates auth users + employee records in one atomic operation.

Option A — Supabase Dashboard (no CLI needed):
1. Go to **Edge Functions** in the sidebar
2. Click **New Function**, name it `create-employee`
3. Paste the contents of `supabase/functions/create-employee/index.ts`
4. Click **Deploy**

Option B — Supabase CLI:
```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_ID
npx supabase functions deploy create-employee
```

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
  'ADMIN001',
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

---

## PART 4 — FIRST USE

### Admin workflow
1. Log in as admin
2. Go to **Admin tab** → **Add Employee**
3. Fill in details across the 3 tabs: Details / Salary / Approvers
4. Each new employee gets an email invite to set their password (Supabase handles this)

### Employee workflow
1. Employee logs in
2. Dashboard shows their pro-rated leave balance for the year
3. **Apply** tab → submit leave request
4. **Comp Off** tab → submit comp off for holiday work
5. **History** tab → track all requests

### Manager/Approver workflow
1. Log in as manager
2. **Approvals** tab shows pending comp off and leave requests
3. Approve or reject with one tap

---

## FREE TIER LIMITS

| Service | Free Limit | Notes |
|---------|-----------|-------|
| Supabase DB | 500 MB storage | Plenty for hundreds of employees |
| Supabase Auth | 50,000 MAU | More than enough |
| Supabase Edge Functions | 500K invocations/month | Only used for employee creation |
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
│   ├── schema.sql                          ← Run this in Supabase SQL Editor
│   └── functions/
│       └── create-employee/
│           └── index.ts                    ← Deploy as Edge Function
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
- **Employee creation** requires admin JWT verified server-side in the Edge Function
- The `service_role` key is never exposed to the browser — it only lives in the Edge Function runtime
- All other DB access uses the `anon` key + RLS policies that enforce per-user access
