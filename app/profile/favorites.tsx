import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import OaklandDusk from "@/constants/OaklandDusk";
import { useFeedback } from "@/context/feedback";
import { aggregateIngredientVectors, buildFourWordDescriptor } from "@/context/ontology";
import { useFavorites } from "@/context/favorites";
import { useInventory } from "@/context/inventory";

function asStringList(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function extractIngredientsFromAnyRecipe(recipe: any): string[] {
  if (!recipe || typeof recipe !== "object") return [];

  if (Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0) {
    const fromDb = recipe.ingredients
      .map((x: any) => String(x?.item ?? x?.name ?? "").trim())
      .filter(Boolean);
    if (fromDb.length > 0) return fromDb;
  }

  if (Array.isArray(recipe.ingredients_ml) && recipe.ingredients_ml.length > 0) {
    const fromLegacyMl = recipe.ingredients_ml
      .map((x: any) => {
        if (typeof x === "string") return x.trim();
        if (x && typeof x === "object") return String(x.item ?? x.name ?? "").trim();
        return "";
      })
      .filter(Boolean);
    if (fromLegacyMl.length > 0) return fromLegacyMl;
  }

  if (Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0) {
    const fromLegacy = recipe.ingredients
      .map((x: any) => {
        if (typeof x === "string") return x.trim();
        if (x && typeof x === "object") return String(x.item ?? x.name ?? "").trim();
        return "";
      })
      .filter(Boolean);
    if (fromLegacy.length > 0) return fromLegacy;
  }

  return [];
}

function extractStyleFromRecipe(recipe: any): string {
  if (!recipe || typeof recipe !== "object") return "";
  return String((recipe as any)?.iba_category ?? "").trim();
}

function isSubtitleTokens(tags: string[]): boolean {
  return tags.length === 4 || tags.length === 3;
}

function buildSubtitleFromStyleAndDescriptor(style: string, descriptor: any): string {
  const words = Array.isArray(descriptor?.words) ? descriptor.words : [];
  const taste = words.length ? words.slice(0, 3).join(" • ") : "";
  const line = [style, taste].filter(Boolean).join(" • ");
  return line.trim();
}

export default function TabThreeScreen() {
  const router = useRouter();
  const { favoritesByKey, removeFavorite } = useFavorites();
  const { inventory, initialized: inventoryInitialized } = useInventory();

  const feedback = useFeedback() as any;
  const ratingsByKey: Record<string, "like" | "dislike"> =
    feedback?.ratingsByKey ?? feedback?.ratings ?? {};
  const clearRating: ((recipeKey: string) => void) | undefined = feedback?.clearRating;

  const favoritesList = useMemo(() => {
    const arr = Object.values(favoritesByKey ?? {});
    return arr.sort((a: any, b: any) => (b.saved_at ?? 0) - (a.saved_at ?? 0));
  }, [favoritesByKey]);

  // Build inventory key set for availability checks
  const invKeySet = useMemo(() => {
    if (!inventoryInitialized) return null;
    const s = new Set<string>();
    for (const it of inventory) {
      const k = String(it.ingredient_key ?? "").trim();
      if (k) s.add(k);
    }
    return s;
  }, [inventory, inventoryInitialized]);

  const getAvailability = (fav: any): { ready: boolean; missingCount: number } | null => {
    if (!invKeySet) return null;
    const keys = extractIngredientsFromAnyRecipe(fav?.recipe);
    if (keys.length === 0) return null;
    const missing = keys.filter((k) => !invKeySet.has(k));
    return { ready: missing.length === 0, missingCount: missing.length };
  };

  const openFavorite = (favKey: string) => {
    const fav: any = favoritesByKey?.[favKey];
    if (!fav) return;

    const ibaCode = String(fav.iba_code ?? fav.recipe?.iba_code ?? "").trim();

    router.push({
      pathname: "/recipe",
      params: {
        idx: "0",
        recipe_key: fav.recipe_key,
        iba_code: ibaCode || undefined,
        recipe_json: encodeURIComponent(JSON.stringify(fav.recipe)),
        ingredients_json: encodeURIComponent(JSON.stringify(fav.ingredients)),
      },
    });
  };

  const getSubtitleForFavorite = (fav: any) => {
    const tags = asStringList(fav?.tags);
    if (isSubtitleTokens(tags)) {
      return tags.join(" • ");
    }

    const recipe = fav?.recipe;
    const style = extractStyleFromRecipe(recipe);

    const ing = extractIngredientsFromAnyRecipe(recipe);
    if (!ing.length) {
      return style ? style : "";
    }

    const vec = aggregateIngredientVectors(ing);
    const desc = buildFourWordDescriptor(vec);

    return buildSubtitleFromStyleAndDescriptor(style, desc);
  };

  const onRemoveWithConfirm = (favKey: string) => {
    const fav: any = favoritesByKey?.[favKey];
    const title = String(fav?.title ?? "Recipe").trim() || "Recipe";
    const hasRating = Boolean(ratingsByKey?.[favKey]);

    if (!hasRating || typeof clearRating !== "function") {
      Alert.alert("Remove from Favorites", `Remove "${title}"?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => removeFavorite(favKey) },
      ]);
      return;
    }

    Alert.alert(
      "Remove favorite",
      `Remove "${title}" from Favorites?\n\nYou also have a Like/Dislike on this recipe.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove only",
          style: "destructive",
          onPress: () => removeFavorite(favKey),
        },
        {
          text: "Remove + clear rating",
          style: "destructive",
          onPress: () => {
            removeFavorite(favKey);
            clearRating(favKey);
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={{ backgroundColor: OaklandDusk.bg.void }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <FontAwesome name="heart" size={20} color="#E11D48" />
        <Text style={{ fontSize: 20, fontWeight: "900", color: OaklandDusk.text.primary }}>My Favorites</Text>
      </View>

      {favoritesList.length === 0 ? (
        <Text style={{ color: OaklandDusk.text.tertiary }}>(No favorites yet)</Text>
      ) : (
        <View style={{ gap: 10 }}>
          {favoritesList.map((fav: any) => {
            const key = String(fav.recipe_key || "");
            const title = String(fav.title ?? "Recipe").trim() || "Recipe";
            const subtitle = getSubtitleForFavorite(fav);
            const avail = getAvailability(fav);

            return (
              <View
                key={key}
                style={{
                  borderWidth: 1,
                  borderColor: OaklandDusk.bg.border,
                  borderRadius: 12,
                  padding: 12,
                  gap: 8,
                  backgroundColor: OaklandDusk.bg.card,
                }}
              >
                {/* Header: title + ⋯ options */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text style={{ fontWeight: "800", flex: 1, color: OaklandDusk.text.primary }} numberOfLines={1}>
                    {title}
                  </Text>

                  <Pressable
                    onPress={() =>
                      Alert.alert(title, undefined, [
                        { text: "View recipe", onPress: () => openFavorite(key) },
                        {
                          text: "Remove from Favorites",
                          style: "destructive",
                          onPress: () => onRemoveWithConfirm(key),
                        },
                        { text: "Cancel", style: "cancel" },
                      ])
                    }
                    hitSlop={12}
                    style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                  >
                    <Text style={{ fontSize: 18, color: OaklandDusk.text.tertiary }}>⋯</Text>
                  </Pressable>
                </View>

                {/* Subtitle */}
                {subtitle ? (
                  <Text style={{ color: OaklandDusk.text.secondary, fontSize: 13 }}>{subtitle}</Text>
                ) : null}

                {/* Availability badge */}
                {avail !== null ? (
                  avail.ready ? (
                    <Text style={{ fontSize: 12, color: "#22C55E", fontWeight: "600" }}>
                      ✓ Ready to make
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 12, color: OaklandDusk.text.tertiary }}>
                      ✗ Missing {avail.missingCount} ingredient{avail.missingCount !== 1 ? "s" : ""}
                    </Text>
                  )
                ) : null}

                {/* Contextual primary CTA */}
                <Pressable
                  onPress={() => openFavorite(key)}
                  style={{
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: "center",
                    ...(avail?.ready
                      ? { backgroundColor: "#D4A030" }
                      : {
                          backgroundColor: "transparent",
                          borderWidth: 1,
                          borderColor: OaklandDusk.bg.border,
                        }),
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "800",
                      fontSize: 14,
                      color: avail?.ready ? "#1A1A2E" : OaklandDusk.text.secondary,
                    }}
                  >
                    {avail?.ready
                      ? "Make it →"
                      : avail !== null
                      ? "See what's missing →"
                      : "View recipe →"}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
