# CUSTOM_BOTTLE_SIZE_UI_PLAN.md

**目標：** 在 `EditBottleModal`（inventory.tsx）和 `AddToInventoryModal`（components/AddToInventoryModal.tsx）加入「Custom」按鈕，讓用戶可以輸入自訂瓶子容量（50-5000ml）。

**原則：** 最小改動。共用同樣的 UX pattern：preset pills + Custom 按鈕 → 顯示 TextInput。

---

## Stage 1: 修改 `EditBottleModal`（inventory.tsx）

**Goal:** 在 Bottle Size 的 pill 列表末端加一個「Custom」按鈕。點擊後顯示一個 TextInput，用戶可以輸入自訂 ml 值。

**File:** `app/(tabs)/inventory.tsx`

**Locator:**
```bash
grep -n 'BOTTLE_SIZES\|sizeRow\|sizePill\|Bottle Size' app/\(tabs\)/inventory.tsx
```

**Actions:**

1. 加入 `isCustomSize` state。找到 state 宣告區（約第 288-291 行）：
   ```javascript
   const [name, setName] = useState('')
   const [totalMl, setTotalMl] = useState(700)
   const [pct, setPct] = useState(100)
   const [saving, setSaving] = useState(false)
   ```
   
   在 `saving` 之後加入：
   ```javascript
   const [isCustomSize, setIsCustomSize] = useState(false)
   const [customMlText, setCustomMlText] = useState('')
   ```

2. 修改 `useEffect` 裡的初始化邏輯（約第 295-302 行）。找到：
   ```javascript
   useEffect(() => {
     if (item) {
       setName(item.display_name)
       setTotalMl(BOTTLE_SIZES.includes(Number(item.total_ml)) ? Number(item.total_ml) : 700)
       setPct(Math.round(Number(item.remaining_pct)))
   ```

   改為：
   ```javascript
   useEffect(() => {
     if (item) {
       setName(item.display_name)
       const ml = Number(item.total_ml)
       if (BOTTLE_SIZES.includes(ml)) {
         setTotalMl(ml)
         setIsCustomSize(false)
         setCustomMlText('')
       } else {
         // Item has a custom size not in presets — show custom input
         setTotalMl(ml)
         setIsCustomSize(true)
         setCustomMlText(String(ml))
       }
       setPct(Math.round(Number(item.remaining_pct)))
   ```

3. 修改 Bottle Size 的 UI 區塊。找到這段（約第 346-359 行）：
   ```jsx
   <Text style={modalStyles.fieldLabel}>Bottle Size</Text>
   <View style={modalStyles.sizeRow}>
     {BOTTLE_SIZES.map((size) => (
       <Pressable
         key={size}
         onPress={() => setTotalMl(size)}
         style={[modalStyles.sizePill, totalMl === size && modalStyles.sizePillActive]}
       >
         <Text style={[modalStyles.sizePillText, totalMl === size && modalStyles.sizePillTextActive]}>
           {size < 1000 ? `${size}` : size === 1000 ? '1L' : '1.75L'}
         </Text>
       </Pressable>
     ))}
   </View>
   ```

   替換為：
   ```jsx
   <Text style={modalStyles.fieldLabel}>Bottle Size</Text>
   <View style={modalStyles.sizeRow}>
     {BOTTLE_SIZES.map((size) => (
       <Pressable
         key={size}
         onPress={() => {
           setTotalMl(size)
           setIsCustomSize(false)
           setCustomMlText('')
         }}
         style={[modalStyles.sizePill, !isCustomSize && totalMl === size && modalStyles.sizePillActive]}
       >
         <Text style={[modalStyles.sizePillText, !isCustomSize && totalMl === size && modalStyles.sizePillTextActive]}>
           {size < 1000 ? `${size}` : size === 1000 ? '1L' : '1.75L'}
         </Text>
       </Pressable>
     ))}
     <Pressable
       onPress={() => {
         setIsCustomSize(true)
         setCustomMlText(BOTTLE_SIZES.includes(totalMl) ? '' : String(totalMl))
       }}
       style={[modalStyles.sizePill, isCustomSize && modalStyles.sizePillActive]}
     >
       <Text style={[modalStyles.sizePillText, isCustomSize && modalStyles.sizePillTextActive]}>
         Custom
       </Text>
     </Pressable>
   </View>
   {isCustomSize && (
     <View style={{ marginTop: 8, gap: 4 }}>
       <TextInput
         style={modalStyles.input}
         value={customMlText}
         onChangeText={(text) => {
           // Only allow digits
           const digits = text.replace(/[^0-9]/g, '')
           setCustomMlText(digits)
           const num = Number(digits)
           if (num >= 50 && num <= 5000) {
             setTotalMl(num)
           }
         }}
         placeholder="Enter ml (50–5000)"
         placeholderTextColor="#888"
         keyboardType="number-pad"
         maxLength={4}
         returnKeyType="done"
       />
       <Text style={{ fontSize: 11, color: '#888' }}>
         50–5000 ml
       </Text>
     </View>
   )}
   ```

4. 修改 `handleSave` 加入驗證。在 `if (!trimmed) return` 之後加：
   ```javascript
   if (isCustomSize) {
     const customNum = Number(customMlText)
     if (!Number.isInteger(customNum) || customNum < 50 || customNum > 5000) {
       Alert.alert('Invalid size', 'Bottle size must be between 50 and 5000 ml')
       return
     }
   }
   ```

**DO NOT** 改動 `BOTTLE_SIZES` 常數（preset 選項維持不變）。
**DO NOT** 改動 `HorizontalPctSlider` 或 `GuideBubble`。
**DO NOT** 改動 `modalStyles` 以外的任何 styles（`sizePill` 等已有的 style 足夠用）。

**Tests:**
- `npx tsc --noEmit`

**Status:** Not Started

---

## Stage 2: 修改 `AddToInventoryModal`（components/AddToInventoryModal.tsx）

**Goal:** 同 Stage 1 的 pattern，在 `AddToInventoryModal` 的 Bottle Volume pills 後加 "Custom" 按鈕。

**File:** `components/AddToInventoryModal.tsx`

**Locator:**
```bash
grep -n 'TOTAL_ML_OPTIONS\|mlRow\|mlBtn\|Bottle Volume' components/AddToInventoryModal.tsx
```

**Actions:**

1. 加入 state。找到 state 宣告區（約第 48-51 行）：
   ```javascript
   const [name, setName] = useState(displayName)
   const [totalMl, setTotalMl] = useState(700)
   const [remainingPct, setRemainingPct] = useState(100)
   const [loading, setLoading] = useState(false)
   const [error, setError] = useState<string | null>(null)
   ```

   在 `error` 之後加入：
   ```javascript
   const [isCustomSize, setIsCustomSize] = useState(false)
   const [customMlText, setCustomMlText] = useState('')
   ```

2. 修改 `useEffect` 裡的初始化。找到（約第 55-63 行）：
   ```javascript
   React.useEffect(() => {
     if (visible) {
       setName(displayName)
       setTotalMl(
         initialTotalMl && TOTAL_ML_OPTIONS.includes(initialTotalMl)
           ? initialTotalMl
           : 700
       )
       setRemainingPct(100)
       setError(null)
     }
   }, [visible, displayName, initialTotalMl])
   ```

   改為：
   ```javascript
   React.useEffect(() => {
     if (visible) {
       setName(displayName)
       if (initialTotalMl && TOTAL_ML_OPTIONS.includes(initialTotalMl)) {
         setTotalMl(initialTotalMl)
         setIsCustomSize(false)
         setCustomMlText('')
       } else if (initialTotalMl && initialTotalMl >= 50 && initialTotalMl <= 5000) {
         // AI detected a non-standard size — show as custom
         setTotalMl(initialTotalMl)
         setIsCustomSize(true)
         setCustomMlText(String(initialTotalMl))
       } else {
         setTotalMl(700)
         setIsCustomSize(false)
         setCustomMlText('')
       }
       setRemainingPct(100)
       setError(null)
     }
   }, [visible, displayName, initialTotalMl])
   ```

3. 修改 Bottle Volume UI。找到這段（約第 145-165 行）：
   ```jsx
   <Text style={styles.label}>Bottle Volume</Text>
   <View style={styles.mlRow}>
     {TOTAL_ML_OPTIONS.map((ml) => (
       <Pressable
         key={ml}
         onPress={() => setTotalMl(ml)}
         style={[
           styles.mlBtn,
           totalMl === ml && styles.mlBtnActive,
         ]}
       >
         <Text style={[
           styles.mlBtnText,
           totalMl === ml && styles.mlBtnTextActive,
         ]}>
           {ml >= 1750 ? '1.75L' : ml >= 1000 ? '1L' : `${ml}ml`}
         </Text>
       </Pressable>
     ))}
   </View>
   ```

   替換為：
   ```jsx
   <Text style={styles.label}>Bottle Volume</Text>
   <View style={styles.mlRow}>
     {TOTAL_ML_OPTIONS.map((ml) => (
       <Pressable
         key={ml}
         onPress={() => {
           setTotalMl(ml)
           setIsCustomSize(false)
           setCustomMlText('')
         }}
         style={[
           styles.mlBtn,
           !isCustomSize && totalMl === ml && styles.mlBtnActive,
         ]}
       >
         <Text style={[
           styles.mlBtnText,
           !isCustomSize && totalMl === ml && styles.mlBtnTextActive,
         ]}>
           {ml >= 1750 ? '1.75L' : ml >= 1000 ? '1L' : `${ml}ml`}
         </Text>
       </Pressable>
     ))}
     <Pressable
       onPress={() => {
         setIsCustomSize(true)
         setCustomMlText(TOTAL_ML_OPTIONS.includes(totalMl) ? '' : String(totalMl))
       }}
       style={[
         styles.mlBtn,
         isCustomSize && styles.mlBtnActive,
       ]}
     >
       <Text style={[
         styles.mlBtnText,
         isCustomSize && styles.mlBtnTextActive,
       ]}>
         Custom
       </Text>
     </Pressable>
   </View>
   {isCustomSize && (
     <View style={{ marginTop: 8, gap: 4 }}>
       <TextInput
         style={styles.input}
         value={customMlText}
         onChangeText={(text) => {
           const digits = text.replace(/[^0-9]/g, '')
           setCustomMlText(digits)
           const num = Number(digits)
           if (num >= 50 && num <= 5000) {
             setTotalMl(num)
           }
         }}
         placeholder="Enter ml (50–5000)"
         placeholderTextColor="#888"
         keyboardType="number-pad"
         maxLength={4}
         returnKeyType="done"
       />
       <Text style={{ fontSize: 11, color: '#888' }}>
         50–5000 ml
       </Text>
     </View>
   )}
   ```

4. 在 `handleConfirm` 加入驗證。找到 `if (!name.trim())` 那段，在它**之後**加：
   ```javascript
   if (isCustomSize) {
     const customNum = Number(customMlText)
     if (!Number.isInteger(customNum) || customNum < 50 || customNum > 5000) {
       setError('Bottle size must be between 50 and 5000 ml')
       return
     }
   }
   ```

**DO NOT** 改動 `TOTAL_ML_OPTIONS` 常數。
**DO NOT** 改動 AI detection info 區塊。
**DO NOT** 改動 `BottleFillSlider`。

**Tests:**
- `npx tsc --noEmit`

**Status:** Not Started

---

## Stage 3: 驗收

**Actions:**

1. 確認 Custom 按鈕存在：
   ```bash
   grep -n 'Custom' app/\(tabs\)/inventory.tsx components/AddToInventoryModal.tsx
   ```
   預期：各 2 處（button label + active check）。

2. 確認範圍驗證存在：
   ```bash
   grep -n '50.*5000' app/\(tabs\)/inventory.tsx components/AddToInventoryModal.tsx
   ```
   預期：各 2-3 處（placeholder + validation + hint text）。

3. TypeScript 編譯：
   ```bash
   npx tsc --noEmit
   ```

4. 提交：
   ```bash
   git add . && git commit -m "feat: custom bottle size input (50-5000ml) in EditBottle and AddToInventory modals" && git push
   ```

**DO NOT push** unless tsc passes.

**Status:** Not Started
