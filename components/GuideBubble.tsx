import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

// ── Guide keys ────────────────────────────────────────────────────────────────
export const GUIDE_KEYS = {
  // Scan flow
  SCAN:          "sipmetry_guide_scan",
  PHOTO:         "sipmetry_guide_photo",
  ADD_BAR:       "sipmetry_guide_add_bar",
  COCKTAILS:     "sipmetry_guide_cocktails",
  // My Bar
  MYBAR_EMPTY:   "sipmetry_guide_mybar_empty",
  MYBAR_CTA:     "sipmetry_guide_mybar_cta",
  MYBAR_SWIPE:   "sipmetry_guide_mybar_swipe",
  EDIT_BOTTLE:   "sipmetry_guide_edit_bottle",
  // Cart
  CART:          "sipmetry_guide_cart",
  CART_BUY:      "sipmetry_guide_cart_buy",
  // Recommendations
  RECO_SHOP:     "sipmetry_guide_reco_shop",
  // Profile
  PROFILE_PREFS: "sipmetry_guide_profile_prefs",
  PREFS_STYLE:   "sipmetry_guide_prefs_style",
} as const;

export type GuideKey = (typeof GUIDE_KEYS)[keyof typeof GUIDE_KEYS];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Reset all guide bubbles (DEV use). */
export async function resetAllGuides(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(Object.values(GUIDE_KEYS));
  } catch {
    // best-effort
  }
}

/** Write dismissed flag into AsyncStorage. */
export async function dismissGuide(key: GuideKey): Promise<void> {
  try {
    await AsyncStorage.setItem(key, "1");
  } catch {
    // best-effort
  }
}

/** Check whether a guide has already been dismissed. */
export async function isGuideDismissed(key: GuideKey): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(key);
    return v === "1";
  } catch {
    return false;
  }
}

// ── GuideBubble ───────────────────────────────────────────────────────────────

/**
 * A yellow tooltip bubble with a bounce animation.
 * - `position="above"` (default): bubble above target, triangle points down
 * - `position="below"`: bubble below target, triangle points up
 * - `align`: horizontal alignment of the bubble ("left" | "right" | "center")
 *
 * Tap the bubble to dismiss. Parent should also call `dismissGuide(key)` when
 * the user performs the target action.
 */
export default function GuideBubble({
  storageKey,
  text,
  visible,
  onDismiss,
  align = "left",
  position = "above",
}: {
  storageKey: GuideKey;
  text: string;
  visible: boolean;
  onDismiss?: () => void;
  align?: "left" | "right" | "center";
  position?: "above" | "below";
}) {
  const bounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    const dir = position === "below" ? 6 : -6;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: dir,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: 450,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [visible, bounce, position]);

  if (!visible) return null;

  const isBelow = position === "below";

  const alignStyle =
    align === "right"
      ? { right: 8, left: undefined as number | undefined }
      : align === "center"
      ? { alignSelf: "center" as const }
      : { left: 8 };

  const triangleAlignStyle =
    align === "right"
      ? { alignSelf: "flex-end" as const, marginRight: 16 }
      : { alignSelf: "flex-start" as const, marginLeft: 16 };

  return (
    <Animated.View
      style={[
        styles.wrapper,
        isBelow ? styles.wrapperBelow : styles.wrapperAbove,
        alignStyle,
        { transform: [{ translateY: bounce }] },
      ]}
      pointerEvents="box-none"
    >
      {/* Up-pointing triangle (shown when position=below) */}
      {isBelow && (
        <View style={[styles.triangleUp, triangleAlignStyle]} />
      )}

      {/* Bubble — tap to dismiss */}
      <View
        style={styles.bubble}
        onStartShouldSetResponder={() => true}
        onResponderRelease={() => {
          if (onDismiss) onDismiss();
          dismissGuide(storageKey);
        }}
      >
        <Text style={styles.text}>{text}</Text>
      </View>

      {/* Down-pointing triangle (shown when position=above) */}
      {!isBelow && (
        <View style={[styles.triangleDown, triangleAlignStyle]} />
      )}
    </Animated.View>
  );
}

const BUBBLE_COLOR = "#F0C848";

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    zIndex: 100,
    maxWidth: 220,
  },
  wrapperAbove: {
    bottom: "100%",
    marginBottom: 4,
  },
  wrapperBelow: {
    top: "100%",
    marginTop: 4,
  },
  bubble: {
    backgroundColor: BUBBLE_COLOR,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  text: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1A1200",
  },
  // Triangle pointing downward (for position=above)
  triangleDown: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: BUBBLE_COLOR,
  },
  // Triangle pointing upward (for position=below)
  triangleUp: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: BUBBLE_COLOR,
  },
});
