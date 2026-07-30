// app/shopping-list.tsx
// SHOP-LIST Stage 3a (rev 3b-fix): the shopping list screen, opened from
// the cart masthead's SHOPPING LIST button. Checking an item off asks for
// confirmation first, then calls the atomic backend endpoint (list row
// flips + a full default bottle lands in My Bar in one transaction).

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";

import { useAuth } from "@/context/auth";
import { useInventory } from "@/context/inventory";
import { apiFetch } from "@/lib/api";
import OaklandDusk from "@/constants/OaklandDusk";
import Type from "@/constants/typography";

type ListItem = {
  id: string;
  ingredient_key: string;
  display_name: string | null;
  reason_iba_code: string | null;
  reason_name: string | null;
  source: "recipe" | "restock" | "manual";
  created_at: string;
};

export default function ShoppingListScreen() {
  const { session } = useAuth();
  const { refreshInventory } = useInventory();

  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/shopping-list", { session });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load list");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      fetchList();
    }, [fetchList])
  );

  const itemName = (item: ListItem): string =>
    item.display_name || item.ingredient_key.replace(/_/g, " ");

  const doCheck = useCallback(async (item: ListItem) => {
    if (!session) return;
    try {
      const res = await apiFetch(`/shopping-list/${item.id}/check`, { session, method: "POST" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      refreshInventory({ silent: true }).catch(() => {});
    } catch {
      Alert.alert("Error", "Could not check this off. Please try again.");
    }
  }, [session, refreshInventory]);

  // 3b-fix: confirm before the check-off writes to My Bar (replaces the
  // old post-hoc undo toast — Brok ruling 2026-07-28).
  const handleCheckPress = useCallback((item: ListItem) => {
    Alert.alert(
      "Add to My Bar?",
      `Checking this off adds a full bottle of ${itemName(item)} to your bar.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Add to Bar", onPress: () => doCheck(item) },
      ]
    );
  }, [doCheck]);

  const handleRemove = useCallback(async (item: ListItem) => {
    if (!session) return;
    try {
      const res = await apiFetch(`/shopping-list/${item.id}`, { session, method: "DELETE" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch {
      Alert.alert("Error", "Could not remove this item.");
    }
  }, [session]);

  const reasonLine = (item: ListItem): string => {
    if (item.reason_name) return `for ${item.reason_name}`;
    if (item.source === "restock") return "low stock";
    return "added manually";
  };

  if (!session) {
    return <View style={styles.screen} />;
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollBody}>
        {loading && items.length === 0 && (
          <ActivityIndicator color={OaklandDusk.brand.gold} style={{ marginTop: 32 }} />
        )}

        {!loading && error && (
          <Text style={[Type.caption, styles.errorText]}>{error}</Text>
        )}

        {!loading && !error && items.length === 0 && (
          <View style={styles.emptyWrap}>
            <FontAwesome name="shopping-bag" size={40} color={OaklandDusk.text.tertiary} />
            <Text style={[Type.body, { color: OaklandDusk.text.secondary }]}>
              Nothing on your list yet.
            </Text>
            <Text style={[Type.caption, styles.emptyHint]}>
              Add missing bottles from recipes or restock suggestions.
            </Text>
          </View>
        )}

        {items.map((item) => (
          <View key={item.id} style={styles.row}>
            <Pressable
              onPress={() => handleCheckPress(item)}
              hitSlop={10}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: false }}
              accessibilityLabel={`Check off ${itemName(item)}`}
              style={styles.checkbox}
            />
            <View style={styles.rowText}>
              <Text style={[Type.body, { color: OaklandDusk.text.primary }]} numberOfLines={1}>
                {itemName(item)}
              </Text>
              <Text style={[Type.caption, { color: OaklandDusk.text.secondary }]} numberOfLines={1}>
                {reasonLine(item)}
              </Text>
            </View>
            <Pressable
              onPress={() => handleRemove(item)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${itemName(item)}`}
            >
              <FontAwesome name="times" size={16} color={OaklandDusk.text.tertiary} />
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: OaklandDusk.bg.void },
  scrollBody: { padding: 16, gap: 10, paddingBottom: 40 },
  errorText: { color: OaklandDusk.brand.sundown, textAlign: "center", marginTop: 24 },
  emptyWrap: { alignItems: "center", gap: 10, marginTop: 56, paddingHorizontal: 24 },
  emptyHint: { color: OaklandDusk.text.tertiary, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: OaklandDusk.bg.card,
    borderWidth: 1,
    borderColor: OaklandDusk.bg.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: OaklandDusk.brand.gold,
  },
  rowText: { flex: 1, gap: 2 },
});
