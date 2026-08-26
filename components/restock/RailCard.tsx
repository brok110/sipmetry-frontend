// components/restock/RailCard.tsx — RESTOCK-EXPLORE B-2
// rails 橫向卡(mockup v5 Frame 1)。memo:rails ≤4 條 × ≤8 卡,
// 配合穩定 handler(onAdd/onPress 傳 item,呼叫端給 useCallback)。
// upgrade 項:調暗 + UPGRADE 標 + alt 說明(裁決⑥)。
import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import OaklandDusk from "@/constants/OaklandDusk";

export type RailCardItem = {
  ingredient_key: string;
  display_name: string;
  unlocks_count: number;
  is_alternative_upgrade?: boolean;
  alt_description?: string | null;
};

// 圖未產前 monogram 為正式樣(裁決⑦;Stage C 圖到位後換 expo-image)
export function Monogram({ label, size }: { label: string; size: number }) {
  return (
    <View style={[styles.mono, { width: size, height: size, borderRadius: size * 0.22 }]}>
      <Text style={[styles.monoText, { fontSize: size * 0.46 }]}>
        {(label.trim()[0] || "?").toUpperCase()}
      </Text>
    </View>
  );
}

export const RailCard = memo(function RailCard({
  item,
  listed,
  onAdd,
  onPress,
}: {
  item: RailCardItem;
  listed: boolean;
  onAdd: (item: RailCardItem) => void;
  onPress: (item: RailCardItem) => void;
}) {
  const upgrade = item.is_alternative_upgrade === true;
  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.display_name}, unlocks ${item.unlocks_count}`}
      style={[styles.card, upgrade && styles.cardDim]}
    >
      {upgrade && (
        <View style={styles.upTag}>
          <Text style={styles.upTagText}>UPGRADE</Text>
        </View>
      )}
      <Monogram label={item.display_name} size={42} />
      <Text style={styles.name} numberOfLines={2}>{item.display_name}</Text>
      <Text style={styles.unlocks} numberOfLines={2}>
        +{item.unlocks_count} cocktail{item.unlocks_count === 1 ? "" : "s"}
        {upgrade && item.alt_description ? ` · ${item.alt_description}` : ""}
      </Text>
      <Pressable
        onPress={() => onAdd(item)}
        disabled={listed}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={listed ? `${item.display_name} on list` : `Add ${item.display_name} to shopping list`}
        style={[styles.cap, listed && styles.capOn]}
      >
        <Text style={[styles.capText, listed && styles.capTextOn]}>
          {listed ? "✓ On list" : "＋ Add"}
        </Text>
      </Pressable>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    width: 128,
    backgroundColor: OaklandDusk.bg.card,
    borderWidth: 1,
    borderColor: OaklandDusk.bg.border,
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  cardDim: { opacity: 0.68 },
  upTag: {
    alignSelf: "flex-start",
    backgroundColor: OaklandDusk.accent.indigoBg,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  upTagText: { fontFamily: "DMMono", fontSize: 8, letterSpacing: 0.5, color: OaklandDusk.accent.indigo },
  mono: {
    backgroundColor: OaklandDusk.brand.tagBg,
    alignItems: "center",
    justifyContent: "center",
  },
  monoText: { fontFamily: "DMMono", fontWeight: "500", color: OaklandDusk.brand.sundown },
  name: { fontSize: 12, lineHeight: 15.5, minHeight: 31, color: OaklandDusk.text.primary },
  unlocks: { fontFamily: "DMMono", fontSize: 10, color: OaklandDusk.brand.sundown },
  cap: {
    borderWidth: 1,
    borderColor: OaklandDusk.brand.gold,
    borderRadius: 999,
    paddingVertical: 4,
    alignItems: "center",
  },
  capOn: { borderColor: "#4ade80" },
  capText: { fontFamily: "DMMono", fontSize: 10, color: OaklandDusk.brand.gold },
  capTextOn: { color: "#4ade80" },
});
