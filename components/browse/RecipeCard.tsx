// components/browse/RecipeCard.tsx
// Dumb card for the carousel rails + search grid, per sipmetry-v3-carousel
// mockup: 3:4 image with dark bottom gradient, lowercase name (1 line),
// one bucket-derived chip. All data logic lives in lib/browse/rowEngine.

import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import OaklandDusk from "@/constants/OaklandDusk";
import { V3 } from "@/constants/v3DesignTokens";
import { humanizeKey, type BrowseItem } from "@/lib/browse/rowEngine";

export const CARD_WIDTH = 128;

type RecipeCardProps = {
  item: BrowseItem;
  width?: number;
  dimmed?: boolean;
  onPress: () => void;
};

export function BucketChip({ item }: { item: BrowseItem }) {
  if (item.bucket === "can_make") {
    return (
      <View style={[styles.chip, styles.chipReady]}>
        <View style={styles.chipDot} />
        <Text style={[styles.chipText, styles.chipTextReady]}>READY</Text>
      </View>
    );
  }
  if (item.bucket === "one_away") {
    const first = humanizeKey(item.missing?.[0] || "");
    return (
      <View style={[styles.chip, styles.chipAway]}>
        <Text style={[styles.chipText, styles.chipTextAway]} numberOfLines={1}>
          {first ? `+ ${first.toUpperCase()}` : "+ 1 BOTTLE"}
        </Text>
      </View>
    );
  }
  const n = Number(item.missing_count) || 0;
  return (
    <View style={[styles.chip, styles.chipFar]}>
      <Text style={[styles.chipText, styles.chipTextFar]} numberOfLines={1}>
        {n > 0 ? `+${n} ${n === 1 ? "BOTTLE" : "BOTTLES"}` : "OUT OF REACH"}
      </Text>
    </View>
  );
}

export default function RecipeCard({ item, width = CARD_WIDTH, dimmed, onPress }: RecipeCardProps) {
  return (
    <Pressable
      style={[styles.card, { width }, dimmed && styles.cardDimmed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.name}
    >
      <View style={styles.art}>
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.artFallback}>
            <Text style={styles.artFallbackGlyph}>🍸</Text>
          </View>
        )}
        <LinearGradient
          colors={["transparent", `${OaklandDusk.bg.void}BF`]}
          locations={[0.55, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {item.name.toLowerCase()}
      </Text>
      <View style={styles.chipRow}>
        <BucketChip item={item} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    // width set inline (rail: 128 fixed; search grid: computed)
  },
  cardDimmed: {
    opacity: 0.82,
  },
  art: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${OaklandDusk.text.primary}0F`, // ~6% ivory hairline
    overflow: "hidden",
    marginBottom: 8,
    backgroundColor: OaklandDusk.bg.surface,
  },
  artFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  artFallbackGlyph: {
    fontSize: 26,
    color: OaklandDusk.text.disabled,
  },
  name: {
    fontFamily: V3.fonts.mono,
    fontSize: 11,
    letterSpacing: 1.1,
    color: OaklandDusk.text.primary,
    textTransform: "lowercase",
    marginBottom: 5,
  },
  chipRow: {
    flexDirection: "row", // keeps the chip from stretching full-width
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    maxWidth: "100%",
  },
  chipDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: OaklandDusk.semantic.ready,
  },
  chipText: {
    fontFamily: V3.fonts.mono,
    fontSize: 9,
    letterSpacing: 1.44,
    textTransform: "uppercase",
  },
  chipReady: {
    backgroundColor: `${OaklandDusk.semantic.ready}24`, // ready @14%
  },
  chipTextReady: {
    color: OaklandDusk.semantic.ready,
  },
  chipAway: {
    backgroundColor: `${OaklandDusk.brand.gold}1F`, // gold @12%
  },
  chipTextAway: {
    color: OaklandDusk.brand.gold,
  },
  chipFar: {
    backgroundColor: `${OaklandDusk.text.primary}0D`, // ivory @5%
  },
  chipTextFar: {
    color: `${OaklandDusk.text.primary}52`, // textFaint
  },
});
