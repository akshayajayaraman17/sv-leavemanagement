-- ============================================================
-- APPROVER ADMIN FALLBACK — run in Supabase SQL Editor
-- ============================================================
-- Bug: get_approver() returned NULL whenever an employee had neither an
-- approver_config entry nor an active manager_id. enforce_approver_id()
-- then wrote approver_id = NULL on the request row — and every "pending
-- for me" query (Approvals tab, pending-count badge, notifications feed)
-- filters on approver_id = auth.uid(), so a NULL approver_id is invisible
-- to EVERYONE, including admins. The request just silently sat there
-- forever with no one able to see or act on it. This is why leave/
-- comp-off/timesheet/regularization approvals — regularizations
-- especially, since self-reported team leads/new hires are the most
-- likely to have no manager_id set yet — could go completely unnoticed.
--
-- Fix: get_approver() now falls back to the longest-serving active admin
-- when neither approver_config nor an active manager resolves one (and
-- never routes an admin's own request to themselves). Also backfills
-- approver_id on any existing pending request that was orphaned this way,
-- so anything already stuck becomes visible immediately after this runs.

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
    ),
    (
      select a.id
      from public.employees a
      where a.role = 'admin' and a.is_active = true and a.id <> emp_id
      order by a.created_at asc
      limit 1
    )
  );
$$;

-- Backfill: anything currently pending with no approver_id gets one now,
-- via the same function, so it stops being invisible.
update public.leave_requests
set approver_id = public.get_approver(employee_id)
where status = 'pending' and approver_id is null;

update public.comp_off_requests
set approver_id = public.get_approver(employee_id)
where status = 'pending' and approver_id is null;

update public.attendance_regularizations
set approver_id = public.get_approver(employee_id)
where status = 'pending' and approver_id is null;
