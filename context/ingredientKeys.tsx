import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "@/context/auth";
import { apiFetch } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

export type IngredientKeysData = {
  version: string;
  canonical_keys: string[];
  aliases: Record<string, string>; // display/alias key → canonical key
  isLoaded: boolean;
};

export type IngredientKeyMatch = {
  display: string;
  canonical: string;
};

type IngredientKeysContextValue = {
  data: IngredientKeysData;
  /** Returns canonical key for input, or null if unrecognised / not yet loaded. */
  resolve: (input: string) => string | null;
  /**
   * Returns up to `limit` matches for `query`.
   * Ranked: starts-with before contains. Deduped by canonical.
   * Returns [] when allowlist not yet loaded.
   */
  filter: (query: string, limit?: number) => IngredientKeyMatch[];
};

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_DATA: IngredientKeysData = {
  version: "",
  canonical_keys: [],
  aliases: {},
  isLoaded: false,
};

const IngredientKeysContext = createContext<IngredientKeysContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────────

export function IngredientKeysProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;

  const [data, setData] = useState<IngredientKeysData>(DEFAULT_DATA);

  // Fetch once per session (re-fetches when access_token changes, e.g. after re-login).
  useEffect(() => {
    if (!accessToken) {
      setData(DEFAULT_DATA);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await apiFetch("/ingredient-keys", { session });
        if (cancelled) return;
        if (!res.ok) {
          console.warn(`[ingredientKeys] fetch returned ${res.status}`);
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        setData({
          version: String(json?.version ?? ""),
          canonical_keys: Array.isArray(json?.canonical_keys) ? json.canonical_keys : [],
          aliases:
            json?.aliases && typeof json.aliases === "object" ? json.aliases : {},
          isLoaded: true,
        });
      } catch (err: any) {
        console.warn("[ingredientKeys] fetch failed:", err?.message ?? String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────────────────────

  const resolve = useCallback(
    (input: string): string | null => {
      if (!data.isLoaded) return null;
      const normalized = input.toLowerCase().trim();
      if (!normalized) return null;
      // Exact canonical match
      if (data.canonical_keys.includes(normalized)) return normalized;
      // Alias map (e.g. "lime juice" → "lime_juice")
      const mapped = data.aliases[normalized];
      if (mapped) return mapped;
      return null;
    },
    [data]
  );

  const filter = useCallback(
    (query: string, limit = 20): IngredientKeyMatch[] => {
      if (!data.isLoaded) return [];
      const q = query.toLowerCase().trim();
      if (!q) return [];

      // Dedupe by canonical so the same ingredient never appears twice.
      const seen = new Set<string>();
      const startsWith: IngredientKeyMatch[] = [];
      const contains: IngredientKeyMatch[] = [];

      // Match canonical keys first (display = canonical)
      for (const key of data.canonical_keys) {
        if (seen.has(key)) continue;
        if (key.startsWith(q)) {
          seen.add(key);
          startsWith.push({ display: key, canonical: key });
        } else if (key.includes(q)) {
          seen.add(key);
          contains.push({ display: key, canonical: key });
        }
      }

      // Match alias keys — user-friendly display forms (e.g. "lime juice")
      for (const [aliasKey, canonical] of Object.entries(data.aliases)) {
        if (seen.has(canonical)) continue;
        const ak = aliasKey.toLowerCase();
        if (ak.startsWith(q)) {
          seen.add(canonical);
          startsWith.push({ display: aliasKey, canonical });
        } else if (ak.includes(q)) {
          seen.add(canonical);
          contains.push({ display: aliasKey, canonical });
        }
      }

      return [...startsWith, ...contains].slice(0, limit);
    },
    [data]
  );

  const value = useMemo(
    () => ({ data, resolve, filter }),
    [data, resolve, filter]
  );

  return (
    <IngredientKeysContext.Provider value={value}>
      {children}
    </IngredientKeysContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useIngredientKeys() {
  const ctx = useContext(IngredientKeysContext);
  if (!ctx) throw new Error("useIngredientKeys must be used within <IngredientKeysProvider />");
  return ctx;
}
