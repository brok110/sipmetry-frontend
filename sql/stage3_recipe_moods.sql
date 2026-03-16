-- ============================================================
-- Stage 3: recipe_moods table
-- 存放每個配方的場景標記（mood tagging）
-- 執行方式：貼到 Supabase SQL Editor 執行
-- ============================================================

-- 1. 建立 table
CREATE TABLE public.recipe_moods (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_code TEXT NOT NULL,          -- 對應 recipes.iba_code
  mood        TEXT NOT NULL,          -- 'chill' | 'party' | 'date_night' | 'solo'
  verified    BOOLEAN DEFAULT false,  -- Brok 人工審核
  created_at  TIMESTAMPTZ DEFAULT now(),

  UNIQUE (recipe_code, mood)
);

-- 2. 加註解
COMMENT ON TABLE  public.recipe_moods IS '配方場景標記（mood tagging）';
COMMENT ON COLUMN public.recipe_moods.recipe_code IS '對應 recipes.iba_code';
COMMENT ON COLUMN public.recipe_moods.mood IS 'chill | party | date_night | solo';
COMMENT ON COLUMN public.recipe_moods.verified IS 'true = Brok 人工審核通過';

-- 3. 建立索引（加速 mood filter 查詢）
CREATE INDEX idx_recipe_moods_mood_verified
  ON public.recipe_moods (mood, verified)
  WHERE verified = true;

-- 4. 啟用 RLS
ALTER TABLE public.recipe_moods ENABLE ROW LEVEL SECURITY;

-- 5. RLS policy：公開唯讀
CREATE POLICY "public read recipe_moods"
  ON public.recipe_moods
  FOR SELECT
  USING (true);

-- 6. 驗證
-- 執行完上面的 SQL 後，跑以下驗證：
--
--   SELECT * FROM recipe_moods;                          -- 應回傳空結果
--   INSERT INTO recipe_moods (recipe_code, mood)
--     VALUES ('test_code', 'chill');                     -- 用 service_role 應成功
--   SELECT * FROM recipe_moods;                          -- 應回傳 1 筆
--   DELETE FROM recipe_moods WHERE recipe_code = 'test_code';  -- 清除測試資料
--
-- 用 anon key 的 REST API 測試：
--   GET  /rest/v1/recipe_moods  → 200，可讀
--   POST /rest/v1/recipe_moods  → 403，不可寫
