import OaklandDusk from '@/constants/OaklandDusk';
import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Drinking age map — region codes (ISO 3166-1 alpha-2) → minimum legal age
// ---------------------------------------------------------------------------
const DRINKING_AGE: Record<string, number> = {
  US: 21,
  JP: 20,
};
const DEFAULT_DRINKING_AGE = 18;

function getLegalAge(regionCode: string): number {
  return DRINKING_AGE[regionCode] ?? DEFAULT_DRINKING_AGE;
}

// ---------------------------------------------------------------------------
// Age check: returns true when the person is at or above legalAge
// Month is 1-indexed (January = 1)
// ---------------------------------------------------------------------------
function isLegalAge(birthYear: number, birthMonth: number, legalAge: number): boolean {
  const now = new Date();
  const age = now.getFullYear() - birthYear;
  if (age > legalAge) return true;
  if (age < legalAge) return false;
  return now.getMonth() + 1 >= birthMonth;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AgeGateScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  // Extract region code from locale string (e.g. "en-US" → "US")
  const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
  const regionCode = locale.split('-').pop()?.toUpperCase() ?? 'US';
  const legalAge = getLegalAge(regionCode);

  const currentYear = new Date().getFullYear();

  const [yearText, setYearText] = useState('');
  const [month, setMonth] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const handleContinue = async () => {
    setInputError(null);

    const birthYear = parseInt(yearText, 10);
    if (
      isNaN(birthYear) ||
      birthYear < 1900 ||
      birthYear > currentYear
    ) {
      setInputError('Please enter a valid birth year (YYYY).');
      return;
    }
    if (month === null) {
      setInputError('Please select your birth month.');
      return;
    }

    if (!isLegalAge(birthYear, month, legalAge)) {
      setBlocked(true);
      return;
    }

    // Passed — upsert profile and navigate
    setLoading(true);
    await supabase.from('profiles').upsert({
      user_id: user!.id,
      birth_year: birthYear,
      region_code: regionCode,
    });
    setLoading(false);

    router.replace('/(tabs)/bartender');
  };

  // -------------------------------------------------------------------------
  // Blocked state — underage user
  // -------------------------------------------------------------------------
  if (blocked) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View
          style={{
            flex: 1,
            backgroundColor: OaklandDusk.bg.void,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
            gap: 24,
          }}
        >
          <Text
            style={{
              fontSize: 28,
              fontWeight: '900',
              color: OaklandDusk.brand.gold,
              textAlign: 'center',
            }}
          >
            Sipmetry
          </Text>
          <Text
            style={{
              fontSize: 20,
              fontWeight: '700',
              color: OaklandDusk.semantic.error,
              textAlign: 'center',
            }}
          >
            Come back when you're {legalAge}!
          </Text>
          <Pressable
            onPress={() => signOut()}
            style={{
              backgroundColor: OaklandDusk.bg.surface,
              borderRadius: 12,
              paddingVertical: 14,
              paddingHorizontal: 32,
              borderWidth: 1,
              borderColor: OaklandDusk.bg.border,
            }}
          >
            <Text style={{ color: OaklandDusk.text.secondary, fontWeight: '700' }}>
              Sign Out
            </Text>
          </Pressable>
        </View>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // Normal state — age input form
  // -------------------------------------------------------------------------
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={{ backgroundColor: OaklandDusk.bg.void }}
        contentContainerStyle={{ padding: 24, gap: 16, paddingTop: 80 }}
      >
        <Text style={{ fontSize: 28, fontWeight: '900', color: OaklandDusk.brand.gold }}>
          Sipmetry
        </Text>
        <Text style={{ fontSize: 22, fontWeight: '800', color: OaklandDusk.text.primary }}>
          Verify your age
        </Text>
        <Text style={{ color: OaklandDusk.text.secondary, marginBottom: 8 }}>
          Sipmetry is for legal drinking age. Enter your birth year and month.
        </Text>

        {/* Birth year input */}
        <TextInput
          value={yearText}
          onChangeText={setYearText}
          placeholder="Birth year (YYYY)"
          placeholderTextColor={OaklandDusk.text.tertiary}
          keyboardType="number-pad"
          maxLength={4}
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

        {/* Birth month picker (1–12) */}
        <Text style={{ color: OaklandDusk.text.secondary, marginTop: 4 }}>
          Birth month
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMonth(m)}
              style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: month === m ? OaklandDusk.brand.gold : OaklandDusk.bg.border,
                backgroundColor: month === m ? OaklandDusk.brand.gold : OaklandDusk.bg.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  color: month === m ? OaklandDusk.bg.void : OaklandDusk.text.primary,
                  fontWeight: '700',
                }}
              >
                {m}
              </Text>
            </Pressable>
          ))}
        </View>

        {inputError ? (
          <Text style={{ color: OaklandDusk.semantic.error }}>{inputError}</Text>
        ) : null}

        <Pressable
          onPress={handleContinue}
          disabled={loading}
          style={{
            backgroundColor: OaklandDusk.brand.gold,
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: 'center',
            marginTop: 8,
            opacity: loading ? 0.6 : 1,
          }}
        >
          <Text style={{ color: OaklandDusk.bg.void, fontWeight: '800' }}>
            {loading ? 'Verifying...' : 'Continue'}
          </Text>
        </Pressable>
      </ScrollView>
    </>
  );
}
