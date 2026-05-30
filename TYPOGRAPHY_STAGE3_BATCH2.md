# TYPOGRAPHY_STAGE3_BATCH2.md — preferences

**Repo:** `~/Projects/sipmetry-20260128`（frontend only。Backend 不碰。）

**前置：** Stage 1/2/3a/3b + Batch1 已 commit。`Type` token + EBGaramond 就緒。純 token、**OTA 即可，不需 build**。

**目標：** `app/profile/preferences.tsx`（639 行，inline，已 import OaklandDusk、dark theme）套 `Type` token。inline 套法：`<Text style={[Type.X, { color: ... }]}>`，顏色維持 OaklandDusk。

**範圍變更說明：** `taste-dna.tsx` 已**移出字型線**（它是淺色設計、硬碼灰色、未套 OaklandDusk + 有 RadarChart，需整頁 dark-theme 重做，另列題目）。故 Batch 2 僅 preferences 一支。Stage 3 剩餘 = 本批 + Batch 3（scan）。

---

## MAP（要改）

| 位置（行）| 內容 | 現值 | → role | 備註 |
|---|---|---|---|---|
| L381 | "Taste profile" 頁面大標 | 20 / 700 primary | **display** | 保留 primary 色 |
| L402 | "Flavor" 卡片標題 | 13 / 700 primary | **heading** | |
| L403 | "Pick a flavor you like…" 說明 | 12 secondary | **caption** | |
| L435 | "Taste" 卡片標題 | 13 / 700 primary | **heading** | |
| L436 | "Slide to adjust intensity…" 說明 | 12 secondary | **caption** | |
| L443 | "Alcohol Strength" 等 slider 項目名 | 13 / 600 primary | **heading** | （slider 列的主標）|
| L444 | `{alcoholWord}` slider 描述字 | 11 secondary | **caption** | |
| L41（`LearnedDimRow` 子元件內）| `{label}` | 13 / 700 primary | **heading** | 見下方注意 |
| L42 | `{value.toFixed(1)}` | 12 tertiary | **caption** | |
| L567 | "Save preferences / Saved ✓" | 13 / 700 void | **button** | 保留 void 色 |
| L587 | "Reset" | 13 / 600 secondary | **button** | 保留 secondary 色 |
| L592 | "Loading saved preferences…" | tertiary | **body** | |
| L608/L618/L630/L631 | "Learned from your history" 區塊文字 | 各色 | heading/caption/body 比照 | ⚠️ 該區塊被 `{false &&}` 關閉（L595 dead branch），**可套但實際不顯示**；套了無害，照 MAP 處理即可 |

> **slider/chip 列的多個項目** 重複套用相同 role（"Alcohol Strength" 之外還有其他 taste 維度的列，結構相同 → 各列主標 `heading`、描述 `caption`、數值 `caption`）。讀全檔，相同結構的列比照處理。

## LEAVE（留原樣，不要動）

| 位置 | 內容 | 為何留 |
|---|---|---|
| L446 | slider 數值 `{Number(draftAlcohol)}`（700 tertiary）| 即時數值顯示，緊湊；動它無益 |
| L100（`StyleChip` 子元件）| chip label（12 / 700）| 套 label 會 mono 大寫；緊湊 chip，保留彩色 |
| L136 / L169（其他子元件 row label）| toggle/row label | 若為控制元件列，保留（除非與 MAP 的 heading 結構一致才套）|
| Slider / Toggle / StyleChip / LearnedDimRow 的**控制邏輯**| — | 只動其中 `<Text>` 樣式，不動元件結構/onChange |
| FontAwesome icon | — | 圖示 |

> **`LearnedDimRow`、`StyleChip`、`ProfileRow` 等是本檔內定義的子元件**（不是共用 import）。它們的 `<Text>` 可套 Type（屬本檔），但**只動文字樣式、不動元件的 props/邏輯/控制項**。

---

## 驗收與提交

1. `npx tsc --noEmit` 通過。
2. simulator 進 Profile → Preferences 自看：
   - "Taste profile" 大標 EB Garamond。
   - "Flavor" / "Taste" 卡片標題、slider 項目名（Alcohol Strength 等）系統字 heading。
   - slider 數值、chip 維持原樣（沒 mono 化）。
   - Save / Reset 按鈕系統字。
   - slider 拖動、chip 點選、儲存功能正常（純樣式改動不應影響）。
3. 回報改了哪些、留了哪些。
4. **⛔ STOP 等 Brok review。** 通過後 commit（Brok 執行）：
   ```bash
   git add -A && git commit -m "feat(type): apply typography scale to preferences"
   ```

**部署：** 純 token、OTA。

**DO NOT:**
- 不要碰 `taste-dna.tsx`（已移出，另案處理）。
- 不要碰 `v3DesignTokens.ts` / `bartender.tsx` / `Masthead.tsx` / `typography.ts` / `_layout.tsx` / 已完成的頁。
- 不要動 Slider / Toggle / StyleChip / LearnedDimRow 等元件的結構、props、onChange、控制邏輯——只動其中 `<Text>` 樣式。
- 不要把 chip label、slider 數值 mono 化。
- 不要改間距 / layout / 任何 preferences 儲存邏輯。
- 不要進 Batch 3（scan）。
- 不要 git commit / push——做完回報，commit Brok 自己跑。

**Status:** Not Started

完成後 archive 為 `TYPOGRAPHY_STAGE3_BATCH2_DONE.md`。
