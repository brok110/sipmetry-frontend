// components/browse/LoopingRail.tsx
// The signature interaction: EVERY rail loops infinitely in one direction,
// regardless of length (including 3-card rails). Implementation: the item
// set is repeated enough times to cover the viewport, and a pan gesture
// drives an unbounded offset whose modulo-wrapped value translates the
// track. The wrap is a pure modulo on the render transform — no scroll
// events, no offset jumps — so it is seamless by construction for both
// slow drags and withDecay flings.

import React, { useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
} from "react-native-reanimated";
import type { BrowseItem } from "@/lib/browse/rowEngine";
import RecipeCard, { CARD_WIDTH } from "./RecipeCard";

export const CARD_GAP = 12;
const SIDE_INSET = 26; // first card starts at the screen's 26px content inset

type LoopingRailProps = {
  items: BrowseItem[];
  dimmed?: boolean;
  onPressItem: (item: BrowseItem) => void;
};

export default function LoopingRail({ items, dimmed, onPressItem }: LoopingRailProps) {
  const { width: windowWidth } = useWindowDimensions();

  // One period = one full pass of the item set. Repeat the set so that at
  // any wrapped offset the viewport is covered: copies*P - P >= windowWidth.
  const period = items.length * (CARD_WIDTH + CARD_GAP);
  const copies = period > 0 ? Math.max(2, Math.ceil(windowWidth / period) + 1) : 0;

  // Unbounded scroll position; starts at -SIDE_INSET so card 1 sits at the
  // 26px inset (with the tail of the "previous" card peeking at the left
  // edge — the loop's affordance).
  const offset = useSharedValue(-SIDE_INSET);

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10]) // let taps through
    .failOffsetY([-8, 8]) // let the outer vertical ScrollView win
    .onBegin(() => {
      cancelAnimation(offset); // touch stops an in-flight fling, like native
    })
    .onChange((e) => {
      offset.value -= e.changeX;
    })
    .onEnd((e) => {
      offset.value = withDecay({ velocity: -e.velocityX });
    });

  const trackStyle = useAnimatedStyle(() => {
    if (period <= 0) return {};
    const wrapped = ((offset.value % period) + period) % period; // [0, period)
    return { transform: [{ translateX: -wrapped }] };
  }, [period]);

  const cells = useMemo(() => {
    const out: { item: BrowseItem; key: string }[] = [];
    for (let c = 0; c < copies; c++) {
      for (const item of items) {
        out.push({ item, key: `${item.iba_code}:${c}` });
      }
    }
    return out;
  }, [items, copies]);

  if (items.length === 0) return null;

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.viewport}>
        <Animated.View style={[styles.track, trackStyle]}>
          {cells.map(({ item, key }) => (
            <View key={key} style={styles.cell}>
              <RecipeCard item={item} dimmed={dimmed} onPress={() => onPressItem(item)} />
            </View>
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  viewport: {
    width: "100%",
    overflow: "hidden",
    paddingVertical: 2,
  },
  track: {
    flexDirection: "row",
  },
  cell: {
    marginRight: CARD_GAP,
  },
});
