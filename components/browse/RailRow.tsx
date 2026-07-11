// components/browse/RailRow.tsx
// One carousel row: title + looping rail. Title + cards only per the
// mockup — no subtitles, no counts, no "see all".

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import OaklandDusk from "@/constants/OaklandDusk";
import { V3 } from "@/constants/v3DesignTokens";
import type { BrowseItem, Rail } from "@/lib/browse/rowEngine";
import LoopingRail from "./LoopingRail";

type RailRowProps = {
  rail: Rail;
  onPressItem: (item: BrowseItem) => void;
};

export default function RailRow({ rail, onPressItem }: RailRowProps) {
  if (rail.items.length === 0) return null;

  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        {rail.kind === "ready" && (
          <FontAwesome
            name="check"
            size={14}
            color={OaklandDusk.semantic.ready}
            style={styles.tick}
          />
        )}
        {rail.kind === "one_away" && <Text style={styles.plus}>+1 </Text>}
        <Text style={styles.rowTitle} numberOfLines={1}>
          {rail.title}
        </Text>
      </View>
      <LoopingRail items={rail.items} dimmed={rail.dimmed} onPressItem={onPressItem} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: 26,
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 26,
    paddingBottom: 10,
  },
  rowTitle: {
    fontFamily: V3.fonts.bebas,
    fontSize: 20,
    letterSpacing: 1.6,
    color: OaklandDusk.text.primary,
  },
  tick: {
    marginRight: 7,
  },
  plus: {
    fontFamily: V3.fonts.bebas,
    fontSize: 20,
    letterSpacing: 1.6,
    color: OaklandDusk.brand.gold,
  },
});
