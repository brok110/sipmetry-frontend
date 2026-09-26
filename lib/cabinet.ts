import type { InventoryItem } from '@/context/inventory'

// My Bar 資料層:family_key → 酒櫃的層、分組。
// INV-MODEL batch 4-FE-a:一瓶一張 — 渲染單位是瓶(item.bottles),列只提供 family_key / ingredient_key 身分。
// Stage 5(四)3b(Brok 2026-09-26):舊櫃的 8 類分法(多了 BRANDY、OTHERS)收掉,直接分成照片酒櫃的 6 層。

// 照片酒櫃固定 6 層,順序 = 由上到下
export const SHELF_ORDER = ['gin', 'vodka', 'rum', 'whiskey', 'tequila', 'liqueurs'] as const
export type ShelfId = typeof SHELF_ORDER[number]

// 家族 → 層:brandy 站 WHISKEY(決策 2)、mezcal 站 TEQUILA、cachaca 站 RUM(P1);*_liqueur 與 amaro 站 LIQUEURS。
// 後端 lib/restock-rails.js 的 photoShelfOf 是同一套,改一邊要改另一邊。
const FAMILY_TO_SHELF: Record<string, ShelfId> = {
  gin: 'gin', vodka: 'vodka', rum: 'rum', whiskey: 'whiskey', tequila: 'tequila',
  brandy: 'whiskey',
  mezcal: 'tequila',
  cachaca: 'rum',
}

/** 認得的家族才回層;沒有家族、或不認得的家族(soda、juice…)回 null */
export function knownShelfFor(familyKey: string | null): ShelfId | null {
  const f = String(familyKey ?? '').trim().toLowerCase()
  if (!f) return null
  if (FAMILY_TO_SHELF[f]) return FAMILY_TO_SHELF[f]
  if (f.endsWith('_liqueur') || f === 'amaro') return 'liqueurs'
  return null
}

/** 每支酒一定有一層:不認得的家族站 LIQUEURS(照片酒櫃沒有「其他」層) */
export function shelfFor(familyKey: string | null): ShelfId {
  return knownShelfFor(familyKey) ?? 'liqueurs'
}

export function isShelfId(value: string): value is ShelfId {
  return (SHELF_ORDER as readonly string[]).includes(value)
}

// 層在照片上的位置 0–5(照片櫃的量測座標、色表、名牌都以它為 key)。
// Record<ShelfId, PhotoShelfIndex>:漏掉任何一層或給出 0–5 以外的值,tsc 直接報錯。
export type PhotoShelfIndex = 0 | 1 | 2 | 3 | 4 | 5
const PHOTO_SHELF_INDEX: Record<ShelfId, PhotoShelfIndex> = {
  gin: 0,
  vodka: 1,
  rum: 2,
  whiskey: 3,
  tequila: 4,
  liqueurs: 5,
}
export function photoShelfIndexFor(shelfId: ShelfId): PhotoShelfIndex {
  return PHOTO_SHELF_INDEX[shelfId]
}

// 以 id 決定的穩定 hash(djb2):照片瓶的瓶型與間距都由 bottleId 導出,同一支酒永遠長一樣、放一樣。
// Stage 5(四)自舊櫃的 BottleGlyph.tsx 原樣搬來(量測工具 applogic.py 的 hash_id 是它的鏡射)。
export function hashId(id: string): number {
  let h = 5381
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

// 低量判定與 My Bar 卡片的 isLow 同式:Math.round(remaining_pct) < 20
export function isLowStockPct(remainingPct: number): boolean {
  return Math.round(Number(remainingPct)) < 20
}

// 渲染單位:一瓶一 glyph。pct 逐瓶算(remaining_volume / total_ml);
// isBlind 沿用父列 ingredient_key;glyph 外形 hash 改吃 bottleId(每支
// 瓶身從此獨立;既有瓶一次性換形 = 已知行為)。
export type BottleUnit = {
  bottleId: string
  itemId: string
  ingredientKey: string
  pct: number
  isLow: boolean
  totalMl: number | null
}

export function bottleUnitsFor(item: InventoryItem): BottleUnit[] {
  const bottles = Array.isArray(item.bottles) ? item.bottles : []
  if (bottles.length === 0) {
    // 防禦回退:response 過渡態(POST/PATCH item 不帶 bottles)→ 以列
    // aggregate 充當一瓶,畫面不空;靜默刷新落地後被真瓶列取代。
    const pct = Number(item.remaining_pct)
    return [{
      bottleId: item.id,
      itemId: item.id,
      ingredientKey: item.ingredient_key,
      pct,
      isLow: isLowStockPct(pct),
      totalMl: Number.isFinite(Number(item.total_ml)) ? Number(item.total_ml) : null,
    }]
  }
  return bottles.map((b) => {
    const pct = b.total_ml > 0 ? (b.remaining_volume / b.total_ml) * 100 : 0
    return {
      bottleId: b.id,
      itemId: item.id,
      ingredientKey: item.ingredient_key,
      pct,
      isLow: isLowStockPct(pct),
      totalMl: Number.isFinite(Number(b.total_ml)) ? Number(b.total_ml) : null,
    }
  })
}

// 分組:6 層都有 entry(空層照樣畫、寫 + ADD);層內排序 pct 升冪(最少的靠左)
export function groupBottlesByShelf(items: InventoryItem[]): Map<ShelfId, BottleUnit[]> {
  const map = new Map<ShelfId, BottleUnit[]>()
  for (const shelfId of SHELF_ORDER) map.set(shelfId, [])
  for (const item of items) {
    const shelf = shelfFor(item.family_key)
    for (const unit of bottleUnitsFor(item)) map.get(shelf)!.push(unit)
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.pct - b.pct)
  }
  return map
}
