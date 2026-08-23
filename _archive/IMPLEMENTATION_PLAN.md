# App Store Launch Prep — Implementation Plan

First-ever App Store submission. iPhone-only launch (iPad deferred, reversible).
ascAppId 6760887396, bundle com.sipmetry.app.

> **全案狀態:✅ Complete(2026-08-23 查核結案,歸檔 `_archive/`)**
> 本檔最後實質編輯為 2026-06-02(送審前)。2026-08-23 REPO-CLEANUP
> 歸檔評估時逐項查核,發現 Stage 4 各項**實際早已完成、僅狀態未回填**。
> 各節狀態已更正,原記述以刪節線或註記保留,查核依據詳文末「2026-08-23
> 查核」節。**本檔為歷史紀錄,不再更新**;未結事項已轉出,見文末「轉出項」。

## Stage 1: app.json corrections
**Status**: Complete (frontend 1a00e09)
- supportsTablet=false (iPhone-only); display name "Sipmetry"; removed
  duplicate sentry plugin; notification color #E0A030; removed dead Android
  audio permissions; expo-audio -> { microphonePermission: false }.
- Verified: tsc clean; prebuild Info.plist has NO mic usage string.

## Stage 2: Asset validation
**Status**: Complete (no change needed)
- icon.png = 1024x1024, hasAlpha: no. Passes.

## Stage 3: Launch readiness (runtime)
**Status**: Complete
- RLS: 24/24 tables enabled. Dropped 2 overdue 4b backup tables
  (user_inventory_backup, ingredient_ontology_backup).
- Render: Starter instance, does not spin down. No cold-start risk.
- Account deletion: UI present (double-confirm, DELETE /account). Backend
  handler transactional + allowlisted. FIXED residue gap: added
  affiliate_clicks, token_ledger, usage_log to DELETE_ACCOUNT_TABLES
  (backend dc46e77, pushed). feedback_events left out (anonymized by design).

## Stage 4: App Store Connect listing + launch compliance
**Status**: ✅ Complete(2026-08-23 更正;原記 `In Progress` 為陳舊)

### 4a. Sentry data minimization (code)
**Status**: ✅ Complete(原記 `Done locally, PENDING COMMIT` 為陳舊)
- sendDefaultPii=false, removed session replay + feedback widget,
  enabled=!__DEV__. Crash/error only. Verified: tsc clean, app boots.
- **2026-08-23 查核**:三項全數在線——`app/_layout.tsx` L34
  `enabled: !__DEV__`、L37 `sendDefaultPii: false`、L39–41 註解載明
  session replay 與 feedback widget 已移除(並註明二者原為 Sentry
  wizard 預設)。**早已 commit,非 pending**。

### 4b. Privacy Policy revision (docs/privacy.md)
**Status**: ✅ Complete(原記 `Done locally, PENDING COMMIT` 為陳舊)
- Disclosed Sentry across 5 touchpoints (3rd-party table, links, §1, §4,
  appendix Crash Data row).
- Corrected §4 deletion description to match implementation: immediate bulk
  delete; auth-retry queue (pending_auth_deletions); share-link TTL (7 days,
  verified server.js:5111). Bumped last-updated to June 2, 2026.
- Verified against backend: auth retry + share TTL both confirmed in code.
- **2026-08-23 查核**:`docs/privacy.md` 內 Sentry 提及正好 5 次,與
  「5 touchpoints」吻合;L4 `Last updated: June 3, 2026`(較本檔所記
  June 2 更新一日)。其後另有二次 commit:`42b7d7e`(Apple 列為
  identity provider)、`7625200`(privacy label 附錄補 free-text
  feedback),均 2026-06-04。**早已 commit 且已再迭代**。

### 4c. Terms of Service
**Status**: ✅ No change(定案,未變)
- Legally fine as-is; "cocktail recommendation app" description is fine for
  a legal doc. Privacy Policy URL confirmed live at
  brok110.github.io/sipmetry-frontend/privacy.

### 4d. App Store listing copy
**Status**: ✅ Complete —— **已輸入,但方向與本檔草稿不同**
(原記 `Drafted, NOT YET ENTERED` 為陳舊)

原草稿(未採用):
- Subtitle: "Your home bar, decoded"
- Promo text + Description drafted (decision-engine framing, no buy/unlock language)
- Keywords drafted (100 bytes)
- ~~TODO: current ASC page still has old "buy next / unlock recipes" copy ->
  must replace (App Review red flag for alcohol + contradicts positioning).~~

**2026-08-23 查核(依 ASC App Information 頁 + 公開 App Store 頁)**:
- **Name**:`Sipmetry: Cocktail Bartender`(28/30 字元)
- **Subtitle**:`Mixology, Home Bar & Recipes`(28/30 字元)
  —— 非草稿的品牌標語,改走 **ASO 關鍵字策略**。二欄皆塞至上限
  附近,屬有意識的取捨,非「未輸入」。
- **Description**:混合版——buy/unlock 語言保留(開頭、次段、Smart
  Restock 段、Features 條列共四處),但結尾採用草稿的 decision-engine
  收句:"Sipmetry is a cocktail decision engine. Your bar, your choices."
  合規句 "Must be of legal drinking age to use." 在位。

**⚠️ 紅旗假設正式否決(留痕)**:本檔原判「buy next / unlock recipes
措辭為 alcohol App Review red flag,必須替換」。實證推翻——**該措辭
原封保留,App 仍過審上架**。後續判斷:Smart Restock 是實際存在的
分頁與產品核心迴路,**移除該措辭反使描述不符功能**,不應為「定位
純粹」而改。原 TODO 作廢。

### 4e. Remaining ASC dashboard items
**Status**: ✅ Complete(原記 `not started` 為陳舊)
- Age rating: ~~17+~~ → **18+**(公開頁實證;Apple 分級制改版後
  17+ 併入 18+)
- Category: **Food & Drink**(公開頁實證)
- iPhone screenshots: **已上架**(公開頁可見多張)
- App Privacy questionnaire(Crash Data / Diagnostics)—— **推定完成**
- Support URL —— **推定完成**
- **查核方法留痕**:前三項為公開頁直接目視實證;後二項**無法自外部
  直接查核**,但二者皆為 App Store 上架強制欄位,App 已上架即推定
  完成。**此二項為推定、非直證**;若日後需精確確認,須進 ASC 後台。

## ~~Pending commits~~ ✅ 全數完成
- ~~Frontend: app/\_layout.tsx (Sentry) + docs/privacy.md (policy) -> 2 commits,
  then push (triggers GitHub Pages re-publish of live privacy policy).~~
- ~~This plan file to be committed alongside.~~
- **2026-08-23 查核**:二檔皆早已 commit(詳 4a / 4b);本檔亦已在
  git 內。查核時 frontend working tree 為 0 未 commit 變更,
  **不存在任何滯留本機未進 git 的改動**。

## Post-launch backlog (non-blocking) —— 轉出項
本檔歸檔後,以下三項的去向:
- `ingredient_ontology.value='rose_wine'` -> rose_wine (key convention)
  —— **已在 `ROUND_4_BACKLOG.md` 追蹤**(é 慣例違反,non-blocking)。
- `SECURITY_HARDENING_PLAN.md` backend app-layer items
  —— **已由 SEC-AUDIT-2026-08(L1–L3 全面資安稽核)吸收,
  ✅ DONE 2026-08-06**,見 `ROUND_4_BACKLOG.md`。
- `shared_recipes`: consider null-ing user_id on deletion
  (currently TTL-expires)
  —— **✅ 已結,且結論與本檔提案相反**。`ROUND_4_BACKLOG.md`
  「CASCADE 補齊(REG-6 結構性發現收尾)」條(✅ DONE 2026-08-09,
  DB-only 無 commit)載明:shared_recipes **曾裁 SET NULL**
  (連結存活、匿名化)並短暫生效,**隨即改裁 `ON DELETE CASCADE`**
  (刪帳連分享一起滅)、恢復 `user_id NOT NULL`,原裁決正式撤銷
  留痕。其不在手刪清單內,改由 auth 刪除連動,結果等價,
  auth_pending 重試路徑亦連動;建 FK 前孤兒 pre-check 驗
  shared_recipes 孤兒 0,終驗 pg_constraint 五列全 c。
  **本檔提案(null-ing)經試行後否決,無殘留待辦。**

**三項轉出全部有著落,歸檔後零孤兒。**

---

## 2026-08-23 查核(歸檔前結案)

**觸發**:REPO-CLEANUP 歸檔評估。本檔 0 引用、依 dev guideline
「全部 stage 完成才移除」須先驗 Stage 狀態,查核後發現狀態全面陳舊。

**結論**:**純文件債,零程式碼缺口**。原記的兩條 `PENDING COMMIT`
一度被判為「線上程式碼可能缺口」的高風險項,查核後證實**改動早已
進 git**,虛驚一場。

**關鍵線索**:查核當下 frontend working tree 乾淨(0 未 commit 變更)
——「本機改好但未 commit」的狀態在此前提下不可能持續存在,只剩
「已補 commit」或「改動遺失」二選一;逐條讀碼後確認為前者。

**方法論留痕**:文件自報的 `Status` 是**過去某時點的觀察**,不是
當前事實。呼應既有原則「開案前先驗證問題是否仍存在」——本檔四處
狀態全部陳舊,若未查核直接歸檔,等同把假紀錄封存,日後翻閱者將
被誤導為「有東西沒 commit」。**帶錯誤狀態歸檔比不歸檔更糟。**

**未結轉出**:ASC Description 現寫 `130+ cocktail recipes`,實際
DB 已達 **224 杯且每杯有 story 頁**——少報近四成,且內容深度
未體現。屬產品線 metadata 優化,**已轉 `ROUND_4_BACKLOG.md` 待辦**,
擇下次送 metadata 時一併對齊,不在本檔處理。
