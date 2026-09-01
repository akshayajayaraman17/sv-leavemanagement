-- ============================================================
-- EMPLOYEE CODES BY JOINING DATE — run in Supabase SQL Editor
-- ============================================================
-- Codes stay in the EMP-NNN shape, but the number is assigned by joining
-- date across the whole roster: earliest joiner is EMP-001, next EMP-002,
-- and so on. Ties are broken by created_at, then full_name.
--
-- Safe to run: nothing references an employee by code — every foreign key
-- uses employees.id (a UUID). Payslips read the code at print time, and
-- the only employee audit trigger records role changes, so renumbering
-- adds no audit noise. The self-update guard only restricts non-admins.
--
-- renumber_employee_codes() is exposed so the app can re-run this whenever
-- a hire is added or an existing joining_date is edited, keeping codes in
-- join-date order automatically.

create or replace function public.renumber_employee_codes()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can renumber employee codes';
  end if;

  -- employee_code is UNIQUE and non-deferrable, so a straight permutation
  -- could trip the constraint mid-statement. Park every code in a
  -- collision-free temp namespace first, then assign the final codes.
  update public.employees set employee_code = 'TMP-' || id::text;

  with ranked as (
    select id,
           'EMP-' || lpad(
             row_number() over (
               order by joining_date asc nulls last, created_at asc, full_name asc
             )::text, 3, '0') as new_code
    from public.employees
  )
  update public.employees e
  set employee_code = r.new_code
  from ranked r
  where e.id = r.id;
end;
$$;

revoke all on function public.renumber_employee_codes() from public, anon;
grant execute on function public.renumber_employee_codes() to authenticated;

-- ── One-off: renumber the current roster now ────────────────────────────
-- Runs as the SQL-editor role, which is not an app admin and so can't call
-- the guarded function — do the same work inline here.
update public.employees set employee_code = 'TMP-' || id::text;

with ranked as (
  select id,
         'EMP-' || lpad(
           row_number() over (
             order by joining_date asc nulls last, created_at asc, full_name asc
           )::text, 3, '0') as new_code
  from public.employees
)
update public.employees e
set employee_code = r.new_code
from ranked r
where e.id = r.id;
