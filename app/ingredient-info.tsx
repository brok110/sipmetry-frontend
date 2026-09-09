// app/ingredient-info.tsx
// RESTOCK-REDESIGN S3:原料說明頁。RESTOCK-SIMPLIFY S1(2026-09-08):Smart
// Restock 點擊一律進本頁(sheet 退場),加一段個人化——MAKE TONIGHT(買了立刻
// 能調)——資料 = POST /restock-suggestions {target_key} 的 target.recipes。
// S5(同日):ONE MORE STEP 拿掉(畫面擁擠;「再一瓶」的價值由 BUY TOGETHER
// 承接),呼叫不帶 include_rails(後端少算一輪 rails)。段序:prose → FLAVOR →
// MAKE TONIGHT → USED IN(僅 MAKE TONIGHT 為空時,通用資料避免重複)→ Add。
// 副標行「CATEGORY · +N COCKTAILS TONIGHT」。兩個 fetch 並行、各自 loading,
// prose 先出;個人化段失敗靜默(非關鍵,__DEV__ 印 log)。listed 以 GET
// /shopping-list 校正(param 可能過期)。
// 名字 / 分類 / prose(DB description,無值整段略過)/ FLAVOR tags
// (後端由 12 維向量推導)/ 底部 Add 膠囊(狀態與 restock 卡同語彙)。
// 自繪 header 照 shelf/activity 前例。from: 'recipe' | 'bundle' | 其他(Restock)。

import OaklandDusk from '@/constants/OaklandDusk'
import { R } from '@/constants/radius'
import Type from '@/constants/typography'
import { V3 } from '@/constants/v3DesignTokens'
import { useAuth } from '@/context/auth'
import { apiFetch } from '@/lib/api'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type UsedIn = { iba_code: string; name: string; image_url?: string | null }

type IngredientInfo = {
  ingredient_key: string
  display_name: string
  category: string | null
  description: string | null
  flavor_tags: string[]
  used_in: UsedIn[]
}

// 個人化(WHATIF target 合約,routes/restock.js §7):owned 時 recipes 空
type Personal = {
  owned: boolean
  unlocks_count: number
  recipes: UsedIn[]
}

const GUTTER = 16
const USED_GAP = 10
const USED_CARD_W = (Dimensions.get('window').width - GUTTER * 2 - USED_GAP * 2) / 3
const MAKE_TONIGHT_MAX = 6   // 3:4 卡兩列

function humanizeCategory(raw: string | null): string {
  if (!raw) return ''
  return raw.replace(/_/g, ' ').toUpperCase()
}

function backLabelFor(from: string): string {
  if (from === 'recipe') return 'Recipe'
  if (from === 'bundle') return 'Buy Together'
  return 'Restock'
}

export default function IngredientInfoScreen() {
  const insets = useSafeAreaInsets()
  const { session } = useAuth()
  const params = useLocalSearchParams<{ key?: string; name?: string; listed?: string; from?: string }>()

  const ingredientKey = String(params.key ?? '').trim()
  const fallbackName = String(params.name ?? '').trim()
  const from = String(params.from ?? '').trim()
  const fromRecipe = from === 'recipe'
  const backLabel = backLabelFor(from)

  const [info, setInfo] = useState<IngredientInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listed, setListed] = useState(String(params.listed ?? '') === '1')
  const [adding, setAdding] = useState(false)

  // RESTOCK-SIMPLIFY S1:個人化段
  const [personal, setPersonal] = useState<Personal | null>(null)
  const [personalLoading, setPersonalLoading] = useState(false)

  const fetchInfo = useCallback(async () => {
    if (!session || !ingredientKey) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(`/ingredient-info/${encodeURIComponent(ingredientKey)}`, { session })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      setInfo(data)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load this ingredient')
    } finally {
      setLoading(false)
    }
  }, [session, ingredientKey])

  // 個人化:WHATIF target。失敗靜默——本段是加值,不擋 prose。
  const fetchPersonal = useCallback(async () => {
    if (!session || !ingredientKey) return
    setPersonalLoading(true)
    try {
      const res = await apiFetch('/restock-suggestions', {
        session,
        method: 'POST',
        body: { target_key: ingredientKey },
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      const t = data?.target
      if (!t) {
        setPersonal(null)
        return
      }
      setPersonal({
        owned: t.owned === true,
        unlocks_count: Number.isFinite(t.unlocks_count) ? t.unlocks_count : 0,
        recipes: Array.isArray(t.recipes) ? t.recipes : [],
      })
    } catch (e: any) {
      if (__DEV__) console.log('[ingredient-info] personal fetch failed:', e?.message)
      setPersonal(null)
    } finally {
      setPersonalLoading(false)
    }
  }, [session, ingredientKey])

  // 校正本頁 listed(param 可能過期)
  const fetchListed = useCallback(async () => {
    if (!session || !ingredientKey) return
    try {
      const res = await apiFetch('/shopping-list', { session })
      if (!res.ok) return
      const data = await res.json()
      const items = Array.isArray(data?.items) ? data.items : []
      if (items.some((it: { ingredient_key: string }) => String(it.ingredient_key) === ingredientKey)) setListed(true)
    } catch {
      /* 非關鍵:保留 param 帶入的 listed */
    }
  }, [session, ingredientKey])

  React.useEffect(() => {
    fetchInfo()
    fetchPersonal()
    fetchListed()
  }, [fetchInfo, fetchPersonal, fetchListed])

  const handleAdd = useCallback(async () => {
    if (!session || listed || adding || !ingredientKey) return
    setAdding(true)
    try {
      const res = await apiFetch('/shopping-list', {
        session,
        method: 'POST',
        body: {
          ingredient_key: ingredientKey,
          display_name: info?.display_name || fallbackName || ingredientKey,
          source: fromRecipe ? 'recipe' : 'restock',
        },
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      setListed(true)
    } catch {
      Alert.alert('Error', 'Could not add this to your list. Please try again.')
    } finally {
      setAdding(false)
    }
  }, [session, listed, adding, ingredientKey, info, fallbackName, fromRecipe])

  const title = info?.display_name || fallbackName || 'Ingredient'
  const showMakeTonight = !!personal && !personal.owned && personal.recipes.length > 0
  // USED IN(通用)只在 MAKE TONIGHT 為空時顯示;個人化載入中先不畫,避免閃現後消失
  const showUsedIn = !personalLoading && !showMakeTonight && !!info && info.used_in.length > 0
  const subLine = [
    info?.category ? humanizeCategory(info.category) : '',
    personal?.owned ? 'IN YOUR BAR' : showMakeTonight ? `+${personal!.unlocks_count} COCKTAIL${personal!.unlocks_count === 1 ? '' : 'S'} TONIGHT` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  const openRecipe = (iba_code: string) => router.push({ pathname: '/recipe', params: { iba_code, from: 'ingredient' } })

  const renderArtCard = (r: UsedIn) => (
    <Pressable
      key={r.iba_code}
      style={styles.usedCard}
      onPress={() => openRecipe(r.iba_code)}
      accessibilityRole="button"
      accessibilityLabel={r.name}
    >
      <View style={styles.usedArt}>
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
        {r.name.toLowerCase()}
      </Text>
    </Pressable>
  )

  return (
    <View style={styles.screen}>
      <View style={[styles.band, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={6} accessibilityLabel={`Back to ${backLabel}`} style={styles.backPill}>
          <FontAwesome name="chevron-left" size={14} color={OaklandDusk.brand.gold} />
          <Text style={styles.backPillText}>{backLabel}</Text>
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

      <ScrollView contentContainerStyle={styles.scrollBody}>
        <Text style={[Type.display, styles.title]}>{title}</Text>
        {subLine ? <Text style={styles.category}>{subLine}</Text> : null}

        {loading && !info && <ActivityIndicator color={OaklandDusk.brand.gold} style={{ marginTop: 28 }} />}

        {!loading && error && (
          <Pressable onPress={fetchInfo} accessibilityRole="button" accessibilityLabel="Retry" style={styles.errorBox}>
            <Text style={[Type.caption, { color: OaklandDusk.semantic.error }]}>{error}</Text>
            <Text style={[Type.caption, { color: OaklandDusk.text.tertiary }]}>Tap to retry</Text>
          </Pressable>
        )}

        {info?.description ? <Text style={styles.prose}>{info.description}</Text> : null}

        {info && info.flavor_tags.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>FLAVOR</Text>
            <View style={styles.tagRow}>
              {info.flavor_tags.map((t) => (
                <View key={t} style={styles.tag}>
                  <Text style={styles.tagText}>{t}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {personalLoading && !personal ? (
          <View style={styles.personalLoading}>
            <ActivityIndicator size="small" color={OaklandDusk.text.tertiary} />
            <Text style={styles.personalLoadingText}>CHECKING YOUR BAR</Text>
          </View>
        ) : null}

        {showMakeTonight ? (
          <>
            <Text style={styles.sectionLabel}>MAKE TONIGHT</Text>
            <View style={styles.usedRow}>{personal!.recipes.slice(0, MAKE_TONIGHT_MAX).map(renderArtCard)}</View>
          </>
        ) : null}

        {showUsedIn ? (
          <>
            <Text style={styles.sectionLabel}>USED IN</Text>
            <View style={styles.usedRow}>{info!.used_in.slice(0, 3).map(renderArtCard)}</View>
          </>
        ) : null}

        {info ? (
          <Pressable
            onPress={handleAdd}
            disabled={listed || adding}
            accessibilityRole="button"
            accessibilityLabel={listed ? 'Already on your list' : `Add ${title} to shopping list`}
            style={[styles.addPill, listed && styles.addPillDone]}
          >
            <FontAwesome
              name={listed ? 'check' : 'shopping-bag'}
              size={13}
              color={listed ? '#4ade80' : OaklandDusk.brand.gold}
            />
            <Text style={[styles.addText, listed && styles.addTextDone]}>
              {listed ? 'On your list' : 'Add to Shopping List'}
            </Text>
          </Pressable>
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
  title: { color: OaklandDusk.text.primary },
  category: {
    fontFamily: 'DMMono',
    fontSize: 10,
    letterSpacing: 2.5,
    color: OaklandDusk.text.tertiary,
    marginTop: 6,
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
  prose: {
    fontSize: 14,
    lineHeight: 24,
    color: OaklandDusk.text.secondary,
    marginTop: 22,
    marginBottom: 8,
  },
  sectionLabel: {
    fontFamily: 'DMMono',
    fontSize: 10,
    letterSpacing: 2.5,
    color: OaklandDusk.text.tertiary,
    marginTop: 22,
    marginBottom: 10,
  },
  personalLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22 },
  personalLoadingText: { fontFamily: 'DMMono', fontSize: 10, letterSpacing: 2.5, color: OaklandDusk.text.tertiary },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tag: {
    borderWidth: 1,
    borderColor: 'rgba(200,120,40,0.35)',
    borderRadius: R.pill,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  tagText: { fontSize: 12, fontWeight: '600', color: OaklandDusk.brand.gold },
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
    marginTop: 30,
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
