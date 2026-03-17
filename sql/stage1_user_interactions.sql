-- Stage 1: Interaction Tracking — user_interactions table
-- Records all user behavior events for invisible progression.
-- Append-only: never UPDATE, only INSERT.
--
-- interaction_type values:
--   'view'       — recipe card appeared on screen (scan/recommend results)
--   'click'      — user tapped into recipe detail page
--   'favorite'   — user added to favorites
--   'unfavorite' — user removed from favorites
--   'like'       — user rated thumbs-up
--   'dislike'    — user rated thumbs-down
--   'skip'       — user saw recipe but scrolled past / dismissed
--
-- context JSONB stores variable data per event type:
--   { source: 'scan'|'recommend'|'explore'|'restock',
--     has_ingredients: true|false,
--     position: 3,                    -- rank in list (for view/skip)
--     view_duration_ms: 1200,         -- how long card was visible
--     mood: 'chill',                  -- if mood filter was active
--     ingredient_keys: ['gin','lime'] -- recipe ingredients (for taste calc)
--   }

CREATE TABLE IF NOT EXISTS public.user_interactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id),
  recipe_key       TEXT,              -- nullable: some interactions may not have a recipe
  ingredient_key   TEXT,              -- nullable: for bottle-level interactions (buy click etc.)
  interaction_type TEXT NOT NULL,
  context          JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Primary query pattern: "all interactions for a user, newest first"
CREATE INDEX IF NOT EXISTS idx_user_interactions_user_time
  ON public.user_interactions (user_id, created_at DESC);

-- For aggregation: "count interactions by type for a user"
CREATE INDEX IF NOT EXISTS idx_user_interactions_user_type
  ON public.user_interactions (user_id, interaction_type);

-- For taste profile: "all likes/dislikes for a recipe"
CREATE INDEX IF NOT EXISTS idx_user_interactions_recipe
  ON public.user_interactions (recipe_key, interaction_type)
  WHERE recipe_key IS NOT NULL;

-- RLS: users can only read their own interactions
ALTER TABLE public.user_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own interactions"
  ON public.user_interactions FOR SELECT
  USING (auth.uid() = user_id);

-- Backend (service role) can insert for any user
CREATE POLICY "service insert interactions"
  ON public.user_interactions FOR INSERT
  WITH CHECK (true);
