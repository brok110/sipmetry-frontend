/**
 * context/learnedPreferences.tsx
 *
 * Fires POST /preferences/learn when the user is logged in,
 * caches the result, and exposes it via useLearnedPreferences().
 *
 * The learned vector is recomputed from the user's feedback history
 * server-side and written to user_preferences.learned_vector.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { useAuth } from "@/context/auth";

export type LearnedVector = Record<string, number>;

type LearnedPreferencesContextValue = {
  /** 12D flavor vector learned from feedback history, or null if unavailable. */
  learnedVector: LearnedVector | null;
  /** Number of feedback events used to compute the vector. */
  eventCount: number;
  /** True while the POST /preferences/learn request is in-flight. */
  isLoading: boolean;
  /** Manually re-trigger the learn computation (e.g. after new feedback). */
  refresh: () => void;
};

const LearnedPreferencesContext = createContext<LearnedPreferencesContextValue | null>(null);

export function LearnedPreferencesProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const apiUrl = String(process.env.EXPO_PUBLIC_API_URL ?? "").trim();

  const [learnedVector, setLearnedVector] = useState<LearnedVector | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!accessToken || !apiUrl) {
      // Logged out — clear cached vector
      setLearnedVector(null);
      setEventCount(0);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const resp = await fetch(`${apiUrl}/preferences/learn`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (cancelled || !resp.ok) return;

        const json = await resp.json();
        if (!cancelled) {
          setLearnedVector(json?.vector ?? null);
          setEventCount(Number(json?.event_count ?? 0));
        }
      } catch {
        // Network error — keep previous state
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, apiUrl, refreshToken]);

  const refresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  const value: LearnedPreferencesContextValue = {
    learnedVector,
    eventCount,
    isLoading,
    refresh,
  };

  return (
    <LearnedPreferencesContext.Provider value={value}>
      {children}
    </LearnedPreferencesContext.Provider>
  );
}

export function useLearnedPreferences() {
  const ctx = useContext(LearnedPreferencesContext);
  if (!ctx) throw new Error("useLearnedPreferences must be used within LearnedPreferencesProvider");
  return ctx;
}
