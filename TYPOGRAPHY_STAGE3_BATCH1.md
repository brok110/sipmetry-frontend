# TYPOGRAPHY_STAGE3_BATCH1.md — login, qr, feedback, favorites

**Repo:** `~/Projects/sipmetry-20260128`（frontend only。Backend 不碰。）

**前置：** Stage 1/2/3a + recipe(3b) 已 commit。`Type` token + EBGaramond 就緒。純 token、**OTA 即可，不需 build**。

**目標：** 4 支輕量畫面套 `Type` token。inline 套法：`<Text style={[Type.X, { color: ... }]}>`，顏色維持 OaklandDusk（**qr.tsx 例外，見下**）。沿用保守原則：結構角色照套、會 mono 大寫或破版的留原樣。

**註：** `onboarding.tsx` 不存在（已確認），本批不含。Stage 3 總共 7 支：本批 4 + Batch 2（preferences, taste-dna）+ Batch 3（scan）。

---

## 1. `login.tsx`（312 行，inline）

| 位置 | 內容 | 現值 | → role | 備註 |
|---|---|---|---|---|
| L~110 | "Sipmetry" 大標 | 28 / 900 gold | **display** | 保留 gold |
| "Check your inbox" | 22 / 700 primary, center | **title** | 保留 textAlign center |
| email 確認句中的 `{email}` | gold 600 | **保留原樣** | inline 強調，不要動 |
| "Create an account…/Sign in to continue" 副標 | secondary | **body** | |
| error 文字 | semantic.error | **body** | 保留 error 色 |
| 主按鈕 "Create Account/Sign Up/Sign In" | void 800 | **button** | 保留 void 色 |
| "Continue with Google" | 16 / 600 primary | **button** | 保留 primary 色 |
| toggle "Already registered? / Don't have an account?" | secondary, center | **caption** | 保留 inline gold 強調字 |
| "← Back to My Bar" / "Back to Sign In" | secondary/gold | **caption** | |
| "or" divider | tertiary | **留原樣** | divider 小字 |

**留原樣：** TextInput（email/password 輸入框）、Apple 原生按鈕、divider 的 "or"。

## 2. `qr.tsx`（93 行，inline）⚠️ 特殊：需補 OaklandDusk 顏色

**此檔目前用硬碼灰色（`#555` / `#666` / `#999`），未 import OaklandDusk。** 套 Type 時**同時**把顏色改成 OaklandDusk，否則會變「EB Garamond 大標 + 灰內文」不協調。

- 頂部加 `import OaklandDusk from '@/constants/OaklandDusk';`
- 套用：

| 位置 | 內容 | 現值 | → role + 顏色 |
|---|---|---|---|
| L~50 | "Share Recipe" 大標 | 22 / 900 | **display** + `OaklandDusk.text.primary` |
| 說明句 "Ask your friend…" | `#555` | **body** + `OaklandDusk.text.secondary` |
| "QR Code" 卡片標題 | 900 | **heading** + `OaklandDusk.text.primary` |
| "Share link:" | `#666` | **caption** + `OaklandDusk.text.tertiary` |
| shareUrl 文字 | 800 | **caption** + `OaklandDusk.text.secondary`（保留 selectable）|
| "ID: {shareId}" | `#999` | **caption** + `OaklandDusk.text.tertiary` |
| "No share link found…" | `#666` | **body** + `OaklandDusk.text.secondary` |
| "Back to Recipe" 按鈕 | 800 | **button** + `OaklandDusk.brand.gold` |

> qr 的卡片/按鈕邊框目前也無色（用預設）——**本批只補文字顏色 + 套 Type，邊框/背景暫不碰**（避免擴大範圍；qr 全面套 OaklandDusk 是另一個小 task）。

## 3. `feedback.tsx`（178 行，inline）

| 位置 | 內容 | 現值 | → role | 備註 |
|---|---|---|---|---|
| "Category" / "Details" section label | 16 / 700 primary | **heading** | 設定區標題（非頁面大標）|
| 類別卡文字（Bug Report 等）| 12 / 700 | **留原樣** | 緊湊 3-up 卡片，套 label 會 mono 大寫破版 |
| 字數 "{n} / 5000" | 12 tertiary | **caption** | |
| 送出按鈕 "Submit Feedback" | 800 | **button** | 保留條件色（canSubmit）|

**留原樣：** TextInput（多行輸入框）、類別選擇卡文字。

## 4. `favorites.tsx`（379 行，inline + 共用元件）

**此檔卡片內容用共用元件 `Card`/`Pill`/`SwipeRow`/`CocktailThumbnail`——那些元件不要碰**（會波及別頁）。能套 Type 的只有頁面層級文字：

| 位置 | 內容 | 現值 | → role | 備註 |
|---|---|---|---|---|
| L~290 | "Favorites" 頁面大標 | 28 / 600 primary | **display** | 保留 primary 色 + marginBottom |
| "(No favorites yet)" | tertiary | **body** | 空狀態 |
| 卡片內 title（fav title）| 15 / 600 primary | **heading** | recipe 名稱 |
| "Swipe left to unfavorite" footer | 11 disabled, center | **caption** | |
| 卡片內 taste tag（L~370）| 11 / 700 gold | **留原樣** | 緊湊彩色 tag |

**留原樣：** `Card` / `Pill` / `SwipeRow` / `CocktailThumbnail` 元件內部一律不碰；taste tag。

---

## 驗收與提交

1. `npx tsc --noEmit` 通過。
2. simulator 自看 4 頁：
   - **login**：進 Profile → Sign In；"Sipmetry" 大標 EB Garamond、按鈕系統字。
   - **qr**：從 recipe → 分享 → QR 頁；"Share Recipe" EB Garamond，內文**不再是灰色**（變 OaklandDusk 暖色系）。
   - **feedback**：Profile → Send Feedback；"Category"/"Details" 標題、送出按鈕。
   - **favorites**：Profile → Favorites；"Favorites" 大標 EB Garamond。
3. 回報每支改了哪些、留了哪些。
4. **⛔ STOP 等 Brok review。** 通過後 commit（Brok 執行）：
   ```bash
   git add -A && git commit -m "feat(type): apply typography scale to login, qr, feedback, favorites"
   ```

**部署：** 純 token（含 qr 補色）、OTA。

**DO NOT:**
- 不要碰 `v3DesignTokens.ts` / `bartender.tsx` / `Masthead.tsx` / `typography.ts` / `_layout.tsx` / 已完成的頁。
- 不要碰共用元件 `Card` / `Pill` / `SwipeRow` / `CocktailThumbnail` / `StaplesModal`（favorites 用到，動了會波及別頁）。
- 不要把類別卡文字、taste tag mono 化。
- 不要動 TextInput、Apple/Google 原生按鈕、divider。
- qr.tsx 只補文字顏色 + 套 Type，**不碰邊框/背景**。
- 不要改間距 / layout / 邏輯（feedback 提交、favorites 可用性計算等全不動）。
- 不要進 Batch 2 / 3。
- 不要 git commit / push——做完回報，commit Brok 自己跑。

**Status:** Not Started

完成後 archive 為 `TYPOGRAPHY_STAGE3_BATCH1_DONE.md`。
