import PhotoBottle, { photoBottleWidth } from '@/components/cabinet/PhotoBottle'
import CabinetTokens, {
  CABINET_PHOTO,
  CABINET_PHOTO_BOTTLES,
  CABINET_PHOTO_MAX_BOTTLE_SRC,
  CABINET_PHOTO_SIGN,
  cabinetPhotoScale,
  photoSizeClassForMl,
  withAlpha,
  type PhotoBottleType,
  type PhotoLiquidColour,
  type PhotoSizeClass,
} from '@/constants/cabinetTokens'
import OaklandDusk from '@/constants/OaklandDusk'
import { V3 } from '@/constants/v3DesignTokens'
import { hashId, photoShelfIndexFor, type BottleUnit, type PhotoShelfIndex, type ShelfId } from '@/lib/cabinet'
import { router } from 'expo-router'
import React, { useMemo } from 'react'
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

// CABINET-PHOTO:照片酒櫃 = 背景層 + 站在層板上的照片瓶。
// 渲染契約:width = 螢幕寬、height = 寬 × sourceHeight / sourceWidth、頂端對齊;
// 不用 cover / contain(置中裁切會讓 CABINET_PHOTO 的座標全錯)。
// 所有位置先用「來源圖像素」算,最後才乘 scale 換成 pt —— 瓶子因此跟著背景一起縮放。

// Stage 4:六層全鋪(GIN / VODKA / RUM / WHISKEY / TEQUILA / LIQUEURS;Stage 3 只鋪 WHISKEY 那一層)
const ENABLED_PHOTO_SHELVES: readonly PhotoShelfIndex[] = [0, 1, 2, 3, 4, 5]
// T3(Brok 2026-09-18 裁):不設固定瓶數上限 —— 一層放得下幾瓶就放幾瓶。放不下的不畫、也不標(Brok 2026-09-24:
// `+N` 讓人困惑、改成總數 `N ›` 又太醜且非必要,溢出標整個拿掉);完整清單在點層進去的 detail 頁。
// 層板右側這一段保留給名牌(Stage 4(三)接上;整頁 mockup:瓶子靠左、名牌靠右)
const LABEL_RESERVE_RATIO = 0.3
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
// Stage 4(三):層板名牌(Brok 手繪 IMG_5013;大小 A = 牌高 100,Brok 2026-09-24 裁)。站在每層層板的右端,右緣內縮和瓶子的左內縮對稱;
// 牌子只佔保留區的右半,左邊還留得下 +N。名牌畫在所有六層,不管那層有沒有酒;它沒有自己的點擊,點名牌 = 點那一層。
const SIGN_RIGHT_INSET_SRC = 36
const SIGN_WIDTH_SRC = CABINET_PHOTO_SIGN.heightSrc * CABINET_PHOTO_SIGN.aspect
const SIGN_LEFT_SRC = CABINET_PHOTO.shelfRightX - SIGN_RIGHT_INSET_SRC - SIGN_WIDTH_SRC
// 刻字:字高先取牌高的 40%,放不進牌面空白區的長名(LIQUEURS)由 iOS 縮到剛好放得下;字距 = 字高 × 0.12。
// 暗字 + 上緣 0.5pt 亮邊 = 刻進金屬的凹槽(光從下方來,凹槽的上壁受光);兩個色在 CabinetTokens。
// iOS 把字距也加在最後一個字之後,字會左偏半個字距(4(三)量到 2.7px);marginLeft 補一個字距,居中就回到 0。
const SIGN_FONT_RATIO = 0.4
const SIGN_LETTER_SPACING_RATIO = 0.12
const SIGN_MIN_FONT_SCALE = 0.5
const SIGN_INK_ALPHA = 0.88
const SIGN_EDGE_ALPHA = 0.6
const SIGN_EDGE_OFFSET_PT = -0.5
// Stage 4(五)(Brok 2026-09-24 裁 B):空層在瓶子區正中放淡字「+ ADD {家族}」,和右邊名牌的字對齊同一條線;點整層 → Smart Restock
// (網址帶 family=<家族>,cart.tsx 讀它做篩選另做)。字用 V3 的 mono medium(同標頭 SCAN),parchment 75%。
const EMPTY_LABEL_PREFIX = '+ ADD '
const EMPTY_LABEL_FONT_SIZE = 13
const EMPTY_LABEL_LETTER_SPACING = 2.6
const EMPTY_LABEL_ALPHA = 0.75
const EMPTY_LABEL_HEIGHT_PT = 24
// 每層牌子上的字(Brok 2026-09-23:只寫家族名的英文大寫,數量留在標頭)
const PHOTO_SHELF_SIGN_NAME: Record<PhotoShelfIndex, string> = {
  0: 'GIN',
  1: 'VODKA',
  2: 'RUM',
  3: 'WHISKEY',
  4: 'TEQUILA',
  5: 'LIQUEURS',
}
const GAP_MIN_SRC = 28
const GAP_STEP_SRC = 7
const GAP_STEPS = 5

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

function assertSignMatchesTokens() {
  const asset = Image.resolveAssetSource(CABINET_PHOTO_SIGN.image)
  if (asset.width !== CABINET_PHOTO_SIGN.sourceWidth || asset.height !== CABINET_PHOTO_SIGN.sourceHeight) {
    throw new Error(
      `CABINET_PHOTO_SIGN: asset is ${asset.width}x${asset.height} but tokens say ` +
        `${CABINET_PHOTO_SIGN.sourceWidth}x${CABINET_PHOTO_SIGN.sourceHeight}; re-run process_plate.py and replace the tokens`,
    )
  }
  // 名牌不得伸進瓶子的排列區(排列區右界 = 保留區左界);伸進去就會和最右邊的瓶子疊
  const shelfWidthSrc = CABINET_PHOTO.shelfRightX - CABINET_PHOTO.shelfLeftX
  const bottleLimitSrc = CABINET_PHOTO.shelfRightX - shelfWidthSrc * LABEL_RESERVE_RATIO
  if (SIGN_LEFT_SRC < bottleLimitSrc) {
    throw new Error(`PhotoCabinet: the sign starts at ${SIGN_LEFT_SRC}px but bottles may reach ${bottleLimitSrc}px`)
  }
  if (CABINET_PHOTO_SIGN.heightSrc > CABINET_PHOTO_MAX_BOTTLE_SRC) {
    throw new Error(`PhotoCabinet: the sign is ${CABINET_PHOTO_SIGN.heightSrc}px tall but a shelf cell only fits ${CABINET_PHOTO_MAX_BOTTLE_SRC}px`)
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

// 從左往右排,放不下的就停(不畫、不標)
function placeRow(entries: { unit: BottleUnit; shelfId: ShelfId }[]): PlacedBottle[] {
  const shelfWidthSrc = CABINET_PHOTO.shelfRightX - CABINET_PHOTO.shelfLeftX
  const limitSrc = CABINET_PHOTO.shelfRightX - shelfWidthSrc * LABEL_RESERVE_RATIO
  const placed: PlacedBottle[] = []
  let xSrc = CABINET_PHOTO.shelfLeftX + ROW_INSET_SRC
  for (const { unit } of entries) {
    const type = bottleTypeFor(unit)
    // 高度一律用瓶型自己的 heightSrc(色調校正是照這個高度做的),不依容量縮放
    const heightSrc = CABINET_PHOTO_BOTTLES[type].heightSrc
    const widthSrc = photoBottleWidth(type, heightSrc)
    if (xSrc + widthSrc > limitSrc) break
    placed.push({ unit, type, xSrc, heightSrc })
    xSrc = xSrc + widthSrc + GAP_MIN_SRC + (hashId(unit.bottleId) % GAP_STEPS) * GAP_STEP_SRC
  }
  return placed
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

// Stage 5(四)(Brok 2026-09-26):整個酒櫃都是空的(新使用者)且給了 onEmptyBarPress → 六層都不寫「+ ADD」,點任何一層都呼叫它(去拍照);
// 其餘情況照舊(有酒的層進 detail、空層寫 + ADD 去 Smart Restock)。
export default function PhotoCabinet({
  shelves,
  onEmptyBarPress,
}: {
  shelves: Map<ShelfId, BottleUnit[]>
  onEmptyBarPress?: () => void
}) {
  const { width } = useWindowDimensions()
  const scale = cabinetPhotoScale(width)
  const height = CABINET_PHOTO.sourceHeight * scale
  const grouped = useMemo(() => groupByPhotoShelf(shelves), [shelves])
  const emptyBarMode = onEmptyBarPress !== undefined && [...grouped.values()].every((list) => list.length === 0)

  if (__DEV__) {
    assertAssetMatchesTokens()
    assertSignMatchesTokens()
  }
  const signHeightPt = CABINET_PHOTO_SIGN.heightSrc * scale
  const signWidthPt = signHeightPt * CABINET_PHOTO_SIGN.aspect
  const signFontSize = signHeightPt * SIGN_FONT_RATIO
  const field = CABINET_PHOTO_SIGN.textField
  // 空層淡字:x 置中在瓶子區(左內縮 → 排列區右界),y 對齊名牌刻字的中心線
  const shelfWidthSrc = CABINET_PHOTO.shelfRightX - CABINET_PHOTO.shelfLeftX
  const bottleLimitSrc = CABINET_PHOTO.shelfRightX - shelfWidthSrc * LABEL_RESERVE_RATIO
  const emptyLabelLeftPt = (CABINET_PHOTO.shelfLeftX + ROW_INSET_SRC) * scale
  const emptyLabelWidthPt = bottleLimitSrc * scale - emptyLabelLeftPt
  const signTextCentreSrc = CABINET_PHOTO_SIGN.heightSrc * (1 - (field.top + field.bottom) / 2)

  return (
    <View style={{ width, height }}>
      <Image source={CABINET_PHOTO.background} style={{ width, height }} resizeMode="stretch" />
      {ENABLED_PHOTO_SHELVES.map((index) => {
        const entries = grouped.get(index) ?? []
        const placed = placeRow(entries)
        if (__DEV__) assertRowHasNoOverlap(placed)
        const shelfTopSrc = CABINET_PHOTO.shelfTopY[index]
        // 點擊範圍 = 這一格(上一片層板的底面以下 → 這片層板的正面為止),整片層板寬
        const pitchSrc = index === 0 ? CABINET_PHOTO_MAX_BOTTLE_SRC : shelfTopSrc - CABINET_PHOTO.shelfTopY[index - 1]
        const cellTopSrc =
          index === 0
            ? shelfTopSrc - pitchSrc
            : shelfTopSrc - pitchSrc + CABINET_PHOTO.shelfFaceHeight + CABINET_PHOTO.shelfUndersideHeight
        const cellBottomSrc = shelfTopSrc + CABINET_PHOTO.shelfFaceHeight
        return (
          <React.Fragment key={index}>
            <View
              pointerEvents="none"
              style={[
                styles.sign,
                { left: SIGN_LEFT_SRC * scale, top: (shelfTopSrc - CABINET_PHOTO_SIGN.heightSrc) * scale, width: signWidthPt, height: signHeightPt },
              ]}
            >
              <Image source={CABINET_PHOTO_SIGN.image} style={{ width: signWidthPt, height: signHeightPt }} resizeMode="stretch" />
              <View
                style={[
                  styles.signField,
                  {
                    left: signWidthPt * field.left,
                    width: signWidthPt * (field.right - field.left),
                    top: signHeightPt * field.top,
                    height: signHeightPt * (field.bottom - field.top),
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={SIGN_MIN_FONT_SCALE}
                  style={[
                    styles.signText,
                    {
                      fontSize: signFontSize,
                      letterSpacing: signFontSize * SIGN_LETTER_SPACING_RATIO,
                      marginLeft: signFontSize * SIGN_LETTER_SPACING_RATIO,
                    },
                  ]}
                >
                  {PHOTO_SHELF_SIGN_NAME[index]}
                </Text>
              </View>
            </View>
            {placed.map(({ unit, type, xSrc, heightSrc }) => (
              <View
                key={unit.bottleId}
                pointerEvents="none"
                style={[styles.bottle, { left: xSrc * scale, top: (shelfTopSrc - heightSrc) * scale }]}
              >
                <PhotoBottle type={type} colour={liquidColourFor(unit, index)} heightPt={heightSrc * scale} pct={unit.pct} isLow={unit.isLow} />
              </View>
            ))}
            {entries.length === 0 && !emptyBarMode && (
              <View
                pointerEvents="none"
                style={[
                  styles.emptyLabelBox,
                  {
                    left: emptyLabelLeftPt,
                    width: emptyLabelWidthPt,
                    top: (shelfTopSrc - signTextCentreSrc) * scale - EMPTY_LABEL_HEIGHT_PT / 2,
                    height: EMPTY_LABEL_HEIGHT_PT,
                  },
                ]}
              >
                <Text style={styles.emptyLabel}>{`${EMPTY_LABEL_PREFIX}${PHOTO_SHELF_SIGN_NAME[index]}`}</Text>
              </View>
            )}
            <Pressable
                onPress={() =>
                  emptyBarMode
                    ? onEmptyBarPress?.()
                    : entries.length > 0
                      ? router.push(`/shelf/${PHOTO_SHELF_DETAIL[index]}`)
                      : router.push({ pathname: '/(tabs)/cart', params: { family: PHOTO_SHELF_DETAIL[index] } })
                }
                accessibilityRole="button"
                accessibilityLabel={
                  emptyBarMode
                    ? `${PHOTO_SHELF_DETAIL[index]} shelf, your bar is empty — scan your bottles`
                    : entries.length > 0
                      ? `${PHOTO_SHELF_DETAIL[index]} shelf, ${entries.length} bottles`
                      : `${PHOTO_SHELF_DETAIL[index]} shelf is empty, add ${PHOTO_SHELF_DETAIL[index]} in Smart Restock`
                }
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
  sign: {
    position: 'absolute',
  },
  signField: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signText: {
    fontFamily: CABINET_PHOTO_SIGN.fontFamily,
    color: withAlpha(CabinetTokens.signInk, SIGN_INK_ALPHA),
    textAlign: 'center',
    textShadowColor: withAlpha(CabinetTokens.signEdge, SIGN_EDGE_ALPHA),
    textShadowOffset: { width: 0, height: SIGN_EDGE_OFFSET_PT },
    textShadowRadius: 0,
  },
  emptyLabelBox: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyLabel: {
    fontFamily: V3.fonts.monoMedium,
    fontSize: EMPTY_LABEL_FONT_SIZE,
    letterSpacing: EMPTY_LABEL_LETTER_SPACING,
    marginLeft: EMPTY_LABEL_LETTER_SPACING,
    color: withAlpha(OaklandDusk.text.secondary, EMPTY_LABEL_ALPHA),
    textAlign: 'center',
  },
  debugLine: {
    position: 'absolute',
    height: 1,
    backgroundColor: OaklandDusk.accent.crimson,
  },
})
