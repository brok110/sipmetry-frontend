import { hashId } from '@/components/cabinet/BottleGlyph'
import PhotoBottle, { photoBottleWidth } from '@/components/cabinet/PhotoBottle'
import {
  CABINET_PHOTO,
  CABINET_PHOTO_BOTTLES,
  CABINET_PHOTO_MAX_BOTTLE_SRC,
  cabinetPhotoScale,
  photoSizeClassForMl,
  type PhotoBottleType,
  type PhotoLiquidColour,
  type PhotoSizeClass,
} from '@/constants/cabinetTokens'
import OaklandDusk from '@/constants/OaklandDusk'
import { V3 } from '@/constants/v3DesignTokens'
import { photoShelfIndexFor, type BottleUnit, type PhotoShelfIndex, type ShelfId } from '@/lib/cabinet'
import { router } from 'expo-router'
import React, { useMemo } from 'react'
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

// CABINET-PHOTO:照片酒櫃 = 背景層 + 站在層板上的照片瓶。
// 渲染契約:width = 螢幕寬、height = 寬 × sourceHeight / sourceWidth、頂端對齊;
// 不用 cover / contain(置中裁切會讓 CABINET_PHOTO 的座標全錯)。
// 所有位置先用「來源圖像素」算,最後才乘 scale 換成 pt —— 瓶子因此跟著背景一起縮放。

// Stage 4:六層全鋪(GIN / VODKA / RUM / WHISKEY / TEQUILA / LIQUEURS;Stage 3 只鋪 WHISKEY 那一層)
const ENABLED_PHOTO_SHELVES: readonly PhotoShelfIndex[] = [0, 1, 2, 3, 4, 5]
// T3(Brok 2026-09-18 裁):不設固定瓶數上限 —— 一層放得下幾瓶就放幾瓶,放不下的才收進 +N。
// 層板右側這一段保留給 Stage 4 的家族名 + 數量(整頁 mockup:瓶子靠左、文字靠右)
const LABEL_RESERVE_RATIO = 0.3
// 有 +N 時,要替它在瓶子後面留的寬度
const OVERFLOW_TAG_SRC = 70
// Stage 2 的渲染契約驗收用;已驗過,預設關。要重驗就改 true
const SHOW_DEBUG_LINES = false
// 每一層點下去進哪個 shelf detail。合併層(whiskey+brandy、liqueurs+others)先進主家族那一頁;
// 舊的 8 層映射要到 Stage 5 才收成 6 層,在那之前 brandy / others 的瓶子不會出現在主家族的 detail 裡
const PHOTO_SHELF_DETAIL: Record<PhotoShelfIndex, ShelfId> = {
  0: 'gin',
  1: 'vodka',
  2: 'rum',
  3: 'whiskey',
  4: 'tequila',
  5: 'liqueurs',
}
// 瓶型怎麼挑(Brok 2026-09-19 拍板、2026-09-20 修訂):容量決定大小級距,五個級距各有自己的瓶型;
// 同一級距有好幾種形狀時(750 兩種),由 bottleId 固定分配,同一支酒永遠是同一支瓶子。
// 六層共用同一組瓶型,只換酒色(見下方 liquidColourFor)。每一格至少要有一個瓶型:寫成空陣列 tsc 會直接報錯。
type BottleTypeChoices = readonly [PhotoBottleType, ...PhotoBottleType[]]
const BOTTLE_TYPES_BY_SIZE: Record<PhotoSizeClass, BottleTypeChoices> = {
  150: ['bitters_150'],
  350: ['small_350'],
  500: ['flask_500'],
  750: ['squat_750', 'round_750'],
  1000: ['longneck_1000'],
}
function bottleTypeFor(unit: BottleUnit): PhotoBottleType {
  const choices = BOTTLE_TYPES_BY_SIZE[photoSizeClassForMl(unit.totalMl)]
  return choices[hashId(unit.bottleId) % choices.length]
}
// 酒色怎麼挑(Brok 2026-09-22 裁):先看家族 —— GIN / VODKA / TEQUILA 層透明,RUM / WHISKEY / LIQUEURS 層琥珀;
// 再看酒 —— 下表只列和家族預設不同的酒(白蘭姆透明、黑蘭姆深色、Campari 紅…),表裡沒有的一律落家族預設。
// ingredient_key 對照 2026-09-22 從 ingredients 表撈出的 116 筆;新酒不在表裡也不會壞,只是拿家族預設色。
const PHOTO_SHELF_LIQUID_COLOUR: Record<PhotoShelfIndex, PhotoLiquidColour> = {
  0: 'clear',
  1: 'clear',
  2: 'amber',
  3: 'amber',
  4: 'clear',
  5: 'amber',
}
const PHOTO_LIQUID_COLOUR_BY_INGREDIENT: Record<string, PhotoLiquidColour> = {
  white_rum: 'clear',
  cachaca: 'clear',
  kirsch: 'clear',
  pisco: 'clear',
  triple_sec: 'clear',
  cointreau: 'clear',
  combier: 'clear',
  orange_liqueur: 'clear',
  maraschino_liqueur: 'clear',
  elderflower_liqueur: 'clear',
  peach_schnapps: 'clear',
  absinthe: 'clear',
  dry_vermouth: 'clear',
  lillet_blanc: 'clear',
  champagne: 'clear',
  prosecco: 'clear',
  white_wine: 'clear',
  tequila_reposado: 'amber',
  tequila_anejo: 'amber',
  dark_rum: 'dark',
  coffee_liqueur: 'dark',
  cynar: 'dark',
  fernet_branca: 'dark',
  sweet_vermouth: 'dark',
  creme_de_cassis: 'dark',
  creme_de_mure: 'dark',
  cherry_liqueur: 'dark',
  raspberry_liqueur: 'dark',
  ruby_port: 'dark',
  red_wine: 'dark',
  angostura_bitters: 'dark',
  campari: 'red',
  aperol: 'red',
  sloe_gin: 'red',
  peychaud_s_bitters: 'red',
}
function liquidColourFor(unit: BottleUnit, shelfIndex: PhotoShelfIndex): PhotoLiquidColour {
  return PHOTO_LIQUID_COLOUR_BY_INGREDIENT[unit.ingredientKey] ?? PHOTO_SHELF_LIQUID_COLOUR[shelfIndex]
}

// 靠左、間距刻意不等(決策 4):間距由 bottleId 的 hash 決定,每次渲染一致
const ROW_INSET_SRC = 36
const GAP_MIN_SRC = 28
const GAP_STEP_SRC = 7
const GAP_STEPS = 5
const OVERFLOW_GAP_SRC = 24
const OVERFLOW_LIFT_PT = 22

type PlacedBottle = {
  unit: BottleUnit
  type: PhotoBottleType
  xSrc: number
  heightSrc: number
}

function assertAssetMatchesTokens() {
  const asset = Image.resolveAssetSource(CABINET_PHOTO.background)
  if (asset.width !== CABINET_PHOTO.sourceWidth || asset.height !== CABINET_PHOTO.sourceHeight) {
    throw new Error(
      `CABINET_PHOTO: asset is ${asset.width}x${asset.height} but tokens say ` +
        `${CABINET_PHOTO.sourceWidth}x${CABINET_PHOTO.sourceHeight}; re-run measure_shelves.py and replace the tokens`,
    )
  }
}

function groupByPhotoShelf(shelves: Map<ShelfId, BottleUnit[]>): Map<PhotoShelfIndex, { unit: BottleUnit; shelfId: ShelfId }[]> {
  const grouped = new Map<PhotoShelfIndex, { unit: BottleUnit; shelfId: ShelfId }[]>()
  for (const [shelfId, units] of shelves) {
    const index = photoShelfIndexFor(shelfId)
    const list = grouped.get(index) ?? []
    for (const unit of units) list.push({ unit, shelfId })
    grouped.set(index, list)
  }
  for (const list of grouped.values()) list.sort((a, b) => a.unit.pct - b.unit.pct)
  return grouped
}

type PlacedRow = { placed: PlacedBottle[]; lastRightSrc: number }

function fitRow(entries: { unit: BottleUnit; shelfId: ShelfId }[], limitSrc: number): PlacedRow {
  const placed: PlacedBottle[] = []
  let xSrc = CABINET_PHOTO.shelfLeftX + ROW_INSET_SRC
  let lastRightSrc = xSrc
  for (const { unit } of entries) {
    const type = bottleTypeFor(unit)
    // 高度一律用瓶型自己的 heightSrc(色調校正是照這個高度做的),不依容量縮放
    const heightSrc = CABINET_PHOTO_BOTTLES[type].heightSrc
    const widthSrc = photoBottleWidth(type, heightSrc)
    if (xSrc + widthSrc > limitSrc) break
    placed.push({ unit, type, xSrc, heightSrc })
    lastRightSrc = xSrc + widthSrc
    xSrc = lastRightSrc + GAP_MIN_SRC + (hashId(unit.bottleId) % GAP_STEPS) * GAP_STEP_SRC
  }
  return { placed, lastRightSrc }
}

// 玻璃內部不透明(T1 修訂 2026-09-19):兩支瓶子一重疊,前面的就會蓋掉後面的。
// 排列規則本身保證不會疊;這裡在開發模式再核一次,之後誰改了排列,一疊到就當場報錯。
function assertRowHasNoOverlap(placed: PlacedBottle[]) {
  let previousRightSrc = Number.NEGATIVE_INFINITY
  for (const { unit, type, xSrc, heightSrc } of placed) {
    if (heightSrc > CABINET_PHOTO_MAX_BOTTLE_SRC) {
      throw new Error(
        `PhotoCabinet: ${type} is ${heightSrc}px tall but a shelf cell only fits ${CABINET_PHOTO_MAX_BOTTLE_SRC}px`,
      )
    }
    if (xSrc < previousRightSrc + GAP_MIN_SRC) {
      throw new Error(
        `PhotoCabinet: bottle ${unit.bottleId} starts at ${xSrc}px but the previous bottle needs room until ` +
          `${previousRightSrc + GAP_MIN_SRC}px`,
      )
    }
    previousRightSrc = xSrc + photoBottleWidth(type, heightSrc)
  }
}
// 先試全部放;放不下才重排一次,這次替 +N 留位置
function placeRow(entries: { unit: BottleUnit; shelfId: ShelfId }[]): PlacedRow {
  const shelfWidthSrc = CABINET_PHOTO.shelfRightX - CABINET_PHOTO.shelfLeftX
  const limitSrc = CABINET_PHOTO.shelfRightX - shelfWidthSrc * LABEL_RESERVE_RATIO
  const everything = fitRow(entries, limitSrc)
  if (everything.placed.length === entries.length) return everything
  return fitRow(entries, limitSrc - OVERFLOW_TAG_SRC)
}

export default function PhotoCabinet({ shelves }: { shelves: Map<ShelfId, BottleUnit[]> }) {
  const { width } = useWindowDimensions()
  const scale = cabinetPhotoScale(width)
  const height = CABINET_PHOTO.sourceHeight * scale
  const grouped = useMemo(() => groupByPhotoShelf(shelves), [shelves])

  if (__DEV__) assertAssetMatchesTokens()

  return (
    <View style={{ width, height }}>
      <Image source={CABINET_PHOTO.background} style={{ width, height }} resizeMode="stretch" />
      {ENABLED_PHOTO_SHELVES.map((index) => {
        const entries = grouped.get(index) ?? []
        const { placed, lastRightSrc } = placeRow(entries)
        if (__DEV__) assertRowHasNoOverlap(placed)
        const shelfTopSrc = CABINET_PHOTO.shelfTopY[index]
        const overflow = entries.length - placed.length
        // 點擊範圍 = 這一格(上一片層板的底面以下 → 這片層板的正面為止),整片層板寬
        const pitchSrc = index === 0 ? CABINET_PHOTO_MAX_BOTTLE_SRC : shelfTopSrc - CABINET_PHOTO.shelfTopY[index - 1]
        const cellTopSrc =
          index === 0
            ? shelfTopSrc - pitchSrc
            : shelfTopSrc - pitchSrc + CABINET_PHOTO.shelfFaceHeight + CABINET_PHOTO.shelfUndersideHeight
        const cellBottomSrc = shelfTopSrc + CABINET_PHOTO.shelfFaceHeight
        return (
          <React.Fragment key={index}>
            {placed.map(({ unit, type, xSrc, heightSrc }) => (
              <View
                key={unit.bottleId}
                pointerEvents="none"
                style={[styles.bottle, { left: xSrc * scale, top: (shelfTopSrc - heightSrc) * scale }]}
              >
                <PhotoBottle type={type} colour={liquidColourFor(unit, index)} heightPt={heightSrc * scale} pct={unit.pct} />
              </View>
            ))}
            {overflow > 0 && (
              <Text
                style={[
                  styles.overflowTag,
                  { left: (lastRightSrc + OVERFLOW_GAP_SRC) * scale, top: shelfTopSrc * scale - OVERFLOW_LIFT_PT },
                ]}
              >{`+${overflow}`}</Text>
            )}
            {entries.length > 0 && (
              <Pressable
                onPress={() => router.push(`/shelf/${PHOTO_SHELF_DETAIL[index]}`)}
                accessibilityRole="button"
                accessibilityLabel={`${PHOTO_SHELF_DETAIL[index]} shelf, ${entries.length} bottles`}
                style={[
                  styles.shelfHit,
                  {
                    top: cellTopSrc * scale,
                    height: (cellBottomSrc - cellTopSrc) * scale,
                    left: CABINET_PHOTO.shelfLeftX * scale,
                    width: (CABINET_PHOTO.shelfRightX - CABINET_PHOTO.shelfLeftX + 1) * scale,
                  },
                ]}
              />
            )}
          </React.Fragment>
        )
      })}
      {__DEV__ &&
        SHOW_DEBUG_LINES &&
        CABINET_PHOTO.shelfTopY.map((y) => (
          <View
            key={y}
            pointerEvents="none"
            style={[
              styles.debugLine,
              {
                top: y * scale,
                left: CABINET_PHOTO.shelfLeftX * scale,
                width: (CABINET_PHOTO.shelfRightX - CABINET_PHOTO.shelfLeftX + 1) * scale,
              },
            ]}
          />
        ))}
    </View>
  )
}

const styles = StyleSheet.create({
  bottle: {
    position: 'absolute',
  },
  shelfHit: {
    position: 'absolute',
  },
  overflowTag: {
    position: 'absolute',
    fontFamily: V3.fonts.mono,
    fontSize: 12,
    letterSpacing: 1,
    color: OaklandDusk.text.secondary,
  },
  debugLine: {
    position: 'absolute',
    height: 1,
    backgroundColor: OaklandDusk.accent.crimson,
  },
})
