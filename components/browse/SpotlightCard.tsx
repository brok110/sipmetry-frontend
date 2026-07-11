// components/browse/SpotlightCard.tsx
// TONIGHT'S POUR hero-as-a-row card per the v3 carousel mockup:
// image left ~42% (3:4), name + one-line explain + status chip +
// "Pour this →". Data comes from the existing hero pipeline
// (/bartender-recommend top result) — this component stays dumb.

import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import OaklandDusk from "@/constants/OaklandDusk";
import { V3 } from "@/constants/v3DesignTokens";
import { humanizeKey } from "@/lib/browse/rowEngine";

export type SpotlightData = {
  name: string;
  subline?: string | null; // buildExplainText output from the hero pipeline
  imageUrl?: string | null;
  missingCount: number;
  firstMissing?: string | null;
};

type SpotlightCardProps = {
  data: SpotlightData;
  onPress: () => void;
};

export default function SpotlightCard({ data, onPress }: SpotlightCardProps) {
  const ready = data.missingCount === 0;
  const awayLabel = humanizeKey(data.firstMissing || "");

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${data.name}, pour this`}
    >
      <View style={styles.art}>
        {data.imageUrl ? (
          <Image
            source={{ uri: data.imageUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.artFallback}>
            <Text style={styles.artFallbackGlyph}>🍸</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {data.name.toUpperCase()}
        </Text>
        <View style={styles.rule} />
        {!!data.subline && (
          <Text style={styles.sub} numberOfLines={1}>
            {data.subline}
          </Text>
        )}
        <View style={styles.foot}>
          {ready ? (
            <View style={[styles.chip, styles.chipReady]}>
              <View style={styles.chipDot} />
              <Text style={[styles.chipText, styles.chipTextReady]}>READY</Text>
            </View>
          ) : (
            <View style={[styles.chip, styles.chipAway]}>
              <Text style={[styles.chipText, styles.chipTextAway]} numberOfLines={1}>
                {awayLabel ? `+ ${awayLabel.toUpperCase()}` : "ALMOST THERE"}
              </Text>
            </View>
          )}
          <Text style={styles.cta}>POUR THIS →</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: `${OaklandDusk.brand.gold}47`, // gold @28%
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: OaklandDusk.bg.card,
  },
  art: {
    width: "42%",
    aspectRatio: 3 / 4,
    backgroundColor: OaklandDusk.bg.surface,
  },
  artFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  artFallbackGlyph: {
    fontSize: 40,
    color: OaklandDusk.text.disabled,
  },
  body: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  name: {
    fontFamily: V3.fonts.bebas,
    fontSize: 32,
    letterSpacing: 1.28,
    lineHeight: 34, // RN clips Bebas when lineHeight < fontSize
    color: OaklandDusk.text.primary,
  },
  rule: {
    width: 34,
    height: 1,
    backgroundColor: OaklandDusk.brand.gold,
    marginVertical: 10,
  },
  sub: {
    fontFamily: V3.fonts.cormorant,
    fontStyle: "italic",
    fontSize: 14,
    color: `${OaklandDusk.text.primary}94`, // textDim
    marginBottom: 16,
  },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cta: {
    fontFamily: V3.fonts.mono,
    fontSize: 9,
    letterSpacing: 2.34,
    color: OaklandDusk.brand.gold,
    textTransform: "uppercase",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    flexShrink: 1,
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
});
