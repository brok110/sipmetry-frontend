-- ============================================================
-- Stage 8: Token System — user_tokens + token_ledger
-- Run this in Supabase SQL Editor (Settings → SQL Editor)
-- ============================================================

-- ── 1. Token 餘額 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_tokens (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance     INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.user_tokens IS 'Per-user token balance for the gamification system';
COMMENT ON COLUMN public.user_tokens.balance IS 'Current token balance (can go negative in edge cases, but spend API prevents it)';

ALTER TABLE public.user_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read their own balance
CREATE POLICY "users read own tokens"
  ON public.user_tokens FOR SELECT
  USING (auth.uid() = user_id);

-- Service role (backend) can do everything — no extra policy needed
-- Authenticated users should NOT be able to write directly (only via backend API)

-- ── 2. Token 交易紀錄 ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.token_ledger (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  ref_key     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.token_ledger IS 'Append-only ledger of token earn/spend events';
COMMENT ON COLUMN public.token_ledger.amount IS 'Positive = earn, negative = spend';
COMMENT ON COLUMN public.token_ledger.reason IS 'scan | like | dislike | favorite | report_error | confirm_ingredient | unlock_mood | unlock_feature';
COMMENT ON COLUMN public.token_ledger.ref_key IS 'Dedup key: recipe_key, ingredient_key, feature name, etc.';

-- Index for fast balance recalculation and dedup checks
CREATE INDEX IF NOT EXISTS idx_token_ledger_user
  ON public.token_ledger (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_token_ledger_dedup
  ON public.token_ledger (user_id, reason, ref_key);

ALTER TABLE public.token_ledger ENABLE ROW LEVEL SECURITY;

-- Users can read their own ledger
CREATE POLICY "users read own ledger"
  ON public.token_ledger FOR SELECT
  USING (auth.uid() = user_id);

-- ── 3. Helper function: earn token (idempotent) ────────────
-- This function handles the earn logic atomically:
--   1. Check dedup (same user + reason + ref_key)
--   2. Insert ledger entry
--   3. Upsert user_tokens balance
-- Returns: { earned: boolean, balance: integer }
CREATE OR REPLACE FUNCTION public.earn_token(
  p_user_id UUID,
  p_amount  INTEGER,
  p_reason  TEXT,
  p_ref_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_exists BOOLEAN;
  v_balance INTEGER;
BEGIN
  -- Dedup check: if ref_key is provided, check for existing entry
  IF p_ref_key IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.token_ledger
      WHERE user_id = p_user_id
        AND reason = p_reason
        AND ref_key = p_ref_key
    ) INTO v_exists;

    IF v_exists THEN
      -- Already earned for this action, return current balance
      SELECT balance INTO v_balance FROM public.user_tokens WHERE user_id = p_user_id;
      RETURN jsonb_build_object('earned', false, 'balance', COALESCE(v_balance, 0), 'reason', 'duplicate');
    END IF;
  END IF;

  -- Insert ledger entry
  INSERT INTO public.token_ledger (user_id, amount, reason, ref_key)
  VALUES (p_user_id, p_amount, p_reason, p_ref_key);

  -- Upsert balance
  INSERT INTO public.user_tokens (user_id, balance, updated_at)
  VALUES (p_user_id, p_amount, now())
  ON CONFLICT (user_id)
  DO UPDATE SET
    balance = public.user_tokens.balance + p_amount,
    updated_at = now();

  SELECT balance INTO v_balance FROM public.user_tokens WHERE user_id = p_user_id;

  RETURN jsonb_build_object('earned', true, 'balance', v_balance);
END;
$$;

COMMENT ON FUNCTION public.earn_token IS 'Idempotent token earn: deduplicates by (user_id, reason, ref_key)';

-- ── 4. Helper function: spend token ────────────────────────
-- Returns: { spent: boolean, balance: integer, reason?: string }
CREATE OR REPLACE FUNCTION public.spend_token(
  p_user_id UUID,
  p_amount  INTEGER,   -- positive number (will be stored as negative)
  p_reason  TEXT,
  p_ref_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  -- Get current balance (lock row for update)
  SELECT balance INTO v_balance
  FROM public.user_tokens
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('spent', false, 'balance', 0, 'reason', 'no_balance_record');
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('spent', false, 'balance', v_balance, 'reason', 'insufficient_balance');
  END IF;

  -- Dedup check for spend (e.g., don't unlock same feature twice)
  IF p_ref_key IS NOT NULL THEN
    IF EXISTS(
      SELECT 1 FROM public.token_ledger
      WHERE user_id = p_user_id
        AND reason = p_reason
        AND ref_key = p_ref_key
        AND amount < 0
    ) THEN
      RETURN jsonb_build_object('spent', false, 'balance', v_balance, 'reason', 'already_spent');
    END IF;
  END IF;

  -- Insert negative ledger entry
  INSERT INTO public.token_ledger (user_id, amount, reason, ref_key)
  VALUES (p_user_id, -p_amount, p_reason, p_ref_key);

  -- Update balance
  UPDATE public.user_tokens
  SET balance = balance - p_amount, updated_at = now()
  WHERE user_id = p_user_id;

  SELECT balance INTO v_balance FROM public.user_tokens WHERE user_id = p_user_id;

  RETURN jsonb_build_object('spent', true, 'balance', v_balance);
END;
$$;

COMMENT ON FUNCTION public.spend_token IS 'Atomic token spend with balance check and dedup';
