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

/**
 * Format ingredient keys for compact entry display.
 * Shows first 3 lowercase, space-separated by " · ", appends "+N more" if truncated.
 * Example: ["gin", "campari", "sweet_vermouth"] → "gin · campari · sweet vermouth"
 * Example: ["gin", "vodka", "lillet_blanc", "lemon_twist"] → "gin · vodka · lillet blanc +1 MORE"
 */
function formatEntryIngredients(keys: string[] | null | undefined): string {
  if (!Array.isArray(keys) || keys.length === 0) return "";
  const cleaned = keys.map(k => k.replace(/_/g, " "));
  if (cleaned.length <= 3) return cleaned.join(" · ");
  return `${cleaned.slice(0, 3).join(" · ")} +${cleaned.length - 3} MORE`;
}

/**
 * Format entry status for missing ingredients display.
 * 0 missing: "on your shelf" (ready)
 * 1 missing: "missing: {name}"
 * 2+ missing: "missing: {first name} +{N-1} more"
 */
function formatEntryStatus(pick: Pick): { text: string; ready: boolean } {
  const missingCount = pick.missing_count ?? 0;
  if (missingCount === 0) {
    return { text: "on your shelf", ready: true };
  }
  const firstMissing = (pick.missing_items?.[0] || "").replace(/_/g, " ");
  if (missingCount === 1) {
    return { text: `missing: ${firstMissing}`, ready: false };
  }
  return { text: `missing: ${firstMissing} +${missingCount - 1} more`, ready: false };
}

// Stage 3b: Filter chip definitions.
// `val` is the exact value sent to /bartender-recommend; `label` is UI display.
// Style `val` MUST be case-sensitive (matches PREF_STYLE_PRESETS_JSON keys on server).
const OCCASION_CHIPS: { val: string; label: string }[] = [
  { val: "home",     label: "AT HOME" },
  { val: "meal",     label: "WITH A MEAL" },
  { val: "party",    label: "FOR A PARTY" },
  { val: "nightcap", label: "NIGHTCAP" },
];

const STYLE_CHIPS: { val: string; label: string }[] = [
  { val: "Bitter",    label: "BITTER" },
  { val: "Smoky",     label: "SMOKY" },
  { val: "Herbal",    label: "HERBAL" },
  { val: "Fruity",    label: "FRUITY" },
  { val: "Sparkling", label: "SPARKLING" },
];

const SPIRIT_CHIPS: { val: string; label: string }[] = [
  { val: "gin",     label: "GIN" },
  { val: "whiskey", label: "WHISKEY" },
  { val: "rum",     label: "RUM" },
  { val: "tequila", label: "TEQUILA" },
  { val: "brandy",  label: "BRANDY" },
];

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
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
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
          style_presets: selectedStyles,
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

  // Stage 3a: Index list entries (exclude current hero, append oneAway picks)
  const indexEntries = [
    ...results.filter((_, i) => i !== currentPourIndex),
    ...oneAway,
  ];

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

        {/* Stage 3a: Index List */}
        {indexEntries.length > 0 && (
          <View style={styles.indexPage}>
            {/* Index head */}
            <View style={styles.indexHead}>
              <Text style={styles.indexKicker}>THE LIST</Text>
              <Text style={styles.indexTitle}>
                {`${indexEntries.length} MORE ON TONIGHT`}
              </Text>
              <Text style={styles.indexSub}>ranked by fit to your bar &amp; taste</Text>
            </View>

            {/* Stage 3b: Filter disclosure (static — always open in 3b-2) */}
            <View style={styles.filterDisclosure}>
              <Pressable onPress={() => { /* 3b-3 wires this */ }}>
                <Text style={styles.filterToggle}>Narrow the list  +</Text>
              </Pressable>
            </View>

            {/* Stage 3b: Chips panel (static — always open in 3b-2) */}
            <View style={styles.chipsPanel}>
              <View style={styles.chipsGroup}>
                <Text style={styles.chipsLabel}>OCCASION</Text>
                <View style={styles.chipRow}>
                  {OCCASION_CHIPS.map((c) => (
                    <Pressable key={c.val} style={styles.chip} onPress={() => { /* 3b-3 */ }}>
                      <Text style={styles.chipText}>{c.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.chipsGroup}>
                <Text style={styles.chipsLabel}>STYLE</Text>
                <View style={styles.chipRow}>
                  {STYLE_CHIPS.map((c) => (
                    <Pressable key={c.val} style={styles.chip} onPress={() => { /* 3b-3 */ }}>
                      <Text style={styles.chipText}>{c.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.chipsGroup}>
                <Text style={styles.chipsLabel}>BASE SPIRIT</Text>
                <View style={styles.chipRow}>
                  {SPIRIT_CHIPS.map((c) => (
                    <Pressable key={c.val} style={styles.chip} onPress={() => { /* 3b-3 */ }}>
                      <Text style={styles.chipText}>{c.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            {/* Entries */}
            {indexEntries.map((pick, i) => {
              const status = formatEntryStatus(pick);
              return (
                <Pressable
                  key={pick.iba_code}
                  style={styles.entry}
                  onPress={() => openRecipe(pick)}
                >
                  <Text style={styles.entryNum}>{String(i + 1).padStart(2, "0")}</Text>
                  <View style={styles.entryViz}>
                    <CocktailThumbnail imageUrl={pick.image_url} size={60} />
                  </View>
                  <View style={styles.entryContent}>
                    <Text style={styles.entryName}>{pick.name.toUpperCase()}</Text>
                    <Text style={styles.entryIngr}>
                      {formatEntryIngredients(pick.ingredient_keys).toUpperCase()}
                    </Text>
                    {pick.explain && (
                      <Text style={styles.entryExplain}>
                        {pick.explain.toUpperCase()}
                      </Text>
                    )}
                    <Text
                      style={[
                        styles.entryStatus,
                        status.ready && styles.entryStatusReady,
                      ]}
                    >
                      {status.text}
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            {/* Personalize block */}
            <Pressable
              style={styles.personalize}
              onPress={() => router.push("/profile/preferences")}
            >
              <Text style={styles.personalizeTitle}>TASTE PREFERENCES</Text>
              <Text style={styles.personalizeSub}>tune your recommendations</Text>
            </Pressable>
          </View>
        )}
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

  // ─────── Stage 3a: Index List ───────

  indexPage: {
    paddingHorizontal: V3.spacing.indexPaddingH,   // 26
    paddingTop: 24,  // override V3 token (44); tightened for mobile
    paddingBottom: V3.spacing.indexPaddingBottom,   // 32
    borderTopWidth: 1,
    borderTopColor: `${OaklandDusk.brand.gold}14`,  // 8% alpha faint gold separator
  },

  // Index head
  indexHead: {
    alignItems: "center",
    marginBottom: 32,
  },
  indexKicker: {
    ...V3.type.indexKicker,
    color: OaklandDusk.brand.gold,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  indexTitle: {
    ...V3.type.indexTitle,
    fontSize: 22,      // override V3 token (26); lighter on mobile
    color: OaklandDusk.text.primary,
    textTransform: "uppercase",
    textAlign: "center",
  },
  indexSub: {
    ...V3.type.indexSub,
    color: `${OaklandDusk.text.primary}94`,  // textDim equivalent
    textAlign: "center",
    marginTop: 6,
  },

  // ─────── Stage 3b: Filter disclosure + chips panel ───────
  filterDisclosure: {
    alignItems: "center" as const,
    marginBottom: V3.spacing.filterDisclosureMarginB,  // 24
  },
  filterToggle: {
    ...V3.type.filterToggle,
    textTransform: "uppercase" as const,
    color: `${OaklandDusk.text.primary}94`,   // textDim
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: V3.colors.textGhost,   // 18% white
  },
  filterToggleOpen: {
    color: OaklandDusk.brand.gold,
    borderBottomColor: V3.colors.goldLine,    // 18% gold
  },
  chipsPanel: {
    marginTop: V3.spacing.chipsPanelMarginTop,      // 16
    marginBottom: V3.spacing.chipsPanelMarginBottom, // 20
    overflow: "hidden" as const,
  },
  chipsGroup: {
    marginBottom: V3.spacing.chipsGroupGapBottom,   // 14
  },
  chipsLabel: {
    ...V3.type.chipLabel,
    textTransform: "uppercase" as const,
    color: V3.colors.textFaint,
    marginBottom: V3.spacing.chipsLabelGapBottom,   // 8
    textAlign: "center" as const,
  },
  chipRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: V3.spacing.chipRowGap,                     // 6
    justifyContent: "center" as const,
  },
  chip: {
    paddingHorizontal: V3.spacing.chipPaddingH,     // 13
    paddingVertical: V3.spacing.chipPaddingV,       // 7
    borderWidth: 1,
    borderColor: V3.colors.textGhost,
    backgroundColor: "transparent",
  },
  chipActive: {
    borderColor: OaklandDusk.brand.gold,
    backgroundColor: V3.colors.goldSoft,
  },
  chipText: {
    ...V3.type.chip,
    textTransform: "uppercase" as const,
    color: `${OaklandDusk.text.primary}94`,         // textDim
  },
  chipTextActive: {
    color: OaklandDusk.brand.gold,
  },

  // Entry
  entry: {
    flexDirection: "row",
    gap: 16,
    paddingVertical: 18,
    paddingHorizontal: 10,
    marginHorizontal: -10,
    borderBottomWidth: 1,
    borderBottomColor: `${OaklandDusk.brand.gold}14`,  // 8% alpha
    alignItems: "flex-start",
  },
  entryNum: {
    ...V3.type.entryNum,
    fontSize: 10,      // override V3 token (9); slight bump for mobile
    color: OaklandDusk.brand.gold,
    textTransform: "uppercase",
    width: 22,
    paddingTop: 4,
  },
  entryViz: {
    width: V3.spacing.entryVizW,  // 60
    // Let CocktailThumbnail control its own aspect ratio (size=60 renders 60×60 square)
  },
  entryContent: {
    flex: 1,
    minWidth: 0,
  },
  entryName: {
    ...V3.type.entryName,
    color: OaklandDusk.text.primary,
    marginBottom: 5,
  },
  entryIngr: {
    ...V3.type.entryIngr,
    fontSize: 11,      // override V3 token (9); iOS HIG min body size
    color: `${OaklandDusk.text.primary}52`,  // textFaint equivalent
    marginBottom: 6,
    lineHeight: 15,    // was 13; track fontSize bump
  },
  entryExplain: {
    ...V3.type.entryExplain,
    fontSize: 11,      // override V3 token (9); iOS HIG min body size
    color: OaklandDusk.brand.gold,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  entryStatus: {
    ...V3.type.entryStatus,
    fontSize: 13,      // override V3 token (12); +1 for readability
    color: `${OaklandDusk.text.primary}52`,  // textFaint
  },
  entryStatusReady: {
    color: `${OaklandDusk.text.primary}94`,  // textDim (slightly more visible)
  },

  // Personalize block
  personalize: {
    alignSelf: "center",
    maxWidth: 260,
    marginTop: 32,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: `${OaklandDusk.brand.gold}14`,  // 8% alpha
    alignItems: "center",
  },
  personalizeTitle: {
    ...V3.type.personalizeTitle,
    color: OaklandDusk.brand.gold,
    textTransform: "uppercase",
    marginBottom: 3,
    textAlign: "center",
  },
  personalizeSub: {
    ...V3.type.personalizeSub,
    fontSize: 11,      // override V3 token (9); iOS HIG min body size
    color: `${OaklandDusk.text.primary}52`,  // textFaint
    textTransform: "uppercase",
    textAlign: "center",
  },
});
