import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";

import { useEconomy } from "@/context/economy";

export type FavoriteItem = {
  recipe_key: string;
  iba_code?: string;
  title: string;
  tags: string[];
  recipe: any;
  ingredients: string[];
  saved_at: number;
};

export type FavoritesByKey = Record<string, FavoriteItem>;

type FavoritesContextValue = {
  favoritesByKey: FavoritesByKey;

  favoriteCount: number;
  favoriteLimit: number;
  remainingSlots: number;
  isAtLimit: boolean;

  isFavorite: (recipeKey: string) => boolean;

  toggleFavorite: (item: FavoriteItem) => void;
  removeFavorite: (recipeKey: string) => void;
  clearFavorites: () => void;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

const STORAGE_KEY = "sipmetry:favorites:v2";

function isFavoriteItem(x: any): x is FavoriteItem {
  return (
    x &&
    typeof x === "object" &&
    typeof x.recipe_key === "string" &&
    typeof x.title === "string" &&
    Array.isArray(x.tags) &&
    Array.isArray(x.ingredients) &&
    typeof x.saved_at === "number"
  );
}

function inferIbaCodeFromFavorite(item: any): string | undefined {
  const fromField = typeof item?.iba_code === "string" ? item.iba_code.trim() : "";
  if (fromField) return fromField;

  const fromRecipe = typeof item?.recipe?.iba_code === "string" ? item.recipe.iba_code.trim() : "";
  if (fromRecipe) return fromRecipe;

  return undefined;
}

function sanitizeFavoritesMap(raw: any): FavoritesByKey {
  if (!raw || typeof raw !== "object") return {};
  const out: FavoritesByKey = {};

  for (const [, v] of Object.entries(raw)) {
    if (!isFavoriteItem(v)) continue;

    const recipe_key = String((v as any).recipe_key || "").trim();
    if (!recipe_key) continue;

    out[recipe_key] = {
      recipe_key,
      iba_code: inferIbaCodeFromFavorite(v),
      title: String((v as any).title || "Recipe").trim() || "Recipe",
      tags: Array.isArray((v as any).tags)
        ? (v as any).tags.map((x: any) => String(x ?? "").trim()).filter(Boolean).slice(0, 4)
        : [],
      recipe: (v as any).recipe ?? null,
      ingredients: Array.isArray((v as any).ingredients)
        ? (v as any).ingredients.map((x: any) => String(x ?? "").trim()).filter(Boolean)
        : [],
      saved_at: Number.isFinite((v as any).saved_at) ? Number((v as any).saved_at) : Date.now(),
    };
  }

  return out;
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favoritesByKey, setFavoritesByKey] = useState<FavoritesByKey>({});
  const didHydrateRef = useRef(false);

  // Economy: favorites capacity is controlled by economy.favoriteLimit (default 5)
  const economy = useEconomy();
  const favoriteLimit = Number.isFinite(economy?.favoriteLimit) ? Number(economy.favoriteLimit) : 5;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);

        if (!raw) {
          if (!cancelled) {
            setFavoritesByKey({});
            didHydrateRef.current = true;
          }
          return;
        }

        const parsed = JSON.parse(raw);
        const map = sanitizeFavoritesMap(parsed);

        if (!cancelled) {
          setFavoritesByKey(map);
          didHydrateRef.current = true;
        }
      } catch {
        if (!cancelled) {
          setFavoritesByKey({});
          didHydrateRef.current = true;
        }
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
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(favoritesByKey));
      } catch {
        // ignore
      }
    }, 150);

    return () => clearTimeout(t);
  }, [favoritesByKey]);

  const favoriteCount = useMemo(() => Object.keys(favoritesByKey ?? {}).length, [favoritesByKey]);
  const remainingSlots = useMemo(
    () => Math.max(0, Math.floor(favoriteLimit) - favoriteCount),
    [favoriteLimit, favoriteCount]
  );
  const isAtLimit = useMemo(() => favoriteCount >= Math.floor(favoriteLimit), [favoriteCount, favoriteLimit]);

  const isFavorite = (recipeKey: string) => {
    return !!favoritesByKey?.[recipeKey];
  };

  const toggleFavorite = (item: FavoriteItem) => {
    if (!item?.recipe_key) return;

    const normalized: FavoriteItem = {
      recipe_key: String(item.recipe_key).trim(),
      iba_code:
        (typeof item.iba_code === "string" && item.iba_code.trim()) ||
        (typeof item?.recipe?.iba_code === "string" && item.recipe.iba_code.trim()) ||
        undefined,
      title: String(item.title || "Recipe").trim() || "Recipe",
      tags: Array.isArray(item.tags)
        ? item.tags.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 4)
        : [],
      recipe: item.recipe ?? null,
      ingredients: Array.isArray(item.ingredients)
        ? item.ingredients.map((x) => String(x ?? "").trim()).filter(Boolean)
        : [],
      saved_at: Number.isFinite(item.saved_at) ? item.saved_at : Date.now(),
    };

    if (!normalized.recipe_key) return;

    setFavoritesByKey((prev) => {
      const exists = !!prev[normalized.recipe_key];

      // Removing is always allowed
      if (exists) {
        const next = { ...prev };
        delete next[normalized.recipe_key];
        return next;
      }

      // Adding: enforce capacity limit
      const count = Object.keys(prev ?? {}).length;
      const limit = Math.floor(Number.isFinite(favoriteLimit) ? favoriteLimit : 5);

      if (count >= limit) {
        Alert.alert(
          "Favorites full",
          `You’ve reached your favorites limit (${limit}).\nGo to “My Favorites” to spend 3 tokens to unlock +1 slot.`
        );
        return prev;
      }

      return { ...prev, [normalized.recipe_key]: normalized };
    });
  };

  const removeFavorite = (recipeKey: string) => {
    setFavoritesByKey((prev) => {
      if (!prev[recipeKey]) return prev;
      const next = { ...prev };
      delete next[recipeKey];
      return next;
    });
  };

  const clearFavorites = async () => {
    setFavoritesByKey({});
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const value = useMemo(
    () => ({
      favoritesByKey,

      favoriteCount,
      favoriteLimit,
      remainingSlots,
      isAtLimit,

      isFavorite,
      toggleFavorite,
      removeFavorite,
      clearFavorites,
    }),
    [favoritesByKey, favoriteCount, favoriteLimit, remainingSlots, isAtLimit]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within <FavoritesProvider />");
  return ctx;
}