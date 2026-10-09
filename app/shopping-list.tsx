// app/shopping-list.tsx
// SHOP-LIST Stage 3a (rev 3b-fix): the shopping list screen, opened from
// the cart masthead's SHOPPING LIST button. Checking an item off asks for
// confirmation first, then calls the atomic backend endpoint (list row
// flips + a full default bottle lands in My Bar in one transaction).
// CARD-LIST-TIDY (2026-10-01): select first, then decide. Tapping a row
// selects it; a Select all bar sits under the header; once anything is
// selected a bottom bar offers Mark bought (n) / Remove (n), both behind a
// confirmation. One bottle bought still asks "What did you buy?"; several
// at once use the name already in My Bar (or the list name). The × button
// is gone; the right side shows the ingredient's library image, or a blank
// tile when there is none.

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  image_url?: string | null;
};

type BulkKind = "check" | "remove";

export default function ShoppingListScreen() {
  const { session } = useAuth();
  const { inventory, refreshInventory } = useInventory();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CARD-LIST-TIDY: selected row ids + a busy flag while a bulk action runs.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

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

  // Drop selections whose rows have left the list (checked off or removed).
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(items.map((i) => i.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const itemName = (item: ListItem): string =>
    item.display_name || item.ingredient_key.replace(/_/g, " ");

  // The name a bottle lands under: the one already used in My Bar for this
  // ingredient, else the list name. The check endpoint writes this name onto
  // the My Bar row, so sending it keeps an existing name (e.g. a brand) intact.
  const bottleNameFor = useCallback((item: ListItem): string => {
    const owned = (inventory ?? []).find(
      (it) => String(it.ingredient_key || "").trim() === item.ingredient_key
    );
    return String(owned?.display_name || "").trim() || itemName(item);
  }, [inventory]);

  const postCheck = useCallback(async (item: ListItem, displayName?: string, listOnly?: boolean): Promise<boolean> => {
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
      return res.ok;
    } catch {
      return false;
    }
  }, [session]);

  const deleteOne = useCallback(async (item: ListItem): Promise<boolean> => {
    if (!session) return false;
    try {
      const res = await apiFetch(`/shopping-list/${item.id}`, { session, method: "DELETE" });
      return res.ok;
    } catch {
      return false;
    }
  }, [session]);

  const doCheck = useCallback(async (item: ListItem, displayName?: string, listOnly?: boolean): Promise<boolean> => {
    const ok = await postCheck(item, displayName, listOnly);
    if (!ok) {
      Alert.alert("Error", "Could not check this off. Please try again.");
      return false;
    }
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    refreshInventory({ silent: true }).catch(() => {});
    return true;
  }, [postCheck, refreshInventory]);

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
    setNameInput(bottleNameFor(item));
    setNamingItem(item);
  }, [doCheck, bottleNameFor]);

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

  const toggleItem = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = items.length > 0 && selected.size === items.length;

  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));
  }, [allSelected, items]);

  // One request per row, in order; failures are counted and reported once.
  const runBulk = useCallback(async (kind: BulkKind, list: ListItem[]) => {
    if (bulkBusy || list.length === 0) return;
    setBulkBusy(true);
    let failed = 0;
    try {
      for (const item of list) {
        const ok =
          kind === "check"
            ? await postCheck(item, item.is_alcoholic === false ? undefined : bottleNameFor(item))
            : await deleteOne(item);
        if (!ok) failed += 1;
      }
    } finally {
      setSelected(new Set());
      await fetchList();
      if (kind === "check") refreshInventory({ silent: true }).catch(() => {});
      setBulkBusy(false);
    }
    if (failed > 0) {
      const verb = kind === "check" ? "marked as bought" : "removed";
      Alert.alert("Some items weren't updated", `${failed} of ${list.length} couldn't be ${verb}. Please try again.`);
    }
  }, [bulkBusy, postCheck, deleteOne, bottleNameFor, fetchList, refreshInventory]);

  const selectedItems = items.filter((i) => selected.has(i.id));

  const onMarkBought = useCallback(() => {
    const list = items.filter((i) => selected.has(i.id));
    if (list.length === 0) return;
    if (list.length === 1) {
      handleCheckPress(list[0]);
      return;
    }
    Alert.alert(
      `Mark ${list.length} items as bought?`,
      "Each bottle goes into My Bar as a full bottle, under the name you already use there or its list name. Juices and mixers just leave the list.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Mark bought", onPress: () => { runBulk("check", list); } },
      ]
    );
  }, [items, selected, handleCheckPress, runBulk]);

  const onRemove = useCallback(() => {
    const list = items.filter((i) => selected.has(i.id));
    if (list.length === 0) return;
    Alert.alert(
      list.length === 1 ? `Remove ${itemName(list[0])}?` : `Remove ${list.length} items?`,
      "This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => { runBulk("remove", list); } },
      ]
    );
  }, [items, selected, runBulk]);

  const reasonLine = (item: ListItem): string => {
    if (item.reason_name) return `for ${item.reason_name}`;
    if (item.source === "restock") return "low stock";
    return "added manually";
  };

  if (!session) {
    return <View style={styles.screen} />;
  }

  const barVisible = selected.size > 0;

  return (
    <View style={styles.screen}>
      {items.length > 0 && (
        <Pressable
          onPress={toggleAll}
          disabled={bulkBusy}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: allSelected }}
          accessibilityLabel="Select all"
          style={styles.selectBar}
        >
          <View style={[styles.checkbox, allSelected && styles.checkboxOn]}>
            {allSelected && <FontAwesome name="check" size={12} color={OaklandDusk.bg.void} />}
          </View>
          <Text style={[Type.button, styles.selectAllText]}>Select all</Text>
          <Text style={[Type.caption, styles.countText]}>
            {items.length} {items.length === 1 ? "item" : "items"}
          </Text>
        </Pressable>
      )}

      <ScrollView
        contentContainerStyle={[
          styles.scrollBody,
          barVisible && { paddingBottom: 96 + insets.bottom },
        ]}
      >
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
              Your list is empty
            </Text>
            <Text style={[Type.caption, styles.emptyHint]}>
              When a drink needs a bottle you don't have, it lands here.
            </Text>
          </View>
        )}

        {items.map((item) => {
          const isOn = selected.has(item.id);
          return (
            <Pressable
              key={item.id}
              onPress={() => toggleItem(item.id)}
              disabled={bulkBusy}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isOn }}
              accessibilityLabel={itemName(item)}
              style={styles.row}
            >
              <View style={[styles.checkbox, isOn && styles.checkboxOn]}>
                {isOn && <FontAwesome name="check" size={12} color={OaklandDusk.bg.void} />}
              </View>
              <View style={styles.rowText}>
                <Text style={[Type.body, { color: OaklandDusk.text.primary }]} numberOfLines={1}>
                  {itemName(item)}
                </Text>
                <Text style={[Type.caption, { color: OaklandDusk.text.secondary }]} numberOfLines={1}>
                  {reasonLine(item)}
                </Text>
              </View>
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={styles.thumb} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {barVisible && (
        <View style={[styles.actionBar, { paddingBottom: 12 + insets.bottom }]}>
          <Pressable
            onPress={onMarkBought}
            disabled={bulkBusy}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${selectedItems.length} as bought`}
            style={[styles.primaryBtn, bulkBusy && { opacity: 0.6 }]}
          >
            {bulkBusy ? (
              <ActivityIndicator size="small" color={OaklandDusk.bg.void} />
            ) : (
              <Text style={[Type.button, { color: OaklandDusk.bg.void }]}>
                Mark bought ({selectedItems.length})
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={onRemove}
            disabled={bulkBusy}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${selectedItems.length}`}
            style={[styles.dangerBtn, bulkBusy && { opacity: 0.6 }]}
          >
            <Text style={[Type.button, { color: OaklandDusk.accent.crimson }]}>
              Remove ({selectedItems.length})
            </Text>
          </Pressable>
        </View>
      )}

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
  selectBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
    backgroundColor: OaklandDusk.bg.card,
    borderBottomWidth: 1,
    borderBottomColor: OaklandDusk.bg.border,
  },
  selectAllText: { color: OaklandDusk.brand.gold },
  countText: { color: OaklandDusk.text.tertiary, marginLeft: "auto" },
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
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: OaklandDusk.brand.gold },
  rowText: { flex: 1, gap: 2 },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: R.action,
    backgroundColor: OaklandDusk.bg.surface,
    overflow: "hidden",
  },
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 12,
    paddingTop: 12,
    paddingHorizontal: 16,
    backgroundColor: OaklandDusk.bg.card,
    borderTopWidth: 1,
    borderTopColor: OaklandDusk.bg.border,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: OaklandDusk.brand.gold,
    borderRadius: R.action,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: OaklandDusk.accent.crimson,
    borderRadius: R.action,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
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
