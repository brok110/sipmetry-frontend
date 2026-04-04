import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import OaklandDusk from "@/constants/OaklandDusk";

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(tabs)/bartender");
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: OaklandDusk.bg.void }}>
      <ActivityIndicator size="small" color={OaklandDusk.brand.gold} />
    </View>
  );
}
