-- ============================================================
-- ADMIN: ADD LEAVE RECORD MANUALLY — run in Supabase SQL Editor
-- ============================================================
-- leave_requests_insert previously only allowed employee_id = auth.uid()
-- — an admin could not insert a leave record on an employee's behalf at
-- all (RLS rejected it outright), only adjust their day-count
-- entitlement via leave_adjustments. This lets an admin record an
-- actual leave (backdating, regularizing a forgotten request, etc.),
-- inserted pre-approved from the client — approver_id is still computed
-- server-side by the existing trg_leave_requests_approver trigger
-- regardless of who inserts the row, and the overlap constraint from
-- migration-indexes-and-constraints.sql still applies.

drop policy if exists "leave_requests_insert" on public.leave_requests;
create policy "leave_requests_insert" on public.leave_requests for insert with check (
  employee_id = auth.uid() or public.is_admin()
);
