import { useAuth } from '@/context/auth'
import { log } from '@/lib/logger'
import * as AppleAuthentication from 'expo-apple-authentication'
import { useRouter } from 'expo-router'
import React, { useState } from 'react'
import {
  Platform, Pressable, ScrollView,
  Text, TextInput, View
} from 'react-native'

export default function LoginScreen() {
  const { signInWithEmail, signUpWithEmail, signInWithApple, signInWithGoogle } = useAuth()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleEmail = async () => {
    // 先測試基本網路
    try {
      const r = await fetch('https://cuvkwqtdmzlcpidj.supabase.co/auth/v1/health')
      log('[fetch test] status:', r.status)
      const t = await r.text()
      log('[fetch test] body:', t.slice(0, 100))
    } catch (e: any) {
      log('[fetch test] FAILED:', e?.message)
    }

    if (!email || !password) {
      setError('Please enter email and password.')
      return
    }
    setLoading(true)
    setError(null)

    const fn = isSignUp ? signUpWithEmail : signInWithEmail
    const { error } = await fn(email, password)

    setLoading(false)
    if (error) {
      setError(error)
    } else {
      router.replace('/(tabs)/scan')
    }
  }

  const handleApple = async () => {
    setLoading(true)
    setError(null)
    const { error } = await signInWithApple()
    setLoading(false)
    if (error) setError(error)
    else router.replace('/(tabs)/scan')
  }

  const handleGoogle = async () => {
    setLoading(true)
    setError(null)
    const { error } = await signInWithGoogle()
    setLoading(false)
    if (error) setError(error)
    else router.replace('/(tabs)/scan')
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16, paddingTop: 80 }}>
      <Text style={{ fontSize: 28, fontWeight: '900' }}>Sipmetry</Text>
      <Text style={{ color: '#555', marginBottom: 8 }}>
        {isSignUp ? 'Create your account' : 'Sign in to continue'}
      </Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        style={{
          borderWidth: 1, borderRadius: 12,
          paddingHorizontal: 14, paddingVertical: 12,
        }}
      />

      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        style={{
          borderWidth: 1, borderRadius: 12,
          paddingHorizontal: 14, paddingVertical: 12,
        }}
      />

      {error ? (
        <Text style={{ color: '#B00020' }}>{error}</Text>
      ) : null}

      <Pressable
        onPress={handleEmail}
        disabled={loading}
        style={{
          backgroundColor: '#111', borderRadius: 12,
          paddingVertical: 14, alignItems: 'center',
          opacity: loading ? 0.6 : 1,
        }}
      >
        <Text style={{ color: 'white', fontWeight: '900' }}>
          {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
        </Text>
      </Pressable>

      <Pressable onPress={() => setIsSignUp(!isSignUp)}>
        <Text style={{ textAlign: 'center', color: '#555' }}>
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </Text>
      </Pressable>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: '#DDD' }} />
        <Text style={{ color: '#999' }}>or</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: '#DDD' }} />
      </View>

      {Platform.OS === 'ios' ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={{ height: 50 }}
          onPress={handleApple}
        />
      ) : null}

      <Pressable
        onPress={handleGoogle}
        disabled={loading}
        style={{
          borderWidth: 1, borderRadius: 12,
          paddingVertical: 14, alignItems: 'center',
        }}
      >
        <Text style={{ fontWeight: '800' }}>Continue with Google</Text>
      </Pressable>
    </ScrollView>
  )
}