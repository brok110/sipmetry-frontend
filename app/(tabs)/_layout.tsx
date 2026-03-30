import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs } from "expo-router";
import React, { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

import LowStockBanner from "@/components/LowStockBanner";
import { useClientOnlyValue } from "@/components/useClientOnlyValue";
import OaklandDusk from "@/constants/OaklandDusk";
import { useInventory } from "@/context/inventory";


// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

// Foreground scan: check inventory when app comes to foreground
function ForegroundInventoryScanner() {
  const { refreshInventory } = useInventory()
  const appState = useRef(AppState.currentState)

  const scanInventory = useCallback(async () => {
    try {
      await refreshInventory({ silent: true, notifyLowStock: true })
    } catch {
      // Non-critical
    }
  }, [refreshInventory])

  useEffect(() => {
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
  return (
    <>
      <Tabs
        initialRouteName="bartender"
        screenOptions={{
          tabBarActiveTintColor: OaklandDusk.brand.gold,
          tabBarInactiveTintColor: OaklandDusk.text.tertiary,
          tabBarStyle: {
            backgroundColor: OaklandDusk.bg.card,
            borderTopColor: OaklandDusk.bg.border,
            borderTopWidth: 1,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            letterSpacing: 0.5,
          },
          headerShown: useClientOnlyValue(false, true),
          headerStyle: {
            backgroundColor: OaklandDusk.bg.void,
          },
          headerTintColor: OaklandDusk.text.primary,
          headerTitleStyle: {
            color: OaklandDusk.text.primary,
          },
        }}
      >
        <Tabs.Screen
          name="bartender"
          options={{
            title: "Bartender",
            tabBarIcon: ({ color }) => <TabBarIcon name="glass" color={color} />,
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
          name="cart"
          options={{
            title: "Smart Restock",
            tabBarIcon: ({ color }) => <TabBarIcon name="shopping-cart" color={color} />,
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
          }}
        />
      </Tabs>
      <ForegroundInventoryScanner />
      <LowStockBanner />
    </>
  );
}
