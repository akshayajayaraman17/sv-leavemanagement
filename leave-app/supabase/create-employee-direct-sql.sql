-- BOOTSTRAP ADMIN — run this immediately after truncate-all-tables.sql,
-- before anything else. Without at least one admin row in public.employees,
-- nobody can log in or use the app's create-employee flow to add anyone else.
-- UNSUPPORTED PATH: writes directly to Supabase's auth schema, bypassing
-- the GoTrue Auth admin API. Run in the Supabase SQL editor.
--
-- FILL IN BEFORE RUNNING — this file is a template. Replace the
-- placeholders below with real values locally, run it, then revert them
-- back to placeholders (or discard the change) before committing. Never
-- commit a real email, name, DOB, or password.

create extension if not exists pgcrypto;

do $$
declare
  new_user_id uuid := gen_random_uuid();
  new_email   text := 'admin@yourcompany.com';        -- ← replace before running
  new_password text := 'REPLACE_WITH_STRONG_PASSWORD'; -- ← replace before running, never commit a real password
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    new_email,
    crypt(new_password, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    new_user_id,
    new_user_id::text,
    jsonb_build_object('sub', new_user_id::text, 'email', new_email),
    'email',
    now(), now(), now()
  );

  insert into public.employees (
    id, email, full_name, employee_code,
    department, designation, role, joining_date, date_of_birth, must_change_password
  ) values (
    new_user_id, new_email, 'Admin User', 'EMP-001',              -- ← replace name before running
    'Administration', 'Administrator', 'admin',
    current_date, null, true
  );
end $$;
