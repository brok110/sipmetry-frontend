// components/restock/RestockDetailSheet.tsx — RESTOCK-EXPLORE B-3
// detail sheet 富卡(mockup v5 Frame 3):rail 卡 / hero / WHATIF target 共用。
// INSTANT UNLOCKS 縮圖(有圖用 expo-image,無圖 monogram,裁決⑦)+
// ONE MORE STEP(next_step ≤8,迷你 ＋LIST 加「缺的那支」)+ Add 大膠囊。
import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import OaklandDusk from "@/constants/OaklandDusk";
import { Monogram } from "@/components/restock/RailCard";

export type SheetRecipe = {
  iba_code: string;
  name: string;
  iba_category?: string;
  image_url?: string | null;
  badges?: string[];
};

export type SheetNextStep = {
  iba_code: string;
  name: string;
  image_url?: string | null;
  missing_key: string;
  missing_display: string;
};

export type SheetData = {
  ingredient_key: string;
  display_name: string;
  unlocks_count: number;
  category_key?: string | null;
  recipes: SheetRecipe[];
  next_step?: SheetNextStep[];
};

export function RestockDetailSheet({
  data,
  listedKeys,
  onClose,
  onAdd,
  onOpenUnlocks,
}: {
  data: SheetData | null;
  listedKeys: Set<string>;
  onClose: () => void;
  onAdd: (item: { ingredient_key: string; display_name: string }) => void;
  onOpenUnlocks: () => void;
}) {
  if (!data) return null;
  const listed = listedKeys.has(data.ingredient_key);
  const steps = data.next_step ?? [];
  const catLabel = data.category_key
    ? data.category_key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "";

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.top}>
          <Monogram label={data.display_name} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{data.display_name}</Text>
            <Text style={styles.sub}>
              +{data.unlocks_count} cocktail{data.unlocks_count === 1 ? "" : "s"}
              {catLabel ? ` · ${catLabel}` : ""}
            </Text>
          </View>
        </View>

        {data.recipes.length > 0 && (
          <>
            <Text style={styles.sec}>INSTANT UNLOCKS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {data.recipes.slice(0, 8).map((r) => (
                <Pressable
                  key={r.iba_code}
                  onPress={onOpenUnlocks}
                  accessibilityRole="button"
                  accessibilityLabel={r.name}
                  style={styles.thumbWrap}
                >
                  {r.image_url ? (
                    <Image source={{ uri: r.image_url }} style={styles.thumbImg} contentFit="cover" />
                  ) : (
                    <Monogram label={r.name} size={48} />
                  )}
                  <Text style={styles.thumbCap} numberOfLines={2}>{r.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {steps.length > 0 && (
          <>
            <Text style={styles.sec}>ONE MORE STEP</Text>
            {steps.map((st) => {
              const stepListed = listedKeys.has(st.missing_key);
              return (
                <View key={`${st.iba_code}:${st.missing_key}`} style={styles.step}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.stepName}>{st.name}</Text>
                    <Text style={styles.stepNeed}>need · {st.missing_display}</Text>
                  </View>
                  <Pressable
                    onPress={() => onAdd({ ingredient_key: st.missing_key, display_name: st.missing_display })}
                    disabled={stepListed}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={
                      stepListed ? `${st.missing_display} on list` : `Add ${st.missing_display} to shopping list`
                    }
                    style={[styles.miniCap, stepListed && styles.miniCapOn]}
                  >
                    <Text style={[styles.miniCapText, stepListed && styles.miniCapTextOn]}>
                      {stepListed ? "✓ LIST" : "＋ LIST"}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </>
        )}

        <Pressable
          onPress={() => onAdd({ ingredient_key: data.ingredient_key, display_name: data.display_name })}
          disabled={listed}
          accessibilityRole="button"
          accessibilityLabel={listed ? `${data.display_name} on list` : `Add ${data.display_name} to shopping list`}
          style={[styles.bigCap, listed && styles.bigCapOn]}
        >
          <Text style={[styles.bigCapText, listed && styles.bigCapTextOn]}>
            {listed ? `✓ ${data.display_name} on list` : `＋ Add ${data.display_name} to list`}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: OaklandDusk.bg.surface,
    borderTopWidth: 1,
    borderColor: OaklandDusk.brand.gold,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    paddingBottom: 34,
    gap: 10,
  },
  top: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  name: { fontSize: 19, fontWeight: "700", color: OaklandDusk.text.primary },
  sub: { fontFamily: "DMMono", fontSize: 11, color: OaklandDusk.brand.sundown, marginTop: 2 },
  sec: { fontFamily: "DMMono", fontSize: 10, letterSpacing: 1.5, color: OaklandDusk.text.tertiary, marginTop: 8 },
  thumbWrap: { width: 56, gap: 4, alignItems: "center" },
  thumbImg: { width: 48, height: 48, borderRadius: 10, backgroundColor: OaklandDusk.brand.tagBg },
  thumbCap: { fontSize: 8, lineHeight: 10, color: OaklandDusk.text.secondary, textAlign: "center" },
  step: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: OaklandDusk.bg.card,
    borderWidth: 1,
    borderColor: OaklandDusk.bg.border,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 6,
  },
  stepName: { fontSize: 12, color: OaklandDusk.text.primary },
  stepNeed: { fontFamily: "DMMono", fontSize: 10, color: OaklandDusk.text.tertiary, marginTop: 2 },
  miniCap: {
    borderWidth: 1,
    borderColor: OaklandDusk.brand.gold,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  miniCapOn: { borderColor: "#4ade80" },
  miniCapText: { fontFamily: "DMMono", fontSize: 9, color: OaklandDusk.brand.gold },
  miniCapTextOn: { color: "#4ade80" },
  bigCap: {
    marginTop: 14,
    backgroundColor: OaklandDusk.brand.gold,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: "center",
  },
  bigCapOn: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#4ade80" },
  bigCapText: { fontSize: 13, fontWeight: "600", color: OaklandDusk.bg.void },
  bigCapTextOn: { color: "#4ade80" },
});
