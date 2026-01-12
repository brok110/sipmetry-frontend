import React, { createContext, useContext, useMemo, useState } from "react";

export type FeedbackRating = "like" | "dislike";
export type RatingsByKey = Record<string, FeedbackRating>;

// ✅ [ADDED] Favorites types
export type FavoriteItem = {
  recipeKey: string;
  title: string;
  tags: string[]; // flavor_4
  recipe: any;
  ingredients: string[];
  createdAt: number;
};
export type FavoritesByKey = Record<string, FavoriteItem>;

type FeedbackContextValue = {
  // ratings
  ratingsByKey: RatingsByKey;
  setRating: (recipeKey: string, rating: FeedbackRating) => void;
  clearRating: (recipeKey: string) => void;

  // ✅ [ADDED] favorites
  favoritesByKey: FavoritesByKey;
  addFavorite: (item: Omit<FavoriteItem, "createdAt">) => void;
  removeFavorite: (recipeKey: string) => void;
  toggleFavorite: (item: Omit<FavoriteItem, "createdAt">) => void;
  clearFavorites: () => void;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [ratingsByKey, setRatingsByKey] = useState<RatingsByKey>({});

  // ✅ [ADDED] favorites state
  const [favoritesByKey, setFavoritesByKey] = useState<FavoritesByKey>({});

  // ratings
  const setRating = (recipeKey: string, rating: FeedbackRating) => {
    setRatingsByKey((prev) => ({ ...prev, [recipeKey]: rating }));
  };

  const clearRating = (recipeKey: string) => {
    setRatingsByKey((prev) => {
      const next = { ...prev };
      delete next[recipeKey];
      return next;
    });
  };

  // ✅ [ADDED] favorites actions
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
      setRating,
      clearRating,

      favoritesByKey,
      addFavorite,
      removeFavorite,
      toggleFavorite,
      clearFavorites,
    }),
    [ratingsByKey, favoritesByKey]
  );

  return (
    <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used within <FeedbackProvider />");
  return ctx;
}
