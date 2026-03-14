import { supabase } from '@/lib/supabase'
import { registerPushToken } from '@/lib/pushNotifications'
import type { Session, User } from '@supabase/supabase-js'
import React, { createContext, useContext, useEffect, useState } from 'react'

type AuthContextType = {
  user: User | null
  session: Session | null
  hydrated: boolean
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>
  signUpWithEmail: (email: string, password: string) => Promise<{ error: string | null }>
  signInWithApple: () => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [hydrated, setHydrated] = useState(false)

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)

      // 登入後自動註冊 push token（靜默失敗，不影響主流程）
      if (session?.access_token) {
        registerPushToken(session.access_token).catch(() => {})
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

  const signInWithGoogle = async () => {
    try {
      const { makeRedirectUri } = await import('expo-auth-session')
      const { openAuthSessionAsync } = await import('expo-web-browser')

      const redirectUri = makeRedirectUri({ scheme: 'sipmetry', path: 'auth/callback' })

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,
        },
      })

      if (error) return { error: error.message }
      if (!data.url) return { error: 'No OAuth URL' }

      const result = await openAuthSessionAsync(data.url, redirectUri)

      if (result.type === 'success') {
        const url = new URL(result.url)
        const code = url.searchParams.get('code')
        if (code) {
          await supabase.auth.exchangeCodeForSession(code)
        }
      }

      return { error: null }
    } catch (e: any) {
      return { error: e?.message ?? 'Google Sign-In failed' }
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{
      user, session, hydrated,
      signInWithEmail, signUpWithEmail,
      signInWithApple, signInWithGoogle,
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