# TYPOGRAPHY_STAGE3A.md — recommendations.tsx

**Repo:** `~/Projects/sipmetry-20260128`（frontend only。Backend 不碰。）

**前置：** Stage 1（cart）+ Stage 2（inventory, profile）已 commit。`Type` token + EBGaramond 就緒。純 token、**OTA 即可，不需 build**。

**目標：** 把 `app/recommendations.tsx`（全 inline、496 行、未 import Type）的字型樣式套 `Type` token。沿用 cart inline pattern：`<Text style={[Type.X, { color: ... }]}>`，**顏色維持 OaklandDusk**。

**設計取向（重要）：** 此頁保守處理。**結構角色（display/title/heading/body/caption）照套**；但**會把 sentence-case 元素變成 mono 大寫的 `label` 候選一律留原樣**（風味 tag、狀態徽章）——因為前面 review 已確認「mono 不要太多」，這些是可見風格變動，留待 Brok on-device 決定。緊湊 layout 的小元件也留原樣，避免破版。

---

## MAP（要改）

inline 套法：`<Text style={[Type.<role>, { color: <原色>, ...其他保留的 layout props }]}>`

| 位置（行）| 內容 | 現值 | → role | 備註 |
|---|---|---|---|---|
| L361 | "Cocktails" 頁面大標 | 20 / 800 gold | **display** | 保留 gold。⚠️ 20→34 放大明顯 |
| L308 `SectionHeader` | "Ready to make (N)" 等 | 13 / 700 secondary | **title** | 保留 secondary 色 + marginTop:8。⚠️ 變 EB Garamond 22 襯線 |
| L377 | "No matches found" | 800 primary | **title** | 空狀態標題 |
| L388 | "You're close!" | 800 primary | **title** | 空狀態標題 |
| L365 | "Based on N scanned ingredients" 副標 | 12 secondary | **caption** | |
| L378 | "Try scanning more bottles…" | secondary | **body** | textAlign center 保留 |
| L389 | "Add one more bottle…" | secondary | **body** | textAlign center 保留 |
| L231 | 酒名（Bee's Knees 等）| 15 / 700 primary | **heading** | 系統字、可讀 |
| L292 | 缺料名（champagne 等）| 13 crimson, numberOfLines=1 | **caption** | 保留 crimson + numberOfLines |
| L456 | "WANT MORE COCKTAILS?" | 11 secondary ls0.5 | **label** | 本來就近似 kicker（大寫+字距）|
| L481 | "Unlocks N cocktails" | 11 secondary | **caption** | |

## LEAVE（留原樣，不要動 — 已逐一判斷）

| 位置（行）| 內容 | 為何留 |
|---|---|---|
| L244 | 風味 tag（Full-bodied / Aromatic）| 套 label 會變 mono 大寫，增加 mono 密度（Brok 在意）。保留彩色 sentence-case pill |
| L274 | "Ready" 狀態徽章 | 同上，mono 大寫風險。保留綠色 |
| L282 | "N missing" 徽章 | 同上。保留 crimson |
| L260 | "Make this" | 套 button 會 11→15 放大、破壞卡片緊湊度 |
| L261 | "›" 箭頭 | 符號 |
| L346 | "‹ Cocktails" 返回鍵 | nav header（Stack.Screen headerLeft），本 rollout scope 外 |
| L474 | footer 迷你卡名稱 | 緊湊 2-up footer，放大會破版 |
| L477 | footer "+N" | 同上 |

讀全檔，上表沒列到的：結構文字比照 MAP 判斷；任何「會變 mono 大寫」或「會放大破緊湊版」的，**留原樣並回報**。

---

## 驗收與提交

1. `npx tsc --noEmit` 通過。
2. simulator 進此頁（scan 完的 recommendations，或 My Bar →「Show me recipes」）自看。**重點看：**
   - 「Cocktails」大標 EB Garamond 34 —— 在窄 header 會不會太大？
   - 「Ready to make (4)」「1 ingredient away (10)」EB Garamond 22 襯線 —— 喜歡嗎？
   - 酒名/副標/缺料 維持系統字好讀。
   - 風味 tag、Ready/missing 徽章、Make this —— 維持原樣（沒被 mono 化）。
3. 回報改了哪些、留了哪些。
4. **⛔ STOP 等 Brok review。** 通過後 commit（Brok 執行）：
   ```bash
   git add -A && git commit -m "feat(type): apply typography scale to recommendations"
   ```

**部署：** 純 token、OTA。

**DO NOT:**
- 不要碰 `v3DesignTokens.ts` / `bartender.tsx` / `Masthead.tsx` / `typography.ts` / `_layout.tsx` / `cart.tsx` / `inventory.tsx` / `profile.tsx`（皆已完成或不在範圍）。
- 不要把風味 tag、狀態徽章、Make this、footer 迷你卡內部 mono 化或放大（見 LEAVE 表）。
- 不要動 Stack.Screen / nav header。
- 不要改顏色 / 間距 / layout / 邏輯——只動字型樣式。
- 不要碰 recommendations 的 RecipeCard 顯示邏輯（這頁有 inventory-mode 分支等業務邏輯，完全不要動）。
- 不要進 Stage 3 其他畫面。
- 不要 git commit / push——做完回報，commit Brok 自己跑。

**Status:** Not Started

完成後 archive 為 `TYPOGRAPHY_STAGE3A_DONE.md`。
