-- Run after you know your user id (from auth.users).
-- Replace the uuid if needed.

-- Spotify identity linked to this user?
select
  id,
  provider,
  provider_id,
  identity_data->>'email' as identity_email,
  last_sign_in_at,
  created_at,
  updated_at
from auth.identities
where user_id = '09fa2374-35f1-46b0-94d6-4d780fd5e32e';

-- Active sessions (if any)
select
  id,
  created_at,
  updated_at,
  factor_id
from auth.sessions
where user_id = '09fa2374-35f1-46b0-94d6-4d780fd5e32e'
order by updated_at desc
limit 5;
