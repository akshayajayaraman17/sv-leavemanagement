-- ============================================================
-- LEAVE ADJUSTMENTS → BALANCE FIX — run in Supabase SQL Editor
-- ============================================================
-- Problem: admin leave overrides (leave_adjustments table) were never
-- factored into get_leave_balance(), so adding/subtracting days in the
-- Admin Panel never changed what the employee (or admin) saw as their
-- actual remaining balance.

-- ── 1. Ensure leave_adjustments exists with the shape the app expects ──────
create table if not exists public.leave_adjustments (
  id           uuid primary key default uuid_generate_v4(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  type_code    text not null references public.leave_types(code),
  adjustment   numeric(5,1) not null default 0,
  reason       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(employee_id, type_code)
);

alter table public.leave_adjustments add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_leave_adjustments_updated_at on public.leave_adjustments;
create trigger trg_leave_adjustments_updated_at before update on public.leave_adjustments
  for each row execute function public.handle_updated_at();

-- ── 2. RLS ───────────────────────────────────────────────────────────────
alter table public.leave_adjustments enable row level security;

drop policy if exists "leave_adjustments_select" on public.leave_adjustments;
create policy "leave_adjustments_select" on public.leave_adjustments for select using (
  employee_id = auth.uid() or public.is_admin()
);
drop policy if exists "leave_adjustments_admin_write" on public.leave_adjustments;
create policy "leave_adjustments_admin_write" on public.leave_adjustments for insert with check (public.is_admin());
drop policy if exists "leave_adjustments_admin_update" on public.leave_adjustments;
create policy "leave_adjustments_admin_update" on public.leave_adjustments for update using (public.is_admin());
drop policy if exists "leave_adjustments_admin_delete" on public.leave_adjustments;
create policy "leave_adjustments_admin_delete" on public.leave_adjustments for delete using (public.is_admin());

-- ── 3. Fix get_leave_balance to include the adjustment in the total ────────
create or replace function public.get_leave_balance(emp_id uuid)
returns table (
  type_code   text,
  label       text,
  color       text,
  bg_color    text,
  total       numeric,
  used        numeric,
  remaining   numeric
) language sql stable as $$
  with emp as (select * from public.employees where id = emp_id),
  comp_earned as (
    select coalesce(sum(earned_days),0) as days
    from public.comp_off_requests
    where employee_id = emp_id and status = 'approved'
  ),
  used_per_type as (
    select leave_type, coalesce(sum(days),0) as used_days
    from public.leave_requests
    where employee_id = emp_id
      and status = 'approved'
      and extract(year from from_date) = extract(year from current_date)
    group by leave_type
  ),
  adj_per_type as (
    select type_code, coalesce(sum(adjustment),0) as adj_days
    from public.leave_adjustments
    where employee_id = emp_id
    group by type_code
  )
  select
    lt.code,
    lt.label,
    lt.color,
    lt.bg_color,
    case when lt.is_comp_off then (select days from comp_earned)
         else public.prorated_days((select joining_date from emp), lt.annual_days)
              + coalesce((select adj_days from adj_per_type where type_code = lt.code), 0)
    end as total,
    coalesce((select used_days from used_per_type where leave_type = lt.code), 0) as used,
    greatest(0,
      case when lt.is_comp_off then (select days from comp_earned)
           else public.prorated_days((select joining_date from emp), lt.annual_days)
                + coalesce((select adj_days from adj_per_type where type_code = lt.code), 0)
      end
      - coalesce((select used_days from used_per_type where leave_type = lt.code), 0)
    ) as remaining
  from public.leave_types lt
  where lt.is_active = true
  order by lt.is_comp_off, lt.annual_days desc;
$$;
