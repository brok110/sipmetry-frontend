-- ============================================================
-- Stage 8 Verification: user_tokens + token_ledger
-- Run each section in Supabase SQL Editor and check results
-- ============================================================

-- ── Test 1: Tables exist ────────────────────────────────────
SELECT
  'user_tokens' AS table_name,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_tokens') AS exists;

SELECT
  'token_ledger' AS table_name,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'token_ledger') AS exists;

-- Expected: both TRUE

-- ── Test 2: RLS enabled ─────────────────────────────────────
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('user_tokens', 'token_ledger')
ORDER BY tablename;

-- Expected: both rowsecurity = true

-- ── Test 3: RLS policies exist ──────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('user_tokens', 'token_ledger')
ORDER BY tablename, policyname;

-- Expected:
--   user_tokens  | users read own tokens  | SELECT
--   token_ledger | users read own ledger  | SELECT

-- ── Test 4: Columns check — user_tokens ─────────────────────
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_tokens'
ORDER BY ordinal_position;

-- Expected:
--   user_id    | uuid                     | (no default) | NO
--   balance    | integer                  | 0            | NO
--   updated_at | timestamp with time zone | now()        | NO

-- ── Test 5: Columns check — token_ledger ────────────────────
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'token_ledger'
ORDER BY ordinal_position;

-- Expected:
--   id         | uuid                     | gen_random_uuid() | NO
--   user_id    | uuid                     |                   | NO
--   amount     | integer                  |                   | NO
--   reason     | text                     |                   | NO
--   ref_key    | text                     |                   | YES
--   created_at | timestamp with time zone | now()             | NO

-- ── Test 6: Indexes exist ───────────────────────────────────
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'token_ledger'
  AND indexname IN ('idx_token_ledger_user', 'idx_token_ledger_dedup')
ORDER BY indexname;

-- Expected: both indexes exist

-- ── Test 7: Functions exist ─────────────────────────────────
SELECT routine_name, data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('earn_token', 'spend_token')
ORDER BY routine_name;

-- Expected:
--   earn_token  | jsonb
--   spend_token | jsonb

-- ── Test 8: earn_token function test ────────────────────────
-- NOTE: Replace the UUID below with a real user_id from auth.users
-- SELECT public.earn_token(
--   'YOUR_USER_UUID'::uuid,
--   2,
--   'scan',
--   'test_ingredient_key'
-- );
-- Expected: {"earned": true, "balance": 2}
-- Run again → Expected: {"earned": false, "balance": 2, "reason": "duplicate"}

-- ── Test 9: spend_token function test ───────────────────────
-- NOTE: Run after earn_token test above
-- SELECT public.spend_token(
--   'YOUR_USER_UUID'::uuid,
--   1,
--   'unlock_mood',
--   'mood_chill'
-- );
-- Expected: {"spent": true, "balance": 1}
-- Run with amount=5 → Expected: {"spent": false, "balance": 1, "reason": "insufficient_balance"}

-- ── Test 10: FK constraint ──────────────────────────────────
-- This should FAIL (invalid user_id):
-- INSERT INTO public.user_tokens (user_id, balance)
-- VALUES ('00000000-0000-0000-0000-000000000000', 10);
-- Expected: ERROR foreign key constraint violation

-- ============================================================
-- Summary: 10 tests
-- Tests 1-7: Run directly, check output
-- Tests 8-10: Replace UUID and run manually
-- ============================================================
