import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus, Pressable, Text, View } from "react-native";

import LowStockBanner from "@/components/LowStockBanner";
import { useClientOnlyValue } from "@/components/useClientOnlyValue";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import { LowStockAlertProvider, useLowStockAlert } from "@/context/lowStockAlert";
import { useAuth } from "@/context/auth";
import { scanAndNotifyAll } from "@/lib/lowStockNotifier";

import { EconomyProvider, useEconomy } from "../../context/economy";
import { FavoritesProvider } from "../../context/favorites";
import { FeedbackProvider } from "../../context/feedback";
import { LearnedPreferencesProvider } from "../../context/learnedPreferences";
import { PreferencesProvider } from "../../context/preferences";

// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

function TokenChip() {
  const router = useRouter();
  const { tokens } = useEconomy();

  return (
    <Pressable
      onPress={() => router.push("/(tabs)/favorites")}
      hitSlop={10}
      style={{
        marginRight: 12,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: "white",
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          backgroundColor: "#111",
        }}
      />
      <Text style={{ fontWeight: "900" }}>{tokens}</Text>
      <Text style={{ color: "#666", fontWeight: "700" }}>TOK</Text>
    </Pressable>
  );
}

// Foreground scan: check inventory when app comes to foreground
function ForegroundInventoryScanner() {
  const { session } = useAuth()
  const { showAlert } = useLowStockAlert()
  const appState = useRef(AppState.currentState)
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? ''

  const scanInventory = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const res = await fetch(`${apiUrl}/inventory`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      const items = Array.isArray(data.inventory) ? data.inventory : []
      await scanAndNotifyAll(items, { showAlert, session, apiUrl })
    } catch {
      // Non-critical
    }
  }, [session, apiUrl, showAlert])

  useEffect(() => {
    // Scan once on mount
    scanInventory()

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        scanInventory()
      }
      appState.current = next
    })
    return () => sub.remove()
  }, [scanInventory])

  return null
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <LowStockAlertProvider>
    <EconomyProvider>
      <PreferencesProvider>
        <LearnedPreferencesProvider>
          <FavoritesProvider>
            <FeedbackProvider>
            <Tabs
              screenOptions={{
                tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
                headerShown: useClientOnlyValue(false, true),
                headerRight: () => <TokenChip />,
              }}
            >
              <Tabs.Screen
                name="scan"
                options={{
                  title: "Scan",
                  tabBarIcon: ({ color }) => <TabBarIcon name="camera" color={color} />,
                }}
              />

              <Tabs.Screen
                name="recipe"
                options={{
                  title: "Recipe",
                  headerShown: false,
                  tabBarIcon: ({ color }) => <TabBarIcon name="glass" color={color} />,
                }}
              />

              <Tabs.Screen
                name="favorites"
                options={{
                  title: "Favorites",
                  tabBarIcon: ({ color }) => <TabBarIcon name="heart" color={color} />,
                }}
              />

              <Tabs.Screen
                name="inventory"
                options={{
                  title: "My Bar",
                  tabBarIcon: ({ color }) => <TabBarIcon name="archive" color={color} />,
                }}
              />

              <Tabs.Screen
                name="prefs"
                options={{
                  title: "Preferences",
                  tabBarIcon: ({ color }) => <TabBarIcon name="sliders" color={color} />,
                }}
              />

              <Tabs.Screen
                name="qr"
                options={{
                  href: null,
                }}
              />

              <Tabs.Screen
                name="index"
                options={{
                  href: null,
                }}
              />
            </Tabs>
            <ForegroundInventoryScanner />
            <LowStockBanner />
            </FeedbackProvider>
          </FavoritesProvider>
        </LearnedPreferencesProvider>
      </PreferencesProvider>
    </EconomyProvider>
    </LowStockAlertProvider>
  );
}
