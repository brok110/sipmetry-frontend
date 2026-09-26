import type { ImageRequireSource } from 'react-native'

// My Bar 照片酒櫃的衍生色票與量測資料。主色一律取 OaklandDusk,元件檔不得出現任何裸 hex。
// Stage 5(四)(2026-09-26):舊的畫出來的櫃子退場 → 它專用的色票(木紋 / 背板 / 瓶蓋 / 酒液分家色 / 遮罩)、
// 三階瓶身尺寸(SIZE_TIER_SCALE / tierForMl)與 CABINET_PHOTO_PREVIEW 開關一起刪除。

/** hex(#RRGGBB)→ rgba() 字串;元件檔一律用這個組 alpha,不散落 rgba 魔法值 */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const CabinetTokens = {
  // 低量光暈的淡紅(README「crimson tint」,OaklandDusk 無此色)
  crimsonTint: '#D66E7C',
  // CABINET-PHOTO:照片瓶的液面線(暖白;取自 Brok 2026-09-19 過關的酒量預覽)
  liquidSurface: '#FFCD8C',
  // CABINET-PHOTO Stage 4(三):層板名牌的刻字。光從下方來,凹槽的上壁受光:暗字 + 上緣一道亮邊(mockup 2026-09-24 過關)
  signInk: '#26180C',
  signEdge: '#FFECCD',
} as const

// ── CABINET-PHOTO(2026-09-17):照片背景的量測座標 ──
// 來源圖:cabinet-background-r3(1168x2528;backend scripts/cabinet-images/processed/)。
// r2:幾何過關(間距最大差 0.84%、水平差 2px 以內),外觀取自 Brok 選定的樣張 c2,幾何由 respace_shelves.py 重排到 r1 的層板位置。
// r3(2026-09-24)= r2 經 soften_seam.py:x=705 那條板縫比其他三條強一倍,Brok 看成邊界,柔化到同等;只動接縫左右 60px 的牆,
// 幾何與六層的牆中位數不變,所以下面的座標與瓶子的色調校正照舊。
// 數值全部是 measure_shelves.py 輸出的「來源圖像素」,不得手改;換圖 = 重量後整組替換,
// background 的 require 與座標放同一個物件,就是為了讓圖和座標一起換。
// 渲染契約:背景以 width = 螢幕寬、height = 寬 × sourceHeight / sourceWidth、
// 頂端對齊渲染;禁用 resizeMode cover / contain(置中裁切會讓座標全錯)。
// 元件檔不得出現裸座標,一律經 cabinetPhotoScale() 換算成 pt。
export const CABINET_PHOTO = {
  background: require('@/assets/images/cabinet/cabinet-background-r3.jpg'),
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
// ── CABINET-PHOTO Stage 4:照片瓶 = 瓶型 × 酒色(每瓶型一張玻璃層 + 每個酒色一張液體層 + 校準值)──
// 數值取自 backend scripts/cabinet-images/processed/bottles/<瓶型>.calibration.json
// (process_bottle.py --look lit --name … --colour … --variants … 產出),不得手改;換瓶圖 = 重跑後整組替換,require 與校準值同物件。
// T1 修訂 2026-09-19:glass = 空瓶拍在打了光的牆前面,透過玻璃看到的牆已經烤進圖層(瓶內不透明);
// liquids.<酒色> = 同一支瓶子裝滿該酒色時的照片,輪廓與 glass 逐像素相同。app 只露出液面以下的液體層。
// 瓶子因此和背景綁定:換背景 = 瓶子重做;瓶子不透明,所以排列時不得互相重疊。
// liquidTopFrac / liquidBaseFrac:液面 100% / 0% 在瓶高上的位置(0 = 瓶頂,1 = 瓶底)。
// labelTopFrac / labelBaseFrac:標籤帶(瓶子中央不透光的那一段)在瓶高上的位置;液面落在這一段時不畫液面線。無標籤 = null。
// heightSrc:這個瓶型在背景來源圖上的高度(px)。色調校正是照這個高度對到牆上的光,所以畫面上一律用這個高度、
// 不依容量縮放;要改大小 = 用新的 --height-src 重跑 process_bottle.py。大小差異靠不同瓶型,不靠縮放。
// 酒色(決策 4 的 2026-09-20 修訂):琥珀 / 透明 / 深色 / 紅,六種瓶型共用同一組。每個瓶型一定有 amber;
// bitters_150 沒做 clear——瓶型沒有的酒色,photoLiquidLayer() 落回 amber。
// halo(Stage 4(四),Brok 2026-09-24 裁 E):低量光暈圖層 = 這個瓶型的輪廓放大 1.35、模糊、留透明邊(backend make_halo.py 產出,
// 白色 + alpha,app 染成 crimsonTint);畫布比瓶子大,所以帶自己的尺寸 haloWidth / haloHeight,app 依「光暈尺寸 ÷ 玻璃層尺寸」放大、對瓶子置中。
// 不在 app 裡用 blurRadius:iOS 的 blur 會把貼邊的輪廓延伸成一塊,不會淡出。
export const PHOTO_LIQUID_COLOURS = ['amber', 'clear', 'dark', 'red'] as const
export type PhotoLiquidColour = typeof PHOTO_LIQUID_COLOURS[number]
export type PhotoBottleType = 'small_350' | 'flask_500' | 'squat_750' | 'round_750' | 'longneck_1000' | 'bitters_150'
type PhotoBottleSpec = {
  glass: ImageRequireSource
  liquids: { amber: ImageRequireSource } & Partial<Record<PhotoLiquidColour, ImageRequireSource>>
  halo: ImageRequireSource
  haloWidth: number
  haloHeight: number
  sourceWidth: number
  sourceHeight: number
  aspect: number
  liquidTopFrac: number
  liquidBaseFrac: number
  labelTopFrac: number | null
  labelBaseFrac: number | null
  heightSrc: number
}
// Record<PhotoBottleType, PhotoBottleSpec>:六種瓶型漏一種、多一種、少一個欄位、少了 amber,tsc 直接報錯
export const CABINET_PHOTO_BOTTLES: Record<PhotoBottleType, PhotoBottleSpec> = {
  small_350: {
    glass: require('@/assets/images/cabinet/bottles/small_350_glass.png'),
    liquids: {
      amber: require('@/assets/images/cabinet/bottles/small_350_amber.png'),
      clear: require('@/assets/images/cabinet/bottles/small_350_clear.png'),
      dark: require('@/assets/images/cabinet/bottles/small_350_dark.png'),
      red: require('@/assets/images/cabinet/bottles/small_350_red.png'),
    },
    halo: require('@/assets/images/cabinet/bottles/small_350_halo.png'),
    haloWidth: 290,
    haloHeight: 438,
    sourceWidth: 130,
    sourceHeight: 240,
    aspect: 0.5421,
    liquidTopFrac: 0.3421,
    liquidBaseFrac: 0.8579,
    labelTopFrac: 0.5526,
    labelBaseFrac: 0.7592,
    heightSrc: 103,
  },
  flask_500: {
    glass: require('@/assets/images/cabinet/bottles/flask_500_glass.png'),
    liquids: {
      amber: require('@/assets/images/cabinet/bottles/flask_500_amber.png'),
      clear: require('@/assets/images/cabinet/bottles/flask_500_clear.png'),
      dark: require('@/assets/images/cabinet/bottles/flask_500_dark.png'),
      red: require('@/assets/images/cabinet/bottles/flask_500_red.png'),
    },
    halo: require('@/assets/images/cabinet/bottles/flask_500_halo.png'),
    haloWidth: 291,
    haloHeight: 438,
    sourceWidth: 131,
    sourceHeight: 240,
    aspect: 0.547,
    liquidTopFrac: 0.293,
    liquidBaseFrac: 0.8767,
    labelTopFrac: 0.5629,
    labelBaseFrac: 0.7595,
    heightSrc: 120,
  },
  squat_750: {
    glass: require('@/assets/images/cabinet/bottles/squat_750_glass.png'),
    liquids: {
      amber: require('@/assets/images/cabinet/bottles/squat_750_amber.png'),
      clear: require('@/assets/images/cabinet/bottles/squat_750_clear.png'),
      dark: require('@/assets/images/cabinet/bottles/squat_750_dark.png'),
      red: require('@/assets/images/cabinet/bottles/squat_750_red.png'),
    },
    halo: require('@/assets/images/cabinet/bottles/squat_750_halo.png'),
    haloWidth: 273,
    haloHeight: 438,
    sourceWidth: 118,
    sourceHeight: 240,
    aspect: 0.4901,
    liquidTopFrac: 0.3452,
    liquidBaseFrac: 0.8651,
    labelTopFrac: null,
    labelBaseFrac: null,
    heightSrc: 133,
  },
  round_750: {
    glass: require('@/assets/images/cabinet/bottles/round_750_glass.png'),
    liquids: {
      amber: require('@/assets/images/cabinet/bottles/round_750_amber.png'),
      clear: require('@/assets/images/cabinet/bottles/round_750_clear.png'),
      dark: require('@/assets/images/cabinet/bottles/round_750_dark.png'),
      red: require('@/assets/images/cabinet/bottles/round_750_red.png'),
    },
    halo: require('@/assets/images/cabinet/bottles/round_750_halo.png'),
    haloWidth: 207,
    haloHeight: 438,
    sourceWidth: 69,
    sourceHeight: 240,
    aspect: 0.2889,
    liquidTopFrac: 0.2943,
    liquidBaseFrac: 0.9233,
    labelTopFrac: 0.4438,
    labelBaseFrac: 0.7049,
    heightSrc: 187,
  },
  longneck_1000: {
    glass: require('@/assets/images/cabinet/bottles/longneck_1000_glass.png'),
    liquids: {
      amber: require('@/assets/images/cabinet/bottles/longneck_1000_amber.png'),
      clear: require('@/assets/images/cabinet/bottles/longneck_1000_clear.png'),
      dark: require('@/assets/images/cabinet/bottles/longneck_1000_dark.png'),
      red: require('@/assets/images/cabinet/bottles/longneck_1000_red.png'),
    },
    halo: require('@/assets/images/cabinet/bottles/longneck_1000_halo.png'),
    haloWidth: 210,
    haloHeight: 438,
    sourceWidth: 71,
    sourceHeight: 240,
    aspect: 0.297,
    liquidTopFrac: 0.3297,
    liquidBaseFrac: 0.9135,
    labelTopFrac: null,
    labelBaseFrac: null,
    heightSrc: 193,
  },
  bitters_150: {
    glass: require('@/assets/images/cabinet/bottles/bitters_150_glass.png'),
    liquids: {
      amber: require('@/assets/images/cabinet/bottles/bitters_150_amber.png'),
      dark: require('@/assets/images/cabinet/bottles/bitters_150_dark.png'),
      red: require('@/assets/images/cabinet/bottles/bitters_150_red.png'),
    },
    halo: require('@/assets/images/cabinet/bottles/bitters_150_halo.png'),
    haloWidth: 200,
    haloHeight: 438,
    sourceWidth: 64,
    sourceHeight: 240,
    aspect: 0.2681,
    liquidTopFrac: 0.3182,
    liquidBaseFrac: 0.8928,
    labelTopFrac: 0.4534,
    labelBaseFrac: 0.6678,
    heightSrc: 92,
  },
}
/** 某瓶型 × 某酒色的液體層;那個瓶型沒做這個酒色時落回 amber(目前只有 bitters_150 沒有 clear) */
export function photoLiquidLayer(type: PhotoBottleType, colour: PhotoLiquidColour): ImageRequireSource {
  const liquids = CABINET_PHOTO_BOTTLES[type].liquids
  return liquids[colour] ?? liquids.amber
}
// 照片櫃的瓶子大小 = 五個容量級距(Brok 2026-09-20 拍板):150 / 350 / 500 / 750 / 1L,150 給 bitters 等小包裝。
// Edit Bottle 的 BOTTLE SIZE 選項不動(375 / 500 / 700 / 750 / 1L / 1.75L),由「取最接近的一級」吸收:
// 375 → 350、700 → 750、1.75L → 1L(代價:1.75L 畫成 1L 的瓶子)。Custom 同法(等距取小的),缺值 → 750。
export const PHOTO_SIZE_CLASSES_ML = [150, 350, 500, 750, 1000] as const
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
// ── CABINET-PHOTO Stage 4(三):層板名牌(sign board;Brok 手繪 IMG_5013,2026-09-23)──
// 數值取自 backend scripts/cabinet-images/processed/signs/sign_plate_r1.calibration.json(process_plate.py 產出),不得手改;
// 換牌子 = 重跑後整組替換,require 與數值同物件。牌子是不透明的實物:拍在瓶子的固定場景、去背成圓角矩形、套與 small_350 同高度的牆增益。
// 牌面本身空白,家族名由 app 刻上去:textField 是牌面空白區(飾框內側)在牌子上的位置(0–1),字要排在這裡面。
// fontFamily 必須等於 app/_layout.tsx useFonts 裡的名字(EB Garamond SemiBold,專案既有字型)。
// heightSrc:牌子在背景來源圖上的高度(px),同瓶子:色調校正照這個高度做,畫面上一律用這個高度。
export const CABINET_PHOTO_SIGN = {
  image: require('@/assets/images/cabinet/sign_plate_r1.png'),
  sourceWidth: 529,
  sourceHeight: 240,
  aspect: 2.2052,
  heightSrc: 100,
  textField: { left: 0.0871, right: 0.9129, top: 0.1921, bottom: 0.8166 },
  fontFamily: 'EBGaramond',
} as const
// 瓶子可用的最大高度(來源圖像素)= 最小層距 − 層板正面 − 層板底面;由量測值推導,不手寫
const CABINET_PHOTO_PITCHES = CABINET_PHOTO.shelfTopY.slice(1).map((y, i) => y - CABINET_PHOTO.shelfTopY[i])
export const CABINET_PHOTO_MAX_BOTTLE_SRC =
  Math.min(...CABINET_PHOTO_PITCHES) - CABINET_PHOTO.shelfFaceHeight - CABINET_PHOTO.shelfUndersideHeight
//
export default CabinetTokens
