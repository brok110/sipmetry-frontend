# TYPOGRAPHY_STAGE3_BATCH3.md — scan（字型 rollout 最後一支）

**Repo:** `~/Projects/sipmetry-20260128`（frontend only。Backend 不碰。）

**前置：** Stage 1/2/3a/3b + Batch1/2 已 commit。`Type` token + EBGaramond 就緒。純 token、**OTA 即可，不需 build**。

**目標：** `app/scan.tsx`（2285 行，inline，已 import OaklandDusk）套 `Type` token。**這是字型 rollout 最後一支。**

**重要 — scan 的特性：** 它是相機/辨識流程，**沒有頁面大標**（最上方是 nav header 的「My Bar」返回鍵）。文字多為：按鈕、辨識中 loading、彩色安全警示、可編輯食材列、雙語字串。故 **EB Garamond 在此頁露出很少**，多數元素要留原樣。**極度保守**：只套少數 section/狀態標題與說明文，其餘全留。

---

## MAP（要改 — 少數結構文字）

| 位置（行）| 內容 | 現值 | → role | 備註 |
|---|---|---|---|---|
| L1808 | "Preview" 區塊標題 | 700 primary | **heading** | |
| L1827 | "Identifying your bottles…" loading 標題 | 16 / 700 gold | **heading** | 保留 gold。⚠️ 雙語字串內容不要動，只換 style |
| L1830 | "This usually takes a few seconds" | 12 tertiary center | **caption** | 保留 center |
| L1840 | "Scan your bottles to find cocktails" 空狀態 | 16 secondary center | **body** | 保留 center |
| L1871 | "Something went wrong" 錯誤標題 | 800 crimson | **heading** | 保留 crimson |
| L1878 | "Heads up" 安全警示標題 | 900 sundown | **heading** | 保留 sundown 色 |
| L1892 | "Please verify:" | 800 primary | **heading** | |
| L1904 | "Ingredients (editable)" 區塊標題 | 800 primary | **heading** | |
| L1907 | "(No ingredients yet)" | tertiary | **body** | |

> loading 標題等含 `isZh ? "中文" : "English"` 雙語 — **只改外層 `<Text>` 的 style，三元字串內容一字不動。**

## LEAVE（留原樣，不要動 — 逐一判斷）

| 位置 | 內容 | 為何留 |
|---|---|---|
| L1763 | "My Bar" 返回鍵 | nav header，scope 外 |
| L1799 / L2128 | 拍照/相機控制按鈕 | 套 button 放大會破控制列緊湊；保留 |
| L2177 "Add to My Bar" / L2195 "Show Recipes" | 結果動作按鈕 | 雙按鈕並排，套 button(15) 已是 15、但放大/大寫風險；**保留原樣**（已是 15/700，視覺 OK）|
| L2236 "Show me recipes" / L2239 副標 | sticky footer CTA（含 HintBubble GP_STEP_4）| 緊湊雙行 CTA + 引導氣泡，保留（氣泡對齊 Brok 自理）|
| L1962 "Cancel" / L1968 "Save" | 編輯食材的 inline 按鈕 | 緊湊編輯列，保留 |
| L1856/L1858 | 💡 photo tips（"Point labels…"）| 緊湊提示列、硬碼色 `#C8B880`，保留 |
| L1882–L1897 | 安全警示內文 + 項目列 | 彩色警示內容，保留（只 L1878/L1892 標題套）|
| L1998 | "✓ …"（綠色 #7AB89A 狀態）| 彩色狀態，保留 |
| L2022/L2038/L2049/L2102 | 食材編輯列/說明（13/12，多含 lineHeight）| 緊湊編輯 UI，保留 |
| L1892 以外的 `• {x}` 項目列 | — | 列表項，保留 |
| 所有辨識結果的瓶名 / 信心值 / 數量 | — | 結果資料，保留 |
| 雙語三元字串內容 | — | 只換 style、不動字串 |
| FontAwesome icon、ActivityIndicator、Image、Slider、TextInput | — | 非文字 / 控制元件 |

讀全檔，上表沒列到的：**只有明確是「區塊標題 / 狀態標題 / 純說明文」才套（heading/body/caption）；任何按鈕、彩色狀態、編輯列、緊湊 UI、辨識結果、雙語字串內容，一律留原樣並回報。**

> **scan 不套 `display`**（無頁面大標）、**不套 `label`**（避免任何 mono 大寫，此頁雙語 + 中文，mono 大寫不適用中文）、**按鈕一律不套 `button`**（保留現有系統字按鈕，避免動到密集控制列）。實際只用 heading / body / caption 三個 role。

---

## 驗收與提交

1. `npx tsc --noEmit` 通過。
2. simulator 進 scan（My Bar → 掃描 / 相機入口）自看：
   - 空狀態 "Scan your bottles…" 系統字（body）。
   - 拍一張 → loading "Identifying your bottles…" 標題（gold heading）。
   - 辨識後 "Preview" / "Ingredients (editable)" 標題系統字 heading。
   - 「Add to My Bar」「Show Recipes」「Show me recipes」按鈕**維持原樣**（沒放大、沒變樣）。
   - 安全警示（若觸發）標題套用、彩色內文不變。
   - 雙語：中文/英文都正常顯示（字串沒被動到）。
   - 拍照、編輯食材、加入 bar、show recipes 等功能全正常。
3. 回報改了哪些、留了哪些。
4. **⛔ STOP 等 Brok review。** 通過後 commit（Brok 執行）：
   ```bash
   git add -A && git commit -m "feat(type): apply typography scale to scan — typography rollout complete"
   ```

**部署：** 純 token、OTA。

**DO NOT:**
- 不要碰 `taste-dna.tsx`（另案）/ `v3DesignTokens.ts` / `bartender.tsx` / `Masthead.tsx` / `typography.ts` / `_layout.tsx` / 已完成的頁。
- 不要套 `display` 或 `label`（見上）；按鈕不套 `button`。
- 不要動任何按鈕、辨識結果、彩色狀態、編輯食材列、photo tips、安全警示內文、sticky CTA。
- 不要動 HintBubble（GP_STEP_4）/ 氣泡對齊（Brok 自理）。
- 不要動雙語三元字串的內容（只換 `<Text>` style）。
- 不要動相機 / 拍照 / 辨識 / 加入 bar / 任何邏輯。
- 不要改間距 / layout。
- 不要 git commit / push——做完回報，commit Brok 自己跑。

**Status:** Not Started

完成後 archive 為 `TYPOGRAPHY_STAGE3_BATCH3_DONE.md`。**此批完成 = 字型 rollout 全部結束**（taste-dna 淺色孤兒 + layout 議題另計）。
