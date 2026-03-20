import 'react-native-gesture-handler'
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';
import 'react-native-reanimated';

import OaklandDusk from '@/constants/OaklandDusk';
import { AuthProvider, useAuth } from '@/context/auth';
import { FavoritesProvider } from '@/context/favorites';
import { FeedbackProvider } from '@/context/feedback';
import { InteractionProvider } from '@/context/interactions';
import { InventoryProvider } from '@/context/inventory';
import { LearnedPreferencesProvider } from '@/context/learnedPreferences';
import { LowStockAlertProvider } from '@/context/lowStockAlert';
import { PreferencesProvider } from '@/context/preferences';

export {
  ErrorBoundary
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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
}

function RootLayoutNav() {
  const { user, hydrated } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!hydrated) return;
    const firstSegment = segments[0];
    const inAuthArea = firstSegment === '(tabs)' || firstSegment === 'recipe' || firstSegment === 'qr' || firstSegment === 'profile';
    if (!user && inAuthArea) {
      router.replace('/login');
    } else if (user && firstSegment === 'login') {
      router.replace('/(tabs)/scan');
    }
  }, [user, hydrated, segments]);

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
          name="recipe"
          options={{
            title: 'Recipe',
            headerShown: true,
            headerBackVisible: false,
            headerStyle: { backgroundColor: OaklandDusk.bg.void },
            headerTintColor: OaklandDusk.text.primary,
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
        <Stack.Screen name="profile/preferences" options={{
          title: 'Preferences',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <FontAwesome name="chevron-left" size={16} color="#007AFF" />
              <Text style={{ color: '#007AFF', fontSize: 17 }}>Profile</Text>
            </Pressable>
          ),
        }} />
        <Stack.Screen name="profile/favorites" options={{
          title: 'Favorites',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <FontAwesome name="chevron-left" size={16} color="#007AFF" />
              <Text style={{ color: '#007AFF', fontSize: 17 }}>Profile</Text>
            </Pressable>
          ),
        }} />
        <Stack.Screen name="profile/taste-dna" options={{
          title: 'Taste DNA',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <FontAwesome name="chevron-left" size={16} color="#007AFF" />
              <Text style={{ color: '#007AFF', fontSize: 17 }}>Profile</Text>
            </Pressable>
          ),
        }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
