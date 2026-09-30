-- ============================================================
-- LOSS OF PAY (LOP) LEAVE TYPE — run in Supabase SQL Editor
-- ============================================================
-- Policy: employees on probation (see migration-probation-tiered-leave.sql
-- — first 6 months from joining_date) accrue no Annual/Medical/Casual
-- leave, so any time off they take in that window should go through as
-- unpaid Loss of Pay rather than being blocked outright by the
-- 0-remaining-balance check in ApplyLeave.jsx.
--
-- This adds a new selectable leave type, 'lop', that behaves like
-- Comp Off in one respect (exempt from tenure-tiering/probation
-- proration) but is a flat allowance rather than an earned balance —
-- fixed at 365 "days" so it's never balance-blocked in practice.
-- Approving an lop request is a signal to run it as unpaid in payroll;
-- this app has no payroll integration, so that step stays manual.

insert into public.leave_types (code, label, annual_days, color, bg_color, is_comp_off, is_active)
values ('lop', 'Loss of Pay', 365, '#B23B3B', '#FBE9E9', false, true)
on conflict (code) do nothing;

-- get_leave_balance: 'lop' now takes a third path alongside comp-off
-- (earned-based) and the tiered/prorated path (annual/sick/casual) —
-- a flat total straight from leave_types.annual_days, unaffected by
-- tenure or probation.
create or replace function public.get_leave_balance(emp_id uuid)
returns table (
  type_code   text,
  label       text,
  color       text,
  bg_color    text,
  total       numeric,
  used        numeric,
  remaining   numeric
) language sql stable as $$
  with emp as (select * from public.employees where id = emp_id),
  comp_earned as (
    select coalesce(sum(earned_days),0) as days
    from public.comp_off_requests
    where employee_id = emp_id and status = 'approved'
  ),
  used_per_type as (
    select leave_type, coalesce(sum(days),0) as used_days
    from public.leave_requests
    where employee_id = emp_id
      and status = 'approved'
      and extract(year from from_date) = extract(year from current_date)
    group by leave_type
  ),
  adj_per_type as (
    select type_code, coalesce(sum(adjustment),0) as adj_days
    from public.leave_adjustments
    where employee_id = emp_id
    group by type_code
  )
  select
    lt.code,
    lt.label,
    lt.color,
    lt.bg_color,
    case when lt.is_comp_off then (select days from comp_earned)
         when lt.code = 'lop' then lt.annual_days
                                    + coalesce((select adj_days from adj_per_type where type_code = lt.code), 0)
         else public.prorated_days(
                (select joining_date from emp),
                public.tiered_annual_days((select joining_date from emp), lt.code, lt.annual_days)
              )
              + coalesce((select adj_days from adj_per_type where type_code = lt.code), 0)
    end as total,
    coalesce((select used_days from used_per_type where leave_type = lt.code), 0) as used,
    greatest(0,
      case when lt.is_comp_off then (select days from comp_earned)
           when lt.code = 'lop' then lt.annual_days
                                      + coalesce((select adj_days from adj_per_type where type_code = lt.code), 0)
           else public.prorated_days(
                  (select joining_date from emp),
                  public.tiered_annual_days((select joining_date from emp), lt.code, lt.annual_days)
                )
                + coalesce((select adj_days from adj_per_type where type_code = lt.code), 0)
      end
      - coalesce((select used_days from used_per_type where leave_type = lt.code), 0)
    ) as remaining
  from public.leave_types lt
  where lt.is_active = true
  order by lt.is_comp_off, lt.annual_days desc;
$$;
