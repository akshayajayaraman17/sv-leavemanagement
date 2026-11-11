-- ============================================================
-- MOVE OPEN REQUESTS TO THE NEW APPROVER — run in Supabase SQL Editor
-- ============================================================
-- approver_id is stamped on a request when it is created and never
-- recomputed. So when an admin changed someone's approver (approver_config),
-- changed their manager, or deactivated an approver, everything already
-- pending stayed with the old approver.
--
-- This adds reassign_pending_approvals(emp_id), which re-runs
-- get_approver() for that employee and moves every still-open request to
-- the result, plus triggers that call it whenever the inputs to
-- get_approver() change:
--   * approver_config insert / update / delete for that employee,
--   * employees.manager_id change for that employee,
--   * employees.is_active change for an approver (deactivating someone
--     moves their queue on; reactivating them pulls it back to them if
--     they are still configured as someone's approver / manager).
--
-- "Open" means: leave / comp off / permission / regularization in
-- 'pending', and timesheets in 'draft' or 'submitted'. Decided requests
-- keep their original approver as history.
--
-- Also does a one-time backfill at the bottom so anything already stuck
-- with a stale approver moves now.

create or replace function public.reassign_pending_approvals(emp_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  new_approver uuid := public.get_approver(emp_id);
begin
  if new_approver is null then
    return;
  end if;

  update public.leave_requests
     set approver_id = new_approver
   where employee_id = emp_id and status = 'pending'
     and approver_id is distinct from new_approver;

  update public.comp_off_requests
     set approver_id = new_approver
   where employee_id = emp_id and status = 'pending'
     and approver_id is distinct from new_approver;

  update public.permission_requests
     set approver_id = new_approver
   where employee_id = emp_id and status = 'pending'
     and approver_id is distinct from new_approver;

  update public.attendance_regularizations
     set approver_id = new_approver
   where employee_id = emp_id and status = 'pending'
     and approver_id is distinct from new_approver;

  update public.timesheets
     set approver_id = new_approver
   where employee_id = emp_id and status in ('draft', 'submitted')
     and approver_id is distinct from new_approver;
end;
$$;

revoke all on function public.reassign_pending_approvals(uuid) from public, anon, authenticated;

-- ── approver_config changes ─────────────────────────────────────────────
create or replace function public.trg_approver_config_reassign()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.reassign_pending_approvals(old.employee_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.employee_id <> old.employee_id) then
    perform public.reassign_pending_approvals(new.employee_id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_approver_config_reassign on public.approver_config;
create trigger trg_approver_config_reassign
  after insert or update or delete on public.approver_config
  for each row execute function public.trg_approver_config_reassign();

-- ── employees: manager change / approver (de)activation ─────────────────
create or replace function public.trg_employee_reassign()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  emp uuid;
begin
  if new.manager_id is distinct from old.manager_id then
    perform public.reassign_pending_approvals(new.id);
  end if;

  if new.is_active is distinct from old.is_active then
    -- Everyone whose approver might be this person: configured approvees,
    -- direct reports, and anyone with an open request currently sitting
    -- with them (covers the admin fallback).
    for emp in
      select employee_id from public.approver_config where approver_id = new.id
      union
      select id from public.employees where manager_id = new.id
      union select employee_id from public.leave_requests            where approver_id = new.id and status = 'pending'
      union select employee_id from public.comp_off_requests         where approver_id = new.id and status = 'pending'
      union select employee_id from public.permission_requests       where approver_id = new.id and status = 'pending'
      union select employee_id from public.attendance_regularizations where approver_id = new.id and status = 'pending'
      union select employee_id from public.timesheets                where approver_id = new.id and status in ('draft', 'submitted')
    loop
      perform public.reassign_pending_approvals(emp);
    end loop;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_employee_reassign on public.employees;
create trigger trg_employee_reassign
  after update of manager_id, is_active on public.employees
  for each row execute function public.trg_employee_reassign();

-- ── One-time backfill ───────────────────────────────────────────────────
do $$
declare
  emp uuid;
begin
  for emp in select id from public.employees loop
    perform public.reassign_pending_approvals(emp);
  end loop;
end;
$$;
