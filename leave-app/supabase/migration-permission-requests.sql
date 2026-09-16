-- ============================================================
-- PERMISSION REQUESTS — short (<=2h) intra-day time-off requests,
-- capped at 2 per calendar month per employee.
-- Run in Supabase SQL Editor after schema.sql.
-- ============================================================

create table public.permission_requests (
  id            uuid primary key default uuid_generate_v4(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  request_date  date not null,
  from_time     time not null,
  to_time       time not null,
  -- Generated so it can't drift from from_time/to_time, and the CHECK below
  -- gets invalid time ranges (to_time <= from_time yields <= 0) for free.
  duration_minutes int generated always as (
    round(extract(epoch from (to_time - from_time)) / 60)::int
  ) stored,
  reason        text not null,
  status        text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approver_id   uuid references public.employees(id),
  decided_on    timestamptz,
  reject_reason text,
  applied_on    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint permission_duration_valid check (duration_minutes > 0 and duration_minutes <= 120)
);

create index idx_permission_requests_employee on public.permission_requests (employee_id, request_date);
create index idx_permission_requests_approver on public.permission_requests (approver_id, status);

-- approver_id is computed server-side, same as leave_requests / comp_off_requests
-- / attendance_regularizations — never trust a client-supplied approver_id.
create trigger trg_permission_requests_approver
  before insert on public.permission_requests
  for each row execute function public.enforce_approver_id();

-- Server-side enforcement of the 2-per-calendar-month cap. A non-admin insert
-- is always forced to 'pending' (a direct PostgREST insert could otherwise set
-- status='approved' itself, same class of bug the comp-off eligibility trigger
-- closes). The advisory lock serializes concurrent inserts for the same
-- employee + month so two simultaneous requests can't both slip past the
-- count check and jointly exceed the cap.
create or replace function public.enforce_permission_monthly_limit()
returns trigger language plpgsql as $$
declare
  used        int;
  month_start date := date_trunc('month', new.request_date)::date;
  month_end   date := (date_trunc('month', new.request_date) + interval '1 month - 1 day')::date;
begin
  if not public.is_admin() then
    new.status := 'pending';
    new.decided_on := null;
    new.reject_reason := null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.employee_id::text || to_char(new.request_date, 'YYYY-MM'), 0));

  -- Only pending/approved count against the cap — mirrors the leave_requests
  -- convention (no_overlapping_leave also only blocks on pending/approved),
  -- so a rejected or cancelled request frees up the slot again.
  select count(*) into used
  from public.permission_requests
  where employee_id = new.employee_id
    and status in ('pending', 'approved')
    and request_date >= month_start and request_date <= month_end;

  if used >= 2 then
    raise exception 'You have already used your 2 permissions for this month. Please apply for Half-Day Leave instead.';
  end if;

  return new;
end;
$$;

create trigger trg_permission_requests_limit
  before insert on public.permission_requests
  for each row execute function public.enforce_permission_monthly_limit();

alter table public.permission_requests enable row level security;

create policy "permission_requests_read" on public.permission_requests for select using (
  employee_id = auth.uid()
  or approver_id = auth.uid()
  or public.is_admin()
);
create policy "permission_requests_insert" on public.permission_requests for insert with check (
  employee_id = auth.uid()
);
create policy "permission_requests_update" on public.permission_requests for update using (
  approver_id = auth.uid() or public.is_admin()
);
-- Employees may also reach (and, per the trigger below, only cancel) their own row.
create policy "permission_requests_cancel_own" on public.permission_requests for update using (
  employee_id = auth.uid()
);

-- Mirrors enforce_leave_cancellation: a self-service update may only flip a
-- still-pending request to 'cancelled', touching no other column. Once an
-- approver has decided, the employee can no longer edit the row through this
-- policy — only through approver_id/is_admin (the permission_requests_update
-- policy above), which this trigger doesn't gate.
create or replace function public.enforce_permission_cancellation()
returns trigger language plpgsql as $$
begin
  if auth.uid() = old.employee_id
     and not (auth.uid() = old.approver_id or public.is_admin())
  then
    if new.status is distinct from 'cancelled'
       or old.status <> 'pending'
       or new.request_date  is distinct from old.request_date
       or new.from_time     is distinct from old.from_time
       or new.to_time       is distinct from old.to_time
       or new.reason        is distinct from old.reason
       or new.employee_id   is distinct from old.employee_id
       or new.approver_id   is distinct from old.approver_id
    then
      raise exception 'You can only cancel your own pending permission request';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_permission_cancellation before update on public.permission_requests
  for each row execute function public.enforce_permission_cancellation();
