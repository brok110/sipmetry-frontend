import type { InventoryItem } from '@/context/inventory'

// CABINET-3A 資料層:family_key → 貨架的映射與分組。
// 一 key 一列 = 畫面上一瓶,直接渲染現行 inventory 資料模型。

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

// 分組:每層都有 entry(空層由渲染端過濾);層內排序 remaining_pct 升冪(最少的靠左)
export function groupInventoryByShelf(items: InventoryItem[]): Map<ShelfId, InventoryItem[]> {
  const map = new Map<ShelfId, InventoryItem[]>()
  for (const shelfId of SHELF_ORDER) map.set(shelfId, [])
  for (const item of items) map.get(shelfFor(item.family_key))!.push(item)
  for (const list of map.values()) {
    list.sort((a, b) => Number(a.remaining_pct) - Number(b.remaining_pct))
  }
  return map
}
