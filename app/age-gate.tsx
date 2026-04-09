import { markAgeVerified } from './_layout';
import OaklandDusk from '@/constants/OaklandDusk';
import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';
import { Picker } from '@react-native-picker/picker';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
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
// Constants
// ---------------------------------------------------------------------------
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1900 + 1 }, (_, i) => CURRENT_YEAR - i);
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const handleContinue = async () => {
    setInputError(null);

    if (selectedYear === null) {
      setInputError('Please select your birth year.');
      return;
    }
    if (selectedMonth === null) {
      setInputError('Please select your birth month.');
      return;
    }

    if (!isLegalAge(selectedYear, selectedMonth, legalAge)) {
      setBlocked(true);
      return;
    }

    // Passed — upsert profile and navigate
    setLoading(true);
    const { error } = await supabase.from('profiles').upsert({
      user_id: user!.id,
      birth_year: selectedYear,
      region_code: regionCode,
    });
    setLoading(false);

    if (error) {
      Alert.alert('Error', 'Failed to save your profile. Please try again.');
      return;
    }

    markAgeVerified();
    router.replace('/(tabs)/bartender');
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
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
            gap: 16,
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
              fontSize: 18,
              color: OaklandDusk.text.secondary,
              textAlign: 'center',
              lineHeight: 26,
            }}
          >
            We'll be here when you turn {legalAge}.
          </Text>
          <Text
            style={{
              fontSize: 18,
              color: OaklandDusk.text.secondary,
              textAlign: 'center',
            }}
          >
            See you then!
          </Text>
          <Pressable
            onPress={handleSignOut}
            style={{
              backgroundColor: OaklandDusk.bg.surface,
              borderRadius: 12,
              paddingVertical: 14,
              paddingHorizontal: 32,
              borderWidth: 1,
              borderColor: OaklandDusk.bg.border,
              marginTop: 8,
            }}
          >
            <Text style={{ color: OaklandDusk.text.secondary, fontWeight: '700' }}>
              Sign out
            </Text>
          </Pressable>
        </View>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // Normal state — age input form with dual dropdown pickers
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
          Enter your birth year and month to continue.
        </Text>

        {/* Dual dropdown row */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* Year picker */}
          <View style={{ flex: 1 }}>
            <Text style={{ color: OaklandDusk.text.tertiary, fontSize: 12, marginBottom: 6 }}>
              Year
            </Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: OaklandDusk.bg.border,
                borderRadius: 12,
                backgroundColor: OaklandDusk.bg.surface,
                overflow: 'hidden',
              }}
            >
              <Picker
                selectedValue={selectedYear}
                onValueChange={(value) => setSelectedYear(value)}
                style={{ color: OaklandDusk.text.primary, height: 180 }}
                itemStyle={{ color: OaklandDusk.text.primary, fontSize: 18 }}
              >
                <Picker.Item label="—" value={null} color={OaklandDusk.text.tertiary} />
                {YEARS.map((y) => (
                  <Picker.Item key={y} label={String(y)} value={y} />
                ))}
              </Picker>
            </View>
          </View>

          {/* Month picker */}
          <View style={{ flex: 1 }}>
            <Text style={{ color: OaklandDusk.text.tertiary, fontSize: 12, marginBottom: 6 }}>
              Month
            </Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: OaklandDusk.bg.border,
                borderRadius: 12,
                backgroundColor: OaklandDusk.bg.surface,
                overflow: 'hidden',
              }}
            >
              <Picker
                selectedValue={selectedMonth}
                onValueChange={(value) => setSelectedMonth(value)}
                style={{ color: OaklandDusk.text.primary, height: 180 }}
                itemStyle={{ color: OaklandDusk.text.primary, fontSize: 18 }}
              >
                <Picker.Item label="—" value={null} color={OaklandDusk.text.tertiary} />
                {MONTHS.map((name, i) => (
                  <Picker.Item key={i + 1} label={name} value={i + 1} />
                ))}
              </Picker>
            </View>
          </View>
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
