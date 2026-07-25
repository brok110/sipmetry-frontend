# FIX-SLIDER-5 — slider tap commit + drag lock rework

Target file: `app/shelf/[shelf].tsx`(唯一目標檔,其他檔一律不碰)

## 規則(必守)
- 四個 Edit 依序套用(E1 → E2 → E3 → E4)。
- 每個 OLD block 必須逐字完全匹配、且全檔恰好一次。任一不符:**停止並回報,不得自行調整或猜測**。
- 只做下列替換,不重排、不重格式化、不改動其他任何行。

## E1 — 拆 P3 探針(emitChange)

OLD:
```tsx
  const emitChange = useCallback((v: number) => {
    console.log('[slider] emit', v)
    onChangeRef.current(v)
  }, [])
```

NEW:
```tsx
  const emitChange = useCallback((v: number) => {
    onChangeRef.current(v)
  }, [])
```

## E2 — onBegin 當下提交 + 移除上鎖 + 拆 P1 探針

OLD:
```tsx
    .onBegin((e) => {
      'worklet'
      isDragging.value = 1
      lastSent.value = -1
      console.log('[slider] begin x=', e.x)
      runOnJS(emitTouchStart)()
      if (trackWidth.value <= 0) return
      const pct = Math.max(0, Math.min(100, (e.x / trackWidth.value) * 100))
      fillPct.value = pct
    })
```

NEW:
```tsx
    .onBegin((e) => {
      'worklet'
      // FIX-SLIDER-5:純點擊(零位移)實證不觸發 onFinalize,提交
      // 不能等結束回呼——onBegin 當下即提交。拖曳會多送一發起點值,
      // 由 onUpdate 的 lastSent 去重吸收,無害。isDragging 不在此
      // 上鎖(移至 onUpdate 第一個移動),點擊路徑永不上鎖。
      lastSent.value = -1
      runOnJS(emitTouchStart)()
      if (trackWidth.value <= 0) return
      const pct = Math.max(0, Math.min(100, (e.x / trackWidth.value) * 100))
      fillPct.value = pct
      const snapped = snapTo5(pct)
      lastSent.value = snapped
      runOnJS(emitChange)(snapped)
    })
```

## E3 — onUpdate 第一個移動才上鎖

OLD:
```tsx
    .onUpdate((e) => {
      'worklet'
      if (trackWidth.value <= 0) return
      const pct = Math.max(0, Math.min(100, (e.x / trackWidth.value) * 100))
      fillPct.value = pct
      const snapped = snapTo5(pct)
      if (snapped !== lastSent.value) {
        lastSent.value = snapped
        runOnJS(emitChange)(snapped)
      }
    })
```

NEW:
```tsx
    .onUpdate((e) => {
      'worklet'
      isDragging.value = 1
      if (trackWidth.value <= 0) return
      const pct = Math.max(0, Math.min(100, (e.x / trackWidth.value) * 100))
      fillPct.value = pct
      const snapped = snapTo5(pct)
      if (snapped !== lastSent.value) {
        lastSent.value = snapped
        runOnJS(emitChange)(snapped)
      }
    })
```

## E4 — onFinalize 拆 P2 探針 + 註解改為現況

OLD:
```tsx
    .onFinalize(() => {
      'worklet'
      // 純點擊不 activate Pan、onEnd 不觸發——onFinalize 涵蓋所有
      // 結束路徑(放手 / 點擊 / 取消),提交點統一在此。
      const snapped = snapTo5(fillPct.value)
      console.log('[slider] finalize snapped=', snapped, 'lastSent=', lastSent.value)
      fillPct.value = withTiming(snapped, { duration: 80 })
```

NEW:
```tsx
    .onFinalize(() => {
      'worklet'
      // 拖曳收尾:snap 動畫 + 去重補發保險 + 解鎖。純點擊實證不進
      // 此處(提交已在 onBegin 完成,isDragging 亦未上鎖)。
      const snapped = snapTo5(fillPct.value)
      fillPct.value = withTiming(snapped, { duration: 80 })
```

(onFinalize 其餘內容——去重補發、`isDragging.value = 0`、hitSlop、minDistance——原樣保留,不在替換範圍。)

## 完成後自檢(回報結果,不要自行往下走)
1. `npx tsc --noEmit` 零錯誤
2. `grep -n '\[slider\]' "app/shelf/[shelf].tsx"` 輸出為空
3. 回報:四個 Edit 各自匹配次數(應皆為 1)與套用結果

---

## 收案(2026-07-25)

- 根因:純點擊(零位移,Pan 未 activate)實證不觸發 onFinalize,
  提交掛 onFinalize 致點擊永不落地;onBegin 上鎖 + finalize 不跑
  另致 isDragging 卡 1、[value] 同步 effect 鎖死。
- 修法(FIX-SLIDER-5):提交移至 onBegin 當下,拖曳多送一發起點值
  由 onUpdate lastSent 去重吸收;isDragging 上鎖移至 onUpdate 第一
  個移動,點擊路徑永不上鎖;onFinalize 保留拖曳收尾;P1/P2/P3 探針
  拆除;v3 useMemo+ref 架構保留。
- 執行:Claude Code 四 Edit 逐字替換,OLD 各恰一次命中,tsc 乾淨,
  grep slider 探針歸零。
- 冷啟驗收:拖曳/點擊/交替/存檔重開/Cancel 重開/點後拖全過;
  多瓶卡 created_at(Edit A)未受波及。
- 出貨:commit d585822,EAS OTA group a2776006(iOS,runtime 1.0.1)。
