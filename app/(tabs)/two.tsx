import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useNavigation } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import * as Clipboard from "expo-clipboard";

import { useEconomy } from "@/context/economy";
import { FeedbackRating, useFeedback } from "@/context/feedback";
import {
  aggregateIngredientVectors,
  buildFourWordDescriptor,
  compareFlavorVectors,
  DEFAULT_FLAVOR_WEIGHTS,
  getUnknownIngredients,
  PreferencePreset,
  PRESET_VECTORS,
} from "@/context/ontology";
import { useFavorites } from "../../context/favorites";

type DbRecipeIngredient = {
  sort_order: number;
  item: string;
  amount_ml: string | number | null;
  amount_text: string | null;
  unit: string | null;
  is_optional: boolean | null;
};

type DbRecipe = {
  iba_code: string;
  name: string;
  iba_category: string | null;
  method: string | null;
  glass: string | null;
  instructions: string | null;
  is_published: boolean | null;
  ingredients: DbRecipeIngredient[];
};

export default function TabTwoScreen() {
  const API_URL = useMemo(() => {
    const v = String(process.env.EXPO_PUBLIC_API_URL ?? "").trim();
    return v ? v.replace(/\/+$/, "") : "";
  }, []);

  const router = useRouter();
  const navigation = useNavigation<any>();

  useEffect(() => {
    navigation?.setOptions?.({ title: "Recipe" });
  }, [navigation]);

  const params = useLocalSearchParams<{
    idx?: string;
    recipe_json?: string;
    ingredients_json?: string;
    recipe_key?: string;
    iba_code?: string;
    missing_items_json?: string;
  }>();

  const idxNum = Number(params.idx ?? "0");

  const legacyRecipe = useMemo(() => {
    try {
      const raw = params.recipe_json ? decodeURIComponent(params.recipe_json) : "";
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [params.recipe_json]);

  const ingredientsFromScan = useMemo<string[]>(() => {
    try {
      const raw = params.ingredients_json ? decodeURIComponent(params.ingredients_json) : "";
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }, [params.ingredients_json]);

  const missingItems = useMemo<string[]>(() => {
    try {
      const raw = params.missing_items_json ? decodeURIComponent(params.missing_items_json) : "";
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.map((x) => String(x || "").trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }, [params.missing_items_json]);

  const ibaCode = useMemo(() => {
    const fromParam = typeof params.iba_code === "string" ? params.iba_code.trim() : "";
    const fromLegacy =
      legacyRecipe && typeof legacyRecipe === "object" && (legacyRecipe as any).iba_code
        ? String((legacyRecipe as any).iba_code).trim()
        : "";
    return fromParam || fromLegacy || "";
  }, [params.iba_code, legacyRecipe]);

  const { ratingsByKey, setRating, clearRating } = useFeedback();
  const { favoritesByKey, toggleFavorite } = useFavorites();
  const { tokens, favoriteLimit, canSpend, purchaseFavoriteSlot, earnOncePerRecipe } = useEconomy();

  const favoritesCount = useMemo(() => {
    return Object.keys(favoritesByKey ?? {}).length;
  }, [favoritesByKey]);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dbRecipe, setDbRecipe] = useState<DbRecipe | null>(null);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      setError(null);

      if (!ibaCode) {
        setDbRecipe(null);
        return;
      }

      if (!API_URL) {
        setDbRecipe(null);
        setError("Missing EXPO_PUBLIC_API_URL. Please check .env.");
        return;
      }

      setLoading(true);
      try {
        const resp = await fetch(`${API_URL}/recipes/${encodeURIComponent(ibaCode)}`);
        if (!resp.ok) {
          const t = await resp.text();
          throw new Error(`Recipe API failed: ${resp.status} ${t}`);
        }

        const data = (await resp.json()) as { recipe?: DbRecipe };
        const r = data?.recipe ?? null;

        if (!alive) return;

        if (!r || !r.iba_code) {
          setDbRecipe(null);
          setError("Recipe not found.");
          return;
        }

        const normalized: DbRecipe = {
          iba_code: String(r.iba_code || "").trim(),
          name: String(r.name || "").trim(),
          iba_category: r.iba_category ?? null,
          method: r.method ?? null,
          glass: r.glass ?? null,
          instructions: r.instructions ?? null,
          is_published: r.is_published ?? null,
          ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
        };

        setDbRecipe(normalized);
      } catch (e: any) {
        if (!alive) return;
        setDbRecipe(null);
        setError(e?.message ?? "Failed to load recipe.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    run();

    return () => {
      alive = false;
    };
  }, [ibaCode, API_URL]);

  const recipe = dbRecipe ?? legacyRecipe;

  const recipeTitle = useMemo(() => {
    if (dbRecipe?.name) return dbRecipe.name;
    return String((recipe as any)?.short_name ?? (recipe as any)?.name ?? "Recipe").trim();
  }, [dbRecipe, recipe]);

  const stableRecipeKey = useMemo(() => {
    const fromParam =
      typeof params.recipe_key === "string" && params.recipe_key.trim() ? params.recipe_key.trim() : "";
    if (fromParam) return fromParam;

    const code = String(ibaCode || "").trim();
    if (code) return `${code}-${recipeTitle}`;

    return `${idxNum + 1}-${recipeTitle}`;
  }, [params.recipe_key, ibaCode, recipeTitle, idxNum]);

  const recipeKey = stableRecipeKey;

  const currentRating: FeedbackRating | null = (ratingsByKey?.[recipeKey] as FeedbackRating) ?? null;

  const isFav = !!favoritesByKey?.[recipeKey];

  useEffect(() => {
    setError(null);
  }, [recipeKey]);

  const recipeIngredientsForOntology = useMemo<string[]>(() => {
    if (dbRecipe?.ingredients && Array.isArray(dbRecipe.ingredients) && dbRecipe.ingredients.length > 0) {
      return dbRecipe.ingredients.map((it) => String(it?.item ?? "").trim()).filter(Boolean);
    }

    const legacy = legacyRecipe as any;
    const legacyList = Array.isArray(legacy?.ingredients_ml)
      ? legacy.ingredients_ml
      : Array.isArray(legacy?.ingredients)
      ? legacy.ingredients
      : null;

    if (Array.isArray(legacyList) && legacyList.length > 0) {
      return legacyList
        .map((x: any) => {
          if (typeof x === "string") return x.trim();
          if (x && typeof x === "object") return String(x.item ?? x.name ?? "").trim();
          return "";
        })
        .filter(Boolean);
    }

    return ingredientsFromScan;
  }, [dbRecipe, legacyRecipe, ingredientsFromScan]);

  const recipeFlavorVector = useMemo(() => {
    return aggregateIngredientVectors(recipeIngredientsForOntology);
  }, [recipeIngredientsForOntology]);

  const unknownIngredients = useMemo(() => {
    return getUnknownIngredients(recipeIngredientsForOntology);
  }, [recipeIngredientsForOntology]);

  const descriptor = useMemo(() => {
    return buildFourWordDescriptor(recipeFlavorVector);
  }, [recipeFlavorVector]);

  const stylePartRaw = useMemo(() => {
    const fromDb = dbRecipe?.iba_category ? String(dbRecipe.iba_category).trim() : "";
    const fromLegacy =
      legacyRecipe && typeof legacyRecipe === "object" && (legacyRecipe as any).iba_category
        ? String((legacyRecipe as any).iba_category).trim()
        : "";
    return fromDb || fromLegacy || "";
  }, [dbRecipe, legacyRecipe]);

  const tasteWords = Array.isArray((descriptor as any)?.words) ? (descriptor as any).words : [];
  const tastePart = tasteWords.length ? tasteWords.slice(0, 3).join(" • ") : "";

  const headerLine = [stylePartRaw, tastePart].filter(Boolean).join(" • ");

  const subtitleTokensForFavorite = useMemo(() => {
    const tokens: string[] = [];
    if (stylePartRaw) tokens.push(stylePartRaw);
    if (tasteWords.length) tokens.push(...tasteWords.slice(0, 3));
    return tokens.filter((x) => String(x || "").trim());
  }, [stylePartRaw, tasteWords]);

  const prefPreset: PreferencePreset = "Balanced";
  const userPreferenceVector = useMemo(() => {
    return PRESET_VECTORS[prefPreset];
  }, [prefPreset]);

  const vectorComparison = useMemo(() => {
    return compareFlavorVectors(recipeFlavorVector, userPreferenceVector, DEFAULT_FLAVOR_WEIGHTS);
  }, [recipeFlavorVector, userPreferenceVector]);

  const copyDebug = async () => {
    try {
      const payload = {
        ibaCode,
        recipeTitle,
        recipeKey,
        API_URL: API_URL || "(missing)",
        subtitle: headerLine || "(none)",
        subtitle_tokens: subtitleTokensForFavorite,
        recipe_ingredients_for_ontology: recipeIngredientsForOntology,
        unknown_ingredients: unknownIngredients,
        recipe_flavor_vector: recipeFlavorVector,
        four_word_descriptor: descriptor,
        prefPreset,
        user_preference_vector: userPreferenceVector,
        comparison_rows: vectorComparison.rows,
        overall_score_100: vectorComparison.score100,
        db_loaded: Boolean(dbRecipe),
        economy: {
          tokens,
          favoriteLimit,
          favoritesCount,
        },
      };

      await Clipboard.setStringAsync(JSON.stringify(payload, null, 2));
      Alert.alert("Copied", "Debug JSON copied to clipboard.");
    } catch (e: any) {
      Alert.alert("Copy failed", String(e?.message || e));
    }
  };

  const doAddFavorite = () => {
    const safeTitle = String(recipeTitle || "").trim() || "Recipe";
    const code = String(ibaCode || (dbRecipe?.iba_code ?? "")).trim();

    toggleFavorite({
      recipe_key: recipeKey,
      iba_code: code || undefined,
      title: safeTitle,
      tags: subtitleTokensForFavorite,
      recipe: recipe,
      ingredients: ingredientsFromScan,
      saved_at: Date.now(),
    });
  };

  const onToggleFavorite = () => {
    if (isFav) {
      doAddFavorite();
      return;
    }

    if (favoritesCount < favoriteLimit) {
      doAddFavorite();
      return;
    }

    const cost = 3;
    const can = canSpend(cost);

    Alert.alert(
      "Favorites full",
      `You’ve reached your favorites limit (${favoritesCount}/${favoriteLimit}).\n\nSpend ${cost} tokens to add +1 slot?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Go to My Favorites",
          onPress: () => router.push("/(tabs)/three"),
        },
        {
          text: `Spend ${cost}`,
          onPress: () => {
            if (!can) {
              Alert.alert(
                "Not enough tokens",
                `You have ${tokens} tokens.\nNeed ${cost} tokens to add +1 slot.`
              );
              return;
            }

            const ok = purchaseFavoriteSlot();
            if (!ok) {
              Alert.alert("Purchase failed", "Could not add a favorites slot. Please try again.");
              return;
            }

            doAddFavorite();
          },
        },
      ]
    );
  };

  const sendFeedback = async (next: FeedbackRating) => {
    setError(null);

    const prev = (ratingsByKey?.[recipeKey] as FeedbackRating) ?? null;

    const code = String(ibaCode || (dbRecipe?.iba_code ?? "")).trim();

    setRating(recipeKey, next, {
      recipe_key: recipeKey,
      iba_code: code || undefined,
      title: String(recipeTitle || "").trim() || undefined,
      tags: subtitleTokensForFavorite,
      recipe,
      ingredients: ingredientsFromScan,
    });

    if (!API_URL) {
      if (prev) {
        setRating(recipeKey, prev);
      } else {
        clearRating(recipeKey);
      }
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
          ingredients: ingredientsFromScan,
          context: { app_version: "RECIPES_V1" },
        }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Feedback API failed: ${resp.status} ${t}`);
      }

      if (!prev) {
        earnOncePerRecipe(recipeKey, "rate", 1);
      }
    } catch (e: any) {
      if (prev) {
        setRating(recipeKey, prev);
      } else {
        clearRating(recipeKey);
      }
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
        body: JSON.stringify({ recipe, ingredients: ingredientsFromScan }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Share API failed: ${resp.status} ${t}`);
      }

      const data = (await resp.json()) as { share_id: string; share_url: string };

      earnOncePerRecipe(recipeKey, "share", 1);

      const recipe_json = encodeURIComponent(JSON.stringify(recipe));
      const ingredients_json = encodeURIComponent(JSON.stringify(ingredientsFromScan));

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

  const renderDbIngredients = () => {
    const list = Array.isArray(dbRecipe?.ingredients) ? dbRecipe!.ingredients : [];
    if (list.length === 0) return <Text style={{ color: "#666" }}>(No ingredients)</Text>;

    const sorted = [...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    return (
      <View style={{ gap: 6 }}>
        {sorted.map((it, i) => {
          const name = String(it?.item ?? "").trim() || "unknown";
          const isOptional = Boolean(it?.is_optional);

          const ml =
            it?.amount_ml === null || it?.amount_ml === undefined || it?.amount_ml === ""
              ? null
              : Number(it.amount_ml);

          const unit = it?.unit ? String(it.unit).trim() : "";

          let amountLabel = "";
          if (Number.isFinite(ml)) {
            amountLabel = `${ml} ml`;
          } else if (it?.amount_text && String(it.amount_text).trim()) {
            amountLabel = unit
              ? `${String(it.amount_text).trim()} ${unit}`
              : String(it.amount_text).trim();
          } else {
            amountLabel = unit ? unit : "n/a";
          }

          return (
            <Text key={i}>
              • {name} — {amountLabel}
              {isOptional ? " (optional)" : ""}
            </Text>
          );
        })}
      </View>
    );
  };

  if (!recipe) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: "800" }}>Recipe</Text>
        <Text style={{ color: "#666" }}>No recipe selected. Go back to Scan and tap “View”.</Text>

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

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          gap: 12,
          paddingBottom: 40,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ fontSize: 22, fontWeight: "900", flex: 1 }}>
            {recipeTitle ? recipeTitle : "Recipe"}
          </Text>

          <Pressable onPress={onToggleFavorite} hitSlop={10} style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
            <FontAwesome name={isFav ? "heart" : "heart-o"} color={isFav ? "#E11D48" : "#888"} size={20} />
          </Pressable>
        </View>

        {headerLine ? (
          <Pressable onLongPress={copyDebug} delayLongPress={450}>
            <Text style={{ color: "#555" }}>{headerLine}</Text>
          </Pressable>
        ) : null}

        {missingItems.length > 0 ? (
          <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
            <Text style={{ fontWeight: "900", marginBottom: 6 }}>Missing</Text>
            <Text style={{ color: "#555" }}>{missingItems.join(" • ")}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
            <Text style={{ fontWeight: "800" }}>Loading…</Text>
            <Text style={{ color: "#666" }}>
              Fetching full recipe from backend using iba_code: {ibaCode || "(missing)"}
            </Text>
          </View>
        ) : null}

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
            <Text style={{ fontWeight: "800" }}>{currentRating === "like" ? "Liked" : "Like"}</Text>
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
            <Text style={{ fontWeight: "800" }}>{currentRating === "dislike" ? "Disliked" : "Dislike"}</Text>
          </Pressable>
        </View>

        {error ? (
          <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
            <Text style={{ fontWeight: "800" }}>Error</Text>
            <Text>{error}</Text>
          </View>
        ) : null}

        <View style={{ padding: 12, borderWidth: 1, borderRadius: 12, gap: 12 }}>
          <View>
            <Text style={{ fontWeight: "900", marginBottom: 6 }}>Ingredients</Text>
            {dbRecipe ? renderDbIngredients() : ibaCode ? <Text style={{ color: "#666" }}>(Waiting for full recipe…)</Text> : <Text style={{ color: "#666" }}>(Missing iba_code)</Text>}
          </View>

          {dbRecipe?.instructions ? (
            <View>
              <Text style={{ fontWeight: "900", marginBottom: 6 }}>Instructions</Text>
              <Text>{String(dbRecipe.instructions)}</Text>
            </View>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 4 }}>
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

        <Text style={{ color: "#666" }}>You can switch back to Scan anytime to view another recipe.</Text>
      </ScrollView>
    </View>
  );
}