import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type FlavorLevel = 0 | 1 | 2 | 3;

export type StylePreset =
  | "Clean"
  | "Rich"
  | "Bitter-forward"
  | "Sweet-tooth"
  | "Herbal"
  | "Fruity"
  | "Smoky"
  | "Sparkling";

export type Preference3 = {
  alcoholStrength: FlavorLevel;
  sweetness: FlavorLevel;
  bitterness: FlavorLevel;
};

export type PreferencesState = {
  stylePreset: StylePreset;
  dims: Preference3;
};

export type PreferencesContextValue = {
  preferences: PreferencesState;
  setStylePreset: (next: StylePreset) => void;
  setDim: (k: keyof Preference3, v: FlavorLevel) => void;
  setPreferences: (next: PreferencesState) => void;
  resetPreferences: () => void;
  hydrated: boolean;
};

const DEFAULT_PREFERENCES: PreferencesState = {
  stylePreset: "Clean",
  dims: {
    alcoholStrength: 2,
    sweetness: 1,
    bitterness: 2,
  },
};

const STORAGE_KEY = "sipmetry.preferences.v1";

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function safeParse(json: string): any {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function coerceLevel(n: any): FlavorLevel {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x <= 0) return 0;
  if (x >= 3) return 3;
  return x as FlavorLevel;
}

function coerceStylePreset(s: any): StylePreset {
  const v = String(s || "").trim();
  const allowed: StylePreset[] = [
    "Clean",
    "Rich",
    "Bitter-forward",
    "Sweet-tooth",
    "Herbal",
    "Fruity",
    "Smoky",
    "Sparkling",
  ];
  return allowed.includes(v as StylePreset) ? (v as StylePreset) : DEFAULT_PREFERENCES.stylePreset;
}

function normalizePreferences(input: any): PreferencesState {
  const stylePreset = coerceStylePreset(input?.stylePreset);
  const dimsRaw = input?.dims ?? {};
  const dims: Preference3 = {
    alcoholStrength: coerceLevel(dimsRaw.alcoholStrength),
    sweetness: coerceLevel(dimsRaw.sweetness),
    bitterness: coerceLevel(dimsRaw.bitterness),
  };
  return { stylePreset, dims };
}

function getAsyncStorage(): any | null {
  try {
    const m = require("@react-native-async-storage/async-storage");
    return m?.default ?? m;
  } catch {
    return null;
  }
}

async function persist(next: PreferencesState) {
  const AsyncStorage = getAsyncStorage();
  if (!AsyncStorage) return;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
  }
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferencesState] = useState<PreferencesState>(DEFAULT_PREFERENCES);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const AsyncStorage = getAsyncStorage();
    if (!AsyncStorage) {
      setHydrated(true);
      return;
    }

    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!alive) return;
        if (raw) {
          const parsed = safeParse(raw);
          if (parsed) setPreferencesState(normalizePreferences(parsed));
        }
      } catch {
      } finally {
        if (alive) setHydrated(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo<PreferencesContextValue>(() => {
    return {
      preferences,
      hydrated,
      setStylePreset: (next) => {
        setPreferencesState((prev) => ({ ...prev, stylePreset: next }));
      },
      setDim: (k, v) => {
        setPreferencesState((prev) => ({ ...prev, dims: { ...prev.dims, [k]: v } }));
      },
      setPreferences: (next) => {
        const normalized = normalizePreferences(next);
        setPreferencesState(normalized);
        if (hydrated) persist(normalized);
      },
      resetPreferences: () => {
        setPreferencesState(DEFAULT_PREFERENCES);
        if (hydrated) persist(DEFAULT_PREFERENCES);
      },
    };
  }, [preferences, hydrated]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}

export function levelWordAlcohol(v: FlavorLevel) {
  if (v === 0) return "Soft";
  if (v === 1) return "Medium";
  if (v === 2) return "Boozy";
  return "Extra Boozy";
}

export function levelWordSweetness(v: FlavorLevel) {
  if (v === 0) return "Dry";
  if (v === 1) return "Semi-sweet";
  if (v === 2) return "Sweet";
  return "Very Sweet";
}

export function levelWordBitterness(v: FlavorLevel) {
  if (v === 0) return "Smooth";
  if (v === 1) return "Slight Bitter";
  if (v === 2) return "Bitter";
  return "Very Bitter";
}