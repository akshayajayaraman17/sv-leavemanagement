-- ============================================================
-- EMPLOYEE BIRTHDAYS — run in Supabase SQL Editor
-- ============================================================
-- Adds date_of_birth so the dashboard can surface upcoming coworker
-- birthdays. Self-service editable the same way phone/address already
-- are — enforce_employee_self_update() only blocks a fixed column list
-- (employee_code, full_name, email, department, designation, role,
-- joining_date, manager_id, is_active), so date_of_birth is already
-- permitted through that trigger once the column exists. Re-created here
-- only to keep the exception message accurate.

alter table public.employees add column if not exists date_of_birth date;

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
      raise exception 'You can only update your own phone, address, date of birth, and password-change status';
    end if;
  end if;
  return new;
end;
$$;
