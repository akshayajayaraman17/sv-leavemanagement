-- Fixes "Database error querying schema" on sign-in for users created via
-- direct SQL insert. GoTrue expects these text columns to be '' not NULL.
-- Omit the WHERE clause to fix every direct-SQL-created user at once, or
-- fill in a real email locally before running (never commit a real one).
update auth.users set
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token              = coalesce(recovery_token, ''),
  email_change                = coalesce(email_change, ''),
  email_change_token_new      = coalesce(email_change_token_new, ''),
  email_change_token_current  = coalesce(email_change_token_current, ''),
  phone_change                = coalesce(phone_change, ''),
  phone_change_token          = coalesce(phone_change_token, ''),
  reauthentication_token      = coalesce(reauthentication_token, '')
where email = 'admin@yourcompany.com';  -- ← replace before running
