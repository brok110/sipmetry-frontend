/**
 * pushNotifications.ts
 *
 * Registers an Expo push token with the backend after the user signs in.
 *
 * Design decisions:
 * - expo-notifications is dynamically imported (same pattern as lowStockNotifier.ts)
 *   so the module works gracefully in web/Expo Go without crashing.
 * - expo-device is not in the project's dependencies; instead we rely on the
 *   try-catch to swallow the error that getExpoPushTokenAsync throws on simulators.
 * - All failures are swallowed — push registration must never break sign-in.
 */

import Constants from 'expo-constants'
import { Platform } from 'react-native'
import type { Session } from '@supabase/supabase-js'
import { apiFetch } from '@/lib/api'
import { log, warn } from '@/lib/logger'

// EAS project ID from app.json → extra.eas.projectId
const PROJECT_ID: string | undefined =
  Constants.expoConfig?.extra?.eas?.projectId

/**
 * Request notification permission, obtain the Expo push token, and register
 * it with the backend. Silent on every failure path.
 *
 * @param session - Supabase session for the authenticated user
 */
export async function registerPushToken(session: Session): Promise<void> {
  try {
    // Dynamic import — gracefully returns null on web / Expo Go
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Notifications: any = await (
      eval('import("expo-notifications")') as Promise<any>
    ).catch(() => null)

    if (!Notifications) return

    // Request permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus: string = existingStatus

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }

    if (finalStatus !== 'granted') {
      log('[push] permission denied')
      return
    }

    // Android requires a default notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      })
    }

    // Obtain Expo push token (throws on simulators — caught below)
    if (!PROJECT_ID) {
      warn('[push] no projectId found in app.json extra.eas.projectId')
      return
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: PROJECT_ID,
    })

    // Register token with backend
    await apiFetch('/push/register', {
      session,
      method: 'POST',
      body: { token, platform: Platform.OS },
    })

    log('[push] token registered:', token)
  } catch (err: any) {
    // Simulator, permission denied, network error — all handled silently
    log('[push] registerPushToken skipped:', err?.message ?? err)
  }
}
