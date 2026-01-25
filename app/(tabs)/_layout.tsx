import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs } from "expo-router";
import React from "react";

import { useClientOnlyValue } from "@/components/useClientOnlyValue";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";

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

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <PreferencesProvider>
      <FavoritesProvider>
        <FeedbackProvider>
          <Tabs
            screenOptions={{
              tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
              headerShown: useClientOnlyValue(false, true),
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
  );
}