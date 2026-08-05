-- ============================================================
-- SELF-SERVICE LEAVE CANCELLATION — run in Supabase SQL Editor
-- ============================================================
-- leave_requests.status already allows 'cancelled', but nothing ever set
-- it — an employee had no way to withdraw a request they no longer
-- needed. This lets an employee cancel their own pending request, or an
-- approved request that hasn't started yet. A trigger (not just RLS)
-- enforces the exact allowed transition, so a client update can't sneak
-- other field changes through alongside the cancellation.

drop policy if exists "leave_requests_cancel_own" on public.leave_requests;
create policy "leave_requests_cancel_own" on public.leave_requests for update using (
  employee_id = auth.uid()
);

create or replace function public.enforce_leave_cancellation()
returns trigger language plpgsql as $$
begin
  -- Only constrain self-service edits — the employee acting on their own
  -- request without being its approver/admin. Approver/admin updates
  -- (approve/reject) are untouched.
  if auth.uid() = old.employee_id
     and not (auth.uid() = old.approver_id or public.is_admin())
  then
    if new.status is distinct from 'cancelled'
       or old.status not in ('pending', 'approved')
       or (old.status = 'approved' and old.from_date < current_date)
       or new.leave_type   is distinct from old.leave_type
       or new.from_date    is distinct from old.from_date
       or new.to_date      is distinct from old.to_date
       or new.days         is distinct from old.days
       or new.reason       is distinct from old.reason
       or new.employee_id  is distinct from old.employee_id
       or new.approver_id  is distinct from old.approver_id
    then
      raise exception 'You can only cancel your own pending, or not-yet-started approved, leave requests';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_leave_cancellation on public.leave_requests;
create trigger trg_enforce_leave_cancellation before update on public.leave_requests
  for each row execute function public.enforce_leave_cancellation();
