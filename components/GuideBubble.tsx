import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet as RNSheet, View } from "react-native";

import { useSpotlight } from "./spotlight/SpotlightContext";
import { useTargetMeasurement } from "./spotlight/useTargetMeasurement";
import { SPOTLIGHT } from "./spotlight/SpotlightTokens";
import type { SpotlightColor } from "./spotlight/types";

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


// Keys that cannot use the global SpotlightOverlay because they live inside
// a React Native Modal (separate native window — measureInWindow coordinates
// won't match the root layout's coordinate space).
// These hints are silently skipped rather than shown misaligned.
const LOCAL_ONLY_HINTS = new Set<GuideKey>([
  GUIDE_KEYS.EDIT_BOTTLE,
]);

type HintColor = "charcoal" | "skyblue";
type HintType = "tap" | "swipe";

// ── Spotlight lookup tables ───────────────────────────────────────────────────
// Maps each guide key to the emoji shown in the GlassIcon badge.
// null = spotlight cutout only, no icon badge.
const ICON_MAP: Partial<Record<GuideKey, string | null>> = {
  [GUIDE_KEYS.GP_STEP_1]:     "👆",
  [GUIDE_KEYS.GP_STEP_3]:     "📸",
  [GUIDE_KEYS.GP_STEP_4]:     "🍹",
  [GUIDE_KEYS.GP_STEP_5]:     "👆",
  [GUIDE_KEYS.GP_STEP_6]:     "🎉",
  [GUIDE_KEYS.CART]:          null,
  [GUIDE_KEYS.RESTOCK_FIND]:  null,
  [GUIDE_KEYS.EDIT_BOTTLE]:   "👈",
  [GUIDE_KEYS.MYBAR_SWIPE]:   "👈",
  [GUIDE_KEYS.MYBAR_EMPTY]:   "👆",
  [GUIDE_KEYS.MYBAR_CTA]:     "🍹",
  [GUIDE_KEYS.ADD_BAR]:       "➕",
  [GUIDE_KEYS.RECIPE_SHARE]:      "📤",
  [GUIDE_KEYS.RECIPE_FAV]:        "❤️",
  [GUIDE_KEYS.PREFS_STYLE]:       "🎨",
  [GUIDE_KEYS.PROFILE_PREFS_ROW]: "🎨",
  [GUIDE_KEYS.PROFILE_FAVS_ROW]:  "❤️",
};

// Icon badge placement relative to the spotlight cutout.
// 'auto' = above when target is in the bottom 40% of screen, else below.
const POSITION_MAP: Partial<Record<GuideKey, "above" | "below" | "auto">> = {
  [GUIDE_KEYS.GP_STEP_4]:    "above", // sticky footer at bottom of screen
  [GUIDE_KEYS.MYBAR_CTA]:    "above", // sticky footer at bottom of screen
  [GUIDE_KEYS.RECIPE_SHARE]: "below", // small icon in header — badge goes below
};

// hintColor prop ('charcoal' | 'skyblue') → SpotlightColor ('gold' | 'skyblue')
const COLOR_MAP: Record<HintColor, SpotlightColor> = {
  charcoal: "gold",
  skyblue:  "skyblue",
};

// ── HintBubble ────────────────────────────────────────────────────────────────

type HintBubbleProps = {
  storageKey: GuideKey;
  visible: boolean;
  onDismiss?: () => void;
  hintType?: HintType;
  hintColor?: HintColor;
  children?: React.ReactNode;
  text?: string;
  align?: string;
  position?: string;
};

/**
 * Inner spotlight implementation — all hooks live here.
 * Separated from HintBubble so we can do an early-return for LOCAL_ONLY_HINTS
 * without violating the Rules of Hooks.
 */
function SpotlightHintBubble({
  storageKey,
  visible,
  onDismiss,
  hintType = "tap",
  hintColor = "skyblue",
  children,
}: HintBubbleProps) {
  const { ref, measure } = useTargetMeasurement();
  const { show, hide, activeKey } = useSpotlight();

  // Track whether we've successfully become the active spotlight hint.
  // Used to detect external dismissals (e.g. Android BackHandler) where
  // activeKey goes null while visible is still true in the parent.
  const hasBeenActiveRef = useRef(false);

  // Keep a stable ref to onDismiss so the effect below doesn't need it as a dep.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);

  // Show / hide in response to the visible prop.
  useEffect(() => {
    if (!visible) {
      hide(storageKey);
      return;
    }

    // Small delay before measuring — lets the layout stabilise on first mount.
    const timer = setTimeout(async () => {
      const rect = await measure();
      console.log(`[DEBUG] SpotlightHintBubble show: key=${storageKey} rect=`, rect);
      show({
        storageKey,
        measureFn: measure,
        hintType,
        color:        COLOR_MAP[hintColor],
        icon:         ICON_MAP[storageKey] ?? null,
        iconPosition: POSITION_MAP[storageKey] ?? "auto",
        onDismiss,
      });
    }, SPOTLIGHT.MEASURE_DELAY);

    return () => clearTimeout(timer);
    // Intentionally omitting onDismiss — it's captured via onDismissRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, storageKey]);

  // Detect external dismissal: we were the active hint but activeKey became
  // null while the parent still has visible=true (e.g. Android BackHandler
  // called hide() directly without going through onDismiss).
  // Persist the dismissal to AsyncStorage so the hint never reappears.
  useEffect(() => {
    if (activeKey === storageKey) {
      hasBeenActiveRef.current = true;
    } else if (hasBeenActiveRef.current && visible && activeKey === null) {
      hasBeenActiveRef.current = false;
      dismissGuide(storageKey);
      onDismissRef.current?.();
    }
  }, [activeKey, storageKey, visible]);

  if (children) {
    return (
      <View ref={ref} collapsable={false} style={{ position: "relative" }}>
        {children}
      </View>
    );
  }

  return (
    <View
      ref={ref}
      collapsable={false}
      style={RNSheet.absoluteFillObject}
      pointerEvents="none"
    />
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
 *
 * Hints in LOCAL_ONLY_HINTS (e.g. inside a Modal) are skipped — the global
 * SpotlightOverlay lives in the root layout (different native window on iOS)
 * so coordinates won't match.
 */
export default function HintBubble(props: HintBubbleProps) {
  if (LOCAL_ONLY_HINTS.has(props.storageKey)) {
    return <LocalOnlyHint {...props} />;
  }
  return <SpotlightHintBubble {...props} />;
}

function LocalOnlyHint({ visible, children }: HintBubbleProps) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!visible) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [visible]);

  if (children) {
    return (
      <View style={{ position: "relative" }}>
        {children}
        {visible && (
          <Animated.View
            pointerEvents="none"
            style={{
              ...RNSheet.absoluteFillObject,
              borderWidth: 2,
              borderColor: "rgba(120,180,255,0.6)",
              borderRadius: 12,
              opacity: pulse,
            }}
          />
        )}
      </View>
    );
  }

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        ...RNSheet.absoluteFillObject,
        borderWidth: 2,
        borderColor: "rgba(120,180,255,0.6)",
        borderRadius: 12,
        opacity: pulse,
      }}
    />
  );
}

