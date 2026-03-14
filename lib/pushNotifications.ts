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

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? ''

// EAS project ID from app.json → extra.eas.projectId
const PROJECT_ID: string | undefined =
  Constants.expoConfig?.extra?.eas?.projectId

/**
 * Request notification permission, obtain the Expo push token, and register
 * it with the backend. Silent on every failure path.
 *
 * @param authToken - Supabase session access_token for the authenticated user
 */
export async function registerPushToken(authToken: string): Promise<void> {
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
      console.log('[push] permission denied')
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
      console.warn('[push] no projectId found in app.json extra.eas.projectId')
      return
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: PROJECT_ID,
    })

    // Register token with backend
    await fetch(`${API_URL}/push/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token, platform: Platform.OS }),
    })

    console.log('[push] token registered:', token)
  } catch (err: any) {
    // Simulator, permission denied, network error — all handled silently
    console.log('[push] registerPushToken skipped:', err?.message ?? err)
  }
}
