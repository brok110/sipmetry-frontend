import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";

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
  // Golden path (sequential)
  GP_STEP_1:     "sipmetry_gp_step_1",
  GP_STEP_2:     "sipmetry_gp_step_2",
  GP_STEP_3:     "sipmetry_gp_step_3",
  GP_STEP_4:     "sipmetry_gp_step_4",
  GP_STEP_5:     "sipmetry_gp_step_5",
  GP_STEP_6:     "sipmetry_gp_step_6",
  // Standalone
  RESTOCK_FIND:  "sipmetry_guide_restock_find",
  PROFILE_ROWS:      "sipmetry_guide_profile_rows",
  PROFILE_PREFS_ROW: "sipmetry_guide_profile_prefs_row",
  PROFILE_FAVS_ROW:  "sipmetry_guide_profile_favs_row",
  RECIPE_SHARE:      "sipmetry_guide_recipe_share",
  RECIPE_FAV:        "sipmetry_guide_recipe_fav",
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

/**
 * Check if a golden-path step should show.
 * Step 1 has no prerequisite. Steps 2-6 require previous step dismissed.
 */
export async function isGoldenPathStepReady(
  step: 1 | 2 | 3 | 4 | 5 | 6
): Promise<boolean> {
  const key = GUIDE_KEYS[`GP_STEP_${step}` as keyof typeof GUIDE_KEYS] as GuideKey;
  const selfDismissed = await isGuideDismissed(key);
  if (selfDismissed) return false;

  if (step === 1) return true;

  const prevKey = GUIDE_KEYS[`GP_STEP_${step - 1}` as keyof typeof GUIDE_KEYS] as GuideKey;
  const prevDismissed = await isGuideDismissed(prevKey);
  return prevDismissed;
}

// ── HintBubble ────────────────────────────────────────────────────────────────

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { StyleSheet as RNStyleSheet } from "react-native";

type HintColor = "charcoal" | "skyblue";
type HintType = "tap" | "swipe";

const CHARCOAL = {
  ring: "rgba(255,245,200,0.45)",
  ringInner: "rgba(255,245,200,0.65)",
  dot: "rgba(255,245,200,0.9)",
};

const SKYBLUE = {
  ring: "rgba(130,190,255,0.3)",
  ringInner: "rgba(130,190,255,0.45)",
  dot: "rgba(130,190,255,0.5)",
};

export function TapPulse({ color }: { color: HintColor }) {
  const c = color === "charcoal" ? CHARCOAL : SKYBLUE;
  const outerScale = useSharedValue(0.7);
  const outerOpacity = useSharedValue(0.45);
  const innerScale = useSharedValue(0.6);
  const innerOpacity = useSharedValue(0.55);
  const dotOpacity = useSharedValue(0.4);

  useEffect(() => {
    outerScale.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.7, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1
    );
    outerOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 1000 }),
        withTiming(0.45, { duration: 1000 })
      ),
      -1
    );
    innerScale.value = withRepeat(
      withSequence(
        withTiming(1.0, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.6, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1
    );
    innerOpacity.value = withRepeat(
      withSequence(
        withTiming(0.08, { duration: 1000 }),
        withTiming(0.55, { duration: 1000 })
      ),
      -1
    );
    dotOpacity.value = withRepeat(
      withSequence(
        withTiming(0.85, { duration: 750 }),
        withTiming(0.4, { duration: 750 })
      ),
      -1
    );

    return () => {
      cancelAnimation(outerScale);
      cancelAnimation(outerOpacity);
      cancelAnimation(innerScale);
      cancelAnimation(innerOpacity);
      cancelAnimation(dotOpacity);
    };
  }, []);

  const outerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: outerScale.value }],
    opacity: outerOpacity.value,
  }));
  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: innerScale.value }],
    opacity: innerOpacity.value,
  }));
  const dotStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
  }));

  return (
    <View style={hintStyles.pulseContainer} pointerEvents="none">
      <Animated.View style={[hintStyles.outerRing, { borderColor: c.ring }, outerStyle]} />
      <Animated.View style={[hintStyles.innerRing, { borderColor: c.ringInner }, innerStyle]} />
      <Animated.View style={[hintStyles.centerDot, { backgroundColor: c.dot }, dotStyle]} />
    </View>
  );
}

function SwipeBubble({ color }: { color: HintColor }) {
  const c = color === "charcoal" ? CHARCOAL : SKYBLUE;
  const translateX = useSharedValue(0);
  const chevronOpacity = useSharedValue(0.2);

  useEffect(() => {
    translateX.value = withRepeat(
      withSequence(
        withTiming(14, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(-14, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 700, easing: Easing.inOut(Easing.ease) })
      ),
      -1
    );
    chevronOpacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 1100 }),
        withTiming(0.2, { duration: 1100 })
      ),
      -1
    );

    return () => {
      cancelAnimation(translateX);
      cancelAnimation(chevronOpacity);
    };
  }, []);

  const ballStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={hintStyles.swipeContainer} pointerEvents="none">
      {/* Track line */}
      <View style={[hintStyles.swipeTrack, { backgroundColor: c.ring }]} />
      {/* Left chevron */}
      <View style={hintStyles.swipeChevronLeft}>
        <Text style={{ fontSize: 14, color: c.ringInner }}>‹</Text>
      </View>
      {/* Right chevron */}
      <View style={hintStyles.swipeChevronRight}>
        <Text style={{ fontSize: 14, color: c.ringInner }}>›</Text>
      </View>
      {/* Ball */}
      <Animated.View style={[hintStyles.swipeBall, ballStyle]}>
        <View style={[hintStyles.swipeBallOuter, { borderColor: c.ringInner, backgroundColor: c.ring }]} />
        <View style={[hintStyles.swipeBallInner, { backgroundColor: c.dot }]} />
      </Animated.View>
    </View>
  );
}

/**
 * HintBubble — replaces GuideBubble.
 *
 * Props:
 * - storageKey: GuideKey to track dismissal
 * - visible: whether to show
 * - onDismiss: callback when dismissed
 * - hintType: "tap" | "swipe" (default "tap")
 * - hintColor: "charcoal" | "skyblue" (default "skyblue")
 * - text, align, position: legacy props accepted but ignored for backwards compat
 */
export default function HintBubble({
  storageKey,
  visible,
  onDismiss,
  hintType = "tap",
  hintColor = "skyblue",
}: {
  storageKey: GuideKey;
  visible: boolean;
  onDismiss?: () => void;
  hintType?: HintType;
  hintColor?: HintColor;
  // Legacy props — accepted but ignored for backwards compat
  text?: string;
  align?: string;
  position?: string;
}) {
  if (!visible) return null;

  // No blocking overlay — touch passes through to the button beneath.
  // Each call site dismisses the hint inside its own onPress handler.
  return (
    <View style={hintStyles.bubbleWrapper} pointerEvents="none">
      {hintType === "tap" ? (
        <TapPulse color={hintColor} />
      ) : (
        <SwipeBubble color={hintColor} />
      )}
    </View>
  );
}

const hintStyles = RNStyleSheet.create({
  bubbleWrapper: {
    ...RNStyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
    pointerEvents: "none",
  },
  // TAP pulse
  pulseContainer: {
    width: 60,
    height: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  outerRing: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.2,
  },
  innerRing: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.2,
  },
  centerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  // SWIPE
  swipeContainer: {
    width: 120,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  swipeTrack: {
    position: "absolute",
    left: 20,
    right: 20,
    height: 1,
    borderRadius: 0.5,
  },
  swipeChevronLeft: {
    position: "absolute",
    left: 10,
  },
  swipeChevronRight: {
    position: "absolute",
    right: 10,
  },
  swipeBall: {
    justifyContent: "center",
    alignItems: "center",
  },
  swipeBallOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 0.7,
    justifyContent: "center",
    alignItems: "center",
  },
  swipeBallInner: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
