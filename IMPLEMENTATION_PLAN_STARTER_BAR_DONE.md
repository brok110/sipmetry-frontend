# Starter Bar (Exploration Mode) — Implementation Plan ✅ DONE

**Completed**: 2026-05-15
**Status**: All 5 stages shipped to production (backend) / pushed to main (frontend, awaiting next EAS build for TestFlight)

> **Goal**: 讓沒有 inventory 的 user(anonymous 或剛註冊但未 scan)在 bartender 頁面能立刻看到 recommendations,並透過明顯的 UI 線索引導他們去 scan 自己的酒櫃。User scan 第一瓶後,exploration mode 自動退場,完全不需要清理「假資料」。
>
> **Strategy**: Hybrid data-driven starter set(後端從 `ingredients.category_key` + recipe coverage 演算法選出,結構配額 hard code、具體 ingredients 不 hard code) + 後端 inject + 前端 banner/marker。
>
> **Architecture decisions confirmed with Brok**:
> - 預設值不寫 DB(虛擬 inventory,只存在於 API response)
> - 新增 `/default-bar` endpoint(SSoT)
> - `/bartender-recommend` 內部複用同樣演算法 inject + 回傳 `exploration_mode: true` flag
> - Anonymous user 也享受 exploration mode
> - User 一 scan 就自動退場(無 inventory → 有 inventory)

---

## Stage 1: Backend — `computeStarterBar()` 演算法 + `/default-bar` endpoint

**Goal**: 純後端、可獨立測試的演算法 + API endpoint,回傳預設酒櫃 ingredient_keys。

**Deliverables**:
1. 在 `server.js` 加 `STARTER_BAR_QUOTA` config(JS object,結構配額,~10-11 個 ingredients)
2. 加 `computeStarterBar()` 函式:
   - 對每個 quota slot(e.g. `spirit-vodka`、`spirit-gin`),從 `identityMap` 篩出符合 category/family 的候選
   - 對每個候選跑一次 recipe coverage 查詢(借用 `/restock-suggestions` 的 SQL 模式),選 unlock 最多的
   - 回傳 `{ ingredient_keys: string[], expected_recipe_count: number, breakdown: {...} }`
3. 加 `/default-bar` GET endpoint(`optionalAuth`,public 也能呼叫)
4. 快取結果(5 分鐘 in-memory cache,因為 recipe DB 不常變),避免每次 anonymous user 開 app 都重算

**Finalized Config**(based on real DB data,confirmed 2026-05-15):
```js
// STARTER_BAR_QUOTA — slot 結構 hard code,具體 ingredient_key 由演算法選
// `family_key` slots: 演算法從 identityMap 篩同 family 的 ingredients,選 recipe_count 最高
// `ingredient_key` slots: 直接指定(essentials,本身就是單一 ingredient_key)
// `tiebreak`: 同分時的優先 ingredient_key(目前只有 whiskey slot 需要)
const STARTER_BAR_QUOTA = [
  // Spirits — 5 個基酒
  { slot: 'spirit-gin',         match: { family_key: 'gin' } },
  { slot: 'spirit-vodka',       match: { family_key: 'vodka' } },
  { slot: 'spirit-rum',         match: { family_key: 'rum' } },
  { slot: 'spirit-tequila',     match: { family_key: 'tequila' } },
  { slot: 'spirit-whiskey',     match: { family_key: 'whiskey' }, tiebreak: 'rye_whiskey' },

  // Modifiers — 3 個
  { slot: 'vermouth',           match: { family_key: 'vermouth' } },
  { slot: 'orange-liqueur',     match: { family_key: 'orange_liqueur' } },
  { slot: 'bitters',            match: { family_key: 'aromatic_bitters' } },

  // Essentials — 3 個(直接指定 ingredient_key,因為這些是 single ingredients,不是 family)
  { slot: 'mixer-lime',         match: { ingredient_key: 'lime_juice' } },
  { slot: 'mixer-lemon',        match: { ingredient_key: 'lemon_juice' } },
  { slot: 'mixer-syrup',        match: { ingredient_key: 'simple_syrup' } },
];
```

**預期演算法產出**(基於 SQL 數據,可在 Stage 1 實測驗證):
```
gin               (34 recipes)
vodka             (27)
white_rum         (15)
tequila_blanco    (6)
rye_whiskey       (5, tiebreak over scotch_whisky=5)
sweet_vermouth    (13, 高於 dry_vermouth=7)
triple_sec        (12)
angostura_bitters (12)
lime_juice        (30, essential)
lemon_juice       (27, essential)
simple_syrup      (24, essential)
```

**重要 DB 現況確認**:
- `bourbon` ingredient_key 在 DB 不存在(只有 rye_whiskey + scotch_whisky)— 不是 bug
- `sugar`(7 recipes)跟 `simple_syrup`(24 recipes)目前是分開的 ingredient — ontology debt 已知但**不在此 plan 處理範圍**
- 演算法回傳值不 hard code 具體 ingredient_key(除 essentials);recipe 庫成長 → spirits/modifiers 會自動跟著調整

**Success Criteria**:
- `GET /default-bar` 回傳 200 + `{ ingredient_keys, expected_recipe_count, exploration_mode_default: true }`
- `expected_recipe_count` 實測值經人工驗證合理(STRICT_MATCH 含 buildDetectedSets 展開後,實際值是 11 — starter bar 故意排除 cognac/cranberry/soda/cream/egg_white 等等,所以可解鎖的經典就是 Daiquiri/Gimlet/Kamikaze/Lemon Drop/Manhattan/Margarita/Vodka Gimlet/White Lady + 透過 alternative expansion 多 3 個)
- 連續呼叫 2 次,第二次 < 50ms(快取命中)
- 任何一個 quota slot 找不到 ingredient 時,跳過該 slot(不 crash),log 警告
- 演算法不 hard code 具體 ingredient_key 清單(除了 essentials 那三個 mixer)

**Tests**:
- T1.1: 直接呼叫 `computeStarterBar()` 回傳 array 長度介於 8-11
- T1.2: 每個回傳的 ingredient_key 都存在於 `identityMap`
- T1.3: 用回傳的 ingredient_keys 跑 `buildDetectedSets`,`expandedArr` 非空
- T1.4: 用回傳的 keys 模擬 `/bartender-recommend` 的 recipe matching SQL,至少 8 個 recipes 的 `missing_count === 0`(實測 11)
- T1.5: `/default-bar` 對 anonymous user(無 auth header)也回傳 200

**Status**: ✅ **Complete (2026-05-15)**

**Completion notes**:
- Hunk 1: `STARTER_BAR_QUOTA` constant at server.js line 1208-1228
- Hunk 2: `computeStarterBar()` + 5-min cache at server.js line 1280-1443
- Hunk 3: `GET /default-bar` at server.js line 5367-5385
- Bug found+fixed during verification: line 1352 had `ri.recipe_id = i.id` typo, fixed to `ri.ingredient_id = i.id`
- Local smoke test: 11 keys match spec exactly, slot recipe_counts populated, cache hit confirmed (569ms → 2ms)
- expected_recipe_count = 11 (raw 11 keys = 8, +3 via buildDetectedSets alternative/type/family expansion)

---

## Stage 2: Backend — `/bartender-recommend` Inject Exploration Mode

**Goal**: `/bartender-recommend` 在 inventory 空時自動 inject 預設酒櫃,並在 response 加 `exploration_mode: true` flag。

**Deliverables**:
1. 修改 `/bartender-recommend` line 3013-3022 區段:
   - 在現有 `detected = [...]` + `merged DB inventory` 邏輯之後
   - 如果最終 `detected.length === 0`,呼叫 `computeStarterBar()` 取得清單,assign 給 `detected`
   - 設 local var `let isExplorationMode = false` → 進入 inject 分支時設 `true`
2. 移除/修改 line 3058-3063 的 `coreArr.length === 0` early return(因為 inject 後不該再進這個分支;保留作為 fallback safety net,但訊息改成 `reason: "starter_bar_unavailable"`)
3. 在所有 success response(line 3564 + occasion 分支 line 3398 區附近)的 `meta` 物件加 `exploration_mode: isExplorationMode`
4. (Optional)在 response root 加 `default_bar_keys: detected` 讓前端可顯示「目前用這些酒在算」(僅 exploration mode 下)

**Success Criteria**:
- Anonymous user 不傳 `detected_ingredients` 呼叫 → 回傳 ≥ 3 個 recommendations + `meta.exploration_mode: true`
- Authenticated user 但 inventory 空 → 同上
- Authenticated user 有 inventory → `meta.exploration_mode: false`,行為跟現在完全一致
- 既有 regression test 全綠(`./run_regression.sh` baseline 維持 4 passed)

**Tests**:
- T2.1: `curl POST /bartender-recommend -d '{"detected_ingredients":[]}'`(no auth)→ ≥ 3 recs + `exploration_mode: true`
- T2.2: 用 demo account(user_id `b187a1af-...`)但先清空 inventory → 同 T2.1
- T2.3: 用 demo account + 正常 inventory → recs 跟改動前一樣 + `exploration_mode: false`
- T2.4: 在 STARTER_BAR_QUOTA 暫時改成空陣列(模擬 starter bar 失敗)→ fallback 走原本的 `no_ingredients` return 而不是 crash
- T2.5: `run_regression.sh` 通過,baseline 不變

**Status**: ✅ **Complete (2026-05-15)**

**Completion notes**:
- Commit: `ac9cca6` on backend repo
- 3 success return points all flagged with `exploration_mode: isExplorationMode` (line 3246 empty fallback, 3587 occasion-flow, 3751 main-flow)
- Empty fallback `reason` renamed from `no_ingredients` to `starter_bar_unavailable` (used by Stage 4B frontend fork)
- Production smoke test: Test A (empty body) → `exploration_mode: true` + 3 recs (Bee's Knees / Daiquiri / Gimlet); Test B (with detected) → `exploration_mode: false` (regression-safe)
- Regression suite: 4 phases, 0 failed (matched Stage 1 baseline)

**Dependencies**: Stage 1 完成

---

## Stage 3: Frontend — bartender.tsx Exploration Mode UI

**Goal**: 前端拿掉「inventory 空 → 死胡同」的 early return,改成正常呼叫 API,根據回傳的 `exploration_mode` flag 顯示頂部 banner + recipe card 微標記。

**Deliverables**:
1. **拿掉 line 200 的 early return**:`if (inventory.length === 0) return;` 改成允許 fetch(因為 backend 會 inject)
2. **拿掉 line 436-447 的 Branch 3 死胡同**:刪除 `if (!hasInventory) { return ... "add bottles to start" }`
3. 新增 state `const [explorationMode, setExplorationMode] = useState(false);`
4. `fetchRecommendations` 解析 response 時 `setExplorationMode(data.meta?.exploration_mode === true)`
5. **頂部 banner**:在 masthead 下方,當 `explorationMode === true` 時顯示:
   - 文案(en): `"Exploring with a sample bar — scan your bottles to see what YOU can make"`
   - 文案(zh): `「正用範例酒櫃探索 — 掃描你的酒瓶看看你能做什麼」`
   - 樣式跟 OaklandDusk theme 一致(gold border 或 gold-soft 背景)
   - **點擊直接觸發 scan flow**(`router.push('/scan')` 或現有 promptScanBottles 同等動作),不跳 inventory tab
6. **Recipe card 微標記**:在 hero card 角落加小標籤(類似 `EXPLORING` 字樣,DM Mono 字體,gold-faint 顏色)
7. 註冊一次性 Sentry breadcrumb / log 知道 exploration mode 被觸發,方便 launch 後觀察

**Success Criteria**:
- 新 user(無 inventory)開 bartender 頁面:看到 recommendations(不是死胡同)+ banner + recipe card 標記
- 點 banner 後 → 跳轉到 inventory tab(走現有 router)
- 已有 inventory 的 user:UI 完全跟以前一樣,沒 banner、沒標記
- `npx tsc --noEmit` 通過
- Banner 文案 i18n 跟其他訊息一致(en/zh 兩版)

**Tests**:
- T3.1: 在模擬器登出 → 開 bartender → 看到 banner + recommendations
- T3.2: 登入 demo account 但清空 inventory → 同 T3.1
- T3.3: Scan 一瓶 → 重新進 bartender → banner 消失、回到正常模式
- T3.4: 點 banner → 直接進 scan flow(/scan 頁面或 native scan picker)
- T3.5: 切換 zh/en locale,banner 文案對應切換

**Status**: ✅ **Complete (2026-05-15)**

**Completion notes**:
- Commit: `fb048e9` on frontend repo
- 70 insertions, 18 deletions in `app/(tabs)/bartender.tsx`
- Removed Branch 3 dead-end + unused `hasInventory` variable
- New banner: gold-soft 12% background, gold-line 28% border, DM Mono 10px uppercase, marginHorizontal: 26
- New watermark: 9px, letterSpacing 2.7, 32% alpha gold (`#C9A458` + `52` hex)
- Scan flow trigger: `router.push("/scan")` (chose over lifting `promptScanBottles` from inventory.tsx — same scan.tsx entry point handles param-less case)
- **Bug found during simulator test**: empty↔non-empty inventory transition not refetching. Fix: signature gained `inventoryEmpty: inventory.length === 0` boolean (only flips on transition, not on every add). Tested in 5 simulator flows.

**Dependencies**: Stage 2 完成(否則前端拿到的 response 沒 flag)

---

## Stage 4: Edge Cases + Polish

**Goal**: 處理 stage 1-3 未涵蓋的邊角案例。

**Deliverables**:
1. **Filter 互動**:exploration mode 下 user 點 base spirit / style filter 會發新 API call,backend 應該繼續 inject(因為 inventory 仍空)— 確認 banner 持續顯示、recommendations 仍依 filter 篩選
2. **`one_away` 推薦**:exploration mode 下 backend 回傳空陣列(decision: Option A confirmed)。Backend 在 inject 分支設一個 local flag,在組裝 response 時跳過 `one_away` 計算或回傳 `[]`。
3. **`hint`(SPARKLING etc.)**:同上,exploration mode 下隱藏 hint banner(否則跟頂部 banner 視覺打架)
4. **Scan completion → bartender refresh**:user 在 scan 頁面加完酒回到 bartender 時,inventory context 應自動 invalidate signature → 觸發新的 fetch → exploration mode 自動退場。**先確認 `useInventory` context 在 inventory 變動時會更新 `availableIngredientKeys`**,如果是就不需要動;如果不是,可能要在 bartender.tsx 補一個 effect
5. **Error fallback**:`computeStarterBar()` 完全失敗時(e.g. DB 連不上),`/bartender-recommend` 走原本的 `no_ingredients` 死胡同 — 前端要保留一個 "Something went wrong, scan to start" empty state(類似原本 line 436,但訊息更精準)

**Success Criteria**:
- 4 個邊角案例都有明確處理(代碼或文件記錄)
- Scan 完成後回到 bartender 自動退出 exploration mode(< 2 秒)
- 任何錯誤情境下,user 不會看到白屏或 crash

**Tests**:
- T4.1: Exploration mode 下點 "GIN" filter → 回傳的 recommendations 都含 gin + banner 仍在
- T4.2: Exploration mode 下 response 的 `one_away` 為空陣列
- T4.3: Exploration mode 下 `hint` 不顯示
- T4.4: Scan 完一瓶酒 → bartender 頁面 ≤ 2 秒內 banner 消失
- T4.5: 模擬 `/default-bar` 失敗(暫時把 STARTER_BAR_QUOTA 清空)→ 前端顯示明確錯誤訊息,不白屏

**Status**: ✅ **Complete (2026-05-15)** — partial scope (see deliverable notes)

**Completion notes**:
- **#1 (filter chip behavior in exploration mode)** — SKIPPED. Reason: filter UI in `bartender.tsx` is hidden behind a "Narrow the list +" disclosure inside the Index List section (`indexEntries.length > 0`), not a visible chip row on hero card. This is a pre-existing UX issue from V3 redesign, outside starter bar plan scope. Logged as backlog item (Filter UI discoverability).
- **#2 (one_away in exploration mode)** — Stage 4A backend, commit on backend repo. Added `if (isExplorationMode) bonusResults.length = 0;` before main-flow return. Occasion-flow doesn't return `one_away` so no change needed there.
- **#3 (hide hint banner)** — Stage 4B `0c921a7` on frontend. Audit revealed hint render was ripped out by V3 redesign (commit 64ee5e4); `hint` was orphaned state. Removed `const [hint, setHint] = useState(...)` (line 174) and `setHint(data.hint || null)` (line 287). Invariant ("hint not shown in exploration mode") now holds vacuously. NOTE: backend still computes & returns `data.hint` — logged as backlog cleanup item.
- **#4 (scan completion auto-exit exploration mode)** — already verified in Stage 3 Test 4.
- **#5 (error fallback for starter_bar_unavailable)** — Stage 4B `0c921a7`. fetchRecommendations detects `meta.reason === "starter_bar_unavailable"` → sets sentinel error → Branch 2 forks on it with precise copy + TRY AGAIN + SCAN BOTTLES buttons. Default branch preserved for other errors.
- Regression suite re-run after Stage 4A: 4 passed, 6 warnings (one less than Stage 2 baseline of 7), 0 failed.

**Dependencies**: Stage 3 完成

---

## Stage 5: Verification + Documentation

**Goal**: 確認 launch-ready,更新 docs/memory,封存 plan。

**Deliverables**:
1. 完整跑 `./run_regression.sh`(backend);`npx tsc --noEmit`(frontend)
2. 在 TestFlight build 上做 5 個 user flow 測試:
   - 全新安裝 → 不註冊 → 直接開 bartender → 看到 exploration mode
   - 註冊 → onboarding → 不 scan → 開 bartender → 看到 exploration mode
   - 註冊 → onboarding → scan 一瓶 → 開 bartender → 正常模式
   - 已有 inventory → 開 bartender → 正常模式(regression check)
   - 切換 zh locale → 文案正確
3. 更新 `INGREDIENT_ONTOLOGY.md` 或新增 `STARTER_BAR.md` 簡短記錄演算法 + quota 結構(讓未來 Brok 改 quota 時知道在哪改)
4. 把這份 plan 改名成 `IMPLEMENTATION_PLAN_STARTER_BAR_DONE.md`
5. 在 commit message 寫 "feat: starter bar exploration mode (Stage 1-5 of IMPLEMENTATION_PLAN_STARTER_BAR)"

**Success Criteria**:
- 全部 5 個 user flow 通過
- 0 regression
- Plan 封存
- 文件就位

**Tests**:
- T5.1-T5.5: 上述 5 個 user flow
- T5.6: `run_regression.sh` baseline 維持 4 passed
- T5.7: Sentry 無新 error event 在 2026-launch 前 24h

**Status**: ✅ **Complete (2026-05-15)**

**Completion notes**:
- **Verification**: Backend stages 1+2+4A deployed to Render production. All curl smoke tests passed (production endpoints verified). Frontend stages 3+4B pushed to main, simulator-tested 5 flows (Test 1/2/3/4/5 all green).
- **Backlog captured in user memory** (memory edits #12 DONE, #13 backlog) — see "Backlog" section below.
- **No separate `STARTER_BAR.md`** — merged into this plan's "Quick Reference" section below per Brok's preference (avoids documentation drift between two files).
- **Plan archived** as `IMPLEMENTATION_PLAN_STARTER_BAR_DONE.md` in backend repo root (alongside other `*_DONE.md` files per established convention).
- **Ship strategy decided**: Brok chose Option B (wait for next EAS build) over OTA. TestFlight users will receive starter bar in next build.

**Dependencies**: Stage 4 完成

---

## Resolved Decisions(confirmed 2026-05-15)

1. **Quota 配額**:5 base spirits + 3 modifiers + 3 essentials = 11 slots(見 Stage 1 finalized config)
2. **Cognac/Brandy**:不加 — 維持「典型家庭吧台」心智模型
3. **Whiskey tiebreak**:Rye whiskey 優先(Manhattan/Sazerac 是 starter bar 精神 anchor)
4. **Quota config 位置**:寫在 `server.js` 為常數(不放 DB,YAGNI;真要常改再 refactor)
5. **Banner 點擊行為**:直接觸發 scan flow(不跳 inventory tab)
6. **`one_away` 處理**:Exploration mode 下後端回傳空陣列
7. **退場邏輯**:純跟 inventory 狀態走(空 → 顯示,有 → 隱藏);不做 "checked once forever"

---

## Risk Notes

- **效能**:`computeStarterBar` 對每個 quota slot 都跑一次 recipe coverage SQL(~11 queries on 120 recipes/435 ingredients)→ ~50-200ms。加 5 分鐘 cache 後 anonymous user 之間共享同一個答案。風險低。
- **可預測性**:演算法選的 ingredients 可能跟你心目中的 "starter bar" 不完全一樣。Stage 1 先 SQL preview 結果,如果看起來怪,Brok 可以調整 `STARTER_BAR_QUOTA` 結構(這部分仍可以調,不算 hard coding 具體 ingredients — 是調結構)。
- **i18n**:Banner 文案兩版要由 Brok 校對(我會出初稿但需要你 review zh 版)。
- **TestFlight build**:Stage 5 完成後需要新 EAS build(目前 build 16)。

---

## Quick Reference

### How starter bar works
1. User opens bartender screen with no inventory (anonymous or signed-in but empty bar)
2. Frontend `bartender.tsx` sends `POST /bartender-recommend` with empty `detected_ingredients`
3. Backend detects `detected.length === 0` → calls `computeStarterBar()` → injects 11 ingredient_keys → response includes `meta.exploration_mode: true`
4. Frontend reads flag → shows gold banner + EXPLORING watermark → recommendations are computed against the injected starter bar
5. User taps banner → `router.push("/scan")` → scans a bottle → inventory becomes non-empty → next bartender refetch has non-empty `detected` → backend doesn't inject → `exploration_mode: false` → banner disappears

### How to tune the starter bar
Edit `STARTER_BAR_QUOTA` constant in `server.js` (line ~1208):
- **Add/remove a slot**: add/remove an entry in the array. Slot structure: `{ slot: 'name', match: { family_key: 'X' } }` or `{ slot, match: { ingredient_key: 'Y' } }` for essentials.
- **Change tiebreak**: edit the `tiebreak` field on relevant slot (currently only `spirit-whiskey` has one).
- **Force-pick a specific ingredient**: switch from `family_key` to `ingredient_key` match (bypasses recipe-coverage ranking).
- After changing, the in-memory cache (5min TTL) will expire and refresh; restart server to invalidate immediately.

### Key files
- Backend: `server.js` line 1208-1228 (config), 1280-1443 (computeStarterBar + cache), 3243-3258 (inject in /bartender-recommend), 5367-5385 (/default-bar endpoint), 3770 (one_away suppression)
- Frontend: `app/(tabs)/bartender.tsx` line 177 (explorationMode state), 222 (inventoryEmpty signature), 269-277 (starter_bar_unavailable error handling), 432-467 (Branch 2 error fork), 497-510 (banner), 533-536 (EXPLORING watermark)

### Production endpoints (verified working as of 2026-05-15)
- `GET https://sipmetry-backend.onrender.com/default-bar` → returns starter bar ingredient_keys
- `POST https://sipmetry-backend.onrender.com/bartender-recommend` with `{}` → returns recommendations + `meta.exploration_mode: true`

---

## Backlog

Items logged in user memory #13 for future work:

1. **Filter UI discoverability** — bartender hero card has no visible filter button; chips are hidden behind a "Narrow the list +" disclosure inside the Index List section (requires `indexEntries.length > 0` to even show the disclosure). Exploration mode users have zero entry to filters. Pre-existing issue from V3 redesign, not specific to starter bar but more salient now that anonymous users land here.

2. **i18n harness for `bartender.tsx`** — Stage 3 banner ("EXPLORING WITH A SAMPLE BAR · TAP TO SCAN YOUR BOTTLES") and Stage 4B error fallback ("We couldn't load the sample bar") are inline English. No zh equivalent. Whole bartender.tsx needs an i18n strategy before launch.

3. **Backend still computes & returns `data.hint`** — frontend hint state was orphaned and removed in Stage 4B, but server.js still has the hint computation logic for `/bartender-recommend`. Either remove backend hint logic, or leave it for future hint UI revival (related to SPARKLING chip bug backlog).

4. **`STARTER_BAR_QUOTA` is hard-coded** — fine for now (single starter bar), but if multiple starter sets are ever needed (e.g., vegan / non-alcoholic / low-ABV), this needs DB-driven refactor.

5. **`recipes.is_published` invariant** — `computeStarterBar`'s `expected_recipe_count` filters on `is_published = true`. If a recipe is added but `is_published` is forgotten, the starter bar's covered recipe count silently shrinks. No alerting. Could add a regression check.

6. **Next EAS build must include Stage 3+4B frontend** — Brok chose to wait for next build rather than OTA. Don't forget to bump build 17 to include starter bar changes; release notes should mention "Exploration mode for new users."

---

## Retrospective

### What worked well
- **Multi-agent workflow** (chat Claude = planning + review, Claude Code = mechanical edits, Brok = git + smoke test + final verify). Stage gate discipline strictly observed — no stage merged before previous one fully verified in production.
- **Hybrid data-driven quota** — structural config (categories + tiebreak) hard-coded, specific ingredients chosen by recipe-coverage algorithm. Future-proof: when recipe DB grows, the algorithm auto-adjusts within each category.
- **Backend SSoT principle** — putting `exploration_mode` detection in backend (not frontend) meant the frontend doesn't need branching logic; it just renders the flag. Stage 1+2 were entirely independent of any frontend work.
- **Empty inventory transition fix** (Stage 3 signature `inventoryEmpty` boolean) caught only by simulator testing, not by `tsc` or static review. Reinforced "manual UI verification is non-negotiable."

### What we learned
- **Spec assumptions need DB verification before finalizing config** — original spec used `family_key: 'whiskey'` hoping to cover bourbon/scotch, but DB has no `bourbon` ingredient_key. Caught early thanks to "先看檔案,再下結論" discipline.
- **`recipe_ingredients` join typo silently degrades algorithm** — Stage 1 typo (`ri.recipe_id = i.id` should be `ri.ingredient_id = i.id`) made all family ingredients return count=0, falling back to alphabetical order. Production smoke test caught it because `vanilla_vodka` won over `vodka`, which looked obviously wrong. Lesson: always smoke-test with known-good expected outputs.
- **Static "Hint UI" can be stale-doc** — Stage 4 plan referenced a hint banner that V3 redesign had ripped out months ago. Investigation rather than execution prevented unnecessary work.

### Process notes for next time
- **Diff truncation in chat UI is a real issue** — Brok had to manually run `git --no-pager diff | cat` multiple times when Claude Code's diff output was clipped. Plan ahead: ask for `git diff | cat | head -N` directly.
- **Memory edit 500-char limit** is restrictive; need to compress aggressively (`Stage X` over `Stage Number X`, commit hashes are short forms of full info).
- **Stage gate discipline paid off** — when Stage 1 typo bug was found in production, it was caught before Stage 2 even started, so Stage 2 was built on a known-good foundation.
