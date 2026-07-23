import CabinetTokens, { withAlpha } from '@/constants/cabinetTokens'
import OaklandDusk from '@/constants/OaklandDusk'
import type { ShelfId } from '@/lib/cabinet'
import React, { useEffect, useState } from 'react'
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient as SvgLinearGradient,
  Mask,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg'

// ── 三家族幾何(handoff README §Bottle geometry 逐字元照抄;viewBox 0 0 60 160)──
// left/capDotCy/深色 rect/rim-light 公式取自 My Bar.dc.html renderVals()。
const FAMILIES = {
  tall: {
    top: 64, base: 156, menRx: 15, left: 14, capDotCy: 11,
    cap: 'M22,6 h16 v11 h-16 z',
    outline: 'M26,17 L34,17 L34,46 C34,52 46,55 46,66 L46,150 Q46,157 39,157 L21,157 Q14,157 14,150 L14,66 C14,55 26,52 26,46 Z',
  },
  squat: {
    top: 78, base: 157, menRx: 19, left: 10, capDotCy: 24,
    cap: 'M20,18 h20 v12 h-20 z',
    outline: 'M25,30 L35,30 L35,52 C35,59 50,62 50,76 L50,150 Q50,157 43,157 L17,157 Q10,157 10,150 L10,76 C10,62 25,59 25,52 Z',
  },
  round: {
    top: 58, base: 154, menRx: 17, left: 12, capDotCy: 15,
    cap: 'M23,9 h14 v12 h-14 z',
    outline: 'M26,21 L34,21 L34,44 C34,51 48,58 48,98 C48,140 40,157 30,157 C20,157 12,140 12,98 C12,58 26,51 26,44 Z',
  },
} as const
type FamilyKey = keyof typeof FAMILIES

const HEIGHT_MIN = 116
const HEIGHT_SPAN = 23 // 116–138
const WIDTH_RATIO = 0.375
const REFLECTION_HEIGHT = 24

const HALO_MIN = 0.42
const HALO_MAX = 0.82
const HALO_REDUCED = 0.6
const HALO_HALF_MS = 1700 // 0.42↔0.82 單程;整循環 3.4s

// 以 item.id 決定的穩定 hash(djb2)——高度/瓶形/酒液端點皆由此導出,渲染不抖動
function hashId(id: string): number {
  let h = 5381
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

// 家族→瓶形:whiskey/brandy → tall;rum/tequila → squat;gin/vodka → tall;
// liqueurs/others → squat/round 交替(id hash 穩定指派)
function familyFor(shelf: ShelfId, hash: number): FamilyKey {
  switch (shelf) {
    case 'gin':
    case 'vodka':
    case 'whiskey':
    case 'brandy':
      return 'tall'
    case 'rum':
    case 'tequila':
      return 'squat'
    case 'liqueurs':
    case 'others':
      return hash % 2 === 0 ? 'squat' : 'round'
  }
}

// 酒液分家色(P3):gin/vodka 清金;whiskey/brandy 琥珀對;rum 深棕對;
// tequila/liqueurs 金對。others 未在 C1 點名 → 採 mock OTHERS 瓶的金色系。
function liquidFor(shelf: ShelfId, hash: number): string {
  switch (shelf) {
    case 'gin':
    case 'vodka':
      return CabinetTokens.liquid.clear
    case 'whiskey':
    case 'brandy':
      return CabinetTokens.liquid.whiskey[hash % 2]
    case 'rum':
      return CabinetTokens.liquid.rum[hash % 2]
    case 'tequila':
    case 'liqueurs':
    case 'others':
      return CabinetTokens.liquid.tequila[hash % 2]
  }
}

export type BottleSpec = {
  fam: FamilyKey
  heightPx: number
  widthPx: number
  liquid: string
}

export function bottleSpec(id: string, shelf: ShelfId): BottleSpec {
  const hash = hashId(id)
  const heightPx = HEIGHT_MIN + (hash % HEIGHT_SPAN)
  return {
    fam: familyFor(shelf, hash),
    heightPx,
    widthPx: Math.round(heightPx * WIDTH_RATIO),
    liquid: liquidFor(shelf, hash),
  }
}

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduce(Boolean(v))
    })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduce(Boolean(v)))
    return () => {
      mounted = false
      sub.remove()
    }
  }, [])
  return reduce
}

// ── 低量呼吸光暈(README:radial 78×100,opacity 0.42↔0.82,3.4s ease-in-out;
//    Reduce Motion 開啟時定格 0.6)────────────────────────────────────────────
function LowHalo({ id }: { id: string }) {
  const reduceMotion = useReduceMotion()
  const haloOpacity = useSharedValue(HALO_MIN)

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(haloOpacity)
      haloOpacity.value = HALO_REDUCED
      return
    }
    haloOpacity.value = HALO_MIN
    haloOpacity.value = withRepeat(
      withTiming(HALO_MAX, { duration: HALO_HALF_MS, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    )
    return () => cancelAnimation(haloOpacity)
  }, [reduceMotion, haloOpacity])

  const haloStyle = useAnimatedStyle(() => ({ opacity: haloOpacity.value }))
  const gradId = `halo-${id}`

  return (
    <Animated.View pointerEvents="none" style={[styles.halo, haloStyle]}>
      <Svg width={78} height={100}>
        <Defs>
          <RadialGradient id={gradId} cx="50%" cy="62%" rx="50%" ry="55%">
            <Stop offset="0" stopColor={OaklandDusk.accent.crimson} stopOpacity={0.45} />
            <Stop offset="0.46" stopColor={OaklandDusk.accent.crimson} stopOpacity={0.14} />
            <Stop offset="0.72" stopColor={OaklandDusk.accent.crimson} stopOpacity={0} />
            <Stop offset="1" stopColor={OaklandDusk.accent.crimson} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={78} height={100} fill={`url(#${gradId})`} />
      </Svg>
    </Animated.View>
  )
}

type BottleGlyphProps = {
  id: string
  shelf: ShelfId
  pct: number
  isLow: boolean
  isBlind: boolean
}

export default function BottleGlyph({ id, shelf, pct, isLow, isBlind }: BottleGlyphProps) {
  const spec = bottleSpec(id, shelf)
  const f = FAMILIES[spec.fam]
  const clamped = Math.max(0, Math.min(100, Number(pct)))
  // 液面 Y = base − (pct/100) × (base − top)
  const liqY = f.base - (clamped / 100) * (f.base - f.top)
  const liquidColor = isLow ? CabinetTokens.liquid.low : spec.liquid
  const clipId = `bottle-clip-${id}`

  return (
    <View style={styles.column}>
      {isLow && <LowHalo id={id} />}
      <Svg width={spec.widthPx} height={spec.heightPx} viewBox="0 0 60 160">
        <Defs>
          <ClipPath id={clipId}>
            <Path d={f.outline} />
          </ClipPath>
        </Defs>
        {/* 1. glass */}
        <Path d={f.outline} fill={withAlpha(OaklandDusk.text.primary, 0.05)} />
        {/* 2. liquid + 3. 底部深色 rect(clip 到瓶身) */}
        <G clipPath={`url(#${clipId})`}>
          <Rect x={0} y={liqY} width={60} height={160 - liqY} fill={liquidColor} />
          <Rect x={0} y={f.base - 14} width={60} height={26} fill={withAlpha(CabinetTokens.black, 0.2)} />
        </G>
        {/* 4. meniscus */}
        <Ellipse cx={30} cy={liqY} rx={f.menRx} ry={1.6} fill={withAlpha(OaklandDusk.text.primary, 0.32)} />
        {/* 5. rim-light */}
        <Rect
          x={f.left + 5}
          y={f.top + 6}
          width={2.4}
          height={Math.max(f.base - f.top - 18, 12)}
          rx={1.2}
          fill={withAlpha(OaklandDusk.text.primary, 0.13)}
        />
        {/* 6. outline */}
        <Path d={f.outline} fill="none" stroke={withAlpha(OaklandDusk.brand.gold, 0.45)} strokeWidth={0.9} />
        {/* 7. cap */}
        <Path d={f.cap} fill={CabinetTokens.cap} stroke={withAlpha(OaklandDusk.brand.gold, 0.4)} strokeWidth={0.6} />
        {/* 8. 盲瓶帽紅點 */}
        {isBlind && <Circle cx={30} cy={f.capDotCy} r={2.6} fill={OaklandDusk.accent.crimson} />}
      </Svg>
      <Text style={[styles.pctLabel, isLow && styles.pctLabelLow]}>{`${Math.round(clamped)}%`}</Text>
    </View>
  )
}

// ── 倒影(README:silhouette scaleY(-1) + 頂→底漸層遮罩,高 24;
//    平色 tint:低量 crimson@0.16、其餘 gold@0.14)────────────────────────────
export function BottleReflection({ id, shelf, isLow }: { id: string; shelf: ShelfId; isLow: boolean }) {
  const spec = bottleSpec(id, shelf)
  const f = FAMILIES[spec.fam]
  // 24px 高的條帶在 viewBox 座標裡的可視高度(等比縮放)
  const viewH = (REFLECTION_HEIGHT * 160) / spec.heightPx
  const fill = isLow
    ? withAlpha(OaklandDusk.accent.crimson, 0.16)
    : withAlpha(OaklandDusk.brand.gold, 0.14)
  const fadeId = `refl-fade-${id}`
  const maskId = `refl-mask-${id}`

  return (
    <Svg width={spec.widthPx} height={REFLECTION_HEIGHT} viewBox={`0 0 60 ${viewH}`}>
      <Defs>
        <SvgLinearGradient
          id={fadeId}
          x1="0"
          y1="0"
          x2="0"
          y2={String(viewH * 0.78)}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor={CabinetTokens.maskWhite} stopOpacity={0.55} />
          <Stop offset="1" stopColor={CabinetTokens.maskWhite} stopOpacity={0} />
        </SvgLinearGradient>
        <Mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="60" height={viewH}>
          <Rect x="0" y="0" width="60" height={viewH} fill={`url(#${fadeId})`} />
        </Mask>
      </Defs>
      <G mask={`url(#${maskId})`}>
        {/* translate+scale = scaleY(-1):瓶底翻到條帶頂端 */}
        <Path d={f.outline} fill={fill} transform="translate(0,160) scale(1,-1)" />
      </G>
    </Svg>
  )
}

const styles = StyleSheet.create({
  column: {
    alignItems: 'center',
  },
  halo: {
    position: 'absolute',
    bottom: 16,
    left: '50%',
    marginLeft: -39,
    width: 78,
    height: 100,
  },
  pctLabel: {
    fontFamily: 'DMMonoMedium',
    fontSize: 14,
    letterSpacing: 0.5,
    marginTop: 7,
    color: withAlpha(OaklandDusk.text.primary, 0.66),
  },
  pctLabelLow: {
    color: CabinetTokens.crimsonTint,
  },
})
