# PROFILE_FIXES_PLAN.md

**目標：**
1. 在 profile.tsx 加入 Taste DNA 的選單入口
2. Preferences save 時寫到 backend（user_preferences.manual_vector）
3. Bartender 推薦結果也要 apply safety mode filter

**原則：** 最小改動，每個 stage 獨立。

---

## Stage 1: 在 profile.tsx 加 Taste DNA 入口

**Goal:** 在 Favorites 下方加一個 ProfileRow 連結到 /profile/taste-dna。

**File:** `app/(tabs)/profile.tsx`

**Locator:**
```bash
grep -n 'Favorites' app/\(tabs\)/profile.tsx
```

**Actions:**

找到 Favorites 的 ProfileRow（約有 `label="Favorites"` 的那段），在它**之後**加入：

```jsx
<ProfileRow
  icon="flask"
  label="Taste DNA"
  onPress={() => router.push("/profile/taste-dna")}
/>
```

插入位置：在 Favorites 的 `<ProfileRow ... />` 結束之後，Recipe Units toggle 的 `<View>` 之前。

**DO NOT** 改動其他 menu items。
**DO NOT** 改動 ProfileRow component。

**Tests:**
- `npx tsc --noEmit`

**Status:** Not Started

---

## Stage 2: Preferences save 寫到 backend

**Goal:** preferences.tsx 的 `save()` 在更新 local context 之後，fire-and-forget 呼叫 API 把 `manual_vector` 寫入 `user_preferences` 表。

**Files:** 
- `app/profile/preferences.tsx`（前端）
- `server.js`（backend — 確認 `/preferences/learn` 或新增一個 endpoint）

**分析：**

目前 `user_preferences` 表有 `manual_vector` column，但沒有寫入它的 endpoint。`/preferences/learn` 只寫 `learned_vector`。

最簡單的方式：新增一個 `POST /preferences/manual` endpoint，或者擴展 `/preferences/learn` 讓它也接受 manual_vector。

我建議新增 `POST /preferences/save` endpoint：

**2a. Backend: 新增 POST /preferences/save**

**File:** `server.js`

在 `/preferences/learn` endpoint **之後**加入：

```javascript
// POST /preferences/save — save user's manually-set preference vector + safety settings
app.post("/preferences/save", requireAuth, async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ error: "service_unavailable" });

    const { manual_vector, safety_mode } = req.body || {};

    // Validate manual_vector shape
    let validatedVector = null;
    if (manual_vector && typeof manual_vector === "object") {
      validatedVector = {};
      for (const d of PREF_DIMS) {
        const v = Number(manual_vector[d]);
        validatedVector[d] = Number.isFinite(v) ? Math.max(0, Math.min(5, v)) : PREF_MID;
      }
    }

    // Validate safety_mode shape
    let validatedSafety = null;
    if (safety_mode && typeof safety_mode === "object") {
      validatedSafety = {
        avoidHighProof: Boolean(safety_mode.avoidHighProof),
        avoidAllergens: Boolean(safety_mode.avoidAllergens),
        avoidCaffeineAlcohol: Boolean(safety_mode.avoidCaffeineAlcohol),
      };
    }

    await pool.query(
      `INSERT INTO public.user_preferences (user_id, manual_vector, safety_mode, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, now())
       ON CONFLICT (user_id) DO UPDATE
         SET manual_vector = COALESCE($2::jsonb, user_preferences.manual_vector),
             safety_mode = COALESCE($3::jsonb, user_preferences.safety_mode),
             updated_at = now()`,
      [req.user_id, validatedVector ? JSON.stringify(validatedVector) : null, validatedSafety ? JSON.stringify(validatedSafety) : null]
    );

    log("[preferences/save] user:", req.user_id);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[preferences/save] error:", err?.message || err);
    return res.status(500).json({ error: "server_error" });
  }
});
```

**注意：** `user_preferences` 表可能沒有 `safety_mode` column。先檢查：
```bash
grep -n 'safety_mode' server.js
```

如果 DB 沒有 `safety_mode` column，先跑 migration：
```sql
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS safety_mode jsonb DEFAULT NULL;
```

**2b. Frontend: preferences.tsx save() 加 API call**

**File:** `app/profile/preferences.tsx`

找到 `save()` 函數（約第 306 行）。在 `setPreferences({ ... })` 之後加 fire-and-forget API call：

```javascript
const save = () => {
  if (!hydrated || saving) return;
  setSaving(true);

  const newPrefs = {
    stylePreset: draftStyle,
    dims: {
      alcoholStrength: draftAlcohol,
      sweetness: draftSweetness,
      bitterness: draftBitterness,
    },
    safetyMode: {
      avoidHighProof: draftAvoidHighProof,
      avoidAllergens: draftAvoidAllergens,
      avoidCaffeineAlcohol: draftAvoidCaffeineAlcohol,
    },
  };

  setPreferences(newPrefs);

  // Fire-and-forget: sync to backend
  if (session?.access_token) {
    apiFetch("/preferences/save", {
      session,
      method: "POST",
      body: {
        manual_vector: {
          sweetness: draftSweetness === "low" ? 1 : draftSweetness === "high" ? 4 : PREF_MID,
          bitterness: draftBitterness === "low" ? 1 : draftBitterness === "high" ? 4 : PREF_MID,
          alcoholStrength: draftAlcohol === "low" ? 1 : draftAlcohol === "high" ? 4 : PREF_MID,
        },
        safety_mode: newPrefs.safetyMode,
      },
    }).catch((e) => console.warn("[preferences/save] sync failed:", e?.message));
  }

  setTimeout(() => setSaving(false), 800);
};
```

**重要：** 確認 preferences.tsx 的 FlavorLevel type（"low"/"balanced"/"high" 或數字）再決定 manual_vector 的值轉換。先搜尋：
```bash
grep -n 'FlavorLevel\|type FlavorLevel' app/profile/preferences.tsx
```
根據實際 type 調整上面的 mapping。如果已經是 0-5 數字就直接傳。

確認 `apiFetch` 和 `useAuth` 已 import（preferences.tsx 可能沒有 import 它們）：
```bash
grep -n 'apiFetch\|useAuth\|import.*api\|import.*auth' app/profile/preferences.tsx
```
如果沒有就加 import。

**DO NOT** 改動 `setPreferences` 的邏輯。
**DO NOT** 讓 API call block save 操作（必須 fire-and-forget）。

**Tests:**
- `node --check server.js`
- `npx tsc --noEmit`

**Status:** Not Started

---

## Stage 3: Bartender 推薦結果 apply safety mode filter

**Goal:** bartender.tsx 在收到推薦結果後，用和 scan.tsx 相同的邏輯過濾 safety mode 不合格的酒譜。

**File:** `app/(tabs)/bartender.tsx`

**Locator:**
```bash
grep -n 'setResults\|data.recommendations' app/\(tabs\)/bartender.tsx
```

**Actions:**

1. 確認 bartender.tsx 已 import usePreferences：
   ```bash
   grep -n 'usePreferences\|preferences' app/\(tabs\)/bartender.tsx
   ```
   預期已有（用於 `profile_style_preset`）。

2. 需要在 bartender.tsx 加入 safety evaluation 函數。這些函數在 scan.tsx 裡定義但不是 shared。

   最簡單的方式：在 bartender.tsx 的 `fetchRecommendations` 中，收到結果後加 filter。

   但問題是 bartender 的推薦結果沒有 `alcohol_warning`、`allergen_warning`、`caffeine_warning` 這些 fields——它們是 scan.tsx 在前端用 `evaluateRecipeSafety()` 計算的。

   **最乾淨的方式是把 safety filter 移到 backend。** 在 `/bartender-recommend` 裡加入 safety mode 參數，讓 backend 過濾。但這個改動較大。

   **最快的方式是在前端做。** bartender.tsx 的 recommendation 結果有 `recipe_vec`，可以用 `alcoholStrength` 來判斷 high proof。但沒有 allergen 和 caffeine 資訊（需要 ingredient 層級的分析）。

   **務實的方式：** 先只 filter `avoidHighProof`（用 recipe_vec.alcoholStrength），allergen 和 caffeine 的 filter 留到後續（需要 backend 支援）。

   找到 `fetchRecommendations` 函數中 `setResults(data.recommendations || [])` 那行：

   改為：
   ```javascript
   let recs = data.recommendations || [];
   let away = data.one_away || [];

   // Apply safety mode filters
   if (preferences.safetyMode?.avoidHighProof) {
     const isHighProof = (pick: Pick) => {
       const strength = Number(pick.recipe_vec?.alcoholStrength ?? 0);
       return strength > 3.5;
     };
     recs = recs.filter((r: Pick) => !isHighProof(r));
     away = away.filter((r: Pick) => !isHighProof(r));
   }

   setResults(recs);
   setOneAway(away);
   ```

   **DO NOT** 改動 `fetchRecommendations` 的 API call body。
   **DO NOT** 改動 hint 的設定邏輯。
   **DO NOT** 加 allergen/caffeine filter（需要 backend 改動，留到後續）。

**Tests:**
- `npx tsc --noEmit`

**Status:** Not Started

---

## Stage 4: 驗收

**Actions:**

1. 確認 Taste DNA 入口存在：
   ```bash
   grep -n 'taste-dna\|Taste DNA' app/\(tabs\)/profile.tsx
   ```

2. 確認 /preferences/save endpoint 存在：
   ```bash
   grep -n 'preferences/save' server.js
   ```

3. 確認 bartender safety filter 存在：
   ```bash
   grep -n 'avoidHighProof\|safetyMode' app/\(tabs\)/bartender.tsx
   ```

4. 全部測試：
   ```bash
   node --check server.js && npx tsc --noEmit
   ```

5. Backend regression：
   ```bash
   cd ~/Projects/sipmetry-backend-20260122 && ./run_regression.sh
   ```

6. 提交（兩個 repo）：
   ```bash
   # Backend
   cd ~/Projects/sipmetry-backend-20260122
   git add . && git commit -m "feat: POST /preferences/save for manual_vector + safety_mode sync" && git push

   # Frontend
   cd ~/Projects/sipmetry-20260128
   git add . && git commit -m "feat: taste-dna menu entry + preferences backend sync + bartender safety filter" && git push
   ```

**DO NOT push** unless all tests pass.

**Status:** Not Started
