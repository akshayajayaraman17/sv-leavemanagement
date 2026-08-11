-- Run this INSTEAD of bulk-create-employees-direct-sql.sql if that script's
-- employee-creation part already succeeded (e.g. you hit a "duplicate key"
-- error on a re-run). This only sets manager_id and approver_config on the
-- employees that already exist — it does not create any auth/employee rows.
--
-- TEMPLATE — fill in your real employee_codes locally before running, then
-- revert this file back to placeholders (or discard the change) before
-- committing. Never commit real names or emails.

do $$
declare
  team_lead_id     uuid;
  primary_admin_id uuid;
  second_admin_id  uuid;
  batch_codes text[] := array[
    'EMP-003','EMP-004'  -- ← replace with your real batch of employee_codes
  ];
begin
  select id into team_lead_id     from public.employees where employee_code = 'EMP-002';
  select id into primary_admin_id from public.employees where employee_code = 'EMP-001';
  select id into second_admin_id  from public.employees where employee_code = 'EMP-005';

  if team_lead_id is null or primary_admin_id is null or second_admin_id is null then
    raise exception 'Missing one of the expected employee_codes — check they exist first';
  end if;

  -- Manager: everyone in the batch except the two admins reports to the team lead
  update public.employees
  set manager_id = team_lead_id
  where employee_code = any(batch_codes);

  -- Approvers: batch employees get [team lead, primary admin]
  insert into public.approver_config (employee_id, approver_id, priority)
  select e.id, team_lead_id, 1 from public.employees e where e.employee_code = any(batch_codes)
  on conflict (employee_id, approver_id) do nothing;

  insert into public.approver_config (employee_id, approver_id, priority)
  select e.id, primary_admin_id, 2 from public.employees e where e.employee_code = any(batch_codes)
  on conflict (employee_id, approver_id) do nothing;

  -- Team lead's and primary admin's own approver is the second admin
  insert into public.approver_config (employee_id, approver_id, priority) values
    (team_lead_id, second_admin_id, 1),
    (primary_admin_id, second_admin_id, 1)
  on conflict (employee_id, approver_id) do nothing;
end $$;
