import FontAwesome from "@expo/vector-icons/FontAwesome";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";

import * as Sentry from "@sentry/react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/auth";
import GuideBubble, { GUIDE_KEYS, dismissGuide, isGuideDismissed } from "@/components/GuideBubble";
import { useFavorites } from "@/context/favorites";
import { useFeedback } from "@/context/feedback";
import { apiFetch } from "@/lib/api";
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
};

export default function CartScreen() {
  const { session } = useAuth();
  const { favoritesByKey } = useFavorites();
  const feedback = useFeedback() as any;

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

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

  // Guide bubble state
  const [guideCartVisible, setGuideCartVisible] = useState(false);

  useEffect(() => {
    isGuideDismissed(GUIDE_KEYS.CART).then((d) => setGuideCartVisible(!d));
  }, []);

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
          await Linking.openURL(suggestion.buy_url);
        } catch {
          // ignore
        }
      }
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
    <ScrollView
      style={{ backgroundColor: OaklandDusk.bg.void }}
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={fetchSuggestions} tintColor={OaklandDusk.brand.gold} />
      }
    >
      {/* Header */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 28, fontWeight: "600", color: OaklandDusk.text.primary }}>Smart Restock</Text>
        <Text style={{ color: OaklandDusk.text.secondary, fontSize: 13 }}>
          Buy one bottle, unlock multiple cocktails. Based on your bar inventory and taste.
        </Text>
      </View>

      {/* Load button (first time) — guide #8 */}
      {!hasFetched && !loading && (
        <View style={{ position: "relative", zIndex: 20, overflow: "visible" }}>
          <GuideBubble
            storageKey={GUIDE_KEYS.CART}
            text="Tap to see suggestions!"
            visible={guideCartVisible}
            onDismiss={() => setGuideCartVisible(false)}
            position="below"
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

      {/* Empty state */}
      {hasFetched && filteredSuggestions.length === 0 && !loading && (
        <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
          <FontAwesome name="check-circle" size={36} color="#6B8F6B" />
          <Text style={{ fontWeight: "700", color: OaklandDusk.text.primary }}>Your bar is well stocked!</Text>
          <Text style={{ color: OaklandDusk.text.secondary, textAlign: "center", fontSize: 13 }}>
            Scan more bottles or add favorites to get better suggestions.
          </Text>
        </View>
      )}

      {/* Suggestion cards — exclude staples the user already has */}
      {filteredSuggestions.map((s, i) => {
        const isTop = i === 0;
        const recipeNames = (s.recipes ?? []).map((r) => r.name).filter(Boolean);
        const showRecipes = recipeNames.slice(0, 5);
        const moreCount = recipeNames.length - showRecipes.length;
        const prefPercent = Math.round((s.avg_pref_match ?? 0) * 100);

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
              overflow: "hidden",
            }}
          >
            <View style={{ padding: 14, gap: 10 }}>
              {/* Row 1: Bottle name + unlock count */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 17, fontWeight: "800", color: OaklandDusk.text.primary, flex: 1 }}>
                  {s.display_name}
                </Text>
                <View style={{
                  borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
                  backgroundColor: isTop ? "rgba(200,120,40,0.15)" : "rgba(107,143,107,0.12)",
                }}>
                  <Text style={{ fontSize: 12, fontWeight: "800", color: isTop ? OaklandDusk.brand.gold : "#6B8F6B" }}>
                    +{s.unlocks_count} cocktail{s.unlocks_count > 1 ? "s" : ""}
                  </Text>
                </View>
              </View>

              {/* Row 2: Reason */}
              {s.reason ? (
                <Text style={{ fontSize: 13, color: OaklandDusk.text.secondary, lineHeight: 18 }}>
                  {s.reason}
                </Text>
              ) : null}

              {/* Row 3: Unlocked recipes */}
              {showRecipes.length > 0 && (
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: OaklandDusk.text.tertiary, letterSpacing: 0.5 }}>
                    UNLOCKS
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {showRecipes.map((name) => (
                      <View key={name} style={{
                        backgroundColor: "rgba(240,228,200,0.08)",
                        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                        borderWidth: 0.5, borderColor: "rgba(240,228,200,0.12)",
                      }}>
                        <Text style={{ fontSize: 12, color: OaklandDusk.text.secondary }}>{name}</Text>
                      </View>
                    ))}
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
              <Pressable
                onPress={() => handleBuy(s)}
                style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                  backgroundColor: isTop ? OaklandDusk.brand.gold : "transparent",
                  borderWidth: isTop ? 0 : 1, borderColor: OaklandDusk.brand.gold,
                  borderRadius: 10, paddingVertical: 12, marginTop: 2,
                }}
              >
                <FontAwesome name="external-link" size={13} color={isTop ? OaklandDusk.bg.void : OaklandDusk.brand.gold} />
                <Text style={{
                  fontSize: 14, fontWeight: "700",
                  color: isTop ? OaklandDusk.bg.void : OaklandDusk.brand.gold,
                }}>
                  Find {s.display_name}
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      {/* Preference match info */}
      {hasFetched && filteredSuggestions.length > 0 && (
        <Text style={{ color: OaklandDusk.text.tertiary, fontSize: 11, textAlign: "center", marginTop: 4 }}>
          Recommendations based on your inventory, favorites, and taste preferences.
          {"\n"}Pull down to refresh.
        </Text>
      )}
    </ScrollView>
  );
}
