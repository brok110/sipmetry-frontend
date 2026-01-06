import { useNavigation } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";


// shared feedback store
import { useFeedback, type FeedbackRating } from "@/context/feedback";

export default function TabTwoScreen() {
  const API_URL = useMemo(() => process.env.EXPO_PUBLIC_API_URL, []);
  const router = useRouter();
  const navigation = useNavigation<any>();

  useEffect(() => {
    navigation.setOptions({ title: "Recipe" });
  }, [navigation]);

  const params = useLocalSearchParams<{
    idx?: string;
    recipe_json?: string;
    ingredients_json?: string;
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

  const [error, setError] = useState<string | null>(null);

  // shared ratings (per recipeKey)
  const { ratingsByKey, setRating } = useFeedback();

  const recipeTitle = String(recipe?.short_name ?? recipe?.name ?? "Recipe").trim();
  const recipeKey = `${idxNum + 1}-${recipeTitle}`;

  // current rating for THIS recipe only
  const currentRating: FeedbackRating | null = ratingsByKey?.[recipeKey] ?? null;

  // when switching recipes, clear error only (keep ratings in store)
  useEffect(() => {
    setError(null);
  }, [recipeKey]);

  const sendFeedback = async (next: FeedbackRating) => {
    setError(null);

    // optimistic update (per-recipe)
    const prev: FeedbackRating | null = ratingsByKey?.[recipeKey] ?? null;
    setRating(recipeKey, next);

    if (!API_URL) {
      // rollback if missing API URL
      if (prev) setRating(recipeKey, prev);
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
      // rollback on failure
      if (prev) setRating(recipeKey, prev);
      setError(e?.message ?? "Failed to send feedback.");
    }
  };

  if (!recipe) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: "800" }}>Recipe</Text>
        <Text style={{ color: "#666" }}>
          No recipe selected. Go back to Scan and tap “View”.
        </Text>
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
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "900" }}>
        {recipe?.short_name?.trim() ? recipe.short_name : "Recipe"}
      </Text>

      {tags.length > 0 ? (
        <Text style={{ color: "#555" }}>{tags.join(" • ")}</Text>
      ) : (
        <Text style={{ color: "#666" }}>(No flavor tags)</Text>
      )}

      {/* Feedback */}
      <View style={{ borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 }}>
        <Text style={{ fontWeight: "800" }}>Feedback</Text>

        <View style={{ flexDirection: "row", gap: 12 }}>
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

        <Text style={{ color: "#666" }}>
          {currentRating === "like"
            ? "You rated this recipe."
            : currentRating === "dislike"
            ? "You rated this recipe."
            : "Not rated yet."}
        </Text>
      </View>

      {error ? (
        <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
          <Text style={{ fontWeight: "800" }}>Error</Text>
          <Text>{error}</Text>
        </View>
      ) : null}

      {/* Details */}
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
            garnish.map((g: any, i: number) => <Text key={i}>• {String(g)}</Text>)
          )}
        </View>

        <View>
          <Text style={{ fontWeight: "900", marginBottom: 6 }}>Instructions</Text>
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
            <Text style={{ fontWeight: "900", marginBottom: 6 }}>Why it works</Text>
            <Text>{recipe.why_it_works}</Text>
          </View>
        ) : null}
      </View>

      <Pressable
        onPress={() => router.back()}
        style={{
          alignSelf: "flex-start",
          borderWidth: 1,
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <Text style={{ fontWeight: "800" }}>Back</Text>
      </Pressable>

      <Text style={{ color: "#666" }}>
        You can switch back to Scan anytime to view another recipe.
      </Text>
    </ScrollView>
  );
}
