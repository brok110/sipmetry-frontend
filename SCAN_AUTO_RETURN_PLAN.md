# SCAN_AUTO_RETURN_PLAN.md

**目標：** 當 `scan.tsx` 以 `intent=addToBar` 開啟時，「Done」按鈕自動回到 bartender tab，不停在 scan review 頁面。

**原則：** 最小改動。只改 `intent=addToBar` 路徑的行為。不影響一般 scan 流程。

---

## Stage 1: 修改 scan.tsx 的 "Done" 按鈕行為

**Goal:** 當 `intent=addToBar` 時，"Scan More or Done" Alert 的「Done」按鈕改為 `router.back()` 回 bartender，而非進入 review phase。

**File:** `app/scan.tsx`

**Locator:**
```bash
grep -n 'Scan More\|Done.*onPress\|scanPhase.*review\|intent.*addToBar' app/scan.tsx
```

**Actions:**

1. 找到 "Scan More or Done" Alert 的 `useEffect`。搜尋包含 `batchCompleteCount` 的 useEffect（約第 775 行附近）：
   ```bash
   grep -n 'batchCompleteCount' app/scan.tsx
   ```

2. 在該 useEffect 內，找到「Done」按鈕的定義：
   ```javascript
   { text: "Done", onPress: () => setScanPhase("review") },
   ```

3. 修改「Done」按鈕，根據 `intent` 決定行為：

   把：
   ```javascript
   { text: "Done", onPress: () => setScanPhase("review") },
   ```

   改為：
   ```javascript
   {
     text: "Done",
     onPress: () => {
       if (searchParams.intent === "addToBar") {
         // Auto-return to bartender — inventory already updated via context
         router.back();
       } else {
         setScanPhase("review");
       }
     },
   },
   ```

   **注意：** `router` 和 `searchParams` 都已經在 scan.tsx 的 scope 內：
   - `searchParams` 在第 526 行：`const searchParams = useLocalSearchParams<{ ... intent?: string }>();`
   - `router` 需確認是否已有。搜尋：
     ```bash
     grep -n 'useRouter\|const router' app/scan.tsx
     ```
     如果已有 `const router = useRouter();`，直接使用。如果沒有，在 component 頂部加入：
     ```javascript
     const router = useRouter();
     ```
     並確保 `import { useRouter } from "expo-router"` 已存在。

   **DO NOT** 改動 `intent=addToBar` 的 auto-add 邏輯（第 705-726 行）。

   **DO NOT** 改動 "Scan More" 按鈕的行為。

   **DO NOT** 改動一般 scan 流程（非 intent=addToBar）的任何行為。

   **DO NOT** 改動 bartender.tsx。

**Tests:**
- `npx tsc --noEmit` — TypeScript 無錯誤
- 手動測試：
  1. 從 bartender → "Scan my bottles" / "Scan something new" → 掃描 → Alert 顯示 "X bottles added" → 按 Done → 應自動回到 bartender tab
  2. 從 bartender → "Scan something new" → 掃描 → Alert → 按 "Scan More" → 繼續掃描流程正常
  3. 直接進 scan tab（非 intent=addToBar）→ 掃描 → Alert → Done → 進入 review phase（原有行為不變）

**Status:** Not Started

---

## Stage 2: 驗收

**Actions:**

1. 確認改動只影響 intent=addToBar 路徑：
   ```bash
   grep -n 'addToBar' app/scan.tsx
   ```
   預期：原有的 auto-add 邏輯 + 新增的 Done 按鈕判斷。

2. 確認 TypeScript 編譯正常：
   ```bash
   npx tsc --noEmit
   ```

3. 提交：
   ```bash
   git add . && git commit -m "ux: auto-return to bartender after scan addToBar Done" && git push
   ```

**DO NOT push** unless tsc passes.

**Status:** Not Started
