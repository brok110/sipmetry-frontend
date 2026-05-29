# MASTHEAD_HEADER_TRIM — Bartender masthead / native header redundancy fix ✅ DONE

**建立**: 2026-05-19
**完成**: 2026-05-19（commit `476e457`）
**Repo**: frontend (sipmetry-20260128) — frontend-only，無 backend 改動
**Backlog source**: `ROUND_4_BACKLOG.md` §「Bartender masthead follow-up」→ iOS NavigationStack "Bartender" large title redundancy
**狀態**: 全 stage 完成，本檔由 `IMPLEMENTATION_PLAN.md` archive 而來。

---

## 背景與 root cause

bartender tab 同時顯示兩層 top chrome：

1. `_layout.tsx:63` `headerShown: useClientOnlyValue(false, true)` → iOS native 評估為 `true`，整個 `<Tabs>` navigator 對 4 個 tab 一律開 native header；bartender 的 `<Tabs.Screen>` `title: "Bartender"`（line 76）成為 header 文字。
2. `bartender.tsx` 的 5 個 render branch（B0/B1/B2/B4/B5；B3 已移除）各自 render `<Masthead/>`（icon-only logo）。

兩者是同一 brand surface 疊兩次。`bartender.tsx` 本身**無任何 header config**（grep 確認，唯一 hit 為 line 346 一句無關註解），所以 redundancy 在 5 個 branch 均勻發生 — 非 branch-specific。backlog 原本「某 branch 缺 `headerShown: false`」的假設與程式碼不符，已修正：實際是 layout 層單一設定的問題。

**Companion 問題**：`Masthead.tsx` 的 `paddingTop: 20` 是寫死常數，import 無 `SafeAreaView` / `useSafeAreaInsets`。目前靠 native header 撐開頂部空間。header 一旦移除，screen 頂邊變成裝置實體頂端，`paddingTop: 20` 從絕對頂端量起 — Dynamic Island 機型 top safe-area inset ≈ 54-59pt，`20 < 54`，24×24 logo 會落入 Dynamic Island 底下。因此 header-disable **必須**搭配 Masthead safe-area inset，不可單獨上。

---

## 方案

**Option A（採用）**：只關 bartender tab 的 header（在 `<Tabs.Screen>` 層 override `screenOptions`），其他 3 tab 不動。搭配 `Masthead.tsx` 改用 `useSafeAreaInsets`。

不採 **Option B**（改 `_layout.tsx:63` 全域關 header）— 會牽動 My Bar / Smart Restock / Profile 是否仍需 header 顯示各自 `title`，屬 product/design 決定，超出本次純技術範圍。

**關鍵設計**：`paddingTop` 改為 `insets.top + MASTHEAD_TOP_GAP`。header 移除後 `insets.top`（iPhone 17 ≈ 59）成為唯一頂部間距，已清掉 Dynamic Island，`MASTHEAD_TOP_GAP` 為純呼吸空間。

> ⚠️ **2026-05-19 修正**：原 plan 假設「有 native header 時 `useSafeAreaInsets().top` 回傳 0」並據此把 fix 拆成 Stage 1（Masthead，零視覺變化）/ Stage 2（`_layout.tsx`）。**此假設錯誤** — 該行為屬 native-stack，bottom-tabs（expo-router `<Tabs>`）的 header 不重設 content 的 safe-area inset，`insets.top` 永遠回傳裝置原始值。Stage 1 單獨驗證時 masthead 被多推 ≈ 59pt，觸發失敗 gate。**結論：不存在安全的零變化中間狀態，兩個改動必須合併為單一 stage 一起套、一起驗、一起 commit。** 詳見下方「修正紀錄」。

---

## Stage 0: Pre-flight verification

**Goal**: 動工前確認兩項事實，無程式碼改動。
**Owner**: Brok（需 repo 存取）

**Success Criteria**:
- `package.json` 含 `react-native-safe-area-context`（expo-router / react-navigation 既有 peer dependency，預期已存在）。
- 確認 `useSafeAreaInsets` 在 `<Tabs>` 內的 screen 可用 — react-navigation 的 navigator 內部會 render `SafeAreaProviderCompat`，screen 內直接呼叫即可；如 root layout 另有 `SafeAreaProvider` 亦可。
- 取得所有 import `@/components/Masthead` 的檔案清單。

**Tests / 指令**:
```
grep -n 'react-native-safe-area-context' package.json
grep -rl 'components/Masthead' app/
```

**驗證結果** (2026-05-19):
- `package.json:46` → `"react-native-safe-area-context": "~5.6.0"` — dependency 確認存在。
- `grep -rl 'components/Masthead' app/` → 唯一結果 `app/(tabs)/bartender.tsx`。**Masthead 為 bartender 獨用元件**。
- `SafeAreaProvider`：react-navigation `<Tabs>` navigator 內建 `SafeAreaProviderCompat`，screen 內 `useSafeAreaInsets` 可用，無需額外掛載。

**決策 gate 結論**: PASS。Stage 2 視覺驗證範圍鎖定 = bartender 5 branch；其他 tab 不受影響、不需驗。

**Status**: Complete

---

## Stage 1: Disable bartender native header + Masthead safe-area inset（合併）

**Goal**: 一次套上兩個改動（`Masthead.tsx` + `_layout.tsx`），關閉 bartender native header 並讓 masthead 正確避開 Dynamic Island；5 branch 視覺驗證；定 `MASTHEAD_TOP_GAP` 最終值。兩改動必須一起 — 不存在安全的單獨中間狀態。
**Owner**: Claude Code（兩檔機械改動）→ Brok simulator 驗證 + 單一 commit

**改動 A** (`components/Masthead.tsx`) — 已由 Claude Code 套用，**保留不退**（對 headerless 目標狀態正確）：
- import `{ useSafeAreaInsets }` from `react-native-safe-area-context`。
- 模組層 const `MASTHEAD_TOP_GAP`（具名常數，沿用 `DRINK_SIZE` / `SWIPE_THRESHOLD` pattern）。
- 元件內 `const insets = useSafeAreaInsets();`。
- `<View style={[styles.masthead, { paddingTop: insets.top + MASTHEAD_TOP_GAP }]}>`。
- `styles.masthead` 移除寫死的 `paddingTop`。

**改動 B** (`app/(tabs)/_layout.tsx`):
- bartender `<Tabs.Screen options>`（line 73-78）加 `headerShown: false`。
- `title: "Bartender"` **保留** — bottom-tabs 的 `title` 同時驅動 tab bar label，刪除會使 glass icon 下方標籤 fallback 成小寫 route name。
- `_layout.tsx:63` 全域 `headerShown` 不動。

**`MASTHEAD_TOP_GAP` 最終值**：`20`（實機 iPhone 17 驗證間距剛好，未調整）。

**驗證結果** (2026-05-19，實機 iPhone 17，飛航模式)：
- B5 hero（exploration 變體）：native header 消失、S logo 完整在 Dynamic Island 下方無重疊、banner / hero / THE LIST / tab bar 正常。
- B2 error（`centerFill` 系代表）：masthead 正常、native header 消失、error 內容置中、tab bar 正常 → B0/B1/B4 結構相同，5 branch 覆蓋齊。
- My Bar tab：native "My Bar" header 照常顯示 → 確認 Option A 未誤傷其他 tab。
- tab bar "Bartender" label 保留、tab 切換正常。
- Dynamic Island 鬼影：先前 simulator 出現的 "THE LIST" 殘影經實機確認為 iOS Simulator DI 區 render artifact，與 app code 無關（實機完全乾淨）。

**Commit**: `feat(bartender): hide native header, masthead as sole page chrome`（`476e457`，2 files changed, +9/-2）

**Status**: Complete

---

## 修正紀錄

**2026-05-19 — Stage 1/2 拆分失敗，合併**

- **嘗試**：原 plan 將 fix 拆為 Stage 1（`Masthead.tsx` 改 `insets.top + GAP`，預期零視覺變化）與 Stage 2（`_layout.tsx` 加 `headerShown: false`）。Stage 1 先單獨套用驗證。
- **失敗現象**：Claude Code 套用 Stage 1 後，simulator before/after 截圖比對顯示 masthead 連同 hero card 整體下移 ≈ 59pt（iPhone 17 top inset），非預期的零變化。`npx tsc --noEmit` clean，故非型別問題，是 layout 行為。
- **原因**：拆分前提「有 native header 時 `useSafeAreaInsets().top` 回傳 0」錯誤。此 inset-reset 行為屬 `@react-navigation/native-stack`；expo-router 的 `<Tabs>`（bottom-tabs）header 不重設下方 content 的 safe-area frame，`useSafeAreaInsets().top` 不論 header 在否都回傳裝置原始值。
- **修正**：放棄拆分。不存在安全的零變化中間狀態（只上 Masthead → 低 59pt；只上 `_layout.tsx` → logo 進 Dynamic Island）。兩改動合併為單一 Stage 1，一起套、一起驗、一起 commit。`Masthead.tsx` 改動本身正確（對 headerless 目標狀態），保留不退。
- **gate 表現**：plan 預先寫入的 ⚠️ 失敗 gate（截圖位移即停、不 commit）正確攔截，無錯誤 commit 產生。

---

## 不適用 / 排除項

- **backend `run_regression.sh`**: N/A — 本次 frontend-only，無 `server.js` / ontology / scoring 改動。
- **EAS build**: 改動為 JS-only（config + component），可走 OTA push；下一個 EAS build 自然帶上。是否立即 OTA 由 Brok 決定，不在本 plan 範圍。
- **平台範圍**：`headerShown: false` 為跨平台設定 — Android 的 bartender tab 同樣會移除 native header；`useSafeAreaInsets` 在 Android 回傳 status bar inset，Masthead 行為一樣正確。redundancy 在 Android 同樣存在、移除同樣正確。惟 Stage 2 視覺驗證為 iOS simulator；考量目前 iOS-only launch（June 2026 App Store），iOS 驗證即足夠，Android 視覺可日後 spot-check，不 block 本 plan。
- **其他 tab 的 masthead redundancy**：Stage 0 確認 `<Masthead/>` 為 bartender 獨用 → inventory / cart / profile 無 masthead，靠 native header 顯示 title chrome。此事實同時驗證 Option A 正確：Option B（全域關 header）會使這 3 個 tab 完全無 title chrome。無獨立 audit 需求。
- **SS1/SS2 截圖差異追查**：backlog 描述「SS2 inventory state 只顯示 masthead」仍無法解釋，且 Stage 0 進一步排除一種可能 — inventory tab 根本不 render `<Masthead/>`，故 SS2 若為 inventory tab 不可能「只顯示 masthead」。SS2 更可能是不同時間點 / build 的 bartender 截圖（例如 masthead logo swap `62a63bc` / `cb6f66a` 之前）。純屬考古；本 fix 讓 bartender header 一致消失，與 SS2 為何如此無關，不 block。

## Rollback

- Stage 2 revert：移除 `headerShown: false` 一行 → native header 復原。
- Stage 1 revert：`Masthead.tsx` 還原寫死 `paddingTop: 20`、移除 const 與 hook。
- 兩 stage 皆 isolated commit，可獨立 revert。

## Stage gate 流程

每個 stage 完成 → Claude review diff → Brok 驗證 → 通過才進下一 stage。Stage 1、2 各一 commit，全數通過前不 push。完成全部 stage 後本檔 archive 為 `MASTHEAD_HEADER_TRIM_DONE.md`。
