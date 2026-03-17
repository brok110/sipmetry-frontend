import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/context/auth";

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

// Convert DB row (from GET /favorites) to FavoriteItem
function dbRowToFavoriteItem(row: any): FavoriteItem | null {
  const recipe_key = String(row?.recipe_key ?? "").trim();
  if (!recipe_key) return null;

  const data = row?.recipe_data ?? {};

  return {
    recipe_key,
    iba_code: inferIbaCodeFromFavorite(data),
    title: String(data?.title ?? "Recipe").trim() || "Recipe",
    tags: Array.isArray(data?.tags)
      ? data.tags.map((x: any) => String(x ?? "").trim()).filter(Boolean).slice(0, 4)
      : [],
    recipe: data?.recipe ?? null,
    ingredients: Array.isArray(data?.ingredients)
      ? data.ingredients.map((x: any) => String(x ?? "").trim()).filter(Boolean)
      : [],
    saved_at: row?.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favoritesByKey, setFavoritesByKey] = useState<FavoritesByKey>({});
  const didHydrateRef = useRef(false);

  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const apiUrl = String(process.env.EXPO_PUBLIC_API_URL ?? "").trim();

  // Favorites are unlimited (token-based limits removed — invisible progression)
  const favoriteLimit = Infinity;

  // ── Hydration from AsyncStorage (runs once on mount) ────────────────────────
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

  // ── Persist to AsyncStorage whenever state changes ───────────────────────────
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

  // ── Sync from DB when user logs in ──────────────────────────────────────────
  // When accessToken changes (login/logout), load favorites from DB.
  // DB is source of truth when logged in.
  useEffect(() => {
    if (!accessToken || !apiUrl) return;

    let cancelled = false;

    (async () => {
      try {
        const resp = await fetch(`${apiUrl}/favorites`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!resp.ok || cancelled) return;

        const json = await resp.json();
        const rows: any[] = json?.favorites ?? [];

        const map: FavoritesByKey = {};
        for (const row of rows) {
          const item = dbRowToFavoriteItem(row);
          if (item) map[item.recipe_key] = item;
        }

        if (!cancelled) {
          setFavoritesByKey(map);
        }
      } catch {
        // Network error — keep local state
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, apiUrl]);

  // ── DB helpers (fire-and-forget, local state already updated optimistically) ──
  const dbAdd = (item: FavoriteItem) => {
    if (!accessToken || !apiUrl) return;

    const recipe_data = {
      iba_code: item.iba_code,
      title: item.title,
      tags: item.tags,
      recipe: item.recipe,
      ingredients: item.ingredients,
    };

    fetch(`${apiUrl}/favorites`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ recipe_key: item.recipe_key, recipe_data }),
    }).catch(() => {
      // ignore — local state already reflects the change
    });
  };

  const dbRemove = (recipeKey: string) => {
    if (!accessToken || !apiUrl) return;

    fetch(`${apiUrl}/favorites/${encodeURIComponent(recipeKey)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {
      // ignore — local state already reflects the change
    });
  };

  // ── Public API ───────────────────────────────────────────────────────────────
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
        dbRemove(normalized.recipe_key);
        const next = { ...prev };
        delete next[normalized.recipe_key];
        return next;
      }

      // Adding
      dbAdd(normalized);
      return { ...prev, [normalized.recipe_key]: normalized };
    });
  };

  const removeFavorite = (recipeKey: string) => {
    dbRemove(recipeKey);
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
