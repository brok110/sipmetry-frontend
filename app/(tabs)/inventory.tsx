import AddToInventoryModal from '@/components/AddToInventoryModal'
import { useAuth } from '@/context/auth'
import { InventoryItem, useInventory } from '@/context/inventory'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

type SortBy =
  | 'date_added'
  | 'remaining_volume'
  | 'category'
  | 'last_used_at'
  | 'brand_name'
  | 'flavor_profile'
type SortOrder = 'asc' | 'desc'

// All 6 sort options shown in the dropdown
const DROPDOWN_SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'date_added',       label: 'Added' },
  { key: 'remaining_volume', label: 'Remaining Volume' },
  { key: 'category',         label: 'Category' },
  { key: 'last_used_at',     label: 'Last Used' },
  { key: 'brand_name',       label: 'Brand Name' },
  { key: 'flavor_profile',   label: 'Flavor Profile' },
]

// 從 ingredient_key 推導酒類分類（e.g. "dry_gin" → "Gin"）
function deriveCategory(key: string): string {
  const k = String(key ?? '').toLowerCase()
  if (k.includes('gin'))     return 'Gin'
  if (k.includes('vodka'))   return 'Vodka'
  if (k.includes('rum'))     return 'Rum'
  if (k.includes('tequila') || k.includes('mezcal')) return 'Tequila'
  if (k.includes('bourbon')) return 'Bourbon'
  if (k.includes('whiskey') || k.includes('whisky') || k.includes('scotch') || k.includes('rye')) return 'Whiskey'
  if (k.includes('brandy') || k.includes('cognac')) return 'Brandy'
  if (k.includes('liqueur') || k.includes('triple_sec') || k.includes('cointreau') || k.includes('curacao')) return 'Liqueur'
  if (k.includes('vermouth') || k.includes('aperitif') || k.includes('campari')) return 'Aperitif'
  if (k.includes('juice') || k.includes('syrup') || k.includes('soda') || k.includes('water')) return 'Mixer'
  if (k.includes('bitters')) return 'Bitters'
  return 'Other'
}

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
      case 'category': {
        const ca = deriveCategory(a.ingredient_key)
        const cb = deriveCategory(b.ingredient_key)
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
      case 'flavor_profile': {
        const fa = Array.isArray(a.flavor_profile) ? (a.flavor_profile[0] ?? '') : ''
        const fb = Array.isArray(b.flavor_profile) ? (b.flavor_profile[0] ?? '') : ''
        if (!fa && !fb) return 0
        if (!fa) return 1
        if (!fb) return -1
        return fa.localeCompare(fb) * dir
      }
      default:
        return 0
    }
  })
}

// ── Filter icon (3 horizontal lines, pyramid style) ───────────────────────────
function FilterIcon({ color = '#111' }: { color?: string }) {
  return (
    <View style={{ gap: 4, alignItems: 'flex-end' }}>
      <View style={{ width: 18, height: 2, borderRadius: 1, backgroundColor: color }} />
      <View style={{ width: 13, height: 2, borderRadius: 1, backgroundColor: color }} />
      <View style={{ width: 8,  height: 2, borderRadius: 1, backgroundColor: color }} />
    </View>
  )
}

// ── Camera icon (minimal, view-based) ─────────────────────────────────────────
function CameraIcon({ color = '#111' }: { color?: string }) {
  return (
    <View style={{ width: 22, height: 18, alignItems: 'center', justifyContent: 'center' }}>
      {/* Viewfinder body */}
      <View style={{ width: 22, height: 14, borderRadius: 3, borderWidth: 2, borderColor: color }} />
      {/* Lens circle */}
      <View style={{
        position: 'absolute', bottom: 2,
        width: 7, height: 7, borderRadius: 4, borderWidth: 2, borderColor: color,
      }} />
      {/* Top bump */}
      <View style={{
        position: 'absolute', top: 0, left: 7,
        width: 8, height: 4,
        borderTopLeftRadius: 2, borderTopRightRadius: 2,
        borderWidth: 2, borderBottomWidth: 0, borderColor: color,
      }} />
    </View>
  )
}

// ── Horizontal drag slider ────────────────────────────────────────────────────
function HorizontalPctSlider({
  value,
  onChange,
}: {
  value: number
  onChange: (pct: number) => void
}) {
  const trackWidth = useRef(0)
  const currentValue = useRef(value)

  // Keep ref in sync for PanResponder closure
  currentValue.current = value

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        if (trackWidth.current <= 0) return
        const x = evt.nativeEvent.locationX
        const pct = Math.round(Math.max(0, Math.min(100, (x / trackWidth.current) * 100)))
        onChange(pct)
      },
      onPanResponderMove: (evt) => {
        if (trackWidth.current <= 0) return
        const x = evt.nativeEvent.locationX
        const pct = Math.round(Math.max(0, Math.min(100, (x / trackWidth.current) * 100)))
        onChange(pct)
      },
    })
  ).current

  const isLow = value <= 15
  const fillColor = isLow ? '#E53935' : '#D4A017'

  return (
    <View style={sliderStyles.wrapper}>
      <View
        style={sliderStyles.track}
        onLayout={(e) => { trackWidth.current = e.nativeEvent.layout.width }}
        {...panResponder.panHandlers}
      >
        {/* Fill */}
        <View
          style={[
            sliderStyles.fill,
            { width: `${value}%` as any, backgroundColor: fillColor },
          ]}
        />
        {/* Thumb */}
        <View
          style={[
            sliderStyles.thumb,
            { left: `${value}%` as any, borderColor: fillColor },
          ]}
        />
      </View>
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
    backgroundColor: '#EEE',
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
    backgroundColor: '#FFF',
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

  // Sync fields when modal opens for a different item
  useEffect(() => {
    if (item) {
      setName(item.display_name)
      setTotalMl(BOTTLE_SIZES.includes(Number(item.total_ml)) ? Number(item.total_ml) : 700)
      setPct(Math.round(Number(item.remaining_pct)))
    }
  }, [item])

  const handleSave = async () => {
    if (!item || saving) return
    const trimmed = name.trim()
    if (!trimmed) return
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
                onPress={() => setTotalMl(size)}
                style={[modalStyles.sizePill, totalMl === size && modalStyles.sizePillActive]}
              >
                <Text style={[modalStyles.sizePillText, totalMl === size && modalStyles.sizePillTextActive]}>
                  {size < 1000 ? `${size}` : size === 1000 ? '1L' : '1.75L'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Remaining */}
          <Text style={modalStyles.fieldLabel}>
            Remaining — {previewMl}ml ({pct}%)
          </Text>
          <HorizontalPctSlider value={pct} onChange={setPct} />

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
  onEdit,
  onDelete,
}: {
  item: InventoryItem
  onEdit: (item: InventoryItem) => void
  onDelete: (id: string, name: string) => void
}) {
  const parsedPct = Math.round(Number(item.remaining_pct))
  const remainingMl = Math.round(Number(item.remaining_ml))
  const isLow = parsedPct <= 15

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.display_name}
          </Text>
          <Text style={styles.cardMeta}>
            {remainingMl}ml left ({parsedPct}%)
          </Text>
        </View>

        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Pressable
            onPress={() => onEdit(item)}
            style={styles.editBtn}
            hitSlop={8}
          >
            <Text style={styles.editBtnText}>Edit</Text>
          </Pressable>
          <Pressable
            onPress={() => onDelete(item.id, item.display_name)}
            style={styles.deleteBtn}
            hitSlop={8}
          >
            <Text style={styles.deleteBtnText}>✕</Text>
          </Pressable>
        </View>
      </View>

      {/* Fill bar */}
      <View style={styles.fillBarBg}>
        <View
          style={[
            styles.fillBarFill,
            {
              width: `${Math.max(0, Math.min(100, parsedPct))}%` as any,
              backgroundColor: isLow ? '#E53935' : '#D4A017',
            },
          ]}
        />
      </View>
    </View>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function MyBarScreen() {
  const { session } = useAuth()
  const {
    inventory,
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

  // ── Bottle scan state ──────────────────────────────────────────────────────
  const [bottleScanLoading, setBottleScanLoading] = useState(false)
  const [bottleScanTarget, setBottleScanTarget] = useState<{
    displayName: string
    ingredientKey: string
    totalMl: number | null          // valid size if AI read it from label
    detectedSizeMl: number | null   // raw AI value (null = not on label)
    confidence: 'high' | 'medium' | 'low'
  } | null>(null)

  const handleSortSelect = (key: SortBy) => {
    if (key === sortBy) {
      // 同一條件：切換升降冪
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      // 切換條件：依條件設預設方向
      setSortBy(key)
      setSortOrder(key === 'category' ? 'asc' : 'desc')
    }
    setShowSortDropdown(false)
  }

  const sortedInventory = useMemo(
    () => sortInventory(inventory, sortBy, sortOrder),
    [inventory, sortBy, sortOrder]
  )

  // 當前排序的 label（顯示在 Filter 按鈕旁）
  const activeSortLabel = DROPDOWN_SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? 'Sort'

  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? ''

  const handleRefresh = () => {
    refreshInventory({ silent: true, notifyLowStock: true }).catch(() => {})
  }

  // ── Bottle scan ────────────────────────────────────────────────────────────
  const handleScanBottle = async () => {
    if (!session?.access_token) {
      Alert.alert('Sign in required', 'Please sign in to scan bottles.')
      return
    }

    // Ask user: camera or photo library
    Alert.alert('Scan Bottle', 'How would you like to add a bottle?', [
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
            await runIdentifyBottle(result.assets[0].uri)
          }
        },
      },
      {
        text: 'Choose Photo',
        onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
          if (!perm.granted) {
            Alert.alert('Permission required', 'Please allow photo library access.')
            return
          }
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, exif: false, base64: false })
          if (!result.canceled && result.assets?.[0]) {
            await runIdentifyBottle(result.assets[0].uri)
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const runIdentifyBottle = async (uri: string) => {
    setBottleScanLoading(true)
    try {
      // Compress image before upload (~500KB target)
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      )
      const b64 = compressed.base64
      if (!b64) throw new Error('Image compression failed.')

      const res = await fetch(`${apiUrl}/identify-bottle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: b64 }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      const validSizes = [375, 500, 700, 750, 1000, 1750]
      const rawSize = data.bottle_size_ml != null ? Number(data.bottle_size_ml) : null
      setBottleScanTarget({
        displayName: data.display_name ?? '',
        ingredientKey: data.ingredient_key ?? '',
        totalMl: rawSize && validSizes.includes(rawSize) ? rawSize : null,
        detectedSizeMl: rawSize,
        confidence: data.confidence ?? 'medium',
      })
    } catch (e: any) {
      Alert.alert('Scan failed', e?.message ?? 'Could not identify the bottle. Please try again.')
    } finally {
      setBottleScanLoading(false)
    }
  }

  const handleBottleAdd = async (payload: {
    ingredient_key: string
    display_name: string
    total_ml: number
    remaining_pct: number
  }) => {
    await addInventoryItem(payload)
  }

  const handleEdit = (item: InventoryItem) => {
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

        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
          {/* Scan Bottle button — always visible */}
          <Pressable
            onPress={handleScanBottle}
            style={[styles.filterBtn, { marginTop: 4 }]}
            hitSlop={8}
            disabled={bottleScanLoading}
          >
            {bottleScanLoading
              ? <ActivityIndicator size="small" color="#111" />
              : <CameraIcon />
            }
          </Pressable>

          {inventory.length > 0 ? (
            <Pressable
              onPress={() => setShowSortDropdown(true)}
              style={styles.filterBtn}
              hitSlop={8}
            >
              <FilterIcon />
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

      {/* Scan Bottle → Add to Inventory Modal */}
      {bottleScanTarget ? (
        <AddToInventoryModal
          visible={true}
          ingredientKey={bottleScanTarget.ingredientKey}
          displayName={bottleScanTarget.displayName}
          initialTotalMl={bottleScanTarget.totalMl ?? undefined}
          detectedSizeMl={bottleScanTarget.detectedSizeMl}
          confidence={bottleScanTarget.confidence}
          onClose={() => setBottleScanTarget(null)}
          onConfirm={handleBottleAdd}
        />
      ) : null}

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
            Go to the Scan tab, identify ingredients, and tap{' '}
            <Text style={{ fontWeight: '800' }}>+ Bar</Text> to add bottles here.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {sortedInventory.map((item) => (
            <InventoryCard
              key={item.id}
              item={item}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 8,
    paddingBottom: 40,
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
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 2,
  },
  subheading: {
    fontSize: 14,
    color: '#888',
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
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingVertical: 8,
    minWidth: 200,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  dropdownTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#AAA',
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
    backgroundColor: '#F5F5F5',
  },
  dropdownItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#222',
  },
  dropdownItemTextActive: {
    fontWeight: '700',
    color: '#111',
  },
  dropdownCheckmark: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },

  errorBox: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#E53935',
    borderRadius: 10,
    marginBottom: 8,
  },
  errorText: {
    color: '#E53935',
    fontWeight: '700',
  },
  emptyBox: {
    padding: 24,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  list: {
    gap: 12,
  },

  // Card
  card: {
    borderWidth: 1,
    borderColor: '#DDD',
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
  },
  cardMeta: {
    fontSize: 13,
    color: '#666',
  },

  // Edit / delete buttons
  editBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
  },
  editBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#444',
  },
  deleteBtn: {
    padding: 6,
  },
  deleteBtnText: {
    fontSize: 16,
    color: '#AAA',
    fontWeight: '700',
  },
  editActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  editActionBtnSave: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  editActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#444',
  },

  // Fill bar
  fillBarBg: {
    height: 8,
    backgroundColor: '#EEE',
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
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 16,
    fontWeight: '500',
    color: '#111',
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
    borderColor: '#DDD',
    backgroundColor: '#F5F5F5',
  },
  sizePillActive: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  sizePillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444',
  },
  sizePillTextActive: {
    color: '#FFF',
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
    borderColor: '#DDD',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#444',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#111',
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
})
