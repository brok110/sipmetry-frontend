-- Stage 0: Business Validation — Affiliate Click Tracking
-- Tracks when users click "Buy" on a bottle recommendation.
-- This is the core metric for validating purchase intent.
--
-- Usage: POST /affiliate/click from frontend when user taps a buy link.
-- Query: SELECT count(*), ingredient_key FROM affiliate_clicks GROUP BY ingredient_key

CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id),  -- nullable for anonymous clicks
  ingredient_key TEXT NOT NULL,                    -- which bottle was clicked
  source        TEXT NOT NULL DEFAULT 'restock',   -- 'restock' | 'recipe' | 'scan'
  buy_url       TEXT,                              -- the URL user was sent to
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_user
  ON public.affiliate_clicks (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_ingredient
  ON public.affiliate_clicks (ingredient_key);

-- RLS: users can only read their own clicks; backend direct connection can read all
ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own clicks"
  ON public.affiliate_clicks FOR SELECT
  USING (auth.uid() = user_id);

-- Allow backend (service role) to insert for any user
CREATE POLICY "service insert clicks"
  ON public.affiliate_clicks FOR INSERT
  WITH CHECK (true);
