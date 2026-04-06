# Sipmetry Hard-Coded Consistency Fix Plan

**目標**: 統一前後端 hard-coded 常數，消除邏輯不一致
**工具**: Cowork（跨檔案協調改動）
**注意**: 每個 Stage 完成後需驗證，Stage 1-3 改前端不影響後端，Stage 4+ 需跑 `./run_regression.sh`

---

## Stage 1: 統一 getTasteTags（P0 — 最高優先）

**Goal**: 全 app 用同一個 `getTasteTags` 函數，閾值針對 0–5 scale 校正

**問題**: 目前有 3 個不同版本：
- `bartender.tsx`: 統一閾值 `>= 3`（太嚴，Gin & Tonic 只顯示 "Fizzy"）
- `scan.tsx` + `recipe.tsx`: per-dim 閾值 `>= 0.5`（太鬆，每杯酒都是 "Strong, Sweet, Sour, Bitter"）

**驗證結果**（用 10 款經典雞尾酒模擬，Scheme C = 提案方案）:

```
Cocktail             | A (bartender ≥3)        | B (scan ≥0.5)                | C (proposed)
-----------------------------------------------------------------------------------------------
Margarita            | Sour, Strong            | Strong, Sweet, Sour, Bitter  | Sour
Old Fashioned        | Strong, Full-bodied,... | Strong, Sweet, Sour, Bitter  | Strong, Full-bodied, Bitter
Mojito               | Fizzy, Sweet, Herbal    | Strong, Sweet, Sour, Fruity  | Fizzy, Sweet, Herbal
Negroni              | Bitter, Strong, Aromatic| Strong, Sweet, Sour, Bitter  | Bitter, Strong, Aromatic
Daiquiri             | Sour, Strong            | Strong, Sweet, Sour, Fruity  | Sour, Sweet
Espresso Martini     | Sweet, Aromatic, Strong | Strong, Sweet, Sour, Bitter  | Sweet, Aromatic, Full-bodied
Gin & Tonic          | Fizzy                   | Strong, Sweet, Sour, Bitter  | Fizzy
Whiskey Sour         | Sour, Strong            | Strong, Sweet, Sour, Bitter  | Sour, Sweet
Cosmopolitan         | Sweet, Fruity           | Strong, Sweet, Sour, Bitter  | Sweet, Fruity, Sour
Moscow Mule          | Fizzy                   | Strong, Sweet, Sour, Bitter  | Fizzy, Sour, Spicy
```

Scheme B（scan/recipe）完全沒有區別度。Scheme C 最平衡，每杯酒的 tag 都準確反映其特色。

**改動**:

1. 建立 `lib/tasteTags.ts`（新檔案）：
```ts
/**
 * SSoT for taste tag display across all screens.
 * Recipe vecs are 0–5 scale from backend.
 *
 * Threshold design:
 *   - Core flavors (sweet/sour/bitter/fruity/herbal/fizz): >= 2.5
 *   - Strong character notes (smoky/floral/spicy): >= 2.0 (lower because they stand out)
 *   - High-impact dims (alcoholStrength): >= 3.5 (only truly strong drinks)
 *   - Structural dims (body/aromaIntensity): >= 3.0 (need to be dominant)
 */

const TAG_CONFIG: Array<{
  key: string;
  label: string;
  threshold: number;
  priority: number;
}> = [
  { key: "alcoholStrength", label: "Strong",      threshold: 3.5, priority: 1 },
  { key: "sweetness",       label: "Sweet",       threshold: 2.5, priority: 2 },
  { key: "sourness",        label: "Sour",        threshold: 2.5, priority: 3 },
  { key: "bitterness",      label: "Bitter",      threshold: 2.5, priority: 4 },
  { key: "fruity",          label: "Fruity",      threshold: 2.5, priority: 5 },
  { key: "herbal",          label: "Herbal",      threshold: 2.5, priority: 6 },
  { key: "smoky",           label: "Smoky",       threshold: 2.0, priority: 7 },
  { key: "fizz",            label: "Fizzy",       threshold: 2.5, priority: 8 },
  { key: "body",            label: "Full-bodied", threshold: 3.0, priority: 9 },
  { key: "floral",          label: "Floral",      threshold: 2.0, priority: 10 },
  { key: "spicy",           label: "Spicy",       threshold: 2.0, priority: 11 },
  { key: "aromaIntensity",  label: "Aromatic",    threshold: 3.0, priority: 12 },
];

export function getTasteTags(
  vec: Record<string, number> | null | undefined,
  max = 3
): string[] {
  if (!vec) return [];
  return TAG_CONFIG
    .filter(t => Number(vec[t.key] ?? 0) >= t.threshold)
    .sort((a, b) => {
      const va = Number(vec[a.key] ?? 0);
      const vb = Number(vec[b.key] ?? 0);
      if (vb !== va) return vb - va;
      return a.priority - b.priority;
    })
    .slice(0, max)
    .map(t => t.label);
}
```

2. `bartender.tsx`: 刪除 local `getTasteTags`（~line 57-70），改為 `import { getTasteTags } from "@/lib/tasteTags"`
3. `scan.tsx`: 刪除 local `getTasteTags`（~line 138-154），改為 `import { getTasteTags } from "@/lib/tasteTags"`
4. `recipe.tsx`: 刪除 local `getTasteTags`（~line 54-70），改為 `import { getTasteTags } from "@/lib/tasteTags"`

**Success Criteria**:
- `grep -rn "function getTasteTags" app/ context/ lib/` 只出現在 `lib/tasteTags.ts`
- 同一個 recipe 在 bartender / scan / recipe 頁面顯示相同 tags

**Tests**: `npx tsc --noEmit` + 手動測試 3 個畫面的 tag 顯示一致性

**Status**: Not Started

---

## Stage 2: 統一預設瓶量（P1）

**Goal**: 自動加入 inventory 和手動編輯用同一個預設值

**問題**: `scan.tsx` auto-add 用 `total_ml: 750`（美國標準），`inventory.tsx` EditBottleModal 預設 `setTotalMl(700)`（歐洲標準）

**改動**:

1. 在 `constants/defaults.ts`（新檔案）加入：
```ts
/** Standard US bottle size (ml). Used as default for new inventory items. */
export const DEFAULT_BOTTLE_ML = 750;
```

2. `scan.tsx`: 兩處 `total_ml: 750`（~line 736, 762）改為引用 `DEFAULT_BOTTLE_ML`
3. `inventory.tsx`: `setTotalMl(700)`（~line 290）改為 `setTotalMl(DEFAULT_BOTTLE_ML)`

**Success Criteria**:
- `grep -rn "total_ml: 7[05]0\|setTotalMl(7[05]0)" app/` 回傳 0 結果

**Tests**: `npx tsc --noEmit`

**Status**: Not Started

---

## Stage 3: ontology.ts scale 統一 0–5（P1）

**Goal**: 前端 `INGREDIENT_FLAVOR_MAP`、`PRESET_VECTORS`、`LEVEL_WORDS`、`DEFAULT_FLAVOR_WEIGHTS` 全部對齊到 0–5 scale 與後端一致

**問題**: 前端整個 `ontology.ts` 建立在 `FlavorLevel = 0 | 1 | 2 | 3` 之上，但後端 recipe_flavor_vectors 和 user_preferences 都用 0–5。混用導致：
- `getTasteTags` 閾值失效（0–3 值碰不到 0–5 閾值）
- `LEVEL_WORDS[4]` / `LEVEL_WORDS[5]` 得到 `undefined`
- `scoreStyles` 分數量級偏低

驗證：`scoreStyles` 用線性乘法，等比放大不影響風格排名。`pickStyleWord` 的 `minScore` 和 `tieBreak` 的 threshold 需要等比調整。

**改動**:

### 3a. Type 定義更新
```ts
// Before:
export type FlavorLevel = 0 | 1 | 2 | 3;
// After:
/** 0–5 scale matching backend recipe_flavor_vectors and user_preferences. */
export type FlavorLevel = number;
```

### 3b. INGREDIENT_FLAVOR_MAP 值升級到 0–5
原則：原值 x 5/3 四捨五入到 0.5 步進，再微調。

```ts
export const INGREDIENT_FLAVOR_MAP: Record<IngredientKey, PartialFlavorVector> = {
  gin:    { alcoholStrength: 3, aromaIntensity: 3, herbal: 2 },
  vodka:  { alcoholStrength: 3, aromaIntensity: 0, body: 1.5 },
  rum:    { alcoholStrength: 3, sweetness: 1.5, fruity: 1.5, body: 1.5 },
  tequila:{ alcoholStrength: 3, aromaIntensity: 3, herbal: 1.5 },
  whiskey:{ alcoholStrength: 4.5, body: 3, aromaIntensity: 3 },
  bourbon:{ alcoholStrength: 4.5, sweetness: 1.5, body: 3, aromaIntensity: 3 },
  mezcal: { alcoholStrength: 4.5, smoky: 5, aromaIntensity: 3 },
  brandy: { alcoholStrength: 3, fruity: 1.5, body: 3 },

  lime:       { sourness: 5, aromaIntensity: 1.5 },
  lemon:      { sourness: 5, aromaIntensity: 1.5 },
  orange:     { sourness: 1.5, sweetness: 1.5, fruity: 3, aromaIntensity: 1.5 },
  grapefruit: { sourness: 3, bitterness: 1.5, fruity: 3, aromaIntensity: 1.5 },
  yuzu:       { sourness: 5, aromaIntensity: 3, fruity: 3 },
  umeboshi:   { sourness: 5, aromaIntensity: 3, fruity: 1.5, body: 1.5 },

  "simple syrup": { sweetness: 5, body: 1.5 },
  honey:          { sweetness: 5, body: 3, aromaIntensity: 1.5 },
  "maple syrup":  { sweetness: 5, body: 3 },

  campari:          { bitterness: 5, sweetness: 1.5, aromaIntensity: 3 },
  vermouth:         { sweetness: 1.5, bitterness: 1.5, aromaIntensity: 3, herbal: 1.5 },
  "sweet vermouth": { sweetness: 3, bitterness: 1.5, aromaIntensity: 3, herbal: 1.5 },
  "dry vermouth":   { sweetness: 0, bitterness: 1.5, aromaIntensity: 3, herbal: 1.5 },
  "coffee liqueur": { sweetness: 3, bitterness: 1.5, aromaIntensity: 3, body: 1.5, alcoholStrength: 1.5 },

  "soda water":  { fizz: 5, body: 0 },
  "tonic water": { fizz: 5, bitterness: 1.5, sweetness: 1.5 },
  "ginger beer": { fizz: 5, spicy: 3, sweetness: 3 },

  mint:  { herbal: 5, aromaIntensity: 5 },
  basil: { herbal: 5, aromaIntensity: 3 },
};
```

### 3c. PRESET_VECTORS 升級到 0–5 + deprecated
```ts
/** @deprecated Prefer backend PREF_STYLE_PRESETS_JSON for scoring.
 *  These are only used for local compareFlavorVectors display. */
export const PRESET_VECTORS: Record<PreferencePreset, StrictFlavorVector> = {
  Balanced: { sweetness:1.5, sourness:1.5, bitterness:1.5, alcoholStrength:1.5, aromaIntensity:1.5, herbal:1.5, fruity:1.5, smoky:0, body:1.5, fizz:0, floral:0, spicy:0 },
  Boozy:    { sweetness:0, sourness:0, bitterness:1.5, alcoholStrength:5, aromaIntensity:1.5, herbal:0, fruity:0, smoky:0, body:3, fizz:0, floral:0, spicy:0 },
  Citrus:   { sweetness:0, sourness:5, bitterness:0, alcoholStrength:1.5, aromaIntensity:3, herbal:0, fruity:3, smoky:0, body:0, fizz:0, floral:0, spicy:0 },
  Herbal:   { sweetness:0, sourness:0, bitterness:1.5, alcoholStrength:1.5, aromaIntensity:3, herbal:5, fruity:0, smoky:0, body:1.5, fizz:0, floral:1.5, spicy:0 },
  Sweet:    { sweetness:5, sourness:0, bitterness:0, alcoholStrength:1.5, aromaIntensity:1.5, herbal:0, fruity:1.5, smoky:0, body:3, fizz:0, floral:0, spicy:0 },
};
```

### 3d. LEVEL_WORDS 擴展到 0–5
```ts
const LEVEL_WORDS: Record<
  "alcoholStrength" | "sweetness" | "bitterness",
  Record<number, string>
> = {
  alcoholStrength: { 0:"Soft", 1:"Light", 2:"Medium", 3:"Boozy", 4:"Strong", 5:"Extra Boozy" },
  sweetness:       { 0:"Dry", 1:"Off-dry", 2:"Semi-sweet", 3:"Sweet", 4:"Rich Sweet", 5:"Very Sweet" },
  bitterness:      { 0:"Smooth", 1:"Hint of Bitter", 2:"Slight Bitter", 3:"Bitter", 4:"Bold Bitter", 5:"Very Bitter" },
};
```

`buildFourWordDescriptor` 的 lookup 改為 round + clamp：
```ts
if (typeof a === "number") {
  const idx = Math.min(5, Math.max(0, Math.round(a)));
  const w = LEVEL_WORDS.alcoholStrength[idx];
  if (w) { out.alcoholStrength = w; words.push(w); }
}
// 同理 sweetness, bitterness
```

### 3e. DEFAULT_FLAVOR_WEIGHTS 統一
```ts
export const DEFAULT_FLAVOR_WEIGHTS: FlavorWeights = {
  sweetness: 1, sourness: 1, bitterness: 1,
  alcoholStrength: 1.2, aromaIntensity: 1.1,
  herbal: 1, fruity: 1, smoky: 1,
  body: 1, fizz: 1, floral: 1, spicy: 1,
};
```
（smoky/fizz/floral/spicy 從 0.9 → 1.0，和後端 `DIM_WEIGHTS` 一致）

### 3f. pickStyleWord 閾值等比調整
```ts
// Before (0–3 era):
const minScore = ... : 2.0;
const tieThreshold = ... : 0.4;

// After (0–5 era):
const minScore = ... : 3.3;
const tieThreshold = ... : 0.7;
```

`tieBreak` threshold 調整：
- `body >= 2` → `body >= 3`
- `alcohol >= 2` → `alcohol >= 3`
- `fizz >= 2` → `fizz >= 3`
- `fizz >= 1` → `fizz >= 2`
- `sour >= 2` → `sour >= 3`
- `body <= 1` → `body <= 2`

### 3g. aggregateIngredientVectors — 移除 FlavorLevel cast
Line 172: `Math.max(prev, v) as FlavorLevel` → `Math.max(prev, v)`

### 3h. INGREDIENT_ALIASES 加註釋
```ts
/**
 * Local flavor-lookup aliases. NOT canonical key mapping.
 * Backend smartCanonicalize is the SSoT for canonical keys.
 * These map user-facing names → INGREDIENT_FLAVOR_MAP lookup keys.
 * e.g. "lime juice" → "lime" (because INGREDIENT_FLAVOR_MAP has "lime", not "lime_juice")
 */
```

**Success Criteria**:
- `npx tsc --noEmit` 通過
- `grep -rn "FlavorLevel = 0 | 1 | 2 | 3" context/` 回傳 0 結果
- `LEVEL_WORDS` 支援 key 0–5，不會回傳 undefined

**Tests**: `npx tsc --noEmit` + 手動確認 recipe 頁面的 four-word descriptor 合理

**Status**: Not Started

---

## Stage 4: 提取 bartender scoring 常數到 env（P2 — 後端）

**Goal**: 把 bartender-recommend 的 inline magic numbers 提取為 env-configurable

**改動** (`server.js`):

```js
const BARTENDER_FAV_BONUS       = Number(process.env.BARTENDER_FAV_BONUS || 3.0);
const BARTENDER_LIKE_BONUS      = Number(process.env.BARTENDER_LIKE_BONUS || 2.0);
const BARTENDER_DISLIKE_PENALTY = Number(process.env.BARTENDER_DISLIKE_PENALTY || -5.0);
const BARTENDER_ANCHOR_W        = Number(process.env.BARTENDER_ANCHOR_W || 2.0);
const BARTENDER_PROFILE_W       = Number(process.env.BARTENDER_PROFILE_W || 1.0);
const BARTENDER_MISSING_PENALTY = Number(process.env.BARTENDER_MISSING_PENALTY || 1.5);
```

**注意**: 不改實際值，只改宣告方式。動態 MATERIAL_W / FLAVOR_W 保持 inline。

**Success Criteria**: `node --check server.js` + `./run_regression.sh` 通過

**Status**: Not Started

---

## Stage 5: 補齊 PRESET_KEY_INGREDIENTS 註釋（P2 — 後端）

**Goal**: 說明為什麼 Clean / Rich / Sweet-tooth 沒有 key ingredients

**改動** (`server.js`, ~line 3174): 在 `PRESET_KEY_INGREDIENTS` object 後加註釋：
```js
  // Clean / Rich / Sweet-tooth: these styles are determined by recipe proportions,
  // not specific key ingredients. No hint is needed — users don't need to buy
  // a particular bottle to make a "clean" or "rich" cocktail.
```

**Success Criteria**: `node --check server.js` + `./run_regression.sh` 通過

**Status**: Not Started

---

## Stage 6: splash color（P2 — 前端配置）

**Goal**: splash 背景和 app 暗色主題一致

**改動** (`app.json`):
`splash.backgroundColor`: `"#ffffff"` → `"#07060E"`（OaklandDusk `bg.void`）

**Tests**: `npx expo start` → 確認 splash 顏色

**Status**: Not Started

---

## 不執行的項目

| 項目 | 決定 | 理由 |
|---|---|---|
| `inferCanonicalFromDisplay` 和 `smartCanonicalize` 重複 | **不動** | 前端版本只在手動輸入時用，影響有限 |
| interaction 權重命名加前綴 | **不動** | 已在不同 scope，cosmetic |
| `FLAVOR_SCALE_MAX = 4` | **不動** | 在 0–5 scale 下合理 |
| restock scoring 權重提取到 env | **不動** | 單一 endpoint，無不一致 |
| `app.json` version 保持 `1.0.0` | **不動** | 首次 App Store 提交標準 |

---

## 執行順序

```
Stage 1 (getTasteTags)   → 影響最大、最容易驗證
Stage 2 (瓶量統一)       → 簡單、安全
Stage 3 (ontology 0–5)   → 最大改動，但純前端
Stage 6 (splash)         → 一行改動
--- 以上為前端，以下需要 regression ---
Stage 4 (server.js env)  → 需要 regression
Stage 5 (PRESET 註釋)    → 需要 regression
```

每個 Stage 完成後單獨 commit：
```bash
git add . && git commit -m "fix: [Stage N 摘要]"
```

全部完成後 push：
```bash
git push
```
