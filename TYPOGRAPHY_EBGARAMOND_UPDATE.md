# TYPOGRAPHY_EBGARAMOND_UPDATE.md

**Repo:** `~/Projects/sipmetry-20260128`（frontend only。Backend 不碰。）

**這是什麼：** display 字體最終定案。Cinzel（碑刻體 + 全大寫）感覺太冷/兇，改用 **EB Garamond**（溫和書卷體）+ **大小寫**（拿掉全大寫 = 暖的關鍵）。同時把上一輪加入、現已不用的 Cinzel 清掉。

**關鍵：** cart.tsx 吃 `Type` token，所以本次**只改 token + 換字體**，cart.tsx 不動，改動自動 propagate。

## 改動範圍（3 項）

### 1. 字體檔

- 把 Brok 提供的 `EBGaramond-SemiBold.ttf` 放進 `assets/fonts/`。
- **刪除** `assets/fonts/Cinzel-SemiBold.ttf`（上一輪加的，現已不用）。

驗證：`ls assets/fonts/` 應有 `EBGaramond-SemiBold.ttf` + 既有 4 個（BebasNeue / CormorantGaramond / DMMono / DMMonoMedium），**沒有 Cinzel**。

### 2. `app/_layout.tsx` — 換字體註冊

把上一輪加的 Cinzel 那行：
```tsx
Cinzel: require('../assets/fonts/Cinzel-SemiBold.ttf'),
```
改成：
```tsx
EBGaramond: require('../assets/fonts/EBGaramond-SemiBold.ttf'),
```
（其他字體註冊全部保留，BebasNeue 不要動——bartender 仍用它。）

### 3. `constants/typography.ts` — 整檔覆蓋成以下內容

```ts
import type { TextStyle } from 'react-native';

// Universal type scale for Sipmetry — Direction A, display = EB Garamond (warm, sentence case).
// A-i: brand fonts own structural roles; system font owns reading text.
// RN: lineHeight is ABSOLUTE px (not multiplier); letterSpacing is px (not em).
// fontFamily MUST match useFonts() keys in app/_layout.tsx: 'EBGaramond', 'DMMono', 'DMMonoMedium'.
// System roles OMIT fontFamily → SF Pro on iOS. Color applied at usage site from OaklandDusk.

const Type = {
  display: { fontFamily: 'EBGaramond', fontSize: 34, letterSpacing: 0, lineHeight: 40 },
  title:   { fontFamily: 'EBGaramond', fontSize: 22, letterSpacing: 0, lineHeight: 28 },
  heading: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  body:    { fontSize: 15, lineHeight: 24 },
  label:   { fontFamily: 'DMMono', fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  caption: { fontSize: 12, lineHeight: 16 },
  button:  { fontSize: 15, fontWeight: '600' },
} as const satisfies Record<string, TextStyle>;

export default Type;
```

**相對上一版（Cinzel）的 diff：**
- `display` / `title`：`fontFamily` `'Cinzel'` → `'EBGaramond'`、**移除 `textTransform:'uppercase'`**（改回大小寫 = 暖）、size 28/18 → 34/22、letterSpacing → 0、lineHeight 配合放大。
- `heading` / `body` / `label` / `caption` / `button`：**不變**。

**Success Criteria:**
- cart 大標 "What to buy next?" 變 EB Garamond、**大小寫**（不再全大寫）、溫和書卷感。
- "I Want This" 按鈕維持系統半粗、標籤維持 DM Mono。
- cart.tsx **未被修改**（diff 只在 typography.ts / _layout.tsx / 字體檔增刪）。

**Tests:**
```bash
npx tsc --noEmit
```
simulator 開 cart 對照 EB Garamond 全卡 mockup。

**⛔ STOP — 改完停下來等 Brok simulator 確認。** 確認 EB Garamond 有正確載入（大標是溫和襯線、不是 fallback 系統字）再決定是否進其餘畫面 rollout。

**DO NOT:**
- 不要移除 _layout.tsx 既有 BebasNeue / Cormorant 等註冊（bartender 要用）。
- 不要碰 v3DesignTokens.ts / bartender.tsx / Masthead.tsx。
- 不要修改 cart.tsx（token 自動 propagate；若非改不可才會變，停下回報）。
- 不要改顏色 / 間距 / layout。
- 不要 git commit / push——做完回報，commit Brok 自己跑。

**Status:** Not Started

---

## 字體載入驗證（重要）

EB Garamond 是新字體。simulator 上若大標看起來像系統字而非溫和襯線：
1. 確認 `assets/fonts/EBGaramond-SemiBold.ttf` 存在、`_layout.tsx` require 路徑正確。
2. **需重啟 bundler** `npx expo start --clear` 並**重裝 app** 才會 bundle 新字體——OTA 不會塞新字體。
3. 含新字體的正式發佈版本需要一個**新的 EAS build**，不能只靠 OTA。

## 尺寸提醒（tunable）

`display` 用 34px（Brok 在 mockup 看過的尺寸）。EB Garamond 非窄體，若 "What to buy next?" 在實機上換行，可微調 30–32px——這是 token 一個數字的事，simulator 看了再定。

---

## 後續（本 plan 不做）

- **其餘畫面 rollout**：cart 通過 review 後，inventory / profile / recommendations / scan / recipe / profile 子頁 / onboarding / login / qr 比照套 token。
- **bartender 收斂**：仍走 V3 Bebas，hero 版面針對 Bebas 調過，換字需重調 layout，另開題目。
- **Smart Restock 版面**（浮空 hero + #1 PICK badge 撞 +1）：layout，另議。
- **顏色 token 不一致**（OaklandDusk vs V3）：另開 audit。

完成後 archive 為 `TYPOGRAPHY_EBGARAMOND_UPDATE_DONE.md`。
