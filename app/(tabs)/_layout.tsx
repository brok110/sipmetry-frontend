import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs } from "expo-router";
import React, { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

import LowStockBanner from "@/components/LowStockBanner";
import { useClientOnlyValue } from "@/components/useClientOnlyValue";
import Colors from "@/constants/Colors";
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
        initialRouteName="scan"
        screenOptions={{
          tabBarActiveTintColor: Colors['dark'].tint,
          tabBarInactiveTintColor: Colors['dark'].tabIconDefault,
          tabBarStyle: {
            backgroundColor: '#100C18',
            borderTopColor: '#251810',
            borderTopWidth: 1,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            letterSpacing: 0.5,
          },
          headerShown: useClientOnlyValue(false, true),
          headerStyle: {
            backgroundColor: '#08070C',
          },
          headerTintColor: '#F0E4C8',
          headerTitleStyle: {
            color: '#F0E4C8',
          },
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
