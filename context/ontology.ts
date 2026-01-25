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
export type StrictFlavorVector = Record<FlavorKey, FlavorLevel>;

export const FLAVOR_KEYS: FlavorKey[] = [
  "sweetness",
  "sourness",
  "bitterness",
  "alcoholStrength",
  "aromaIntensity",
  "herbal",
  "fruity",
  "smoky",
  "body",
  "fizz",
  "floral",
  "spicy",
];

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

export type PartialFlavorVector = Partial<Record<FlavorKey, FlavorLevel>>;

const INGREDIENT_ALIASES: Record<IngredientKey, IngredientKey> = {
  "lime juice": "lime",
  "lemon juice": "lemon",
  "orange juice": "orange",
  "grapefruit juice": "grapefruit",
  "yuzu juice": "yuzu",

  tonic: "tonic water",
  soda: "soda water",
  "club soda": "soda water",
  "tonic water": "tonic water",

  kahlua: "coffee liqueur",
  "kahlúa": "coffee liqueur",
  "coffee liqueur": "coffee liqueur",

  "bourbon whiskey": "bourbon",
};

export const INGREDIENT_FLAVOR_MAP: Record<IngredientKey, PartialFlavorVector> = {
  gin: { alcoholStrength: 2, aromaIntensity: 2, herbal: 1 },
  vodka: { alcoholStrength: 2, aromaIntensity: 0, body: 1 },
  rum: { alcoholStrength: 2, sweetness: 1, fruity: 1, body: 1 },
  tequila: { alcoholStrength: 2, aromaIntensity: 2, herbal: 1 },
  whiskey: { alcoholStrength: 3, body: 2, aromaIntensity: 2 },
  bourbon: { alcoholStrength: 3, sweetness: 1, body: 2, aromaIntensity: 2 },
  mezcal: { alcoholStrength: 3, smoky: 3, aromaIntensity: 2 },
  brandy: { alcoholStrength: 2, fruity: 1, body: 2 },

  lime: { sourness: 3, aromaIntensity: 1 },
  lemon: { sourness: 3, aromaIntensity: 1 },
  orange: { sourness: 1, sweetness: 1, fruity: 2, aromaIntensity: 1 },
  grapefruit: { sourness: 2, bitterness: 1, fruity: 2, aromaIntensity: 1 },
  yuzu: { sourness: 3, aromaIntensity: 2, fruity: 2 },
  umeboshi: { sourness: 3, aromaIntensity: 2, fruity: 1, body: 1 },

  "simple syrup": { sweetness: 3, body: 1 },
  honey: { sweetness: 3, body: 2, aromaIntensity: 1 },
  "maple syrup": { sweetness: 3, body: 2 },

  campari: { bitterness: 3, sweetness: 1, aromaIntensity: 2 },
  vermouth: { sweetness: 1, bitterness: 1, aromaIntensity: 2, herbal: 1 },
  "sweet vermouth": { sweetness: 2, bitterness: 1, aromaIntensity: 2, herbal: 1 },
  "dry vermouth": { sweetness: 0, bitterness: 1, aromaIntensity: 2, herbal: 1 },

  "coffee liqueur": {
    sweetness: 2,
    bitterness: 1,
    aromaIntensity: 2,
    body: 1,
    alcoholStrength: 1,
  },

  "soda water": { fizz: 3, body: 0 },
  "tonic water": { fizz: 3, bitterness: 1, sweetness: 1 },
  "ginger beer": { fizz: 3, spicy: 2, sweetness: 2 },

  mint: { herbal: 3, aromaIntensity: 3 },
  basil: { herbal: 3, aromaIntensity: 2 },
};

function stripEdgeNoise(s: string): string {
  let out = s;
  out = out.replace(/\s+/g, " ").trim();

  const EDGE_QUOTES = /^[\s"'“”‘’`]+|[\s"'“”‘’`]+$/g;
  const EDGE_BRACKETS = /^[()\[\]{}<>]+|[()\[\]{}<>]+$/g;
  const EDGE_PUNCT = /^[,，、。．.!！?？:：;；]+|[,，、。．.!！?？:：;；]+$/g;

  for (let i = 0; i < 5; i++) {
    const next = out
      .replace(EDGE_QUOTES, "")
      .replace(EDGE_BRACKETS, "")
      .replace(EDGE_PUNCT, "")
      .trim();
    if (next === out) break;
    out = next;
  }

  out = out.replace(/\s+/g, " ").trim();
  return out;
}

export function normalizeIngredientKey(input: string): IngredientKey {
  const base = String(input ?? "").trim().toLowerCase();
  if (!base) return "";
  return stripEdgeNoise(base);
}

function canonicalizeIngredientKey(key: IngredientKey): IngredientKey {
  return INGREDIENT_ALIASES[key] ?? key;
}

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

export type PreferencePreset = "Balanced" | "Boozy" | "Citrus" | "Herbal" | "Sweet";

export const PRESET_VECTORS: Record<PreferencePreset, StrictFlavorVector> = {
  Balanced: {
    sweetness: 1,
    sourness: 1,
    bitterness: 1,
    alcoholStrength: 1,
    aromaIntensity: 1,
    herbal: 1,
    fruity: 1,
    smoky: 0,
    body: 1,
    fizz: 0,
    floral: 0,
    spicy: 0,
  },
  Boozy: {
    sweetness: 0,
    sourness: 0,
    bitterness: 1,
    alcoholStrength: 3,
    aromaIntensity: 1,
    herbal: 0,
    fruity: 0,
    smoky: 0,
    body: 2,
    fizz: 0,
    floral: 0,
    spicy: 0,
  },
  Citrus: {
    sweetness: 0,
    sourness: 3,
    bitterness: 0,
    alcoholStrength: 1,
    aromaIntensity: 2,
    herbal: 0,
    fruity: 2,
    smoky: 0,
    body: 0,
    fizz: 0,
    floral: 0,
    spicy: 0,
  },
  Herbal: {
    sweetness: 0,
    sourness: 0,
    bitterness: 1,
    alcoholStrength: 1,
    aromaIntensity: 2,
    herbal: 3,
    fruity: 0,
    smoky: 0,
    body: 1,
    fizz: 0,
    floral: 1,
    spicy: 0,
  },
  Sweet: {
    sweetness: 3,
    sourness: 0,
    bitterness: 0,
    alcoholStrength: 1,
    aromaIntensity: 1,
    herbal: 0,
    fruity: 1,
    smoky: 0,
    body: 2,
    fizz: 0,
    floral: 0,
    spicy: 0,
  },
};

export type FlavorWeights = Record<FlavorKey, number>;

export const DEFAULT_FLAVOR_WEIGHTS: FlavorWeights = {
  sweetness: 1,
  sourness: 1,
  bitterness: 1,
  alcoholStrength: 1.2,
  aromaIntensity: 1.1,
  herbal: 1,
  fruity: 1,
  smoky: 0.9,
  body: 1,
  fizz: 0.9,
  floral: 0.9,
  spicy: 0.9,
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export type FlavorComparisonRow = {
  key: FlavorKey;
  recipe: MaybeFlavorLevel;
  user: MaybeFlavorLevel;
  delta: number | null;
  absDelta: number | null;
  weight: number;
  contribution: number;
  maxContribution: number;
  note: string;
};

export type FlavorComparisonResult = {
  rows: FlavorComparisonRow[];
  score100: number;
  sum: number;
  max: number;
  topGaps: FlavorComparisonRow[];
  topContrib: FlavorComparisonRow[];
};

export function compareFlavorVectors(
  recipeVector: FlavorVector,
  userVector: FlavorVector,
  weights: FlavorWeights = DEFAULT_FLAVOR_WEIGHTS
): FlavorComparisonResult {
  const rows: FlavorComparisonRow[] = FLAVOR_KEYS.map((k) => {
    const r = recipeVector?.[k] ?? null;
    const u = userVector?.[k] ?? null;
    const w = typeof weights[k] === "number" ? weights[k] : 1;

    if (r === null || u === null) {
      return {
        key: k,
        recipe: r,
        user: u,
        delta: null,
        absDelta: null,
        weight: w,
        contribution: 0,
        maxContribution: 0,
        note: r === null && u === null ? "both null" : r === null ? "recipe null" : "user null",
      };
    }

    const delta = u - r;
    const absDelta = Math.abs(delta);

    const closeness = Math.max(0, 3 - absDelta);
    const contribution = closeness * w;
    const maxContribution = 3 * w;

    return {
      key: k,
      recipe: r,
      user: u,
      delta,
      absDelta,
      weight: w,
      contribution,
      maxContribution,
      note: "",
    };
  });

  const sum = rows.reduce(
    (acc, x) => acc + (Number.isFinite(x.contribution) ? x.contribution : 0),
    0
  );
  const max = rows.reduce(
    (acc, x) => acc + (Number.isFinite(x.maxContribution) ? x.maxContribution : 0),
    0
  );

  const score01 = max > 0 ? clamp01(sum / max) : 0;
  const score100 = Math.round(score01 * 100);

  const topGaps = [...rows]
    .filter((x) => typeof x.absDelta === "number")
    .sort((a, b) => (b.absDelta as number) - (a.absDelta as number))
    .slice(0, 4);

  const topContrib = [...rows]
    .filter((x) => x.maxContribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 4);

  return { rows, score100, sum, max, topGaps, topContrib };
}

export type StyleKey =
  | "Clean"
  | "Rich"
  | "Bitter-forward"
  | "Sweet-tooth"
  | "Herbal"
  | "Fruity"
  | "Smoky"
  | "Sparkling"
  | "Classic";

export const STYLE_LABELS: Record<StyleKey, string> = {
  Clean: "Clean",
  Rich: "Rich",
  "Bitter-forward": "Bitter-forward",
  "Sweet-tooth": "Sweet-tooth",
  Herbal: "Herbal",
  Fruity: "Fruity",
  Smoky: "Smoky",
  Sparkling: "Sparkling",
  Classic: "Classic",
};

export type PickStyleResult = {
  style: StyleKey;
  label: string;
  bestScore: number;
  scores: Record<StyleKey, number | null>;
  tieBroken: boolean;
};

function num(v: MaybeFlavorLevel): number | null {
  return typeof v === "number" ? v : null;
}

function hasAny(...xs: Array<number | null>): boolean {
  return xs.some((x) => typeof x === "number" && Number.isFinite(x));
}

export function scoreStyles(v: FlavorVector): Record<StyleKey, number | null> {
  const sweet = num(v.sweetness);
  const sour = num(v.sourness);
  const bitter = num(v.bitterness);
  const alcohol = num(v.alcoholStrength);
  const aroma = num(v.aromaIntensity);
  const herbal = num(v.herbal);
  const fruity = num(v.fruity);
  const smoky = num(v.smoky);
  const body = num(v.body);
  const fizz = num(v.fizz);

  const clean = hasAny(sour, fizz, aroma, body, smoky, bitter)
    ? (sour !== null ? 1.0 * sour : 0) +
      (fizz !== null ? 0.6 * fizz : 0) +
      (aroma !== null ? 0.3 * aroma : 0) -
      (body !== null ? 0.4 * body : 0) -
      (smoky !== null ? 0.8 * smoky : 0) -
      (bitter !== null ? 0.2 * bitter : 0)
    : null;

  const rich =
    body !== null
      ? 1.0 * body + (alcohol !== null ? 0.3 * alcohol : 0) + (fizz !== null ? -0.5 * fizz : 0)
      : null;

  const bitterForward =
    bitter !== null
      ? 1.0 * bitter +
        (aroma !== null ? 0.2 * aroma : 0) +
        (herbal !== null ? 0.2 * herbal : 0) +
        (sweet !== null ? -0.3 * sweet : 0)
      : null;

  const sweetTooth =
    sweet !== null
      ? 1.0 * sweet +
        (body !== null ? 0.2 * body : 0) +
        (fruity !== null ? 0.1 * fruity : 0) +
        (bitter !== null ? -0.2 * bitter : 0)
      : null;

  const herbalStyle = herbal !== null ? 1.0 * herbal + (aroma !== null ? 0.2 * aroma : 0) : null;
  const fruityStyle = fruity !== null ? 1.0 * fruity + (aroma !== null ? 0.2 * aroma : 0) : null;
  const smokyStyle = smoky !== null ? 1.2 * smoky + (aroma !== null ? 0.1 * aroma : 0) : null;
  const sparkling = fizz !== null ? 1.0 * fizz : null;

  return {
    Clean: clean,
    Rich: rich,
    "Bitter-forward": bitterForward,
    "Sweet-tooth": sweetTooth,
    Herbal: herbalStyle,
    Fruity: fruityStyle,
    Smoky: smokyStyle,
    Sparkling: sparkling,
    Classic: null,
  };
}

function pickBestStyle(
  scores: Record<StyleKey, number | null>
): { key: StyleKey; score: number } | null {
  const candidates: Array<{ key: StyleKey; score: number }> = [];

  (Object.keys(scores) as StyleKey[]).forEach((k) => {
    if (k === "Classic") return;
    const s = scores[k];
    if (typeof s === "number" && Number.isFinite(s)) candidates.push({ key: k, score: s });
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

function tieBreak(
  top1: { key: StyleKey; score: number },
  top2: { key: StyleKey; score: number },
  v: FlavorVector
): { chosen: StyleKey; tieBroken: boolean } {
  const a = top1.key;
  const b = top2.key;

  const sweet = num(v.sweetness) ?? 0;
  const sour = num(v.sourness) ?? 0;
  const bitter = num(v.bitterness) ?? 0;
  const alcohol = num(v.alcoholStrength) ?? 0;
  const body = num(v.body) ?? 0;
  const fizz = num(v.fizz) ?? 0;
  const herbal = num(v.herbal) ?? 0;
  const fruity = num(v.fruity) ?? 0;

  if ((a === "Rich" && b === "Sparkling") || (a === "Sparkling" && b === "Rich")) {
    const chosen = body >= 2 || alcohol >= 2 ? "Rich" : "Sparkling";
    return { chosen, tieBroken: true };
  }

  if (
    (a === "Bitter-forward" && b === "Sweet-tooth") ||
    (a === "Sweet-tooth" && b === "Bitter-forward")
  ) {
    const chosen = bitter >= sweet ? "Bitter-forward" : "Sweet-tooth";
    return { chosen, tieBroken: true };
  }

  if ((a === "Clean" && b === "Rich") || (a === "Rich" && b === "Clean")) {
    const chosen = (fizz >= 1 || sour >= 2) && body <= 1 ? "Clean" : "Rich";
    return { chosen, tieBroken: true };
  }

  if ((a === "Clean" && b === "Sparkling") || (a === "Sparkling" && b === "Clean")) {
    const chosen = fizz >= 2 ? "Sparkling" : "Clean";
    return { chosen, tieBroken: true };
  }

  if ((a === "Herbal" && b === "Fruity") || (a === "Fruity" && b === "Herbal")) {
    const chosen = herbal >= fruity ? "Herbal" : "Fruity";
    return { chosen, tieBroken: true };
  }

  return { chosen: top1.key, tieBroken: false };
}

export function pickStyleWord(
  v: FlavorVector,
  opts?: { minScore?: number; tieThreshold?: number }
): PickStyleResult {
  const minScore = typeof opts?.minScore === "number" ? opts.minScore : 2.0;
  const tieThreshold = typeof opts?.tieThreshold === "number" ? opts.tieThreshold : 0.4;

  const scores = scoreStyles(v);
  const best = pickBestStyle(scores);

  if (!best || best.score < minScore) {
    return {
      style: "Classic",
      label: STYLE_LABELS.Classic,
      bestScore: best?.score ?? 0,
      scores,
      tieBroken: false,
    };
  }

  const sorted: Array<{ key: StyleKey; score: number }> = [];
  (Object.keys(scores) as StyleKey[]).forEach((k) => {
    if (k === "Classic") return;
    const s = scores[k];
    if (typeof s === "number" && Number.isFinite(s)) sorted.push({ key: k, score: s });
  });
  sorted.sort((a, b) => b.score - a.score);

  const top1 = sorted[0];
  const top2 = sorted.length > 1 ? sorted[1] : null;

  if (top2 && Math.abs(top1.score - top2.score) <= tieThreshold) {
    const tb = tieBreak(top1, top2, v);
    return {
      style: tb.chosen,
      label: STYLE_LABELS[tb.chosen],
      bestScore: top1.score,
      scores,
      tieBroken: tb.tieBroken,
    };
  }

  return {
    style: top1.key,
    label: STYLE_LABELS[top1.key],
    bestScore: top1.score,
    scores,
    tieBroken: false,
  };
}

const LEVEL_WORDS: Record<
  "alcoholStrength" | "sweetness" | "bitterness",
  Record<FlavorLevel, string>
> = {
  alcoholStrength: {
    0: "Soft",
    1: "Medium",
    2: "Boozy",
    3: "Extra Boozy",
  },
  sweetness: {
    0: "Dry",
    1: "Semi-sweet",
    2: "Sweet",
    3: "Very Sweet",
  },
  bitterness: {
    0: "Smooth",
    1: "Slight Bitter",
    2: "Bitter",
    3: "Very Bitter",
  },
};

export type FourWordDescriptor = {
  style: string;
  alcoholStrength?: string;
  sweetness?: string;
  bitterness?: string;
  words: string[];
  debug: {
    styleKey: StyleKey;
    styleScores: Record<StyleKey, number | null>;
    tieBroken: boolean;
  };
};

export function buildFourWordDescriptor(v: FlavorVector): FourWordDescriptor {
  const picked = pickStyleWord(v);

  const a = v.alcoholStrength;
  const s = v.sweetness;
  const b = v.bitterness;

  const words: string[] = [];
  words.push(picked.label);

  const out: FourWordDescriptor = {
    style: picked.label,
    words,
    debug: {
      styleKey: picked.style,
      styleScores: picked.scores,
      tieBroken: picked.tieBroken,
    },
  };

  if (typeof a === "number") {
    const w = LEVEL_WORDS.alcoholStrength[a];
    out.alcoholStrength = w;
    words.push(w);
  }
  if (typeof s === "number") {
    const w = LEVEL_WORDS.sweetness[s];
    out.sweetness = w;
    words.push(w);
  }
  if (typeof b === "number") {
    const w = LEVEL_WORDS.bitterness[b];
    out.bitterness = w;
    words.push(w);
  }

  out.words = words.slice(0, 4);
  return out;
}