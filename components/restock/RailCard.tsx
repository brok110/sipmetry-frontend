// components/restock/RailCard.tsx — RESTOCK-EXPLORE B-2
// rails 橫向卡(mockup v5 Frame 1)。memo:rails ≤4 條 × ≤8 卡,
// 配合穩定 handler(onAdd/onPress 傳 item,呼叫端給 useCallback)。
// upgrade 項:調暗 + UPGRADE 標 + alt 說明(裁決⑥)。
import React, { memo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import OaklandDusk from "@/constants/OaklandDusk";

export type RailCardItem = {
  ingredient_key: string;
  display_name: string;
  image_url?: string | null;
  unlocks_count: number;
  is_alternative_upgrade?: boolean;
  alt_description?: string | null;
  // CABINET-PHOTO Stage 5(三):START YOUR … SHELF 的卡(空層進來)才有——這支酒出現在幾款酒譜
  classics_count?: number;
};

// 小字:差一瓶就能做的寫 +N cocktails;做不出來、但有 classics_count 的(空層那排)寫 in N classics,不寫 +0
function unlocksLine(item: RailCardItem): string {
  if (item.unlocks_count <= 0 && item.classics_count && item.classics_count > 0) {
    return `in ${item.classics_count} classic${item.classics_count === 1 ? "" : "s"}`;
  }
  return `+${item.unlocks_count} cocktail${item.unlocks_count === 1 ? "" : "s"}`;
}

// 圖(ingredients.image_url,09-09 photo 路線落地)優先;無圖或載入失敗回退字母 monogram。
export function Monogram({ label, size, imageUrl }: { label: string; size: number; imageUrl?: string | null }) {
  const [failed, setFailed] = useState(false);
  const radius = size * 0.22;
  if (imageUrl && !failed) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[styles.mono, { width: size, height: size, borderRadius: radius }]}
        contentFit="cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={[styles.mono, { width: size, height: size, borderRadius: radius }]}>
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
      accessibilityLabel={`${item.display_name}, ${unlocksLine(item)}`}
      style={[styles.card, upgrade && styles.cardDim]}
    >
      {upgrade && (
        <View style={styles.upTag}>
          <Text style={styles.upTagText}>UPGRADE</Text>
        </View>
      )}
      <Monogram label={item.display_name} size={42} imageUrl={item.image_url} />
      <Text style={styles.name} numberOfLines={2}>{item.display_name}</Text>
      <Text style={styles.unlocks} numberOfLines={2}>
        {unlocksLine(item)}
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
