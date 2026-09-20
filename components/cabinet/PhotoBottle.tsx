import CabinetTokens, { CABINET_PHOTO_BOTTLES, type PhotoBottleType } from '@/constants/cabinetTokens'
import React from 'react'
import { Image, StyleSheet, View } from 'react-native'

// CABINET-PHOTO Stage 3:一支照片瓶 = 玻璃層在下 + 液體層在上 + 一條液面線。
// 玻璃層是空瓶、液體層是同一支瓶子裝滿時的照片,兩張輪廓相同;app 只露出液面以下的液體層,
// 所以 pct 是連續值、同一支瓶子在任何 pct 都長得一樣。0% 完全不畫液體層(就是那張空瓶)。
// 校準值(aspect / liquidTopFrac / liquidBaseFrac)一律取自 CABINET_PHOTO_BOTTLES,不得在這裡寫數字。

const ASPECT_TOLERANCE = 0.01
// 液面線:外觀取自 Brok 2026-09-19 過關的酒量預覽 —— 1 個實體像素高、約 59% 不透明、左右各內縮瓶寬 5%。
// 線的形狀直接拿液體層那張圖來切(染成單色、只露出液面那一列):瓶肩變窄的地方線跟著變窄,不會凸到牆上。
const SURFACE_LINE_OPACITY = 0.59
const SURFACE_LINE_INSET_RATIO = 0.05

function assertLayersMatchTokens(type: PhotoBottleType) {
  const bottle = CABINET_PHOTO_BOTTLES[type]
  for (const layer of [bottle.glass, bottle.liquid]) {
    const asset = Image.resolveAssetSource(layer)
    const sizeMatches = asset.width === bottle.sourceWidth && asset.height === bottle.sourceHeight
    const aspectMatches = Math.abs(asset.width / asset.height - bottle.aspect) <= ASPECT_TOLERANCE
    if (!sizeMatches || !aspectMatches) {
      throw new Error(
        `CABINET_PHOTO_BOTTLES.${type}: layer is ${asset.width}x${asset.height} but tokens say ` +
          `${bottle.sourceWidth}x${bottle.sourceHeight} (aspect ${bottle.aspect}); re-run process_bottle.py and replace the tokens`,
      )
    }
  }
}

type PhotoBottleProps = {
  type: PhotoBottleType
  heightPt: number
  pct: number
}

export function photoBottleWidth(type: PhotoBottleType, heightPt: number): number {
  return heightPt * CABINET_PHOTO_BOTTLES[type].aspect
}

export default function PhotoBottle({ type, heightPt, pct }: PhotoBottleProps) {
  const bottle = CABINET_PHOTO_BOTTLES[type]
  const width = photoBottleWidth(type, heightPt)
  const clamped = Math.max(0, Math.min(100, Number(pct)))
  const liquidFrac = bottle.liquidBaseFrac - (clamped / 100) * (bottle.liquidBaseFrac - bottle.liquidTopFrac)
  const liquidTop = heightPt * liquidFrac
  const surfaceInset = width * SURFACE_LINE_INSET_RATIO
  // 0% = 只畫空瓶那張;100% 的液面已經在滿瓶照片裡,不用再畫線
  const showLiquid = clamped > 0
  const showSurfaceLine = clamped > 0 && clamped < 100

  if (__DEV__) assertLayersMatchTokens(type)

  return (
    <View pointerEvents="none" style={{ width, height: heightPt }}>
      <Image source={bottle.glass} style={{ width, height: heightPt }} resizeMode="stretch" />
      {showLiquid && (
        <View style={[styles.liquidWindow, { top: liquidTop }]}>
          <Image
            source={bottle.liquid}
            style={[styles.liquidImage, { top: -liquidTop, width, height: heightPt }]}
            resizeMode="stretch"
          />
        </View>
      )}
      {showSurfaceLine && (
        <View style={[styles.surfaceWindow, { top: liquidTop, left: surfaceInset, right: surfaceInset }]}>
          <Image
            source={bottle.liquid}
            style={[styles.surfaceImage, { top: -liquidTop, left: -surfaceInset, width, height: heightPt }]}
            resizeMode="stretch"
          />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  liquidWindow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  liquidImage: {
    position: 'absolute',
    left: 0,
  },
  surfaceWindow: {
    position: 'absolute',
    height: StyleSheet.hairlineWidth,
    opacity: SURFACE_LINE_OPACITY,
    overflow: 'hidden',
  },
  surfaceImage: {
    position: 'absolute',
    tintColor: CabinetTokens.liquidSurface,
  },
})
