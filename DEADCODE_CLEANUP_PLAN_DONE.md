# DEADCODE_CLEANUP_PLAN.md

**Repo：** `~/Projects/sipmetry-20260128`（frontend only。Backend `sipmetry-backend-20260122` 完全不碰。）

**目標：** 移除一條已驗證、無人使用的 Expo 範本殘留鏈（SpaceMono 字型 + modal route + StyledText + EditScreenInfo）。

**背景（怎麼確認是 dead 的）：** 字型 audit 過程逐層 grep 確認消費鏈：
```
SpaceMono (font) ← StyledText.tsx(MonoText) ← EditScreenInfo.tsx ← app/modal.tsx ← _layout.tsx Stack.Screen
```
`app/modal.tsx` 是 Expo 範本預設 modal，無任何 product 畫面 import；`/modal` 也無任何 `router.push` / deep-link（grep 僅命中 `_layout.tsx` 那行 Stack.Screen 宣告，而該行本身就在移除清單內）。整條鏈確認為無人使用的範本鷹架。

**原則：** 最小改動，範圍嚴格鎖定下列 6 個 target，**不擴張**。

---

## Stage 1: 移除 SpaceMono 範本鏈

**Goal:** 砍掉 6 個 target（2 行 + 4 檔），不留 reference。

**Files / Actions:**

執行順序：先移 `_layout.tsx` 內的兩處 reference，再刪 4 個檔。

### 1a. `app/_layout.tsx` — 移除 modal 的 Stack.Screen

**Locator:**
```bash
grep -n 'name="modal"' app/_layout.tsx
```

移除整行（約第 229 行）：
```tsx
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
```

### 1b. `app/_layout.tsx` — 移除 useFonts 內的 SpaceMono 註冊

**Locator:**
```bash
grep -n 'SpaceMono' app/_layout.tsx
```

在 `useFonts({ ... })` 內移除整行：
```tsx
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
```

**注意：** 同一個 `useFonts` 區塊裡的 `BebasNeue` / `CormorantGaramond` / `DMMono` / `DMMonoMedium` / `...FontAwesome.font` **全部保留**，只刪 SpaceMono 那一行。

### 1c. 刪除 4 個檔

```bash
rm app/modal.tsx
rm components/EditScreenInfo.tsx
rm components/StyledText.tsx
rm assets/fonts/SpaceMono-Regular.ttf
```

**Success Criteria:**
- 下列 grep 全部零命中：
  ```bash
  grep -rn "SpaceMono\|StyledText\|MonoText\|EditScreenInfo" app/ components/ assets/ --include="*.tsx" --include="*.ts"
  grep -rn "'/modal'\|\"/modal\"\|name=\"modal\"" app/ components/ --include="*.tsx" --include="*.ts"
  ```
- `assets/fonts/` 不再列出 `SpaceMono-Regular.ttf`（其餘 4 個 .ttf 仍在）：
  ```bash
  ls -1 assets/fonts/
  ```
  預期僅：`BebasNeue-Regular.ttf`、`CormorantGaramond-LightItalic.ttf`、`DMMono-Medium.ttf`、`DMMono-Regular.ttf`

**Tests:**
```bash
npx tsc --noEmit
```

**typedRoutes 注意事項：** `app.json` 開了 `experiments.typedRoutes`。刪掉 `app/modal.tsx` 後，若 `tsc` 報錯指向殘留的 `/modal` route type（來自舊的 generated types），清掉 generated types 重生即可：
```bash
rm -rf .expo/types && npx expo start --clear   # 起來確認 types 重生後即可中止 (Ctrl+C)
```
然後重跑 `npx tsc --noEmit`。

**DO NOT:**
- 不要動 `useFonts` 內其他 4 個字型 face。
- 不要碰其他 Expo 範本殘留（如 `components/Themed.tsx`、`constants/Colors.ts`，若存在）。刪掉 EditScreenInfo / StyledText 後它們可能變成「新的」未使用檔，這是無害的（TypeScript 不會因為未使用的檔案報錯），**留待另一個 task 處理，本 plan 不碰。**
- 不要動 backend repo。

**Status:** Not Started

---

## Stage 2: 驗收 + commit

**Actions:**

1. 確認 Stage 1 的兩個 grep 都零命中、`ls assets/fonts/` 正確（見上）。
2. `npx tsc --noEmit` 通過。
3. 驗收通過後 commit（依既有 workflow，git commit 由 Brok 執行 / 說「收工」觸發）：
   ```bash
   git add -A && git commit -m "chore: remove unused Expo template residue (SpaceMono font + modal/StyledText/EditScreenInfo)" && git push
   ```
   （用 `git add -A` 確保檔案刪除有被 stage。）

**DO NOT push unless `npx tsc --noEmit` passes.**

**部署：** frontend-only、無 native module 變動 → OTA (EAS Update) 即可，不需 full EAS build。

**Status:** Not Started

---

## 完成後

本 plan 完成後 archive 為 `DEADCODE_CLEANUP_PLAN_DONE.md`。下一個 task：方向 A（品牌化全 app）——typography token 抽進共用層 + 逐 surface 套用，另開 plan。
