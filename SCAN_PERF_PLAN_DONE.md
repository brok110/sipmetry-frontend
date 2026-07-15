# SCAN_PERF_PLAN.md — Picker base64 移除(SCAN-PERF)

- 日期:2026-07-14
- 對應 backlog:backend repo `ROUND_4_BACKLOG.md` SCAN-PERF 條目(2026-07-13 logged)
- 改動範圍:`lib/pickBottlePhoto.ts` 一檔,兩個 OLD/NEW replacement
- 狀態:Ready for execution

## 背景與目標

- 現象:相簿多選 N 張按確認後卡數秒、零 loading 回饋,才進 scan 流程。
- 成因:`launchCamera` / `launchLibrary` 都帶 `base64: true`,picker resolve 前同步把每張選中照片編成 base64,選 N 張 = N 份編碼等待。
- Audit 結論(2026-07-14 定案):
  - `preprocessImageForAnalyze`(app/scan.tsx)主路徑由 `ImageManipulator.manipulateAsync(uri, ...)` 自產 base64;picker 給的 base64 只是 manipulate 10 級全失敗時的最後保底。
  - scan.tsx 的 deep-link 路徑今天已以 `{ uri, base64: null }` 在生產環境跑同一條 pipeline。
  - 全 repo 呼叫者僅 `app/scan.tsx` 與 `app/(tabs)/inventory.tsx`;inventory 只取 `a.uri`,base64 零使用(拔掉後其多選延遲同步消失,零改動)。
- 修法:拔掉兩處 `base64: true`。camera 一併拔(Brok 2026-07-14 拍板)。

## 範圍鐵律

- **只准動 `lib/pickBottlePhoto.ts`**。本 plan 沒點名的檔案一字不碰。
- 不動:`PickedPhoto` 型別、`asset.base64 ?? null` / `a.base64 ?? null` 對映、JSDoc、`app/scan.tsx`、`app/(tabs)/inventory.tsx`。
- 不加 loading 回饋(另案)。guest 語意(scanMode 三態、intent 解析、Stage 6 guard、guest body 旗)、`multiScanResults`、queue 結構,一字不碰。
- **任一 OLD block 不完全匹配 → 立即停止,回報實際內容,不做任何修改。**

## Replacement 1 — launchCamera 拔 base64

OLD:
```typescript
  const result = await ImagePicker.launchCameraAsync({
    quality: 0.9,
    exif: false,
    base64: true,
  });
```

NEW:
```typescript
  const result = await ImagePicker.launchCameraAsync({
    quality: 0.9,
    exif: false,
  });
```

## Replacement 2 — launchLibrary 拔 base64

OLD:
```typescript
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    quality: 0.9,
    exif: false,
    base64: true,
  });
```

NEW:
```typescript
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    quality: 0.9,
    exif: false,
  });
```

## 行為說明(為何安全)

- 拔掉後 expo 回傳的 `asset.base64` 為 `undefined`,既有 `?? null` 對映自然產出 `null`;`PickedPhoto.base64: string | null` 契約不變,兩個呼叫端零改動、零型別變更。
- 代價:manipulate 全失敗時失去 picker 保底,退化為 scan.tsx 既有友善報錯(deep-link 路徑今日已是此行為)。
- 附帶收益:多張照片的 base64 字串(每張數 MB)不再囤在 `imageQueueRef` 與 `pickedBase64` state。

## 驗證與停止點(Claude Code)

- 執行完兩個 replacement 後跑 `npx tsc --noEmit`。
- **tsc 通過即停。不 commit、不 push、不跑其他指令。**
- 回報:git diff 全文 + tsc 輸出 + 兩個 OLD block 匹配狀況。

## 手測清單(Brok,收到回報核對後)

a. Scan tab 主入口 → 相簿多選 5 張 → 按確認到進流程的體感前後對比(核心驗收:應近乎即時)
b. 相簿單張
c. 相機路徑單張
d. Inventory tab 入口 → 相簿多選 → deep-link 進 scan(免費受益路徑)
e. `SCAN_UX_ACCUMULATE_DONE.md` Stage 3 的 a–e 回歸腳本重跑

## 收案順序

1. 手測通過 → `git add lib/pickBottlePhoto.ts && git commit -m "perf(scan): remove picker base64 encoding to fix multi-select confirm lag" && git push`(Brok 執行)
2. JS-only 改動:`eas update --auto --platform ios`
3. backend repo `ROUND_4_BACKLOG.md` 將 SCAN-PERF 標 DONE
4. 本檔改名 `SCAN_PERF_PLAN_DONE.md` 歸檔
