import { apiFetch } from "@/lib/api";
import { getTasteTags } from "@/lib/tasteTags";
import HintBubble, { GUIDE_KEYS, dismissGuide, isGoldenPathStepReady } from "@/components/GuideBubble";
import StaplesModal, { DEFAULT_STAPLES, STAPLES_STORAGE_KEY } from "@/components/StaplesModal";
import AsyncStorage from "@react-native-async-storage/async-storage";
import CocktailThumbnail from "@/components/CocktailThumbnail";
import OaklandDusk from "@/constants/OaklandDusk";
import { V3 } from "@/constants/v3DesignTokens";
import { useAuth } from "@/context/auth";
import { useInventory } from "@/context/inventory";
import { usePreferences } from "@/context/preferences";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
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


function Tag({
  label,
  selected,
  onPress,
  variant = "default",
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  variant?: "default" | "exclude";
}) {
  const isExclude = variant === "exclude";
  const activeBg = isExclude ? "rgba(192,72,88,0.18)" : "rgba(200,120,40,0.15)";
  const activeBorder = isExclude ? OaklandDusk.brand.rust : OaklandDusk.brand.gold;
  const activeText = isExclude ? OaklandDusk.accent.crimson : OaklandDusk.brand.yellow;
  const idleBorder = isExclude ? "rgba(192,72,88,0.2)" : "rgba(200,120,40,0.25)";
  const idleBg = isExclude ? "rgba(192,72,88,0.05)" : "rgba(200,120,40,0.06)";
  const idleText = isExclude ? "#c8a0a0" : OaklandDusk.text.secondary;

  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: selected ? activeBorder : idleBorder,
        backgroundColor: selected ? activeBg : idleBg,
        alignItems: "center",
        transform: selected ? [{ scale: 1.03 }] : [],
      }}
    >
      <Text style={{
        fontSize: 15,
        fontWeight: selected ? "700" : "500",
        color: selected ? activeText : idleText,
        textTransform: "capitalize",
      }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SectionHeader({ children }: { children: string }) {
  return (
    <Text style={{
      fontSize: 12,
      fontWeight: "700",
      color: OaklandDusk.brand.gold,
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: 10,
      marginTop: 20,
    }}>
      {children}
    </Text>
  );
}

function isChineseLocale(): boolean {
  try {
    if (Platform.OS === "ios") {
      const langs = NativeModules.SettingsManager?.settings?.AppleLanguages;
      if (Array.isArray(langs) && langs.length > 0) return String(langs[0]).toLowerCase().startsWith("zh");
    } else if (Platform.OS === "android") {
      const locale = NativeModules.I18nManager?.localeIdentifier;
      if (locale) return String(locale).toLowerCase().startsWith("zh");
    }
  } catch {}
  return false;
}

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

  const [showResults, setShowResults] = useState(false);

  // Stage 2b: Hero card state
  const [currentPourIndex, setCurrentPourIndex] = useState(0);
  const [saved, setSaved] = useState<Set<string>>(new Set());

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
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [showStaples, setShowStaples] = useState(false);
  const [confirmedStaples, setConfirmedStaples] = useState<string[]>([]);
  const [staplesConfirmed, setStaplesConfirmed] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STAPLES_STORAGE_KEY).then((raw) => {
      try {
        if (raw !== null) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setConfirmedStaples(parsed);
          setStaplesConfirmed(true);
        }
      } catch {}
    });
  }, []);

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
      // Mark user as having used the bartender (for skip-Welcome on next launch)
      AsyncStorage.setItem("sipmetry_has_used_bartender", "true").catch(() => {});
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
        scan_items_json: encodeURIComponent(JSON.stringify([
          ...inventory.map(item => ({ canonical: item.ingredient_key, display: item.display_name })),
          ...confirmedStaples.map((k) => ({
            canonical: k,
            display: DEFAULT_STAPLES.find((s) => s.ingredient_key === k)?.display_name ?? k.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
          })),
        ])),
        missing_items_json: encodeURIComponent(JSON.stringify(pick.missing_items || [])),
        overlap_hits_json: encodeURIComponent(JSON.stringify(pick.overlap_hits || [])),
      },
    });
  };

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

  if (showResults) {
    return (
      <View style={{ flex: 1, backgroundColor: OaklandDusk.bg.void }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{
            fontSize: 26,
            fontWeight: "800",
            color: OaklandDusk.text.primary,
            marginBottom: 16,
          }}>
            Your picks
          </Text>

          {results.length === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 40 }}>
              <Text style={{
                fontSize: 16,
                color: OaklandDusk.text.secondary,
                textAlign: "center",
                lineHeight: 24,
              }}>
                Your bar doesn't have a match yet.{"\n"}
                Try different tags or add more bottles.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {(() => {
                const hasPreset = false;
                const hasSpirit = selectedSpirits.length > 0;
                const readyMatched = results.filter(p => p.missing_count === 0 && (!hasPreset || p.preset_match));
                const alsoAvailable = (hasPreset && hasSpirit)
                  ? results.filter(p => p.missing_count === 0 && !p.preset_match)
                  : [];
                const missingMatched = results.filter(p => p.missing_count > 0 && (!hasPreset || p.preset_match));
                const hasNoContent = readyMatched.length === 0 && missingMatched.length === 0 && oneAway.length === 0;

                return (
                  <>
                    {hasPreset && hasNoContent && (
                      <View style={{ alignItems: "center", paddingTop: 20, paddingBottom: 8 }}>
                        <Text style={{ fontSize: 16, fontWeight: "700", color: OaklandDusk.text.primary, marginBottom: 6 }}>
                          {isChineseLocale() ? "\u597D\u54C1\u5473\u3002" : "Great taste."}
                        </Text>
                        <Text style={{ fontSize: 14, color: OaklandDusk.text.secondary, textAlign: "center", lineHeight: 22 }}>
                          {isChineseLocale()
                            ? "\u770B\u770B\u4E0B\u9762\u7684\u5EFA\u8B70\uFF0C\u5E6B\u4F60\u7684\u5427\u53F0\u5347\u7D1A\u3002"
                            : "Check below for what to add to your bar."}
                        </Text>
                      </View>
                    )}

                    {readyMatched.length > 0 && (
                      <>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: OaklandDusk.text.tertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                          Ready to make
                        </Text>
                        {readyMatched.map(pick => {
                          const isHeroPick = results.length > 0 && pick.iba_code === results[0].iba_code;
                          const tags = getTasteTags(pick.recipe_vec);
                          return (
                            <View key={pick.iba_code} style={isHeroPick ? { position: "relative", marginTop: 4 } : {}}>
                              {isHeroPick && (
                                <View style={{
                                  position: "absolute",
                                  top: -1,
                                  right: 12,
                                  backgroundColor: OaklandDusk.brand.gold,
                                  paddingHorizontal: 10,
                                  paddingVertical: 3,
                                  borderBottomLeftRadius: 8,
                                  borderBottomRightRadius: 8,
                                  zIndex: 2,
                                }}>
                                  <Text style={{ fontSize: 11, fontWeight: "800", color: OaklandDusk.bg.void }}>#1 pick</Text>
                                </View>
                              )}
                              <Pressable
                                onPress={() => openRecipe(pick)}
                                style={{
                                  backgroundColor: OaklandDusk.bg.card,
                                  borderRadius: 14,
                                  padding: 16,
                                  borderWidth: isHeroPick ? 1.5 : 1,
                                  borderColor: isHeroPick ? OaklandDusk.brand.gold : OaklandDusk.bg.border,
                                }}
                              >
                                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                                  <CocktailThumbnail imageUrl={pick.image_url} size={isHeroPick ? 96 : undefined} />
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: isHeroPick ? 24 : 20, fontWeight: "800", color: OaklandDusk.text.primary }}>
                                      {pick.name}
                                    </Text>
                                    {pick.explain ? (
                                      <Text style={{ fontSize: 12, color: OaklandDusk.text.secondary, marginTop: 4 }}>
                                        {pick.explain}
                                      </Text>
                                    ) : null}
                                    {tags.length > 0 && (
                                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                                        {tags.map(t => (
                                          <View key={t} style={{ backgroundColor: OaklandDusk.brand.tagBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                                            <Text style={{ fontSize: 11, color: OaklandDusk.brand.gold }}>{t}</Text>
                                          </View>
                                        ))}
                                      </View>
                                    )}
                                    {!isHeroPick && pick.style && (
                                      <Text style={{ fontSize: 11, color: OaklandDusk.text.tertiary, marginTop: 8, textTransform: "capitalize" }}>
                                        {pick.style}{pick.glass ? ` \u00B7 ${pick.glass}` : ""}
                                      </Text>
                                    )}
                                  </View>
                                </View>
                                {isHeroPick && (
                                  <Pressable
                                    onPress={(e) => { e.stopPropagation(); openRecipe(pick); }}
                                    style={{
                                      marginTop: 14,
                                      backgroundColor: OaklandDusk.brand.gold,
                                      paddingVertical: 12,
                                      borderRadius: 12,
                                      alignItems: "center",
                                    }}
                                  >
                                    <Text style={{ fontSize: 15, fontWeight: "700", color: OaklandDusk.bg.void }}>Make this</Text>
                                  </Pressable>
                                )}
                              </Pressable>
                            </View>
                          );
                        })}
                      </>
                    )}

                    {(missingMatched.length > 0 || oneAway.length > 0) && (
                      <>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: OaklandDusk.text.tertiary, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>
                          Just 1 bottle away
                        </Text>
                        {[...missingMatched, ...oneAway].map(pick => {
                          const isHeroPick = results.length > 0 && pick.iba_code === results[0].iba_code;
                          const tags = getTasteTags(pick.recipe_vec);
                          return (
                            <View key={pick.iba_code || pick.name} style={isHeroPick ? { position: "relative", marginTop: 4 } : {}}>
                              {isHeroPick && (
                                <View style={{
                                  position: "absolute",
                                  top: -1,
                                  right: 12,
                                  backgroundColor: OaklandDusk.brand.gold,
                                  paddingHorizontal: 10,
                                  paddingVertical: 3,
                                  borderBottomLeftRadius: 8,
                                  borderBottomRightRadius: 8,
                                  zIndex: 2,
                                }}>
                                  <Text style={{ fontSize: 11, fontWeight: "800", color: OaklandDusk.bg.void }}>#1 pick</Text>
                                </View>
                              )}
                              <Pressable
                                onPress={() => openRecipe(pick)}
                                style={{
                                  backgroundColor: OaklandDusk.bg.card,
                                  borderRadius: 14,
                                  padding: 16,
                                  borderWidth: isHeroPick ? 1.5 : 1,
                                  borderColor: isHeroPick ? OaklandDusk.brand.gold : "rgba(200,120,40,0.15)",
                                  borderLeftWidth: isHeroPick ? 1.5 : 3,
                                  borderLeftColor: isHeroPick ? OaklandDusk.brand.gold : OaklandDusk.brand.gold,
                                }}
                              >
                                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                                  <CocktailThumbnail imageUrl={pick.image_url} size={isHeroPick ? 96 : undefined} />
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: isHeroPick ? 24 : 20, fontWeight: "800", color: OaklandDusk.text.primary }}>
                                      {pick.name}
                                    </Text>
                                    {pick.explain ? (
                                      <Text style={{ fontSize: 12, color: OaklandDusk.text.secondary, marginTop: 4 }}>
                                        {pick.explain}
                                      </Text>
                                    ) : null}
                                    {tags.length > 0 && (
                                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                                        {tags.map(t => (
                                          <View key={t} style={{ backgroundColor: OaklandDusk.brand.tagBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                                            <Text style={{ fontSize: 11, color: OaklandDusk.brand.gold }}>{t}</Text>
                                          </View>
                                        ))}
                                      </View>
                                    )}
                                    <Text style={{ fontSize: 12, color: OaklandDusk.brand.sundown, fontWeight: "500", marginTop: 8 }}>
                                      Need: {(pick.missing_items || []).map(k => k.replace(/_/g, " ")).join(", ")}
                                    </Text>
                                  </View>
                                </View>
                                {isHeroPick && (
                                  <Pressable
                                    onPress={(e) => { e.stopPropagation(); openRecipe(pick); }}
                                    style={{
                                      marginTop: 14,
                                      backgroundColor: OaklandDusk.brand.gold,
                                      paddingVertical: 12,
                                      borderRadius: 12,
                                      alignItems: "center",
                                    }}
                                  >
                                    <Text style={{ fontSize: 15, fontWeight: "700", color: OaklandDusk.bg.void }}>Make this</Text>
                                  </Pressable>
                                )}
                              </Pressable>
                            </View>
                          );
                        })}
                      </>
                    )}

                    {alsoAvailable.length > 0 && (
                      <>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: OaklandDusk.text.tertiary, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>
                          {isChineseLocale() ? "\u4F60\u4E5F\u80FD\u505A" : "Also in your bar"}
                        </Text>
                        {alsoAvailable.map(pick => {
                          const tags = getTasteTags(pick.recipe_vec);
                          return (
                            <Pressable key={pick.iba_code} onPress={() => openRecipe(pick)} style={{ backgroundColor: OaklandDusk.bg.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: OaklandDusk.bg.border, opacity: 0.7 }}>
                              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                                <CocktailThumbnail imageUrl={pick.image_url} />
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 20, fontWeight: "800", color: OaklandDusk.text.primary }}>{pick.name}</Text>
                                  {pick.explain ? (
                                    <Text style={{ fontSize: 12, color: OaklandDusk.text.secondary, marginTop: 4 }}>
                                      {pick.explain}
                                    </Text>
                                  ) : null}
                                  {tags.length > 0 && (
                                    <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                                      {tags.map(t => (
                                        <View key={t} style={{ backgroundColor: OaklandDusk.brand.tagBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                                          <Text style={{ fontSize: 11, color: OaklandDusk.brand.gold }}>{t}</Text>
                                        </View>
                                      ))}
                                    </View>
                                  )}
                                  {pick.style && (
                                    <Text style={{ fontSize: 11, color: OaklandDusk.text.tertiary, marginTop: 8, textTransform: "capitalize" }}>
                                      {pick.style}{pick.glass ? ` \u00B7 ${pick.glass}` : ""}
                                    </Text>
                                  )}
                                </View>
                              </View>
                            </Pressable>
                          );
                        })}
                      </>
                    )}
                  </>
                );
              })()}

              {hint && (
                <View style={{ backgroundColor: "rgba(200,120,40,0.08)", borderWidth: 1, borderColor: "rgba(200,120,40,0.2)", borderRadius: 12, padding: 14, marginTop: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: OaklandDusk.brand.gold, marginBottom: 4 }}>
                    {isChineseLocale() ? "\uD83D\uDCA1 \u5C0F\u63D0\u793A" : "\uD83D\uDCA1 Tip"}
                  </Text>
                  <Text style={{ fontSize: 13, color: OaklandDusk.text.secondary, lineHeight: 20 }}>
                    {isChineseLocale() ? hint.message_zh : hint.message_en}
                  </Text>
                </View>
              )}
            </View>
          )}

          {error && (
            <Text style={{
              color: OaklandDusk.accent.crimson,
              textAlign: "center",
              marginTop: 16,
              fontSize: 14,
            }}>
              {error}
            </Text>
          )}
        </ScrollView>

        <View style={{ paddingHorizontal: 24, paddingBottom: 24, paddingTop: 12 }}>
          <Pressable
            onPress={() => {
              setResults([]);
              setOneAway([]);
              setHint(null);
              setError(null);
              setSelectedOccasion(null);
              setSelectedSpirits([]);
              setSelectedExcludes([]);
              setShowResults(false);
            }}
            style={{
              backgroundColor: OaklandDusk.brand.gold,
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: OaklandDusk.bg.void }}>
              Show me another
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ─────── Stage 2b: Branch render ───────
  const currentPick = results[currentPourIndex] || null;
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
          <ActivityIndicator color={V3.colors.gold} size="small" />
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
            color={V3.colors.gold}
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
            <Text style={[styles.pourCounter, { color: V3.colors.text }]}>
              {String(currentPourIndex + 1).padStart(2, "0")}
            </Text>
            <Text style={[styles.pourCounter, { color: V3.colors.textGhost, marginHorizontal: 6 }]}>
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

          {/* Action icons (Stage 2b: console.log placeholders; Stage 2d wires real logic) */}
          <View style={styles.spreadActions}>
            <Pressable
              style={styles.spreadAction}
              onPress={() => console.log("Save", currentPick?.iba_code)}
            >
              <FontAwesome name="heart-o" size={18} color={V3.colors.textDim} />
              <Text style={styles.actionLabel}>SAVE</Text>
            </Pressable>
            <Pressable
              style={styles.spreadAction}
              onPress={() => console.log("Skip", currentPick?.iba_code)}
            >
              <FontAwesome name="times" size={18} color={V3.colors.textDim} />
              <Text style={styles.actionLabel}>SKIP</Text>
            </Pressable>
            <Pressable
              style={styles.spreadAction}
              onPress={nextPour}
            >
              <FontAwesome name="refresh" size={18} color={V3.colors.textDim} />
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

      {/* 🔴 DEAD CODE: Bottom Sheet (Stage 2d 才清) */}
      <Modal
        visible={showBottomSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBottomSheet(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
          onPress={() => setShowBottomSheet(false)}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: OaklandDusk.bg.card,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              paddingBottom: 36,
            }}
          >
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: OaklandDusk.bg.border }} />
            </View>

            <Text style={{ fontSize: 20, fontWeight: "800", color: OaklandDusk.text.primary, marginBottom: 4 }}>
              {inventory.length > 0 ? "How do you want to explore?" : "Let\u2019s get you started"}
            </Text>
            <Text style={{ fontSize: 14, color: OaklandDusk.text.tertiary, marginBottom: 20 }}>
              {inventory.length > 0
                ? `Your bar has ${inventory.length} bottle${inventory.length === 1 ? "" : "s"} ready`
                : "Your bar is empty \u2014 scan your bottles to unlock personalized picks"}
            </Text>

            {inventory.length > 0 ? (
              <View style={{ gap: 12 }}>
                <Pressable
                  onPress={() => {
                    setShowBottomSheet(false);
                    // Skip modal if staples were previously confirmed; fetch directly
                    if (staplesConfirmed) {
                      fetchRecommendations(confirmedStaples);
                    } else {
                      setShowStaples(true);
                    }
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: OaklandDusk.brand.gold,
                    backgroundColor: "rgba(200,120,40,0.08)",
                    borderRadius: 14,
                    padding: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <FontAwesome name="archive" size={20} color={OaklandDusk.brand.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: OaklandDusk.text.primary }}>
                      Use what's in my bar
                    </Text>
                    <Text style={{ fontSize: 13, color: OaklandDusk.text.tertiary, marginTop: 2 }}>
                      Recipes based on your bottles
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setShowBottomSheet(false);
                    router.push("/scan?intent=addToBar");
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(200,120,40,0.25)",
                    borderRadius: 14,
                    padding: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <FontAwesome name="camera" size={20} color={OaklandDusk.text.secondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: OaklandDusk.text.primary }}>
                      Scan something new
                    </Text>
                    <Text style={{ fontSize: 13, color: OaklandDusk.text.tertiary, marginTop: 2 }}>
                      Snap a photo and see what you can make
                    </Text>
                  </View>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                <Pressable
                  onPress={() => {
                    // Auto-dismiss GP step 2 so step 3 can unlock on Scan page
                    dismissGuide(GUIDE_KEYS.GP_STEP_2);
                    setShowBottomSheet(false);
                    router.push("/scan?intent=addToBar");
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: OaklandDusk.brand.gold,
                    backgroundColor: "rgba(200,120,40,0.08)",
                    borderRadius: 14,
                    padding: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <FontAwesome name="camera" size={20} color={OaklandDusk.brand.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: OaklandDusk.text.primary }}>
                      Scan my bottles
                    </Text>
                    <Text style={{ fontSize: 13, color: OaklandDusk.text.tertiary, marginTop: 2 }}>
                      Build your bar and get personal picks
                    </Text>
                  </View>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <StaplesModal
        visible={showStaples}
        loading={loading}
        onConfirm={(stapleKeys) => {
          setShowStaples(false);
          setConfirmedStaples(stapleKeys);
          setStaplesConfirmed(true);
          fetchRecommendations(stapleKeys);
        }}
        onCancel={() => setShowStaples(false)}
      />
    </View>
  );
}

// ─────── Stage 2b: Styles ───────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: V3.colors.void,
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
    color: V3.colors.textDim,
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
    backgroundColor: V3.colors.card,
    marginBottom: 28,
  },
  skeletonLineLong: {
    width: 200,
    height: 14,
    borderRadius: 4,
    backgroundColor: V3.colors.card,
    marginBottom: 10,
  },
  skeletonLineShort: {
    width: 140,
    height: 10,
    borderRadius: 4,
    backgroundColor: V3.colors.card,
  },

  // Error / empty state messages
  stateMsg: {
    fontFamily: V3.fonts.cormorant,
    fontStyle: "italic",
    fontSize: 18,
    color: V3.colors.textDim,
    textAlign: "center",
    marginBottom: 8,
  },
  stateSubMsg: {
    fontFamily: V3.fonts.mono,
    fontSize: 11,
    letterSpacing: 1,
    color: V3.colors.textFaint,
    textAlign: "center",
    textTransform: "uppercase",
    marginBottom: 24,
  },
  retryBtn: {
    borderWidth: 1,
    borderColor: V3.colors.gold,
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  retryBtnText: {
    fontFamily: V3.fonts.mono,
    fontSize: 11,
    letterSpacing: 3.3,
    color: V3.colors.gold,
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
    color: V3.colors.gold,
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
    borderColor: V3.colors.goldLine,
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
    borderColor: V3.colors.goldLine,
    zIndex: 1,
  },

  // Drink name
  drinkName: {
    ...V3.type.drinkName,
    lineHeight: 52,  // override V3 token: RN clips text when lineHeight < fontSize (was 45.6, fontSize 48)
    color: V3.colors.text,
    textAlign: "center",
    marginBottom: 0,
  },

  // Gold rule line
  drinkRule: {
    width: 42,
    height: 1,
    backgroundColor: V3.colors.gold,
    marginVertical: 8,
  },

  // Ingredients
  drinkIngredients: {
    ...V3.type.drinkIngredients,
    color: V3.colors.textDim,
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
    color: V3.colors.gold,
    textTransform: "uppercase",
  },
  explainDot: {
    color: V3.colors.goldLine,
    fontSize: 8,
    marginHorizontal: 10,
  },

  // Bar status
  barStatus: {
    ...V3.type.barStatus,
    color: V3.colors.textFaint,
    textAlign: "center",
    marginBottom: 14,
  },

  // See the recipe CTA (ghost button)
  seeRecipeBtn: {
    borderWidth: 1,
    borderColor: V3.colors.gold,
    paddingHorizontal: 42,
    paddingVertical: 12,
    marginBottom: 16,
  },
  seeRecipeText: {
    ...V3.type.seeRecipe,
    color: V3.colors.gold,
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
    borderColor: V3.colors.textGhost,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  actionLabel: {
    position: "absolute",
    bottom: -18,
    left: -20,   // extend label beyond button width; prevents ANOTHER wrapping
    right: -20,
    textAlign: "center",
    ...V3.type.actionLabel,
    color: V3.colors.textFaint,
    textTransform: "uppercase",
  },

  // Swipe hint (static, Stage 2c will add gesture feedback)
  swipeHint: {
    fontFamily: V3.fonts.mono,
    fontSize: 9,
    letterSpacing: 2.25,
    color: V3.colors.textFaint,
    textTransform: "uppercase",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 0,
  },

  // Scroll cue (static arrow)
  scrollCue: {
    fontSize: 18,
    color: V3.colors.textGhost,
    textAlign: "center",
    paddingVertical: 4,
  },
});
