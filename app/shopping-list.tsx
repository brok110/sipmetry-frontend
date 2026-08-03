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
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";

import { useAuth } from "@/context/auth";
import { useInventory } from "@/context/inventory";
import { apiFetch } from "@/lib/api";
import OaklandDusk from "@/constants/OaklandDusk";
import Type from "@/constants/typography";
import { R } from "@/constants/radius";

type ListItem = {
  id: string;
  ingredient_key: string;
  display_name: string | null;
  reason_iba_code: string | null;
  reason_name: string | null;
  source: "recipe" | "restock" | "manual";
  created_at: string;
  is_alcoholic: boolean;
};

export default function ShoppingListScreen() {
  const { session } = useAuth();
  const { inventory, refreshInventory } = useInventory();

  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // RESTOCK-REDESIGN S5(補名步):酒類勾銷時問實際買的瓶名。
  const [namingItem, setNamingItem] = useState<ListItem | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);

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

  const doCheck = useCallback(async (item: ListItem, displayName?: string, listOnly?: boolean): Promise<boolean> => {
    if (!session) return false;
    try {
      const payload: { display_name?: string; list_only?: boolean } = {};
      if (displayName?.trim()) payload.display_name = displayName.trim();
      if (listOnly) payload.list_only = true;
      const res = await apiFetch(`/shopping-list/${item.id}/check`, {
        session,
        method: "POST",
        ...(Object.keys(payload).length > 0 ? { body: payload } : {}),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      refreshInventory({ silent: true }).catch(() => {});
      return true;
    } catch {
      Alert.alert("Error", "Could not check this off. Please try again.");
      return false;
    }
  }, [session, refreshInventory]);

  // 3b-fix: confirm before the check-off writes to My Bar (replaces the
  // old post-hoc undo toast — Brok ruling 2026-07-28).
  // SHOP-LIST-4: non-alcoholic items get list-only copy — the backend gate
  // skips the inventory write, so the dialog must not promise My Bar.
  const handleCheckPress = useCallback((item: ListItem) => {
    if (item.is_alcoholic === false) {
      Alert.alert(
        `Check off ${itemName(item)}?`,
        "This clears it from your list. Juices and mixers aren't tracked in My Bar.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Check Off", onPress: () => doCheck(item) },
        ]
      );
      return;
    }
    // 酒類:先問買了哪支(酒櫃只管具名瓶 — Brok 拍板 2026-08-02)
    const owned = (inventory ?? []).find(
      (it) => String(it.ingredient_key || "").trim() === item.ingredient_key
    );
    const prefill = String(owned?.display_name || "").trim() || itemName(item);
    setNameInput(prefill);
    setNamingItem(item);
  }, [doCheck, inventory]);

  const confirmNaming = useCallback(async () => {
    if (!namingItem || saving) return;
    setSaving(true);
    const target = namingItem;
    const name = nameInput;
    try {
      await doCheck(target, name);
    } finally {
      setSaving(false);
      setNamingItem(null);
      setNameInput("");
    }
  }, [namingItem, nameInput, saving, doCheck]);

  // S5「Scan instead」:清單項以 list_only 記為已買(不入櫃),
  // 具名瓶交給掃描流寫進 My Bar —— 零重複、購買意圖訊號保留。
  const scanInstead = useCallback(async () => {
    if (!namingItem || saving) return;
    setSaving(true);
    const target = namingItem;
    try {
      const ok = await doCheck(target, undefined, true);
      if (!ok) return;
      setNamingItem(null);
      setNameInput("");
      router.push("/scan?autoScan=1");
    } finally {
      setSaving(false);
    }
  }, [namingItem, saving, doCheck]);

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

      {/* S5 補名步:酒類勾銷確認 + 實際買的瓶名 */}
      <Modal
        visible={namingItem !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setNamingItem(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setNamingItem(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={[Type.title, { color: OaklandDusk.text.primary }]}>What did you buy?</Text>
            <Text style={[Type.caption, { color: OaklandDusk.text.secondary }]}>
              This bottle lands in My Bar under the name you give it.
            </Text>

            <TextInput
              value={nameInput}
              onChangeText={setNameInput}
              placeholder={namingItem ? itemName(namingItem) : ""}
              placeholderTextColor={OaklandDusk.text.tertiary}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={confirmNaming}
              style={styles.modalInput}
            />

            <Pressable
              onPress={confirmNaming}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Add to My Bar"
              style={[styles.modalPrimary, saving && { opacity: 0.7 }]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={OaklandDusk.bg.void} />
              ) : (
                <Text style={[Type.button, { color: OaklandDusk.bg.void }]}>Add to My Bar</Text>
              )}
            </Pressable>

            <Pressable
              onPress={scanInstead}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Scan the bottle instead"
              style={styles.modalSecondary}
            >
              <FontAwesome name="camera" size={13} color={OaklandDusk.brand.gold} />
              <Text style={[Type.button, { color: OaklandDusk.brand.gold }]}>Scan</Text>
            </Pressable>

            <Pressable onPress={() => setNamingItem(null)} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={[Type.caption, { color: OaklandDusk.text.tertiary, textAlign: "center" }]}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: OaklandDusk.brand.gold,
  },
  rowText: { flex: 1, gap: 2 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    backgroundColor: OaklandDusk.bg.card,
    borderRadius: R.panel,
    padding: 22,
    width: "85%",
    maxWidth: 360,
    gap: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: OaklandDusk.bg.border,
    borderRadius: R.action,
    backgroundColor: OaklandDusk.bg.surface,
    paddingVertical: 11,
    paddingHorizontal: 13,
    fontSize: 15,
    color: OaklandDusk.text.primary,
    marginTop: 4,
  },
  modalSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(200,120,40,0.45)",
    borderRadius: R.action,
    paddingVertical: 12,
  },
  modalPrimary: {
    backgroundColor: OaklandDusk.brand.gold,
    borderRadius: R.action,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
});
