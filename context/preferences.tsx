import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type FlavorLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type FlavorLevelV1 = 0 | 1 | 2 | 3;

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
  alcoholStrength: FlavorLevelV1;
  sweetness: FlavorLevelV1;
  bitterness: FlavorLevelV1;
};

export type FlavorDimKey =
  | "alcoholStrength"
  | "sweetness"
  | "bitterness"
  | "sourness"
  | "herbal"
  | "fruity"
  | "smoky"
  | "body"
  | "fizz"
  | "floral"
  | "spicy"
  | "aromaIntensity";

export type FlavorVector = Record<FlavorDimKey, FlavorLevel>;

export type ExplicitDims = Record<FlavorDimKey, boolean>;

export type SafetyMode = {
  avoidHighProof: boolean;
  avoidAllergens: boolean;
  avoidCaffeineAlcohol: boolean;
};

export type UserPreferencesV2 = {
  schema_version: 2;
  has_user_set: boolean;
  updated_at: number | null;
  styles: string[];
  intensities: FlavorVector;
  explicit: ExplicitDims;
  dislikes: string[];
  stylePreset: StylePreset;
  dims: Preference3;
  safetyMode: SafetyMode;
};

export type PreferencesState = UserPreferencesV2;

export type ResolvedMeta = {
  source: "unhydrated" | "not_edited" | "user";
  isHydrated: boolean;
  hasUserEdited: boolean;
  isBalanced: boolean;
};

export type PreferencesContextValue = {
  preferences: PreferencesState;
  resolvedVector: FlavorVector;
  resolvedMeta: ResolvedMeta;
  setStylePreset: (next: StylePreset) => void;
  setDim: (k: keyof Preference3, v: FlavorLevelV1) => void;
  setPreferences: (next: any) => void;
  resetPreferences: () => void;
  hydrated: boolean;
};

export const BALANCED_VECTOR: FlavorVector = {
  alcoholStrength: 3,
  sweetness: 3,
  bitterness: 3,
  sourness: 3,
  herbal: 3,
  fruity: 3,
  smoky: 3,
  body: 3,
  fizz: 3,
  floral: 3,
  spicy: 3,
  aromaIntensity: 3,
};

const DEFAULT_V1_DIMS: Preference3 = {
  alcoholStrength: 2,
  sweetness: 1,
  bitterness: 2,
};

const DEFAULT_EXPLICIT: ExplicitDims = {
  alcoholStrength: false,
  sweetness: false,
  bitterness: false,
  sourness: false,
  herbal: false,
  fruity: false,
  smoky: false,
  body: false,
  fizz: false,
  floral: false,
  spicy: false,
  aromaIntensity: false,
};

const DEFAULT_SAFETY_MODE: SafetyMode = {
  avoidHighProof: false,
  avoidAllergens: false,
  avoidCaffeineAlcohol: false,
};

function coerceExplicitDims(input: any): ExplicitDims {
  const src = input && typeof input === "object" ? input : {};
  const out: ExplicitDims = { ...DEFAULT_EXPLICIT };
  (Object.keys(out) as FlavorDimKey[]).forEach((k) => {
    const v = (src as any)[k];
    out[k] = v === true;
  });
  return out;
}

function coerceSafetyMode(input: any): SafetyMode {
  const src = input && typeof input === "object" ? input : {};
  return {
    avoidHighProof: src.avoidHighProof === true,
    avoidAllergens: src.avoidAllergens === true,
    avoidCaffeineAlcohol: src.avoidCaffeineAlcohol === true,
  };
}

const DEFAULT_V2: PreferencesState = {
  schema_version: 2,
  has_user_set: false,
  updated_at: null,
  styles: [],
  dislikes: [],
  intensities: { ...BALANCED_VECTOR },
  explicit: { ...DEFAULT_EXPLICIT },
  stylePreset: "Clean",
  dims: { ...DEFAULT_V1_DIMS },
  safetyMode: { ...DEFAULT_SAFETY_MODE },
};

const STORAGE_KEY_V1 = "sipmetry.preferences.v1";
const STORAGE_KEY_V2 = "sipmetry.preferences.v2";
const STORAGE_KEY_COMPAT = "sipmetry.preferences";

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function safeParse(json: string): any {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function coerceLevel5(n: any): FlavorLevel {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  const r = Math.round(x);
  return clampInt(r, 0, 5) as FlavorLevel;
}

export function coerceLevel3(n: any): FlavorLevelV1 {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  const r = Math.round(x);
  return clampInt(r, 0, 3) as FlavorLevelV1;
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
  return allowed.includes(v as StylePreset) ? (v as StylePreset) : DEFAULT_V2.stylePreset;
}

function dedupeStrings(list: any): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    const s = String(x ?? "").trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function areFlavorVectorsEqual(a: FlavorVector, b: FlavorVector): boolean {
  return (
    a.alcoholStrength === b.alcoholStrength &&
    a.sweetness === b.sweetness &&
    a.bitterness === b.bitterness &&
    a.sourness === b.sourness &&
    a.herbal === b.herbal &&
    a.fruity === b.fruity &&
    a.smoky === b.smoky &&
    a.body === b.body &&
    a.fizz === b.fizz &&
    a.floral === b.floral &&
    a.spicy === b.spicy &&
    a.aromaIntensity === b.aromaIntensity
  );
}

function arePreference3Equal(a: Preference3, b: Preference3): boolean {
  return (
    a.alcoholStrength === b.alcoholStrength &&
    a.sweetness === b.sweetness &&
    a.bitterness === b.bitterness
  );
}

function mapLevel3To5(v: any): FlavorLevel {
  const l3 = coerceLevel3(v);
  const mapped = Math.round((Number(l3) * 5) / 3);
  return clampInt(mapped, 0, 5) as FlavorLevel;
}

export function isUserEdited(prefs: PreferencesState | null | undefined): boolean {
  if (!prefs) return false;

  const styles = Array.isArray(prefs.styles) ? prefs.styles : [];
  const dislikes = Array.isArray(prefs.dislikes) ? prefs.dislikes : [];

  if (styles.length > 0) return true;
  if (dislikes.length > 0) return true;

  if (prefs.stylePreset && prefs.stylePreset !== DEFAULT_V2.stylePreset) return true;

  const explicit = prefs.explicit;
  if (explicit && typeof explicit === "object") {
    for (const k of Object.keys(DEFAULT_EXPLICIT) as FlavorDimKey[]) {
      if ((explicit as any)[k] === true) return true;
    }
  }

  const intens = prefs.intensities ?? BALANCED_VECTOR;
  if (!areFlavorVectorsEqual(intens, BALANCED_VECTOR)) return true;

  const dims = prefs.dims ?? DEFAULT_V1_DIMS;
  if (!arePreference3Equal(dims, DEFAULT_V1_DIMS)) return true;

  const safetyMode = prefs.safetyMode ?? DEFAULT_SAFETY_MODE;
  if (safetyMode.avoidHighProof || safetyMode.avoidAllergens || safetyMode.avoidCaffeineAlcohol) {
    return true;
  }

  return false;
}

export function resolvePreferencesByAC({
  isHydrated,
  prefs,
}: {
  isHydrated: boolean;
  prefs: PreferencesState;
}): { vector: FlavorVector; meta: ResolvedMeta } {
  const edited = isUserEdited(prefs);

  if (!isHydrated) {
    return {
      vector: { ...BALANCED_VECTOR },
      meta: {
        source: "unhydrated",
        isHydrated: false,
        hasUserEdited: false,
        isBalanced: true,
      },
    };
  }

  if (!edited) {
    return {
      vector: { ...BALANCED_VECTOR },
      meta: {
        source: "not_edited",
        isHydrated: true,
        hasUserEdited: false,
        isBalanced: true,
      },
    };
  }

  const stored = prefs.intensities ?? BALANCED_VECTOR;
  const vector: FlavorVector = {
    alcoholStrength: stored.alcoholStrength ?? BALANCED_VECTOR.alcoholStrength,
    sweetness: stored.sweetness ?? BALANCED_VECTOR.sweetness,
    bitterness: stored.bitterness ?? BALANCED_VECTOR.bitterness,
    sourness: stored.sourness ?? BALANCED_VECTOR.sourness,
    herbal: stored.herbal ?? BALANCED_VECTOR.herbal,
    fruity: stored.fruity ?? BALANCED_VECTOR.fruity,
    smoky: stored.smoky ?? BALANCED_VECTOR.smoky,
    body: stored.body ?? BALANCED_VECTOR.body,
    fizz: stored.fizz ?? BALANCED_VECTOR.fizz,
    floral: stored.floral ?? BALANCED_VECTOR.floral,
    spicy: stored.spicy ?? BALANCED_VECTOR.spicy,
    aromaIntensity: stored.aromaIntensity ?? BALANCED_VECTOR.aromaIntensity,
  };

  return {
    vector,
    meta: {
      source: "user",
      isHydrated: true,
      hasUserEdited: true,
      isBalanced: areFlavorVectorsEqual(vector, BALANCED_VECTOR),
    },
  };
}

function normalizeV1(input: any): PreferencesState {
  const stylePreset = coerceStylePreset(input?.stylePreset);
  const dimsRaw = input?.dims ?? {};

  const dims: Preference3 = {
    alcoholStrength: coerceLevel3(dimsRaw.alcoholStrength),
    sweetness: coerceLevel3(dimsRaw.sweetness),
    bitterness: coerceLevel3(dimsRaw.bitterness),
  };

  // V1 default dims must NOT be treated as "user edited" in V2.
  // If the legacy dims equal DEFAULT_V1_DIMS, we normalize to BALANCED_VECTOR.
  const dimsEdited = !arePreference3Equal(dims, DEFAULT_V1_DIMS);

  const intensities: FlavorVector = dimsEdited
    ? {
        ...BALANCED_VECTOR,
        alcoholStrength: mapLevel3To5(dims.alcoholStrength),
        sweetness: mapLevel3To5(dims.sweetness),
        bitterness: mapLevel3To5(dims.bitterness),
      }
    : { ...BALANCED_VECTOR };

  const explicit: ExplicitDims = { ...DEFAULT_EXPLICIT };

  const base: PreferencesState = {
    ...DEFAULT_V2,
    schema_version: 2,
    updated_at: null,
    styles: [],
    dislikes: [],
    intensities,
    explicit,
    stylePreset,
    dims,
    safetyMode: { ...DEFAULT_SAFETY_MODE },
    has_user_set: false,
  };

  return {
    ...base,
    has_user_set: isUserEdited(base),
  };
}

function normalizeV2(input: any): PreferencesState {
  const styles = dedupeStrings(input?.styles);
  const dislikes = dedupeStrings(input?.dislikes);

  const updated_at_raw = input?.updated_at;
  const updated_at = typeof updated_at_raw === "number" && Number.isFinite(updated_at_raw) ? updated_at_raw : null;

  const hasIntensities = input && typeof input === "object" && input.intensities && typeof input.intensities === "object";
  const intensRaw = hasIntensities ? input.intensities : null;

  const dimsRaw = input?.dims ?? {};
  const dimsFromInput: Preference3 = {
    alcoholStrength: coerceLevel3(dimsRaw.alcoholStrength),
    sweetness: coerceLevel3(dimsRaw.sweetness),
    bitterness: coerceLevel3(dimsRaw.bitterness),
  };

  const explicit = coerceExplicitDims(input?.explicit);

  const intensities: FlavorVector = hasIntensities
    ? {
        alcoholStrength: coerceLevel5(intensRaw.alcoholStrength ?? intensRaw.alcohol_strength ?? intensRaw.alcohol ?? intensRaw.boozy),
        sweetness: coerceLevel5(intensRaw.sweetness ?? intensRaw.sweet),
        bitterness: coerceLevel5(intensRaw.bitterness ?? intensRaw.bitter),
        sourness: coerceLevel5(intensRaw.sourness ?? intensRaw.sour),
        herbal: coerceLevel5(intensRaw.herbal),
        fruity: coerceLevel5(intensRaw.fruity),
        smoky: coerceLevel5(intensRaw.smoky),
        body: coerceLevel5(intensRaw.body),
        fizz: coerceLevel5(intensRaw.fizz),
        floral: coerceLevel5(intensRaw.floral),
        spicy: coerceLevel5(intensRaw.spicy),
        aromaIntensity: coerceLevel5(intensRaw.aromaIntensity ?? intensRaw.aroma_intensity ?? intensRaw.aroma),
      }
    : {
        ...BALANCED_VECTOR,
        alcoholStrength: mapLevel3To5(dimsFromInput.alcoholStrength),
        sweetness: mapLevel3To5(dimsFromInput.sweetness),
        bitterness: mapLevel3To5(dimsFromInput.bitterness),
      };

  const stylePreset = coerceStylePreset(input?.stylePreset);

  const dims: Preference3 = { ...dimsFromInput };
  const safetyMode = coerceSafetyMode(input?.safetyMode);

  const base: PreferencesState = {
    ...DEFAULT_V2,
    schema_version: 2,
    updated_at,
    styles,
    dislikes,
    intensities,
    explicit,
    stylePreset,
    dims,
    safetyMode,
    has_user_set: false,
  };

  return {
    ...base,
    has_user_set: isUserEdited(base),
  };
}

function normalizePreferences(input: any): PreferencesState {
  const sv = Number(input?.schema_version);
  if (sv === 2) return normalizeV2(input);

  const hasV1Dims = input && typeof input === "object" && input.dims && typeof input.dims === "object";
  const hasV1Style = typeof input?.stylePreset === "string";
  if (hasV1Dims || hasV1Style) return normalizeV1(input);

  const maybeFlat = input && typeof input === "object" ? input : {};

  const intensities: FlavorVector = {
    alcoholStrength: coerceLevel5(maybeFlat.alcoholStrength ?? maybeFlat.alcohol_strength ?? maybeFlat.boozy),
    sweetness: coerceLevel5(maybeFlat.sweetness ?? maybeFlat.sweet),
    bitterness: coerceLevel5(maybeFlat.bitterness ?? maybeFlat.bitter),
    sourness: coerceLevel5(maybeFlat.sourness ?? maybeFlat.sour),
    herbal: coerceLevel5(maybeFlat.herbal),
    fruity: coerceLevel5(maybeFlat.fruity),
    smoky: coerceLevel5(maybeFlat.smoky),
    body: coerceLevel5(maybeFlat.body),
    fizz: coerceLevel5(maybeFlat.fizz),
    floral: coerceLevel5(maybeFlat.floral),
    spicy: coerceLevel5(maybeFlat.spicy),
    aromaIntensity: coerceLevel5(maybeFlat.aromaIntensity ?? maybeFlat.aroma_intensity ?? maybeFlat.aroma),
  };

  const base: PreferencesState = {
    ...DEFAULT_V2,
    schema_version: 2,
    updated_at: null,
    intensities,
    explicit: { ...DEFAULT_EXPLICIT },
    safetyMode: coerceSafetyMode(maybeFlat.safetyMode),
    has_user_set: false,
  };

  return {
    ...base,
    has_user_set: isUserEdited(base),
  };
}

function getAsyncStorage(): any | null {
  try {
    const m = require("@react-native-async-storage/async-storage");
    return m?.default ?? m;
  } catch {
    return null;
  }
}

async function persistAll(next: PreferencesState) {
  const AsyncStorage = getAsyncStorage();
  if (!AsyncStorage) return;

  try {
    await AsyncStorage.setItem(STORAGE_KEY_V2, JSON.stringify(next));
  } catch {}

  try {
    await AsyncStorage.setItem(STORAGE_KEY_COMPAT, JSON.stringify(next));
  } catch {}

  try {
    await AsyncStorage.setItem(
      "sipmetry_preferences",
      JSON.stringify({
        intensities: next.intensities,
        explicit: next.explicit,
        alcoholStrength: next.intensities.alcoholStrength,
        sweetness: next.intensities.sweetness,
        bitterness: next.intensities.bitterness,
        sourness: next.intensities.sourness,
        herbal: next.intensities.herbal,
        fruity: next.intensities.fruity,
        smoky: next.intensities.smoky,
        body: next.intensities.body,
        fizz: next.intensities.fizz,
        floral: next.intensities.floral,
        spicy: next.intensities.spicy,
        aromaIntensity: next.intensities.aromaIntensity,
        stylePreset: next.stylePreset,
        safetyMode: next.safetyMode,
        has_user_set: next.has_user_set,
        updated_at: next.updated_at,
      })
    );
  } catch {}
}

function withDerived(next: PreferencesState, { touch }: { touch: boolean }): PreferencesState {
  const updated: PreferencesState = {
    ...next,
    updated_at: touch ? Date.now() : next.updated_at,
  };
  return {
    ...updated,
    has_user_set: isUserEdited(updated),
  };
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferencesState] = useState<PreferencesState>(DEFAULT_V2);
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
        const rawV2 = await AsyncStorage.getItem(STORAGE_KEY_V2);
        if (!alive) return;
        if (rawV2) {
          const parsed = safeParse(rawV2);
          if (parsed) {
            const normalized = normalizePreferences(parsed);
            setPreferencesState(normalized);
            setHydrated(true);
            return;
          }
        }

        const rawCompat = await AsyncStorage.getItem(STORAGE_KEY_COMPAT);
        if (!alive) return;
        if (rawCompat) {
          const parsed = safeParse(rawCompat);
          if (parsed) {
            const normalized = normalizePreferences(parsed);
            setPreferencesState(normalized);
            await persistAll(normalized);
            setHydrated(true);
            return;
          }
        }

        const rawV1 = await AsyncStorage.getItem(STORAGE_KEY_V1);
        if (!alive) return;
        if (rawV1) {
          const parsed = safeParse(rawV1);
          if (parsed) {
            const migrated = normalizeV1(parsed);
            setPreferencesState(migrated);
            await persistAll(migrated);
            setHydrated(true);
            return;
          }
        }

        const rawLegacy = await AsyncStorage.getItem("preferences");
        if (!alive) return;
        if (rawLegacy) {
          const parsed = safeParse(rawLegacy);
          if (parsed) {
            const normalized = normalizePreferences(parsed);
            setPreferencesState(normalized);
            await persistAll(normalized);
            setHydrated(true);
            return;
          }
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
    const resolved = resolvePreferencesByAC({ isHydrated: hydrated, prefs: preferences });

    return {
      preferences,
      hydrated,
      resolvedVector: resolved.vector,
      resolvedMeta: resolved.meta,

      setStylePreset: (next) => {
        setPreferencesState((prev) => {
          const candidate: PreferencesState = { ...prev, stylePreset: next };
          const updated = withDerived(candidate, { touch: true });
          if (hydrated) persistAll(updated);
          return updated;
        });
      },

      setDim: (k, v) => {
        setPreferencesState((prev) => {
          const nextDims: Preference3 = { ...prev.dims, [k]: v };

          // Keep intensities in sync with legacy 0-3 dims for the three shared axes.
          const nextIntensities: FlavorVector = {
            ...prev.intensities,
            alcoholStrength:
              k === "alcoholStrength" ? mapLevel3To5(v) : prev.intensities.alcoholStrength,
            sweetness: k === "sweetness" ? mapLevel3To5(v) : prev.intensities.sweetness,
            bitterness: k === "bitterness" ? mapLevel3To5(v) : prev.intensities.bitterness,
          };

          const nextExplicit: ExplicitDims = { ...prev.explicit };
          if (k === "alcoholStrength") nextExplicit.alcoholStrength = true;
          if (k === "sweetness") nextExplicit.sweetness = true;
          if (k === "bitterness") nextExplicit.bitterness = true;

          const candidate: PreferencesState = {
            ...prev,
            dims: nextDims,
            intensities: nextIntensities,
            explicit: nextExplicit,
          };

          const updated = withDerived(candidate, { touch: true });
          if (hydrated) persistAll(updated);
          return updated;
        });
      },

      setPreferences: (next) => {
        setPreferencesState((prev) => {
          const candidate: PreferencesState = {
            ...prev,
            ...(next && typeof next === "object" ? next : {}),
            schema_version: 2,
            dims:
              next && typeof next === "object" && next.dims && typeof next.dims === "object"
                ? { ...prev.dims, ...next.dims }
                : prev.dims,
            intensities:
              next && typeof next === "object" && next.intensities && typeof next.intensities === "object"
                ? { ...prev.intensities, ...next.intensities }
                : prev.intensities,
            explicit:
              next && typeof next === "object" && next.explicit && typeof next.explicit === "object"
                ? { ...prev.explicit, ...next.explicit }
                : prev.explicit,
            safetyMode:
              next && typeof next === "object" && next.safetyMode && typeof next.safetyMode === "object"
                ? { ...prev.safetyMode, ...next.safetyMode }
                : prev.safetyMode,
          };

          const normalized = normalizePreferences(candidate);
          const updated = withDerived(normalized, { touch: true });
          if (hydrated) persistAll(updated);
          return updated;
        });
      },

      resetPreferences: () => {
        const resetState: PreferencesState = {
          ...DEFAULT_V2,
          intensities: { ...BALANCED_VECTOR },
          explicit: { ...DEFAULT_EXPLICIT },
          safetyMode: { ...DEFAULT_SAFETY_MODE },
          has_user_set: false,
          updated_at: null,
        };
        setPreferencesState(resetState);
        if (hydrated) persistAll(resetState);
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
  if (v <= 0) return "Soft";
  if (v === 1) return "Medium";
  if (v === 2) return "Boozy";
  if (v === 3) return "Extra Boozy";
  if (v === 4) return "Spirit-forward";
  return "Extreme";
}

export function levelWordSweetness(v: FlavorLevel) {
  if (v <= 0) return "Dry";
  if (v === 1) return "Semi-sweet";
  if (v === 2) return "Sweet";
  if (v === 3) return "Very Sweet";
  if (v === 4) return "Dessert";
  return "Sugar Rush";
}

export function levelWordBitterness(v: FlavorLevel) {
  if (v <= 0) return "Smooth";
  if (v === 1) return "Slight Bitter";
  if (v === 2) return "Bitter";
  if (v === 3) return "Very Bitter";
  if (v === 4) return "Amaro-heavy";
  return "Punishing";
}

export const DIM_LABELS_V1: Record<FlavorLevelV1, string> = {
  0: "0",
  1: "1",
  2: "2",
  3: "3",
};

export function sliderValueToDimV1(v: number): FlavorLevelV1 {
  if (!Number.isFinite(v)) return 0;
  const r = Math.round(v);
  return clampInt(r, 0, 3) as FlavorLevelV1;
}

export function dimV1ToSliderValue(v: FlavorLevelV1): number {
  return clampInt(Number(v ?? 0), 0, 3);
}

export function buildPreferenceMetaForBackend(prefs: PreferencesState): { explicit: ExplicitDims } {
  return { explicit: prefs.explicit ?? { ...DEFAULT_EXPLICIT } };
}
