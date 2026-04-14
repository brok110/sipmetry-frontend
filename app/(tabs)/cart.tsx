import FontAwesome from "@expo/vector-icons/FontAwesome";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";

import * as Sentry from "@sentry/react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/context/auth";
import HintBubble, { GUIDE_KEYS, dismissGuide, isGuideDismissed } from "@/components/GuideBubble";
import { useFavorites } from "@/context/favorites";
import { useInventory } from "@/context/inventory";
import { useFeedback } from "@/context/feedback";
import { apiFetch } from "@/lib/api";
import { openUrl } from "@/lib/openUrl";
import OaklandDusk from "@/constants/OaklandDusk";
import { STAPLES_STORAGE_KEY } from "@/components/StaplesModal";

// Stage 0: Business Validation — Smart Restock with Buy CTA
// Shows bottle recommendations based on user inventory + preferences.
// Tracks "Buy" clicks via POST /affiliate/click for conversion analysis.

type ScoreBreakdown = {
  unlock: number;
  versatility: number;
  preference: number;
  interaction: number;
  similar_penalty: number;
};

type Suggestion = {
  ingredient_key: string;
  display_name: string;
  unlocks_count: number;
  avg_pref_match: number;
  score: number;
  score_breakdown?: ScoreBreakdown;
  category_key?: string | null;
  family_key?: string | null;
  versatility_categories?: string[];
  reason: string;
  buy_url: string;
  recipes: { iba_code: string; name: string; iba_category: string }[];
  is_alternative_upgrade?: boolean;
  covering_alternative?: { user_has: string; user_has_display: string } | null;
  alt_description?: string | null;
};

function formatFamilyKey(key: string | null | undefined): string {
  if (!key) return "";
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function CartScreen() {
  const { session } = useAuth();
  const { favoritesByKey } = useFavorites();
  const feedback = useFeedback() as any;
  const { inventory } = useInventory();
  const params = useLocalSearchParams<{ autoFetch?: string }>();

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [meta, setMeta] = useState<{ reason?: string; message?: string } | null>(null);

  // Staples — keys the user confirmed they already have; excluded from suggestions
  const [staplesKeys, setStaplesKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(STAPLES_STORAGE_KEY)
      .then((val) => {
        if (val) {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) setStaplesKeys(new Set(parsed));
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  // Explore accordion
  const [exploreExpanded, setExploreExpanded] = useState(false);

  // Guide bubble state
  const [guideCartVisible, setGuideCartVisible] = useState(false);
  const [guideRestockFindVisible, setGuideRestockFindVisible] = useState(false);

  // Track which ingredients user has tapped "I Want This" for (this session)
  const [notifiedKeys, setNotifiedKeys] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    isGuideDismissed(GUIDE_KEYS.CART).then((d) => setGuideCartVisible(!d));
    isGuideDismissed(GUIDE_KEYS.RESTOCK_FIND).then((d) => setGuideRestockFindVisible(!d));
  }, []);

  // Auto-fetch when navigated from Recommendations with autoFetch=true
  useEffect(() => {
    if (params.autoFetch === "true") {
      fetchSuggestions();
      router.setParams({ autoFetch: undefined });
    }
  }, [params.autoFetch]);

  // Build user interactions payload for preference-aware scoring
  const userInteractions = useMemo(() => {
    const ratingsByKey = feedback?.ratingsByKey ?? feedback?.ratings ?? {};
    return {
      favorite_codes: Object.keys(favoritesByKey ?? {}),
      liked_codes: Object.entries(ratingsByKey)
        .filter(([, v]) => v === "like")
        .map(([k]) => k),
      disliked_codes: Object.entries(ratingsByKey)
        .filter(([, v]) => v === "dislike")
        .map(([k]) => k),
    };
  }, [favoritesByKey, feedback?.ratingsByKey, feedback?.ratings]);

  // Filter out staples the user already confirmed having
  const filteredSuggestions = useMemo(
    () => suggestions.filter((s) => !staplesKeys.has(s.ingredient_key)),
    [suggestions, staplesKeys]
  );

  // Split into primary (true must-buys) vs explore (user already has a substitute)
  const primarySuggestions = useMemo(
    () => filteredSuggestions.filter((s) => !s.is_alternative_upgrade),
    [filteredSuggestions]
  );
  const exploreSuggestions = useMemo(
    () => filteredSuggestions.filter((s) => s.is_alternative_upgrade),
    [filteredSuggestions]
  );

  const fetchSuggestions = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await apiFetch("/restock-suggestions", {
        session,
        method: "POST",
        body: { user_interactions: userInteractions },
      });

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`${resp.status} ${t}`);
      }

      const data = await resp.json();
      setSuggestions(data.suggestions ?? []);
      setMeta(data.meta ?? null);
      setHasFetched(true);

      try {
        Sentry.addBreadcrumb({
          category: "restock",
          message: "restock_view",
          level: "info",
        });
      } catch {}
    } catch (e: any) {
      setError(e?.message ?? "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  }, [session, userInteractions]);

  // Track affiliate click then open URL
  const handleBuy = useCallback(
    async (suggestion: Suggestion) => {
      // Fire-and-forget click tracking
      apiFetch("/affiliate/click", {
        session,
        method: "POST",
        body: { ingredient_key: suggestion.ingredient_key, source: "restock", buy_url: suggestion.buy_url },
      }).catch(() => {});

      // Open buy URL
      if (suggestion.buy_url) {
        try {
          openUrl(suggestion.buy_url);
        } catch {
          // ignore
        }
      }
    },
    [session]
  );

  // Notify Me: record waitlist + show toast + open Google Shopping
  const handleNotifyMe = useCallback(
    async (suggestion: Suggestion) => {
      // 1. Record waitlist (fire-and-forget)
      apiFetch("/purchase-waitlist", {
        session,
        method: "POST",
        body: {
          ingredient_key: suggestion.ingredient_key,
          display_name: suggestion.display_name,
          source: "restock",
        },
      }).catch(() => {});

      // 2. Also record affiliate click for backwards compatibility
      apiFetch("/affiliate/click", {
        session,
        method: "POST",
        body: {
          ingredient_key: suggestion.ingredient_key,
          source: "restock",
          buy_url: suggestion.buy_url,
        },
      }).catch(() => {});

      // 3. Mark as notified (for UI feedback)
      setNotifiedKeys((prev) => new Set(prev).add(suggestion.ingredient_key));

      // 4. Show toast
      setToastMessage("Noted \u2014 we'll help you find it soon.");

      // 5. Open Google Shopping after short delay
      setTimeout(async () => {
        if (suggestion.buy_url) {
          try {
            openUrl(suggestion.buy_url);
          } catch {
            // ignore
          }
        }
      }, 1200);

      // 6. Auto-dismiss toast
      setTimeout(() => setToastMessage(null), 3500);
    },
    [session]
  );

  // Not logged in
  if (!session) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 16, backgroundColor: OaklandDusk.bg.void }}>
        <FontAwesome name="shopping-cart" size={48} color={OaklandDusk.text.tertiary} />
        <Text style={{ fontSize: 20, fontWeight: "900", color: OaklandDusk.text.primary }}>Smart Restock</Text>
        <Text style={{ color: OaklandDusk.text.secondary, textAlign: "center" }}>
          Sign in to get personalized bottle recommendations based on your bar.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, position: "relative" }}>
    <ScrollView
      style={{ backgroundColor: OaklandDusk.bg.void }}
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={fetchSuggestions} tintColor={OaklandDusk.brand.gold} />
      }
    >
      {/* Header */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 28, fontWeight: "600", color: OaklandDusk.text.primary }}>What to buy next?</Text>
        <Text style={{ color: OaklandDusk.text.secondary, fontSize: 13 }}>
          Based on bottles you already own
        </Text>
      </View>

      {/* Load button (first time) — guide #8 */}
      {!hasFetched && !loading && (
        <View style={{ position: "relative", zIndex: 20, overflow: "visible" }}>
          <HintBubble
            storageKey={GUIDE_KEYS.CART}
            visible={guideCartVisible}
            onDismiss={() => setGuideCartVisible(false)}
            hintType="tap"
            hintColor="charcoal"
          />
          <Pressable
            onPress={() => {
              dismissGuide(GUIDE_KEYS.CART);
              setGuideCartVisible(false);
              fetchSuggestions();
            }}
            style={{
              backgroundColor: OaklandDusk.brand.gold,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ color: OaklandDusk.bg.void, fontWeight: "800", fontSize: 15 }}>
              Get Recommendations
            </Text>
          </Pressable>
        </View>
      )}

      {/* Loading */}
      {loading && !hasFetched && (
        <View style={{ padding: 40, alignItems: "center" }}>
          <ActivityIndicator size="large" color={OaklandDusk.brand.gold} />
          <Text style={{ color: OaklandDusk.text.secondary, marginTop: 12 }}>Analyzing your bar...</Text>
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={{ padding: 12, borderWidth: 1, borderRadius: 12, borderColor: OaklandDusk.accent.crimson, backgroundColor: OaklandDusk.accent.roseBg }}>
          <Text style={{ color: OaklandDusk.semantic.error, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      {/* Hero number — top PRIMARY suggestion's unlock count */}
      {hasFetched && primarySuggestions.length > 0 && !loading && (
        <View style={{ alignItems: "center", paddingVertical: 8 }}>
          <Text style={{ fontSize: 14, color: OaklandDusk.text.tertiary }}>Add one bottle, make</Text>
          <Text style={{ fontSize: 48, fontWeight: "800", color: OaklandDusk.brand.gold, lineHeight: 56 }}>
            {primarySuggestions[0].unlocks_count} more
          </Text>
          <Text style={{ fontSize: 16, fontWeight: "700", color: OaklandDusk.brand.gold }}>cocktails</Text>
        </View>
      )}

      {hasFetched && filteredSuggestions.length === 0 && !loading && (
        meta?.reason === "no_inventory" ? (
          <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
            <FontAwesome name="search" size={36} color={OaklandDusk.text.tertiary} />
            <Text style={{ fontWeight: "700", color: OaklandDusk.text.primary }}>No bottles in your bar yet</Text>
            <Text style={{ color: OaklandDusk.text.secondary, textAlign: "center", fontSize: 13 }}>
              Scan your bottles first, then come back for personalized recommendations.
            </Text>
            <Pressable
              onPress={() => router.push("/(tabs)/inventory")}
              style={{
                backgroundColor: OaklandDusk.brand.gold,
                borderRadius: 10,
                paddingVertical: 12,
                paddingHorizontal: 24,
                marginTop: 8,
              }}
            >
              <Text style={{ color: OaklandDusk.bg.void, fontWeight: "700", fontSize: 14 }}>
                Go to My Bar
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
            <FontAwesome name="check-circle" size={36} color="#6B8F6B" />
            <Text style={{ fontWeight: "700", color: OaklandDusk.text.primary }}>Your bar is well stocked!</Text>
            <Text style={{ color: OaklandDusk.text.secondary, textAlign: "center", fontSize: 13 }}>
              Scan more bottles or add favorites to get better suggestions.
            </Text>
          </View>
        )
      )}

      {/* Primary suggestion cards — true must-buys */}
      {primarySuggestions.map((s, i) => {
        const isTop = i === 0;
        const recipeNames = (s.recipes ?? []).map((r) => r.name).filter(Boolean);
        const showRecipes = recipeNames.slice(0, 4);
        const moreCount = recipeNames.length - showRecipes.length;
        const prefPercent = Math.round((s.avg_pref_match ?? 0) * 100);
        const categoryLabel = formatFamilyKey(s.family_key);

        return (
          <View
            key={s.ingredient_key}
            style={{
              borderRadius: 12,
              borderWidth: 0.5,
              borderLeftWidth: isTop ? 3 : 0.5,
              borderColor: OaklandDusk.bg.border,
              borderLeftColor: isTop ? OaklandDusk.brand.gold : OaklandDusk.bg.border,
              backgroundColor: OaklandDusk.bg.card,
              overflow: "visible",
              position: "relative",
            }}
          >
            {/* #1 pick badge */}
            {isTop && (
              <View style={{
                position: "absolute",
                top: -1,
                right: 12,
                backgroundColor: OaklandDusk.brand.gold,
                paddingHorizontal: 10,
                paddingVertical: 3,
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 8,
                zIndex: 1,
              }}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: OaklandDusk.bg.void }}>#1 pick</Text>
              </View>
            )}

            <View style={{ padding: 14, gap: 10 }}>
              {/* Row 1: Bottle name + category + big unlock number */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ fontSize: 17, fontWeight: "800", color: OaklandDusk.text.primary }}>
                    {s.display_name}
                  </Text>
                  {categoryLabel ? (
                    <Text style={{ fontSize: 12, color: OaklandDusk.text.tertiary, marginTop: 2 }}>
                      {categoryLabel}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{
                    fontSize: 22,
                    fontWeight: "800",
                    color: isTop ? OaklandDusk.brand.gold : "#6B8F6B",
                  }}>
                    +{s.unlocks_count}
                  </Text>
                  <Text style={{
                    fontSize: 10,
                    color: OaklandDusk.text.tertiary,
                  }}>
                    {s.unlocks_count === 1 ? "cocktail" : "cocktails"}
                  </Text>
                </View>
              </View>

              {/* Row 3: Unlocked recipes — tappable */}
              {showRecipes.length > 0 && (
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: OaklandDusk.text.tertiary, letterSpacing: 0.5 }}>
                    YOU COULD MAKE
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {showRecipes.map((name) => {
                      const recipe = (s.recipes ?? []).find((r) => r.name === name);
                      const ibaCode = recipe?.iba_code ?? "";
                      return (
                        <Pressable
                          key={name}
                          onPress={() => {
                            if (ibaCode) {
                              router.push({
                                pathname: "/recipe",
                                params: {
                                  iba_code: ibaCode,
                                  from: "restock",
                                  scan_items_json: encodeURIComponent(JSON.stringify(
                                    inventory.map(item => ({
                                      canonical: item.ingredient_key,
                                      display: item.display_name,
                                    }))
                                  )),
                                },
                              });
                            }
                          }}
                          disabled={!ibaCode}
                        >
                          <View style={{
                            backgroundColor: "rgba(240,228,200,0.08)",
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 6,
                            borderWidth: 0.5,
                            borderColor: "rgba(240,228,200,0.12)",
                          }}>
                            <Text style={{
                              fontSize: 12,
                              color: ibaCode ? OaklandDusk.brand.gold : OaklandDusk.text.secondary,
                              textDecorationLine: ibaCode ? "underline" : "none",
                              textDecorationColor: "rgba(200,152,88,0.3)",
                            }}>
                              {name}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                    {moreCount > 0 && (
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 12, color: OaklandDusk.text.tertiary }}>+{moreCount} more</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Row 4: Taste match */}
              {prefPercent > 0 && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{
                    height: 4, flex: 1, backgroundColor: "rgba(240,228,200,0.08)",
                    borderRadius: 2, overflow: "hidden",
                  }}>
                    <View style={{
                      height: 4, width: `${Math.min(prefPercent, 100)}%`,
                      backgroundColor: prefPercent >= 70 ? "#6B8F6B" : OaklandDusk.brand.gold,
                      borderRadius: 2,
                    }} />
                  </View>
                  <Text style={{ fontSize: 11, color: OaklandDusk.text.tertiary, minWidth: 65 }}>
                    {prefPercent}% match
                  </Text>
                </View>
              )}

              {/* Row 5: Buy CTA */}
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
              <Pressable
                onPress={() => {
                  if (i === 0 && guideRestockFindVisible) {
                    dismissGuide(GUIDE_KEYS.RESTOCK_FIND);
                    setGuideRestockFindVisible(false);
                  }
                  handleNotifyMe(s);
                }}
                style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                  backgroundColor: notifiedKeys.has(s.ingredient_key)
                    ? "transparent"
                    : isTop ? OaklandDusk.brand.gold : "transparent",
                  borderWidth: 1,
                  borderColor: notifiedKeys.has(s.ingredient_key)
                    ? "rgba(74,222,128,0.3)"
                    : isTop ? OaklandDusk.brand.gold : OaklandDusk.brand.gold,
                  borderRadius: 10, paddingVertical: 12, marginTop: 2,
                  opacity: notifiedKeys.has(s.ingredient_key) ? 0.7 : 1,
                }}
              >
                <FontAwesome
                  name={notifiedKeys.has(s.ingredient_key) ? "check" : "heart-o"}
                  size={13}
                  color={notifiedKeys.has(s.ingredient_key)
                    ? "#4ade80"
                    : isTop ? OaklandDusk.bg.void : OaklandDusk.brand.gold}
                />
                <Text style={{
                  fontSize: 14, fontWeight: "700",
                  color: notifiedKeys.has(s.ingredient_key)
                    ? "#4ade80"
                    : isTop ? OaklandDusk.bg.void : OaklandDusk.brand.gold,
                }}>
                  {notifiedKeys.has(s.ingredient_key) ? "Noted \u2713" : "I Want This"}
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      {/* Explore section — items where user already has a substitute (collapsible) */}
      {hasFetched && exploreSuggestions.length > 0 && (
        <View style={{ borderTopWidth: 1, borderTopColor: "rgba(200,120,40,0.1)", marginTop: 8, paddingTop: 14 }}>
          {/* Toggle header */}
          <Pressable
            onPress={() => setExploreExpanded(!exploreExpanded)}
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: exploreExpanded ? OaklandDusk.brand.gold : OaklandDusk.text.secondary }}>
                Explore
              </Text>
              <View style={{ backgroundColor: "rgba(200,120,40,0.1)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                <Text style={{ fontSize: 11, color: OaklandDusk.text.secondary }}>
                  {exploreSuggestions.length} upgrade{exploreSuggestions.length > 1 ? "s" : ""}
                </Text>
              </View>
            </View>
            <FontAwesome
              name={exploreExpanded ? "chevron-up" : "chevron-down"}
              size={12}
              color={exploreExpanded ? OaklandDusk.brand.gold : OaklandDusk.text.secondary}
            />
          </Pressable>

          {/* Subtitle when collapsed */}
          {!exploreExpanded && (
            <Text style={{ fontSize: 12, color: OaklandDusk.text.secondary, marginTop: 6 }}>
              You can already make these with substitutes in your bar
            </Text>
          )}

          {/* Expanded cards */}
          {exploreExpanded && (
            <View style={{ gap: 10, marginTop: 12 }}>
              {exploreSuggestions.map((s) => {
                const covering = s.covering_alternative;
                const recipeNames = (s.recipes ?? []).map((r) => r.name).filter(Boolean);
                const showRecipes = recipeNames.slice(0, 5);

                return (
                  <View
                    key={s.ingredient_key}
                    style={{
                      borderRadius: 12,
                      borderWidth: 0.5,
                      borderColor: "rgba(200,120,40,0.12)",
                      backgroundColor: OaklandDusk.bg.card,
                      padding: 14,
                      gap: 8,
                    }}
                  >
                    {/* Header: name + category + unlock count (gray, not gold) */}
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: "700", color: OaklandDusk.text.primary }}>
                          {s.display_name}
                        </Text>
                        <Text style={{ fontSize: 12, color: OaklandDusk.text.secondary, marginTop: 2 }}>
                          {s.category_key ? s.category_key.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : ""}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: OaklandDusk.text.secondary }}>
                        +{s.unlocks_count}
                      </Text>
                    </View>

                    {/* Green pill: substitute info */}
                    {covering && (
                      <View style={{
                        flexDirection: "row", alignItems: "center", gap: 6,
                        backgroundColor: "rgba(99,153,34,0.08)",
                        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                      }}>
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#639922" }} />
                        <Text style={{ fontSize: 12, color: "#97C459" }}>
                          You have {covering.user_has_display} as a substitute
                        </Text>
                      </View>
                    )}

                    {/* Alt description */}
                    {s.alt_description ? (
                      <Text style={{ fontSize: 12, color: OaklandDusk.text.secondary }}>
                        {s.alt_description}
                      </Text>
                    ) : null}

                    {/* Recipe pills — muted style */}
                    {showRecipes.length > 0 && (
                      <View>
                        <Text style={{ fontSize: 11, color: OaklandDusk.text.secondary, letterSpacing: 0.3, marginBottom: 4 }}>
                          ORIGINAL RECIPE USES {s.display_name.toUpperCase()} IN
                        </Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                          {showRecipes.map((name: string) => (
                            <View key={name} style={{
                              backgroundColor: "rgba(200,120,40,0.08)",
                              paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                            }}>
                              <Text style={{ fontSize: 11, color: OaklandDusk.text.secondary }}>{name}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* CTA: outline style */}
                    <Pressable
                      onPress={() => handleNotifyMe(s)}
                      style={{
                        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                        borderWidth: 1,
                        borderColor: notifiedKeys.has(s.ingredient_key)
                          ? "rgba(74,222,128,0.2)"
                          : "rgba(200,120,40,0.2)",
                        borderRadius: 10,
                        paddingVertical: 11,
                        marginTop: 2,
                        opacity: notifiedKeys.has(s.ingredient_key) ? 0.7 : 1,
                      }}
                    >
                      <FontAwesome
                        name={notifiedKeys.has(s.ingredient_key) ? "check" : "heart-o"}
                        size={12}
                        color={notifiedKeys.has(s.ingredient_key) ? "#4ade80" : OaklandDusk.brand.gold}
                      />
                      <Text style={{
                        fontSize: 14, fontWeight: "700",
                        color: notifiedKeys.has(s.ingredient_key) ? "#4ade80" : OaklandDusk.brand.gold,
                      }}>
                        {notifiedKeys.has(s.ingredient_key) ? "Noted \u2713" : "I Want This"}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* Preference match info */}
      {hasFetched && filteredSuggestions.length > 0 && (
        <Text style={{ color: OaklandDusk.text.tertiary, fontSize: 11, textAlign: "center", marginTop: 4 }}>
          Recommendations based on your inventory, favorites, and taste preferences.
          {"\n"}Pull down to refresh.
        </Text>
      )}
    </ScrollView>

      {/* Toast notification */}
      {toastMessage && (
        <View style={{
          position: "absolute", bottom: 40, left: 20, right: 20,
          backgroundColor: "#0E0B1A",
          borderWidth: 1, borderColor: "rgba(74,222,128,0.3)",
          borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18,
          flexDirection: "row", alignItems: "center", gap: 10,
          shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
        }}>
          <FontAwesome name="check-circle" size={16} color="#4ade80" />
          <Text style={{ fontSize: 13, color: "#F2E8D8", flex: 1 }}>
            {toastMessage}
          </Text>
        </View>
      )}
    </View>
  );
}
