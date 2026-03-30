import OaklandDusk from "@/constants/OaklandDusk";
import { router } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

export default function BartenderScreen() {
  return (
    <View style={{
      flex: 1,
      backgroundColor: OaklandDusk.bg.void,
      justifyContent: "center",
      alignItems: "center",
      padding: 32,
    }}>
      <Text style={{
        fontSize: 28,
        fontWeight: "800",
        color: OaklandDusk.text.primary,
        marginBottom: 8,
      }}>
        What are you in the mood for?
      </Text>
      <Text style={{
        fontSize: 15,
        color: OaklandDusk.text.secondary,
        textAlign: "center",
        marginBottom: 32,
        lineHeight: 22,
      }}>
        Your bartender is getting ready.{"\n"}
        For now, head to My Bar to see what you can make.
      </Text>
      <Pressable
        onPress={() => router.push("/(tabs)/inventory")}
        style={{
          backgroundColor: OaklandDusk.brand.gold,
          paddingVertical: 14,
          paddingHorizontal: 32,
          borderRadius: 12,
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: "700", color: OaklandDusk.bg.void }}>
          Go to My Bar
        </Text>
      </Pressable>
    </View>
  );
}
