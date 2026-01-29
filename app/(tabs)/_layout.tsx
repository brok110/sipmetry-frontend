import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs, useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { useClientOnlyValue } from "@/components/useClientOnlyValue";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";

import { EconomyProvider, useEconomy } from "../../context/economy";
import { FavoritesProvider } from "../../context/favorites";
import { FeedbackProvider } from "../../context/feedback";
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
      onPress={() => router.push("/(tabs)/three")}
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

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <EconomyProvider>
      <PreferencesProvider>
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
                name="zero"
                options={{
                  title: "Prefs",
                  tabBarIcon: ({ color }) => <TabBarIcon name="sliders" color={color} />,
                }}
              />

              <Tabs.Screen
                name="index"
                options={{
                  title: "Scan",
                  tabBarIcon: ({ color }) => <TabBarIcon name="camera" color={color} />,
                }}
              />

              <Tabs.Screen
                name="two"
                options={{
                  title: "Recipe",
                  tabBarIcon: ({ color }) => <TabBarIcon name="glass" color={color} />,
                }}
              />

              <Tabs.Screen
                name="three"
                options={{
                  title: "Favorites",
                  tabBarIcon: ({ color }) => <TabBarIcon name="heart" color={color} />,
                }}
              />

              <Tabs.Screen
                name="four"
                options={{
                  title: "QR",
                  tabBarIcon: ({ color }) => <TabBarIcon name="qrcode" color={color} />,
                }}
              />
            </Tabs>
          </FeedbackProvider>
        </FavoritesProvider>
      </PreferencesProvider>
    </EconomyProvider>
  );
}