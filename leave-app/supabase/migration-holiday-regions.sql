-- ============================================================
-- MULTI-REGION HOLIDAYS — run in Supabase SQL Editor
-- ============================================================
-- Adds a region to employees (admin-managed, like department/designation)
-- and a region to company_holidays, so the Admin Holidays screen can
-- manage separate regional holiday calendars (e.g. India / United States /
-- United Kingdom) instead of one single global list.
--
-- Scope: this only changes holiday *management* (Admin Holidays screen —
-- add/filter/count by region, copy-last-year, bulk-upload-by-region).
-- Working-day math (Apply Leave), comp-off eligibility, the Dashboard
-- "this month" widget, and Team Calendar holiday highlighting are
-- unchanged — they keep reading the full, unfiltered holiday list via
-- fetchHolidays() exactly as before this migration.
--
-- Existing holidays get region='All' so they keep showing up under every
-- region filter (no holiday silently disappears because of this migration).

alter table public.employees add column if not exists location text;

alter table public.company_holidays add column if not exists region text not null default 'All';

-- A holiday date was globally unique; now a date can repeat once per
-- region (e.g. two different countries each having their own holiday
-- falling on the same calendar date).
alter table public.company_holidays drop constraint if exists company_holidays_holiday_date_key;
alter table public.company_holidays add constraint company_holidays_date_region_key unique (holiday_date, region);

-- employees.location is admin-managed, same as department/designation —
-- add it to the self-update trigger's guarded-field list so employees
-- can't silently set their own region. This re-creates the whole
-- function (same pattern as migration-birthdays.sql) since Postgres has
-- no ALTER FUNCTION for a function body.
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
       or new.location        is distinct from old.location
    then
      raise exception 'You can only update your own phone, address, date of birth, and password-change status';
    end if;
  end if;
  return new;
end;
$$;
