// app/cocktail-story.tsx
// INGREDIENT-INFO 二期:cocktail 故事頁。唯一入口 = recipe 詳情頁
// 標題下「✦ STORY」行(story 為 null 時入口不渲染)。骨架逐格對齊
// ingredient-info.tsx:band(back pill + ✕ 逃生梯)/ Type.display
// 標題 / STORY 眉標(category 同槽)/ prose(story 欄由 param 帶入,
// 零 API)/ 收尾 ✦。FLAVOR / USED IN / Add 槽刻意留空——純故事頁。

import OaklandDusk from '@/constants/OaklandDusk'
import { R } from '@/constants/radius'
import Type from '@/constants/typography'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { router, useLocalSearchParams } from 'expo-router'
import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const GUTTER = 16

export default function CocktailStoryScreen() {
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ name?: string; story?: string }>()

  const title = String(params.name ?? '').trim() || 'Story'
  const story = String(params.story ?? '').trim()

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
})
