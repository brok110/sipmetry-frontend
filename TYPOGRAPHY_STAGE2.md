# TYPOGRAPHY_STAGE2.md — inventory + profile

**Repo:** `~/Projects/sipmetry-20260128`（frontend only。Backend 不碰。）

**前置：** Stage 1（typography.ts + cart）已 commit（`6b7f7be`）。`Type` token 與 EBGaramond 字體已就緒。本 Stage 純 token 套用、無新字體 → **OTA 即可，不需 build**。

**目標：** 把 `inventory.tsx`、`profile.tsx` 的 inline / StyleSheet 字型樣式換成 `Type` token。沿用 cart 的 pattern：套 token、**顏色維持 OaklandDusk**、語意不明的留原樣標記回報。

> 註：本檔取代舊 `TYPOGRAPHY_ROLLOUT_PLAN.md` 的 Stage 2（那份是 Bebas 時代、已過時，可刪）。

---

## 兩種套法（重要：兩支檔結構不同）

**profile.tsx = inline style**（同 cart）：
```tsx
<Text style={[Type.heading, { color: OaklandDusk.text.primary }]}>{label}</Text>
```

**inventory.tsx = StyleSheet.create 具名樣式**：把 token spread 進具名 style，**保留 color 與 layout props（margin/padding），移除 token 已提供的 fontSize/fontWeight/letterSpacing/textTransform**：
```tsx
// before
barCount: { fontSize: 22, fontWeight: '500', color: OaklandDusk.text.primary },
// after
barCount: { ...Type.title, color: OaklandDusk.text.primary },

// before
sectionHeader: { fontSize: 11, fontWeight: '700', color: OaklandDusk.text.tertiary,
                 textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 12, marginBottom: 4, paddingLeft: 2 },
// after
sectionHeader: { ...Type.label, color: OaklandDusk.text.tertiary, marginTop: 12, marginBottom: 4, paddingLeft: 2 },
```

兩支都要 `import Type from '@/constants/typography';`

---

## Stage 2a: `inventory.tsx`（StyleSheet）

具名 text 樣式對應：

| style 名 | 現值 | → role | 備註 |
|---|---|---|---|
| `barCount` | 22 / 500 | **title** | EB Garamond 露出點（「12 bottles」）|
| `emptyTitle` | 18 / 800 | **title** | 空狀態標題 |
| `emptySubtitle` | 14 / lh20 | body | |
| `sectionHeader` | 11 / 700 大寫 ls0.8 | label | 已是大寫 letterspaced，完美對應 |
| `dropdownTitle` | 11 / 700 大寫 ls0.8 | label | |
| `dropdownItemText` | 15 / 500 | body | |
| `dropdownItemTextActive` | 700 + 色 | **留原樣** | 這是 active 狀態 override（加粗+變色），保留 |
| `cardName` | 16 / 800 | heading | 酒名，系統字（同 cart 的 ingredient 名）|
| `cardMeta` | 13 | caption | |
| `errorText` | 700 + error 色 | body | 保留 error 色 |
| `editBtnText` / `editActionText` | 13 / 700 | **留原樣** | 精簡次要按鈕，套 button(15) 會放大、不要 |
| `dropdownCheckmark` / `deleteBtnText` | 字符 ↑↓✓× | **留原樣** | 是符號不是文字 |

讀全檔，上表沒列到的 text 樣式比照判斷；不確定的留原樣並回報。

**Tests:** `npx tsc --noEmit` → simulator 開 My Bar tab 自看（barCount「12 bottles」變 EB Garamond、空狀態標題 EB Garamond、分類 section header 仍 DM Mono 大寫）。

## Stage 2b: `profile.tsx`（inline）

| 文字（行號參考）| 現值 | → role | 備註 |
|---|---|---|---|
| row `{label}` (38) | 600 | heading | |
| 選單列 label (360/379/398/417) | 14 | body | Favorites / Taste DNA 等導頁列 |
| "Create Account" (154) | gold 800/16 | heading | 保留 gold |
| "Protect your data…" (157) | tertiary 13 | caption | |
| userEmail (173) | 600 | heading | |
| "Not signed in" (176) | — | body | |
| "Sign In" (186) | 800 void | button | 保留 void 色 |
| "Recipe Units" / "Sound Effects" (256/310) | 600 | heading | 設定列標題 |
| "Sign Out" (438) | 700 crimson | button | 保留 crimson 色 |
| 版本/footer (454/476) | 13 disabled/tertiary | caption | |
| "›" 箭頭 (39/363/…) | 16 | **留原樣** | 符號 |
| oz/ml toggle (272/291) | 700/13 | **留原樣** | 精簡 segmented control |

讀全檔比照處理；不確定留原樣回報。

> profile 視覺變化會很小（整頁多為系統字設定列，token 值 ≈ 現值）——這是預期的，本頁 migrate 主要是 token 一致性，不是視覺改版。

**Tests:** `npx tsc --noEmit` → simulator 開 Profile tab 自看。

---

## 驗收與提交

1. `npx tsc --noEmit` 通過。
2. simulator 開 My Bar + Profile 兩 tab 自看（對照預期）。
3. 回報每支改了哪些、對到哪些 role、哪些留原樣。
4. **⛔ STOP 等 Brok review**，通過後再 commit（Brok 執行）：
   ```bash
   git add -A && git commit -m "feat(type): apply typography scale to inventory + profile"
   ```

**部署：** 純 token 套用、無 native 變動 → OTA (EAS Update)。

**DO NOT:**
- 不要碰 `v3DesignTokens.ts` / `bartender.tsx` / `components/Masthead.tsx`（inventory 的 header 是 `<Masthead/>`，不要動它）。
- 不要碰 `constants/typography.ts` / `_layout.tsx` / `cart.tsx`（已完成）。
- 不要改顏色 / 間距 / layout / 任何邏輯——只動字型樣式。
- `dropdownItemTextActive`、`editBtnText`、`editActionText`、toggle、箭頭、checkmark 等**留原樣**（見表）。
- 不要進 Stage 3 其他畫面。
- 不要 git commit / push——做完回報，commit Brok 自己跑。

**Status:** Not Started

完成後 archive 為 `TYPOGRAPHY_STAGE2_DONE.md`。
