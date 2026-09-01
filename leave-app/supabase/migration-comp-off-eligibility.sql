-- ============================================================
-- COMP OFF: SERVER-SIDE ELIGIBILITY ENFORCEMENT — run in Supabase SQL Editor
-- ============================================================
-- ApplyCompOff (the employee-facing form) already blocks ineligible
-- requests client-side: the worked date must be in the past, must fall on
-- a weekend or company holiday, must have an attendance row with both a
-- check-in and a check-out totalling >= 8 hours, and must not duplicate a
-- comp-off request already lodged for that date. None of that was enforced
-- in the database, so a crafted request straight to PostgREST could mint
-- comp-off balance for any date with any hours.
--
-- This adds that enforcement as a BEFORE INSERT trigger. For a normal
-- employee insert it:
--   * pins status to 'pending' and clears decided_on (no self-approval),
--   * requires worked_date < current_date,
--   * requires worked_date to be a Saturday/Sunday or a company holiday,
--   * requires a completed attendance record (check-in + check-out,
--     total_hours >= 8) for that employee on that date,
--   * rejects a second request for a date that already has a
--     pending/approved one,
--   * overwrites worked_hours and earned_days with the trusted values
--     derived from attendance (hours from the record, 1 earned day).
--
-- Admin inserts (public.is_admin()) are skipped entirely — the Admin
-- Panel "Credit comp off" flow backdates and hand-enters hours on
-- purpose, and approver_id is still set server-side by the existing
-- trg_comp_off_requests_approver trigger regardless of who inserts.
--
-- The RLS change mirrors migration-admin-add-leave.sql: comp_insert only
-- allowed employee_id = auth.uid(), which blocked an admin from crediting
-- comp off to anyone but themselves. It now also allows public.is_admin().

-- 1. Let admins insert comp-off rows on another employee's behalf.
drop policy if exists "comp_insert" on public.comp_off_requests;
create policy "comp_insert" on public.comp_off_requests for insert with check (
  employee_id = auth.uid() or public.is_admin()
);

-- 2. Eligibility trigger for the non-admin path.
create or replace function public.enforce_comp_off_eligibility()
returns trigger language plpgsql as $$
declare
  att        public.attendance%rowtype;
  is_weekend boolean;
  is_holiday boolean;
begin
  -- Admins credit comp off manually (backdated, hand-entered hours) — leave
  -- those untouched, same as the approver-id trigger does.
  if public.is_admin() then
    return new;
  end if;

  -- Never trust a client-supplied approval.
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
  if coalesce(att.total_hours, 0) < 8 then
    raise exception 'Only %h logged on % — a minimum of 8 hours is required',
      round(coalesce(att.total_hours, 0)::numeric, 1), new.worked_date;
  end if;

  -- Trust the attendance record, not the client, for what was earned.
  new.worked_hours := att.total_hours;
  new.earned_days := 1;

  return new;
end;
$$;

drop trigger if exists trg_comp_off_requests_eligibility on public.comp_off_requests;
create trigger trg_comp_off_requests_eligibility
  before insert on public.comp_off_requests
  for each row execute function public.enforce_comp_off_eligibility();
