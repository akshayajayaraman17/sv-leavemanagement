-- ============================================================
-- EMPLOYEE SELF-SERVICE PROFILE + FORCED PASSWORD CHANGE
-- run in Supabase SQL Editor
-- ============================================================
-- Two bugs fixed here, both prerequisites for forcing a password change
-- on first login:
--   1. employees has no `address` column, but Profile.jsx has always
--      tried to save one — that save has been silently failing.
--   2. employees has no self-update RLS policy at all, so an employee
--      could never update their own phone/address either — the same
--      "Save Changes" button has been failing since it shipped.
--
-- must_change_password: set true whenever an admin creates an employee
-- (single-add or bulk-add) with a password the admin knows/chose —
-- cleared automatically once the employee sets their own password.

alter table public.employees add column if not exists address text;
alter table public.employees add column if not exists must_change_password boolean not null default false;

drop policy if exists "employees_update_own" on public.employees;
create policy "employees_update_own" on public.employees for update using (
  id = auth.uid()
);

-- A bare "id = auth.uid()" policy would let an employee push ANY change
-- to their own row (including role, employee_code, is_active) since RLS
-- has no column-level granularity on its own. This trigger restricts a
-- non-admin self-update to exactly the fields Profile.jsx and the forced
-- password-change flow actually need to touch.
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
    then
      raise exception 'You can only update your own phone, address, and password-change status';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_employee_self_update on public.employees;
create trigger trg_enforce_employee_self_update before update on public.employees
  for each row execute function public.enforce_employee_self_update();
