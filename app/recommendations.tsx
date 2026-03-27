import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as Sentry from "@sentry/react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";

import OaklandDusk from "@/constants/OaklandDusk";
import { normalizeIngredientKey } from "@/context/ontology";
import GuideBubble, { GUIDE_KEYS, dismissGuide, isGuideDismissed } from "@/components/GuideBubble";

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

function getTasteTags(vec: Record<string, any> | null | undefined, max = 3): string[] {
  if (!vec) return [];
  const tags: string[] = [];
  const v = (k: string) => Number(vec[k] ?? 0);
  if (v("alcoholStrength") >= 2.0) tags.push("Strong");
  else if (v("alcoholStrength") >= 1.0) tags.push("Medium");
  else if (v("alcoholStrength") > 0) tags.push("Light");
  if (v("sweetness") >= 0.5) tags.push("Sweet");
  if (v("sourness") >= 0.5) tags.push("Sour");
  if (v("bitterness") >= 0.5) tags.push("Bitter");
  if (v("fruity") >= 0.5) tags.push("Fruity");
  if (v("herbal") >= 0.3) tags.push("Herbal");
  if (v("smoky") >= 0.5) tags.push("Smoky");
  if (v("fizz") >= 0.5) tags.push("Fizzy");
  return tags.slice(0, max);
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function RecommendationsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    recipes: string;
    ingredientCount: string;
    activeCanonical: string;
    scanItems: string;
  }>();

  const [guideRecoShopVisible, setGuideRecoShopVisible] = useState(false);

  useEffect(() => {
    isGuideDismissed(GUIDE_KEYS.RECO_SHOP).then((d) => setGuideRecoShopVisible(!d));
  }, []);

  const recipes: RecipeItem[] = useMemo(() => {
    try { return JSON.parse(params.recipes ?? "[]"); } catch { return []; }
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

  const openRecipe = (r: RecipeItem, idx: number) => {
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
      <View
        style={{
          borderWidth: 0.5,
          borderLeftWidth: 3,
          borderRadius: 12,
          borderColor: OaklandDusk.bg.border,
          borderLeftColor: color,
          backgroundColor: OaklandDusk.bg.card,
          overflow: "hidden",
          padding: 14,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>

          {/* Left: name + flavor tags + View recipe */}
          <View style={{ flex: 1, paddingRight: 12, gap: 6 }}>
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

            {/* Missing items with cart + guide */}
            <View style={{ gap: 6 }}>
            {miss.map((m, mi) => (
              <View key={m} style={{ position: "relative" }}>
                {isFirstCard && mi === 0 && (
                  <GuideBubble
                    storageKey={GUIDE_KEYS.RECO_SHOP}
                    text="Buy missing items!"
                    visible={guideRecoShopVisible}
                    onDismiss={() => setGuideRecoShopVisible(false)}
                    align="right"
                    position="below"
                  />
                )}
                <Pressable
                  onPress={() => {
                    if (isFirstCard && mi === 0) {
                      dismissGuide(GUIDE_KEYS.RECO_SHOP);
                      setGuideRecoShopVisible(false);
                    }
                    Linking.openURL(
                      `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(m + " bottle")}`
                    );
                  }}
                  hitSlop={8}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <Text style={{ fontSize: 13, color: OaklandDusk.accent.crimson }} numberOfLines={1}>
                    {m.replace(/_/g, " ")}
                  </Text>
                  <FontAwesome name="shopping-cart" size={15} color={OaklandDusk.brand.gold} />
                </Pressable>
              </View>
            ))}
            </View>
          </View>

        </View>
      </View>
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
        headerBackTitle: "Scan",
        headerShadowVisible: false,
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

      <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}>
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
              <RecipeCard key={`ready-${i}`} r={r} idx={i} isFirstCard={false} />
            ))}

            {(oneMissing.length > 0 || twoMissing.length > 0) && (
              <Pressable
                onPress={() => {
                  try {
                    Sentry.addBreadcrumb({
                      category: "restock",
                      message: "restock_cta_tap",
                      level: "info",
                    });
                  } catch {}
                  try {
                    router.push("/(tabs)/cart" as any);
                  } catch {}
                }}
                accessibilityLabel="See what to buy next"
                accessibilityRole="button"
                style={{
                  marginTop: 12,
                  marginBottom: 4,
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                  backgroundColor: OaklandDusk.brand.gold,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: "700", color: OaklandDusk.bg.void }}>
                  See what to buy next →
                </Text>
              </Pressable>
            )}

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
      </ScrollView>
    </View>
  );
}
