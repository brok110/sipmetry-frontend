// app/cocktail-story.tsx
// INGREDIENT-INFO 二期:cocktail 故事頁。唯一入口 = recipe 詳情頁
// 標題下「✦ STORY」行(story 為 null 時入口不渲染)。骨架逐格對齊
// ingredient-info.tsx:band(back pill + ✕ 逃生梯)/ Type.display
// 標題 / STORY 眉標(category 同槽)/ prose(story 欄由 param 帶入,
// 零 API)/ 收尾 ✦。FLAVOR / USED IN / Add 槽刻意留空——純故事頁。
// STORY-RECS(2026-08-19):✦ 後追加 YOU MIGHT LIKE 三卡(借 USED IN
// 語彙),GET /recipes/:iba_code/similar;端點失敗或不足三杯整節不
// 渲染(靜默)。本頁第一個 fetch;iba_code 由入口 param 帶入。

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
import React from 'react'
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const GUTTER = 16
const RECS_GAP = 10
const RECS_CARD_W = (Dimensions.get('window').width - GUTTER * 2 - RECS_GAP * 2) / 3

type SimilarItem = { iba_code: string; name: string; image_url?: string | null; score?: number }

export default function CocktailStoryScreen() {
  const insets = useSafeAreaInsets()
  const { session } = useAuth()
  const params = useLocalSearchParams<{ iba_code?: string; name?: string; story?: string }>()

  const ibaCode = String(params.iba_code ?? '').trim()
  const title = String(params.name ?? '').trim() || 'Story'
  const story = String(params.story ?? '').trim()

  const [recs, setRecs] = React.useState<SimilarItem[]>([])

  React.useEffect(() => {
    let alive = true
    const load = async () => {
      if (!session || !ibaCode) return
      try {
        const res = await apiFetch(`/recipes/${encodeURIComponent(ibaCode)}/similar`, { session })
        if (!res.ok) return
        const data = await res.json()
        const items = Array.isArray(data?.items) ? data.items : []
        if (alive) setRecs(items.slice(0, 3))
      } catch {
        // 靜默:端點失敗 → recs 維持空 → 整節不渲染
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [session, ibaCode])

  return (
    <View style={styles.screen}>
      <View style={[styles.band, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={6} accessibilityLabel="Back to Recipe" style={styles.backPill}>
          <FontAwesome name="chevron-left" size={14} color={OaklandDusk.brand.gold} />
          <Text style={styles.backPillText}>Recipe</Text>
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
        <Text style={styles.eyebrow}>STORY</Text>
        {story ? <Text style={styles.prose}>{story}</Text> : null}
        {story ? <Text style={styles.fin}>✦</Text> : null}

        {recs.length >= 3 ? (
          <>
            <Text style={styles.recsLabel}>YOU MIGHT LIKE</Text>
            <View style={styles.recsRow}>
              {recs.map((r) => (
                <Pressable
                  key={r.iba_code}
                  style={styles.recsCard}
                  onPress={() => router.push({ pathname: '/recipe', params: { iba_code: r.iba_code, from: 'story' } })}
                  accessibilityRole="button"
                  accessibilityLabel={r.name}
                >
                  <View style={styles.recsArt}>
                    {r.image_url ? (
                      <Image source={{ uri: r.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <View style={styles.recsFallback}>
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
                  <Text style={styles.recsName} numberOfLines={1}>
                    {r.name.toLowerCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
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
  title: { color: OaklandDusk.text.primary },
  eyebrow: {
    fontFamily: 'DMMono',
    fontSize: 10,
    letterSpacing: 2.5,
    color: OaklandDusk.text.tertiary,
    marginTop: 6,
  },
  prose: {
    fontSize: 14,
    lineHeight: 24,
    color: OaklandDusk.text.secondary,
    marginTop: 22,
    marginBottom: 8,
  },
  fin: {
    fontFamily: 'DMMono',
    fontSize: 10,
    letterSpacing: 2.5,
    color: OaklandDusk.text.disabled,
    marginTop: 26,
  },
  recsLabel: {
    fontFamily: 'DMMono',
    fontSize: 10,
    letterSpacing: 2.5,
    color: OaklandDusk.text.tertiary,
    marginTop: 30,
    marginBottom: 10,
  },
  recsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: RECS_GAP },
  recsCard: { width: RECS_CARD_W },
  recsArt: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: R.action,
    borderWidth: 1,
    borderColor: `${OaklandDusk.text.primary}0F`,
    overflow: 'hidden',
    marginBottom: 6,
    backgroundColor: OaklandDusk.bg.surface,
  },
  recsFallback: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  recsName: {
    fontFamily: V3.fonts.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    color: OaklandDusk.text.primary,
    textTransform: 'lowercase',
  },
})
