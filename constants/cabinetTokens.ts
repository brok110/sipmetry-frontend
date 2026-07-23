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

export default CabinetTokens
