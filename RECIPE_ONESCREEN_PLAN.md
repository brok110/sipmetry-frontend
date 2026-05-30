# RECIPE_ONESCREEN_PLAN.md

**Repo:** `~/Projects/sipmetry-20260128`（frontend only。Backend 不碰。）

**這是什麼：** 接續 sticky CTA footer（已做、未 commit），再瘦身 recipe.tsx 的固定開銷，讓**約 85-90% 的食譜（材料 + 步驟）初始畫面一屏全顯示**。純 layout，**不碰任何邏輯、不碰字型**。

**資料依據（不是拍腦袋）：** 材料數 ≤4 = 84%；步驟長度「短(1-2行)」= 77%、「中(3-4行)」= 21%、「長(5-6行)」僅 2 支。交叉後約 85-90% 的酒能一屏；剩餘少數（多材料 + 中長步驟）自然往下捲，CTA sticky 永遠可按。**版面一套、不分流、不判斷長短。**

**狀態說明：** 此 plan 假設 sticky footer 改動（`RECIPE_STICKY_CTA_PLAN`）已在 working tree（未 commit）。本 plan 疊加在其上，最後**兩者一起一個 commit**。

## 改動（3 處純數字，皆 layout）

### 1. hero 圖高度 250 → 150（L1281）

```tsx
// before
<View style={{ width: "100%", height: 250, backgroundColor: OaklandDusk.bg.void }}>
// after
<View style={{ width: "100%", height: 150, backgroundColor: OaklandDusk.bg.void }}>
```
（省 100px — 這是「一屏」最關鍵的一刀。Brok 已在 mockup 確認 150。）

> 注意：hero 內的 LinearGradient `height: 50`（L1297）維持不變即可（150 高度上 50px 漸層比例仍合理）。

### 2. 份量 stepper 收緊（L1443 附近）

stepper 容器目前 `marginTop: 12`，按鈕 36×36、gap 16。收緊：
```tsx
// 容器 marginTop: 12 → 8（L1443 附近的 stepper 外層 View）
```
按鈕尺寸 36→32、gap 16→12（L1450/L1471 的 width/height、L1442 的 gap）：
```tsx
// 兩顆 Pressable: width: 36, height: 36 → width: 32, height: 32
// 容器 gap: 16 → 12
```
（省約 20-30px。視覺仍清楚可點。）

### 3. 主內容區 gap 收緊（L1302）

```tsx
// before
<View style={{ padding: 16, gap: 12 }}>
// after
<View style={{ padding: 16, gap: 10 }}>
```
（各區塊間距小收，省約 20px。padding 16 維持，不要動水平邊距。）

---

## 不做 / 不動

- **不做 Instructions 內捲框** — 資料顯示長步驟僅 2 支，為 2 支加內捲框是過度工程。長步驟那少數自然捲即可。
- **不動 Like/Dislike** — 保留（功能重要，省的空間有限）。
- **不動字型** — 酒名 EB Garamond、section header、計量等已定案，一律不碰。
- **不動 hero 內的 Image resizeMode / gradient / overlay 邏輯** — 只改外層 View 的 height 數字。
- **不動任何邏輯** — handleMadeDrink、份量計算、計量、recipe 載入、favorite/hint，全部不碰。
- **不動 ingredient list / 可用性 / tag / error 區塊。**

---

## 驗收

1. `npx tsc --noEmit` 通過。
2. simulator 進 recipe 自看，**測幾種酒**：
   - **短食譜（2-4 材料 + 1-2 行步驟，如 Bee's Knees / Gimlet）**：材料 + 步驟 + CTA **初始畫面一屏全顯示、不用捲**。← 主要目標
   - **多材料食譜（5+ 材料，如 Whiskey Sour）**：接近一屏，可能差最後一行 → 捲一點點（可接受）。
   - hero 150 圖比例 OK、不變形（resizeMode cover）。
   - stepper 收緊後仍清楚可點。
   - CTA sticky 維持正常（上一步的 footer 行為不變）。
3. 回報改動摘要 + 各測試酒的一屏情況。
4. **⛔ STOP 等 Brok review。** 通過後 commit（Brok 執行，**含 sticky footer + 本次瘦身**）：
   ```bash
   git add -A && git commit -m "feat(recipe): one-screen layout — sticky CTA + hero 150 + tightened spacing"
   ```

**部署：** 純 layout、OTA。

**DO NOT:**
- 不要碰任何邏輯 / 字型 / 顏色（只動 height / margin / gap / 按鈕尺寸 數字）。
- 不要動 ingredient list / 計量 / 可用性 / tag / Like-Dislike / error。
- 不要動 hero 的 Image / gradient / overlay（只改外層 View height）。
- 不要做 Instructions 內捲框。
- 不要碰其他檔案。
- 不要 git commit / push——做完回報，commit Brok 自己跑。

**Status:** Not Started

完成後 archive 為 `RECIPE_ONESCREEN_PLAN_DONE.md`（可與 sticky CTA plan 一併歸檔）。
