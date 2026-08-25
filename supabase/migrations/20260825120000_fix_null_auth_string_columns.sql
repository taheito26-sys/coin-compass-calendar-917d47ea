-- Fix Supabase Auth (GoTrue) "unable to fetch records: sql: Scan error ...
-- converting NULL to string is unsupported" error on OAuth login.
--
-- GoTrue scans several auth.users text columns into non-nullable Go strings.
-- If any of these columns are NULL (which can happen for accounts created
-- before certain Supabase Auth versions, or via direct SQL inserts), the
-- scan fails and login/callback requests return a 500 server_error.
--
-- Backfill NULLs with empty strings, which is what GoTrue itself writes
-- for these columns on new accounts.

UPDATE auth.users
SET confirmation_token = ''
WHERE confirmation_token IS NULL;

UPDATE auth.users
SET recovery_token = ''
WHERE recovery_token IS NULL;

UPDATE auth.users
SET email_change = ''
WHERE email_change IS NULL;

UPDATE auth.users
SET email_change_token_new = ''
WHERE email_change_token_new IS NULL;

UPDATE auth.users
SET email_change_token_current = ''
WHERE email_change_token_current IS NULL;

UPDATE auth.users
SET phone_change = ''
WHERE phone_change IS NULL;

UPDATE auth.users
SET phone_change_token = ''
WHERE phone_change_token IS NULL;

UPDATE auth.users
SET reauthentication_token = ''
WHERE reauthentication_token IS NULL;
