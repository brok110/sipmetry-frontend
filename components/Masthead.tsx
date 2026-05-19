import React from "react";
import { StyleSheet, Text, View } from "react-native";
import OaklandDusk from "@/constants/OaklandDusk";
import { V3 } from "@/constants/v3DesignTokens";

type MastheadProps = {
  counter?: { current: number; total: number };
};

export default function Masthead({ counter }: MastheadProps) {
  return (
    <View style={styles.masthead}>
      <Text style={styles.mastheadTitle}>SIPMETRY</Text>
      {counter && (
        <View style={styles.mastheadCounterRow}>
          <Text style={[styles.mastheadCounter, styles.mastheadCounterCur]}>
            {String(counter.current).padStart(2, "0")}
          </Text>
          <Text style={[styles.mastheadCounter, styles.mastheadCounterSep]}>
            {" / "}
          </Text>
          <Text style={styles.mastheadCounter}>
            {String(counter.total).padStart(2, "0")}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  masthead: {
    paddingHorizontal: 26,
    paddingTop: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  mastheadTitle: {
    ...V3.type.masthead,
  },
  mastheadCounterRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  mastheadCounter: {
    fontFamily: V3.fonts.mono,
    fontSize: 11,
    letterSpacing: 3.3,
    color: `${OaklandDusk.text.primary}94`,
    textTransform: "uppercase",
  },
  mastheadCounterCur: {
    color: OaklandDusk.text.primary,
  },
  mastheadCounterSep: {
    color: `${OaklandDusk.text.primary}2E`,
  },
});
