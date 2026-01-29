import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

export type FeedbackRating = "like" | "dislike";
export type RatingsByKey = Record<string, FeedbackRating>;

export type RatingMeta = {
  recipe_key: string;
  iba_code?: string;
  title?: string;
  tags?: string[];
  recipe?: any;
  ingredients?: string[];
  updated_at: number;
};

export type RatingMetaByKey = Record<string, RatingMeta>;

export type FavoriteItem = {
  recipeKey: string;
  title: string;
  tags: string[];
  recipe: any;
  ingredients: string[];
  createdAt: number;
};
export type FavoritesByKey = Record<string, FavoriteItem>;

type FeedbackContextValue = {
  ratingsByKey: RatingsByKey;
  ratingMetaByKey: RatingMetaByKey;

  setRating: (recipeKey: string, rating: FeedbackRating, meta?: Partial<RatingMeta>) => void;
  clearRating: (recipeKey: string) => void;

  favoritesByKey: FavoritesByKey;
  addFavorite: (item: Omit<FavoriteItem, "createdAt">) => void;
  removeFavorite: (recipeKey: string) => void;
  toggleFavorite: (item: Omit<FavoriteItem, "createdAt">) => void;
  clearFavorites: () => void;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

const STORAGE_KEY = "sipmetry:feedback:v2";

function asStringList(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function inferIbaCodeFromAny(metaOrRecipe: any): string | undefined {
  const fromMeta = typeof metaOrRecipe?.iba_code === "string" ? metaOrRecipe.iba_code.trim() : "";
  if (fromMeta) return fromMeta;

  const fromRecipe =
    typeof metaOrRecipe?.recipe?.iba_code === "string" ? metaOrRecipe.recipe.iba_code.trim() : "";
  if (fromRecipe) return fromRecipe;

  const directRecipe = typeof metaOrRecipe?.iba_code === "string" ? metaOrRecipe.iba_code.trim() : "";
  if (directRecipe) return directRecipe;

  return undefined;
}

function extractIngredientsFromAnyRecipe(recipe: any, fallbackIngredients?: any): string[] {
  if (recipe && typeof recipe === "object") {
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
  }

  return asStringList(fallbackIngredients);
}

function sanitizeRatings(raw: any): RatingsByKey {
  if (!raw || typeof raw !== "object") return {};
  const out: RatingsByKey = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== "string") continue;
    if (v === "like" || v === "dislike") out[k] = v;
  }
  return out;
}

function sanitizeRatingMeta(raw: any): RatingMetaByKey {
  if (!raw || typeof raw !== "object") return {};
  const out: RatingMetaByKey = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== "string") continue;
    if (!v || typeof v !== "object") continue;

    const recipe_key = typeof (v as any).recipe_key === "string" ? (v as any).recipe_key : k;

    const recipe = (v as any).recipe ?? undefined;
    const ingredientsFromRecipe = extractIngredientsFromAnyRecipe(recipe, (v as any).ingredients);

    const meta: RatingMeta = {
      recipe_key,
      iba_code: inferIbaCodeFromAny(v) ?? inferIbaCodeFromAny(recipe),
      title: typeof (v as any).title === "string" ? (v as any).title : undefined,
      tags: Array.isArray((v as any).tags)
        ? (v as any).tags.map((x: any) => String(x ?? "").trim()).filter(Boolean).slice(0, 4)
        : undefined,
      recipe,
      ingredients: ingredientsFromRecipe.length ? ingredientsFromRecipe : undefined,
      updated_at: Number.isFinite((v as any).updated_at) ? Number((v as any).updated_at) : Date.now(),
    };

    out[k] = meta;
  }
  return out;
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [ratingsByKey, setRatingsByKey] = useState<RatingsByKey>({});
  const [ratingMetaByKey, setRatingMetaByKey] = useState<RatingMetaByKey>({});

  const [favoritesByKey, setFavoritesByKey] = useState<FavoritesByKey>({});

  const didHydrateRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) {
          if (!cancelled) didHydrateRef.current = true;
          return;
        }

        const parsed = JSON.parse(raw) as any;

        const nextRatings = sanitizeRatings(parsed?.ratingsByKey);
        const nextMeta = sanitizeRatingMeta(parsed?.ratingMetaByKey);

        if (!cancelled) {
          setRatingsByKey(nextRatings);
          setRatingMetaByKey(nextMeta);
          didHydrateRef.current = true;
        }
      } catch {
        if (!cancelled) didHydrateRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!didHydrateRef.current) return;

    const t = setTimeout(async () => {
      try {
        const payload = {
          ratingsByKey,
          ratingMetaByKey,
        };
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // ignore
      }
    }, 150);

    return () => clearTimeout(t);
  }, [ratingsByKey, ratingMetaByKey]);

  const setRating = (recipeKey: string, rating: FeedbackRating, meta?: Partial<RatingMeta>) => {
    const key = String(recipeKey || "").trim();
    if (!key) return;

    setRatingsByKey((prev) => ({ ...prev, [key]: rating }));

    setRatingMetaByKey((prev) => {
      const prevMeta = prev[key];

      const recipe = meta?.recipe ?? prevMeta?.recipe;
      const ingredients = extractIngredientsFromAnyRecipe(recipe, meta?.ingredients ?? prevMeta?.ingredients);

      const merged: RatingMeta = {
        recipe_key: key,
        iba_code: meta?.iba_code ?? prevMeta?.iba_code ?? inferIbaCodeFromAny(recipe),
        title: meta?.title ?? prevMeta?.title,
        tags: meta?.tags ?? prevMeta?.tags,
        recipe,
        ingredients: ingredients.length ? ingredients : prevMeta?.ingredients,
        updated_at: Date.now(),
      };

      return { ...prev, [key]: merged };
    });
  };

  const clearRating = (recipeKey: string) => {
    const key = String(recipeKey || "").trim();
    if (!key) return;

    setRatingsByKey((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

    setRatingMetaByKey((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const addFavorite = (item: Omit<FavoriteItem, "createdAt">) => {
    setFavoritesByKey((prev) => ({
      ...prev,
      [item.recipeKey]: { ...item, createdAt: Date.now() },
    }));
  };

  const removeFavorite = (recipeKey: string) => {
    setFavoritesByKey((prev) => {
      const next = { ...prev };
      delete next[recipeKey];
      return next;
    });
  };

  const toggleFavorite = (item: Omit<FavoriteItem, "createdAt">) => {
    setFavoritesByKey((prev) => {
      const exists = !!prev[item.recipeKey];
      if (exists) {
        const next = { ...prev };
        delete next[item.recipeKey];
        return next;
      }
      return {
        ...prev,
        [item.recipeKey]: { ...item, createdAt: Date.now() },
      };
    });
  };

  const clearFavorites = () => {
    setFavoritesByKey({});
  };

  const value = useMemo(
    () => ({
      ratingsByKey,
      ratingMetaByKey,
      setRating,
      clearRating,

      favoritesByKey,
      addFavorite,
      removeFavorite,
      toggleFavorite,
      clearFavorites,
    }),
    [ratingsByKey, ratingMetaByKey, favoritesByKey]
  );

  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used within <FeedbackProvider />");
  return ctx;
}