import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

const ONBOARDING_STORAGE_KEY = "sipmetry_onboarding_complete";

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const done = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
        if (!alive) return;
        if (done === "true") {
          router.replace("/(tabs)/bartender");
          return;
        }
        router.replace("/onboarding");
      } catch {
        if (!alive) return;
        router.replace("/onboarding");
      }
    })();

    return () => {
      alive = false;
    };
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator size="small" color="#111" />
    </View>
  );
}
