-- ============================================================
-- COMPANY HOLIDAYS + APPROVAL FALLBACK — run in Supabase SQL Editor
-- ============================================================
-- 1. company_holidays: admin-managed list, used to keep leave-day counts
--    and comp-off weekend/holiday detection accurate.
-- 2. get_approver(): now skips a priority-ordered approver_config entry
--    if that approver has been deactivated, and only falls back to the
--    reporting manager if the manager is themselves active. Previously
--    a deactivated approver silently stalled every request routed to
--    them, with no fallback.

-- ── 1. Company holidays ─────────────────────────────────────────────────
create table if not exists public.company_holidays (
  id           uuid primary key default uuid_generate_v4(),
  holiday_date date not null unique,
  name         text not null,
  created_at   timestamptz not null default now()
);

alter table public.company_holidays enable row level security;

drop policy if exists "holidays_read_all" on public.company_holidays;
create policy "holidays_read_all" on public.company_holidays for select using (true);

drop policy if exists "holidays_admin_write" on public.company_holidays;
create policy "holidays_admin_write" on public.company_holidays for all using (public.is_admin());

-- ── 2. Approver fallback when inactive ──────────────────────────────────
create or replace function public.get_approver(emp_id uuid)
returns uuid language sql stable as $$
  select coalesce(
    (
      select ac.approver_id
      from public.approver_config ac
      join public.employees e on e.id = ac.approver_id
      where ac.employee_id = emp_id and e.is_active = true
      order by ac.priority asc
      limit 1
    ),
    (
      select m.id
      from public.employees emp
      join public.employees m on m.id = emp.manager_id
      where emp.id = emp_id and m.is_active = true
    )
  );
$$;
