# SCAN_MIDSTATE_PLAN.md — 批次中途按鈕漏顯修正(SCAN-MIDSTATE)

- 日期:2026-07-14
- 對應 backlog:backend repo `ROUND_4_BACKLOG.md` SCAN-MIDSTATE 條目(2026-07-14 logged)
- 改動範圍:frontend `app/scan.tsx` 一處(1 個 OLD/NEW,條件加一個 guard + 註解更新)
- 拍板(Brok 2026-07-14):Q1 按鈕 guard 採 `stage === "idle"`;Q2 In bar chip 本批不動,類別/瓶級語意另開產品決策條目
- 狀態:Ready for execution

## 背景與定性(2026-07-14 audit,已查實)

- 「Add to My Bar」「Show Recipes」設計給純手動輸入流(只打字、不掃照片,
  mode 停 `undecided` 由用戶手動定案)。
- 漏顯成因:所有「新開批次」(deep-link 入口與 in-app `handleScanBottles`
  皆先 `resetScan()`)整批期間 `scanMode` 停在 `"undecided"`,intent
  resolver 要批次結束才定案 → 第一張照片一出結果,按鈕即漏進畫面。
  中途按下會在 queue drain 途中切 mode/phase,是 race 隱患。
- Guard 訊號選 `stage`:全檔無任何 render 讀它(僅 telemetry L1272/L1391),
  零 UI 耦合。生命週期:每次 `analyze()` 開始設 `"identifying ingredients"`,
  批次成功路徑**不歸位**(quirk,但屆時 resolver 已翻走 mode,由 mode
  條件蓋掉);錯誤路徑 catch 設回 `"idle"`;入口 handler 設 `"idle"`。
  淨效果:手動輸入流照常顯示;批次進行中(含照片間隙)全程隱藏、不閃現;
  429/錯誤中斷後顯示——逃生門轉正(用戶可就此按 Add to My Bar 入庫,
  或照友善訊息等窗續掃)。
- 影響面已封死:`stage`/`scanMode` 皆 component-local,無跨檔存取;
  引導無錨在這兩顆按鈕(GP_STEP_4 錨 sticky footer,ADD_BAR guide 是死碼)。

## 範圍鐵律

- 只准動 `app/scan.tsx` 的下面一個 OLD/NEW block。
- 不動:`stage` 的任何寫入點、按鈕 onPress 邏輯、In bar chip、
  intent resolver、queue/drain、guest 語意、`multiScanResults`、
  sticky footer 與其 GP_STEP_4 引導。
- **OLD block 不完全匹配 → 立即停止,回報實際內容,不做任何修改。**

## Replacement M1 — 按鈕 render 條件加 stage guard

OLD:
```typescript
          {/* Manual-input action buttons — shown when user has typed at least one ingredient */}
          {activeIngredients.length > 0 && scanMode === "undecided" && (
```

NEW:
```typescript
          {/* Manual-input action buttons — manual-typed flow, or post-error (e.g. 429)
              in undecided mode. Hidden while a scan batch is in flight: `stage` is set
              to "identifying ingredients" at every analyze() start and only returns to
              "idle" via the error path or an entry handler — it does NOT reset on batch
              success, but by then the intent resolver has flipped scanMode, so the mode
              check hides the buttons anyway. */}
          {activeIngredients.length > 0 && scanMode === "undecided" && stage === "idle" && (
```

## 驗證與停止點(Claude Code)

- 執行 M1 後跑 `npx tsc --noEmit`。
- **tsc 通過即停。不 commit、不 push、不跑其他指令。**
- 回報:git diff 全文 + tsc 輸出 + OLD 匹配確認。

## 手測清單(Brok;順序有配額考量,d 最耗窗口放最後)

a. 純手動輸入(不耗配額):不掃照片,直接打一個 ingredient →
   兩顆按鈕出現;Add to My Bar 正常入庫、Show Recipes 正常開
   staples modal(設計用途不受 guard 誤殺)
b. in-app 主入口多選 3 張:批次進行中兩顆按鈕全程不出現、不閃現;
   批次完成後「Scan More or Done」照常只跳一次
c. 等 60 秒 → inventory 入口(deep-link)多選 3 張:同 b 觀察
d. 等 60 秒 → 多選 12 張:第 11 張出 429 友善訊息後,兩顆按鈕出現
   (逃生門);按 Add to My Bar 可把已辨識清單入庫、chip 隨之亮
e. In bar chip 行為與本批前一致(不動,語意問題另案)

## 收案順序

1. 手測 a–e 全過 →
   `git add app/scan.tsx && git commit -m "fix(scan): hide manual-input buttons while scan batch is in flight" && git push`
2. `eas update --auto --platform ios`
3. 本檔改名 `SCAN_MIDSTATE_PLAN_DONE.md` 歸檔(frontend)
4. backend `ROUND_4_BACKLOG.md`:SCAN-MIDSTATE 標 DONE(結果註記:
   按鈕 guard 已上;post-429 逃生門轉正;chip 不動),並新增
   **INV-MODEL** 產品決策條目(inventory 類別模型 vs 瓶級:chip 類別
   語意的誤導感 + 同類去重使新瓶名不入庫,兩層一起記)
