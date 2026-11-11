-- ============================================================
-- COMP OFF: ALLOW CLAIMS UNDER 8 HOURS — run in Supabase SQL Editor
-- ============================================================
-- Drops the ">= 8 hours" requirement from the comp-off eligibility
-- trigger. Employees can now request comp off for any weekend/holiday
-- day with a valid check-in and check-out; the approver sees the logged
-- hours and decides. All other checks are unchanged.

create or replace function public.enforce_comp_off_eligibility()
returns trigger language plpgsql as $$
declare
  att        public.attendance%rowtype;
  is_weekend boolean;
  is_holiday boolean;
begin
  if public.is_admin() then
    return new;
  end if;

  new.status := 'pending';
  new.decided_on := null;

  if new.worked_date >= current_date then
    raise exception 'Comp off can only be claimed for a day that has already passed';
  end if;

  is_weekend := extract(dow from new.worked_date) in (0, 6);
  is_holiday := exists (
    select 1 from public.company_holidays where holiday_date = new.worked_date
  );
  if not (is_weekend or is_holiday) then
    raise exception 'Comp off requires a weekend or company holiday — % is a weekday', new.worked_date;
  end if;

  if exists (
    select 1 from public.comp_off_requests
    where employee_id = new.employee_id
      and worked_date = new.worked_date
      and status <> 'rejected'
  ) then
    raise exception 'A comp off request for % already exists', new.worked_date;
  end if;

  select * into att
  from public.attendance
  where employee_id = new.employee_id and date = new.worked_date;

  if not found or att.check_in_time is null then
    raise exception 'No check-in record found for %', new.worked_date;
  end if;
  if att.check_out_time is null then
    raise exception 'No check-out record for % — both check-in and check-out are required', new.worked_date;
  end if;
  if coalesce(att.total_hours, 0) <= 0 then
    raise exception 'No hours logged on %', new.worked_date;
  end if;

  new.worked_hours := att.total_hours;
  new.earned_days := 1;

  return new;
end;
$$;
