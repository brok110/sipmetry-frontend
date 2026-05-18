# Bartender Excludes Wiring Audit

**Date**: 2026-05-17
**Status**: Audit complete; UI implementation deferred to post-launch
**Audit context**: Round 4 ontology debt cleanup backlog
**Related commit**: `9d75324` (frontend, inline comment that punted to this audit)

---

## TL;DR

`selectedExcludes` 這個前端 state 從未被 mutate（zero setter call），但 backend `/bartender-recommend` 已經完整實作 filter logic、接受兩個 family 的 exclude token。結論：**這不是 dead code，是 backend-ready / frontend-not-wired 的 planned feature**。所有 wiring 點都在這份文件記錄，未來要做 UI 時可以直接從這裡接。

---

## Frontend wiring 現況

File: `app/(tabs)/bartender.tsx`

| Line | 用途 | 性質 |
|---|---|---|
| 169 | `const [selectedExcludes, setSelectedExcludes] = useState<string[]>([])` | State 宣告 |
| 217 | `excludes: selectedExcludes` in useEffect signature | Reader (refetch trigger) |
| 263 | `excludes: selectedExcludes` in POST body | Reader (API payload) |

**Setter call sites**: 0。

useState 的 setter 是 component-local scope，所以「全 repo 沒人 call `setSelectedExcludes`」可以肯定 — setter 不可能被 import 出去。`selectedExcludes` 永遠是 `[]`，永遠不會變。

---

## Backend contract 證據

File: `sipmetry-backend-20260122/server.js`

| Line | 段落 | 用途 |
|---|---|---|
| 3222–3223 | `req.body?.excludes` ingestion | Array → lowercase + trim，上限 10 |
| 3267 | log line | Debug 看 filter input |
| 3454–3472 | 真正的 filter logic | 完整實作，會真實刪 candidates |
| 3706 | `filters` object assembly | 傳給 `buildExplainText` |
| 3776 | `meta.filters.excludes` in response | 回傳給前端讓 client 知道 server 看到了什麼 |

關鍵段落是 3454–3472 — 這是 working production code，不是 stub：

```js
if (excludes.length > 0) {
  candidates = candidates.filter(r => {
    const keys = r.ingredient_keys || [];
    const vec = r.recipe_vec || {};

    for (const ex of excludes) {
      if (ex.startsWith("no_")) {
        const spirit = ex.replace("no_", "");
        if (keys.some(k => k === spirit || k.includes(spirit))) return false;
      }
      if (ex === "too_sweet"  && Number(vec.sweetness       || 0) >= 2.5) return false;
      if (ex === "too_bitter" && Number(vec.bitterness      || 0) >= 2.5) return false;
      if (ex === "too_strong" && Number(vec.alcoholStrength || 0) >= 2.5) return false;
    }
    return true;
  });
}
```

---

## Token 格式

Backend 接受兩個 token family：

### Family 1: `no_<spirit>`

Pattern: 前綴 `no_` + ingredient_key 片段。Substring match against `r.ingredient_keys`。

範例：
- `no_gin` → 任何 ingredient_key 包含 `gin` 都會被排除
- `no_whisky` → 排除 whisky-based recipes
- `no_rum` → 排除 rum-based recipes

⚠️ 是 substring match 不是 exact match — `no_gin` 也會排除 `sloe_gin`，`no_rum` 會排除 `dark_rum`、`white_rum` 等所有 rum variant。這是 feature 也是潛在 footgun，UI 設計要注意命名跟使用者預期。

### Family 2: `too_<dimension>`

Pattern: 固定三個 token，對 `recipe_vec` 做 0–3 scale threshold 過濾。

| Token | Filter rule |
|---|---|
| `too_sweet` | `recipe_vec.sweetness ≥ 2.5` 被排除 |
| `too_bitter` | `recipe_vec.bitterness ≥ 2.5` 被排除 |
| `too_strong` | `recipe_vec.alcoholStrength ≥ 2.5` 被排除 |

`2.5` threshold 對應「0–3 scale 上的 top 1/6」（最強的那批）。

### Sanitization

`server.js:3222–3223`：
- `Array.isArray` guard → 非 array fallback to `[]`
- 每個 element：`String(s).trim().toLowerCase()`
- 空字串 filter 掉
- 上限 `slice(0, 10)` — 超過 10 個會被截斷

---

## 為什麼這不是 dead code

對比 dead code 應該有的特徵：

| 特徵 | Dead code 預期 | 實際觀察 |
|---|---|---|
| Backend handler 存在 | ❌ 應該不存在或 stub | ✅ 完整 19 行 filter logic |
| Logic 跟 schema 一致 | ❌ 應該過時 | ✅ 用最新的 0–3 scale（同 4e 範圍） |
| Response meta echo | ❌ 不會回傳 | ✅ `meta.filters.excludes` 有回傳 |
| Buildable explain | ❌ 不會接 | ✅ `buildExplainText` 簽名有接（body 沒用，見 follow-up） |

四項都指向「有人認真實作過 backend、只是 UI 沒跟上」。

---

## 缺的部分

只有一件事：**frontend UI input layer**。

具體缺什麼：
- 某個 UI 元件能 call `setSelectedExcludes(...)` 把 token 加進 array
- Token 來源可以是任何形式（chip、long-press menu、preferences sync、smart inference）— 這份 audit **不提案** UI 設計，避免變 product brief

---

## Open product question (post-launch)

未來做 UI 時，要先回答的問題（不是這份 audit 的範圍）：

**使用者該如何表達「我不要 X」？**

不同方向有不同 tradeoff，這份 audit 不替未來自己決定。建議做 user research / dogfooding feedback 後再選方向。

---

## Follow-ups

一個 cosmetic 項目跟今天 audit 同源，可順手做也可不做：

**`buildExplainText` unused `excl` arg** (`server.js:1602`)
函式簽名 `({ baseSpirits: spirits, stylePresetNames: presets, excludes: excl })` 接了 `excl` 但 body 完全沒用。屬於 cosmetic dead-arg，砍掉不影響行為。建議併入 4i ontology guide cleanup 或下一輪 P3 hygiene 處理。
