-- ============================================================
-- Stage 9: user_unlocks table
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_unlocks (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature     TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, feature)
);

COMMENT ON TABLE  public.user_unlocks IS 'Tracks which premium features each user has unlocked via tokens';
COMMENT ON COLUMN public.user_unlocks.feature IS 'mood_chill | mood_party | mood_date_night | mood_solo | flavor_explorer | smart_restock | taste_dna';

ALTER TABLE public.user_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own unlocks"
  ON public.user_unlocks FOR SELECT
  USING (auth.uid() = user_id);
