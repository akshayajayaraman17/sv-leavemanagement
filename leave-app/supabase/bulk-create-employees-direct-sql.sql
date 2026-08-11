-- UNSUPPORTED PATH: writes directly to Supabase's auth schema, bypassing
-- the GoTrue Auth admin API and every validation the app's Bulk Add
-- Employees screen does (duplicate email/employee_code checks, format
-- checks). Prefer that UI when possible. Run only after a confirmed backup.
--
-- TEMPLATE — this file is a pattern, not a ready-to-run roster. Fill in
-- your real employee data locally before running, then revert this file
-- back to placeholders (or discard the change) before committing. Never
-- commit real names, emails, dates of birth, or passwords.
--
-- PATTERN:
--   1. A "team lead" row is created first, so their id exists before other
--      rows reference it as manager_id.
--   2. A "primary admin" row is expected to already exist (created via
--      create-employee-direct-sql.sql) and is looked up by employee_code.
--   3. The roster loop creates the rest of the batch, assigning the team
--      lead as manager_id and approver_config = [team lead (1st), primary
--      admin (2nd)] to everyone except the team lead and primary admin
--      themselves.
--   4. The last roster row is treated as a second admin whose own approver
--      is set to nothing by default — adjust as needed — and who becomes
--      the team lead's and primary admin's own approver.

create extension if not exists pgcrypto;

do $$
declare
  shared_password text := 'REPLACE_WITH_STRONG_PASSWORD'; -- ← replace before running, never commit a real password
  team_lead_id uuid := gen_random_uuid();
  primary_admin_id uuid;
  second_admin_id uuid;
  emp record;
  new_user_id uuid;
begin
  select id into primary_admin_id from public.employees where employee_code = 'EMP-001';
  if primary_admin_id is null then
    raise exception 'Primary admin (EMP-001) not found — run create-employee-direct-sql.sql first';
  end if;

  -- Team lead first, so their id exists before others reference it as manager_id
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    team_lead_id, 'authenticated', 'authenticated',
    'team.lead@yourcompany.com', crypt(shared_password, gen_salt('bf')),  -- ← replace before running
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}',
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), team_lead_id, team_lead_id::text,
    jsonb_build_object('sub', team_lead_id::text, 'email', 'team.lead@yourcompany.com'),
    'email', now(), now(), now()
  );
  insert into public.employees (
    id, email, full_name, employee_code,
    department, designation, role, joining_date, date_of_birth, must_change_password
  ) values (
    team_lead_id, 'team.lead@yourcompany.com', 'Team Lead Name', 'EMP-002',  -- ← replace before running
    'Engineering', 'Team Lead', 'admin', current_date, null, true
  );
  -- The team lead's own approver (second admin) is inserted at the end, once second_admin_id is known

  for emp in
    select * from (values
      -- ← replace with your real roster before running; employee_code
      -- order should follow joining_date. has_manager = true assigns the
      -- team lead as manager_id and the standard approver pair.
      ('EMP-003', 'Employee One', 'employee.one@yourcompany.com', 'Engineering', 'Software Engineer', 'employee', current_date::date, null::date, true),
      ('EMP-004', 'Employee Two', 'employee.two@yourcompany.com', 'Engineering', 'Software Engineer', 'employee', current_date::date, null::date, true),
      ('EMP-005', 'Second Admin Name', 'second.admin@yourcompany.com', 'HR & Admin', 'HR Admin', 'admin', current_date::date, null::date, false)
    ) as t(employee_code, full_name, email, department, designation, role, joining_date, date_of_birth, has_manager)
  loop
    new_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change,
      email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      new_user_id, 'authenticated', 'authenticated',
      emp.email, crypt(shared_password, gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}', '{}',
      '', '', '', '', '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), new_user_id, new_user_id::text,
      jsonb_build_object('sub', new_user_id::text, 'email', emp.email),
      'email', now(), now(), now()
    );

    insert into public.employees (
      id, email, full_name, employee_code,
      department, designation, role, joining_date, date_of_birth, manager_id, must_change_password
    ) values (
      new_user_id, emp.email, emp.full_name, emp.employee_code,
      emp.department, emp.designation, emp.role, emp.joining_date, emp.date_of_birth,
      case when emp.has_manager then team_lead_id else null end,
      true
    );

    -- has_manager doubles as "gets the standard approver pair" (true for everyone except the last/second admin row)
    if emp.has_manager then
      insert into public.approver_config (employee_id, approver_id, priority) values
        (new_user_id, team_lead_id, 1),
        (new_user_id, primary_admin_id, 2);
    end if;

    if emp.employee_code = 'EMP-005' then  -- ← match your last/second-admin row's code
      second_admin_id := new_user_id;
    end if;
  end loop;

  -- Team lead's and primary admin's own approver is the second admin
  insert into public.approver_config (employee_id, approver_id, priority) values
    (team_lead_id, second_admin_id, 1),
    (primary_admin_id, second_admin_id, 1);
end $$;
