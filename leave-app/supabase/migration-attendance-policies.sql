-- ============================================================
-- ATTENDANCE POLICY MIGRATION — run in Supabase SQL Editor
-- ============================================================
-- Policies:
--   1. Multiple check-ins/check-outs within 24-hour window
--   2. Minimum 8 working hours for valid attendance
--   3. Missing check-out = marked as leave → employee requests regularization
--   4. Check-in/check-out mandatory

-- ── 1. Add status column to attendance ──────────────────────────────────────
alter table public.attendance
  add column if not exists status text not null default 'present'
    check (status in ('present', 'incomplete', 'absent'));

-- ── 2. Attendance punches — tracks each check-in/check-out event ────────────
create table if not exists public.attendance_punches (
  id            uuid primary key default uuid_generate_v4(),
  attendance_id uuid not null references public.attendance(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  punch_type    text not null check (punch_type in ('check_in', 'check_out')),
  punch_time    timestamptz not null,
  lat           double precision,
  lng           double precision,
  address       text,
  created_at    timestamptz not null default now()
);

-- ── 3. Attendance regularizations — requests to fix missing checkouts ───────
create table if not exists public.attendance_regularizations (
  id              uuid primary key default uuid_generate_v4(),
  attendance_id   uuid not null references public.attendance(id) on delete cascade,
  employee_id     uuid not null references public.employees(id) on delete cascade,
  approver_id     uuid references public.employees(id),
  reason          text not null,
  check_out_time  timestamptz,             -- proposed check-out time
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  decided_at      timestamptz,
  reject_reason   text,
  created_at      timestamptz not null default now()
);

-- ── 4. RLS for new tables ───────────────────────────────────────────────────
alter table public.attendance_punches          enable row level security;
alter table public.attendance_regularizations  enable row level security;

-- Punches: own records + managers/admins
create policy "punches_select" on public.attendance_punches for select using (
  employee_id = auth.uid() or public.is_manager()
);
create policy "punches_insert" on public.attendance_punches for insert with check (
  employee_id = auth.uid()
);

-- Regularizations: employee sees own, manager/admin sees all
create policy "reg_select" on public.attendance_regularizations for select using (
  employee_id = auth.uid() or approver_id = auth.uid() or public.is_admin()
);
create policy "reg_insert" on public.attendance_regularizations for insert with check (
  employee_id = auth.uid()
);
create policy "reg_update" on public.attendance_regularizations for update using (
  approver_id = auth.uid() or public.is_admin()
);

-- ── 5. Allow managers/admins to update attendance (for regularization) ──────
drop policy if exists "attendance_update" on public.attendance;
create policy "attendance_update" on public.attendance for update using (
  employee_id = auth.uid() or public.is_manager()
);
