import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import OaklandDusk from '@/constants/OaklandDusk';
import { supabase } from '@/lib/supabase';
import { AuthProvider, useAuth } from '@/context/auth';
import { FavoritesProvider } from '@/context/favorites';
import { FeedbackProvider } from '@/context/feedback';
import { InteractionProvider } from '@/context/interactions';
import { InventoryProvider } from '@/context/inventory';
import { LearnedPreferencesProvider } from '@/context/learnedPreferences';
import { LowStockAlertProvider } from '@/context/lowStockAlert';
import { PreferencesProvider } from '@/context/preferences';
import { SoundService } from '@/lib/sounds';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://5746e03e9e4fd90e2a91437ead4be5a9@o4511090479792128.ingest.us.sentry.io/4511090491981824',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

export {
  ErrorBoundary
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default Sentry.wrap(function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <AuthProvider>
      <InteractionProvider>
      <PreferencesProvider>
      <LearnedPreferencesProvider>
      <FavoritesProvider>
      <FeedbackProvider>
      <LowStockAlertProvider>
      <InventoryProvider>
        <RootLayoutNav />
      </InventoryProvider>
      </LowStockAlertProvider>
      </FeedbackProvider>
      </FavoritesProvider>
      </LearnedPreferencesProvider>
      </PreferencesProvider>
      </InteractionProvider>
    </AuthProvider>
    </GestureHandlerRootView>
  );
});

let _setAgeVerified: ((v: boolean) => void) | null = null;
export function markAgeVerified() {
  _setAgeVerified?.(true);
}

function RootLayoutNav() {
  const { user, hydrated, isAnonymous } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  const [ageVerified, setAgeVerified] = useState<boolean | null>(null);
  _setAgeVerified = setAgeVerified;

  useEffect(() => {
    SoundService.preload();
    return () => { SoundService.unloadAll(); };
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const firstSegment = segments[0];
    const inAuthArea = firstSegment === '(tabs)' || firstSegment === 'scan' || firstSegment === 'recipe' || firstSegment === 'recommendations' || firstSegment === 'qr' || firstSegment === 'profile';

    if (!user && inAuthArea) {
      router.replace('/age-gate');
      return;
    }

    if (!user) return;

    // Logged in — check age verification
    if (ageVerified === null) {
      void (async () => {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('birth_year')
            .eq('user_id', user.id)
            .maybeSingle();
          if (error) throw error;
          setAgeVerified(!!data?.birth_year);
        } catch {
          setAgeVerified(false);
        }
      })();
      return;
    }

    if (!ageVerified && firstSegment !== 'age-gate') {
      router.replace('/age-gate');
    } else if (ageVerified && !isAnonymous && (firstSegment === 'login' || firstSegment === 'age-gate')) {
      // Only redirect away from login/age-gate if the user is fully registered.
      // Anonymous users need to be able to visit /login to upgrade their account.
      router.replace('/(tabs)/bartender');
    }
  }, [user, hydrated, segments, ageVerified]);

  // Reset ageVerified when user signs out and signs back in
  useEffect(() => {
    if (!user) setAgeVerified(null);
  }, [user]);

  const OaklandDuskNavTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary:      OaklandDusk.brand.gold,
      background:   OaklandDusk.bg.void,
      card:         OaklandDusk.bg.card,
      text:         OaklandDusk.text.primary,
      border:       OaklandDusk.bg.border,
      notification: OaklandDusk.brand.rust,
    },
  }

  return (
    <ThemeProvider value={OaklandDuskNavTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="scan"
          options={{
            title: 'Scan',
            headerShown: true,
            headerStyle: { backgroundColor: OaklandDusk.bg.void },
            headerTintColor: OaklandDusk.brand.gold,
            headerTitleStyle: { color: OaklandDusk.text.primary },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="recipe"
          options={{
            title: 'Recipe',
            headerShown: true,
            headerStyle: { backgroundColor: OaklandDusk.bg.void },
            headerTintColor: OaklandDusk.brand.gold,
            headerTitleStyle: { color: OaklandDusk.text.primary },
          }}
        />
        <Stack.Screen
          name="qr"
          options={{
            title: 'Share',
            headerShown: true,
            headerStyle: { backgroundColor: OaklandDusk.bg.void },
            headerTintColor: OaklandDusk.text.primary,
            headerTitleStyle: { color: OaklandDusk.text.primary },
          }}
        />
        <Stack.Screen
          name="recommendations"
          options={{
            title: 'Recommendations',
            headerShown: true,
            headerStyle: { backgroundColor: OaklandDusk.bg.void },
            headerTintColor: OaklandDusk.brand.gold,
            headerTitleStyle: { color: OaklandDusk.text.primary },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen name="profile/preferences" options={{
          title: 'Preferences',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <FontAwesome name="chevron-left" size={16} color={OaklandDusk.brand.gold} />
              <Text style={{ color: OaklandDusk.brand.gold, fontSize: 17 }}>Profile</Text>
            </Pressable>
          ),
        }} />
        <Stack.Screen name="profile/favorites" options={{
          title: 'Favorites',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <FontAwesome name="chevron-left" size={16} color={OaklandDusk.brand.gold} />
              <Text style={{ color: OaklandDusk.brand.gold, fontSize: 17 }}>Profile</Text>
            </Pressable>
          ),
        }} />
        <Stack.Screen name="profile/taste-dna" options={{
          title: 'Taste DNA',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <FontAwesome name="chevron-left" size={16} color={OaklandDusk.brand.gold} />
              <Text style={{ color: OaklandDusk.brand.gold, fontSize: 17 }}>Profile</Text>
            </Pressable>
          ),
        }} />
        <Stack.Screen name="age-gate" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
