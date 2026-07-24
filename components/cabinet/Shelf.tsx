import BottleGlyph, { BottleReflection } from '@/components/cabinet/BottleGlyph'
import CabinetTokens, { withAlpha } from '@/constants/cabinetTokens'
import OaklandDusk from '@/constants/OaklandDusk'
import { useIngredientKeys } from '@/context/ingredientKeys'
import { isBlindKey } from '@/lib/isBlindKey'
import { MAX_VISIBLE_BOTTLES, type BottleUnit, type ShelfId } from '@/lib/cabinet'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg'

// ── 貨架暖色 uplight(README:radial ellipse 60%×100% at 50% 100%)────────────
function Uplight({ shelfId }: { shelfId: ShelfId }) {
  const gradId = `uplight-${shelfId}`
  return (
    <View pointerEvents="none" style={styles.uplight}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={gradId} cx="50%" cy="100%" rx="60%" ry="100%">
            <Stop offset="0" stopColor={OaklandDusk.brand.gold} stopOpacity={0.3} />
            <Stop offset="0.34" stopColor={OaklandDusk.brand.gold} stopOpacity={0.12} />
            <Stop offset="0.68" stopColor={OaklandDusk.brand.gold} stopOpacity={0} />
            <Stop offset="1" stopColor={OaklandDusk.brand.gold} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradId})`} />
      </Svg>
    </View>
  )
}

// 板面細直木紋(README:repeating 90° 暗線,opacity 0.5;近似即可)
function PlankGrain({ shelfId }: { shelfId: ShelfId }) {
  const patternId = `plank-grain-${shelfId}`
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <Pattern id={patternId} patternUnits="userSpaceOnUse" width={8} height={19}>
          <Rect x={1} y={0} width={2} height={19} fill={withAlpha(CabinetTokens.black, 0.14)} />
        </Pattern>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${patternId})`} opacity={0.5} />
    </Svg>
  )
}

// 一層貨架 = 單一 tap target;onPress 進分類詳情頁
// INV-MODEL batch 4-FE-a:渲染單位 = BottleUnit(一瓶一 glyph)
export default function Shelf({ shelfId, units }: { shelfId: ShelfId; units: BottleUnit[] }) {
  const { data: ingredientKeysData, resolve } = useIngredientKeys()
  const visible = units.slice(0, MAX_VISIBLE_BOTTLES)
  const overflow = units.length - MAX_VISIBLE_BOTTLES
  const countLabel = units.length === 1 ? '1 BOTTLE' : `${units.length} BOTTLES`

  return (
    <Pressable
      onPress={() => router.push(`/shelf/${shelfId}`)}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
      accessibilityRole="button"
      accessibilityLabel={`${shelfId} shelf, ${countLabel.toLowerCase()}`}
    >
      {/* header row */}
      <View style={styles.headerRow}>
        <Text style={styles.name}>{shelfId.toUpperCase()}</Text>
        <LinearGradient
          colors={[withAlpha(OaklandDusk.brand.gold, 0.28), withAlpha(OaklandDusk.brand.gold, 0.04)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.rule}
        />
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{countLabel}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>

      {/* shelf stage */}
      <View style={styles.stage}>
        <Uplight shelfId={shelfId} />
        <View style={styles.bottlesRow}>
          {visible.map((unit) => (
            <BottleGlyph
              key={unit.bottleId}
              id={unit.bottleId}
              shelf={shelfId}
              pct={unit.pct}
              isLow={unit.isLow}
              isBlind={isBlindKey(unit.ingredientKey, ingredientKeysData, resolve)}
            />
          ))}
        </View>
        {overflow > 0 && <Text style={styles.overflowTag}>{`+${overflow}`}</Text>}
        <View style={styles.reflectionRow}>
          {visible.map((unit) => (
            <BottleReflection
              key={unit.bottleId}
              id={unit.bottleId}
              shelf={shelfId}
              isLow={unit.isLow}
            />
          ))}
        </View>
      </View>

      {/* plank */}
      <View style={styles.plank}>
        <View style={styles.plankInner}>
          <LinearGradient
            colors={[
              CabinetTokens.wood.plankTop,
              CabinetTokens.wood.plankHigh,
              CabinetTokens.wood.plankMid,
              CabinetTokens.wood.plankBottom,
            ]}
            locations={[0, 5 / 19, 6 / 19, 1]}
            style={StyleSheet.absoluteFill}
          />
          <PlankGrain shelfId={shelfId} />
          <View style={styles.plankHighlight} />
          <View style={styles.plankHighlightSoft} />
        </View>
        {/* brass pull-knob:tap affordance */}
        <View style={styles.knobShadow}>
          <View style={styles.knob}>
            <LinearGradient
              colors={[OaklandDusk.brand.gold, OaklandDusk.brand.rust]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.knobHighlight} />
          </View>
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.94,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 15,
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  name: {
    fontFamily: 'BebasNeue',
    fontSize: 24,
    letterSpacing: 2,
    color: OaklandDusk.text.primary,
  },
  rule: {
    flex: 1,
    height: 1,
    marginHorizontal: 12,
  },
  countPill: {
    backgroundColor: withAlpha(OaklandDusk.brand.gold, 0.1),
    borderWidth: 1,
    borderColor: withAlpha(OaklandDusk.brand.gold, 0.2),
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  countPillText: {
    fontFamily: 'DMMono',
    fontSize: 12,
    letterSpacing: 1.5,
    color: OaklandDusk.text.secondary,
  },
  chevron: {
    fontSize: 20,
    lineHeight: 20,
    color: OaklandDusk.brand.gold,
    marginLeft: 9,
  },
  stage: {
    position: 'relative',
    paddingHorizontal: 14,
  },
  uplight: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    bottom: 0,
    height: 150,
  },
  bottlesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 16,
    minHeight: 152,
    paddingTop: 12,
  },
  overflowTag: {
    position: 'absolute',
    right: 14,
    bottom: 44,
    fontFamily: 'DMMono',
    fontSize: 12,
    letterSpacing: 1,
    color: OaklandDusk.text.secondary,
    zIndex: 2,
  },
  reflectionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    height: 24,
    overflow: 'hidden',
    marginTop: 1,
    opacity: 0.5,
  },
  plank: {
    height: 19,
    marginTop: -2,
    zIndex: 2,
    backgroundColor: CabinetTokens.wood.plankBottom,
    shadowColor: CabinetTokens.black,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 12,
    shadowOpacity: 0.55,
    elevation: 5,
  },
  plankInner: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  plankHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: withAlpha(OaklandDusk.brand.gold, 0.3),
  },
  plankHighlightSoft: {
    position: 'absolute',
    top: 1,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: withAlpha(OaklandDusk.brand.gold, 0.06),
  },
  knobShadow: {
    position: 'absolute',
    left: '50%',
    marginLeft: -17,
    top: 11,
    width: 34,
    height: 8,
    shadowColor: CabinetTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.6,
    elevation: 3,
  },
  knob: {
    flex: 1,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
    overflow: 'hidden',
  },
  knobHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: withAlpha(OaklandDusk.brand.yellow, 0.5),
  },
})
