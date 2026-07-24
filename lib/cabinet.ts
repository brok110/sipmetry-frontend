import type { InventoryItem } from '@/context/inventory'

// CABINET-3A 資料層:family_key → 貨架的映射與分組。
// INV-MODEL batch 4-FE-a:一瓶一 glyph — 渲染單位從 inventory 列改為瓶
// (item.bottles),列僅提供 family_key / ingredient_key 身分。

// 貨架 id 順序即渲染順序(P2);空層不渲染
export const SHELF_ORDER = ['gin', 'vodka', 'rum', 'whiskey', 'tequila', 'brandy', 'liqueurs', 'others'] as const
export type ShelfId = typeof SHELF_ORDER[number]

const FAMILY_TO_SHELF: Record<string, ShelfId> = {
  gin: 'gin', vodka: 'vodka', rum: 'rum', whiskey: 'whiskey',
  tequila: 'tequila', brandy: 'brandy',
  mezcal: 'tequila',   // P1
  cachaca: 'rum',      // P1
}

export function shelfFor(familyKey: string | null): ShelfId {
  const f = String(familyKey ?? '').trim().toLowerCase()
  if (!f) return 'others'
  if (FAMILY_TO_SHELF[f]) return FAMILY_TO_SHELF[f]
  if (f.endsWith('_liqueur') || f === 'amaro') return 'liqueurs'
  return 'others'   // 未知 family 安全落點
}

export function isShelfId(value: string): value is ShelfId {
  return (SHELF_ORDER as readonly string[]).includes(value)
}

// 每層最多渲染 5 瓶,其餘以「+N」表示
export const MAX_VISIBLE_BOTTLES = 5

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
    }
  })
}

// 分組:每層都有 entry(空層由渲染端過濾);層內排序 pct 升冪(最少的靠左)
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
