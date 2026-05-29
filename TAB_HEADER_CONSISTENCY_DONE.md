# TAB_HEADER_CONSISTENCY_DONE — 四 tab 頂部 header 一致化

接續 bartender masthead 修正（`476e457`，見 `MASTHEAD_HEADER_TRIM_DONE.md`）。
將 My Bar / Smart Restock / Profile 三個 tab 的頂部統一為 bartender 的 icon masthead 風格。

## 定案規格（經 A/B + mockup 多輪確認）

- **方向 A** — 四 tab 頂部統一用 bartender 的 icon masthead。
- **Bundle 1（A-pure）** — masthead 為唯一 header，無文字標題列；tab 名稱靠 bottom tab bar 提供。
- **My Bar** — Scan / Filter 兩顆 icon 按鈕進 masthead 列右側（取代 bartender counter 的位置，icon-only、32px、無文字 label）；「12 bottles」(含 `No bottles yet` 動態文字) 自成一列，22px / weight 500 / `text.primary`，置於 masthead 正下方、ScrollView content 第一列。
- **Smart Restock** — masthead ＋ 保留「What to buy next?」為 content headline（非 nav title，不動）。
- **Profile** — masthead ＋ avatar card，無文字標題。
- **Bartender** — 不動（已 ship `476e457`）。

## Scope

僅 frontend repo `~/Projects/sipmetry-20260128/`。涉及檔案：
`components/Masthead.tsx`、`app/(tabs)/_layout.tsx`、`app/(tabs)/profile.tsx`、`app/(tabs)/cart.tsx`、`app/(tabs)/inventory.tsx`。

## 關鍵約束

- expo-router `<Tabs>`（bottom-tabs）不會因 `headerShown:false` 重設下方 content frame；`useSafeAreaInsets().top` 不論 header 在否都回傳裝置原值。
- `Masthead` 內部已 `paddingTop: insets.top + 20`，故「加 `<Masthead/>`」本身就補好頂部 inset。**每個 tab 的 `headerShown:false` 與 `<Masthead/>` 必須在同一個 commit 完成 —— 無「只改一半」的安全中間狀態。**
- 各 tab 的外層 wrapper View 需帶 `backgroundColor: OaklandDusk.bg.void`，使 masthead 與 inset 區域為 void 底色（對齊 bartender 的 `styles.root`）。inventory 既有外層 View 已具備；cart / profile 需補上。
- 各 screen 檔本身不需 import `useSafeAreaInsets`，inset 完全由 `Masthead` 處理。

---

## Stage 1: Pre-flight 驗證
**Goal**: 動 code 前確認 risk #4 與 Masthead inset 行為。
**Success Criteria**: LowStockBanner 與 header 的關係有明確結論；Masthead inset baseline 已確認。
**Tests**: 無 code 改動；目視 baseline。
**Status**: Complete

**結論（2026-05-20）**：
- `LowStockBanner` 為 `position:absolute, top:0, zIndex:999` 的全域 overlay，以 hardcoded `paddingTop:54`（註解「safe area + status bar」）自行錨定螢幕頂端，**完全不讀取 native header 幾何**。移除 native header 不影響其定位 —— **risk #4 清除，各 tab stage 無需特別處理**。
- 附帶觀察（pre-existing、out-of-scope）：LowStockBanner 用 hardcoded `54` 而非 `useSafeAreaInsets()`。改造後 Masthead 用動態 `insets.top + 20`，兩者在某些機型可能略不對齊；但 banner 是蓋在 masthead 之上的 5 秒短暫 overlay（zIndex 999），非功能性碰撞、純 cosmetic，且非本次改動造成。建議日後另開小票，本任務不動。
- Masthead inset baseline：bartender 已 ship（`476e457`）且運作正常，即為 baseline。

## Stage 2: Masthead 加 action slot
**Goal**: `Masthead.tsx` 新增 optional `actions?: React.ReactNode`，渲染於 masthead 列右側。非破壞性 —— 不傳 prop 時行為與現狀完全相同。
- `counter` 與 `actions` 皆 optional、互斥使用（bartender 用 `counter`，My Bar 用 `actions`）。
- Masthead 不認識 scan/sort 語意，僅渲染傳入的 ReactNode（composition；按鈕由 inventory.tsx 建構）。
**Success Criteria**: `npx tsc --noEmit` clean；bartender tab 視覺零變化（counter 照舊）。
**Tests**: tsc clean；simulator bartender tab 與 Stage 1 baseline 比對無差異。
**Status**: Complete

**結果（2026-05-20）**：`components/Masthead.tsx` 三處改動如規格（prop 簽名 / 解構 / `{actions}`）；`npx tsc --noEmit` clean；未動 `MASTHEAD_TOP_GAP`、`insets`、logo、`counter` 渲染、style，未碰其他檔案。bartender 傳 `counter`、`actions` 為 undefined，渲染路徑等同未改。已 commit `317662d`（單檔，未 push）。

## Stage 3: Profile tab
**Goal**: profile 改用 masthead、移除 native header。
- `_layout.tsx`：profile `<Tabs.Screen>` 加 `headerShown: false`。
- `profile.tsx`：render 由裸 `<ScrollView>` 改為 `<View>`(flex:1, bg:void) 包 `<Masthead/>` ＋ `<ScrollView>`。
- 無文字標題；ScrollView 第一個 child 仍為 Create Account banner / avatar card。
- headerShown + Masthead 同一 commit。
**Success Criteria**: tsc clean；profile 頂部為 icon masthead；content 不被 status bar / Dynamic Island 遮住；native "Profile" header 消失。
**Tests**: tsc clean；simulator ＋ 實機（Dynamic Island 機型）目視 inset 正確。
**Status**: Complete

**結果（2026-05-20）**：`_layout.tsx` profile screen 加 `headerShown:false`；`profile.tsx` render 改為 `<View flex:1 bg:void>` 包 `<Masthead/>` ＋ `<ScrollView style={{flex:1}}>`，children 邏輯零改動、縮排同步對齊新巢狀層級。tsc clean；iPhone 17 simulator 視覺確認 icon masthead 出現、native header 消失、Create Account banner 不被 Dynamic Island 遮、inset 正確。已 commit `01a8b13`（兩檔同一 commit，未 push）。

## Stage 4: Smart Restock (cart) tab
**Goal**: cart 改用 masthead、移除 native header（已登入與未登入兩個 return path 都加 masthead）。
- `_layout.tsx`：cart `<Tabs.Screen>` 加 `headerShown: false`。
- `cart.tsx` 已登入主 return：外層 `<View>`(flex:1, position:relative) 補 `bg:void`；於其與 `<ScrollView>` 之間插入 `<Masthead/>`；`<ScrollView>` style 由 `{bg:void}` 改為 `{flex:1}`（對齊 bartender/profile）。
- 保留「What to buy next?」headline 為 ScrollView 第一個 content。
- `cart.tsx` 未登入 `if (!session)` return（**改動 C，已定案保留**）：原置中 `<View>` 包進 `<View flex:1 bg:void>` ＋ `<Masthead/>`；原置中 `<View>` 移除自身 `backgroundColor`、其餘不動。未登入狀態也統一有 masthead。
- 兩檔同一 commit。
**Success Criteria**: tsc clean；cart 登入 / 未登入兩狀態頂部皆為 icon masthead；headline 不被遮；native header 消失；建議清單可正常 scroll；Toast 正常。
**Tests**: tsc clean；simulator 登入 / 未登入兩種狀態目視。
**Status**: Complete

**結果（2026-05-20）**：`_layout.tsx` cart screen 加 `headerShown:false`；`cart.tsx` 主 return 外層 `<View>` 補 `bg:void`、插 `<Masthead/>`、`<ScrollView>` style 改 `{flex:1}`；未登入 `!session` 分支（改動 C）包進 `<View flex:1 bg:void>` ＋ `<Masthead/>`。tsc clean；iPhone 17 simulator 主 return 視覺確認 icon masthead 出現、native header 消失、headline 不被遮、inset 正確。未登入分支因 app 有 anonymous session（`!session` 為近乎不可達狀態）無法靠登出觸發，程式碼經 `sed` 逐行核對正確、保留為防禦性一致化。已 commit `a10248c`（兩檔同一 commit，未 push）。

## Stage 5: My Bar (inventory) tab
**Goal**: inventory 改用 masthead（含 `actions`）、重構頂部、移除 native header。
- `_layout.tsx`：inventory `<Tabs.Screen>` 加 `headerShown: false`（per-screen，與 Stage 3/4 同模式）。
- `inventory.tsx`：
  - 加 `Masthead` import；加 `useSafeAreaInsets` import（react-native-safe-area-context，既有 dependency）。
  - 既有外層 `<View>`(flex:1, bg:void) 內、`<ScrollView>` 之前插入 `<Masthead actions={…}/>`；`<ScrollView>` 加 `style={{ flex: 1 }}`。
  - Scan ＋ Sort 兩顆 `Pressable` 由 `headingRow` 移出 → 改為 icon-only 32px 緊湊版（`borderRadius:8`、border `rgba(200,120,40,0.3)`），放進 Masthead 的 `actions`；移除 icon 下的 "Scan"/"Sort" 文字 label；Sort 維持 `inventory.length > 0` 才渲染的條件。
  - 移除 `<Text styles.heading>My Bar</Text>` 與 `headingRow` 包裝。
  - 「12 bottles」(含 `No bottles yet` 動態文字邏輯) 重新樣式化為 22px / weight 500 / `text.primary`，獨立一列、為 ScrollView content 第一列。
  - Sort dropdown：trigger 位置上移，dropdown `marginTop` 改為動態 `insets.top + 60`（≈ MASTHEAD_TOP_GAP 20 + 按鈕高 32 + gap 8），移除 `styles.dropdown` 的靜態 `marginTop:100`。
  - 移除因上述改動而 dead 的 styles（`heading`、`headingRow`，及 `subheading` 若無他處使用）。
- 兩檔同一 commit。
**Success Criteria**: tsc clean；My Bar 頂部 = masthead(logo + Scan/Filter) ＋「12 bottles」22px 列；native header 消失；sort dropdown 對位正確；空 bar 狀態正常；清單可 scroll。
**Tests**: tsc clean；simulator ＋ 實機目視：有 bottle / 空 bar / sort dropdown 開啟 / Dynamic Island inset。
**Status**: Complete

**結果（2026-05-20）**：`_layout.tsx` inventory screen 加 `headerShown:false`；`inventory.tsx` 七個改動 A–G 全數落地 —— Masthead ＋ useSafeAreaInsets import、`iconBtn`/`barCount` styles、`headerActions`（Scan ＋ 條件式 Sort，32px icon-only）、`<Masthead actions={…}/>` 插入、ScrollView 補 `style={{flex:1}}`、heading row 區塊以單行 `barCount` 取代、dropdown `marginTop` 改動態 `insets.top + 60`、移除 dead styles（`heading`/`headingRow`/`subheading`）。tsc clean；iPhone 17 simulator 視覺確認空 bar（只 Scan、"No bottles yet"）與有 bottle（Scan ＋ Sort、"2 bottles"、清單）兩種狀態皆正常、inset 正確。loading early-return 決定不加 masthead（sub-second 轉場）。已 commit `924bff2`（兩檔同一 commit，未 push）。

## Stage 6: _layout.tsx 收尾（純 refactor，無行為改變）
**Goal**: 四 screen 皆已 `headerShown:false` 後，清掉 `_layout.tsx` 的冗餘與 dead config。
- `screenOptions.headerShown` 由 `useClientOnlyValue(false, true)` 改為 `false`。
- 移除四個 `<Tabs.Screen>` 各自的 per-screen `headerShown: false`（bartender / inventory / cart / profile）—— 全域已涵蓋。
- 移除 `screenOptions` 內 dead 的 `headerStyle` / `headerTintColor` / `headerTitleStyle`（header 永不顯示）。
- 移除因此 unused 的 `useClientOnlyValue` import。
- `title`、`tabBar*` 設定、`OaklandDusk` import（tabBar 仍用）保留不動。
**Success Criteria**: tsc clean；四 tab 行為與 Stage 5 完成後完全一致（純 refactor）。
**Tests**: tsc clean；simulator 四 tab 各開一次確認 header 行為無變化。
**Status**: Complete

**結果（2026-05-20）**：`_layout.tsx` `screenOptions.headerShown` 改為 literal `false`；移除 dead 的 `headerStyle`/`headerTintColor`/`headerTitleStyle`；四個 `<Tabs.Screen>` 的 per-screen `headerShown:false` 全數移除；移除 unused `useClientOnlyValue` import。tsc clean；grep 確認全檔僅餘單一全域 `headerShown:false`。`-13/+1` 純收斂，四 tab 行為與 Stage 5 結束時等價。已 commit `083b660`（單檔，未 push）。

---

## 執行分工

- Stage 2–6 皆由 Claude Code 執行（單 / 雙檔機械改動，同一 repo）；Stage 5 改動較多，亦可改派 Cowork。
- 每 stage 一個 commit，stage gate 各自停下 review；commit 由 Brok 執行。

## 驗證序列（frontend）

`npx tsc --noEmit` → simulator / 實機 smoke test → commit。
`run_regression.sh` 為 backend-only，本任務不需。

## 完成後

六個 stage 全數 **Complete**（2026-05-20）。各 stage「結果」欄標註的「未 push」為當時狀態；最終全數已 push（見下）。

### Commits

tab-header 一致化（frontend repo，6 stage / 5 commit）：
`317662d` Masthead actions slot ／ `01a8b13` Profile ／ `a10248c` Smart Restock ／ `924bff2` My Bar ／ `083b660` _layout 收尾。

附帶獨立小修（frontend repo）：
`4e5e2e0` My Bar 空 bar 時隱藏 count 列（`inventory.length > 0` 才渲染，消除與「Your bar is empty」card 的重複）。

backlog 更新（backend repo）：
`f42b5fc` `ROUND_4_BACKLOG.md` 標 tab-header 工單 DONE ＋ 記錄 3 個延伸觀察。

### Push 狀態

- frontend `476e457..4e5e2e0` → `origin/main`，已 push（2026-05-20）。
- backend `026837e..f42b5fc` → `origin/main`，已 push（2026-05-20）。
- 注意：frontend push ≠ 上線。使用者端要看到本次改動需另跑 EAS OTA（無 native 改動、不需新 build），時機由 Brok 定。

### 歸檔

本檔依 R4 archive pattern 歸檔為 `TAB_HEADER_CONSISTENCY_DONE.md`，置於 frontend repo root。

### 延伸觀察 — 已記入 `ROUND_4_BACKLOG.md`（commit `f42b5fc`）

1. `LowStockBanner` 用 hardcoded `paddingTop:54` 而非 `useSafeAreaInsets()`。
2. `inventory.tsx` loading early-return 的 `<ActivityIndicator color="#111">` 在 void 底色上幾乎不可見。
3. `inventory.tsx` loading early-return 無 masthead（已評估，sub-second 轉場，刻意不處理）。
