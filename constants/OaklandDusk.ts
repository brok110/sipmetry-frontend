const OaklandDusk = {
  // ── 背景層次 ──
  bg: {
    void:    '#08070C',  // 全局背景
    card:    '#100C18',  // 卡片、Modal
    surface: '#180F20',  // Sheet、輸入框
    border:  '#251810',  // 邊框、分隔線
  },

  // ── 品牌色：港口鐵鏽 + 落日金 ──
  brand: {
    tagBg:   '#3A1808',  // Tag 深底
    rust:    '#7A2420',  // 鐵鏽點綴
    gold:    '#C87828',  // 主 CTA、邊框、icon 高亮
    sundown: '#E0A030',  // Hover、pressed
    yellow:  '#F0C848',  // A's Yellow、最強調
  },

  // ── 強調色：壁畫玫瑰 + 靛藍夜 ──
  accent: {
    roseBg:   '#3A0820',  // 玫瑰 Tag 背景
    rose:     '#8B3060',  // 壁畫玫瑰
    crimson:  '#C04858',  // 錯誤色
    indigoBg: '#2A1860',  // 靛藍 Tag 背景
    indigo:   '#7868B8',  // 資訊色
  },

  // ── 文字層次 ──
  text: {
    primary:   '#F0E4C8',  // H1 主標題（暖象牙白）
    secondary: '#C8B898',  // 正文（羊皮紙）
    tertiary:  '#6A5040',  // 次要文字
    disabled:  '#352A1E',  // 禁用、佔位
  },

  // ── 語意色 ──
  semantic: {
    success: '#C87828',  // 品牌金
    warning: '#E0A030',  // 落日橙
    error:   '#C04858',  // 深玫瑰紅
    info:    '#7868B8',  // 靛藍夜
  },
} as const

export type OaklandDuskTheme = typeof OaklandDusk
export default OaklandDusk

// TODO: 下載字體檔後在 _layout.tsx useFonts 中註冊
// BebasNeue-Regular.ttf       → fontFamily: 'BebasNeue'
// CormorantGaramond-LightItalic.ttf → fontFamily: 'CormorantGaramond'
// 字體下載：https://fonts.google.com/specimen/Bebas+Neue
//           https://fonts.google.com/specimen/Cormorant+Garamond
