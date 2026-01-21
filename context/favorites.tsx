import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type FavoriteItem = {
  recipe_key: string;
  title: string;
  tags: string[];
  recipe: any;
  ingredients: string[];
  saved_at: number;
};

export type FavoritesByKey = Record<string, FavoriteItem>;

type FavoritesContextValue = {
  favoritesByKey: FavoritesByKey;
  isFavorite: (recipeKey: string) => boolean;
  toggleFavorite: (item: FavoriteItem) => void;
  removeFavorite: (recipeKey: string) => void;
  clearFavorites: () => void;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

// ✅ storage key (versioned)
const STORAGE_KEY = "sipmetry:favorites:v1";

// ✅ [ADDED] runtime guard to validate loaded object
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

// ✅ [ADDED] sanitize map loaded from storage
function sanitizeFavoritesMap(raw: any): FavoritesByKey {
  if (!raw || typeof raw !== "object") return {};
  const out: FavoritesByKey = {};

  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== "string") continue;
    if (!isFavoriteItem(v)) continue;

    // minimal normalize
    out[k] = {
      recipe_key: v.recipe_key,
      title: v.title || "Recipe",
      tags: Array.isArray(v.tags) ? v.tags.filter(Boolean).slice(0, 4) : [],
      recipe: v.recipe ?? null,
      ingredients: Array.isArray(v.ingredients) ? v.ingredients.filter(Boolean) : [],
      saved_at: Number.isFinite(v.saved_at) ? v.saved_at : Date.now(),
    };
  }

  return out;
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favoritesByKey, setFavoritesByKey] = useState<FavoritesByKey>({});
  const [hydrated, setHydrated] = useState(false);

  // ✅ avoid writing before initial load completes
  const didHydrateRef = useRef(false);

  // ✅ load favorites once on app start
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);

        if (!raw) {
          if (!cancelled) {
            setFavoritesByKey({});
            setHydrated(true);
            didHydrateRef.current = true;
          }
          return;
        }

        const parsed = JSON.parse(raw);
        const map = sanitizeFavoritesMap(parsed);

        if (!cancelled) {
          setFavoritesByKey(map);
          setHydrated(true);
          didHydrateRef.current = true;
        }
      } catch {
        if (!cancelled) {
          setFavoritesByKey({});
          setHydrated(true);
          didHydrateRef.current = true;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ✅ persist whenever favorites change (after hydration)
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

  const isFavorite = (recipeKey: string) => {
    return !!favoritesByKey?.[recipeKey];
  };

  const toggleFavorite = (item: FavoriteItem) => {
    if (!item?.recipe_key) return;

    // ✅ [ADDED] normalize incoming item so Tab 3 never renders blank
    const normalized: FavoriteItem = {
      recipe_key: String(item.recipe_key).trim(),
      title: String(item.title || "Recipe").trim() || "Recipe",
      tags: Array.isArray(item.tags) ? item.tags.filter(Boolean).slice(0, 4) : [],
      recipe: item.recipe ?? null,
      ingredients: Array.isArray(item.ingredients)
        ? item.ingredients.filter(Boolean)
        : [],
      saved_at: Number.isFinite(item.saved_at) ? item.saved_at : Date.now(),
    };

    setFavoritesByKey((prev) => {
      const exists = !!prev[normalized.recipe_key];
      if (exists) {
        const next = { ...prev };
        delete next[normalized.recipe_key];
        return next;
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
    // ✅ [ADDED] optional: eagerly clear storage too
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const value = useMemo(
    () => ({
      favoritesByKey,
      isFavorite,
      toggleFavorite,
      removeFavorite,
      clearFavorites,
    }),
    [favoritesByKey]
  );

  // keep hydrated available for later, but not required now
  void hydrated;

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within <FavoritesProvider />");
  return ctx;
}