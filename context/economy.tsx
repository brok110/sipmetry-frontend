import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

export type EarnReason = "rate" | "share" | "made" | "task";

export type RewardFlags = {
  rate?: boolean;
  share?: boolean;
  made?: boolean;
  task?: boolean;
};

type EconomyState = {
  tokens: number;
  favorite_limit: number;
  rewardByRecipeKey: Record<string, RewardFlags>;
  updated_at: number;
};

type EconomyContextValue = {
  tokens: number;
  favoriteLimit: number;

  canSpend: (cost: number) => boolean;
  spendTokens: (cost: number) => boolean;

  earnTokens: (amount: number) => void;

  earnOncePerRecipe: (recipeKey: string, reason: EarnReason, amount: number) => boolean;

  purchaseFavoriteSlot: () => boolean;

  getRewardFlags: (recipeKey: string) => RewardFlags;
};

const EconomyContext = createContext<EconomyContextValue | null>(null);

const STORAGE_KEY = "sipmetry:economy:v1";

const DEFAULT_STATE: EconomyState = {
  tokens: 0,
  favorite_limit: 5,
  rewardByRecipeKey: {},
  updated_at: Date.now(),
};

function clampInt(n: any, lo: number, hi: number) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function sanitizeRewardFlags(v: any): RewardFlags | null {
  if (!v || typeof v !== "object") return null;
  return {
    rate: Boolean((v as any).rate),
    share: Boolean((v as any).share),
    made: Boolean((v as any).made),
    task: Boolean((v as any).task),
  };
}

function sanitizeState(raw: any): EconomyState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_STATE, updated_at: Date.now() };

  const tokens = clampInt(raw.tokens ?? 0, 0, 1_000_000);
  const favorite_limit = clampInt(raw.favorite_limit ?? DEFAULT_STATE.favorite_limit, 0, 10_000);

  const rewardByRecipeKey: Record<string, RewardFlags> = {};
  const m = raw.rewardByRecipeKey;

  if (m && typeof m === "object") {
    for (const [k, v] of Object.entries(m)) {
      const key = String(k || "").trim();
      if (!key) continue;

      const flags = sanitizeRewardFlags(v);
      if (!flags) continue;

      rewardByRecipeKey[key] = flags;
    }
  }

  return {
    tokens,
    favorite_limit,
    rewardByRecipeKey,
    updated_at: Number.isFinite(raw.updated_at) ? Number(raw.updated_at) : Date.now(),
  };
}

export function EconomyProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<EconomyState>(DEFAULT_STATE);

  // IMPORTANT: stateRef makes "return boolean" APIs reliable even under React batching/StrictMode.
  const stateRef = useRef<EconomyState>(DEFAULT_STATE);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
        const parsed = JSON.parse(raw);
        const next = sanitizeState(parsed);

        if (!cancelled) {
          setState(next);
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
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stateRef.current));
      } catch {
        // ignore
      }
    }, 150);

    return () => clearTimeout(t);
  }, [state]);

  const canSpend = (cost: number) => {
    const c = clampInt(cost, 0, 1_000_000);
    return (stateRef.current.tokens ?? 0) >= c;
  };

  const spendTokens = (cost: number) => {
    const c = clampInt(cost, 0, 1_000_000);
    if (c <= 0) return true;

    const cur = stateRef.current;
    if ((cur.tokens ?? 0) < c) return false;

    setState((prev) => {
      if ((prev.tokens ?? 0) < c) return prev;
      return {
        ...prev,
        tokens: clampInt((prev.tokens ?? 0) - c, 0, 1_000_000),
        updated_at: Date.now(),
      };
    });

    return true;
  };

  const earnTokens = (amount: number) => {
    const a = clampInt(amount, 0, 1_000_000);
    if (a <= 0) return;

    setState((prev) => ({
      ...prev,
      tokens: clampInt((prev.tokens ?? 0) + a, 0, 1_000_000),
      updated_at: Date.now(),
    }));
  };

  const earnOncePerRecipe = (recipeKey: string, reason: EarnReason, amount: number) => {
    const key = String(recipeKey || "").trim();
    if (!key) return false;

    const a = clampInt(amount, 0, 1_000_000);
    if (a <= 0) return false;

    const cur = stateRef.current;
    const existingFlags = cur.rewardByRecipeKey?.[key] ?? {};
    if ((existingFlags as any)[reason]) return false;

    setState((prev) => {
      const prevFlags = prev.rewardByRecipeKey?.[key] ?? {};
      if ((prevFlags as any)[reason]) return prev;

      const nextFlags: RewardFlags = { ...prevFlags, [reason]: true };

      return {
        ...prev,
        tokens: clampInt((prev.tokens ?? 0) + a, 0, 1_000_000),
        rewardByRecipeKey: {
          ...(prev.rewardByRecipeKey ?? {}),
          [key]: nextFlags,
        },
        updated_at: Date.now(),
      };
    });

    return true;
  };

  const purchaseFavoriteSlot = () => {
    const cost = 3;

    const cur = stateRef.current;
    if ((cur.tokens ?? 0) < cost) return false;

    setState((prev) => {
      if ((prev.tokens ?? 0) < cost) return prev;

      return {
        ...prev,
        tokens: clampInt((prev.tokens ?? 0) - cost, 0, 1_000_000),
        favorite_limit: clampInt((prev.favorite_limit ?? DEFAULT_STATE.favorite_limit) + 1, 0, 10_000),
        updated_at: Date.now(),
      };
    });

    return true;
  };

  const getRewardFlags = (recipeKey: string) => {
    const key = String(recipeKey || "").trim();
    if (!key) return {};
    return stateRef.current.rewardByRecipeKey?.[key] ?? {};
  };

  const value = useMemo(
    () => ({
      tokens: state.tokens,
      favoriteLimit: state.favorite_limit,

      canSpend,
      spendTokens,

      earnTokens,
      earnOncePerRecipe,

      purchaseFavoriteSlot,

      getRewardFlags,
    }),
    [
      state.tokens,
      state.favorite_limit,
      state.rewardByRecipeKey,
      // functions are stable enough, but keep in deps for correctness if bundler changes identity
      canSpend,
      spendTokens,
      earnTokens,
      earnOncePerRecipe,
      purchaseFavoriteSlot,
      getRewardFlags,
    ]
  );

  return <EconomyContext.Provider value={value}>{children}</EconomyContext.Provider>;
}

export function useEconomy() {
  const ctx = useContext(EconomyContext);
  if (!ctx) throw new Error("useEconomy must be used within <EconomyProvider />");
  return ctx;
}