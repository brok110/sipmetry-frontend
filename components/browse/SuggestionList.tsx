// components/browse/SuggestionList.tsx
// Dumb typeahead dropdown for the bartender search bar: compact
// full-width rows — label left, faint type micro-label right. Max 8 rows
// arrive from the caller; no scroll container so taps land on first
// touch even with the keyboard open.

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import OaklandDusk from "@/constants/OaklandDusk";
import { V3 } from "@/constants/v3DesignTokens";
import type { SearchSuggestion } from "@/lib/browse/browseApi";

type SuggestionListProps = {
  suggestions: SearchSuggestion[];
  onPick: (suggestion: SearchSuggestion) => void;
};

export default function SuggestionList({ suggestions, onPick }: SuggestionListProps) {
  if (suggestions.length === 0) return null;

  return (
    <View style={styles.panel}>
      {suggestions.map((s, i) => (
        <Pressable
          key={`${s.type}:${s.iba_code || s.label}:${i}`}
          style={({ pressed }) => [
            styles.row,
            i > 0 && styles.rowBorder,
            pressed && styles.rowPressed,
          ]}
          onPress={() => onPick(s)}
          accessibilityRole="button"
          accessibilityLabel={`${s.label}, ${s.type}`}
        >
          <Text style={styles.label} numberOfLines={1}>
            {s.label}
          </Text>
          <Text style={styles.type}>{s.type.toUpperCase()}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: OaklandDusk.bg.card,
    borderWidth: 1,
    borderColor: `${OaklandDusk.text.primary}12`, // ~7% ivory hairline
    borderRadius: 12,
    overflow: "hidden",
    // DESIGN.md medium shadow (floating elements)
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: `${OaklandDusk.text.primary}0D`, // ivory @5%
  },
  rowPressed: {
    backgroundColor: `${OaklandDusk.brand.gold}14`, // gold @8%
  },
  label: {
    flex: 1,
    fontFamily: V3.fonts.mono,
    fontSize: 12,
    letterSpacing: 1.2,
    color: OaklandDusk.text.primary,
  },
  type: {
    fontFamily: V3.fonts.mono,
    fontSize: 8,
    letterSpacing: 1.28,
    color: `${OaklandDusk.text.primary}52`, // textFaint
    textTransform: "uppercase",
  },
});
