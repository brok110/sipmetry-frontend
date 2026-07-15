# SCAN_UX_ACCUMULATE_DONE.md

**結案:2026-07-13**

## 批次總結

- 來源:ROUND_4_BACKLOG.md「SCAN-UX — 多張掃描僅顯示最後一張的清單」。
- Audit 定性:per-photo 顯示為設計、資料未丟;但 display 層與累積層分叉
  造成 **quick_look 兩個真 bug**——(1) 手動加料不進 generation(掃過照片
  後徹底蒸發);(2) 刪除/修正誤辨識無效(推薦照舊以錯誤材料計算)。
- Founder 拍板 **方案 A**:`activeIngredients` 改為 session 內累積,成為
  顯示 + 計數 + generation 的單一真相;`multiScanResults` 原封保留
  (入倉迴圈、alert 計數),不再作為推薦資料源。
- 附帶修復(零額外改動):/recommendations 導航 payload
  (`ingredients_json` / `scan_items_json`)由「最後一張」變全 session,
  guest 詳情頁 availability 臨時清單不再殘缺。
- 改動:`app/scan.tsx` 四站點,24 insertions / 10 deletions。
  guest 語意、multiScanResults、photo queue、per-photo auto-add 零接觸。

## Stage 1: 四站點手術

**Status:** Complete(2026-07-13)

1. `analyze()` 開頭不再清空 `activeIngredients`(session 邊界 = `resetScan()`,
   三個入口皆已驗證會呼叫;Scan More 刻意不 reset)。
2. 分析完成:整批取代改 merge-dedup(canonical 為鍵,未解析項以
   lowercased display 為鍵——保留可見可編,與 multiScanResults 丟棄
   未解析項的行為刻意不同)。
3. footer 計數改讀 `activeIngredients.length`。
4. quick_look generation 改 `regenerateRecipes(undefined, ...)`,
   fallback 至 `activeIngredients`。

**Provenance 備註:** Claude Code 回報 session 開始時,四站點改動已存在於
working tree(該 session 零編輯,僅驗證 + tsc)。經逐字比對確認與 plan
NEW block 完全一致(含僅存在於本 plan 的註解文字),並經本機獨立驗證
(`git status --short` 僅 `M app/scan.tsx`;`--stat` 24+/10−)。最可能為
先前一次 brief 執行未留回報;以內容自證收案。權威紀錄 = 本 commit diff。

驗證:`npx tsc --noEmit` exit 0;四站點 locator 皆呈「NEW 已落地」態
(`setActiveIngredients([]);` 僅剩 resetScan 內 1 hit,其餘 0 hit)。

## Stage 2: 影響面盤點

**Status:** Complete(audit 即本 stage)

`activeIngredients` 及衍生 memo(`activeCanonical`、`activeDisplay`)全部
消費者 session 化後語意皆更正確:flavorVector、unknownIngredients、
addIngredient 查重、/recommendations payload、debug dump。per-photo 語意
的東西(safety banner、Sentry breadcrumb、auto-add 迴圈)直接吃
`data` / `nextWithCanonicalNormalized`,不受影響。

已知可接受邊角:footer 計數(含未解析項)與「Scan More or Done」alert
計數(multiScanResults,不含未解析項)在有解析失敗項時可能差 1-2。

## Stage 3: 驗收

**Status:** Complete(2026-07-13,手測 a–e 全過)

- a. 累積顯示:quick_look 掃 2 張,清單顯示全部、footer 計數一致 ✓
- b. 刪除生效:刪烈酒後推薦不再以其為 base ✓
- c. 手動加料生效:加 gin 後計數 +1、推薦反映 ✓
- d. inventory 不退化:清單累積、per-photo auto-add 照舊、
  「Based on my bar」照舊 ✓
- e. session 邊界:重進 scan 清單歸零,不殘留 ✓
