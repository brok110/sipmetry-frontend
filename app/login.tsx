import { useAuth } from '@/context/auth'
import OaklandDusk from '@/constants/OaklandDusk'
import * as AppleAuthentication from 'expo-apple-authentication'
import React, { useState } from 'react'
import {
  Platform, Pressable, ScrollView,
  Text, TextInput, View
} from 'react-native'

export default function LoginScreen() {
  const { signInWithEmail, signUpWithEmail, signInWithApple } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmationSent, setConfirmationSent] = useState(false)

  const handleEmail = async () => {
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
    } else if (isSignUp) {
      setConfirmationSent(true)
    }
    // nav guard handles post-login navigation for sign in
  }

  const handleApple = async () => {
    setLoading(true)
    setError(null)
    const { error } = await signInWithApple()
    setLoading(false)
    if (error) setError(error)
    // nav guard handles post-login navigation
  }

  return (
    <ScrollView
      style={{ backgroundColor: OaklandDusk.bg.void }}
      contentContainerStyle={{ padding: 24, gap: 16, paddingTop: 80 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontSize: 28, fontWeight: '900', color: OaklandDusk.brand.gold }}>Sipmetry</Text>

      {confirmationSent && (
        <>
          <View style={{ alignItems: 'center', paddingTop: 40, gap: 16 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: OaklandDusk.text.primary, textAlign: 'center' }}>
              Check your inbox
            </Text>
            <Text style={{ color: OaklandDusk.text.secondary, textAlign: 'center', lineHeight: 22 }}>
              We sent a confirmation link to{'\n'}
              <Text style={{ color: OaklandDusk.brand.gold, fontWeight: '600' }}>{email}</Text>
              {'\n\n'}Tap the link in the email to activate your account.
            </Text>
          </View>

          <Pressable
            onPress={() => {
              setConfirmationSent(false)
              setIsSignUp(false)
              setError(null)
            }}
            style={{
              borderWidth: 1,
              borderColor: OaklandDusk.bg.border,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
              marginTop: 24,
            }}
          >
            <Text style={{ color: OaklandDusk.brand.gold, fontWeight: '600' }}>
              Back to Sign In
            </Text>
          </Pressable>
        </>
      )}

      {!confirmationSent && (
        <>
      <Text style={{ color: OaklandDusk.text.secondary, marginBottom: 8 }}>
        {isSignUp ? 'Create your account' : 'Sign in to continue'}
      </Text>

      {/* 1. Email input */}
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={OaklandDusk.text.tertiary}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{
          borderWidth: 1,
          borderColor: OaklandDusk.bg.border,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          backgroundColor: OaklandDusk.bg.surface,
          color: OaklandDusk.text.primary,
        }}
      />

      {/* 1. Password input */}
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={OaklandDusk.text.tertiary}
        secureTextEntry
        style={{
          borderWidth: 1,
          borderColor: OaklandDusk.bg.border,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          backgroundColor: OaklandDusk.bg.surface,
          color: OaklandDusk.text.primary,
        }}
      />

      {error ? (
        <Text style={{ color: OaklandDusk.semantic.error }}>{error}</Text>
      ) : null}

      {/* 2. Sign In button */}
      <Pressable
        onPress={handleEmail}
        disabled={loading}
        style={{
          backgroundColor: OaklandDusk.brand.gold,
          borderRadius: 12,
          paddingVertical: 14,
          alignItems: 'center',
          opacity: loading ? 0.6 : 1,
        }}
      >
        <Text style={{ color: OaklandDusk.bg.void, fontWeight: '800' }}>
          {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
        </Text>
      </Pressable>

      {/* 4. Sign up / Sign in toggle */}
      <Pressable onPress={() => setIsSignUp(!isSignUp)}>
        <Text style={{ textAlign: 'center', color: OaklandDusk.text.secondary }}>
          {isSignUp
            ? <>Already have an account? <Text style={{ color: OaklandDusk.brand.gold }}>Sign in</Text></>
            : <>Don't have an account? <Text style={{ color: OaklandDusk.brand.gold }}>Sign up</Text></>
          }
        </Text>
      </Pressable>

      {/* Divider */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: OaklandDusk.bg.border }} />
        <Text style={{ color: OaklandDusk.text.tertiary }}>or</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: OaklandDusk.bg.border }} />
      </View>

      {/* 3. Sign in with Apple */}
      {Platform.OS === 'ios' ? (
        <View style={{ borderWidth: 1, borderColor: OaklandDusk.bg.border, borderRadius: 12, overflow: 'hidden' }}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={{ height: 50 }}
            onPress={handleApple}
          />
        </View>
      ) : null}
        </>
      )}

    </ScrollView>
  )
}
