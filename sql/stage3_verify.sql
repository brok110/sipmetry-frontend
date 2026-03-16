-- ============================================================
-- Stage 3 驗證 SQL
-- 在 Supabase SQL Editor 執行完 stage3_recipe_moods.sql 後，
-- 逐段執行以下驗證
-- ============================================================

-- 1. 確認 table 存在，回傳空結果
SELECT * FROM recipe_moods;

-- 2. 手動 INSERT 測試資料
INSERT INTO recipe_moods (recipe_code, mood)
VALUES ('test_code', 'chill');

-- 3. 確認 INSERT 成功（應回傳 1 筆，verified = false）
SELECT * FROM recipe_moods WHERE recipe_code = 'test_code';

-- 4. 測試 UNIQUE constraint（應報錯 duplicate key）
INSERT INTO recipe_moods (recipe_code, mood)
VALUES ('test_code', 'chill');

-- 5. 測試多 mood 標記（同一 recipe_code 不同 mood 應成功）
INSERT INTO recipe_moods (recipe_code, mood)
VALUES ('test_code', 'party');

SELECT * FROM recipe_moods WHERE recipe_code = 'test_code';
-- 應回傳 2 筆：chill + party

-- 6. 確認 RLS 啟用
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'recipe_moods';
-- rowsecurity 應為 true

-- 7. 確認 policy 存在
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'recipe_moods';
-- 應有 "public read recipe_moods"，cmd = SELECT

-- 8. 確認索引存在
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'recipe_moods';
-- 應有 idx_recipe_moods_mood_verified

-- 9. 清除測試資料
DELETE FROM recipe_moods WHERE recipe_code = 'test_code';

-- 10. 確認清除乾淨
SELECT COUNT(*) FROM recipe_moods;
-- 應為 0
