import { supabase } from '@/lib/supabase'
import { registerPushToken } from '@/lib/pushNotifications'
import type { Session, User } from '@supabase/supabase-js'
import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'

type AuthContextType = {
  user: User | null
  session: Session | null
  hydrated: boolean
  isAnonymous: boolean
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>
  signUpWithEmail: (email: string, password: string) => Promise<{ error: string | null }>
  signInWithApple: () => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  signInAnonymously: () => Promise<{ user: User | null; error: string | null }>
  upgradeWithEmail: (email: string, password: string) => Promise<{ error: string | null }>
  upgradeWithApple: () => Promise<{ error: string | null }>
  upgradeWithGoogle: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

// ---------------------------------------------------------------------------
// Module-level Google Sign-In configure helper — called once, then cached
// ---------------------------------------------------------------------------
let googleConfigured = false
async function configureGoogleSignIn() {
  if (googleConfigured) return
  const { GoogleSignin } = await import('@react-native-google-signin/google-signin')
  GoogleSignin.configure({
    iosClientId: '859363279694-fdp4lk3dv5jnvrdt7l95el98ra7tujhf.apps.googleusercontent.com',
    webClientId: '859363279694-v5oskujhnfuggpv54plnti6d8rrihf1f.apps.googleusercontent.com',
  })
  googleConfigured = true
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [hydrated, setHydrated] = useState(false)

  // Ref to read current user in onAuthStateChange without stale closure
  const userRef = useRef<User | null>(null)

  const isAnonymous = user?.is_anonymous ?? false

  useEffect(() => {
    userRef.current = user
  }, [user])

  useEffect(() => {
    // timeout 保護，避免 getSession 卡住導致畫面空白
    const timer = setTimeout(() => {
      setHydrated(true)
    }, 3000)

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timer)
      setSession(session)
      setUser(session?.user ?? null)
      setHydrated(true)
    }).catch(() => {
      clearTimeout(timer)
      setHydrated(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Read via ref to avoid stale closure (userRef tracks latest user)
      const wasAnonymous = userRef.current?.is_anonymous ?? false

      setSession(session)
      setUser(session?.user ?? null)

      // Detect anonymous session unexpectedly lost — data may be unrecoverable
      if (event === 'SIGNED_OUT' && wasAnonymous) {
        console.warn('[auth] Anonymous session lost — user data may be unrecoverable')
        // TODO: upgrade to Alert/toast when UX is confirmed
      }

      // 登入後自動註冊 push token（靜默失敗，不影響主流程）
      if (session?.access_token) {
        registerPushToken(session).catch(() => {})
      }
    })

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signUpWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    return { error: error?.message ?? null }
  }

  const signInWithApple = async () => {
    try {
      const { AppleAuthenticationScope, signInAsync } = await import('expo-apple-authentication')
      const credential = await signInAsync({
        requestedScopes: [
          AppleAuthenticationScope.FULL_NAME,
          AppleAuthenticationScope.EMAIL,
        ],
      })
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken!,
      })
      return { error: error?.message ?? null }
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return { error: null }
      return { error: e?.message ?? 'Apple Sign-In failed' }
    }
  }

  // Native ID token flow (replaces old signInWithOAuth + expo-web-browser redirect)
  const signInWithGoogle = async () => {
    try {
      await configureGoogleSignIn()
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin')

      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices()
      }

      const response = await GoogleSignin.signIn()
      if (!response.data?.idToken) {
        return { error: 'No ID token returned from Google' }
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: response.data.idToken,
      })
      return { error: error?.message ?? null }
    } catch (e: any) {
      if (e?.code === 'SIGN_IN_CANCELLED') return { error: null }
      return { error: e?.message ?? 'Google Sign-In failed' }
    }
  }

  // Returns the new user so age-gate can use it without a separate getUser() call
  const signInAnonymously = async () => {
    const { data, error } = await supabase.auth.signInAnonymously()
    return {
      user: data?.user ?? null,
      error: error?.message ?? null,
    }
  }

  // Scenario B: updateUser sends a confirmation email — is_anonymous stays true
  // until the user clicks the link. UI must show "check your inbox" state.
  const upgradeWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.updateUser({ email, password })
    return { error: error?.message ?? null }
  }

  const upgradeWithApple = async () => {
    try {
      const { AppleAuthenticationScope, signInAsync } = await import('expo-apple-authentication')
      const credential = await signInAsync({
        requestedScopes: [
          AppleAuthenticationScope.FULL_NAME,
          AppleAuthenticationScope.EMAIL,
        ],
      })

      const { error } = await supabase.auth.linkIdentity({
        provider: 'apple',
        token: credential.identityToken!,
      })
      return { error: error?.message ?? null }
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return { error: null }
      return { error: e?.message ?? 'Apple Sign-In upgrade failed' }
    }
  }

  const upgradeWithGoogle = async () => {
    try {
      await configureGoogleSignIn()
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin')

      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices()
      }

      const response = await GoogleSignin.signIn()
      if (!response.data?.idToken) {
        return { error: 'No ID token returned from Google' }
      }

      const { error } = await supabase.auth.linkIdentity({
        provider: 'google',
        token: response.data.idToken,
      })
      return { error: error?.message ?? null }
    } catch (e: any) {
      if (e?.code === 'SIGN_IN_CANCELLED') return { error: null }
      return { error: e?.message ?? 'Google Sign-In upgrade failed' }
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{
      user, session, hydrated,
      isAnonymous,
      signInWithEmail, signUpWithEmail,
      signInWithApple, signInWithGoogle,
      signInAnonymously,
      upgradeWithEmail, upgradeWithApple, upgradeWithGoogle,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
