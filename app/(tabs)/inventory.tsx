import { apiFetch } from '@/lib/api'
import * as ImagePicker from 'expo-image-picker'
import OaklandDusk from '@/constants/OaklandDusk'
import StaplesModal, { DEFAULT_STAPLES } from '@/components/StaplesModal'
import GuideBubble, { GUIDE_KEYS, dismissGuide, isGuideDismissed } from '@/components/GuideBubble'
import LevelRing from '@/components/ui/LevelRing'
import SwipeRow from '@/components/ui/SwipeRow'
import { useAuth } from '@/context/auth'
import { InventoryItem, useInventory } from '@/context/inventory'
import { usePurchaseIntent } from '@/hooks/usePurchaseIntent'
import { useFocusEffect, router } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
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

// ── Camera icon (minimal, view-based) ─────────────────────────────────────────
function CameraIcon({ color = OaklandDusk.brand.gold, size = 20 }: { color?: string; size?: number }) {
  const scale = size / 22
  return (
    <View style={{ width: size, height: size * 0.82, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size, height: size * 0.64, borderRadius: 3 * scale, borderWidth: 2, borderColor: color }} />
      <View style={{
        position: 'absolute', bottom: 2 * scale,
        width: 7 * scale, height: 7 * scale, borderRadius: 4 * scale, borderWidth: 2, borderColor: color,
      }} />
      <View style={{
        position: 'absolute', top: 0, left: 7 * scale,
        width: 8 * scale, height: 4 * scale,
        borderTopLeftRadius: 2 * scale, borderTopRightRadius: 2 * scale,
        borderWidth: 2, borderBottomWidth: 0, borderColor: color,
      }} />
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

  useEffect(() => {
    fillPct.value = value
  }, [value])

  const stableOnChange = useCallback((v: number) => {
    onChange(v)
  }, [onChange])

  const stableOnTouchStart = useCallback(() => {
    if (onTouchStart) onTouchStart()
  }, [onTouchStart])

  const gesture = Gesture.Pan()
    .onBegin((e) => {
      'worklet'
      if (onTouchStart) runOnJS(stableOnTouchStart)()
      if (trackWidth.value <= 0) return
      const pct = Math.max(0, Math.min(100, (e.x / trackWidth.value) * 100))
      fillPct.value = pct
    })
    .onUpdate((e) => {
      'worklet'
      if (trackWidth.value <= 0) return
      const pct = Math.max(0, Math.min(100, (e.x / trackWidth.value) * 100))
      fillPct.value = pct
    })
    .onEnd(() => {
      'worklet'
      const snapped = snapTo5(fillPct.value)
      fillPct.value = withTiming(snapped, { duration: 80 })
      runOnJS(stableOnChange)(snapped)
    })
    .hitSlop({ top: 20, bottom: 20, left: 10, right: 10 })
    .minDistance(0)

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
  visible,
  onClose,
  onSave,
}: {
  item: InventoryItem | null
  visible: boolean
  onClose: () => void
  onSave: (id: string, updates: { display_name: string; total_ml: number; remaining_pct: number }) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [totalMl, setTotalMl] = useState(700)
  const [pct, setPct] = useState(100)
  const [saving, setSaving] = useState(false)
  const [isCustomSize, setIsCustomSize] = useState(false)
  const [customMlText, setCustomMlText] = useState('')
  const [guideEditBottleVisible, setGuideEditBottleVisible] = useState(false)

  // Sync fields when modal opens for a different item
  useEffect(() => {
    if (item) {
      setName(item.display_name)
      const ml = Number(item.total_ml)
      if (BOTTLE_SIZES.includes(ml)) {
        setTotalMl(ml)
        setIsCustomSize(false)
        setCustomMlText('')
      } else {
        setTotalMl(ml)
        setIsCustomSize(true)
        setCustomMlText(String(ml))
      }
      setPct(Math.round(Number(item.remaining_pct)))
      isGuideDismissed(GUIDE_KEYS.EDIT_BOTTLE).then((d) => setGuideEditBottleVisible(!d))
    }
  }, [item])

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
      await onSave(item.id, { display_name: trimmed, total_ml: totalMl, remaining_pct: pct })
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
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <Pressable style={modalStyles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={modalStyles.title}>Edit Bottle</Text>

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
                placeholder="Enter ml (50\u20135000)"
                placeholderTextColor="#888"
                keyboardType="number-pad"
                maxLength={4}
                returnKeyType="done"
              />
              <Text style={{ fontSize: 11, color: '#888' }}>
                50\u20135000 ml
              </Text>
            </View>
          )}

          {/* Remaining */}
          <Text style={modalStyles.fieldLabel}>
            Remaining — {previewMl}ml ({pct}%)
          </Text>
          <View style={{ position: "relative" }}>
            <GuideBubble
              storageKey={GUIDE_KEYS.EDIT_BOTTLE}
              text="Drag to set remaining level!"
              visible={guideEditBottleVisible}
              onDismiss={() => setGuideEditBottleVisible(false)}
              position="above"
              align="center"
            />
            <HorizontalPctSlider
              value={pct}
              onChange={setPct}
              onTouchStart={() => {
                dismissGuide(GUIDE_KEYS.EDIT_BOTTLE)
                setGuideEditBottleVisible(false)
              }}
            />
          </View>

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
  onEdit: (item: InventoryItem) => void
  onDelete: (id: string, name: string) => void
  onRestock?: () => void
  isFirstCard?: boolean
  onSwipeOpen?: () => void
}) {
  const parsedPct = Math.round(Number(item.remaining_pct))
  const remainingMl = Math.round(Number(item.remaining_ml))
  const isLow = parsedPct < 20

  return (
    <SwipeRow
      onEdit={() => onEdit(item)}
      onDelete={() => onDelete(item.id, item.display_name)}
      onSwipeOpen={isFirstCard ? onSwipeOpen : undefined}
    >
      <View style={[styles.card, isLow && { backgroundColor: 'rgba(192,72,88,0.08)' }]}>
        <View style={styles.cardHeader}>
          {/* Info */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Pressable onPress={() => Linking.openURL(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(item.display_name + ' bottle')}`)}>
              <Text style={styles.cardName} numberOfLines={1}>
                {item.display_name}
              </Text>
            </Pressable>
            <Text style={styles.cardMeta}>
              {sortBy === 'date_added'
                ? `${formatAddedDate(item.updated_at)} · `
                : sortBy === 'last_used_at'
                ? `${formatRelativeTime(item.last_used_at)} · `
                : ''}
              {remainingMl}ml left
            </Text>
          </View>

          {/* Level ring */}
          <LevelRing percent={parsedPct} size={40} />
        </View>
      </View>
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
  onEdit: (item: InventoryItem) => void
  onDelete: (id: string, name: string) => void
  onRestock?: () => void
  isFirstCard: boolean
  guideSwipeDismissed: boolean
  onSwipeOpen: () => void
}) {
  return (
    <View style={{ position: "relative" }}>
      {isFirstCard && !guideSwipeDismissed && (
        <GuideBubble
          storageKey={GUIDE_KEYS.MYBAR_SWIPE}
          text="Swipe left to edit or remove!"
          visible={!guideSwipeDismissed}
          onDismiss={onSwipeOpen}
          align="right"
          position="below"
        />
      )}
      <InventoryCard
        item={item}
        sortBy={sortBy}
        onEdit={onEdit}
        onDelete={onDelete}
        onRestock={onRestock}
        isFirstCard={isFirstCard}
        onSwipeOpen={onSwipeOpen}
      />
    </View>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function MyBarScreen() {
  const { session } = useAuth()
  const { trackAndOpenPurchaseLink } = usePurchaseIntent()
  const {
    inventory,
    availableIngredientKeys,
    loading,
    refreshing,
    error,
    initialized,
    refreshInventory,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
  } = useInventory()

  // ── Sort state (預設：加入時間 降冪) ──────────────────────
  const [sortBy, setSortBy] = useState<SortBy>('date_added')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)

  // ── Guide bubble state (Stage 5) ──────────────────────────────────────────
  const [guideMyBarEmptyVisible, setGuideMyBarEmptyVisible] = useState(false)
  const [guideMyBarCtaVisible, setGuideMyBarCtaVisible] = useState(false)
  const [guideSwipeDismissed, setGuideSwipeDismissed] = useState(true)

  useEffect(() => {
    isGuideDismissed(GUIDE_KEYS.MYBAR_EMPTY).then((d) => setGuideMyBarEmptyVisible(!d))
    isGuideDismissed(GUIDE_KEYS.MYBAR_CTA).then((d) => setGuideMyBarCtaVisible(!d))
    isGuideDismissed(GUIDE_KEYS.MYBAR_SWIPE).then((d) => setGuideSwipeDismissed(d))
  }, [])

  // ── See recipes loading state ──────────────────────────────────────────────
  const [recommendLoading, setRecommendLoading] = useState(false)
  const [showStaplesModal, setShowStaplesModal] = useState(false)

  const promptScanBottles = () => {
    Alert.alert('Scan Bottles', 'How would you like to scan?', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync()
          if (!perm.granted) {
            Alert.alert('Permission required', 'Please allow camera access.')
            return
          }
          const result = await ImagePicker.launchCameraAsync({ quality: 0.9, exif: false, base64: false })
          if (!result.canceled && result.assets?.[0]) {
            router.push({ pathname: '/scan', params: { photoUri: result.assets[0].uri } })
          }
        },
      },
      {
        text: 'Choose Photos',
        onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
          if (!perm.granted) {
            Alert.alert('Permission required', 'Please allow photo library access.')
            return
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            quality: 0.9,
            exif: false,
            base64: false,
          })
          if (!result.canceled && result.assets?.length) {
            router.push({
              pathname: '/scan',
              params: { photoUris: JSON.stringify(result.assets.map(a => a.uri)) },
            })
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ])
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

  const sortedInventory = useMemo(
    () => sortInventory(inventory, sortBy, sortOrder),
    [inventory, sortBy, sortOrder]
  )

  // 當前排序的 label（顯示在 Filter 按鈕旁）
  const activeSortLabel = DROPDOWN_SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? 'Sort'

  useFocusEffect(
    React.useCallback(() => {
      refreshInventory({ silent: true }).catch(() => {})
    }, [refreshInventory])
  )

  const handleRefresh = () => {
    refreshInventory({ silent: true, notifyLowStock: true }).catch(() => {})
  }


  const dismissSwipeGuide = () => {
    if (!guideSwipeDismissed) {
      setGuideSwipeDismissed(true)
      dismissGuide(GUIDE_KEYS.MYBAR_SWIPE)
    }
  }

  const handleEdit = (item: InventoryItem) => {
    dismissSwipeGuide()
    setEditItem(item)
  }

  const handleEditSave = async (
    id: string,
    updates: { display_name: string; total_ml: number; remaining_pct: number }
  ) => {
    await updateInventoryItem(id, updates)
    setEditItem(null)
  }

  const handleDelete = (id: string, name: string) => {
    dismissSwipeGuide()
    Alert.alert(
      'Remove from My Bar',
      `Remove "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteInventoryItem(id)
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Could not delete item')
            }
          },
        },
      ]
    )
  }

  const handleSeeRecipes = async (staplesKeys: string[] = []) => {
    if (recommendLoading) return
    if (availableIngredientKeys.length === 0) return

    setRecommendLoading(true)
    try {
      const mergedIngredients = [...new Set([...availableIngredientKeys, ...staplesKeys])]
      const resp = await apiFetch('/recommend-classics', {
        session,
        method: 'POST',
        body: {
          detected_ingredients: mergedIngredients,
          locale: 'en',
        },
      })

      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`Recommend API failed: ${resp.status} ${text}`)
      }

      const data = await resp.json() as {
        can_make?: any[]
        one_away?: any[]
        two_away?: any[]
      }

      const canMake = Array.isArray(data.can_make) ? data.can_make : []
      const oneAway = Array.isArray(data.one_away) ? data.one_away : []
      const twoAway = Array.isArray(data.two_away) ? data.two_away : []

      const flattened = [
        ...canMake.map((x: any) => ({ ...x, bucket: 'ready' as const })),
        ...oneAway.map((x: any) => ({ ...x, bucket: 'one_missing' as const })),
        ...twoAway.map((x: any) => ({ ...x, bucket: 'two_missing' as const })),
      ]

      router.push({
        pathname: '/recommendations',
        params: {
          recipes: JSON.stringify(flattened),
          ingredientCount: String(availableIngredientKeys.length),
          activeCanonical: JSON.stringify(availableIngredientKeys),
          scanItems: JSON.stringify([
            ...inventory.map((item) => ({
              canonical: item.ingredient_key,
              display: item.display_name,
            })),
            ...staplesKeys.map((k) => ({
              canonical: k,
              display: DEFAULT_STAPLES.find((s) => s.ingredient_key === k)?.display_name ?? k.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
            })),
          ]),
          mode: 'inventory',
        },
      })
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not load recipes')
    } finally {
      setRecommendLoading(false)
    }
  }

  if (!session) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Sign in to view My Bar</Text>
        <Text style={styles.emptySubtitle}>
          Your inventory will appear here once you sign in.
        </Text>
      </View>
    )
  }

  if ((loading || !initialized) && inventory.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111" />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: OaklandDusk.bg.void }}>
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Heading row with Filter icon */}
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.heading}>My Bar</Text>
          <Text style={styles.subheading}>
            {inventory.length === 0
              ? 'No bottles yet'
              : `${inventory.length} bottle${inventory.length === 1 ? '' : 's'}`}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {/* Scan Bottle button */}
          <Pressable
            onPress={promptScanBottles}
            hitSlop={8}
            style={{ alignItems: 'center', gap: 2 }}
          >
            <View style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: 'rgba(200,120,40,0.3)',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <CameraIcon size={18} />
            </View>
            <Text style={{ fontSize: 10, color: OaklandDusk.brand.gold }}>Scan</Text>
          </Pressable>

          {/* Sort button */}
          {inventory.length > 0 ? (
            <Pressable
              onPress={() => setShowSortDropdown(true)}
              hitSlop={8}
              style={{
                alignItems: 'center',
                gap: 2,
              }}
            >
              <View style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: 'rgba(200,120,40,0.3)',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <FilterIcon />
              </View>
              <Text style={{ fontSize: 10, color: OaklandDusk.brand.gold }}>Sort</Text>
            </Pressable>
          ) : null}
        </View>
      </View>


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
          <Pressable style={styles.dropdown} onPress={(e) => e.stopPropagation()}>
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
        visible={editItem !== null}
        onClose={() => setEditItem(null)}
        onSave={handleEditSave}
      />

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {inventory.length === 0 && !error ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Your bar is empty</Text>
          <Text style={styles.emptySubtitle}>
            Scan your bottles to start building your bar.
          </Text>
          <View style={{ position: 'relative', width: '100%', marginTop: 12 }}>
            <GuideBubble
              storageKey={GUIDE_KEYS.MYBAR_EMPTY}
              text="Scan your bottles to get started!"
              visible={guideMyBarEmptyVisible}
              onDismiss={() => setGuideMyBarEmptyVisible(false)}
            />
            <Pressable
              onPress={() => {
                dismissGuide(GUIDE_KEYS.MYBAR_EMPTY)
                setGuideMyBarEmptyVisible(false)
                promptScanBottles()
              }}
              style={{
                borderWidth: 1.5,
                borderColor: OaklandDusk.brand.gold,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontWeight: '700', color: OaklandDusk.brand.gold }}>
                Scan your bottles
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.list}>
            {sortBy === 'family'
              ? (() => {
                  let lastGroup = ''
                  return sortedInventory.map((item) => {
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
              : sortedInventory.map((item, idx) =>
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
        </>
      )}
    </ScrollView>

    {/* Sticky footer: Show me recipes */}
    {inventory.length > 0 && (
      <View style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 16 : 12,
        backgroundColor: OaklandDusk.bg.void,
        borderTopWidth: 0.5,
        borderTopColor: OaklandDusk.bg.border,
      }}>
        <View style={{ position: 'relative' }}>
          <GuideBubble
            storageKey={GUIDE_KEYS.MYBAR_CTA}
            text="See what you can make!"
            visible={guideMyBarCtaVisible}
            onDismiss={() => setGuideMyBarCtaVisible(false)}
          />
          <Pressable
            onPress={() => {
              dismissGuide(GUIDE_KEYS.MYBAR_CTA)
              setGuideMyBarCtaVisible(false)
              setShowStaplesModal(true)
            }}
            disabled={recommendLoading}
            style={{
              backgroundColor: OaklandDusk.brand.gold,
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: 'center',
              opacity: recommendLoading ? 0.7 : 1,
            }}
          >
            {recommendLoading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color={OaklandDusk.bg.void} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: OaklandDusk.bg.void }}>
                  Finding recipes...
                </Text>
              </View>
            ) : (
              <>
                <Text style={{ fontSize: 15, fontWeight: '700', color: OaklandDusk.bg.void }}>
                  Show me recipes
                </Text>
                <Text style={{ fontSize: 12, color: OaklandDusk.bg.void, opacity: 0.7, marginTop: 2 }}>
                  Based on your bar
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    )}

    <StaplesModal
      visible={showStaplesModal}
      loading={recommendLoading}
      onConfirm={(staplesKeys) => {
        setShowStaplesModal(false)
        handleSeeRecipes(staplesKeys)
      }}
      onCancel={() => setShowStaplesModal(false)}
    />
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
  },

  // Heading row
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  heading: {
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 2,
    color: OaklandDusk.text.primary,
  },
  subheading: {
    fontSize: 14,
    color: OaklandDusk.text.tertiary,
  },

  // Filter button
  filterBtn: {
    padding: 8,
    marginTop: 4,
  },

  // Dropdown Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  dropdown: {
    marginTop: 100,
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
    fontSize: 11,
    fontWeight: '700',
    color: OaklandDusk.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
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
    fontSize: 15,
    fontWeight: '500',
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

  errorBox: {
    padding: 12,
    borderWidth: 1,
    borderColor: OaklandDusk.semantic.error,
    borderRadius: 10,
    marginBottom: 8,
  },
  errorText: {
    color: OaklandDusk.semantic.error,
    fontWeight: '700',
  },
  emptyBox: {
    padding: 24,
    borderWidth: 1,
    borderColor: OaklandDusk.bg.border,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: OaklandDusk.text.primary,
  },
  emptySubtitle: {
    fontSize: 14,
    color: OaklandDusk.text.tertiary,
    textAlign: 'center',
    lineHeight: 20,
  },
  list: {
    gap: 12,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: OaklandDusk.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
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
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
    color: OaklandDusk.text.primary,
  },
  cardMeta: {
    fontSize: 13,
    color: OaklandDusk.text.tertiary,
  },

  // Edit / delete buttons
  editBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: OaklandDusk.bg.border,
    borderRadius: 8,
  },
  editBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: OaklandDusk.text.secondary,
  },
  deleteBtn: {
    padding: 6,
  },
  deleteBtnText: {
    fontSize: 16,
    color: OaklandDusk.text.tertiary,
    fontWeight: '700',
  },
  editActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: OaklandDusk.bg.border,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  editActionBtnSave: {
    backgroundColor: OaklandDusk.brand.gold,
    borderColor: OaklandDusk.brand.gold,
  },
  editActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: OaklandDusk.text.secondary,
  },

  // Fill bar
  fillBarBg: {
    height: 8,
    backgroundColor: OaklandDusk.bg.surface,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fillBarFill: {
    height: '100%',
    borderRadius: 999,
  },
})

// ── Edit Bottle Modal styles ───────────────────────────────────────────────────
const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
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
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
    color: OaklandDusk.text.primary,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: OaklandDusk.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
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
