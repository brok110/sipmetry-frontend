import HintBubble, { GUIDE_KEYS, dismissGuide, isGuideDismissed } from '@/components/GuideBubble'
import LevelRing from '@/components/ui/LevelRing'
import SwipeRow from '@/components/ui/SwipeRow'
import { DEFAULT_BOTTLE_ML } from '@/constants/defaults'
import { withAlpha } from '@/constants/cabinetTokens'
import OaklandDusk from '@/constants/OaklandDusk'
import Type from '@/constants/typography'
import { V3 } from '@/constants/v3DesignTokens'
import { useIngredientKeys } from '@/context/ingredientKeys'
import { InventoryBottle, InventoryItem, useInventory } from '@/context/inventory'
import { usePurchaseIntent } from '@/hooks/usePurchaseIntent'
import { isShelfId, shelfFor, type ShelfId } from '@/lib/cabinet'
import { isBlindKey } from '@/lib/isBlindKey'
import { openUrl } from '@/lib/openUrl'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// ── 以下 list 區塊(sort 控制、SwipeRow 卡片、edit modal、盲點、RESTOCK pill)
//    自 app/(tabs)/inventory.tsx 整段搬家(CABINET-3A §C5),互動與文案原樣 ──

type SortBy =
  | 'date_added'
  | 'remaining_volume'
  | 'family'
  | 'last_used_at'
  | 'brand_name'
type SortOrder = 'asc' | 'desc'

// All 6 sort options shown in the dropdown
const DROPDOWN_SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'date_added',       label: 'Added' },
  { key: 'remaining_volume', label: 'Remaining Volume' },
  { key: 'family',           label: 'Family' },
  { key: 'last_used_at',     label: 'Last Used' },
  { key: 'brand_name',       label: 'Brand Name' },
]


function sortInventory(items: InventoryItem[], by: SortBy, order: SortOrder): InventoryItem[] {
  const dir = order === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    switch (by) {
      case 'date_added': {
        const ta = new Date(a.created_at ?? 0).getTime()
        const tb = new Date(b.created_at ?? 0).getTime()
        return (ta - tb) * dir
      }
      case 'remaining_volume': {
        return (Number(a.remaining_volume ?? 0) - Number(b.remaining_volume ?? 0)) * dir
      }
      case 'family': {
        const ca = a.family_key ?? ''
        const cb = b.family_key ?? ''
        return ca.localeCompare(cb) * dir
      }
      case 'last_used_at': {
        // null（從未使用）永遠排最後
        const ta = a.last_used_at ? new Date(a.last_used_at).getTime() : null
        const tb = b.last_used_at ? new Date(b.last_used_at).getTime() : null
        if (ta === null && tb === null) return 0
        if (ta === null) return 1
        if (tb === null) return -1
        return (ta - tb) * dir
      }
      case 'brand_name': {
        return a.display_name.localeCompare(b.display_name) * dir
      }
      default:
        return 0
    }
  })
}

function formatFamilyKey(key: string | null): string {
  if (!key) return 'Other'
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never used'
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (diff === 0) return 'Used today'
  if (diff === 1) return 'Used yesterday'
  if (diff < 7) return `Used ${diff}d ago`
  if (diff < 30) return `Used ${Math.floor(diff / 7)}w ago`
  return `Used ${Math.floor(diff / 30)}mo ago`
}

function formatAddedDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `Added ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

// ── Filter icon (3 horizontal lines, pyramid style) ───────────────────────────
function FilterIcon({ color = OaklandDusk.brand.gold }: { color?: string }) {
  return (
    <View style={{ gap: 4, alignItems: 'flex-end' }}>
      <View style={{ width: 20, height: 2.5, borderRadius: 1, backgroundColor: color }} />
      <View style={{ width: 15, height: 2.5, borderRadius: 1, backgroundColor: color }} />
      <View style={{ width: 10, height: 2.5, borderRadius: 1, backgroundColor: color }} />
    </View>
  )
}

// ── Horizontal drag slider ────────────────────────────────────────────────────

function snapTo5(pct: number): number {
  'worklet'
  return Math.round(pct / 5) * 5
}

function HorizontalPctSlider({
  value,
  onChange,
  onTouchStart,
}: {
  value: number
  onChange: (pct: number) => void
  onTouchStart?: () => void
}) {
  const trackWidth = useSharedValue(0)
  const fillPct = useSharedValue(value)
  // FIX-SLIDER-3:gesture 用 useMemo 一次成型——拖曳中 setPct 觸發
  // re-render 若重建 gesture,進行中的手勢會被孤兒化,後續 runOnJS
  // 全數無聲丟棄(前兩版失同步/全死的根因)。回呼走 ref,worklet
  // 綁定的 emit 永久穩定,實際函式由 ref 隨時指向最新。
  const lastSent = useSharedValue(value)
  const isDragging = useSharedValue(0)

  useEffect(() => {
    if (isDragging.value === 0) {
      fillPct.value = value
    }
  }, [value])

  const onChangeRef = useRef(onChange)
  const onTouchStartRef = useRef(onTouchStart)
  useEffect(() => {
    onChangeRef.current = onChange
    onTouchStartRef.current = onTouchStart
  })

  const emitChange = useCallback((v: number) => {
    onChangeRef.current(v)
  }, [])

  const emitTouchStart = useCallback(() => {
    if (onTouchStartRef.current) onTouchStartRef.current()
  }, [])

  const gesture = useMemo(() => Gesture.Pan()
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
    .onFinalize(() => {
      'worklet'
      // 拖曳收尾:snap 動畫 + 去重補發保險 + 解鎖。純點擊實證不進
      // 此處(提交已在 onBegin 完成,isDragging 亦未上鎖)。
      const snapped = snapTo5(fillPct.value)
      fillPct.value = withTiming(snapped, { duration: 80 })
      if (snapped !== lastSent.value) {
        lastSent.value = snapped
        runOnJS(emitChange)(snapped)
      }
      isDragging.value = 0
    })
    .hitSlop({ top: 20, bottom: 20, left: 10, right: 10 })
    .minDistance(0), [emitChange, emitTouchStart, trackWidth, fillPct, lastSent, isDragging])

  const fillStyle = useAnimatedStyle(() => {
    const isLow = fillPct.value <= 15
    return {
      width: `${fillPct.value}%`,
      backgroundColor: isLow ? '#E53935' : '#D4A017',
    }
  })

  const thumbStyle = useAnimatedStyle(() => {
    const isLow = fillPct.value <= 15
    return {
      left: `${fillPct.value}%`,
      borderColor: isLow ? '#E53935' : '#D4A017',
    }
  })

  const isLow = value <= 15
  const fillColor = isLow ? '#E53935' : '#D4A017'

  return (
    <View style={sliderStyles.wrapper}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={sliderStyles.track}
          onLayout={(e) => { trackWidth.value = e.nativeEvent.layout.width }}
        >
          <Animated.View style={[sliderStyles.fill, fillStyle]} />
          <Animated.View style={[sliderStyles.thumb, thumbStyle]} />
        </Animated.View>
      </GestureDetector>
      <Text style={[sliderStyles.label, { color: fillColor }]}>{value}%</Text>
    </View>
  )
}

const sliderStyles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  track: {
    height: 28,
    backgroundColor: OaklandDusk.bg.surface,
    borderRadius: 14,
    overflow: 'visible',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 14,
  },
  thumb: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: OaklandDusk.bg.card,
    borderWidth: 2,
    marginLeft: -14,
    top: 0,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
})

// ── Bottle sizes ──────────────────────────────────────────────────────────────
const BOTTLE_SIZES: number[] = [375, 500, 700, 750, 1000, 1750]

// ── Edit Bottle Modal ─────────────────────────────────────────────────────────
function EditBottleModal({
  item,
  bottle,
  bottleIndex,
  visible,
  onClose,
  onSave,
}: {
  item: InventoryItem | null
  bottle: InventoryBottle | null
  bottleIndex: number
  visible: boolean
  onClose: () => void
  onSave: (id: string, updates: { display_name: string; total_ml: number; remaining_pct: number; bottle_id?: string }) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [totalMl, setTotalMl] = useState(DEFAULT_BOTTLE_ML)
  const [pct, setPct] = useState(100)
  const [saving, setSaving] = useState(false)
  const [isCustomSize, setIsCustomSize] = useState(false)
  const [customMlText, setCustomMlText] = useState('')

  // Sync fields when modal opens for a different item.
  // INV-MODEL batch 4-FE-c-FE: numeric fields come from the bottle whose
  // card page opened the modal (explicit target). Fallback to the row
  // aggregate when no bottle is passed (transition states).
  useEffect(() => {
    if (item) {
      setName(item.display_name)
      const ml = bottle ? Number(bottle.total_ml) : Number(item.total_ml)
      const pctVal = bottle
        ? (bottle.total_ml > 0 ? Math.round((bottle.remaining_volume / bottle.total_ml) * 100) : 0)
        : Math.round(Number(item.remaining_pct))
      if (BOTTLE_SIZES.includes(ml)) {
        setTotalMl(ml)
        setIsCustomSize(false)
        setCustomMlText('')
      } else {
        setTotalMl(ml)
        setIsCustomSize(true)
        setCustomMlText(String(ml))
      }
      setPct(pctVal)
    }
  }, [item, bottle])

  const handleSave = async () => {
    if (!item || saving) return
    const trimmed = name.trim()
    if (!trimmed) return
    if (isCustomSize) {
      const customNum = Number(customMlText)
      if (!Number.isInteger(customNum) || customNum < 50 || customNum > 5000) {
        Alert.alert('Invalid size', 'Bottle size must be between 50 and 5000 ml')
        return
      }
    }
    setSaving(true)
    try {
      await onSave(item.id, {
        display_name: trimmed,
        total_ml: totalMl,
        remaining_pct: pct,
        ...(bottle && bottle.id !== item.id ? { bottle_id: bottle.id } : {}),
      })
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  if (!item) return null

  const previewMl = Math.round((pct / 100) * totalMl)

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={modalStyles.overlay} onPress={onClose}>
          <Pressable style={modalStyles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={modalStyles.title}>Edit Bottle</Text>
            {item.bottles.length > 1 ? (
              <Text style={modalStyles.bottleHint}>
                {`Bottle #${bottleIndex} of ${item.bottles.length}`}
              </Text>
            ) : null}

          {/* Name */}
          <Text style={modalStyles.fieldLabel}>Name</Text>
          <TextInput
            style={modalStyles.input}
            value={name}
            onChangeText={setName}
            placeholder="Bottle name"
            placeholderTextColor="#AAA"
            autoCorrect={false}
            returnKeyType="done"
          />

          {/* Bottle size */}
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
                  const digits = text.replace(/[^0-9]/g, '')
                  setCustomMlText(digits)
                  const num = Number(digits)
                  if (num >= 50 && num <= 5000) {
                    setTotalMl(num)
                  }
                }}
                placeholder="e.g. 200"
                placeholderTextColor="#888"
                keyboardType="number-pad"
                maxLength={4}
                returnKeyType="done"
              />
              <Text style={{ fontSize: 11, color: '#888' }}>
                50 – 5000 ml
              </Text>
            </View>
          )}

          {/* Remaining */}
          <Text style={modalStyles.fieldLabel}>
            Remaining — {previewMl}ml ({pct}%)
          </Text>
          <HorizontalPctSlider
            value={pct}
            onChange={setPct}
          />

          {/* Actions */}
          <View style={modalStyles.actions}>
            <Pressable onPress={onClose} style={modalStyles.cancelBtn} disabled={saving}>
              <Text style={modalStyles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              style={[modalStyles.saveBtn, (!name.trim() || saving) && { opacity: 0.4 }]}
              disabled={!name.trim() || saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={modalStyles.saveBtnText}>Save</Text>
              }
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ── Inventory card ────────────────────────────────────────────────────────────
function InventoryCard({
  item,
  sortBy,
  onEdit,
  onDelete,
  onRestock,
  isFirstCard,
  onSwipeOpen,
}: {
  item: InventoryItem
  sortBy: SortBy
  onEdit: (item: InventoryItem, bottle: InventoryBottle, ordinal: number) => void
  onDelete: (id: string, name: string, bottle: InventoryBottle, ordinal: number, totalBottles: number) => void
  onRestock?: () => void
  isFirstCard?: boolean
  onSwipeOpen?: () => void
}) {
  const { data: ingredientKeysData, resolve } = useIngredientKeys()
  // 盲點判定抽共用:lib/isBlindKey(CABINET-3A),邏輯與原卡片內判定一字不改
  const isBlind = isBlindKey(item.ingredient_key, ingredientKeysData, resolve)

  // INV-MODEL batch 4-FE-c-FE:瓶卡疊(方案乙)。顯示順序 = created_at 升冪,
  // 標 #1/#2…;點卡片或頁點換瓶;bottles 空(POST/PATCH 過渡態)以列
  // aggregate 充當一瓶(pseudo 瓶,id 同列 id)。
  const bottles = useMemo<InventoryBottle[]>(() => {
    if (item.bottles.length === 0) {
      return [{
        id: item.id,
        total_ml: Number(item.total_ml),
        remaining_volume: Number(item.remaining_volume),
        created_at: item.created_at,
        fifo: true,
      }]
    }
    return [...item.bottles].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  }, [item])
  const [pageIdx, setPageIdx] = useState(0)
  useEffect(() => {
    if (pageIdx >= bottles.length) setPageIdx(0)
  }, [pageIdx, bottles.length])
  const safeIdx = Math.min(pageIdx, bottles.length - 1)
  const bottle = bottles[safeIdx]
  const multi = bottles.length > 1
  const bottlePct = bottle.total_ml > 0 ? Math.round((bottle.remaining_volume / bottle.total_ml) * 100) : 0
  const bottleMl = Math.round(Number(bottle.remaining_volume))
  const isLow = bottlePct < 20

  return (
    <SwipeRow
      onEdit={() => onEdit(item, bottle, safeIdx + 1)}
      onDelete={() => onDelete(item.id, item.display_name, bottle, safeIdx + 1, bottles.length)}
      onSwipeOpen={isFirstCard ? onSwipeOpen : undefined}
    >
      <Pressable
        disabled={!multi}
        onPress={() => setPageIdx((safeIdx + 1) % bottles.length)}
        accessibilityLabel={multi ? `Bottle ${safeIdx + 1} of ${bottles.length}, tap for next bottle` : undefined}
      >
      <View style={[styles.card, isLow && { backgroundColor: 'rgba(192,72,88,0.08)' }]}>
        <View style={styles.cardHeader}>
          {/* Info */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Pressable style={{ flexShrink: 1, minWidth: 0 }} onPress={() => openUrl(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(item.display_name + ' bottle')}`)}>
                <Text style={styles.cardName} numberOfLines={1}>
                  {item.display_name}
                </Text>
              </Pressable>
              {multi && (
                <View style={styles.bottleCountPill}>
                  <Text style={styles.bottleCountPillText}>{`#${safeIdx + 1}`}</Text>
                </View>
              )}
              {isBlind && (
                <Pressable
                  hitSlop={12}
                  accessibilityLabel="Why this bottle is not matched to recipes"
                  onPress={() =>
                    Alert.alert(
                      'Not in our library yet',
                      "We couldn't match this bottle to our ingredient library, so it doesn't count toward recipe matching yet. Our library grows every week — once this bottle is added, your recipes will use it automatically. Scanning it also helps us prioritize."
                    )
                  }
                >
                  <View style={styles.blindDot} />
                </Pressable>
              )}
            </View>
            <Text style={styles.cardMeta}>
              {sortBy === 'date_added' && !multi
                ? `${formatAddedDate(bottle.created_at)} · `
                : sortBy === 'last_used_at'
                ? `${formatRelativeTime(item.last_used_at)} · `
                : ''}
              {bottleMl}ml left{multi ? ` · ${formatAddedDate(bottle.created_at)}` : ''}
            </Text>
            {isLow && onRestock ? (
              <Pressable
                hitSlop={8}
                accessibilityLabel={`Restock ${item.display_name}`}
                onPress={onRestock}
                style={styles.restockPill}
              >
                <Text style={styles.restockPillText}>RESTOCK</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Level ring:當前瓶 */}
          <LevelRing percent={bottlePct} size={40} />
        </View>
        {multi && (
          <View style={styles.pageDots}>
            {bottles.map((b, i) => (
              <Pressable key={b.id} hitSlop={8} onPress={() => setPageIdx(i)} accessibilityLabel={`Bottle ${i + 1}`}>
                <View style={[styles.pageDot, i === safeIdx && styles.pageDotActive]} />
              </Pressable>
            ))}
          </View>
        )}
      </View>
      </Pressable>
    </SwipeRow>
  )
}

// ── Inventory card with swipe guide ──────────────────────────────────────────
function InventoryCardWithGuide({
  item,
  sortBy,
  onEdit,
  onDelete,
  onRestock,
  isFirstCard,
  guideSwipeDismissed,
  onSwipeOpen,
}: {
  item: InventoryItem
  sortBy: SortBy
  onEdit: (item: InventoryItem, bottle: InventoryBottle, ordinal: number) => void
  onDelete: (id: string, name: string, bottle: InventoryBottle, ordinal: number, totalBottles: number) => void
  onRestock?: () => void
  isFirstCard: boolean
  guideSwipeDismissed: boolean
  onSwipeOpen: () => void
}) {
  return isFirstCard && !guideSwipeDismissed ? (
    <HintBubble
      storageKey={GUIDE_KEYS.MYBAR_SWIPE}
      visible={!guideSwipeDismissed}
      onDismiss={onSwipeOpen}
      hintType="swipe"
      hintColor="skyblue"
    >
      <InventoryCard
        item={item}
        sortBy={sortBy}
        onEdit={onEdit}
        onDelete={onDelete}
        onRestock={onRestock}
        isFirstCard={isFirstCard}
        onSwipeOpen={onSwipeOpen}
      />
    </HintBubble>
  ) : (
    <InventoryCard
      item={item}
      sortBy={sortBy}
      onEdit={onEdit}
      onDelete={onDelete}
      onRestock={onRestock}
      isFirstCard={isFirstCard}
      onSwipeOpen={onSwipeOpen}
    />
  )
}

// ── Screen:分類詳情頁(CABINET-3A §C5)────────────────────────────────────────
export default function ShelfDetailScreen() {
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ shelf: string }>()
  const shelfParam = Array.isArray(params.shelf) ? params.shelf[0] : params.shelf
  const shelfKey = typeof shelfParam === 'string' ? shelfParam.toLowerCase() : ''
  const validShelf = isShelfId(shelfKey)
  // 非法 param 時仍需維持 hook 順序;實際渲染前會 redirect
  const shelfId: ShelfId = validShelf ? shelfKey : 'others'

  const { trackAndOpenPurchaseLink } = usePurchaseIntent()
  const {
    inventory,
    refreshing,
    initialized,
    refreshInventory,
    updateInventoryItem,
    deleteInventoryItem,
    deleteInventoryBottle,
  } = useInventory()

  // ── Sort state (預設：加入時間 降冪) ──────────────────────
  const [sortBy, setSortBy] = useState<SortBy>('date_added')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [editBottle, setEditBottle] = useState<InventoryBottle | null>(null)
  const [editBottleIndex, setEditBottleIndex] = useState(1)
  const [guideSwipeDismissed, setGuideSwipeDismissed] = useState(true)

  // swipe 提示沿用原 My Bar 的 gating 鏈(CTA、GP_STEP_6 皆 dismissed 後才出現)
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const ctaD = await isGuideDismissed(GUIDE_KEYS.MYBAR_CTA);
        if (!ctaD) return;

        const gpStep6D = await isGuideDismissed(GUIDE_KEYS.GP_STEP_6);
        if (!gpStep6D) return;

        const swipeD = await isGuideDismissed(GUIDE_KEYS.MYBAR_SWIPE);
        if (!swipeD) setGuideSwipeDismissed(false);
      })();
    }, [])
  )

  useFocusEffect(
    React.useCallback(() => {
      refreshInventory({ silent: true }).catch(() => {})
    }, [refreshInventory])
  )

  const shelfItems = useMemo(
    () => inventory.filter((item) => shelfFor(item.family_key) === shelfId),
    [inventory, shelfId]
  )

  const sortedItems = useMemo(
    () => sortInventory(shelfItems, sortBy, sortOrder),
    [shelfItems, sortBy, sortOrder]
  )

  // 空層(最後一瓶被刪)→ 返回 cabinet(§C5 擇簡單者)
  useEffect(() => {
    if (validShelf && initialized && shelfItems.length === 0) {
      if (router.canGoBack()) router.back()
      else router.replace('/(tabs)/inventory')
    }
  }, [validShelf, initialized, shelfItems.length])

  const handleRefresh = () => {
    refreshInventory({ silent: true, notifyLowStock: true }).catch(() => {})
  }

  const handleSortSelect = (key: SortBy) => {
    if (key === sortBy) {
      // 同一條件：切換升降冪
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      // 切換條件：依條件設預設方向
      setSortBy(key)
      setSortOrder(key === 'family' ? 'asc' : 'desc')
    }
    setShowSortDropdown(false)
  }

  const dismissSwipeGuide = () => {
    if (!guideSwipeDismissed) {
      setGuideSwipeDismissed(true)
      dismissGuide(GUIDE_KEYS.MYBAR_SWIPE)
    }
  }

  const handleEdit = (item: InventoryItem, bottle: InventoryBottle, ordinal: number) => {
    dismissSwipeGuide()
    setEditItem(item)
    setEditBottle(bottle)
    setEditBottleIndex(ordinal)
  }

  const handleEditSave = async (
    id: string,
    updates: { display_name: string; total_ml: number; remaining_pct: number; bottle_id?: string }
  ) => {
    await updateInventoryItem(id, updates)
    setEditItem(null)
  }

  // INV-MODEL batch 4-FE-c-FE:刪除統一瓶級——確認文案逐瓶點名,最後一瓶
  // 提示整卡連動移除(backend cascade)。「一滑刪整列」地雷正式拆除。
  // pseudo 瓶(bottles 過渡態,id 同列 id)回退列級刪除。
  const handleDelete = (
    id: string,
    name: string,
    bottle: InventoryBottle,
    ordinal: number,
    totalBottles: number
  ) => {
    dismissSwipeGuide()
    const last = totalBottles <= 1
    Alert.alert(
      last ? 'Remove from My Bar' : `Remove bottle #${ordinal}`,
      last
        ? `Remove "${name}"? This is the last bottle — the card goes with it.`
        : `Remove bottle #${ordinal} of "${name}"? The other ${totalBottles - 1 === 1 ? 'bottle stays' : 'bottles stay'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              if (bottle.id === id) {
                await deleteInventoryItem(id)
              } else {
                await deleteInventoryBottle(id, bottle.id)
              }
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Could not delete bottle')
            }
          },
        },
      ]
    )
  }

  // 批 7(F4):本頁退出原生 header(_layout 設 headerShown false),
  // header 帶自繪——iOS 26 對 header 內按鈕強制圓形玻璃殼,方框 sort 鈕
  // 要與返回膠囊同列只能整條自繪。右滑返回為 stack 手勢,不受影響。

  if (!validShelf) {
    return <Redirect href="/(tabs)/inventory" />
  }

  if (!initialized) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={OaklandDusk.brand.gold} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: OaklandDusk.bg.void }}>
      {/* 自繪 header 帶(F3 返回膠囊 + F1/F2 sort 鈕,頂距/inset 對齊 Masthead) */}
      <View style={[styles.band, { paddingTop: insets.top + 20 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityLabel="Back to My Bar"
          style={styles.backPill}
        >
          <FontAwesome name="chevron-left" size={16} color={OaklandDusk.brand.gold} />
          <Text style={styles.backPillText}>My Bar</Text>
        </Pressable>
        {shelfItems.length > 0 && (
          <Pressable
            onPress={() => setShowSortDropdown(true)}
            hitSlop={6}
            accessibilityLabel="Sort bottles"
            style={styles.sortBtn}
          >
            <View style={styles.sortFrame}>
              <FilterIcon />
            </View>
            <Text style={styles.sortLabel}>SORT</Text>
          </Pressable>
        )}
      </View>

      {/* Head:標題 + 金色大數字(批 4 排版;fix:數瓶不數列,與酒櫃層標籤一致) */}
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{shelfId.toUpperCase()}</Text>
          <View style={styles.titleSpacer} />
          <Text style={styles.titleCount}>{shelfItems.reduce((n, it) => n + Math.max(1, it.bottles.length), 0)}</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Sort Dropdown Modal */}
        <Modal
          transparent
          visible={showSortDropdown}
          animationType="fade"
          onRequestClose={() => setShowSortDropdown(false)}
        >
          {/* Overlay: tap outside to close */}
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowSortDropdown(false)}
          >
            {/* Dropdown panel: stop propagation so tapping inside doesn't close */}
            {/* 錨點 = band 頂距 20 + sort 方框 32 + 間隙 8 = 鈕正下方 */}
            <Pressable style={[styles.dropdown, { marginTop: insets.top + 60 }]} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.dropdownTitle}>Sort by</Text>
              {DROPDOWN_SORT_OPTIONS.map(({ key, label }) => {
                const isActive = sortBy === key
                return (
                  <Pressable
                    key={key}
                    onPress={() => handleSortSelect(key)}
                    style={[styles.dropdownItem, isActive && styles.dropdownItemActive]}
                  >
                    <Text style={[styles.dropdownItemText, isActive && styles.dropdownItemTextActive]}>
                      {label}
                    </Text>
                    {isActive ? (
                      <Text style={styles.dropdownCheckmark}>
                        {sortOrder === 'asc' ? '↑' : '↓'}
                      </Text>
                    ) : null}
                  </Pressable>
                )
              })}
            </Pressable>
          </Pressable>
        </Modal>

        {/* Edit Bottle Modal */}
        <EditBottleModal
          item={editItem}
          bottle={editBottle}
          bottleIndex={editBottleIndex}
          visible={editItem !== null}
          onClose={() => { setEditItem(null); setEditBottle(null) }}
          onSave={handleEditSave}
        />

        <View style={styles.list}>
          {sortBy === 'family'
            ? (() => {
                let lastGroup = ''
                return sortedItems.map((item) => {
                  const group = formatFamilyKey(item.family_key)
                  const showHeader = group !== lastGroup
                  lastGroup = group
                  return (
                    <React.Fragment key={item.id}>
                      {showHeader ? (
                        <Text style={styles.sectionHeader}>{group}</Text>
                      ) : null}
                      <InventoryCard
                        item={item}
                        sortBy={sortBy}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onRestock={() => trackAndOpenPurchaseLink({
                        ingredientKey: item.ingredient_key,
                        displayName: item.display_name,
                        source: "my_bar",
                      })}
                      />
                    </React.Fragment>
                  )
                })
              })()
            : sortedItems.map((item, idx) =>
                idx === 0 ? (
                  <InventoryCardWithGuide
                    key={item.id}
                    item={item}
                    sortBy={sortBy}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onRestock={() => trackAndOpenPurchaseLink({
                          ingredientKey: item.ingredient_key,
                          displayName: item.display_name,
                          source: "my_bar",
                        })}
                    isFirstCard
                    guideSwipeDismissed={guideSwipeDismissed}
                    onSwipeOpen={dismissSwipeGuide}
                  />
                ) : (
                  <InventoryCard
                    key={item.id}
                    item={item}
                    sortBy={sortBy}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onRestock={() => trackAndOpenPurchaseLink({
                          ingredientKey: item.ingredient_key,
                          displayName: item.display_name,
                          source: "my_bar",
                        })}
                  />
                )
              )
          }
        </View>
        {!guideSwipeDismissed && (
          <Text style={{ fontSize: 11, color: OaklandDusk.text.disabled, textAlign: 'center', marginTop: 16 }}>
            ← Swipe left on a bottle to edit or remove
          </Text>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 8,
    paddingBottom: 100,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: OaklandDusk.bg.void,
  },

  // 自繪 header 帶(F4;頂距 insets.top + 20 與 inset 26 對齊 Masthead)
  band: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 26,
  },
  // F3 返回膠囊
  backPill: {
    height: 40,
    borderRadius: 999,
    paddingHorizontal: 16,
    backgroundColor: withAlpha(OaklandDusk.text.primary, 0.05),
    borderWidth: 1,
    borderColor: withAlpha(OaklandDusk.text.primary, 0.14),
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backPillText: {
    fontSize: 16,
    color: OaklandDusk.brand.gold,
  },
  // F1+F2 sort 鈕:結構鏡射 inventory.tsx 的 scanBtn/scanFrame/scanLabel
  sortBtn: {
    alignItems: 'center',
    gap: 4,
  },
  sortFrame: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: withAlpha(OaklandDusk.brand.gold, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortLabel: {
    fontFamily: 'DMMono',
    fontSize: 8,
    letterSpacing: 2,
    color: OaklandDusk.brand.gold,
  },

  // Head(標題 V3.type.drinkName + 右側金色大數字)
  head: {
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 5,
  },
  titleSpacer: {
    flex: 1,
  },
  title: {
    ...V3.type.drinkName,
    lineHeight: 51, // RN clips Bebas when lineHeight < fontSize
    color: OaklandDusk.text.primary,
  },
  titleCount: {
    fontFamily: V3.fonts.bebas,
    fontSize: 44,
    lineHeight: 48, // Bebas 防裁切:lineHeight ≥ fontSize
    color: OaklandDusk.brand.gold,
  },

  // Dropdown Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  dropdown: {
    marginRight: 16,
    backgroundColor: OaklandDusk.bg.card,
    borderRadius: 14,
    paddingVertical: 8,
    minWidth: 200,
    borderWidth: 1,
    borderColor: OaklandDusk.bg.border,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  dropdownTitle: {
    ...Type.label,
    color: OaklandDusk.text.tertiary,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  dropdownItemActive: {
    backgroundColor: OaklandDusk.bg.surface,
  },
  dropdownItemText: {
    ...Type.body,
    color: OaklandDusk.text.secondary,
  },
  dropdownItemTextActive: {
    fontWeight: '700',
    color: OaklandDusk.text.primary,
  },
  dropdownCheckmark: {
    fontSize: 15,
    fontWeight: '700',
    color: OaklandDusk.brand.gold,
  },

  list: {
    gap: 12,
  },
  sectionHeader: {
    ...Type.label,
    color: OaklandDusk.text.tertiary,
    marginTop: 12,
    marginBottom: 4,
    paddingLeft: 2,
  },

  // Card
  card: {
    borderWidth: 1,
    borderColor: OaklandDusk.bg.border,
    backgroundColor: OaklandDusk.bg.card,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardName: {
    ...Type.heading,
    marginBottom: 2,
    color: OaklandDusk.text.primary,
  },
  cardMeta: {
    ...Type.caption,
    color: OaklandDusk.text.tertiary,
  },
  blindDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgb(192,72,88)',
  },
  bottleCountPill: {
    backgroundColor: withAlpha(OaklandDusk.brand.gold, 0.1),
    borderWidth: 1,
    borderColor: withAlpha(OaklandDusk.brand.gold, 0.25),
    borderRadius: 6,
    paddingVertical: 1,
    paddingHorizontal: 6,
  },
  bottleCountPillText: {
    fontFamily: 'DMMono',
    fontSize: 11,
    letterSpacing: 0.5,
    color: OaklandDusk.brand.gold,
  },
  pageDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  pageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: withAlpha(OaklandDusk.text.primary, 0.25),
  },
  pageDotActive: {
    backgroundColor: OaklandDusk.brand.gold,
  },
  restockPill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgb(192,72,88)',
    borderRadius: 999,
  },
  restockPillText: {
    ...Type.label,
    fontSize: 11,
    letterSpacing: 0.7,
    color: 'rgb(214,110,124)',
  },
})

// ── Edit Bottle Modal styles ───────────────────────────────────────────────────
const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  bottleHint: {
    fontFamily: 'DMMono',
    fontSize: 12,
    color: OaklandDusk.text.secondary,
    marginTop: 4,
    marginBottom: 2,
  },
  sheet: {
    backgroundColor: OaklandDusk.bg.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: OaklandDusk.bg.border,
    padding: 24,
    paddingBottom: 40,
    gap: 12,
  },
  title: {
    ...Type.title,
    marginBottom: 4,
    color: OaklandDusk.text.primary,
  },
  fieldLabel: {
    ...Type.label,
    color: OaklandDusk.text.tertiary,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: OaklandDusk.bg.border,
    backgroundColor: OaklandDusk.bg.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 16,
    fontWeight: '500',
    color: OaklandDusk.text.primary,
  },
  sizeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  sizePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: OaklandDusk.bg.border,
    backgroundColor: OaklandDusk.bg.surface,
  },
  sizePillActive: {
    backgroundColor: OaklandDusk.brand.gold,
    borderColor: OaklandDusk.brand.gold,
  },
  sizePillText: {
    fontSize: 14,
    fontWeight: '600',
    color: OaklandDusk.text.secondary,
  },
  sizePillTextActive: {
    color: OaklandDusk.bg.void,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: OaklandDusk.bg.border,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: OaklandDusk.text.secondary,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: OaklandDusk.brand.gold,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: OaklandDusk.bg.void,
  },
})
