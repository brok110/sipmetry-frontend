import { useAuth } from '@/context/auth'
import OaklandDusk from '@/constants/OaklandDusk'
import * as AppleAuthentication from 'expo-apple-authentication'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useState } from 'react'
import {
  Platform, Pressable, ScrollView,
  Text, TextInput, View
} from 'react-native'

export default function LoginScreen() {
  const router = useRouter()
  const { mode } = useLocalSearchParams<{ mode?: string }>()
  const {
    signInWithEmail, signUpWithEmail,
    signInWithApple, signInWithGoogle,
    isAnonymous,
    upgradeWithEmail, upgradeWithApple, upgradeWithGoogle,
  } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmationSent, setConfirmationSent] = useState(false)
  // When true, anonymous user wants to sign in to an existing account instead of upgrading.
  // Initialised from ?mode=signin so navigating with that param skips the create-account screen.
  const [forceSignIn, setForceSignIn] = useState(mode === 'signin')

  // Effective mode: upgrade only when anonymous AND not forcing sign-in
  const upgradeMode = isAnonymous && !forceSignIn

  const handleEmail = async () => {
    if (!email || !password) {
      setError('Please enter email and password.')
      return
    }
    setLoading(true)
    setError(null)

    try {
      if (upgradeMode) {
        // ── Anonymous upgrade via updateUser ──
        // Scenario B: is_anonymous stays true until confirmation email is clicked.
        // Show "check your inbox" state so the user knows to confirm.
        const { error } = await upgradeWithEmail(email, password)
        if (error) {
          setError(
            error.includes('already registered') || error.includes('already linked')
              ? 'This email is already registered. Try signing in instead.'
              : error
          )
          return
        }
        setConfirmationSent(true)
      } else if (isSignUp) {
        const { error } = await signUpWithEmail(email, password)
        if (error) { setError(error); return }
        setConfirmationSent(true)
      } else {
        const { error } = await signInWithEmail(email, password)
        if (error) { setError(error); return }
        // nav guard handles post-login navigation
      }
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleApple = async () => {
    setLoading(true)
    setError(null)
    const { error } = upgradeMode
      ? await upgradeWithApple()
      : await signInWithApple()
    setLoading(false)
    if (error) {
      setError(
        error.includes('already linked')
          ? 'This Apple ID is already linked to another account.'
          : error
      )
    }
    // Apple/Google upgrade via linkIdentity — is_anonymous flips immediately
    // nav guard handles post-upgrade navigation
  }

  const handleGoogle = async () => {
    setLoading(true)
    setError(null)
    const { error } = upgradeMode
      ? await upgradeWithGoogle()
      : await signInWithGoogle()
    setLoading(false)
    if (error) {
      setError(
        error.includes('already linked')
          ? 'This Google account is already linked to another account.'
          : error
      )
    }
    // nav guard handles post-upgrade/login navigation
  }

  return (
    <ScrollView
      style={{ backgroundColor: OaklandDusk.bg.void }}
      contentContainerStyle={{ padding: 24, gap: 16, paddingTop: 80 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontSize: 28, fontWeight: '900', color: OaklandDusk.brand.gold }}>Sipmetry</Text>

      {/* ── Confirmation / upgrade pending state ── */}
      {confirmationSent && (
        <>
          <View style={{ alignItems: 'center', paddingTop: 40, gap: 16 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: OaklandDusk.text.primary, textAlign: 'center' }}>
              Check your inbox
            </Text>
            <Text style={{ color: OaklandDusk.text.secondary, textAlign: 'center', lineHeight: 22 }}>
              We sent a confirmation link to{'\n'}
              <Text style={{ color: OaklandDusk.brand.gold, fontWeight: '600' }}>{email}</Text>
              {'\n\n'}
              {isAnonymous
                ? 'Tap the link to secure your account. You can keep using the app in the meantime.'
                : 'Tap the link in the email to activate your account.'}
            </Text>
          </View>

          <Pressable
            onPress={() => {
              setConfirmationSent(false)
              if (isAnonymous) {
                router.back()  // return to My Bar — anonymous session still active
              } else {
                setIsSignUp(false)
                setError(null)
              }
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
              {isAnonymous ? '← Back to My Bar' : 'Back to Sign In'}
            </Text>
          </Pressable>
        </>
      )}

      {/* ── Main form ── */}
      {!confirmationSent && (
        <>
          <Text style={{ color: OaklandDusk.text.secondary, marginBottom: 8 }}>
            {upgradeMode
              ? 'Create an account to keep your data safe'
              : isSignUp ? 'Create your account' : 'Sign in to continue'}
          </Text>

          {/* Email input */}
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

          {/* Password input */}
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

          {/* Primary action button */}
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
              {loading
                ? 'Loading...'
                : upgradeMode
                  ? 'Create Account'
                  : isSignUp ? 'Sign Up' : 'Sign In'}
            </Text>
          </Pressable>

          {/* Sign up / Sign in toggle */}
          {upgradeMode ? (
            // Anonymous upgrade mode: offer escape hatch to sign in to existing account
            <Pressable onPress={() => { setForceSignIn(true); setError(null) }}>
              <Text style={{ textAlign: 'center', color: OaklandDusk.text.secondary }}>
                Already registered?{' '}
                <Text style={{ color: OaklandDusk.brand.gold }}>Sign in instead</Text>
              </Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => {
              setIsSignUp(!isSignUp)
              if (forceSignIn) setForceSignIn(false)
              setError(null)
            }}>
              <Text style={{ textAlign: 'center', color: OaklandDusk.text.secondary }}>
                {isSignUp
                  ? <>{`Already have an account? `}<Text style={{ color: OaklandDusk.brand.gold }}>Sign in</Text></>
                  : <>{`Don't have an account? `}<Text style={{ color: OaklandDusk.brand.gold }}>Sign up</Text></>
                }
              </Text>
            </Pressable>
          )}

          {/* Divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: OaklandDusk.bg.border }} />
            <Text style={{ color: OaklandDusk.text.tertiary }}>or</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: OaklandDusk.bg.border }} />
          </View>

          {/* Sign in / upgrade with Apple */}
          {Platform.OS === 'ios' ? (
            <View style={{ borderWidth: 1, borderColor: OaklandDusk.bg.border, borderRadius: 12, overflow: 'hidden' }}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={
                  upgradeMode
                    ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                    : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                }
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={12}
                style={{ height: 50 }}
                onPress={handleApple}
              />
            </View>
          ) : null}

          {/* Sign in / upgrade with Google */}
          <Pressable
            onPress={handleGoogle}
            disabled={loading}
            style={{
              borderWidth: 1,
              borderColor: OaklandDusk.bg.border,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
              opacity: loading ? 0.6 : 1,
            }}
          >
            <Text style={{ color: OaklandDusk.text.primary, fontWeight: '600', fontSize: 16 }}>
              {isAnonymous ? 'Continue with Google' : 'Continue with Google'}
            </Text>
          </Pressable>

          {/* Back to My Bar — anonymous users only */}
          {isAnonymous && (
            <Pressable onPress={() => router.back()}>
              <Text style={{ textAlign: 'center', color: OaklandDusk.text.secondary, marginTop: 8 }}>
                ← Back to My Bar
              </Text>
            </Pressable>
          )}
        </>
      )}

    </ScrollView>
  )
}
