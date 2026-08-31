-- ============================================================
-- EMPLOYEE OFFBOARDING — run in Supabase SQL Editor
-- ============================================================
-- 1. exit_date / exit_reason on employees — record-keeping for when
--    someone leaves and why.
-- 2. Closes a real access-control gap: "Deactivate" has only ever set
--    employees.is_active = false. That column is never checked by
--    Supabase Auth or by any RLS policy, so a deactivated employee could
--    still sign in and use the app — the "Inactive" badge was cosmetic.
--    Actual access revocation (banning the Supabase Auth user) now
--    happens in the offboard-employee Edge Function via the service_role
--    key, mirroring how create-employee is the only place allowed to
--    touch auth users. This migration just adds the columns and extends
--    the self-update guard from migration-self-service-profile.sql so an
--    employee can't set their own exit_date/exit_reason.

alter table public.employees add column if not exists exit_date   date;
alter table public.employees add column if not exists exit_reason text;

create or replace function public.enforce_employee_self_update()
returns trigger language plpgsql as $$
begin
  if auth.uid() = old.id and not public.is_admin() then
    if new.employee_code is distinct from old.employee_code
       or new.full_name     is distinct from old.full_name
       or new.email          is distinct from old.email
       or new.department     is distinct from old.department
       or new.designation    is distinct from old.designation
       or new.role            is distinct from old.role
       or new.joining_date    is distinct from old.joining_date
       or new.manager_id      is distinct from old.manager_id
       or new.is_active       is distinct from old.is_active
       or new.exit_date       is distinct from old.exit_date
       or new.exit_reason     is distinct from old.exit_reason
    then
      raise exception 'You can only update your own phone, address, and password-change status';
    end if;
  end if;
  return new;
end;
$$;
