# RECIPE_STICKY_CTA_PLAN.md

**Repo:** `~/Projects/sipmetry-20260128`（frontend only。Backend 不碰。）

**這是什麼：** `app/recipe.tsx` 的「I made this」主 CTA 目前在捲動流最底，要往下捲才看得到。改成**固定底部 footer**：永遠可見、不用捲，且**不遮任何內容**。純 layout 改動，**不碰任何邏輯**。

**與字型線無關** — 字型 rollout 已 commit（`f53a852`）。本 plan 是獨立的 layout 改動，獨立 commit。

## 核心原理（「不遮」的保證）

footer 做成 **ScrollView 的 flex 兄弟，不是 absolute 浮層**：footer 佔畫面最底自己的一塊，ScrollView 用上面剩下的高度。捲動內容永遠在 footer 上方，捲到底也不會被蓋。再把 ScrollView 的 `paddingBottom` 加大，確保最後一行內容能完整捲出 footer 之上。

現有外層結構（L1190–1603）：
```
<View flex:1>                          ← L1191
  <Stack.Screen ... />                 ← L1192
  <ScrollView paddingBottom:40>        ← L1193
     ... 全部內容，含 CTA（L1515–1569）...
  </ScrollView>                        ← L1579
  {feedbackToast && <Animated.View absolute bottom:90 .../>}  ← L1582（toast）
</View>                                ← L1603
```

---

## 改動（4 處，純 layout）

### 1. 加 safe-area import

檔案頂部 import 區加入（若尚未 import）：
```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';
```
在 component 函式內取得 insets（與其他 hooks 並列）：
```tsx
const insets = useSafeAreaInsets();
```

### 2. ScrollView paddingBottom 加大（L1195）

```tsx
// before
contentContainerStyle={{ paddingBottom: 40 }}
// after
contentContainerStyle={{ paddingBottom: 100 }}
```
（確保最後一行 Instructions 步驟能完整捲到 footer 之上，不被遮。）

### 3. 把 CTA 整塊從 ScrollView 內移除

剪下 L1515–1569 整塊：
```tsx
{/* Primary CTA: Make this cocktail — placed after instructions per UX flow */}
{session && dbRecipe && madeDrinkState !== 'hidden' ? (
  <HintBubble storageKey={GUIDE_KEYS.GP_STEP_6} ...>
    <Pressable onPress={...} ...>
      ... I made this ...
    </Pressable>
  </HintBubble>
) : null}
```
**連同 `HintBubble` 包裹一起搬**（內部邏輯、onPress、handleMadeDrink、條件式完全不變）。

**error 區塊（L1571–1576）留在 ScrollView 內，不要動。**

### 4. 在 `</ScrollView>`（L1579）之後、toast（L1582）之前，貼上 sticky footer

把剛剪下的 CTA 塊包進一個固定 footer。**整個 footer 套用同一個條件**（沒 CTA 就整條不顯示，不留空 bar）：

```tsx
</ScrollView>

{/* Sticky footer — primary CTA, non-overlapping (flex sibling) */}
{session && dbRecipe && madeDrinkState !== 'hidden' ? (
  <View style={{
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: insets.bottom + 12,
    backgroundColor: OaklandDusk.bg.void,
    borderTopWidth: 0.5,
    borderTopColor: OaklandDusk.bg.border,
  }}>
    <HintBubble storageKey={GUIDE_KEYS.GP_STEP_6} ...>
      <Pressable onPress={...} ...>
        ... I made this ...
      </Pressable>
    </HintBubble>
  </View>
) : null}

{/* toast 維持原樣 */}
```

**注意：** CTA 原本條件式是 `{session && dbRecipe && madeDrinkState !== 'hidden' ? (...) : null}`。移到 footer 後，**用同一個條件包整個 footer `<View>`**，這樣條件不成立時整條 footer 不渲染（不留空 bar）。HintBubble 與 Pressable 內部一字不改。

---

## HintBubble（明確劃界）

CTA 被 `HintBubble`（GP_STEP_6 引導氣泡）包著。**搬家後氣泡錨點可能需要重新校準——此項由 Brok 自行處理**（Brok 已知多處引導氣泡本就未對齊，將另外統一修）。

**Cowork 的責任僅止於：把 CTA 連同 HintBubble 完整搬到 footer，內部 props 不動。氣泡對齊不在本 plan 範圍，不要嘗試調 HintBubble 的測量/定位邏輯。**

---

## 驗收

1. `npx tsc --noEmit` 通過。
2. simulator 進 recipe 頁（任一 cocktail → View / Make this 進入）自看：
   - **「I made this」一進頁就固定在底部、不用捲。**
   - 捲到底時，最後一行 Instructions 步驟**完整可見、沒被 footer 蓋住**。
   - footer 背景不透明、有上邊框，與內容區分明。
   - 點「I made this」功能正常（madeDrinkState 切換 done/Logged!、toast 出現）。
   - **toast 位置**（feedbackToast，原 `bottom: 90`）：確認 toast 不會跟 footer 重疊；若重疊，回報（可能需把 toast 的 bottom 從 90 調高，但**先回報、不要擅自改數字**，由 Brok 定）。
   - 未登入 / 無 recipe 狀態：footer 整條不顯示（不留空 bar）。
3. 回報改動摘要 + 上述觀察。
4. **⛔ STOP 等 Brok review。** 通過後 commit（Brok 執行）：
   ```bash
   git add -A && git commit -m "feat(recipe): sticky bottom CTA so 'I made this' is always visible without scrolling"
   ```

**部署：** 純 layout、無 native 變動 / 無新字體 → OTA (EAS Update)。

**DO NOT:**
- 不要碰任何邏輯：`handleMadeDrink`、`madeDrinkState`、份量 stepper、計量、recipe 載入、favorite/hint 的 state 流程，全部不動。
- 不要改 `HintBubble` 的測量/定位邏輯（氣泡對齊 Brok 自理）。
- 不要動 ingredient list / 計量 / 份量 stepper / tag / 可用性摘要 / Like-Dislike（這些字型已定案，本 plan 不碰）。
- 不要動 error 區塊（留在 ScrollView 內）。
- 不要把 footer 做成 `position:'absolute'`（那會浮在內容上、造成遮擋）——**必須是 ScrollView 的 flex 兄弟**。
- 不要擅自改 toast 的 bottom 數字——若重疊先回報。
- 不要碰其他檔案。
- 不要 git commit / push——做完回報，commit Brok 自己跑。

**Status:** Not Started

完成後 archive 為 `RECIPE_STICKY_CTA_PLAN_DONE.md`。
