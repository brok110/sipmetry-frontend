import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import { useAuth } from "./auth";

// ── Types ──────────────────────────────────────────────────────────────────

export type EarnReason = "scan" | "like" | "dislike" | "favorite" | "report_error" | "confirm_ingredient";

export type Feature =
  | "mood_chill"
  | "mood_party"
  | "mood_date_night"
  | "mood_solo"
  | "flavor_explorer"
  | "smart_restock"
  | "taste_dna";

type UnlockCosts = Record<string, number>;
type EarnAmounts = Record<string, number>;

/** Emitted when tokens are earned so UI can show "+N" animation */
export type EarnEvent = { amount: number; reason: EarnReason; ts: number };

type TokenContextValue = {
  balance: number;
  unlocks: Set<string>;
  costs: UnlockCosts;
  earnAmounts: EarnAmounts;
  loading: boolean;
  lastEarn: EarnEvent | null;

  /** Earn tokens (fire-and-forget, deduped server-side) */
  earn: (reason: EarnReason, refKey?: string) => void;

  /** Spend tokens to unlock a feature. Returns { ok, reason? } */
  spend: (feature: Feature) => Promise<{ ok: boolean; reason?: string }>;

  /** Check if a feature is unlocked */
  isUnlocked: (feature: string) => boolean;

  /** Refresh balance and unlocks from server */
  refresh: () => void;
};

const TokenContext = createContext<TokenContextValue | null>(null);

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

// ── Provider ───────────────────────────────────────────────────────────────

export function TokenProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const token = session?.access_token;

  const [balance, setBalance] = useState(0);
  const [unlocks, setUnlocks] = useState<Set<string>>(new Set());
  const [costs, setCosts] = useState<UnlockCosts>({});
  const [earnAmounts, setEarnAmounts] = useState<EarnAmounts>({});
  const [loading, setLoading] = useState(false);
  const [lastEarn, setLastEarn] = useState<EarnEvent | null>(null);

  const balanceRef = useRef(0);
  useEffect(() => { balanceRef.current = balance; }, [balance]);

  const authHeaders = useMemo(() => {
    if (!token) return null;
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }, [token]);

  // ── Fetch costs (public, once) ─────────────────────────────────────────
  useEffect(() => {
    if (!API_URL) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/tokens/costs`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setCosts(data.costs ?? {});
          setEarnAmounts(data.earn ?? {});
        }
      } catch {
        // non-critical
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch balance + unlocks on auth change ──────────────────────────────
  const fetchState = useCallback(async () => {
    if (!API_URL || !authHeaders) {
      setBalance(0);
      setUnlocks(new Set());
      return;
    }
    setLoading(true);
    try {
      const [balRes, unlockRes] = await Promise.all([
        fetch(`${API_URL}/tokens`, { headers: authHeaders }),
        fetch(`${API_URL}/tokens/unlocks`, { headers: authHeaders }),
      ]);

      if (balRes.ok) {
        const d = await balRes.json();
        setBalance(d.balance ?? 0);
      }
      if (unlockRes.ok) {
        const d = await unlockRes.json();
        setUnlocks(new Set(Array.isArray(d.features) ? d.features : []));
      }
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // ── Earn (fire-and-forget) ──────────────────────────────────────────────
  const earn = useCallback(
    (reason: EarnReason, refKey?: string) => {
      if (!API_URL || !authHeaders) return;
      // Fire and forget — update optimistically
      (async () => {
        try {
          const res = await fetch(`${API_URL}/tokens/earn`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ reason, ref_key: refKey || null }),
          });
          if (res.ok) {
            const data = await res.json();
            if (typeof data.balance === "number") {
              const prev = balanceRef.current;
              setBalance(data.balance);
              const earned = data.balance - prev;
              if (earned > 0) {
                setLastEarn({ amount: earned, reason, ts: Date.now() });
              }
            }
          }
        } catch {
          // non-critical
        }
      })();
    },
    [authHeaders]
  );

  // ── Spend (awaitable) ──────────────────────────────────────────────────
  const spend = useCallback(
    async (feature: Feature): Promise<{ ok: boolean; reason?: string }> => {
      if (!API_URL || !authHeaders) return { ok: false, reason: "not_authenticated" };
      try {
        const res = await fetch(`${API_URL}/tokens/spend`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ feature }),
        });
        const data = await res.json();
        if (typeof data.balance === "number") {
          setBalance(data.balance);
        }
        if (data.unlocked) {
          setUnlocks((prev) => new Set([...prev, feature]));
        }
        return { ok: !!data.unlocked, reason: data.reason };
      } catch {
        return { ok: false, reason: "network_error" };
      }
    },
    [authHeaders]
  );

  // ── isUnlocked ─────────────────────────────────────────────────────────
  const isUnlocked = useCallback(
    (feature: string) => unlocks.has(feature),
    [unlocks]
  );

  const value = useMemo(
    () => ({
      balance,
      unlocks,
      costs,
      earnAmounts,
      loading,
      lastEarn,
      earn,
      spend,
      isUnlocked,
      refresh: fetchState,
    }),
    [balance, unlocks, costs, earnAmounts, loading, lastEarn, earn, spend, isUnlocked, fetchState]
  );

  return <TokenContext.Provider value={value}>{children}</TokenContext.Provider>;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useTokens() {
  const ctx = useContext(TokenContext);
  if (!ctx) throw new Error("useTokens must be used within <TokenProvider />");
  return ctx;
}

// ── "+N" floating toast ─────────────────────────────────────────────────────

export function TokenEarnToast() {
  const { lastEarn } = useTokens();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState<EarnEvent | null>(null);

  useEffect(() => {
    if (!lastEarn) return;
    setDisplay(lastEarn);
    opacity.setValue(1);
    translateY.setValue(0);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 1800,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -40,
        duration: 1800,
        useNativeDriver: true,
      }),
    ]).start(() => setDisplay(null));
  }, [lastEarn]);

  if (!display) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 60,
        alignSelf: "center",
        opacity,
        transform: [{ translateY }],
        zIndex: 9999,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          backgroundColor: "rgba(0,0,0,0.75)",
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 16,
        }}
      >
        <Text style={{ color: "#f59e0b", fontWeight: "800", fontSize: 14 }}>
          +{display.amount}
        </Text>
        <Text style={{ color: "#fff", fontSize: 11 }}>tokens</Text>
      </View>
    </Animated.View>
  );
}
