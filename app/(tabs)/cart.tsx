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
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/context/auth";
import Masthead from "@/components/Masthead";
import { useFavorites } from "@/context/favorites";
import { useFeedback } from "@/context/feedback";
import { apiFetch } from "@/lib/api";
import { track as analytics } from "@/lib/analytics/analytics";
import { EVENTS } from "@/lib/analytics/events";
import OaklandDusk from "@/constants/OaklandDusk";
import Type from "@/constants/typography";
import { R } from "@/constants/radius";
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
  recipes: { iba_code: string; name: string; iba_category: string; image_url?: string | null }[];
  is_alternative_upgrade?: boolean;
  covering_alternative?: { user_has: string; user_has_display: string } | null;
  alt_description?: string | null;
};

// S2:+N / hero → 明細頁(呼叫端已有 recipes,免二次請求)
function openUnlocks(title: string, recipes: Suggestion["recipes"]) {
  router.push({
    pathname: "/restock-unlocks",
    params: {
      title,
      recipes_json: encodeURIComponent(JSON.stringify(
        (recipes ?? []).map((r) => ({ iba_code: r.iba_code, name: r.name, image_url: r.image_url ?? null }))
      )),
    },
  });
}

export default function CartScreen() {
  const { session } = useAuth();
  const { favoritesByKey } = useFavorites();
  const feedback = useFeedback() as any;
  const params = useLocalSearchParams<{ autoFetch?: string }>();

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [meta, setMeta] = useState<{ reason?: string; message?: string } | null>(null);

  // SHOP-LIST 3b: open-list badge count + per-key "already listed" feedback
  const [listCount, setListCount] = useState(0);
  const [listedKeys, setListedKeys] = useState<Set<string>>(new Set());

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

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // S1 直入:tab 進頁即載入(入口鈕頁移除;RESTOCK-REDESIGN 拍板)
  useEffect(() => {
    if (!hasFetched && !loading) fetchSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // SHOP-LIST 3b: refresh the badge whenever the tab regains focus (e.g.
  // returning from the list page after checking items off).
  const fetchListCount = useCallback(async () => {
    if (!session) return;
    try {
      const res = await apiFetch("/shopping-list", { session });
      if (!res.ok) return;
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      setListCount(items.length);
      setListedKeys(new Set(items.map((it: { ingredient_key: string }) => String(it.ingredient_key))));
    } catch {
      // badge is best-effort — never block the screen
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      fetchListCount();
    }, [fetchListCount])
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

      analytics(EVENTS.SMART_RESTOCK_VIEWED, { count: data.suggestions?.length ?? 0 });

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

  // SHOP-LIST 3b: add a suggestion to the shopping list (source: restock).
  const handleAddToList = useCallback(
    async (suggestion: Suggestion) => {
      try {
        const res = await apiFetch("/shopping-list", {
          session,
          method: "POST",
          body: {
            ingredient_key: suggestion.ingredient_key,
            display_name: suggestion.display_name,
            source: "restock",
          },
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        setListedKeys((prev) => new Set(prev).add(suggestion.ingredient_key));
        if (!data.deduped) setListCount((c) => c + 1);
        setToastMessage("Added to your shopping list.");
      } catch {
        setToastMessage("Could not add to list — try again.");
      } finally {
        setTimeout(() => setToastMessage(null), 3500);
      }
    },
    [session]
  );

  // Not logged in
  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: OaklandDusk.bg.void }}>
        <Masthead />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 16 }}>
          <FontAwesome name="shopping-cart" size={48} color={OaklandDusk.text.tertiary} />
          {/* Type.title — empty-state section title */}
          <Text style={[Type.title, { color: OaklandDusk.text.primary }]}>Smart Restock</Text>
          {/* Type.body — sign-in description */}
          <Text style={[Type.body, { color: OaklandDusk.text.secondary, textAlign: "center" }]}>
            Sign in to get personalized bottle recommendations based on your bar.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, position: "relative", backgroundColor: OaklandDusk.bg.void }}>
    <Masthead
      actions={
        <Pressable
          onPress={() => router.push("/shopping-list")}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Shopping list"
          style={{ alignItems: "center", gap: 4 }}
        >
          <View style={{
            width: 32, height: 32, borderRadius: 8, borderWidth: 1,
            borderColor: `${OaklandDusk.brand.gold}4D`,
            alignItems: "center", justifyContent: "center",
          }}>
            <FontAwesome name="shopping-bag" size={14} color={OaklandDusk.brand.gold} />
            {listCount > 0 && (
              <View style={{
                position: "absolute", top: -5, right: -5, minWidth: 15, height: 15,
                borderRadius: 7.5, backgroundColor: OaklandDusk.brand.rust,
                alignItems: "center", justifyContent: "center", paddingHorizontal: 3,
              }}>
                {/* LEAVE: 9px badge count — smaller than any Type token by design */}
                <Text style={{ fontSize: 9, color: OaklandDusk.text.primary, fontFamily: "DMMono" }}>
                  {listCount > 9 ? "9+" : listCount}
                </Text>
              </View>
            )}
          </View>
          {/* LEAVE: 8px DMMono frame label — mirrors shelf sortLabel spec */}
          <Text style={{ fontFamily: "DMMono", fontSize: 8, letterSpacing: 2, color: OaklandDusk.brand.gold }}>
            LIST
          </Text>
        </Pressable>
      }
    />
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={fetchSuggestions} tintColor={OaklandDusk.brand.gold} />
      }
    >
      {/* Header */}
      <View style={{ gap: 4 }}>
        {/* Type.display — page-level heading */}
        <Text style={[Type.display, { color: OaklandDusk.text.primary }]}>What to buy next?</Text>
        {/* Type.caption — small secondary subtitle */}
        <Text style={[Type.caption, { color: OaklandDusk.text.secondary }]}>
          Based on bottles you already own
        </Text>
      </View>

      {/* Loading */}
      {loading && !hasFetched && (
        <View style={{ padding: 40, alignItems: "center" }}>
          <ActivityIndicator size="large" color={OaklandDusk.brand.gold} />
          {/* Type.body — loading state description */}
          <Text style={[Type.body, { color: OaklandDusk.text.secondary, marginTop: 12 }]}>Analyzing your bar...</Text>
        </View>
      )}

      {/* Error — S1:tap 重試 */}
      {error && (
        <Pressable
          onPress={fetchSuggestions}
          accessibilityRole="button"
          accessibilityLabel="Retry loading recommendations"
          style={{ padding: 12, borderWidth: 1, borderRadius: 14, borderColor: OaklandDusk.accent.crimson, backgroundColor: OaklandDusk.accent.roseBg, gap: 4 }}
        >
          {/* Type.caption — error message */}
          <Text style={[Type.caption, { color: OaklandDusk.semantic.error }]}>{error}</Text>
          <Text style={[Type.caption, { color: OaklandDusk.text.tertiary }]}>Tap to retry</Text>
        </Pressable>
      )}

      {/* Hero number — top PRIMARY suggestion's unlock count */}
      {hasFetched && primarySuggestions.length > 0 && !loading && (
        <Pressable
          onPress={() => openUnlocks(
            "All new cocktails",
            Array.from(
              new Map(
                primarySuggestions.flatMap((s) => s.recipes ?? []).map((r) => [r.iba_code, r])
              ).values()
            )
          )}
          accessibilityRole="button"
          accessibilityLabel="See all new cocktails"
          style={{ alignItems: "center", paddingVertical: 16 }}
        >
          {/* LEAVE: 14px hero support text — no matching role */}
          <Text style={{ fontSize: 14, color: OaklandDusk.text.tertiary }}>Add one bottle, make</Text>
          {/* LEAVE: 48px hero number — outside type scale */}
          <Text style={{ fontSize: 48, fontWeight: "800", color: OaklandDusk.brand.gold, lineHeight: 56 }}>
            {primarySuggestions[0].unlocks_count} more ›
          </Text>
          {/* LEAVE: 16px "cocktails" companion — no matching role */}
          <Text style={{ fontSize: 16, fontWeight: "700", color: OaklandDusk.brand.gold }}>cocktails</Text>
        </Pressable>
      )}

      {hasFetched && filteredSuggestions.length === 0 && !loading && (
        meta?.reason === "no_inventory" ? (
          <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
            <FontAwesome name="search" size={36} color={OaklandDusk.text.tertiary} />
            {/* Type.heading — empty-state title */}
            <Text style={[Type.heading, { color: OaklandDusk.text.primary }]}>No bottles in your bar yet</Text>
            {/* Type.caption — empty-state description */}
            <Text style={[Type.caption, { color: OaklandDusk.text.secondary, textAlign: "center" }]}>
              Scan your bottles first, then come back for personalized recommendations.
            </Text>
            <Pressable
              onPress={() => router.push("/(tabs)/inventory")}
              style={{
                backgroundColor: OaklandDusk.brand.gold,
                borderRadius: 12,
                paddingVertical: 12,
                paddingHorizontal: 24,
                marginTop: 8,
              }}
            >
              {/* Type.button — CTA */}
              <Text style={[Type.button, { color: OaklandDusk.bg.void }]}>
                Go to My Bar
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
            <FontAwesome name="check-circle" size={36} color="#6B8F6B" />
            {/* Type.heading — empty-state title */}
            <Text style={[Type.heading, { color: OaklandDusk.text.primary }]}>Your bar is well stocked!</Text>
            {/* Type.caption — empty-state description */}
            <Text style={[Type.caption, { color: OaklandDusk.text.secondary, textAlign: "center" }]}>
              Scan more bottles or add favorites to get better suggestions.
            </Text>
          </View>
        )
      )}

      {/* Primary suggestion cards — true must-buys */}
      {primarySuggestions.map((s, i) => {
        const isTop = i === 0;

        return (
          <View
            key={s.ingredient_key}
            style={{
              borderRadius: 14,
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
                {/* Type.label — badge kicker */}
                <Text style={[Type.label, { color: OaklandDusk.bg.void }]}>#1 pick</Text>
              </View>
            )}

            <View style={{ padding: 16, gap: 14 }}>
              {/* Row 1: Bottle name + category + big unlock number */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  {/* Type.heading — ingredient name;S3 批接 tap → 說明頁 */}
                  <Text style={[Type.heading, { color: OaklandDusk.text.primary }]}>
                    {s.display_name}
                  </Text>
                </View>
                <Pressable
                  onPress={() => openUnlocks(`${s.display_name} unlocks`, s.recipes)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`See the ${s.unlocks_count} cocktails ${s.display_name} unlocks`}
                  style={{ alignItems: "flex-end" }}
                >
                  {/* +N 裸字(mockup v6 拍板):Bebas 金,無框無副標;tap → 明細頁 */}
                  <Text style={[Type.title, { fontSize: 32, lineHeight: 34, color: OaklandDusk.brand.gold }]}>
                    +{s.unlocks_count}
                  </Text>
                </Pressable>
              </View>

              {/* SHOP-LIST 3b-fix: single primary CTA — add to shopping
                  list. I Want This / notify / browser jump removed by
                  ruling 2026-07-28; the intent stream is now the
                  shopping_list table + check-off. */}
              {/* B v4 拍板:滿版金鈕 → 右下小膠囊(減壓);已加 = 綠描邊 */}
              <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                <Pressable
                  onPress={() => handleAddToList(s)}
                  disabled={listedKeys.has(s.ingredient_key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${s.display_name} to shopping list`}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 7,
                    backgroundColor: "transparent",
                    borderWidth: 1,
                    borderColor: listedKeys.has(s.ingredient_key)
                      ? "rgba(74,222,128,0.4)"
                      : "rgba(200,120,40,0.45)",
                    borderRadius: R.pill, paddingVertical: 8, paddingHorizontal: 15,
                  }}
                >
                  <FontAwesome
                    name={listedKeys.has(s.ingredient_key) ? "check" : "shopping-bag"}
                    size={12}
                    color={listedKeys.has(s.ingredient_key) ? "#4ade80" : OaklandDusk.brand.gold}
                  />
                  {/* Type.caption — 小膠囊標籤 */}
                  <Text style={[Type.caption, {
                    fontWeight: "700",
                    color: listedKeys.has(s.ingredient_key) ? "#4ade80" : OaklandDusk.brand.gold,
                  }]}>
                    {listedKeys.has(s.ingredient_key) ? "On list" : "Add"}
                  </Text>
                </Pressable>
              </View>
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
              {/* LEAVE: 15px/700 section toggle — doesn't cleanly map to heading(17) or body(15/normal) */}
              <Text style={{ fontSize: 15, fontWeight: "700", color: exploreExpanded ? OaklandDusk.brand.gold : OaklandDusk.text.secondary }}>
                Explore
              </Text>
              <View style={{ backgroundColor: "rgba(200,120,40,0.1)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                {/* LEAVE: 11px pill count — label textTransform would uppercase "3 upgrades" */}
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
            // Type.caption — collapsed section subtitle
            <Text style={[Type.caption, { color: OaklandDusk.text.secondary, marginTop: 6 }]}>
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
                      borderRadius: 14,
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
                        {/* Type.heading — explore card ingredient name */}
                        <Text style={[Type.heading, { color: OaklandDusk.text.primary }]}>
                          {s.display_name}
                        </Text>
                        {/* Type.caption — category sub-label */}
                        <Text style={[Type.caption, { color: OaklandDusk.text.secondary, marginTop: 2 }]}>
                          {s.category_key ? s.category_key.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : ""}
                        </Text>
                      </View>
                      {/* LEAVE: 14px/600 muted count — between caption(12) and body(15), no clean role */}
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
                        {/* Type.caption — availability note */}
                        <Text style={[Type.caption, { color: "#97C459" }]}>
                          You have {covering.user_has_display} as a substitute
                        </Text>
                      </View>
                    )}

                    {/* Alt description */}
                    {s.alt_description ? (
                      // Type.caption — alt description
                      <Text style={[Type.caption, { color: OaklandDusk.text.secondary }]}>
                        {s.alt_description}
                      </Text>
                    ) : null}

                    {/* Recipe pills — muted style */}
                    {showRecipes.length > 0 && (
                      <View>
                        {/* Type.label — recipe section kicker */}
                        <Text style={[Type.label, { color: OaklandDusk.text.secondary, marginBottom: 4 }]}>
                          ORIGINAL RECIPE USES {s.display_name.toUpperCase()} IN
                        </Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                          {showRecipes.map((name: string) => (
                            <View key={name} style={{
                              backgroundColor: "rgba(200,120,40,0.08)",
                              paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
                            }}>
                              {/* LEAVE: 11px recipe names — label would uppercase proper nouns */}
                              <Text style={{ fontSize: 11, color: OaklandDusk.text.secondary }}>{name}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* CTA: outline style — add to shopping list (3b-fix) */}
                    <Pressable
                      onPress={() => handleAddToList(s)}
                      disabled={listedKeys.has(s.ingredient_key)}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${s.display_name} to shopping list`}
                      style={{
                        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                        borderWidth: 1,
                        borderColor: listedKeys.has(s.ingredient_key)
                          ? "rgba(74,222,128,0.2)"
                          : "rgba(200,120,40,0.2)",
                        borderRadius: 12,
                        paddingVertical: 11,
                        marginTop: 2,
                        opacity: listedKeys.has(s.ingredient_key) ? 0.7 : 1,
                      }}
                    >
                      <FontAwesome
                        name={listedKeys.has(s.ingredient_key) ? "check" : "shopping-bag"}
                        size={12}
                        color={listedKeys.has(s.ingredient_key) ? "#4ade80" : OaklandDusk.brand.gold}
                      />
                      {/* Type.button — explore CTA */}
                      <Text style={[Type.button, {
                        color: listedKeys.has(s.ingredient_key) ? "#4ade80" : OaklandDusk.brand.gold,
                      }]}>
                        {listedKeys.has(s.ingredient_key) ? "On list" : "Add"}
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
        // LEAVE: 11px footnote — label textTransform would uppercase the hint text
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
          borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18,
          flexDirection: "row", alignItems: "center", gap: 10,
          shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
        }}>
          <FontAwesome name="check-circle" size={16} color="#4ade80" />
          {/* LEAVE: 13px toast message with hardcoded color — UI component, not content role */}
          <Text style={{ fontSize: 13, color: "#F2E8D8", flex: 1 }}>
            {toastMessage}
          </Text>
        </View>
      )}
    </View>
  );
}
