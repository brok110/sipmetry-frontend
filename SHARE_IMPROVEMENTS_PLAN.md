# SHARE_IMPROVEMENTS_PLAN.md

**目標：**
1. recipe.tsx share 按鈕改成 ActionSheet — 提供「Share as text」和「Show QR code」兩個選項
2. Native share 文字末尾加 app link（暫用 placeholder）
3. Backend 加過期 shared_recipes 清理邏輯

**原則：** 最小改動。QR flow 已經完整實作（createShareAndGo + qr.tsx），只需要接上 UI 觸發。

---

## Stage 1: recipe.tsx share 按鈕改成 ActionSheet

**Goal:** 點 share icon 不直接呼叫 handleNativeShare，改為彈出選項讓用戶選擇分享方式。

**File:** `app/recipe.tsx`

**Locator:**
```bash
grep -n 'handleNativeShare\|createShareAndGo\|onPress.*Share' app/recipe.tsx
```

**Actions:**

1. 找到 share 按鈕的 Pressable（約第 1146 行）：
   ```jsx
   <Pressable onPress={handleNativeShare} hitSlop={14} accessibilityLabel="Share recipe" accessibilityRole="button" style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
   ```

2. 建立一個新函數 `handleSharePress`，在 share 按鈕附近（`handleNativeShare` 定義之後）：

   ```javascript
   const handleSharePress = () => {
     if (!dbRecipe) return;
     Alert.alert(
       "Share Recipe",
       recipeTitle || "Share this cocktail",
       [
         {
           text: "Share as Text",
           onPress: handleNativeShare,
         },
         ...(session?.access_token
           ? [{
               text: "Show QR Code",
               onPress: createShareAndGo,
             }]
           : []),
         { text: "Cancel", style: "cancel" as const },
       ]
     );
   };
   ```

   **注意：** QR code 選項只在已登入時顯示（`createShareAndGo` 呼叫的 POST /share-recipe 需要 auth）。

3. 把 share 按鈕的 `onPress` 從 `handleNativeShare` 改為 `handleSharePress`：

   ```jsx
   <Pressable onPress={handleSharePress} hitSlop={14} accessibilityLabel="Share recipe" accessibilityRole="button" style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
   ```

**DO NOT** 改動 `handleNativeShare` 或 `createShareAndGo` 的內部邏輯。
**DO NOT** 移除任何現有函數。

**Tests:**
- `npx tsc --noEmit`

**Status:** Not Started

---

## Stage 2: Native share 加 app link

**Goal:** 在 `handleNativeShare` 的分享文字末尾加上 app link。

**File:** `app/recipe.tsx`

**Locator:**
```bash
grep -n 'Made with Sipmetry' app/recipe.tsx
```

**Actions:**

找到 handleNativeShare 裡組成 message 的那行（約第 812 行）：
```javascript
const message = `${title}\n\n${ingredientsList}\n\nMade with Sipmetry`;
```

改為：
```javascript
const message = `${title}\n\n${ingredientsList}\n\nMade with Sipmetry\nhttps://sipmetry.com`;
```

**注意：** 使用 `https://sipmetry.com` 作為 placeholder。等你有 App Store link 後，改成 `https://apps.apple.com/app/sipmetry/id...`。如果 `sipmetry.com` 目前沒有架設，可以先用 GitHub Pages link：`https://brok110.github.io/sipmetry-frontend/`。

請確認你想用哪個 URL，然後告訴 Claude Code 用那個。建議先用 GitHub Pages link（已經存在）：
```javascript
const message = `${title}\n\n${ingredientsList}\n\nMade with Sipmetry\nhttps://brok110.github.io/sipmetry-frontend/`;
```

**DO NOT** 改動 ingredientsList 的格式化邏輯。
**DO NOT** 改動 Share.share() 的呼叫方式。

**Tests:**
- `npx tsc --noEmit`

**Status:** Not Started

---

## Stage 3: Backend 加過期 shared_recipes 清理

**Goal:** 在 GET /share-recipe/:id 被呼叫時，fire-and-forget 清理 30 天以上的過期 rows。

**File:** `server.js`

**Locator:**
```bash
grep -n 'app.get.*share-recipe' server.js
```

**Actions:**

在 GET /share-recipe/:id handler 的 `return res.json(...)` **之前**，加入 fire-and-forget 清理：

```javascript
// Fire-and-forget: clean up expired shared_recipes older than 30 days
// Runs on each GET to avoid needing a cron job.
// Only deletes rows expired > 30 days ago (not just expired) to be safe.
pool.query(
  `DELETE FROM public.shared_recipes
   WHERE expires_at < now() - interval '30 days'
   LIMIT 100`
).then((result) => {
  if (result.rowCount > 0) {
    log("[share-recipe] cleaned up", result.rowCount, "expired rows");
  }
}).catch(() => {});
```

**注意：** PostgreSQL 的 DELETE 不支援 LIMIT。改用 ctid：

```javascript
pool.query(
  `DELETE FROM public.shared_recipes
   WHERE id IN (
     SELECT id FROM public.shared_recipes
     WHERE expires_at < now() - interval '30 days'
     LIMIT 100
   )`
).then((result) => {
  if (result?.rowCount > 0) {
    log("[share-recipe] cleaned up", result.rowCount, "expired rows");
  }
}).catch(() => {});
```

**DO NOT** 刪除未過期的 rows。
**DO NOT** 讓清理邏輯 block response。
**DO NOT** 改動 GET /share-recipe/:id 的 response 格式。

**Tests:**
- `node --check server.js`
- `./run_regression.sh`

**Status:** Not Started

---

## Stage 4: 驗收

**Actions:**

1. 確認 ActionSheet 存在：
   ```bash
   grep -n 'handleSharePress\|Show QR Code\|Share as Text' app/recipe.tsx
   ```

2. 確認 app link 存在：
   ```bash
   grep -n 'sipmetry-frontend\|sipmetry.com\|apps.apple.com' app/recipe.tsx
   ```

3. 確認清理邏輯存在：
   ```bash
   grep -n 'cleaned up.*expired' server.js
   ```

4. 全部測試：
   ```bash
   # Frontend
   cd ~/Projects/sipmetry-20260128 && npx tsc --noEmit

   # Backend
   cd ~/Projects/sipmetry-backend-20260122 && node --check server.js && ./run_regression.sh
   ```

5. 提交：
   ```bash
   # Frontend
   cd ~/Projects/sipmetry-20260128
   git add . && git commit -m "feat: share ActionSheet (text + QR) + app link in native share" && git push

   # Backend
   cd ~/Projects/sipmetry-backend-20260122
   git add . && git commit -m "fix: auto-cleanup expired shared_recipes on GET" && git push
   ```

**DO NOT push** unless all tests pass.

**Status:** Not Started
