# IMPLEMENTATION_PLAN.md — Bubble Hint System

## Overview

Replace the yellow text `GuideBubble` with animated bubble hints (TAP = pulsing circles, SWIPE = sliding sphere). Two color variants: Charcoal on gold buttons, Sky blue on dark backgrounds. Full-screen dismiss overlay. Golden path (6 sequential) + standalone (5 independent) = 11 hints total.

**DO NOT** change any existing business logic, navigation, or API calls.
**DO NOT** remove `GuideBubble.tsx` — we replace its default export in-place.
**DO NOT** change any existing `GUIDE_KEYS` values that are already used (they remain for backwards compatibility — users who already dismissed them won't see them again).

---

## Stage 1: New `HintBubble` Component + Updated GUIDE_KEYS

**Goal**: Create the `HintBubble` component with TAP and SWIPE animations, full-screen dismiss overlay, and two color modes. Update `GUIDE_KEYS` with new keys. Replace the default export of `GuideBubble.tsx`.

**Files**: `components/GuideBubble.tsx`

**Success Criteria**:
- `HintBubble` renders TAP pulsing circles or SWIPE sliding sphere
- Charcoal color on gold buttons, sky blue on dark backgrounds
- Full-screen overlay dismiss on tap anywhere
- AsyncStorage dismiss logic preserved (same `dismissGuide`/`isGuideDismissed`)
- TypeScript compiles: `npx tsc --noEmit`

### Actions

**1. Add new GUIDE_KEYS** — find the `GUIDE_KEYS` object (around line 5-23). Add these new keys AFTER the existing ones, inside the same object:

```
BEFORE:
  PREFS_STYLE:   "sipmetry_guide_prefs_style",
} as const;

AFTER:
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
  PROFILE_ROWS:  "sipmetry_guide_profile_rows",
  RECIPE_SHARE:  "sipmetry_guide_recipe_share",
} as const;
```

Note: `MYBAR_SWIPE` and `EDIT_BOTTLE` already exist. We reuse them.

**2. Add `resetAllGuides` update** — the existing `resetAllGuides` function (around line 32-37) already uses `Object.values(GUIDE_KEYS)` so it will automatically include the new keys. No change needed.

**3. Add `isGoldenPathReady` helper** — add this new exported async function AFTER the `isGuideDismissed` function (around line 52):

```typescript
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
```

**4. Replace the default export** — replace the entire `GuideBubble` function component and its styles (from `export default function GuideBubble` around line 70 through end of file) with the new `HintBubble` component. The OLD `GuideBubble` component is the default export — we replace it entirely.

Replace everything from `// ── GuideBubble ──` comment (around line 64) through the end of the file with:

```typescript
// ── HintBubble ────────────────────────────────────────────────────────────────

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import Svg, { Circle, Line, Polyline, G } from "react-native-svg";
import { Pressable as RNPressable, Dimensions, StyleSheet as RNStyleSheet } from "react-native";

type HintColor = "charcoal" | "skyblue";
type HintType = "tap" | "swipe";

const CHARCOAL = {
  ring: "rgba(40,40,40,0.35)",
  ringInner: "rgba(40,40,40,0.5)",
  dot: "rgba(40,40,40,0.55)",
};

const SKYBLUE = {
  ring: "rgba(130,190,255,0.3)",
  ringInner: "rgba(130,190,255,0.45)",
  dot: "rgba(130,190,255,0.5)",
};

function TapPulse({ color }: { color: HintColor }) {
  const c = color === "charcoal" ? CHARCOAL : SKYBLUE;
  // Using react-native-reanimated for smooth animations
  const outerScale = useSharedValue(0.7);
  const outerOpacity = useSharedValue(0.45);
  const innerScale = useSharedValue(0.6);
  const innerOpacity = useSharedValue(0.55);
  const dotOpacity = useSharedValue(0.4);

  React.useEffect(() => {
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

  React.useEffect(() => {
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

  const handleDismiss = () => {
    dismissGuide(storageKey);
    if (onDismiss) onDismiss();
  };

  return (
    <>
      {/* Full-screen dismiss overlay */}
      <RNPressable
        style={hintStyles.overlay}
        onPress={handleDismiss}
      />
      {/* Bubble animation centered on target */}
      <View style={hintStyles.bubbleWrapper} pointerEvents="none">
        {hintType === "tap" ? (
          <TapPulse color={hintColor} />
        ) : (
          <SwipeBubble color={hintColor} />
        )}
      </View>
    </>
  );
}

const hintStyles = RNStyleSheet.create({
  overlay: {
    ...RNStyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
    zIndex: 90,
  },
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
```

**5. Update imports at top of file** — the file currently imports from `react-native`:

Find:
```
import { Animated, StyleSheet, Text, View } from "react-native";
```

Replace with:
```
import { StyleSheet, Text, View } from "react-native";
```

(We remove `Animated` since new component uses `react-native-reanimated` instead. The old `Animated` from RN is no longer needed.)

### Verification

```bash
npx tsc --noEmit
```

All existing files that `import GuideBubble` will still work because the default export signature is backwards-compatible (accepts `text`, `align`, `position` as ignored legacy props).

**Status**: Not Started

---

## Stage 2: Golden Path Steps ① ② ③ ④ — Bartender + Scan Flow

**Goal**: Wire up golden path steps 1-4 across bartender.tsx and scan.tsx with sequential logic.

**Files**: `app/(tabs)/bartender.tsx`, `app/(tabs)/scan.tsx` (previously `scan.tsx` was at path `app/scan.tsx` — verify actual path)

**Success Criteria**:
- Step ① shows on Avoid page, charcoal TAP on gold CTA
- Step ② shows on bottom sheet when bar is empty, sky blue TAP
- Step ③ shows on Scan "Scan bottles" button, charcoal TAP
- Step ④ shows on "Show me recipes" footer, charcoal TAP
- Each step only appears after previous step is dismissed
- `npx tsc --noEmit` passes

### Actions — bartender.tsx

**1. Add imports** — find the existing imports at top of file. Add after the last import:

```typescript
import HintBubble, { GUIDE_KEYS, dismissGuide, isGoldenPathStepReady } from "@/components/GuideBubble";
```

**2. Add state** — find `const [showStaples, setShowStaples] = useState(false);` (around line 230). Add after it:

```typescript
const [gpStep1Visible, setGpStep1Visible] = useState(false);
const [gpStep2Visible, setGpStep2Visible] = useState(false);
```

**3. Check GP step 1 when reaching Avoid page** — find the `onPageSelected` handler (around line 526):

```
onPageSelected={(e) => {
  setActiveIndex(e.nativeEvent.position);
}}
```

Replace with:

```
onPageSelected={(e) => {
  const pos = e.nativeEvent.position;
  setActiveIndex(pos);
  if (pos === PAGE_COUNT - 1) {
    // Reached Avoid page — check if GP step 1 should show
    isGoldenPathStepReady(1).then((ready) => {
      if (ready) setGpStep1Visible(true);
    });
  }
}}
```

**4. Add HintBubble to "Let's make a drink" button** — find the CTA `<Pressable onPress={() => setShowBottomSheet(true)}` (around line 679). The button is wrapped in a `<View style={{ paddingHorizontal: 20, ... }}>`. Add the hint inside that View, before the Pressable:

Find:
```
      <View style={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12 }}>
        <Pressable
          onPress={() => setShowBottomSheet(true)}
```

Replace with:
```
      <View style={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12, position: "relative" }}>
        <HintBubble
          storageKey={GUIDE_KEYS.GP_STEP_1}
          visible={gpStep1Visible}
          onDismiss={() => setGpStep1Visible(false)}
          hintType="tap"
          hintColor="charcoal"
        />
        <Pressable
          onPress={() => setShowBottomSheet(true)}
```

**5. Dismiss GP step 1 when button pressed** — find `onPress={() => setShowBottomSheet(true)}` (same Pressable). Replace with:

```
onPress={() => {
  if (gpStep1Visible) {
    dismissGuide(GUIDE_KEYS.GP_STEP_1);
    setGpStep1Visible(false);
  }
  setShowBottomSheet(true);
}}
```

**6. Check GP step 2 when bottom sheet opens (empty bar)** — find `<Modal visible={showBottomSheet}` (around line 699). Add a `useEffect` BEFORE the return statement (around line 518, before `if (showResults)`):

```typescript
// GP step 2: check when bottom sheet opens with empty bar
useEffect(() => {
  if (showBottomSheet && inventory.length === 0) {
    isGoldenPathStepReady(2).then((ready) => {
      if (ready) setGpStep2Visible(true);
    });
  } else {
    setGpStep2Visible(false);
  }
}, [showBottomSheet, inventory.length]);
```

**7. Add HintBubble to "Scan my bottles" option in bottom sheet** — find the empty-bar branch `inventory.length > 0 ? (` ... `) : (` (around line 787-815). Inside the empty-bar `<View style={{ gap: 12 }}>`, find the `<Pressable onPress={...} style={{ borderWidth: 1, borderColor: OaklandDusk.brand.gold, ...` for "Scan my bottles" (around line 789). Wrap it:

Find the `<Pressable` for "Scan my bottles" (the one with `router.push("/scan?intent=addToBar")` in the empty-bar section, around line 789):

Add `position: "relative"` to the outer `<View style={{ gap: 12 }}>`:

```
<View style={{ gap: 12, position: "relative" }}>
```

Then add HintBubble inside that View, before the Pressable:

```
<HintBubble
  storageKey={GUIDE_KEYS.GP_STEP_2}
  visible={gpStep2Visible}
  onDismiss={() => setGpStep2Visible(false)}
  hintType="tap"
  hintColor="skyblue"
/>
```

**8. Dismiss GP step 2 when "Scan my bottles" pressed** — find the `onPress` of that same Pressable:

```
onPress={() => {
  setShowBottomSheet(false);
  router.push("/scan?intent=addToBar");
}}
```

Replace with:

```
onPress={() => {
  if (gpStep2Visible) {
    dismissGuide(GUIDE_KEYS.GP_STEP_2);
    setGpStep2Visible(false);
  }
  setShowBottomSheet(false);
  router.push("/scan?intent=addToBar");
}}
```

### Actions — scan.tsx

**9. Update imports** — find the existing GuideBubble import (line 7):

```
import GuideBubble, { GUIDE_KEYS, dismissGuide, isGuideDismissed } from "@/components/GuideBubble";
```

Replace with:

```
import HintBubble, { GUIDE_KEYS, dismissGuide, isGuideDismissed, isGoldenPathStepReady } from "@/components/GuideBubble";
```

**10. Add GP state** — find `const [guideCocktailsVisible, setGuideCocktailsVisible] = useState(false);` (line 616). Add after:

```typescript
const [gpStep3Visible, setGpStep3Visible] = useState(false);
const [gpStep4Visible, setGpStep4Visible] = useState(false);
```

**11. Initialize GP step 3 on mount** — find the existing guide init `useEffect` (around line 657-668). Add inside it, after the `isGuideDismissed(GUIDE_KEYS.COCKTAILS)` call:

```typescript
    isGoldenPathStepReady(3).then((ready) => {
      if (ready) setGpStep3Visible(true);
    });
```

**12. Initialize GP step 4 when entering review phase** — find the existing `useEffect` that watches `scanPhase` for showing cocktails guide. Look for the `guideCocktailsVisible` setup. We also need to check GP step 4 when `scanPhase === "review"`. Add a new useEffect after the guide init block (around line 668):

```typescript
// GP step 4: check when entering review phase
useEffect(() => {
  if (scanPhase === "review") {
    isGoldenPathStepReady(4).then((ready) => {
      if (ready) setGpStep4Visible(true);
    });
  }
}, [scanPhase]);
```

**13. Replace GuideBubble on "Scan bottles" button** — find the existing `<GuideBubble` on the Scan bottles button (around line 1938-1942):

```
        <GuideBubble
          storageKey={GUIDE_KEYS.SCAN}
          text={isZh ? "點這裡開始！" : "Tap here to start!"}
          visible={guideScanVisible}
          onDismiss={() => setGuideScanVisible(false)}
        />
```

Replace with:

```
        <HintBubble
          storageKey={GUIDE_KEYS.GP_STEP_3}
          visible={gpStep3Visible}
          onDismiss={() => setGpStep3Visible(false)}
          hintType="tap"
          hintColor="charcoal"
        />
```

**14. Dismiss GP step 3 on scan button press** — find the `handleScanBottles` function (search for `function handleScanBottles` or the assignment). Find where it calls `dismissGuide(GUIDE_KEYS.SCAN)` (around line 1740). Add after it:

```typescript
    dismissGuide(GUIDE_KEYS.GP_STEP_3);
    setGpStep3Visible(false);
```

**15. Replace GuideBubble on "Show me recipes" footer** — find the existing `<GuideBubble` on the sticky footer (around line 2326-2331):

```
          <GuideBubble
            storageKey={GUIDE_KEYS.COCKTAILS}
            text={isZh ? "看你的雞尾酒！" : "See your cocktails!"}
            visible={guideCocktailsVisible && activeIngredients.length > 0}
            onDismiss={() => setGuideCocktailsVisible(false)}
          />
```

Replace with:

```
          <HintBubble
            storageKey={GUIDE_KEYS.GP_STEP_4}
            visible={gpStep4Visible && activeIngredients.length > 0}
            onDismiss={() => setGpStep4Visible(false)}
            hintType="tap"
            hintColor="charcoal"
          />
```

**16. Dismiss GP step 4 on "Show me recipes" press** — find the Pressable `onPress` for "Show me recipes" (around line 2333-2336):

```
            onPress={() => {
              dismissGuide(GUIDE_KEYS.COCKTAILS);
              setGuideCocktailsVisible(false);
              setShowStaplesModal(true);
            }}
```

Replace with:

```
            onPress={() => {
              dismissGuide(GUIDE_KEYS.COCKTAILS);
              setGuideCocktailsVisible(false);
              dismissGuide(GUIDE_KEYS.GP_STEP_4);
              setGpStep4Visible(false);
              setShowStaplesModal(true);
            }}
```

### Verification

```bash
npx tsc --noEmit
```

Manual test:
1. Fresh user (or `resetAllGuides()`) → open Bartender → swipe to Avoid page → charcoal pulse on "Let's make a drink"
2. Tap button → bottom sheet opens → sky blue pulse on "Scan my bottles"
3. Tap "Scan my bottles" → Scan page → charcoal pulse on "Scan bottles"
4. Scan a photo → press Done → sticky footer appears → charcoal pulse on "Show me recipes"

**Status**: Not Started

---

## Stage 3: Golden Path Steps ⑤ ⑥ — Recommendations + Recipe

**Goal**: Wire up golden path steps 5-6 on recommendations and recipe pages.

**Files**: `app/recommendations.tsx`, `app/recipe.tsx`

**Success Criteria**:
- Step ⑤ shows on first Ready recipe card in recommendations
- Step ⑥ shows on "I made this" button in recipe detail
- Sequential logic enforced
- `npx tsc --noEmit` passes

### Actions — recommendations.tsx

**1. Add imports** — add after existing imports (around line 13):

```typescript
import HintBubble, { GUIDE_KEYS, dismissGuide, isGoldenPathStepReady } from "@/components/GuideBubble";
```

**2. Add state** — add inside the `RecommendationsScreen` function, after the existing state declarations (around line 80):

```typescript
const [gpStep5Visible, setGpStep5Visible] = useState(false);
```

**3. Check GP step 5 on mount** — add a new `useEffect` after existing useEffects (around line 112):

```typescript
useEffect(() => {
  isGoldenPathStepReady(5).then((ready) => {
    if (ready) setGpStep5Visible(true);
  });
}, []);
```

**4. Add HintBubble to first Ready card** — find the `RecipeCard` component (around line 207). We need to add a hint to the first ready card.

Find where ready cards are rendered (around line 401):

```
            {ready.map((r, i) => (
              <RecipeCard key={`ready-${i}`} r={r} idx={i} isFirstCard={false} />
            ))}
```

Replace with:

```
            {ready.map((r, i) => (
              <View key={`ready-${i}`} style={i === 0 ? { position: "relative" } : undefined}>
                {i === 0 && (
                  <HintBubble
                    storageKey={GUIDE_KEYS.GP_STEP_5}
                    visible={gpStep5Visible}
                    onDismiss={() => setGpStep5Visible(false)}
                    hintType="tap"
                    hintColor="skyblue"
                  />
                )}
                <RecipeCard r={r} idx={i} isFirstCard={false} />
              </View>
            ))}
```

Also add `import { useState, useEffect, useMemo } from "react";` — verify `useState` and `useEffect` are already imported (line 3 has `React, { useEffect, useMemo, useState }`). Good, they are.

Add `View` to the existing react-native import if not already there. Check line 4: `{ Platform, Pressable, ScrollView, Text, View }` — `View` is already imported. Good.

**5. Dismiss GP step 5 when card tapped** — find the `openRecipe` function (around line 158). Add at the beginning of the function body:

```typescript
    // Dismiss GP step 5 if showing
    if (gpStep5Visible) {
      dismissGuide(GUIDE_KEYS.GP_STEP_5);
      setGpStep5Visible(false);
    }
```

### Actions — recipe.tsx

**6. Add imports** — add after existing imports (around line 10):

```typescript
import HintBubble, { GUIDE_KEYS, dismissGuide, isGoldenPathStepReady, isGuideDismissed } from "@/components/GuideBubble";
```

**7. Add state** — find the state declarations area (around line 377). Add after `const [servings, setServings] = useState(1);`:

```typescript
const [gpStep6Visible, setGpStep6Visible] = useState(false);
const [shareHintVisible, setShareHintVisible] = useState(false);
```

**8. Check GP step 6 + share hint on mount** — add a new `useEffect` after existing ones (find a good spot around line 510):

```typescript
// GP step 6 + standalone share hint
useEffect(() => {
  isGoldenPathStepReady(6).then((ready) => {
    if (ready) setGpStep6Visible(true);
  });
  isGuideDismissed(GUIDE_KEYS.RECIPE_SHARE).then((dismissed) => {
    if (!dismissed) setShareHintVisible(true);
  });
}, []);
```

**9. Add HintBubble to "I made this" button** — find the "I made this" Pressable (around line 1320). It's wrapped in a conditional `{madeDrinkState !== 'hidden' ? (`. Add position relative and hint:

Find:
```
          <Pressable
            onPress={handleMadeDrink}
            disabled={madeDrinkLoading || madeDrinkState === 'done'}
            style={{
              borderRadius: 12,
```

Wrap it — change the parent conditional to include hint:

Before the `<Pressable onPress={handleMadeDrink}` (around line 1320), add:

```
          <View style={{ position: "relative" }}>
            <HintBubble
              storageKey={GUIDE_KEYS.GP_STEP_6}
              visible={gpStep6Visible && madeDrinkState === 'idle'}
              onDismiss={() => setGpStep6Visible(false)}
              hintType="tap"
              hintColor="charcoal"
            />
```

And close the `</View>` after the Pressable's closing tag (after line 1341 `</Pressable>`):

```
          </View>
```

**10. Dismiss GP step 6 when "I made this" tapped** — find `handleMadeDrink` function (search for `const handleMadeDrink`). Add at the beginning of the function body:

```typescript
    if (gpStep6Visible) {
      dismissGuide(GUIDE_KEYS.GP_STEP_6);
      setGpStep6Visible(false);
    }
```

**11. Add HintBubble to share icon (standalone Ⓔ)** — find the share Pressable (around line 1167):

```
            <Pressable onPress={handleSharePress} hitSlop={14} accessibilityLabel="Share recipe" accessibilityRole="button" style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
              <FontAwesome name="share" color={OaklandDusk.text.tertiary} size={18} />
            </Pressable>
```

Replace with:

```
            <View style={{ position: "relative" }}>
              <HintBubble
                storageKey={GUIDE_KEYS.RECIPE_SHARE}
                visible={shareHintVisible}
                onDismiss={() => setShareHintVisible(false)}
                hintType="tap"
                hintColor="skyblue"
              />
              <Pressable onPress={() => {
                if (shareHintVisible) {
                  dismissGuide(GUIDE_KEYS.RECIPE_SHARE);
                  setShareHintVisible(false);
                }
                handleSharePress();
              }} hitSlop={14} accessibilityLabel="Share recipe" accessibilityRole="button" style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
                <FontAwesome name="share" color={OaklandDusk.text.tertiary} size={18} />
              </Pressable>
            </View>
```

### Verification

```bash
npx tsc --noEmit
```

Manual test:
1. After step ④ → enter Recommendations → sky blue pulse on first Ready card
2. Tap card → Recipe page → charcoal pulse on "I made this" + sky blue pulse on share icon
3. Dismiss share hint → only "I made this" pulse remains
4. Tap "I made this" → both dismissed

**Status**: Not Started

---

## Stage 4: Standalone Hints Ⓐ Ⓑ Ⓒ Ⓓ — My Bar, Restock, Profile

**Goal**: Update existing hints A and D to use `HintBubble`, add new hints B and C.

**Files**: `app/(tabs)/inventory.tsx`, `app/(tabs)/cart.tsx`, `app/(tabs)/profile.tsx`

**Success Criteria**:
- Ⓐ My Bar swipe hint uses sky blue SWIPE bubble (replaces old GuideBubble)
- Ⓑ Smart Restock "Find" button uses charcoal TAP bubble
- Ⓒ Profile Preferences + Favorites rows show sky blue TAP ×2 simultaneously
- Ⓓ Edit bottle slider uses sky blue SWIPE bubble (replaces old GuideBubble)
- `npx tsc --noEmit` passes

### Actions — inventory.tsx

**1. Update imports** — find the GuideBubble import (line 5):

```
import GuideBubble, { GUIDE_KEYS, dismissGuide, isGuideDismissed } from '@/components/GuideBubble'
```

Replace with:

```
import HintBubble, { GUIDE_KEYS, dismissGuide, isGuideDismissed } from '@/components/GuideBubble'
```

**2. Replace swipe GuideBubble in InventoryCardWithGuide** — find the `<GuideBubble` in `InventoryCardWithGuide` (around line 547-554):

```
        <GuideBubble
          storageKey={GUIDE_KEYS.MYBAR_SWIPE}
          text="Swipe left to edit or remove!"
          visible={!guideSwipeDismissed}
          onDismiss={onSwipeOpen}
          align="right"
          position="below"
        />
```

Replace with:

```
        <HintBubble
          storageKey={GUIDE_KEYS.MYBAR_SWIPE}
          visible={!guideSwipeDismissed}
          onDismiss={onSwipeOpen}
          hintType="swipe"
          hintColor="skyblue"
        />
```

**3. Replace GuideBubble on edit bottle slider** — find the `<GuideBubble` in `EditBottleModal` (around line 428-435):

```
            <GuideBubble
              storageKey={GUIDE_KEYS.EDIT_BOTTLE}
              text="Drag to set remaining level!"
              visible={guideEditBottleVisible}
              onDismiss={() => setGuideEditBottleVisible(false)}
              position="above"
              align="center"
            />
```

Replace with:

```
            <HintBubble
              storageKey={GUIDE_KEYS.EDIT_BOTTLE}
              visible={guideEditBottleVisible}
              onDismiss={() => setGuideEditBottleVisible(false)}
              hintType="swipe"
              hintColor="skyblue"
            />
```

### Actions — cart.tsx

**4. Update imports** — find the GuideBubble import (line 17):

```
import GuideBubble, { GUIDE_KEYS, dismissGuide, isGuideDismissed } from "@/components/GuideBubble";
```

Replace with:

```
import HintBubble, { GUIDE_KEYS, dismissGuide, isGuideDismissed } from "@/components/GuideBubble";
```

**5. Replace GuideBubble on "Get Recommendations" button** — find the `<GuideBubble` (around line 227-231):

```
          <GuideBubble
            storageKey={GUIDE_KEYS.CART}
            text="Tap to see suggestions!"
            visible={guideCartVisible}
            onDismiss={() => setGuideCartVisible(false)}
            position="below"
          />
```

Replace with:

```
          <HintBubble
            storageKey={GUIDE_KEYS.CART}
            visible={guideCartVisible}
            onDismiss={() => setGuideCartVisible(false)}
            hintType="tap"
            hintColor="charcoal"
          />
```

**6. Add "Find [ingredient]" hint (standalone Ⓑ)** — add state for the restock find hint. Find `const [guideCartVisible, setGuideCartVisible] = useState(false);` (line 94). Add after:

```typescript
const [guideRestockFindVisible, setGuideRestockFindVisible] = useState(false);
```

**7. Initialize restock find hint** — find `isGuideDismissed(GUIDE_KEYS.CART).then(...)` (line 97). Add after:

```typescript
    isGuideDismissed(GUIDE_KEYS.RESTOCK_FIND).then((d) => setGuideRestockFindVisible(!d));
```

**8. Add HintBubble to first "Find" button** — find where primary suggestions are rendered. Search for `Find {s.display_name}` (around line 469). This is inside a `.map()`. We need to add the hint only to the first primary suggestion's Find button.

Find the `primarySuggestions.map` (or equivalent) rendering block. The Find button is inside a `<Pressable` with the text "Find {s.display_name}". Look for the parent mapping — it should be something like `{primarySuggestions.slice(0, 3).map((s, i) => {` or similar.

Add a wrapper around the first Find button. Inside the map, find the `<Pressable` that contains `Find {s.display_name}` (around line 456-471). Wrap ONLY the first one:

Before the Find `<Pressable`:

```
              {i === 0 && (
                <View style={{ position: "relative" }}>
                  <HintBubble
                    storageKey={GUIDE_KEYS.RESTOCK_FIND}
                    visible={guideRestockFindVisible}
                    onDismiss={() => setGuideRestockFindVisible(false)}
                    hintType="tap"
                    hintColor="charcoal"
                  />
                </View>
              )}
```

Note: The hint overlay covers the whole card, so it doesn't need to be inside the Pressable. Adding it before the first Find button is sufficient. Dismissing the overlay will reveal the button.

Also dismiss on button press — find the `onPress` of the Find Pressable (around line 456). If no explicit onPress handler, find `trackAndOpenPurchaseLink` or similar. Add at top of that handler for the first item:

```typescript
                if (i === 0 && guideRestockFindVisible) {
                  dismissGuide(GUIDE_KEYS.RESTOCK_FIND);
                  setGuideRestockFindVisible(false);
                }
```

### Actions — profile.tsx

**NOTE**: Cowork needs to first read `app/(tabs)/profile.tsx` to understand its structure. The file was not provided in uploads. Locate it via:

```bash
grep -rn "Preferences\|Favorites\|profile.*row\|router.*push.*preferences\|router.*push.*favorites" app/(tabs)/profile.tsx | head -20
```

**9. Add imports to profile.tsx**:

```typescript
import HintBubble, { GUIDE_KEYS, dismissGuide, isGuideDismissed } from "@/components/GuideBubble";
```

**10. Add state**:

```typescript
const [guideProfileRowsVisible, setGuideProfileRowsVisible] = useState(false);
```

**11. Initialize on mount**:

```typescript
useEffect(() => {
  isGuideDismissed(GUIDE_KEYS.PROFILE_ROWS).then((d) => {
    if (!d) setGuideProfileRowsVisible(true);
  });
}, []);
```

**12. Add HintBubble to Preferences row** — find the Pressable/row for "Preferences" (navigates to `profile/preferences`). Wrap it in `position: "relative"` and add:

```
<HintBubble
  storageKey={GUIDE_KEYS.PROFILE_ROWS}
  visible={guideProfileRowsVisible}
  onDismiss={() => {
    setGuideProfileRowsVisible(false);
    dismissGuide(GUIDE_KEYS.PROFILE_ROWS);
  }}
  hintType="tap"
  hintColor="skyblue"
/>
```

**13. Add HintBubble to Favorites row** — same pattern, same `storageKey` (PROFILE_ROWS), same `visible` state. Both bubbles share the same key so dismissing one dismisses both:

```
<HintBubble
  storageKey={GUIDE_KEYS.PROFILE_ROWS}
  visible={guideProfileRowsVisible}
  onDismiss={() => {
    setGuideProfileRowsVisible(false);
    dismissGuide(GUIDE_KEYS.PROFILE_ROWS);
  }}
  hintType="tap"
  hintColor="skyblue"
/>
```

**IMPORTANT**: Both hints share the SAME `GUIDE_KEYS.PROFILE_ROWS` key and SAME `guideProfileRowsVisible` state. Dismissing the overlay from either one sets the state to false, hiding both simultaneously. But since both have full-screen overlays, only ONE overlay should render. Solution: add the overlay only to the FIRST hint (Preferences row), and make the second hint render only the bubble animation without overlay.

Actually, simpler approach: only ONE HintBubble for the Preferences row provides the overlay. For the Favorites row, just render the `TapPulse` animation directly (without `HintBubble` wrapper):

For Favorites row, instead of `<HintBubble>`, render:

```
{guideProfileRowsVisible && (
  <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", zIndex: 100 }} pointerEvents="none">
    <TapPulse color="skyblue" />
  </View>
)}
```

This requires exporting `TapPulse` from GuideBubble.tsx. Add `export` before `function TapPulse`:

```typescript
export function TapPulse({ color }: { color: HintColor }) {
```

### Verification

```bash
npx tsc --noEmit
```

Manual test:
- Ⓐ My Bar with bottles → sky blue swipe bubble on first card
- Ⓑ Smart Restock with results → charcoal tap pulse on first "Find" button
- Ⓒ Profile tab → sky blue tap pulses on Preferences AND Favorites rows
- Ⓓ Edit bottle modal → sky blue swipe bubble on slider

**Status**: Not Started

---

## Stage 5: Cleanup + Remove Old GuideBubble References

**Goal**: Remove any remaining old `GuideBubble` yellow text references, ensure no duplicate hints, verify all 11 hints work.

**Files**: All files that previously imported `GuideBubble`

**Success Criteria**:
- No yellow `#F0C848` text bubbles remain anywhere in the app
- All 11 hints render correctly
- No TypeScript errors
- `npx tsc --noEmit` passes

### Actions

**1. Search for remaining GuideBubble JSX** — check if any file still renders the old `<GuideBubble` tag (since we renamed the import to `HintBubble`, any remaining `<GuideBubble` would be a compile error):

```bash
grep -rn "<GuideBubble" app/ components/
```

If any remain, replace them with `<HintBubble` using the appropriate `hintType` and `hintColor` props.

**2. Check for old GuideBubble references in scan.tsx** — scan.tsx has several commented-out GuideBubble references (lines 662, 1841, 1849, 1853, 2466). These are already commented out. Leave them as-is.

**3. Remove the old `BUBBLE_COLOR` constant** — the old `#F0C848` yellow color constant should have been removed in Stage 1 when we replaced the default export. Verify it's gone:

```bash
grep -rn "F0C848\|BUBBLE_COLOR" components/GuideBubble.tsx
```

**4. Verify GUIDE_KEYS.SCAN and GUIDE_KEYS.COCKTAILS** — these old keys are still used in scan.tsx for the original dismiss logic (`dismissGuide(GUIDE_KEYS.SCAN)` in `handleScanBottles`, `dismissGuide(GUIDE_KEYS.COCKTAILS)` in "Show me recipes"). This is fine — they provide backwards compat so users who already saw the old hints won't see them again. The NEW GP keys are separate.

**5. Add `resetAllGuides` to dev menu** — if there's a dev/debug menu or button, ensure `resetAllGuides` is accessible for testing. This should already work since it uses `Object.values(GUIDE_KEYS)`.

### Verification

```bash
npx tsc --noEmit
```

Full manual test checklist (fresh user or after `resetAllGuides()`):

**Golden path:**
- [ ] ① Bartender → swipe to Avoid → charcoal TAP on "Let's make a drink"
- [ ] ② Tap button → bottom sheet → sky blue TAP on "Scan my bottles"
- [ ] ③ Tap "Scan my bottles" → Scan page → charcoal TAP on "Scan bottles"
- [ ] ④ Scan + Done → sticky footer → charcoal TAP on "Show me recipes"
- [ ] ⑤ Enter Recommendations → sky blue TAP on first Ready card
- [ ] ⑥ Open recipe → charcoal TAP on "I made this"

**Standalone:**
- [ ] Ⓐ My Bar (with bottles) → sky blue SWIPE on first bottle card
- [ ] Ⓑ Smart Restock (with results) → charcoal TAP on first "Find" button
- [ ] Ⓒ Profile tab → sky blue TAP on Preferences + Favorites (simultaneous)
- [ ] Ⓓ Edit bottle modal → sky blue SWIPE on remaining slider
- [ ] Ⓔ Recipe detail → sky blue TAP on share icon

**Dismiss behavior:**
- [ ] Tap anywhere on overlay → hint disappears → doesn't reappear on revisit
- [ ] Performing target action → hint disappears → doesn't reappear

**Sequential enforcement:**
- [ ] Skip to Scan directly (not via golden path) → GP step 3 does NOT show (GP step 2 not dismissed)
- [ ] After completing all 6 steps → none reappear

**Status**: Not Started

---

## Git

After all stages pass:

```bash
git add . && git commit -m "feat: bubble hint system — 11 animated hints replacing yellow GuideBubble

- HintBubble component: TAP pulse + SWIPE sphere animations
- Charcoal bubbles on gold buttons, sky blue on dark backgrounds
- Golden path: 6 sequential steps (bartender → recipe)
- Standalone: 5 independent hints (my bar, restock, profile, edit, share)
- Full-screen dismiss overlay, AsyncStorage persistence
- Backwards-compatible with existing GUIDE_KEYS" && git push
```
