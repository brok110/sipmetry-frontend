/**
 * lowStockNotifier.ts
 *
 * Handles low-stock detection, in-app banner triggering, and push notifications.
 * Push notifications require expo-notifications (native build). If the module is
 * not available, the function gracefully falls back to in-app banner only.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { LowStockAlertItem } from '@/context/lowStockAlert'

const PERMISSION_KEY = 'notifications_permission'
export const LOW_STOCK_THRESHOLD = 5   // % — trigger below this
const NOTIFY_COOLDOWN_DAYS = 7          // days between push notifications

export type NotifiableItem = {
  id: string
  display_name: string
  remaining_pct: number | string
  low_stock_notified_at: string | null
}

// ── Permission ────────────────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    // expo-notifications may not be installed; dynamic import gracefully fails
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Notifications: any = await (eval('import("expo-notifications")') as Promise<any>).catch(() => null)
    if (!Notifications) return false

    const cached = await AsyncStorage.getItem(PERMISSION_KEY)
    if (cached === 'denied') return false

    const { status: existing } = await Notifications.getPermissionsAsync()
    if (existing === 'granted') {
      await AsyncStorage.setItem(PERMISSION_KEY, 'granted')
      return true
    }

    const { status } = await Notifications.requestPermissionsAsync()
    const granted = status === 'granted'
    await AsyncStorage.setItem(PERMISSION_KEY, granted ? 'granted' : 'denied')
    return granted
  } catch {
    return false
  }
}

// ── Should notify? ────────────────────────────────────────────────────────────

export function shouldNotify(item: NotifiableItem): boolean {
  const pct = Number(item.remaining_pct)
  if (pct >= LOW_STOCK_THRESHOLD) return false
  if (!item.low_stock_notified_at) return true
  const daysSince =
    (Date.now() - new Date(item.low_stock_notified_at).getTime()) / 86_400_000
  return daysSince >= NOTIFY_COOLDOWN_DAYS
}

// ── Main: check item and notify if needed ─────────────────────────────────────

export async function checkAndNotify(
  item: NotifiableItem,
  options: {
    showAlert: (item: LowStockAlertItem) => void
    session: { access_token: string } | null
    apiUrl: string
  }
): Promise<void> {
  const pct = Math.round(Number(item.remaining_pct))
  if (!shouldNotify(item)) return

  // 1. Show in-app banner (always)
  options.showAlert({ id: item.id, name: item.display_name, pct })

  // 2. Attempt push notification (requires expo-notifications)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Notifications: any = await (eval('import("expo-notifications")') as Promise<any>).catch(() => null)
    if (Notifications) {
      const hasPermission = await requestNotificationPermission()
      if (hasPermission) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '🍾 Running low on stock',
            body: `${item.display_name} is at ${pct}% — time to restock!`,
            data: { inventoryId: item.id },
          },
          trigger: null, // send immediately
        })
      }
    }
  } catch {
    // Push failed silently; banner already shown
  }

  // 3. Mark notified on backend (prevents repeat notifications within cooldown)
  if (options.session?.access_token) {
    try {
      await fetch(`${options.apiUrl}/inventory/${item.id}/notified`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${options.session.access_token}` },
      })
    } catch {
      // Non-critical — next check will retry
    }
  }
}

// ── Scan all items (call when app foregrounds) ────────────────────────────────

export async function scanAndNotifyAll(
  items: NotifiableItem[],
  options: {
    showAlert: (item: LowStockAlertItem) => void
    session: { access_token: string } | null
    apiUrl: string
  }
): Promise<void> {
  for (const item of items) {
    await checkAndNotify(item, options)
  }
}
