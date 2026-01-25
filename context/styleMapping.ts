// context/styleMapping.ts
// Safe mapping between Tab 0 (StylePreset) and ontology (StyleKey).
// Goals:
// - No `as any`
// - Robust against casing, whitespace, and minor naming variants
// - Stable fallback behavior for older persisted values

import type { StyleKey } from "@/context/ontology";
import type { StylePreset } from "@/context/preferences";

/**
 * Canonical list for StylePreset.
 * Keep this in sync with preferences.tsx StylePreset union.
 */
export const STYLE_PRESET_VALUES = [
  "Clean",
  "Rich",
  "Bitter-forward",
  "Sweet-tooth",
  "Herbal",
  "Fruity",
  "Smoky",
  "Sparkling",
] as const;

export type StylePresetValue = (typeof STYLE_PRESET_VALUES)[number];

const STYLE_PRESET_SET = new Set<string>(STYLE_PRESET_VALUES as unknown as string[]);

/**
 * Normalize any free-text into a canonical key-like string:
 * - trim
 * - collapse whitespace
 * - lower-case
 * - normalize hyphen variants
 */
function normalizeToken(input: unknown): string {
  const s = String(input ?? "").trim();
  if (!s) return "";
  return s
    .replace(/\s+/g, " ")
    .replace(/[‐-‒–—]/g, "-")
    .toLowerCase();
}

/**
 * Map a normalized token to a canonical StylePreset.
 * This is where you can add synonyms safely without touching unions elsewhere.
 */
function tokenToStylePreset(token: string): StylePresetValue | null {
  if (!token) return null;

  // Exact canonical matches (case-insensitive)
  const direct = STYLE_PRESET_VALUES.find((v) => v.toLowerCase() === token);
  if (direct) return direct;

  // Synonyms / common variants (safe to expand over time)
  const aliasTable: Record<string, StylePresetValue> = {
    "clean": "Clean",
    "crisp": "Clean",
    "light": "Clean",

    "rich": "Rich",
    "full": "Rich",
    "full-bodied": "Rich",
    "full bodied": "Rich",

    "bitter-forward": "Bitter-forward",
    "bitter forward": "Bitter-forward",
    "bitterforward": "Bitter-forward",

    "sweet-tooth": "Sweet-tooth",
    "sweet tooth": "Sweet-tooth",
    "sweettooth": "Sweet-tooth",

    "herbal": "Herbal",
    "botanical": "Herbal",

    "fruity": "Fruity",
    "fruit": "Fruity",

    "smoky": "Smoky",
    "smoke": "Smoky",

    "sparkling": "Sparkling",
    "bubbly": "Sparkling",
    "fizzy": "Sparkling",
  };

  return aliasTable[token] ?? null;
}

/**
 * Type guard: is the input a valid StylePresetValue?
 */
export function isStylePresetValue(input: unknown): input is StylePresetValue {
  const s = String(input ?? "");
  return STYLE_PRESET_SET.has(s);
}

/**
 * Coerce unknown value into a valid StylePreset (Tab 0 type).
 * Useful when reading persisted data or accepting input from APIs.
 */
export function coerceStylePreset(
  input: unknown,
  fallback: StylePresetValue = "Clean"
): StylePresetValue {
  const token = normalizeToken(input);
  const mapped = tokenToStylePreset(token);
  return mapped ?? fallback;
}

/**
 * Main mapping: Tab 0 preset -> ontology style key.
 * If you unify ontology StyleKey naming to Tab 0 naming, this is a 1:1 map.
 * Still keep it as a function so future decoupling is painless.
 */
const PRESET_TO_STYLEKEY: Record<StylePresetValue, StyleKey> = {
  "Clean": "Clean",
  "Rich": "Rich",
  "Bitter-forward": "Bitter-forward",
  "Sweet-tooth": "Sweet-tooth",
  "Herbal": "Herbal",
  "Fruity": "Fruity",
  "Smoky": "Smoky",
  "Sparkling": "Sparkling",
};

export function stylePresetToStyleKey(
  preset: StylePreset | null | undefined,
  fallback: StyleKey = "Classic"
): StyleKey {
  const safe = coerceStylePreset(preset, "Clean");
  return PRESET_TO_STYLEKEY[safe] ?? fallback;
}

/**
 * Optional: mapping the other direction (useful if later you want ontology-driven suggestions in UI).
 */
const STYLEKEY_TO_PRESET: Partial<Record<StyleKey, StylePresetValue>> = {
  "Clean": "Clean",
  "Rich": "Rich",
  "Bitter-forward": "Bitter-forward",
  "Sweet-tooth": "Sweet-tooth",
  "Herbal": "Herbal",
  "Fruity": "Fruity",
  "Smoky": "Smoky",
  "Sparkling": "Sparkling",
};

export function styleKeyToStylePreset(
  key: StyleKey | null | undefined,
  fallback: StylePresetValue = "Clean"
): StylePresetValue {
  if (!key) return fallback;
  return STYLEKEY_TO_PRESET[key] ?? fallback;
}