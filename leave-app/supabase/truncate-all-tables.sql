-- DESTRUCTIVE: wipes every row from every application table AND every
-- Supabase Auth account (including your own admin login).
-- Run only after confirming a backup exists (Database > Backups, or a
-- manual `supabase db dump`). Run in the Supabase SQL editor.
-- RESTART IDENTITY resets any auto-increment sequences; CASCADE follows FKs.
--
-- CONSEQUENCE: after this runs, NOBODY can log in, and the app's own
-- create-employee flow can no longer be used to recover (it requires an
-- existing admin row in public.employees to authorize the caller). You
-- must bootstrap a first admin via direct SQL afterward — see
-- create-employee-direct-sql.sql — before the app is usable again.

truncate table
  public.audit_log,
  public.leave_adjustments,
  public.leave_requests,
  public.comp_off_requests,
  public.attendance_regularizations,
  public.attendance_punches,
  public.attendance,
  public.timesheet_entries,
  public.timesheets,
  public.salary_details,
  public.jira_accounts,
  public.company_holidays,
  public.leave_types,
  public.approver_config,
  public.employees
restart identity cascade;

-- Removes all Auth accounts. Cascades to auth.identities/sessions/
-- refresh_tokens/etc via their own ON DELETE CASCADE definitions.
delete from auth.users;
