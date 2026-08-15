// app/restock-unlocks.tsx
// RESTOCK-REDESIGN S2:解鎖杯明細頁。
// 由 restock 卡的 +N 或 hero 導入,參數帶 title + recipes JSON
// (呼叫端已有資料,免二次請求)。圖名 2 欄 grid,tap → recipe 頁。
// 自繪 header(照 shelf/activity 前例,迴避 iOS 26 玻璃殼)。

import OaklandDusk from '@/constants/OaklandDusk'
import { R } from '@/constants/radius'
import Type from '@/constants/typography'
import { V3 } from '@/constants/v3DesignTokens'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useMemo } from 'react'
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BadgeStack } from '@/components/browse/Badges'

type UnlockRecipe = {
  iba_code: string
  name: string
  image_url?: string | null
  // SAFETY-BADGE 3b (2026-08-14): 呼叫端(cart openUnlocks)已補傳
  badges?: string[]
}

const GUTTER = 16
const GAP = 12

export default function RestockUnlocksScreen() {
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ title?: string; subtitle?: string; recipes_json?: string }>()

  const recipes = useMemo<UnlockRecipe[]>(() => {
    try {
      const raw = params.recipes_json ? decodeURIComponent(String(params.recipes_json)) : '[]'
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed
        .filter((r) => r && typeof r.iba_code === 'string' && r.iba_code.trim())
        .map((r) => ({ iba_code: String(r.iba_code), name: String(r.name ?? ''), image_url: r.image_url ?? null, badges: Array.isArray(r.badges) ? r.badges : [] }))
    } catch {
      return []
    }
  }, [params.recipes_json])

  const title = String(params.title ?? 'New cocktails')
  const count = recipes.length
  const subtitle =
    String(params.subtitle ?? '') ||
    `${count} new cocktail${count === 1 ? '' : 's'} you could make`

  const cardWidth = (Dimensions.get('window').width - GUTTER * 2 - GAP) / 2

  return (
    <View style={styles.screen}>
      <View style={[styles.band, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={6} accessibilityLabel="Back to Restock" style={styles.backPill}>
          <FontAwesome name="chevron-left" size={14} color={OaklandDusk.brand.gold} />
          <Text style={styles.backPillText}>Restock</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody}>
        <Text style={[Type.display, styles.title]}>{title}</Text>
        <Text style={[Type.caption, styles.subtitle]}>{subtitle}</Text>

        {count === 0 ? (
          <Text style={[Type.caption, styles.empty]}>Nothing to show here.</Text>
        ) : (
          <View style={styles.grid}>
            {recipes.map((r) => (
              <Pressable
                key={r.iba_code}
                style={{ width: cardWidth }}
                onPress={() => router.push({ pathname: '/recipe', params: { iba_code: r.iba_code, from: 'restock' } })}
                accessibilityRole="button"
                accessibilityLabel={r.name}
              >
                <View style={styles.art}>
                  {r.image_url ? (
                    <Image source={{ uri: r.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <View style={styles.artFallback}>
                      <FontAwesome name="glass" size={26} color={OaklandDusk.text.disabled} />
                    </View>
                  )}
                  <LinearGradient
                    colors={['transparent', `${OaklandDusk.bg.void}BF`]}
                    locations={[0.55, 1]}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  {/* SAFETY-BADGE 3b (2026-08-14): 同 RecipeCard 右下堆疊 */}
                  <View style={styles.badgeAnchor}>
                    <BadgeStack badges={r.badges} />
                  </View>
                </View>
                <Text style={styles.name} numberOfLines={1}>
                  {r.name.toLowerCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: OaklandDusk.bg.void },
  band: { paddingHorizontal: GUTTER, paddingBottom: 4 },
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
  scrollBody: { paddingHorizontal: GUTTER, paddingBottom: 40 },
  title: { color: OaklandDusk.text.primary },
  subtitle: { color: OaklandDusk.text.secondary, marginTop: 2, marginBottom: 20 },
  empty: { color: OaklandDusk.text.tertiary, marginTop: 24, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  art: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: R.action,
    borderWidth: 1,
    borderColor: `${OaklandDusk.text.primary}0F`,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: OaklandDusk.bg.surface,
  },
  artFallback: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  badgeAnchor: { position: 'absolute', bottom: 6, right: 6, zIndex: 2 },
  name: {
    fontFamily: V3.fonts.mono,
    fontSize: 11,
    letterSpacing: 1.1,
    color: OaklandDusk.text.primary,
    textTransform: 'lowercase',
    marginBottom: 16,
  },
})
