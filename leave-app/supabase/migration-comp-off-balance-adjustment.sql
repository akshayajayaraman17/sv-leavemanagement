-- ============================================================
-- COMP OFF: allow admin balance adjustment — run in Supabase SQL Editor
-- ============================================================
-- get_leave_balance() previously ignored leave_adjustments for the comp-off
-- type (its total was purely sum(earned_days) of approved comp-off
-- requests). The Admin Panel now lets an admin edit the comp-off "total"
-- directly, which is stored as a leave_adjustments row like every other
-- type. This makes the balance query fold that adjustment into comp-off
-- total and remaining, exactly as it already does for annual/medical.
--
-- leave_adjustments already exists, is admin-write-only, and is audited —
-- no new table, policy, or trigger.

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
  ),
  totals as (
    select
      lt.code, lt.label, lt.color, lt.bg_color,
      (case when lt.is_comp_off
              then (select days from comp_earned)
              else public.prorated_days((select joining_date from emp), lt.annual_days)
       end
       + coalesce((select adj_days from adj_per_type where type_code = lt.code), 0)) as total_days,
      coalesce((select used_days from used_per_type where leave_type = lt.code), 0) as used_days,
      lt.is_comp_off, lt.annual_days
    from public.leave_types lt
    where lt.is_active = true
  )
  select
    code, label, color, bg_color,
    total_days as total,
    used_days as used,
    greatest(0, total_days - used_days) as remaining
  from totals
  order by is_comp_off, annual_days desc;
$$;
