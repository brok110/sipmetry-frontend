import { apiFetch } from "@/lib/api";
import { getTasteTags } from "@/lib/tasteTags";
import CocktailThumbnail from "@/components/CocktailThumbnail";
import OaklandDusk from "@/constants/OaklandDusk";
import { V3 } from "@/constants/v3DesignTokens";
import { useAuth } from "@/context/auth";
import { useInventory } from "@/context/inventory";
import { usePreferences } from "@/context/preferences";
import { useFavorites } from "@/context/favorites";
import { useInteractions } from "@/context/interactions";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  NativeModules,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

// Stage 2c: Gesture + Reanimated
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";

// Hero thumbnail size unified at 180 across all devices.
// Rationale: editorial layout with 260 overflowed tab bar on all tested
// devices (including iPhone 15 Pro). 180 keeps the card as a visual
// anchor without forcing scroll on standard-size phones.
const DRINK_SIZE = 180;

type Pick = {
  iba_code: string;
  name: string;
  iba_category: string | null;
  style: string | null;
  glass: string | null;
  instructions: string | null;
  ingredient_keys: string[];
  overlap_hits: string[];
  missing_items: string[];
  missing_count: number;
  recipe_vec: Record<string, number> | null;
  score: number;
  material_score: number;
  flavor_score: number;
  anchor_score: number;
  profile_score: number;
  preset_match: boolean;
  image_url?: string | null;
  explain?: string;
};



function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return "good morning";
  if (h < 17) return "good afternoon";
  if (h < 22) return "good evening";
  return "late";
}

// Splits backend explain string into uppercase segments on " · ".
// Returns [] for empty/undefined input. Handles 1, 2, or more segments.
// Examples:
//   "Matches your bar · Bitter & Rich" → ["MATCHES YOUR BAR", "BITTER & RICH"]
//   "Matches your bar"                 → ["MATCHES YOUR BAR"]
//   "Rich & full-bodied"               → ["RICH & FULL-BODIED"]
//   undefined                          → []
function formatExplainSegments(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.toUpperCase().split(" · ").filter(Boolean);
}

export default function BartenderScreen() {
  const { session } = useAuth();
  const { inventory, availableIngredientKeys, initialized: inventoryInitialized } = useInventory();
  const { preferences } = usePreferences();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { track } = useInteractions();

  // Stage 2b: Hero card state
  const [currentPourIndex, setCurrentPourIndex] = useState(0);

  // Stage 2b: Guard to prevent repeated auto-fetch on inventory changes
  const didInitialFetchRef = useRef(false);

  // Stage 2c: Swipe gesture
  const translateX = useSharedValue(0);
  const rotation = useSharedValue(0);
  const resultsRef = useRef<Pick[]>([]);

  const [selectedOccasion, setSelectedOccasion] = useState<string | null>(null);
  const [selectedSpirits, setSelectedSpirits] = useState<string[]>([]);
  const [selectedExcludes, setSelectedExcludes] = useState<string[]>([]);
  const [results, setResults] = useState<Pick[]>([]);
  const [oneAway, setOneAway] = useState<Pick[]>([]);
  const [hint, setHint] = useState<{ preset: string; message_en: string; message_zh: string; suggested_ingredients: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stage 2c: Keep resultsRef synced for stable useCallback refs (swipe gesture)
  useEffect(() => {
    resultsRef.current = results;
    // Reset currentPourIndex if it exceeds new results length (e.g. after retry)
    if (currentPourIndex >= results.length && results.length > 0) {
      setCurrentPourIndex(0);
    }
  }, [results, currentPourIndex]);

  // Stage 2b: Auto-fetch recommendations once inventory hydrates.
  // Guards:
  // - didInitialFetchRef prevents refetch on later inventory changes
  // - inventoryInitialized ensures we know if inventory is really empty
  // - inventory.length > 0 avoids firing API when empty
  useEffect(() => {
    if (didInitialFetchRef.current) return;
    if (!inventoryInitialized) return;
    if (inventory.length === 0) return;

    didInitialFetchRef.current = true;
    fetchRecommendations();
  }, [inventoryInitialized, inventory.length]);  // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (arr: string[], val: string, setter: (v: string[]) => void) => {
    setter(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };

  const fetchRecommendations = async (extraKeys: string[] = []) => {
    setLoading(true);
    setError(null);
    try {
      const allKeys = [...new Set([...availableIngredientKeys, ...extraKeys])];
      const res = await apiFetch("/bartender-recommend", {
        session,
        method: "POST",
        body: {
          detected_ingredients: allKeys,
          occasion: selectedOccasion,
          base_spirit: selectedSpirits.length === 1 ? selectedSpirits[0] : undefined,
          base_spirits: selectedSpirits,
          excludes: selectedExcludes,
          profile_style_preset: preferences.stylePreset,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      let recs = data.recommendations || [];
      let away = data.one_away || [];

      if (preferences.safetyMode?.avoidHighProof) {
        const isHighProof = (pick: Pick) => {
          const strength = Number(pick.recipe_vec?.alcoholStrength ?? 0);
          return strength > 3.5;
        };
        recs = recs.filter((r: Pick) => !isHighProof(r));
        away = away.filter((r: Pick) => !isHighProof(r));
      }

      setResults(recs);
      setOneAway(away);
      setHint(data.hint || null);
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const openRecipe = (pick: Pick) => {
    router.push({
      pathname: "/recipe",
      params: {
        recipe_key: pick.iba_code,
        iba_code: pick.iba_code,
        source: "bartender",
        ingredients_json: encodeURIComponent(JSON.stringify(pick.ingredient_keys)),
        scan_items_json: encodeURIComponent(JSON.stringify(
          inventory.map(item => ({ canonical: item.ingredient_key, display: item.display_name }))
        )),
        missing_items_json: encodeURIComponent(JSON.stringify(pick.missing_items || [])),
        overlap_hits_json: encodeURIComponent(JSON.stringify(pick.overlap_hits || [])),
      },
    });
  };

  // Derive current pick from results + index (used by handlers and Branch 5 render)
  const currentPick = results[currentPourIndex] || null;

  // Stage 2d: Action icon handlers
  const handleSave = useCallback(() => {
    if (!currentPick) return;
    const wasSaved = isFavorite(currentPick.iba_code);

    toggleFavorite({
      recipe_key: currentPick.iba_code,
      iba_code: currentPick.iba_code,
      title: currentPick.name,
      tags: getTasteTags(currentPick.recipe_vec),
      recipe: currentPick,
      ingredients: currentPick.ingredient_keys,
      image_url: currentPick.image_url,
      saved_at: Date.now(),
    });

    track({
      recipe_key: currentPick.iba_code,
      interaction_type: wasSaved ? "unfavorite" : "favorite",
      context: { source: "recommend" },
    });
  }, [currentPick, isFavorite, toggleFavorite, track]);

  const handleSkip = useCallback(() => {
    if (!currentPick) return;
    track({
      recipe_key: currentPick.iba_code,
      interaction_type: "skip",
      context: { source: "recommend" },
    });
    // Move to next pour after recording skip
    setCurrentPourIndex((i) => {
      const len = resultsRef.current.length;
      if (len === 0) return i;
      return (i + 1) % len;
    });
  }, [currentPick, track]);

  // Stage 2c: Pour navigation (cyclic via modulo, stable refs for runOnJS)
  const nextPour = useCallback(() => {
    const len = resultsRef.current.length;
    if (len === 0) return;
    setCurrentPourIndex((i) => (i + 1) % len);
  }, []);

  const prevPour = useCallback(() => {
    const len = resultsRef.current.length;
    if (len === 0) return;
    setCurrentPourIndex((i) => (i - 1 + len) % len);
  }, []);

  // Stage 2c: Pan gesture
  // - activeOffsetX: only activate after 10px horizontal motion
  // - failOffsetY: fail if >5px vertical motion (lets ScrollView handle scroll)
  const SWIPE_THRESHOLD = 60;

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-5, 5])
    .onUpdate((e) => {
      "worklet";
      const clamped = Math.max(-100, Math.min(100, e.translationX));
      translateX.value = clamped * 0.6;  // damped horizontal drag
      rotation.value = clamped * 0.04;    // tilt up to ~4deg at edge
    })
    .onEnd((e) => {
      "worklet";
      if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
        if (e.translationX < 0) {
          runOnJS(nextPour)();
        } else {
          runOnJS(prevPour)();
        }
      }
      translateX.value = withSpring(0);
      rotation.value = withSpring(0);
    });

  const animatedIllustrationStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  // ─────── Stage 2b: Branch render ───────
  const total = results.length;
  const hasInventory = inventory.length > 0;
  const hasResults = total > 0;

  // Branch 0: Inventory context not yet initialized (v2 new)
  // Brief flicker on app open — avoids falsely showing "add bottles to start".
  if (!inventoryInitialized) {
    return (
      <View style={styles.root}>
        <View style={styles.masthead}>
          <Text style={styles.mastheadTitle}>SIPMETRY</Text>
          <Text style={styles.mastheadMeta}>{getTimeOfDay()}</Text>
        </View>
        <View style={styles.centerFill}>
          <ActivityIndicator color={OaklandDusk.brand.gold} size="small" />
        </View>
      </View>
    );
  }

  // Branch 1: Loading (fetch in flight, no results yet)
  if (loading && !hasResults) {
    return (
      <View style={styles.root}>
        <View style={styles.masthead}>
          <Text style={styles.mastheadTitle}>SIPMETRY</Text>
          <Text style={styles.mastheadMeta}>{getTimeOfDay()}</Text>
        </View>
        <View style={styles.centerFill}>
          <View style={styles.skeletonThumb} />
          <View style={styles.skeletonLineLong} />
          <View style={styles.skeletonLineShort} />
          <ActivityIndicator
            color={OaklandDusk.brand.gold}
            size="small"
            style={{ marginTop: 28 }}
          />
        </View>
      </View>
    );
  }

  // Branch 2: Error with retry
  if (error && !loading) {
    return (
      <View style={styles.root}>
        <View style={styles.masthead}>
          <Text style={styles.mastheadTitle}>SIPMETRY</Text>
          <Text style={styles.mastheadMeta}>{getTimeOfDay()}</Text>
        </View>
        <View style={styles.centerFill}>
          <Text style={styles.stateMsg}>Something went wrong.</Text>
          <Text style={styles.stateSubMsg}>{error}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => fetchRecommendations()}
          >
            <Text style={styles.retryBtnText}>TRY AGAIN</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Branch 3: Empty inventory
  if (!hasInventory) {
    return (
      <View style={styles.root}>
        <View style={styles.masthead}>
          <Text style={styles.mastheadTitle}>SIPMETRY</Text>
          <Text style={styles.mastheadMeta}>{getTimeOfDay()}</Text>
        </View>
        <View style={styles.centerFill}>
          <Text style={styles.stateMsg}>add bottles to start</Text>
        </View>
      </View>
    );
  }

  // Branch 4: Empty recommendations (has inventory, no matches)
  if (!hasResults) {
    return (
      <View style={styles.root}>
        <View style={styles.masthead}>
          <Text style={styles.mastheadTitle}>SIPMETRY</Text>
          <Text style={styles.mastheadMeta}>{getTimeOfDay()}</Text>
        </View>
        <View style={styles.centerFill}>
          <Text style={styles.stateMsg}>no matches right now</Text>
        </View>
      </View>
    );
  }

  // Branch 5: Hero card (main happy path)
  // Stage 2d: read favorite state from context for save button appearance
  const isSaved = currentPick ? isFavorite(currentPick.iba_code) : false;
  const explainSegments = formatExplainSegments(currentPick?.explain);
  const ingredientsText = (currentPick?.ingredient_keys || [])
    .map(k => k.replace(/_/g, " "))
    .join(" · ");
  const missingItem = (currentPick?.missing_items?.[0] || "").replace(/_/g, " ");
  const barStatusText = currentPick?.missing_count === 0
    ? `all ${currentPick.ingredient_keys?.length || ""} ingredients on your shelf.`
    : `one away — ${missingItem}.`;

  return (
    <View style={styles.root}>
      {/* Masthead */}
      <View style={styles.masthead}>
        <Text style={styles.mastheadTitle}>SIPMETRY</Text>
        <Text style={styles.mastheadMeta}>{getTimeOfDay()}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.spread}>
          {/* Pour counter */}
          <View style={styles.pourCounterRow}>
            <Text style={[styles.pourCounter, { color: OaklandDusk.text.primary }]}>
              {String(currentPourIndex + 1).padStart(2, "0")}
            </Text>
            <Text style={[styles.pourCounter, { color: `${OaklandDusk.text.primary}2E`, marginHorizontal: 6 }]}>
              /
            </Text>
            <Text style={styles.pourCounter}>
              {String(total).padStart(2, "0")}
            </Text>
          </View>

          {/* Drink illustration with gold corner frame + Stage 2c swipe gesture */}
          <GestureDetector gesture={swipeGesture}>
            <Animated.View style={[styles.drinkIllustration, animatedIllustrationStyle]}>
              <View style={styles.drinkFrameTopLeft} />
              <View style={styles.drinkFrameBottomRight} />
              <CocktailThumbnail imageUrl={currentPick?.image_url} size={DRINK_SIZE} />
            </Animated.View>
          </GestureDetector>

          {/* Drink name */}
          <Text style={styles.drinkName}>
            {currentPick?.name?.toUpperCase() || ""}
          </Text>

          {/* Gold rule line */}
          <View style={styles.drinkRule} />

          {/* Ingredients */}
          <Text style={styles.drinkIngredients}>{ingredientsText}</Text>

          {/* Explain field (v2: segments map, handles 1+ segments gracefully) */}
          {explainSegments.length > 0 && (
            <View style={styles.drinkExplainRow}>
              {explainSegments.map((seg, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <Text style={styles.explainDot}>◆</Text>}
                  <Text style={styles.drinkExplainText}>{seg}</Text>
                </React.Fragment>
              ))}
            </View>
          )}

          {/* Bar status */}
          <Text style={styles.barStatus}>{barStatusText}</Text>

          {/* See the recipe CTA */}
          <Pressable
            style={styles.seeRecipeBtn}
            onPress={() => currentPick && openRecipe(currentPick)}
          >
            <Text style={styles.seeRecipeText}>SEE THE RECIPE</Text>
          </Pressable>

          {/* Action icons (Stage 2d: wired to real handlers) */}
          <View style={styles.spreadActions}>
            <Pressable
              style={[styles.spreadAction, isSaved && styles.spreadActionActive]}
              onPress={handleSave}
            >
              <FontAwesome
                name={isSaved ? "heart" : "heart-o"}
                size={18}
                color={isSaved ? OaklandDusk.brand.gold : `${OaklandDusk.text.primary}94`}
              />
              <Text style={styles.actionLabel}>SAVE</Text>
            </Pressable>
            <Pressable
              style={styles.spreadAction}
              onPress={handleSkip}
            >
              <FontAwesome name="times" size={18} color={`${OaklandDusk.text.primary}94`} />
              <Text style={styles.actionLabel}>SKIP</Text>
            </Pressable>
            <Pressable
              style={styles.spreadAction}
              onPress={nextPour}
            >
              <FontAwesome name="refresh" size={18} color={`${OaklandDusk.text.primary}94`} />
              <Text style={styles.actionLabel}>ANOTHER</Text>
            </Pressable>
          </View>

          {/* Swipe hint (Stage 2b: static; Stage 2c adds gesture) */}
          <Text style={styles.swipeHint}>← swipe for another →</Text>

          {/* Scroll cue */}
          <Text style={styles.scrollCue}>⌄</Text>
        </View>

        {/* Stage 3 will render Index List here */}
      </ScrollView>

    </View>
  );
}

// ─────── Stage 2b: Styles ───────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: OaklandDusk.bg.void,
  },

  // Masthead
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
  mastheadMeta: {
    ...V3.type.mastheadMeta,
    color: `${OaklandDusk.text.primary}94`,
  },

  // Center fill for loading/error/empty states
  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },

  // Loading skeleton
  skeletonThumb: {
    width: DRINK_SIZE,
    height: DRINK_SIZE * 1.15,
    borderRadius: 12,
    backgroundColor: OaklandDusk.bg.card,
    marginBottom: 28,
  },
  skeletonLineLong: {
    width: 200,
    height: 14,
    borderRadius: 4,
    backgroundColor: OaklandDusk.bg.card,
    marginBottom: 10,
  },
  skeletonLineShort: {
    width: 140,
    height: 10,
    borderRadius: 4,
    backgroundColor: OaklandDusk.bg.card,
  },

  // Error / empty state messages
  stateMsg: {
    fontFamily: V3.fonts.cormorant,
    fontStyle: "italic",
    fontSize: 18,
    color: `${OaklandDusk.text.primary}94`,
    textAlign: "center",
    marginBottom: 8,
  },
  stateSubMsg: {
    fontFamily: V3.fonts.mono,
    fontSize: 11,
    letterSpacing: 1,
    color: `${OaklandDusk.text.primary}52`,
    textAlign: "center",
    textTransform: "uppercase",
    marginBottom: 24,
  },
  retryBtn: {
    borderWidth: 1,
    borderColor: OaklandDusk.brand.gold,
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  retryBtnText: {
    fontFamily: V3.fonts.mono,
    fontSize: 11,
    letterSpacing: 3.3,
    color: OaklandDusk.brand.gold,
    textTransform: "uppercase",
  },

  // Spread (main hero card container)
  spread: {
    paddingHorizontal: V3.spacing.spreadPaddingH,
    paddingTop: 16,  // was V3.spacing.spreadPaddingTop (40); tightened for single-page layout
    paddingBottom: V3.spacing.spreadPaddingBottom,
    alignItems: "center",
  },

  // Pour counter
  pourCounterRow: {
    flexDirection: "row",
    marginBottom: 16,
  },
  pourCounter: {
    ...V3.type.pourCounter,
    color: OaklandDusk.brand.gold,
    textTransform: "uppercase",
  },

  // Drink illustration with gold corner frame
  drinkIllustration: {
    width: DRINK_SIZE,
    aspectRatio: 1 / 1.15,
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  drinkFrameTopLeft: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 18,
    height: 18,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: `${OaklandDusk.brand.gold}47`,
    zIndex: 1,
  },
  drinkFrameBottomRight: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderColor: `${OaklandDusk.brand.gold}47`,
    zIndex: 1,
  },

  // Drink name
  drinkName: {
    ...V3.type.drinkName,
    lineHeight: 52,  // override V3 token: RN clips text when lineHeight < fontSize (was 45.6, fontSize 48)
    color: OaklandDusk.text.primary,
    textAlign: "center",
    marginBottom: 0,
  },

  // Gold rule line
  drinkRule: {
    width: 42,
    height: 1,
    backgroundColor: OaklandDusk.brand.gold,
    marginVertical: 8,
  },

  // Ingredients
  drinkIngredients: {
    ...V3.type.drinkIngredients,
    color: `${OaklandDusk.text.primary}94`,
    textAlign: "center",
    textTransform: "lowercase",
    lineHeight: 17,
    marginBottom: 14,
    maxWidth: 260,
  },

  // Explain field row
  drinkExplainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  drinkExplainText: {
    ...V3.type.drinkExplain,
    color: OaklandDusk.brand.gold,
    textTransform: "uppercase",
  },
  explainDot: {
    color: `${OaklandDusk.brand.gold}47`,
    fontSize: 8,
    marginHorizontal: 10,
  },

  // Bar status
  barStatus: {
    ...V3.type.barStatus,
    color: `${OaklandDusk.text.primary}52`,
    textAlign: "center",
    marginBottom: 14,
  },

  // See the recipe CTA (ghost button)
  seeRecipeBtn: {
    borderWidth: 1,
    borderColor: OaklandDusk.brand.gold,
    paddingHorizontal: 42,
    paddingVertical: 12,
    marginBottom: 16,
  },
  seeRecipeText: {
    ...V3.type.seeRecipe,
    color: OaklandDusk.brand.gold,
    textTransform: "uppercase",
  },

  // Action buttons row (Save / Skip / Another)
  spreadActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
    marginBottom: 20,
  },
  spreadAction: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: `${OaklandDusk.text.primary}2E`,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  // Stage 2d: Active state for Save button when favorited
  spreadActionActive: {
    borderColor: OaklandDusk.brand.gold,
    backgroundColor: `${OaklandDusk.brand.gold}1F`,
  },
  actionLabel: {
    position: "absolute",
    bottom: -18,
    left: -20,   // extend label beyond button width; prevents ANOTHER wrapping
    right: -20,
    textAlign: "center",
    ...V3.type.actionLabel,
    color: `${OaklandDusk.text.primary}52`,
    textTransform: "uppercase",
  },

  // Swipe hint (static, Stage 2c will add gesture feedback)
  swipeHint: {
    fontFamily: V3.fonts.mono,
    fontSize: 9,
    letterSpacing: 2.25,
    color: `${OaklandDusk.text.primary}52`,
    textTransform: "uppercase",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 0,
  },

  // Scroll cue (static arrow)
  scrollCue: {
    fontSize: 18,
    color: `${OaklandDusk.text.primary}2E`,
    textAlign: "center",
    paddingVertical: 4,
  },
});
