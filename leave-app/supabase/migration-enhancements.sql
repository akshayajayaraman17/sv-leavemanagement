-- ============================================================
-- TEAM CALENDAR + AUDIT TRAIL — run in Supabase SQL Editor
-- ============================================================

-- ── Team calendar ────────────────────────────────────────────────────────
-- leave_requests RLS intentionally only lets an employee see their own
-- requests (plus their approver/admin) — reason, reject_reason, and the
-- medical certificate link are private. A team calendar still needs
-- everyone to see *who is out and when* for approved leave, without
-- loosening that policy. This function is deliberately narrow: it runs
-- with elevated privileges (security definer) but only ever returns
-- employee_id/name/leave_type/dates for status = 'approved' — reason and
-- certificate columns are never selected, so there is no path for this
-- function to leak them regardless of caller.
create or replace function public.get_team_calendar(p_from date, p_to date)
returns table (
  employee_id     uuid,
  full_name       text,
  avatar_initials text,
  leave_type      text,
  from_date       date,
  to_date         date
) language sql stable security definer
set search_path = public
as $$
  select
    lr.employee_id,
    e.full_name,
    e.avatar_initials,
    lr.leave_type,
    lr.from_date,
    lr.to_date
  from public.leave_requests lr
  join public.employees e on e.id = lr.employee_id
  where lr.status = 'approved'
    and lr.from_date <= p_to
    and lr.to_date   >= p_from;
$$;

revoke all on function public.get_team_calendar(date, date) from public;
grant execute on function public.get_team_calendar(date, date) to authenticated;

-- ── Audit trail ──────────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id          uuid primary key default uuid_generate_v4(),
  actor_id    uuid references public.employees(id),
  action      text not null,          -- e.g. 'salary_update', 'leave_adjustment', 'role_change'
  table_name  text not null,
  record_id   uuid,
  old_values  jsonb,
  new_values  jsonb,
  created_at  timestamptz not null default now()
);

alter table public.audit_log enable row level security;

drop policy if exists "audit_log_admin_read" on public.audit_log;
create policy "audit_log_admin_read" on public.audit_log for select using (public.is_admin());
-- No insert/update/delete policy for regular roles — rows are only ever
-- written by the trigger functions below (SECURITY DEFINER), never
-- directly by client code.

create or replace function public.log_salary_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, action, table_name, record_id, old_values, new_values)
  values (
    auth.uid(), 'salary_change', 'salary_details', coalesce(new.id, old.id),
    case when tg_op = 'DELETE' then to_jsonb(old) else (case when tg_op = 'UPDATE' then to_jsonb(old) else null end) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_salary on public.salary_details;
create trigger trg_audit_salary
  after insert or update or delete on public.salary_details
  for each row execute function public.log_salary_change();

create or replace function public.log_leave_adjustment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, action, table_name, record_id, old_values, new_values)
  values (
    auth.uid(), 'leave_adjustment', 'leave_adjustments', coalesce(new.id, old.id),
    case when tg_op = 'DELETE' then to_jsonb(old) else (case when tg_op = 'UPDATE' then to_jsonb(old) else null end) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_leave_adjustments on public.leave_adjustments;
create trigger trg_audit_leave_adjustments
  after insert or update or delete on public.leave_adjustments
  for each row execute function public.log_leave_adjustment();

-- Role changes on employees — only log when `role` actually changes, not
-- every profile edit.
create or replace function public.log_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    insert into public.audit_log (actor_id, action, table_name, record_id, old_values, new_values)
    values (
      auth.uid(), 'role_change', 'employees', new.id,
      jsonb_build_object('role', old.role),
      jsonb_build_object('role', new.role)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_role_change on public.employees;
create trigger trg_audit_role_change
  after update on public.employees
  for each row execute function public.log_role_change();
