import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import { Text, View } from "react-native";

// Stage 11: Smart Restock — full implementation exists but hidden during development.
// See git history or search for "restock-suggestions" to restore.

export default function CartScreen() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 16 }}>
      <FontAwesome name="shopping-cart" size={48} color="#ccc" />
      <Text style={{ fontSize: 20, fontWeight: "900", color: "#333" }}>Shopping Cart</Text>
      <Text style={{ color: "#888", textAlign: "center" }}>
        Coming soon — smart restock suggestions based on your favorites.
      </Text>
    </View>
  );
}
