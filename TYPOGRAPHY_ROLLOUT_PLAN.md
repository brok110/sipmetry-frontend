# TYPOGRAPHY_ROLLOUT_PLAN.md

**Repo:** `~/Projects/sipmetry-20260128`（frontend only。Backend 不碰。）

**目標：** 把品牌 typography 從「只存在於 bartender feed」推廣到全 app，做法是建立一套通用 type scale token，逐頁套用。Body/內文維持系統字（可讀性優先）。

## 已定案的設計決定

- **A-i**：body / heading / caption 用**系統字**（iOS SF Pro）；只有 display / title / label / button 用品牌字。
- **B-1**：新開 `constants/typography.ts` 當**全 app 通用 type scale 的唯一 source**。`constants/v3DesignTokens.ts`（bartender feed 專屬精密排版）**原封不動、完全不碰**——它的 49px drinkName 那種 preset 是 feed 限定，不該套到別頁。
- **Direction A（Balanced）**：品牌字鋪「結構」（大標、section、標籤、按鈕），系統字鋪「內容」。

## 角色 → 字型對應（Direction A）

| Role | 字型 | 用途 |
|---|---|---|
| `display` | BebasNeue 32 | 頁面大標（每頁最上面那個）|
| `title` | BebasNeue 22 | section 標題、Bebas 數字 badge |
| `heading` | 系統 600 / 17 | 卡片標題、清單項目名、row label |
| `body` | 系統 / 15·lh24 | 描述、步驟、說明（最常用）|
| `label` | DMMono 11 · uppercase | 標籤、kicker、metadata |
| `caption` | 系統 / 12 | 次要可讀小字 |
| `button` | DMMonoMedium 11 · uppercase | CTA |

**顏色不在 typography token 內**——color 仍由 usage site 從 `OaklandDusk` 帶（typography token 只管 fontFamily / size / weight / letterSpacing / lineHeight）。這維持「字型」與「顏色」兩套系統分離。

---

## Stage 1: 建 token + pilot 一頁（cart.tsx）

**Goal:** `typography.ts` 建好，`cart.tsx` 完整套用，驗證 pattern 成立。

**為何選 cart 當 pilot：** 它就是 mockup 示範的那頁、中等大小（782 行）、display/heading/body/label/button 範例都齊。

### 1a. 建立 `constants/typography.ts`（逐字建立此內容）

```ts
import type { TextStyle } from 'react-native';

// Universal type scale for Sipmetry — Direction A "Balanced".
// A-i: brand fonts (Bebas / DM Mono) own structural roles; system font owns reading text.
// RN notes: lineHeight is ABSOLUTE px (not a multiplier); letterSpacing is px (not em).
// fontFamily strings MUST match useFonts() names in app/_layout.tsx:
//   'BebasNeue', 'DMMono', 'DMMonoMedium'. System roles OMIT fontFamily → SF Pro on iOS.
// Color is NOT included here — apply color at usage site from OaklandDusk.

const Type = {
  display: { fontFamily: 'BebasNeue', fontSize: 32, letterSpacing: 1, lineHeight: 34 },
  title:   { fontFamily: 'BebasNeue', fontSize: 22, letterSpacing: 0.8, lineHeight: 24 },
  heading: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  body:    { fontSize: 15, lineHeight: 24 },
  label:   { fontFamily: 'DMMono', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  caption: { fontSize: 12, lineHeight: 16 },
  button:  { fontFamily: 'DMMonoMedium', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },
} as const satisfies Record<string, TextStyle>;

export default Type;
```

### 1b. 套用到 `cart.tsx`

- `import Type from '@/constants/typography';`
- 逐一把 inline 魔術數字 text style 換成 `...Type.<role>`，**color 維持原本從 OaklandDusk 帶的值**。
- 具體對應範例（讀全檔後比照處理所有 Text，不限這幾處）：
  - `fontSize:28, fontWeight:"600"`（"What to buy next?"，約 line 281）→ `...Type.display`
  - `fontSize:20, fontWeight:"900"`（"Smart Restock" 空狀態標題，約 line 259）→ `...Type.title`
  - 空狀態說明文字（約 line 260）→ `...Type.body`
  - restock 卡片的 ingredient 名稱 → `...Type.heading`
  - "Unlocks N cocktails" 描述 → `...Type.body`
  - `+N` badge（Bebas 金色）→ `...Type.title` + 金色（size 可在 usage 微調）
  - 標籤 / kicker / availability → `...Type.label`
  - 價格 → `...Type.caption`
  - "Add to cart" 等按鈕文字 → `...Type.button`

**寫法範例：**
```tsx
// before
<Text style={{ fontSize: 28, fontWeight: "600", color: OaklandDusk.text.primary }}>What to buy next?</Text>
// after
<Text style={[Type.display, { color: OaklandDusk.text.primary }]}>What to buy next?</Text>
```

**Success Criteria:**
- cart 畫面：頁面大標變 Bebas、標籤/按鈕變 DM Mono（大寫）、描述維持系統字好讀。
- `label` / `button` 因 token 內含 `textTransform:'uppercase'`，文字會轉大寫（這是 Direction A 預期行為）。

**Tests:**
```bash
npx tsc --noEmit
```
然後 simulator 開 cart tab（Smart Restock），對照 mockup Direction A 自看。

**⛔ STOP — Stage 1 完成後停下來，等 Brok 在 simulator 看過 cart 再決定是否進 Stage 2。** 這是 pilot gate：pilot 看起來對，pattern 才算驗證、才往下鋪。

**DO NOT:**
- 不要碰 `v3DesignTokens.ts` 或 `bartender.tsx` / `Masthead.tsx`（已品牌化、走 V3，零回歸風險為上）。
- 不要改任何顏色、間距、layout——**只動 typography**。
- 不要動 `_layout.tsx` 的 navigation header（`headerTitleStyle` 等）——iOS NavigationStack large title 行為另議，本 rollout scope 外。
- 不要把 `fontFamily:'System'` 硬寫進系統角色——omit fontFamily 即可（iOS 自動 SF Pro）。
- Text 若語意不明該對哪個 role，**留原樣並標記**回報，不要硬塞。

**Status:** Not Started

---

## Stage 2: 主要 tab 頁 rollout（inventory.tsx, profile.tsx）

**前置：** Stage 1 通過 Brok 的 simulator review。

**Goal:** 用 Stage 1 驗證過的同一 pattern，套用 `inventory.tsx`、`profile.tsx`。

**Actions:** 同 1b 的對應規則，逐頁 import `Type`、換 text style、保留顏色。

**Success / Tests:** 每頁 `npx tsc --noEmit` 通過 + simulator 開該 tab 自看。一次處理一頁、各自可檢查。

**DO NOT:** 同 Stage 1。

**Status:** Not Started

---

## Stage 3: 次要畫面 rollout

**前置：** Stage 2 完成。

**Goal:** 套用其餘畫面：`recommendations.tsx`、`scan.tsx`、`recipe.tsx`、`profile/favorites`、`profile/feedback`、`profile/preferences`、`profile/taste-dna`、`onboarding`、`login`、`qr`。

**Actions:** 同上 pattern。建議一次 1–2 頁、各自 tsc + smoke，避免一次改太多難 review。

**Success / Tests:** 每頁 `npx tsc --noEmit` + simulator 自看。

**DO NOT:** 同 Stage 1。

**Status:** Not Started

---

## 驗收與提交（每個 Stage 共用）

順序：
1. `npx tsc --noEmit` 通過。
2. simulator 開對應畫面，對照 mockup Direction A 自看（字型階層對、內文好讀）。
3. 通過後 commit（git 由 Brok 執行 / 說「收工」觸發）。建議每個 Stage 一個 commit：
   - Stage 1: `feat(type): add universal typography scale (Direction A) + migrate cart`
   - Stage 2: `feat(type): apply typography scale to inventory + profile`
   - Stage 3: `feat(type): apply typography scale to remaining screens`

**Push 前 `npx tsc --noEmit` 必須通過。** Frontend-only、無 native 變動 → OTA (EAS Update)。

---

## Scope 外（本 plan 不處理，記著）

- **顏色 token 不一致**：`OaklandDusk`（gold #C87828 / void #08070C / text #F0E4C8）vs `v3DesignTokens`（gold #C9A458 / void #07060E / text #EDE6D6）有肉眼可能察覺的落差。另開 audit，不混進字型。
- **navigation header typography**：iOS NavigationStack large title 行為另議。
- **bartender V3 與通用 token 是否未來統一**：暫不動；B-1 刻意讓兩者並存（一個通用、一個 feed 專屬）。

完成後 archive 為 `TYPOGRAPHY_ROLLOUT_PLAN_DONE.md`。
