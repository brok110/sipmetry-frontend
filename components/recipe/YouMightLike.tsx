// components/recipe/YouMightLike.tsx
// RECIPE-REFRESH(2026-09-30):YOU MIGHT LIKE 三卡,從故事頁(STORY-RECS,2026-08-19)
// 搬到 recipe 頁 Instructions 下方。GET /recipes/:iba_code/similar;端點失敗或不足
// 三杯整節不渲染(靜默)。guest 模式(朋友家掃描)時,點卡片把 mode 與
// scan_items_json 帶到下一杯,「有沒有、缺什麼」持續以朋友家的酒為準(Brok 裁)。

import OaklandDusk from '@/constants/OaklandDusk'
import { R } from '@/constants/radius'
import { V3 } from '@/constants/v3DesignTokens'
import { useAuth } from '@/context/auth'
import { apiFetch } from '@/lib/api'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import React from 'react'
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native'

const GUTTER = 16
const RECS_GAP = 10
const RECS_CARD_W = (Dimensions.get('window').width - GUTTER * 2 - RECS_GAP * 2) / 3

type SimilarItem = { iba_code: string; name: string; image_url?: string | null; score?: number }

type GuestParams = { mode: string; scan_items_json: string }

export function YouMightLike({ ibaCode, guestParams }: { ibaCode: string; guestParams?: GuestParams }) {
  const { session } = useAuth()
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

  if (recs.length < 3) return null

  return (
    <View>
      <Text style={styles.recsLabel}>YOU MIGHT LIKE</Text>
      <View style={styles.recsRow}>
        {recs.map((r) => (
          <Pressable
            key={r.iba_code}
            style={styles.recsCard}
            onPress={() =>
              router.push({ pathname: '/recipe', params: { iba_code: r.iba_code, from: 'recipe', ...(guestParams ?? {}) } })
            }
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
    </View>
  )
}

const styles = StyleSheet.create({
  recsLabel: {
    fontFamily: 'DMMono',
    fontSize: 10,
    letterSpacing: 2.5,
    color: OaklandDusk.text.tertiary,
    marginTop: 22,
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
