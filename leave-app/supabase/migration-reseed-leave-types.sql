-- ============================================================
-- RESEED LEAVE TYPES — run in Supabase SQL Editor
-- ============================================================
-- leave_types is empty in production right now (confirmed by direct
-- query) — this breaks Apply Leave's type dropdown, Admin Panel's leave
-- override / Add Leave Record dropdowns, and every employee's leave
-- balance calculation, since get_leave_balance() joins against this
-- table. schema.sql seeds it once at initial setup; it looks like this
-- database was re-initialized after the earlier outage without that
-- step running.
--
-- "sick" is relabeled "Medical Leave" here to match the company's
-- actual policy wording. Note annual_days below is now only a
-- legacy/sort-order value for "annual" and "sick" — their real 16/18/20
-- and 14/18/22-day tenure tiers are computed by tiered_annual_days() in
-- migration-probation-tiered-leave.sql regardless of what's stored here.
--
-- No "Casual Leave" — the company's policy only defines Annual and
-- Medical leave, so it's deactivated rather than seeded (covers both a
-- database with no leave_types rows at all, and one where an older
-- schema.sql run already created it).

insert into public.leave_types (code, label, annual_days, color, bg_color, is_comp_off) values
  ('annual', 'Annual Leave',  20, '#1D9E75', '#E1F5EE', false),
  ('sick',   'Medical Leave', 10, '#378ADD', '#E6F1FB', false),
  ('comp',   'Comp Off',      0,  '#7F77DD', '#EEEDFE', true)
on conflict (code) do update set
  label       = excluded.label,
  annual_days = excluded.annual_days,
  color       = excluded.color,
  bg_color    = excluded.bg_color,
  is_comp_off = excluded.is_comp_off;

update public.leave_types set is_active = false where code = 'casual';
