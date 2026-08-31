-- ============================================================
-- PROBATION + TENURE-TIERED LEAVE ENTITLEMENT — run in Supabase SQL Editor
-- ============================================================
-- Actual company policy — none of this was reflected anywhere before:
--   Annual Leave:  16 days (<2yr service), 18 days (2–5yr), 20 days (5yr+)
--   Medical Leave (this app's "sick" leave type): 14 / 18 / 22 days on
--   the same tiers.
--   Casual Leave: no tier specified in the policy — keeps whatever's
--   configured in leave_types.annual_days, but is still subject to
--   probation below (leave benefits of every kind wait for probation).
--   Probation: 6 months from joining_date. No leave accrues until
--   probation ends; the first year's entitlement after that is
--   pro-rated from the probation-end date rather than the joining date.
--   Comp-off is untouched — it's earned per holiday worked, not an
--   annual accrual, so probation doesn't apply to it.
--
-- This changes the current-year "total" shown for every existing
-- employee the moment it's run — e.g. someone with 3 years' service
-- previously saw 20 annual days (flat), now sees 18 (tiered).

-- Tenure-tiered base days for annual/medical(sick); every other leave
-- type keeps whatever's configured in leave_types.annual_days.
create or replace function public.tiered_annual_days(joining date, lt_code text, base_days int)
returns int language sql immutable as $$
  select case
    when lt_code = 'annual' then
      case
        when age(current_date, joining) < interval '2 years' then 16
        when age(current_date, joining) < interval '5 years' then 18
        else 20
      end
    when lt_code = 'sick' then
      case
        when age(current_date, joining) < interval '2 years' then 14
        when age(current_date, joining) < interval '5 years' then 18
        else 22
      end
    else base_days
  end;
$$;

-- Pro-rates off the probation-end date (joining + 6 months) instead of
-- the joining date, and returns 0 outright while still on probation.
create or replace function public.prorated_days(joining date, annual_days int)
returns int language sql immutable as $$
  select case
    when current_date < (joining + interval '6 months')::date then 0
    when extract(year from (joining + interval '6 months')::date) = extract(year from current_date) then
      round(
        ((date_trunc('year', (joining + interval '6 months')::date) + interval '1 year - 1 day')::date
          - (joining + interval '6 months')::date + 1)::numeric
        / (extract(doy from (date_trunc('year', (joining + interval '6 months')::date) + interval '1 year - 1 day')))
        * annual_days
      )::int
    else annual_days
  end;
$$;

-- get_leave_balance now runs the tenure-tiered base through the
-- probation-aware proration for every non-comp-off leave type.
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
         else public.prorated_days(
                (select joining_date from emp),
                public.tiered_annual_days((select joining_date from emp), lt.code, lt.annual_days)
              )
              + coalesce((select adj_days from adj_per_type where type_code = lt.code), 0)
    end as total,
    coalesce((select used_days from used_per_type where leave_type = lt.code), 0) as used,
    greatest(0,
      case when lt.is_comp_off then (select days from comp_earned)
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
