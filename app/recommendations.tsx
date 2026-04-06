import * as Sentry from "@sentry/react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import HintBubble, { GUIDE_KEYS, dismissGuide, isGoldenPathStepReady } from "@/components/GuideBubble";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

import OaklandDusk from "@/constants/OaklandDusk";
import { normalizeIngredientKey } from "@/context/ontology";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "@/lib/api";
import { getTasteTags } from "@/lib/tasteTags";
import { useAuth } from "@/context/auth";
import { useInventory } from "@/context/inventory";
import { STAPLES_STORAGE_KEY } from "@/components/StaplesModal";
import CocktailThumbnail from "@/components/CocktailThumbnail";

// ── Types ─────────────────────────────────────────────────────────────────────

type Bucket = "ready" | "one_missing" | "two_missing";

type RecipeItem = {
  name?: string;
  iba_code?: string;
  recipe_key?: string;
  recipe_hash?: string;
  bucket: Bucket;
  missing_items?: string[];
  overlap_hits?: string[];
  recipe_vec?: Record<string, any> | null;
  image_url?: string | null;
  [key: string]: any;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function bucketColor(bucket: Bucket): string {
  if (bucket === "ready") return "#7AB89A";
  if (bucket === "one_missing") return OaklandDusk.brand.gold;
  return "#C04858";
}

function bucketLabel(bucket: Bucket): string {
  if (bucket === "ready") return "Ready";
  if (bucket === "one_missing") return "1 missing";
  return "2 missing";
}


// ── Screen ────────────────────────────────────────────────────────────────────

export default function RecommendationsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { availableIngredientKeys } = useInventory();
  const params = useLocalSearchParams<{
    recipes: string;
    ingredientCount: string;
    activeCanonical: string;
    scanItems: string;
    mode: string;  // "inventory" | "quick_look"
  }>();

  const isInventoryMode = params.mode === "inventory";

  // Restock picks — top 2 primary suggestions, shown in sticky footer (inventory mode only)
  const [restockPicks, setRestockPicks] = useState<any[]>([]);
  const [gpStep5Visible, setGpStep5Visible] = useState(false);

  useEffect(() => {
    isGoldenPathStepReady(5).then((ready) => {
      if (ready) setGpStep5Visible(true);
    });
  }, []);

  useEffect(() => {
    if (!isInventoryMode || !session) return;
    const fetchRestock = async () => {
      try {
        // Read staples the user already confirmed having (same logic as cart.tsx)
        let staplesKeys = new Set<string>();
        try {
          const val = await AsyncStorage.getItem(STAPLES_STORAGE_KEY);
          if (val) {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) staplesKeys = new Set(parsed);
          }
        } catch {}

        const res = await apiFetch("/restock-suggestions", {
          session,
          method: "POST",
          body: { user_interactions: {} },
        });
        if (!res.ok) return;
        const data = await res.json();
        const primary = (data.suggestions ?? []).filter(
          (s: any) => !s.is_alternative_upgrade && !staplesKeys.has(s.ingredient_key)
        );
        setRestockPicks(primary.slice(0, 2));
      } catch (err) {
        console.warn("[recommendations] restock fetch failed:", err);
      }
    };
    fetchRestock();
  }, [isInventoryMode, session, availableIngredientKeys]);

  const recipes: RecipeItem[] = useMemo(() => {
    try {
      const all: RecipeItem[] = JSON.parse(params.recipes ?? "[]");
      // Only show recipes with at most 2 missing ingredients
      return all.filter((r) => (r.missing_items?.length ?? 0) <= 2);
    } catch { return []; }
  }, [params.recipes]);

  const scanItems: { canonical: string; display: string }[] = useMemo(() => {
    try { return JSON.parse(params.scanItems ?? "[]"); } catch { return []; }
  }, [params.scanItems]);

  const activeCanonical: string[] = useMemo(() => {
    try { return JSON.parse(params.activeCanonical ?? "[]"); } catch { return []; }
  }, [params.activeCanonical]);

  const ingredientCount = parseInt(params.ingredientCount ?? "0", 10);

  const ready = recipes.filter((r) => r.bucket === "ready");
  const oneMissing = recipes.filter((r) => r.bucket === "one_missing");
  const twoMissing = recipes.filter((r) => r.bucket === "two_missing");

  // Stage 3: compute top missing ingredients — only shown in inventory mode where
  // both recommendations and Smart Restock are based on My Bar (consistent data source).
  // In quick_look mode this is omitted because 1-missing/2-missing sections already show what's needed.
  const topMissing = useMemo(() => {
    if (!isInventoryMode) return [];
    const missingTally: Record<string, number> = {};
    for (const recipe of [...oneMissing, ...twoMissing]) {
      for (const item of (recipe.missing_items ?? [])) {
        const key = String(item ?? "").trim();
        if (key) missingTally[key] = (missingTally[key] || 0) + 1;
      }
    }
    return Object.entries(missingTally)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);
  }, [oneMissing, twoMissing, isInventoryMode]);

  const formatIngredientName = (key: string) => {
    const s = key.replace(/_/g, " ").trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const openRecipe = (r: RecipeItem, idx: number) => {
    // Dismiss GP step 5 if showing
    if (gpStep5Visible) {
      dismissGuide(GUIDE_KEYS.GP_STEP_5);
      setGpStep5Visible(false);
    }
    const code = String(r?.iba_code ?? "").trim();
    const name = String(r?.name ?? "Recipe").trim() || "Recipe";
    const recipeHash = String(r?.recipe_hash ?? "").trim();
    const recipeKeyFromPayload = String(r?.recipe_key ?? "").trim();

    const recipe_key =
      recipeKeyFromPayload ||
      recipeHash ||
      (code ? `${code}-${name}` : `${idx + 1}-${name}`);

    const ingredients_json = encodeURIComponent(JSON.stringify(activeCanonical));
    const scan_items_json = encodeURIComponent(JSON.stringify(scanItems));

    const missRaw =
      Array.isArray(r?.missing_items) && r.missing_items.length > 0
        ? r.missing_items
        : Array.isArray(r?.match?.missing_items)
        ? r.match.missing_items
        : [];
    const miss = missRaw
      .map((s: any) => String(normalizeIngredientKey(String(s ?? "")) || "").trim())
      .filter(Boolean);
    const missing_items_json = encodeURIComponent(JSON.stringify(miss));

    const overlapHitsRaw = Array.isArray(r?.overlap_hits) ? r.overlap_hits : [];
    const overlap_hits_json = encodeURIComponent(
      JSON.stringify(overlapHitsRaw.map((x: any) => String(x ?? "").trim()).filter(Boolean))
    );

    router.push({
      pathname: "/recipe",
      params: {
        idx: String(idx),
        source: "cocktails",
        recipe_key,
        recipe_hash: recipeHash || undefined,
        iba_code: code,
        ingredients_json,
        scan_items_json,
        missing_items_json,
        overlap_hits_json,
        from: "recommendations",
      },
    });
  };

  // ── Card ───────────────────────────────────────────────────────────────────

  const RecipeCard = ({
    r,
    idx,
    isFirstCard,
  }: {
    r: RecipeItem;
    idx: number;
    isFirstCard: boolean;
  }) => {
    const name = String(r?.name ?? "").trim() || "Recipe";
    const color = bucketColor(r.bucket);
    const tags = getTasteTags(r.recipe_vec);

    const missRaw =
      Array.isArray(r.missing_items) && r.missing_items.length > 0
        ? r.missing_items
        : Array.isArray(r?.match?.missing_items)
        ? r.match.missing_items
        : [];
    const miss = missRaw.map((s: any) => String(s ?? "").trim()).filter(Boolean);

    return (
      <Pressable
        onPress={() => openRecipe(r, idx)}
        style={({ pressed }) => ({
          borderWidth: 0.5,
          borderLeftWidth: 3,
          borderRadius: 12,
          borderColor: OaklandDusk.bg.border,
          borderLeftColor: color,
          backgroundColor: OaklandDusk.bg.card,
          overflow: "hidden",
          padding: 14,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>

          {/* Thumbnail — tap opens lightbox */}
          <CocktailThumbnail imageUrl={r.image_url} />

          {/* Left: name + flavor tags + View recipe */}
          <View style={{ flex: 1, paddingRight: 12, marginLeft: 12, gap: 6 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: OaklandDusk.text.primary }}>
              {name}
            </Text>

            {tags.length > 0 && (
              <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap" }}>
                {tags.map((tag) => (
                  <View key={tag} style={{
                    backgroundColor: OaklandDusk.brand.tagBg,
                    paddingHorizontal: 6, paddingVertical: 1,
                    borderRadius: 4,
                    borderWidth: 0.5, borderColor: "rgba(201,164,88,.2)",
                  }}>
                    <Text style={{ fontSize: 10, color: OaklandDusk.brand.gold }}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}

            <Pressable
              onPress={() => openRecipe(r, idx)}
              style={{
                flexDirection: "row", alignItems: "center", gap: 4,
                borderWidth: 1, borderColor: OaklandDusk.bg.border,
                borderRadius: 7,
                paddingHorizontal: 10, paddingVertical: 4,
                alignSelf: "flex-start",
              }}
            >
              <Text style={{ fontSize: 11, color: OaklandDusk.text.secondary }}>View recipe</Text>
              <Text style={{ fontSize: 11, color: OaklandDusk.text.tertiary }}>›</Text>
            </Pressable>
          </View>

          {/* Right: bucket badge + missing items with cart */}
          <View style={{ alignItems: "flex-end", gap: 6, minWidth: 90 }}>
            {/* Bucket badge */}
            {r.bucket === "ready" ? (
              <View style={{
                backgroundColor: "rgba(107,143,107,0.15)",
                paddingHorizontal: 8, paddingVertical: 2,
                borderRadius: 8,
              }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#6B8F6B" }}>Ready</Text>
              </View>
            ) : (
              <View style={{
                backgroundColor: "rgba(192,72,88,.12)",
                paddingHorizontal: 8, paddingVertical: 2,
                borderRadius: 8,
              }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: OaklandDusk.accent.crimson }}>
                  {miss.length} missing
                </Text>
              </View>
            )}

            {/* Missing items — pure text display */}
            <View style={{ gap: 6 }}>
            {miss.map((m: string) => (
              <View key={m} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 13, color: OaklandDusk.accent.crimson }} numberOfLines={1}>
                  {m.replace(/_/g, " ")}
                </Text>
              </View>
            ))}
            </View>
          </View>

        </View>
      </Pressable>
    );
  };

  const SectionHeader = ({ title, count }: { title: string; count: number }) => {
    if (count === 0) return null;
    return (
      <Text style={{ fontSize: 13, fontWeight: "700", color: OaklandDusk.text.secondary, marginTop: 8 }}>
        {title} ({count})
      </Text>
    );
  };

  // Build flat list so we can compute global index for first-card detection
  const allCards: { r: RecipeItem; globalIdx: number }[] = [
    ...ready.map((r, i) => ({ r, globalIdx: i })),
    ...oneMissing.map((r, i) => ({ r, globalIdx: ready.length + i })),
    ...twoMissing.map((r, i) => ({ r, globalIdx: ready.length + oneMissing.length + i })),
  ];
  // "first card with missing items" = first card in oneMissing or twoMissing
  const firstMissingCardGlobalIdx = allCards.find(
    ({ r }) => r.bucket !== "ready"
  )?.globalIdx ?? -1;

  return (
    <View style={{ flex: 1, backgroundColor: OaklandDusk.bg.void }}>
      {/* Fix 5: Stack.Screen — back label shows "Scan" */}
      <Stack.Screen options={{
        title: "",
        headerStyle: { backgroundColor: OaklandDusk.bg.void },
        headerTintColor: OaklandDusk.brand.gold,
        headerBackTitle: isInventoryMode ? "My Bar" : "Cocktails",
        headerShadowVisible: false,
        headerLeft: () => (
          <Pressable
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace(isInventoryMode ? "/(tabs)/inventory" as any : "/(tabs)/bartender" as any);
              }
            }}
            hitSlop={16}
            style={{ paddingHorizontal: 8, paddingVertical: 8 }}
          >
            <Text style={{ color: OaklandDusk.brand.gold, fontSize: 17 }}>
              ‹ {isInventoryMode ? "My Bar" : "Cocktails"}
            </Text>
          </Pressable>
        ),
      }} />

      {/* Custom title row (shown below the native header) */}
      <View style={{
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 10,
        borderBottomWidth: 0.5,
        borderBottomColor: OaklandDusk.bg.border,
      }}>
        <Text style={{ fontSize: 20, fontWeight: "800", color: OaklandDusk.brand.gold }}>
          Cocktails
        </Text>
        {ingredientCount > 0 && (
          <Text style={{ fontSize: 12, color: OaklandDusk.text.secondary }}>
            Based on {ingredientCount} scanned ingredient{ingredientCount !== 1 ? "s" : ""}
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 140 }}>
        {recipes.length === 0 ? (
          <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
            <Text style={{ fontWeight: "800", color: OaklandDusk.text.primary }}>No matches found</Text>
            <Text style={{ color: OaklandDusk.text.secondary, textAlign: "center" }}>
              Try scanning more bottles or adding ingredients to your bar.
            </Text>
          </View>
        ) : (
          <>
            <SectionHeader title="Ready to make" count={ready.length} />
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

            {/* Inventory mode: no ready cocktails empty state */}
            {ready.length === 0 && isInventoryMode ? (
              <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
                <Text style={{ fontWeight: "800", color: OaklandDusk.text.primary }}>
                  You're close!
                </Text>
                <Text style={{ color: OaklandDusk.text.secondary, textAlign: "center" }}>
                  Add one more bottle to your bar and you'll start unlocking cocktails.
                </Text>
              </View>
            ) : null}


            {/* 1 missing / 2 missing — only shown in quick_look mode (or no mode) */}
            {!isInventoryMode && (
              <>
                <SectionHeader title="1 ingredient away" count={oneMissing.length} />
                {oneMissing.map((r, i) => (
                  <RecipeCard
                    key={`one-${i}`}
                    r={r}
                    idx={ready.length + i}
                    isFirstCard={ready.length + i === firstMissingCardGlobalIdx}
                  />
                ))}

                <SectionHeader title="2 ingredients away" count={twoMissing.length} />
                {twoMissing.map((r, i) => (
                  <RecipeCard
                    key={`two-${i}`}
                    r={r}
                    idx={ready.length + oneMissing.length + i}
                    isFirstCard={ready.length + oneMissing.length + i === firstMissingCardGlobalIdx}
                  />
                ))}
              </>
            )}

          </>
        )}
      </ScrollView>

      {/* Sticky footer: Smart Restock CTA + Unlock insight */}
      {recipes.length > 0 && (oneMissing.length > 0 || twoMissing.length > 0) && (
        <View style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: Platform.OS === "ios" ? 16 : 12,
          backgroundColor: OaklandDusk.bg.void,
          borderTopWidth: 0.5,
          borderTopColor: OaklandDusk.bg.border,
        }}>
          {/* Restock mini cards — inventory mode only, top 2 primary picks */}
          {isInventoryMode && restockPicks.length > 0 && (
            <View style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 11, color: OaklandDusk.text.secondary, letterSpacing: 0.5, marginBottom: 8 }}>
                WANT MORE COCKTAILS?
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {restockPicks.map((pick, i) => (
                  <Pressable
                    key={pick.ingredient_key}
                    onPress={() => router.push({ pathname: '/(tabs)/cart', params: { autoFetch: 'true' } })}
                    style={{
                      flex: 1,
                      backgroundColor: OaklandDusk.bg.card,
                      borderWidth: 0.5,
                      borderColor: i === 0 ? "rgba(200,120,40,0.25)" : "rgba(200,120,40,0.15)",
                      borderRadius: 12,
                      padding: 10,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: OaklandDusk.text.primary, flex: 1 }} numberOfLines={1}>
                        {pick.display_name}
                      </Text>
                      <Text style={{ fontSize: 16, fontWeight: "800", color: OaklandDusk.brand.gold, marginLeft: 4 }}>
                        +{pick.unlocks_count}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, color: OaklandDusk.text.secondary }}>
                      Unlocks {pick.unlocks_count} cocktail{pick.unlocks_count > 1 ? "s" : ""}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

        </View>
      )}


    </View>
  );
}
