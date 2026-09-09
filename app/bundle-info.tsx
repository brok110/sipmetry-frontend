// app/bundle-info.tsx
// RESTOCK-SIMPLIFY S2(2026-09-08):BUY TOGETHER 瓶對頁,取代 BundleDetailSheet
// (sheet 退場)。資料由 params.bundle 帶 JSON(bundle 無 key 可查;一筆 1–2KB)。
// 版面(S5b 09-08,Brok:同 rail 卡「名字 → +N → 按鈕」,圖卡放最後):band(back
// pill / close)→ 標題 → 雙 monogram(成員可點 → /ingredient-info from:'bundle',
// 裁決 f)→ 副標「+N COCKTAILS · M ONLY TOGETHER」→ Add 膠囊三態(沿用
// bundleCapsuleState / addMissingMembers)→ ONLY TOGETHER 黃框 3:4 卡(可點 →
// /recipe,裁決 d;iba_code null 不可點)。
// S5(09-08):EACH ALONE 拿掉(畫面擁擠;成員 monogram 仍可點進介紹頁)。
// listedKeys 由 GET /shopping-list 取,比 member.on_list 新。三瓶卡:members
// 陣列直接沿用。headerShown:false 由 app/_layout.tsx 註冊(同 ingredient-info)。

import OaklandDusk from '@/constants/OaklandDusk'
import { R } from '@/constants/radius'
import Type from '@/constants/typography'
import { V3 } from '@/constants/v3DesignTokens'
import { useAuth } from '@/context/auth'
import { apiFetch } from '@/lib/api'
import { Monogram } from '@/components/restock/RailCard'
import {
  addMissingMembers,
  bundleCapsuleState,
  type BundleAddTarget,
  type BundleItem,
  type BundleMember,
  type BundleRecipe,
} from '@/components/restock/BundleRailCard'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import { Alert, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const GUTTER = 16
const USED_GAP = 10
const USED_CARD_W = (Dimensions.get('window').width - GUTTER * 2 - USED_GAP * 2) / 3

// params.bundle 防呆:形狀不對就當無效,頁面顯示錯誤而非崩
function parseBundle(raw: unknown): BundleItem | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const b = JSON.parse(raw)
    if (!b || typeof b !== 'object') return null
    if (typeof b.bundle_key !== 'string' || !Array.isArray(b.members) || b.members.length < 2) return null
    if (!b.members.every((m: any) => m && typeof m.ingredient_key === 'string' && typeof m.display_name === 'string')) return null
    return {
      bundle_key: b.bundle_key,
      members: b.members.map((m: any) => ({
        ingredient_key: m.ingredient_key,
        display_name: m.display_name,
        unlocks_count: Number.isFinite(m.unlocks_count) ? m.unlocks_count : 0,
        on_list: m.on_list === true,
        category_key: m.category_key ?? null,
        recipes: Array.isArray(m.recipes) ? m.recipes : [],
      })),
      unlocks_total: Number.isFinite(b.unlocks_total) ? b.unlocks_total : 0,
      together_only_count: Number.isFinite(b.together_only_count) ? b.together_only_count : 0,
      together_only_recipes: Array.isArray(b.together_only_recipes) ? b.together_only_recipes : [],
    }
  } catch {
    return null
  }
}

export default function BundleInfoScreen() {
  const insets = useSafeAreaInsets()
  const { session } = useAuth()
  const params = useLocalSearchParams<{ bundle?: string; from?: string }>()
  const bundle = useMemo(() => parseBundle(params.bundle), [params.bundle])

  const [listedKeys, setListedKeys] = useState<Set<string>>(() => {
    // 先用 params 帶來的 on_list 起手,GET /shopping-list 到了再校正
    const s = new Set<string>()
    bundle?.members.forEach((m) => { if (m.on_list) s.add(m.ingredient_key) })
    return s
  })
  const [adding, setAdding] = useState(false)

  const fetchListed = useCallback(async () => {
    if (!session) return
    try {
      const res = await apiFetch('/shopping-list', { session })
      if (!res.ok) return
      const data = await res.json()
      const items = Array.isArray(data?.items) ? data.items : []
      setListedKeys(new Set<string>(items.map((it: { ingredient_key: string }) => String(it.ingredient_key))))
    } catch {
      /* 非關鍵 */
    }
  }, [session])

  React.useEffect(() => {
    fetchListed()
  }, [fetchListed])

  const onAdd = useCallback(
    async (m: BundleAddTarget) => {
      if (!session) return
      const res = await apiFetch('/shopping-list', {
        session,
        method: 'POST',
        body: { ingredient_key: m.ingredient_key, display_name: m.display_name, source: 'restock' },
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      setListedKeys((prev) => new Set(prev).add(m.ingredient_key))
    },
    [session],
  )

  const cap = bundle ? bundleCapsuleState(bundle, listedKeys) : null

  const handleAddMissing = useCallback(async () => {
    if (!cap || cap.disabled || adding) return
    setAdding(true)
    try {
      await addMissingMembers(cap.missing, onAdd)
    } catch {
      Alert.alert('Error', 'Could not add to your list. Please try again.')
    } finally {
      setAdding(false)
    }
  }, [cap, adding, onAdd])

  const openIngredient = (m: BundleMember) =>
    router.push({
      pathname: '/ingredient-info',
      params: { key: m.ingredient_key, name: m.display_name, listed: listedKeys.has(m.ingredient_key) ? '1' : '0', from: 'bundle' },
    })
  const openRecipe = (iba_code: string) => router.push({ pathname: '/recipe', params: { iba_code, from: 'bundle' } })

  const header = (
    <View style={[styles.band, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={() => router.back()} hitSlop={6} accessibilityLabel="Back to Restock" style={styles.backPill}>
        <FontAwesome name="chevron-left" size={14} color={OaklandDusk.brand.gold} />
        <Text style={styles.backPillText}>Restock</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          if (router.canDismiss()) {
            router.dismissAll()
          } else {
            router.replace('/(tabs)/bartender' as any)
          }
        }}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Close and return to tabs"
        style={styles.closeBtn}
      >
        <FontAwesome name="close" size={14} color={OaklandDusk.brand.gold} />
      </Pressable>
    </View>
  )

  if (!bundle || !cap) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.scrollBody}>
          <View style={styles.errorBox}>
            <Text style={[Type.caption, { color: OaklandDusk.semantic.error }]}>Could not open this pair</Text>
            <Text style={[Type.caption, { color: OaklandDusk.text.tertiary }]}>Go back and try again</Text>
          </View>
        </View>
      </View>
    )
  }

  const names = bundle.members.map((m) => m.display_name).join(' ＋ ')
  const together = bundle.together_only_recipes.slice(0, 8)

  const renderArtCard = (r: BundleRecipe, i: number) => {
    const pressable = !!r.iba_code
    const body = (
      <>
        <View style={[styles.usedArt, styles.usedArtHi]}>
          {r.image_url ? (
            <Image source={{ uri: r.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={styles.usedFallback}>
              <FontAwesome name="glass" size={20} color={OaklandDusk.text.disabled} />
            </View>
          )}
          <LinearGradient
            colors={['transparent', `${OaklandDusk.bg.void}BF`]}
            locations={[0.55, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>
        <Text style={styles.usedName} numberOfLines={1}>
          {(r.name ?? '').toLowerCase()}
        </Text>
      </>
    )
    return pressable ? (
      <Pressable key={r.iba_code!} style={styles.usedCard} onPress={() => openRecipe(r.iba_code!)} accessibilityRole="button" accessibilityLabel={r.name ?? undefined}>
        {body}
      </Pressable>
    ) : (
      <View key={`${r.name}:${i}`} style={styles.usedCard} accessibilityLabel={r.name ?? undefined}>
        {body}
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView contentContainerStyle={styles.scrollBody}>
        <Text style={[Type.display, styles.title]}>{names}</Text>
        <View style={styles.pair}>
          {bundle.members.map((m, i) => (
            <React.Fragment key={m.ingredient_key}>
              {i > 0 && <Text style={styles.plus}>＋</Text>}
              <Pressable onPress={() => openIngredient(m)} accessibilityRole="button" accessibilityLabel={`About ${m.display_name}`}>
                <Monogram label={m.display_name} size={48} />
                {listedKeys.has(m.ingredient_key) && (
                  <View style={styles.onList}>
                    <Text style={styles.onListText}>✓</Text>
                  </View>
                )}
              </Pressable>
            </React.Fragment>
          ))}
        </View>
        <Text style={styles.category}>
          +{bundle.unlocks_total} COCKTAIL{bundle.unlocks_total === 1 ? '' : 'S'} · {bundle.together_only_count} ONLY TOGETHER
        </Text>

        <Pressable
          onPress={handleAddMissing}
          disabled={cap.disabled || adding}
          accessibilityRole="button"
          accessibilityLabel={cap.label}
          style={[styles.addPill, cap.disabled && styles.addPillDone]}
        >
          <FontAwesome name={cap.disabled ? 'check' : 'shopping-bag'} size={13} color={cap.disabled ? '#4ade80' : OaklandDusk.brand.gold} />
          <Text style={[styles.addText, cap.disabled && styles.addTextDone]}>
            {cap.disabled ? cap.label.replace(/^✓\s*/, '') : `${cap.label} to list`}
          </Text>
        </Pressable>

        {together.length > 0 ? (
          <>
            <Text style={[styles.sectionLabel, styles.sectionLabelHi]}>ONLY TOGETHER</Text>
            <View style={styles.usedRow}>{together.map(renderArtCard)}</View>
          </>
        ) : null}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: OaklandDusk.bg.void },
  band: {
    paddingHorizontal: GUTTER,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: R.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(237,230,214,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.14)',
  },
  backPill: {
    alignSelf: 'flex-start',
    height: 40,
    borderRadius: R.pill,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(237,230,214,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(237,230,214,0.14)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backPillText: { fontSize: 16, color: OaklandDusk.brand.gold },
  scrollBody: { paddingHorizontal: GUTTER, paddingBottom: 48 },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  plus: { fontSize: 18, lineHeight: 20, color: OaklandDusk.text.tertiary },
  onList: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: OaklandDusk.semantic.ready,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onListText: { fontFamily: 'DMMono', fontSize: 9, lineHeight: 11, color: OaklandDusk.bg.void },
  title: { color: OaklandDusk.text.primary },
  category: {
    fontFamily: 'DMMono',
    fontSize: 10,
    letterSpacing: 2.5,
    color: OaklandDusk.brand.sundown,
    marginTop: 12,
  },
  errorBox: {
    marginTop: 24,
    padding: 12,
    borderWidth: 1,
    borderRadius: R.panel,
    borderColor: OaklandDusk.accent.crimson,
    backgroundColor: OaklandDusk.accent.roseBg,
    gap: 4,
  },
  sectionLabel: {
    fontFamily: 'DMMono',
    fontSize: 10,
    letterSpacing: 2.5,
    color: OaklandDusk.text.tertiary,
    marginTop: 22,
    marginBottom: 10,
  },
  sectionLabelHi: { color: OaklandDusk.brand.yellow },
  usedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  usedCard: { width: USED_CARD_W },
  usedArt: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: R.action,
    borderWidth: 1,
    borderColor: `${OaklandDusk.text.primary}0F`,
    overflow: 'hidden',
    marginBottom: 6,
    backgroundColor: OaklandDusk.bg.surface,
  },
  usedArtHi: { borderColor: OaklandDusk.brand.yellow },
  usedFallback: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  usedName: {
    fontFamily: V3.fonts.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    color: OaklandDusk.text.primary,
    textTransform: 'lowercase',
  },
  addPill: {
    alignSelf: 'flex-start',
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(200,120,40,0.45)',
    borderRadius: R.pill,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  addPillDone: { borderColor: 'rgba(74,222,128,0.4)' },
  addText: { fontSize: 13, fontWeight: '700', color: OaklandDusk.brand.gold },
  addTextDone: { color: '#4ade80' },
})
