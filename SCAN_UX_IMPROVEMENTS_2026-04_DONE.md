# SCAN_UX_IMPROVEMENTS_PLAN.md

**目標：**
1. 413 retry cascade 重構為 loop（code quality）
2. 多選照片的 UI 提示：在 ActionSheet / Alert 的 "Choose from library" 選項下方或旁邊，讓用戶知道可以多選

**原則：** 最小改動，不改業務邏輯。413 retry 的行為完全不變（同樣的降級 sequence），只是程式碼更乾淨。

---

## Stage 1: 413 retry cascade 重構為 loop

**Goal:** 把 4 層嵌套 if 改成一個 for loop，行為完全不變。

**File:** `app/scan.tsx`

**Locator:**
```bash
grep -n 'retry_413\|preprocessImageForAnalyze\|resp.status === 413' app/scan.tsx
```

**Actions:**

找到 analyze() 函數內的 413 retry 區塊（約第 1477-1545 行）。目前的結構是：

```javascript
const pre = await preprocessImageForAnalyze(imageUri, pickedBase64, 650_000);
// ... send ...
if (resp.status === 413) {
  const pre2 = await preprocessImageForAnalyze(imageUri, pickedBase64, 350_000);
  // ... send ...
  if (resp.status === 413) {
    const pre3 = await preprocessImageForAnalyze(imageUri, pickedBase64, 170_000);
    // ... send ...
    if (resp.status === 413) {
      const pre4 = await preprocessImageForAnalyze(imageUri, pickedBase64, 120_000);
      // ... send ...
    }
  }
}
```

替換為一個 loop：

```javascript
const SIZE_CASCADE = [650_000, 350_000, 170_000, 120_000];
let resp: Response | null = null;

for (let attempt = 0; attempt < SIZE_CASCADE.length; attempt++) {
  const maxBytes = SIZE_CASCADE[attempt];
  const pre = await preprocessImageForAnalyze(imageUri, pickedBase64, maxBytes);
  setLastUploadInfo({
    stage: attempt === 0 ? "preprocess" : `retry_413_${attempt}`,
    base64_chars: pre.base64.length,
    width: pre.width,
    height: pre.height,
  });

  resp = await apiFetch("/analyze-image", {
    session,
    method: "POST",
    body: { image_base64: pre.base64, return_raw: true, return_detected_items: true, return_display: true },
  });

  setLastHttpStatus(resp.status);

  // Update imageUri to the preprocessed version (for display)
  if (attempt === 0) {
    setImageUri(pre.uri);
  }

  if (resp.status !== 413) break; // Success or non-413 error — stop retrying
}

if (!resp || !resp.ok) {
  const t = resp ? await resp.text() : "No response";
  if (resp?.status === 413) {
    throw new Error(
      "Ingredient API failed: 413 (payload too large). Please crop tighter or use a closer shot. (Tip: focus on the label area only.)"
    );
  }
  throw new Error(`Ingredient API failed: ${resp?.status ?? "unknown"} ${t}`);
}
```

**注意：** 原本的 `setImageUri(pre.uri)` 只在第一次 attempt 做（保持 imageUri 為第一次的 preprocessed URI）。後續 retry 只改 base64 payload 大小，不改顯示的圖片。

確認 `pre` 的 scope 在 loop 結束後不需要被存取（response parsing 在 loop 之後用的是 `resp`，不是 `pre`）。如果後續 code 有用到 `pre.uri`，需要把最後一次的 `pre` 保存到 loop 外的變數。搜尋：
```bash
grep -n 'pre\.uri\|pre\.base64' app/scan.tsx | grep -v 'preprocessImageForAnalyze'
```

如果有在 413 retry 區塊之後用到 `pre`，在 loop 外宣告 `let lastPre = pre;` 並在 loop 內更新。

**DO NOT** 改動 413 retry 的 SIZE_CASCADE 值。
**DO NOT** 改動 apiFetch 的 body 內容。
**DO NOT** 改動 loop 之後的 response parsing 邏輯（respText → parsed → data）。

**Tests:**
- `npx tsc --noEmit`

**Status:** Not Started

---

## Stage 2: 多選照片 UI 提示

**Goal:** 在「Choose from library」選項旁加提示文字，讓用戶知道可以一次選多張照片。

**File:** `app/scan.tsx`

**Locator:**
```bash
grep -n 'Choose from library\|Choose an option\|ActionSheetIOS' app/scan.tsx
```

**Actions:**

找到兩處「Choose from library」文字：

**2a. iOS ActionSheet（約第 1729 行）：**

找到：
```javascript
options: ["Cancel", "Take a photo", "Choose from library"],
```

改為：
```javascript
options: ["Cancel", "Take a photo", "Choose from library (multi-select)"],
```

**2b. Android Alert（約第 1742 行）：**

找到：
```javascript
{ text: "Choose from library", onPress: () => { resetScan(); pickImage(); } },
```

改為：
```javascript
{ text: "Choose from library (multi-select)", onPress: () => { resetScan(); pickImage(); } },
```

**2c. "Scan More" 內的同樣 Alert（約第 823-824 行）：**

搜尋 "Scan More" alert 裡面的 "Choose from library"：
```bash
grep -n 'Choose from library' app/scan.tsx
```

所有出現的地方都改成 `"Choose from library (multi-select)"`。

**DO NOT** 改動 pickImage() 的邏輯（它已經支援 allowsMultipleSelection: true）。
**DO NOT** 改動 takePhoto() 的邏輯。

**Tests:**
- `npx tsc --noEmit`

**Status:** Not Started

---

## Stage 3: 驗收

**Actions:**

1. 確認 413 retry 是 loop：
   ```bash
   grep -n 'SIZE_CASCADE\|retry_413' app/scan.tsx
   ```
   預期：SIZE_CASCADE 定義 1 處 + retry stage label 在 loop 內。

2. 確認多選提示存在：
   ```bash
   grep -n 'multi-select' app/scan.tsx
   ```
   預期：3 處（iOS ActionSheet + Android Alert + Scan More alert）。

3. TypeScript 編譯：
   ```bash
   npx tsc --noEmit
   ```

4. 提交：
   ```bash
   git add . && git commit -m "refactor: 413 retry loop + multi-select photo hint in scan UI" && git push
   ```

**DO NOT push** unless tsc passes.

**Status:** Not Started
