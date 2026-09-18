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
// 來源圖:cabinet-background-r1(1168x2528;backend scripts/cabinet-images/processed/)。
// 暫用 asset:幾何過關(間距最大差 0.84%、水平差 0px),質感待 Stage 3 WHISKEY 實測複審。
// 數值全部是 measure_shelves.py 輸出的「來源圖像素」,不得手改;換圖 = 重量後整組替換,
// background 的 require 與座標放同一個物件,就是為了讓圖和座標一起換。
// 渲染契約:背景以 width = 螢幕寬、height = 寬 × sourceHeight / sourceWidth、
// 頂端對齊渲染;禁用 resizeMode cover / contain(置中裁切會讓座標全錯)。
// 元件檔不得出現裸座標,一律經 cabinetPhotoScale() 換算成 pt。
// CABINET_PHOTO_PREVIEW:開發模式看新櫃,正式 build / OTA 一律舊櫃;Stage 5 才對線上開。
export const CABINET_PHOTO_PREVIEW = __DEV__
export const CABINET_PHOTO = {
  background: require('@/assets/images/cabinet/cabinet-background-r1.jpg'),
  sourceWidth: 1168,
  sourceHeight: 2528,
  // 6 片層板頂緣 y(瓶底對齊此值);index 0–5 = 由上到下的層序
  shelfTopY: [723, 962, 1201, 1441, 1679, 1917],
  // 層板左右端 x(6 片一致,±2px)
  shelfLeftX: 56,
  shelfRightX: 1108,
  // 層板正面厚度;底面可見高度取 6 片最大值(實測 12–15px)
  shelfFaceHeight: 23,
  shelfUndersideHeight: 15,
} as const
/** 來源圖像素 → 畫面 pt。背景以全幅寬渲染,縮放比 = 渲染寬 / sourceWidth */
export function cabinetPhotoScale(renderedWidth: number): number {
  return renderedWidth / CABINET_PHOTO.sourceWidth
}
//
export default CabinetTokens
