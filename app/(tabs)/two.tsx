import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useNavigation } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { FeedbackRating, useFeedback } from "@/context/feedback";
import { useFavorites } from "../../context/favorites";

export default function TabTwoScreen() {
  const API_URL = useMemo(() => process.env.EXPO_PUBLIC_API_URL, []);
  const router = useRouter();
  const navigation = useNavigation<any>();

  useEffect(() => {
    // ✅ header title
    navigation?.setOptions?.({ title: "Recipe" });
  }, [navigation]);

  const params = useLocalSearchParams<{
    idx?: string;
    recipe_json?: string;
    ingredients_json?: string;
    recipe_key?: string; // ✅ stable key when opening from Favorites
  }>();

  const idxNum = Number(params.idx ?? "0");

  const recipe = useMemo(() => {
    try {
      const raw = params.recipe_json ? decodeURIComponent(params.recipe_json) : "";
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [params.recipe_json]);

  const ingredients = useMemo<string[]>(() => {
    try {
      const raw = params.ingredients_json
        ? decodeURIComponent(params.ingredients_json)
        : "";
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }, [params.ingredients_json]);

  // ✅ Feedback store (like/dislike)
  const { ratingsByKey, setRating, clearRating } = useFeedback();

  // ✅ Favorites store
  const { favoritesByKey, toggleFavorite } = useFavorites();

  const [error, setError] = useState<string | null>(null);

  const recipeTitle = String(recipe?.short_name ?? recipe?.name ?? "Recipe").trim();

  // ✅ prefer stable key if passed
  const recipeKey =
    typeof params.recipe_key === "string" && params.recipe_key.trim()
      ? params.recipe_key.trim()
      : `${idxNum + 1}-${recipeTitle}`;

  // ✅ rating for this recipe
  const currentRating: FeedbackRating | null =
    (ratingsByKey?.[recipeKey] as FeedbackRating) ?? null;

  // ✅ favorite state for this recipe (single source of truth)
  const isFav = !!favoritesByKey?.[recipeKey];

  useEffect(() => {
    // ✅ clear local error when switching recipes
    setError(null);
  }, [recipeKey]);

  const onToggleFavorite = () => {
    // ✅ [UPDATED] Always provide title + clean tags so Favorites tab can render safely
    const safeTitle =
      String(recipeTitle ?? "").trim() ||
      String(recipe?.short_name ?? recipe?.name ?? "").trim() ||
      "Recipe";

    const safeTags =
      Array.isArray(tags) ? tags.map((x: any) => String(x).trim()).filter(Boolean) : [];

    toggleFavorite({
      recipe_key: recipeKey,
      title: safeTitle,
      tags: safeTags,
      recipe,
      ingredients,
      saved_at: Date.now(),
    });
  };

  const sendFeedback = async (next: FeedbackRating) => {
    setError(null);

    // optimistic UI
    const prev = (ratingsByKey?.[recipeKey] as FeedbackRating) ?? null;
    setRating(recipeKey, next);

    if (!API_URL) {
      // revert
      if (prev) setRating(recipeKey, prev);
      else clearRating(recipeKey);

      setError("Missing EXPO_PUBLIC_API_URL. Please check .env.");
      return;
    }

    try {
      const resp = await fetch(`${API_URL}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe_key: recipeKey,
          rating: next,
          recipe,
          ingredients,
          context: { app_version: "RECIPES_V1" },
        }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Feedback API failed: ${resp.status} ${t}`);
      }
    } catch (e: any) {
      // revert on failure
      if (prev) setRating(recipeKey, prev);
      else clearRating(recipeKey);

      setError(e?.message ?? "Failed to send feedback.");
    }
  };

  const createShareAndGo = async () => {
    setError(null);

    if (!API_URL) {
      setError("Missing EXPO_PUBLIC_API_URL. Please check .env.");
      return;
    }

    try {
      const resp = await fetch(`${API_URL}/share-recipe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe, ingredients }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Share API failed: ${resp.status} ${t}`);
      }

      const data = (await resp.json()) as { share_id: string; share_url: string };

      // carry through for back-to-recipe behavior in Tab 4
      const recipe_json = encodeURIComponent(JSON.stringify(recipe));
      const ingredients_json = encodeURIComponent(JSON.stringify(ingredients));

      router.push({
        pathname: "/(tabs)/four",
        params: {
          share_id: encodeURIComponent(data.share_id),
          share_url: encodeURIComponent(data.share_url),

          idx: String(idxNum),
          recipe_key: recipeKey,
          recipe_json,
          ingredients_json,
        },
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to create share link.");
    }
  };

  // --------- UI fallbacks ----------
  if (!recipe) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: "800" }}>Recipe</Text>
        <Text style={{ color: "#666" }}>
          No recipe selected. Go back to Scan and tap “View”.
        </Text>

        <Pressable
          onPress={() => router.back()}
          style={{
            alignSelf: "flex-start",
            borderWidth: 1,
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 8,
            marginTop: 8,
          }}
        >
          <Text style={{ fontWeight: "800" }}>Back</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const tags =
    Array.isArray(recipe?.flavor_4) && recipe.flavor_4.length === 4
      ? recipe.flavor_4
      : [];

  const liquids = Array.isArray(recipe?.ingredients_ml) ? recipe.ingredients_ml : [];
  const steps = Array.isArray(recipe?.instructions) ? recipe.instructions : [];
  const garnish = Array.isArray(recipe?.garnish) ? recipe.garnish : [];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          gap: 12,
          paddingBottom: 40,
        }}
      >
        {/* Title row + Heart */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ fontSize: 22, fontWeight: "900", flex: 1 }}>
            {recipeTitle ? recipeTitle : "Recipe"}
          </Text>

          <Pressable
            onPress={onToggleFavorite}
            hitSlop={10}
            style={{ paddingHorizontal: 6, paddingVertical: 4 }}
          >
            <FontAwesome
              name={isFav ? "heart" : "heart-o"}
              color={isFav ? "#E11D48" : "#888"}
              size={20}
            />
          </Pressable>
        </View>

        {/* Flavor tags */}
        {tags.length > 0 ? (
          <Text style={{ color: "#555" }}>{tags.join(" • ")}</Text>
        ) : (
          <Text style={{ color: "#666" }}>(No flavor tags)</Text>
        )}

        {/* Like / Dislike */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => sendFeedback("like")}
            style={{
              flex: 1,
              borderWidth: 1,
              borderRadius: 12,
              paddingVertical: 10,
              alignItems: "center",
              opacity: currentRating === "dislike" ? 0.6 : 1,
            }}
          >
            <Text style={{ fontWeight: "800" }}>
              {currentRating === "like" ? "Liked" : "Like"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => sendFeedback("dislike")}
            style={{
              flex: 1,
              borderWidth: 1,
              borderRadius: 12,
              paddingVertical: 10,
              alignItems: "center",
              opacity: currentRating === "like" ? 0.6 : 1,
            }}
          >
            <Text style={{ fontWeight: "800" }}>
              {currentRating === "dislike" ? "Disliked" : "Dislike"}
            </Text>
          </Pressable>
        </View>

        {error ? (
          <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
            <Text style={{ fontWeight: "800" }}>Error</Text>
            <Text>{error}</Text>
          </View>
        ) : null}

        {/* Details card */}
        <View style={{ padding: 12, borderWidth: 1, borderRadius: 12, gap: 12 }}>
          <View>
            <Text style={{ fontWeight: "900", marginBottom: 6 }}>
              Ingredients (ml)
            </Text>
            {liquids.length === 0 ? (
              <Text style={{ color: "#666" }}>(Missing ingredients_ml)</Text>
            ) : (
              liquids.map((it: any, i: number) => (
                <Text key={i}>
                  • {String(it?.item ?? "").trim() || "unknown"} —{" "}
                  {Number.isFinite(it?.ml) ? `${it.ml} ml` : "n/a"}
                </Text>
              ))
            )}
          </View>

          <View>
            <Text style={{ fontWeight: "900", marginBottom: 6 }}>Garnish</Text>
            {garnish.length === 0 ? (
              <Text style={{ color: "#666" }}>(None)</Text>
            ) : (
              garnish.map((g: any, i: number) => (
                <Text key={i}>• {String(g)}</Text>
              ))
            )}
          </View>

          <View>
            <Text style={{ fontWeight: "900", marginBottom: 6 }}>
              Instructions
            </Text>
            {steps.length === 0 ? (
              <Text style={{ color: "#666" }}>(Missing instructions)</Text>
            ) : (
              steps.map((s: any, i: number) => (
                <Text key={i}>
                  {i + 1}. {String(s)}
                </Text>
              ))
            )}
          </View>

          {typeof recipe?.why_it_works === "string" && recipe.why_it_works.trim() ? (
            <View>
              <Text style={{ fontWeight: "900", marginBottom: 6 }}>
                Why it works
              </Text>
              <Text>{recipe.why_it_works}</Text>
            </View>
          ) : null}
        </View>

        {/* Back + Share row (aligned) */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 4,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            style={{
              borderWidth: 1,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ fontWeight: "800" }}>Back</Text>
          </Pressable>

          <Pressable
            onPress={createShareAndGo}
            style={{
              borderWidth: 1,
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 8,
              backgroundColor: "white",
            }}
          >
            <Text style={{ fontWeight: "900" }}>Share</Text>
          </Pressable>
        </View>

        <Text style={{ color: "#666" }}>
          You can switch back to Scan anytime to view another recipe.
        </Text>
      </ScrollView>
    </View>
  );
}