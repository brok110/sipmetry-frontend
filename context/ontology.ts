// ---------------------------
// Ingredient -> Flavor ontology
// ---------------------------

export type IngredientKey = string;

export type FlavorLevel = 0 | 1 | 2 | 3;
export type MaybeFlavorLevel = FlavorLevel | null;

export type FlavorKey =
  | "sweetness"
  | "sourness"
  | "bitterness"
  | "alcoholStrength"
  | "aromaIntensity"
  | "herbal"
  | "fruity"
  | "smoky"
  | "body"
  | "fizz"
  | "floral"
  | "spicy";

export type FlavorVector = Record<FlavorKey, MaybeFlavorLevel>;

export const EMPTY_FLAVOR_VECTOR: FlavorVector = {
  sweetness: null,
  sourness: null,
  bitterness: null,
  alcoholStrength: null,
  aromaIntensity: null,
  herbal: null,
  fruity: null,
  smoky: null,
  body: null,
  fizz: null,
  floral: null,
  spicy: null,
};

// Ingredient can define only some dimensions; missing dims are undefined (not present)
export type PartialFlavorVector = Partial<Record<FlavorKey, FlavorLevel>>;

// Optional alias table: normalized ingredient -> canonical key in INGREDIENT_FLAVOR_MAP
const INGREDIENT_ALIASES: Record<IngredientKey, IngredientKey> = {
  // Juice variants
  "lime juice": "lime",
  "lemon juice": "lemon",
  "orange juice": "orange",
  "grapefruit juice": "grapefruit",
  "yuzu juice": "yuzu",

  // Common naming variants
  tonic: "tonic water",
  soda: "soda water",
  "club soda": "soda water",
  "tonic water": "tonic water",
};

// A lightweight, editable mapping table.
// Keys should be normalized (lowercase, trimmed).
export const INGREDIENT_FLAVOR_MAP: Record<IngredientKey, PartialFlavorVector> = {
  // Base spirits (examples)
  gin: { alcoholStrength: 2, aromaIntensity: 2, herbal: 1 },
  vodka: { alcoholStrength: 2, aromaIntensity: 0, body: 1 },
  rum: { alcoholStrength: 2, sweetness: 1, fruity: 1, body: 1 },
  tequila: { alcoholStrength: 2, aromaIntensity: 2, herbal: 1 },
  whiskey: { alcoholStrength: 3, body: 2, aromaIntensity: 2 },
  bourbon: { alcoholStrength: 3, sweetness: 1, body: 2, aromaIntensity: 2 },
  mezcal: { alcoholStrength: 3, smoky: 3, aromaIntensity: 2 },
  brandy: { alcoholStrength: 2, fruity: 1, body: 2 },

  // Citrus / juice (examples)
  lime: { sourness: 3, aromaIntensity: 1 },
  lemon: { sourness: 3, aromaIntensity: 1 },
  orange: { sourness: 1, sweetness: 1, fruity: 2, aromaIntensity: 1 },
  grapefruit: { sourness: 2, bitterness: 1, fruity: 2, aromaIntensity: 1 },
  yuzu: { sourness: 3, aromaIntensity: 2, fruity: 2 },
  umeboshi: { sourness: 3, aromaIntensity: 2, fruity: 1, body: 1 },

  // Sweeteners (examples)
  "simple syrup": { sweetness: 3, body: 1 },
  honey: { sweetness: 3, body: 2, aromaIntensity: 1 },
  "maple syrup": { sweetness: 3, body: 2 },

  // Bitters / modifiers (examples)
  campari: { bitterness: 3, sweetness: 1, aromaIntensity: 2 },
  vermouth: { sweetness: 1, bitterness: 1, aromaIntensity: 2, herbal: 1 },
  "sweet vermouth": { sweetness: 2, bitterness: 1, aromaIntensity: 2, herbal: 1 },
  "dry vermouth": { sweetness: 0, bitterness: 1, aromaIntensity: 2, herbal: 1 },

  // Sparkling (examples)
  "soda water": { fizz: 3, body: 0 },
  "tonic water": { fizz: 3, bitterness: 1, sweetness: 1 },
  "ginger beer": { fizz: 3, spicy: 2, sweetness: 2 },

  // Herbs / garnish-ish (examples)
  mint: { herbal: 3, aromaIntensity: 3 },
  basil: { herbal: 3, aromaIntensity: 2 },
};

function stripEdgeNoise(s: string): string {
  let out = s;

  // 1) normalize whitespace
  out = out.replace(/\s+/g, " ").trim();

  // 2) strip quotes/wrappers at edges
  const EDGE_QUOTES = /^[\s"'“”‘’`]+|[\s"'“”‘’`]+$/g;
  const EDGE_BRACKETS = /^[()\[\]{}<>]+|[()\[\]{}<>]+$/g;

  // 3) strip common punctuation at edges (includes full-width)
  const EDGE_PUNCT = /^[,，、。．.!！?？:：;；]+|[,，、。．.!！?？:：;；]+$/g;

  // Apply multiple passes to handle nested combos like '"umeboshi，"'
  for (let i = 0; i < 5; i++) {
    const next = out
      .replace(EDGE_QUOTES, "")
      .replace(EDGE_BRACKETS, "")
      .replace(EDGE_PUNCT, "")
      .trim();

    if (next === out) break;
    out = next;
  }

  // final whitespace normalize
  out = out.replace(/\s+/g, " ").trim();

  return out;
}

// Normalize free-text ingredient labels into stable keys used in INGREDIENT_FLAVOR_MAP.
export function normalizeIngredientKey(input: string): IngredientKey {
  const base = String(input ?? "").trim().toLowerCase();
  if (!base) return "";
  return stripEdgeNoise(base);
}

function canonicalizeIngredientKey(key: IngredientKey): IngredientKey {
  return INGREDIENT_ALIASES[key] ?? key;
}

// Merge rule: for each dimension, take the max of provided levels.
// If a dimension is never provided by any ingredient, keep it null.
export function aggregateIngredientVectors(
  ingredients: string[],
  map: Record<IngredientKey, PartialFlavorVector> = INGREDIENT_FLAVOR_MAP
): FlavorVector {
  const result: FlavorVector = { ...EMPTY_FLAVOR_VECTOR };

  for (const raw of ingredients) {
    const normalized = normalizeIngredientKey(raw);
    if (!normalized) continue;

    const key = canonicalizeIngredientKey(normalized);
    const partial = map[key];
    if (!partial) continue;

    (Object.keys(partial) as FlavorKey[]).forEach((k) => {
      const v = partial[k];
      if (typeof v !== "number") return;

      const prev = result[k];
      if (prev === null) result[k] = v;
      else result[k] = Math.max(prev, v) as FlavorLevel;
    });
  }

  return result;
}

export function getUnknownIngredients(
  ingredients: string[],
  map: Record<IngredientKey, PartialFlavorVector> = INGREDIENT_FLAVOR_MAP
): IngredientKey[] {
  const unknown = new Set<IngredientKey>();

  for (const raw of ingredients) {
    const normalized = normalizeIngredientKey(raw);
    if (!normalized) continue;

    const key = canonicalizeIngredientKey(normalized);
    if (!map[key]) unknown.add(key);
  }

  return Array.from(unknown).sort();
}