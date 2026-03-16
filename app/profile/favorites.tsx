import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { useFeedback } from "@/context/feedback";
import { aggregateIngredientVectors, buildFourWordDescriptor } from "@/context/ontology";
import { useFavorites } from "../../context/favorites";

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

  const feedback = useFeedback() as any;
  const ratingsByKey: Record<string, "like" | "dislike"> =
    feedback?.ratingsByKey ?? feedback?.ratings ?? {};
  const clearRating: ((recipeKey: string) => void) | undefined = feedback?.clearRating;

  const favoritesList = useMemo(() => {
    const arr = Object.values(favoritesByKey ?? {});
    return arr.sort((a: any, b: any) => (b.saved_at ?? 0) - (a.saved_at ?? 0));
  }, [favoritesByKey]);

  const openFavorite = (favKey: string) => {
    const fav: any = favoritesByKey?.[favKey];
    if (!fav) return;

    router.push({
      pathname: "/recipe",
      params: {
        idx: "0",
        recipe_key: fav.recipe_key,
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

  const onRemove = (favKey: string) => {
    const fav: any = favoritesByKey?.[favKey];
    const hasRating = Boolean(ratingsByKey?.[favKey]);

    if (!hasRating || typeof clearRating !== "function") {
      removeFavorite(favKey);
      return;
    }

    const title = String(fav?.title ?? "Recipe").trim() || "Recipe";

    Alert.alert(
      "Remove favorite",
      `Remove “${title}” from Favorites?\n\nYou also have a Like/Dislike on this recipe. Do you want to remove that rating too?`,
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
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <FontAwesome name="heart" size={20} color="#E11D48" />
        <Text style={{ fontSize: 20, fontWeight: "900" }}>My Favorites</Text>
      </View>

      {favoritesList.length === 0 ? (
        <Text style={{ color: "#666" }}>(No favorites yet)</Text>
      ) : (
        <View style={{ gap: 10 }}>
          {favoritesList.map((fav: any) => {
            const key = String(fav.recipe_key || "");
            const subtitle = getSubtitleForFavorite(fav);

            return (
              <View
                key={key}
                style={{
                  borderWidth: 1,
                  borderRadius: 12,
                  padding: 12,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text style={{ fontWeight: "800", flex: 1 }} numberOfLines={1}>
                    {String(fav.title ?? "Recipe")}
                  </Text>

                  <Pressable
                    onPress={() => openFavorite(key)}
                    style={{
                      borderWidth: 1,
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ fontWeight: "800" }}>Open</Text>
                  </Pressable>
                </View>

                {subtitle ? <Text style={{ color: "#555" }}>{subtitle}</Text> : null}

                <Pressable
                  onPress={() => onRemove(key)}
                  style={{
                    alignSelf: "flex-start",
                    borderWidth: 1,
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ fontWeight: "800" }}>Remove</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}