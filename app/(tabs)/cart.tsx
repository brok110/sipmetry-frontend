import FontAwesome from "@expo/vector-icons/FontAwesome";
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

  // Guide bubble state (Stage 6)
  const [guideCartVisible, setGuideCartVisible] = useState(false);
  const [guideCartBuyVisible, setGuideCartBuyVisible] = useState(false);

  useEffect(() => {
    isGuideDismissed(GUIDE_KEYS.CART).then((d) => setGuideCartVisible(!d));
    isGuideDismissed(GUIDE_KEYS.CART_BUY).then((d) => setGuideCartBuyVisible(!d));
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
      {hasFetched && suggestions.length === 0 && !loading && (
        <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
          <FontAwesome name="check-circle" size={36} color="#6B8F6B" />
          <Text style={{ fontWeight: "700", color: OaklandDusk.text.primary }}>Your bar is well stocked!</Text>
          <Text style={{ color: OaklandDusk.text.secondary, textAlign: "center", fontSize: 13 }}>
            Scan more bottles or add favorites to get better suggestions.
          </Text>
        </View>
      )}

      {/* Suggestion cards */}
      {suggestions.map((s, i) => {
        const isFirst = i === 0;
        return (
          <View
            key={s.ingredient_key}
            style={{ position: "relative", overflow: "visible", zIndex: isFirst ? 20 : 0 }}
          >
            {isFirst && (
              <GuideBubble
                storageKey={GUIDE_KEYS.CART_BUY}
                text="Tap the cart to buy!"
                visible={guideCartBuyVisible}
                onDismiss={() => setGuideCartBuyVisible(false)}
                position="above"
                align="center"
              />
            )}
            <View
              style={{
                borderRadius: 12,
                borderWidth: 0.5,
                borderLeftWidth: isFirst ? 3 : 0.5,
                borderColor: OaklandDusk.bg.border,
                borderLeftColor: isFirst ? OaklandDusk.brand.gold : OaklandDusk.bg.border,
                backgroundColor: OaklandDusk.bg.card,
                overflow: "hidden",
              }}
            >
              <View style={{ padding: 14, gap: 8 }}>
                {/* Bottle name + shopping icon */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: OaklandDusk.text.primary, flex: 1 }}>
                    {s.display_name}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginLeft: 8 }}>
                    <View style={{
                      borderRadius: 10,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      backgroundColor: "rgba(107,143,107,0.12)",
                    }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: "#6B8F6B" }}>
                        +{s.unlocks_count} cocktail{s.unlocks_count > 1 ? "s" : ""}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        if (isFirst) {
                          dismissGuide(GUIDE_KEYS.CART_BUY);
                          setGuideCartBuyVisible(false);
                        }
                        handleBuy(s);
                      }}
                      hitSlop={10}
                    >
                      <FontAwesome name="shopping-cart" size={16} color={OaklandDusk.brand.gold} />
                    </Pressable>
                  </View>
                </View>

                {/* Reason */}
                {s.reason ? (
                  <Text style={{ fontSize: 12, color: OaklandDusk.text.tertiary }} numberOfLines={2}>
                    {s.reason}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        );
      })}

      {/* Preference match info */}
      {hasFetched && suggestions.length > 0 && (
        <Text style={{ color: OaklandDusk.text.tertiary, fontSize: 11, textAlign: "center", marginTop: 4 }}>
          Recommendations based on your inventory, favorites, and taste preferences.
          {"\n"}Pull down to refresh.
        </Text>
      )}
    </ScrollView>
  );
}
