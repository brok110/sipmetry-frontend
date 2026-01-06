import React, { createContext, useContext, useMemo, useState } from "react";

export type FeedbackRating = "like" | "dislike";
export type RatingsByKey = Record<string, FeedbackRating>;

type FeedbackContextValue = {
  ratingsByKey: RatingsByKey;
  setRating: (recipeKey: string, rating: FeedbackRating) => void;
  clearRating: (recipeKey: string) => void;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [ratingsByKey, setRatingsByKey] = useState<RatingsByKey>({});

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

  const value = useMemo(
    () => ({ ratingsByKey, setRating, clearRating }),
    [ratingsByKey]
  );

  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used within <FeedbackProvider />");
  return ctx;
}
