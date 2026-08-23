# SCAN_UX_IMPROVEMENTS_DONE.md

**結案:2026-07-13**

## 批次總結

- 原 plan(413 retry loop + 多選照片提示)經開工前 audit 發現大半已在先前 session 完成但未歸檔;本批實際動工僅 **Stage 2d**。
- 本批 code 變更:`components/ScanSourceSheet.tsx` 一檔一處(8 insertions / 3 deletions)。
- guest 語意零接觸;手測確認 Guest bar 開關行為不變。
- 衍生兩項新發現,移交 backlog(見文末),不在本批處理。

---

## Stage 1: 413 retry cascade 重構為 loop

**Status:** Complete(先前 session 已實作;2026-07-13 audit 驗證)

- `app/scan.tsx` 約 1382–1435:`SIZE_CASCADE = [650_000, 350_000, 170_000, 120_000]` for loop、`retry_413_${attempt}` label、非 413 即 break、post-loop 413/generic 錯誤處理,與原 plan NEW block 一致(含 `lastPreUri` 變體:成功 parse 後才 `setImageUri`)。

## Stage 2a/2b: 舊選單(lib/pickBottlePhoto.ts)multi-select 提示

**Status:** Complete(先前 session 已實作;2026-07-13 audit 驗證)

- `showChoiceDialog()` iOS ActionSheet 與 Android Alert 皆為 `"Choose from library (multi-select)"`(grep 2 hits)。
- `launchLibrary()` 確認 `allowsMultipleSelection: true`,提示屬實。

## Stage 2c: Scan More alert 提示

**Status:** Obsolete — Scan More 動線已改走 ScanSourceSheet(guest 案引入),由 Stage 2d 覆蓋。

## Stage 2d: ScanSourceSheet "Choose Photos" 列加 multi-select 提示

**Status:** Complete(2026-07-13,本批唯一動工點)

**File:** `components/ScanSourceSheet.tsx`(L147 一帶)

替換紀錄:

OLD:
```tsx
            <Text style={{ fontSize: 16, fontWeight: "600", color: OaklandDusk.text.primary }}>
              Choose Photos
            </Text>
```

NEW:
```tsx
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: OaklandDusk.text.primary }}>
                Choose Photos
              </Text>
              <Text style={{ fontSize: 12, color: OaklandDusk.text.tertiary }}>
                Select multiple photos at once
              </Text>
            </View>
```

- 樣式沿用同檔 Guest bar 列 title+subtitle pattern(12pt、`text.tertiary`)。
- 同時覆蓋 ScanSourceSheet 所有掛載點(主入口 + Scan More)。

## Stage 3: 驗收

**Status:** Complete(2026-07-13)

1. grep:`pickBottlePhoto.ts` 2 hits("multi-select")+ `ScanSourceSheet.tsx` 1 hit("Select multiple photos")✓
2. `npx tsc --noEmit`:無輸出,exit 0 ✓
3. 手測:
   - ScanSourceSheet subtitle 顯示、版面無跑位 ✓
   - Guest bar 開關行為正常 ✓
   - 相簿可一次多選 ✓
4. 範圍鐵律:僅動 ScanSourceSheet.tsx 一處;Guest bar 列、Switch、props、onPick 簽名、其他檔案均未觸碰 ✓

---

## 衍生發現(移交 backlog)

1. **多選照片確認後延遲**:`launchImageLibraryAsync` 帶 `base64: true`,多選時 picker 需同步編碼每張照片才 resolve,期間無 loading 回饋。pre-existing,非本批造成。候選方向:picker 端不取 base64,輪到分析時才由 uri 取。
2. **多張掃描僅顯示最後一張的清單**:editable 清單只呈現最後一張的辨識結果,但按鈕計數("Based on N ingredients")顯示累積值——資料流疑似未丟、僅顯示以最後一張為主;quick_look(guest)模式下前幾張結果是否留存,待 audit 定性(設計 vs bug)。
