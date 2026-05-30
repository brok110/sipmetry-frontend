# TYPOGRAPHY_STAGE3B.md — recipe.tsx

**Repo:** `~/Projects/sipmetry-20260128`（frontend only。Backend 不碰。）

**前置：** Stage 1（cart）+ 2（inventory, profile）+ 3a（recommendations）已 commit。`Type` token + EBGaramond 就緒。純 token、**OTA 即可，不需 build**。

**目標：** 把 `app/recipe.tsx`（全 inline、1605 行、未 import Type）的字型樣式套 `Type` token。inline 套法：`<Text style={[Type.X, { color: ... }]}>`，顏色維持 OaklandDusk。

**設計取向（重要，沿用 3a 的保守原則）：** recipe 有大量彩色狀態文字、會隨份量計算的計量數字、密集對齊的 ingredient row。**只套結構角色（display/title/heading/body）**；**彩色狀態/可用性文字、計量、密集 ingredient row、風味 tag、份量 stepper、nav/header/debug chrome 一律留原樣**——避免破緊湊版、避免增加 mono、避免動到會計算的數字。

---

## MAP（要改）

| 位置（行）| 內容 | 現值 | → role | 備註 |
|---|---|---|---|---|
| L1303 | 酒名大標（recipeTitle）| 22 / 700 primary | **display** | 保留 primary 色。⚠️ 22→34，長名可能換行 |
| L1489 | "Ingredients" section header | 900 primary | **title** | ⚠️ 旁有 14px flask icon；若失衡改用 `heading` |
| L1508 | "Instructions" section header | 900 primary | **title** | 同上（list-ol icon）|
| L1510 | instructions 內文段落 | secondary（無 fontSize）| **body** | 保留 secondary 色。閱讀內容 |
| L1367 | "Loading…" | 800 primary | **heading** | 暫態狀態標題 |
| L1573 | "Error" | 800 crimson | **heading** | 保留 crimson |
| L1564 | "Make this cocktail" CTA 文字 | 900 / 18 | **button** | 保留原色邏輯（done/idle 變色）。⚠️ 18→15，對齊 cart 的 button |

`renderDbIngredients` 內的純佔位提示文（如 "(Loading full recipe…)" / "(Waiting…)" / "Failed to load…" L1494–1500）：套 **body** 或 **caption**（保留原色），這些是純文字提示、無對齊問題。

## LEAVE（留原樣，不要動 — 已逐一判斷）

| 位置（行）| 內容 | 為何留 |
|---|---|---|
| L1320 | 風味 tag | 套 label 會變 mono 大寫，增加 mono 密度 |
| L1353 / L1356 | 可用性摘要（✓ / "You have everything" / "Missing N"）| 彩色狀態、緊湊 pill |
| L1030–L1061 | ingredient 可用性狀態（Missing / Running low / Have / In bar）| 彩色狀態文字 |
| L1093 / L1096 | ingredient 名稱 + 計量（amountLabel）| 密集對齊 row；計量數字隨份量計算，動它高風險 |
| L1110 | row 內狀態徽章（✓ / alt / need，9px）| 微型彩色徽章 |
| L1119 | "Originally: X"（10 gold）| 緊湊替代註記 |
| L1459 / L1480 | −/+ stepper | 符號 |
| L1462 | "{N} servings" 計數 | stepper 計數顯示，動它破 stepper |
| L1152 / L1218 | "‹ …" 返回鍵（gold 17）| nav header，scope 外 |
| L1163 | "Recipe" header 標題 | header chrome（旁有 Debug）|
| L1168 | "Debug"（800）| __DEV__ chrome |
| L1598 | toast 文字 | toast 元件 |

讀全檔，上表沒列到的：純結構文字（標題/段落）比照 MAP；任何**彩色狀態文字、計量數字、密集對齊 row、會變 mono 大寫、或會破緊湊版**的，一律**留原樣並回報**。

---

## 驗收與提交

1. `npx tsc --noEmit` 通過。
2. simulator 進 recipe 頁（任一 cocktail →「Make this」進入）自看。**重點看：**
   - 酒名大標 EB Garamond 34 —— 長名會不會換行不好看？
   - 「Ingredients」「Instructions」EB Garamond 22 —— 旁邊小 icon 會不會顯失衡？（失衡就回報，改 heading）
   - instructions 段落系統字好讀。
   - 「Make this cocktail」CTA 18→15 —— 會不會太小？
   - 計量、可用性狀態、ingredient row、份量 stepper、tag —— 全維持原樣。
3. 回報改了哪些、留了哪些。
4. **⛔ STOP 等 Brok review。** 通過後 commit（Brok 執行）：
   ```bash
   git add -A && git commit -m "feat(type): apply typography scale to recipe"
   ```

**部署：** 純 token、OTA。

**DO NOT:**
- 不要碰 `v3DesignTokens.ts` / `bartender.tsx` / `Masthead.tsx` / `typography.ts` / `_layout.tsx` / 已完成的 cart / inventory / profile / recommendations。
- 不要動 ingredient list 的 row（名稱/計量/狀態徽章）、份量 stepper、可用性摘要、風味 tag、nav/header/debug/toast（見 LEAVE 表）。
- **絕對不要動計量數字邏輯**（amountLabel 隨 servings 計算）或任何 recipe 載入/計算邏輯——只動字型樣式。
- 不要改顏色 / 間距 / layout。
- 不要進 Stage 3 其他畫面。
- 不要 git commit / push——做完回報，commit Brok 自己跑。

**Status:** Not Started

完成後 archive 為 `TYPOGRAPHY_STAGE3B_DONE.md`。
