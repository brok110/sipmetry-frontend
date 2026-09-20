import OaklandDusk from '@/constants/OaklandDusk'

// CABINET-3A:My Bar 酒櫃的衍生色票。
// handoff README「Design Tokens」的全部衍生 hex 收編於此;
// 主色(gold/sundown/yellow/ivory/parchment/crimson/rust/void…)一律取 OaklandDusk,
// 元件檔不得出現任何裸 hex。

/** hex(#RRGGBB)→ rgba() 字串;元件檔一律用這個組 alpha,不散落 rgba 魔法值 */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const CabinetTokens = {
  // 技術色(陰影/遮罩用,非設計色;README:no pure white 指可見色)
  black: '#000000',
  maskWhite: '#FFFFFF',

  // 木紋/櫃體漸層停點
  wood: {
    bodyTop: '#2E1C11',
    bodyMid: OaklandDusk.bg.border,      // #251810 = README「wood frame」
    bodyBottom: '#1F150D',
    crownTop: '#3A2412',
    crownBottom: '#2A1810',
    plankTop: '#4A2712',
    plankHigh: OaklandDusk.brand.tagBg,  // #3A1808 = README「wood plank / highlight」;木紋 grain 同色
    plankMid: '#2A1810',
    plankBottom: '#1C1109',
    baseTop: '#2A1810',
    baseBottom: '#1C1109',
  },

  // 背板內面
  backboard: {
    top: '#140F1C',
    bottom: '#0D0913',
  },

  // README tab bar 漸層深端(C1 點名收編;tab bar 由 expo-router 提供,不自畫)
  voidDeep: '#0A0810',

  // 瓶蓋
  cap: '#5A3C1C',

  // 酒液分家色(P3);低量一律覆寫 crimson(OaklandDusk 既有)
  liquid: {
    whiskey: ['#A85818', '#B0641E'],
    rum: ['#6A2A14', '#7A3218'],
    clear: '#D8C078',                                             // gin/vodka
    tequila: [OaklandDusk.brand.gold, OaklandDusk.brand.sundown], // tequila/liqueur 金
    low: OaklandDusk.accent.crimson,
  },

  // 低量 % label 文字色(README「crimson tint」,OaklandDusk 無此色)
  crimsonTint: '#D66E7C',
  // CABINET-PHOTO:照片瓶的液面線(暖白;取自 Brok 2026-09-19 過關的酒量預覽)
  liquidSurface: '#FFCD8C',
} as const

// ── CABINET-BOTTLE-SIZE(2026-08-01 A 案拍板):三階瓶身尺寸 ──
// 階層制非連續:half ≤500 / std 501–999 / large ≥1000;缺值 → std。
// 等比縮放(glyph 為 viewBox 等比 SVG,寬隨高走 — 偏離拍板項 2 的
// 獨立寬比,技術約束入帳);hash 抖動保留(階內有機變化)。
export type BottleSizeTier = 'half' | 'std' | 'large'

export const SIZE_TIER_SCALE: Record<BottleSizeTier, number> = {
  half: 0.77,
  std: 1,
  large: 1.18,
}

export function tierForMl(totalMl: number | null | undefined): BottleSizeTier {
  const ml = Number(totalMl)
  if (!Number.isFinite(ml) || ml <= 0) return 'std'
  if (ml <= 500) return 'half'
  if (ml >= 1000) return 'large'
  return 'std'
}

// ── CABINET-PHOTO(2026-09-17):照片背景的量測座標 ──
// 來源圖:cabinet-background-r2(1168x2528;backend scripts/cabinet-images/processed/)。
// 暫用 asset:幾何過關(間距最大差 0.84%、水平差 2px 以內),r2 外觀取自 Brok 選定的樣張 c2,幾何由 respace_shelves.py 重排到 r1 的層板位置,真機畫面複審中。
// 數值全部是 measure_shelves.py 輸出的「來源圖像素」,不得手改;換圖 = 重量後整組替換,
// background 的 require 與座標放同一個物件,就是為了讓圖和座標一起換。
// 渲染契約:背景以 width = 螢幕寬、height = 寬 × sourceHeight / sourceWidth、
// 頂端對齊渲染;禁用 resizeMode cover / contain(置中裁切會讓座標全錯)。
// 元件檔不得出現裸座標,一律經 cabinetPhotoScale() 換算成 pt。
// CABINET_PHOTO_PREVIEW:開發模式看新櫃,正式 build / OTA 一律舊櫃;Stage 5 才對線上開。
export const CABINET_PHOTO_PREVIEW = __DEV__
export const CABINET_PHOTO = {
  background: require('@/assets/images/cabinet/cabinet-background-r2.jpg'),
  sourceWidth: 1168,
  sourceHeight: 2528,
  // 6 片層板頂緣 y(瓶底對齊此值);index 0–5 = 由上到下的層序
  shelfTopY: [723, 962, 1201, 1441, 1679, 1917],
  // 層板可用範圍的左右邊界 x,r2 起量的是立柱內側暗溝(6 片一致,±2px)
  shelfLeftX: 38,
  shelfRightX: 1129,
  // 層板正面厚度;底面可見高度取 6 片最大值(實測 1–14px)
  shelfFaceHeight: 31,
  shelfUndersideHeight: 14,
} as const
/** 來源圖像素 → 畫面 pt。背景以全幅寬渲染,縮放比 = 渲染寬 / sourceWidth */
export function cabinetPhotoScale(renderedWidth: number): number {
  return renderedWidth / CABINET_PHOTO.sourceWidth
}
// ── CABINET-PHOTO Stage 3:照片瓶(每瓶型兩張對齊圖層 + 校準值)──
// 數值取自 backend scripts/cabinet-images/processed/bottles/<key>.calibration.json
// (process_bottle.py --look lit 產出),不得手改;換瓶圖 = 重跑後整組替換,require 與校準值同物件。
// T1 修訂 2026-09-19:glass = 空瓶拍在打了光的牆前面,透過玻璃看到的牆已經烤進圖層(瓶內不透明);
// liquid = 同一支瓶子裝滿時的照片,輪廓與 glass 逐像素相同。app 只露出液面以下的 liquid。
// 瓶子因此和背景綁定:換背景 = 瓶子重做;瓶子不透明,所以排列時不得互相重疊。
// liquidTopFrac / liquidBaseFrac:液面 100% / 0% 在瓶高上的位置(0 = 瓶頂,1 = 瓶底)。
// heightSrc:這個瓶型在背景來源圖上的高度(px)。色調校正是照這個高度對到牆上的光,所以畫面上一律用這個高度、
// 不依容量縮放;要改大小 = 用新的 --height-src 重跑 process_bottle.py。大小差異靠不同瓶型,不靠縮放。
export const CABINET_PHOTO_BOTTLES = {
  whiskey_squat: {
    glass: require('@/assets/images/cabinet/bottles/whiskey_squat_r1_glass.png'),
    liquid: require('@/assets/images/cabinet/bottles/whiskey_squat_r1_liquid.png'),
    sourceWidth: 118,
    sourceHeight: 240,
    aspect: 0.4901,
    liquidTopFrac: 0.3452,
    liquidBaseFrac: 0.8651,
    heightSrc: 133,
  },
} as const
export type PhotoBottleType = keyof typeof CABINET_PHOTO_BOTTLES
// 照片櫃的瓶子大小 = 六個容量級距(Brok 2026-09-19 拍板),對應 Edit Bottle 的 BOTTLE SIZE 選項
// (375 / 500 / 700 / 750 / 1L / 1.75L)。Custom 落到最接近的一級(等距取小的),缺值 → 750。
export const PHOTO_SIZE_CLASSES_ML = [375, 500, 700, 750, 1000, 1750] as const
export type PhotoSizeClass = typeof PHOTO_SIZE_CLASSES_ML[number]
export function photoSizeClassForMl(totalMl: number | null | undefined): PhotoSizeClass {
  const ml = Number(totalMl)
  if (!Number.isFinite(ml) || ml <= 0) return 750
  let nearest: PhotoSizeClass = PHOTO_SIZE_CLASSES_ML[0]
  for (const size of PHOTO_SIZE_CLASSES_ML) {
    if (Math.abs(size - ml) < Math.abs(nearest - ml)) nearest = size
  }
  return nearest
}
// 瓶子可用的最大高度(來源圖像素)= 最小層距 − 層板正面 − 層板底面;由量測值推導,不手寫
const CABINET_PHOTO_PITCHES = CABINET_PHOTO.shelfTopY.slice(1).map((y, i) => y - CABINET_PHOTO.shelfTopY[i])
export const CABINET_PHOTO_MAX_BOTTLE_SRC =
  Math.min(...CABINET_PHOTO_PITCHES) - CABINET_PHOTO.shelfFaceHeight - CABINET_PHOTO.shelfUndersideHeight
//
export default CabinetTokens
