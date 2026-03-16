import AddToInventoryModal from "@/components/AddToInventoryModal";
import { useAuth } from "@/context/auth";
import { useFavorites } from "@/context/favorites";
import { useFeedback } from "@/context/feedback";
import { useInventory } from "@/context/inventory";
import { useLearnedPreferences } from "@/context/learnedPreferences";
import {
  aggregateIngredientVectors,
  getUnknownIngredients,
  normalizeIngredientKey,
} from "@/context/ontology";
import { usePreferences as usePreferencesContext } from "@/context/preferences";
import { useTokens, Feature } from "@/context/tokens";
import * as Clipboard from "expo-clipboard";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Dimensions,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

type Safety = {
  non_consumable_items: string[];
  risk_level: "none" | "possible" | "high";
  message: string;
};

type ClassicItem = {
  iba_code: string;
  name: string;
  iba_category?: string;
  missing_count: number;
  total_ings: number;
  missing_items?: string[];
  bucket?: "ready" | "one_missing" | "two_missing";
  overlap_count?: number;
  overlap_hits?: string[];
  ingredient_keys?: string[];
  reasons?: string[];
  recipe_key?: string;
  recipe_hash?: string;
  recipe_vec?: Record<string, any> | null;
  score_breakdown?: {
    overlap_score?: number;
    missing_penalty?: number;
    preference_delta?: number;
    total_score?: number;
  };
  alcohol_safety_warning?: boolean;
  alcohol_safety_message?: string;
  alcohol_strength_score?: number | null;
  alcohol_warning?: boolean;
  allergen_warning?: boolean;
  allergen_types?: string[];
  caffeine_warning?: boolean;
  caffeine_sources?: string[];
};

type SectionTone = "ready" | "one_missing" | "two_missing";

type AnalyzeImageResponse = {
  ingredients?: string[];
  ingredients_raw?: string[];
  ingredients_display?: string[];
  detected_items?: Array<{
    raw?: string;
    canonical?: string;
    match?: string;
    display?: string;
    raw_display?: string;
    text?: string;
    label?: string;
  }>;
  safety?: Safety;
  alias?: { loaded_at: string | null; count: number };
};

type CanonicalizeResponse = {
  raw?: string;
  canonical?: string;
  alias?: { loaded_at: string | null; count: number };
};

type DbRecipe = {
  iba_code: string;
  name: string;
  iba_category?: string | null;
  method?: string | null;
  glass?: string | null;
  instructions?: string | null;
  is_published?: boolean;
  ingredients: Array<{
    sort_order: number;
    item: string;
    amount_ml: string | null;
    amount_text: string | null;
    unit: string | null;
    is_optional: boolean;
  }>;
};

type ActiveIngredient = {
  id: string;
  display: string;
  canonical: string;
  isUserAdded: boolean;
};

function dedupeCaseInsensitive(list: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function cleanStringList(list: any): string[] {
  if (!Array.isArray(list)) return [];
  return list.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function extractAnalyzeLists(resp: any): { display: string[]; canonical: string[] } {
  const r: any = resp && typeof resp === "object" ? resp : {};

  const displayFromTop =
    (cleanStringList(r.ingredients_display).length > 0
      ? cleanStringList(r.ingredients_display)
      : cleanStringList(r.ingredientsDisplay).length > 0
      ? cleanStringList(r.ingredientsDisplay)
      : []) || [];

  const detected: any[] = Array.isArray(r.detected_items)
    ? r.detected_items
    : Array.isArray(r.detectedItems)
    ? r.detectedItems
    : [];

  const displayFromDetected = detected
    .map((it) => {
      const v =
        it?.display ??
        it?.raw_display ??
        it?.rawDisplay ??
        it?.raw ??
        it?.text ??
        it?.label;
      return String(v ?? "").trim();
    })
    .filter(Boolean);

  const displayFromRaw =
    cleanStringList(r.ingredients_raw).length > 0
      ? cleanStringList(r.ingredients_raw)
      : cleanStringList(r.ingredientsRaw).length > 0
      ? cleanStringList(r.ingredientsRaw)
      : [];

  const canonicalFromDetected = detected
    .map((it) => String(it?.canonical ?? "").trim())
    .filter(Boolean);

  const canonicalFromTop = cleanStringList(r.ingredients);

  const display = dedupeCaseInsensitive(
    (displayFromTop.length > 0
      ? displayFromTop
      : displayFromDetected.length > 0
      ? displayFromDetected
      : displayFromRaw.length > 0
      ? displayFromRaw
      : canonicalFromTop) as string[]
  );

  const canonical = dedupeCaseInsensitive(
    (canonicalFromDetected.length > 0 ? canonicalFromDetected : canonicalFromTop) as string[]
  );

  return { display, canonical };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function canonicalizeForRecommendation(value: string): string {
  return String(normalizeIngredientKey(String(value ?? "").trim()) || "").trim();
}

function getAlcoholStrengthScoreForRecipe(result: any): number | null {
  const recipeVec =
    result?.recipe_vec && typeof result.recipe_vec === "object"
      ? result.recipe_vec
      : result?.recipeVec && typeof result.recipeVec === "object"
      ? result.recipeVec
      : null;

  const alcoholFromVec = recipeVec ? Number((recipeVec as any).alcoholStrength) : NaN;
  if (Number.isFinite(alcoholFromVec)) {
    return alcoholFromVec;
  }

  const ingredientKeys = getCanonicalIngredientKeysForResult(result);

  if (ingredientKeys.length === 0) {
    return null;
  }

  const fallbackVec = aggregateIngredientVectors(ingredientKeys);
  const fallbackAlcohol = Number((fallbackVec as any)?.alcoholStrength);
  return Number.isFinite(fallbackAlcohol) ? fallbackAlcohol : null;
}

function getAlcoholSafetyForRecipe(result: any): {
  alcohol_safety_warning: boolean;
  alcohol_safety_message?: string;
  alcohol_strength_score: number | null;
} {
  const score = getAlcoholStrengthScoreForRecipe(result);

  return {
    alcohol_safety_warning: score !== null && score >= 4.5,
    alcohol_safety_message: score !== null && score >= 4.5 ? "Very high alcohol strength." : undefined,
    alcohol_strength_score: score,
  };
}

function getCanonicalIngredientKeysForResult(result: any): string[] {
  return Array.isArray(result?.ingredient_keys)
    ? dedupeCaseInsensitive(
        result.ingredient_keys
          .map((x: any) => canonicalizeForRecommendation(String(x ?? "")))
          .filter(Boolean)
      )
    : [];
}

function getAllergenSafetyForRecipe(result: any): {
  allergen_warning: boolean;
  allergen_types: string[];
} {
  const ingredientKeys = getCanonicalIngredientKeysForResult(result);
  const allergens = new Set<string>();

  for (const key of ingredientKeys) {
    const normalized = String(key ?? "").trim().toLowerCase();
    if (!normalized) continue;

    if (normalized === "egg_white" || normalized === "egg" || normalized.includes("egg_")) {
      allergens.add("egg");
    }

    if (
      normalized === "milk" ||
      normalized === "cream" ||
      normalized.includes("cream") ||
      normalized.includes("milk")
    ) {
      allergens.add("milk");
    }

    if (
      normalized === "orgeat" ||
      normalized === "almond" ||
      normalized.includes("almond") ||
      normalized.includes("orgeat")
    ) {
      allergens.add("almond");
    }

    if (
      normalized === "beer" ||
      normalized.includes("beer") ||
      normalized.includes("ale") ||
      normalized.includes("lager") ||
      normalized.includes("stout") ||
      normalized.includes("porter") ||
      normalized.includes("wheat_beer") ||
      normalized.includes("malt")
    ) {
      allergens.add("gluten");
    }
  }

  const allergen_types = [...allergens].sort((a, b) => a.localeCompare(b));
  return {
    allergen_warning: allergen_types.length > 0,
    allergen_types,
  };
}

function getCaffeineSafetyForRecipe(result: any): {
  caffeine_warning: boolean;
  caffeine_sources: string[];
} {
  const ingredientKeys = getCanonicalIngredientKeysForResult(result);
  const alcoholStrengthScore = getAlcoholStrengthScoreForRecipe(result);
  const caffeineSources = new Set<string>();

  for (const key of ingredientKeys) {
    const normalized = String(key ?? "").trim().toLowerCase();
    if (!normalized) continue;

    if (normalized === "coffee" || normalized.includes("coffee")) {
      caffeineSources.add("coffee");
    }
    if (normalized === "espresso" || normalized.includes("espresso")) {
      caffeineSources.add("espresso");
    }
    if (normalized === "cold_brew" || normalized.includes("cold_brew")) {
      caffeineSources.add("cold_brew");
    }
    if (normalized === "caffeine" || normalized.includes("caffeine")) {
      caffeineSources.add("caffeine");
    }
    if (normalized === "energy_drink" || normalized.includes("energy_drink")) {
      caffeineSources.add("energy_drink");
    }
    if (normalized === "cola" || normalized.includes("cola")) {
      caffeineSources.add("cola");
    }
  }

  const caffeine_sources = [...caffeineSources].sort((a, b) => a.localeCompare(b));
  return {
    caffeine_warning: caffeine_sources.length > 0 && alcoholStrengthScore !== null && alcoholStrengthScore > 0,
    caffeine_sources,
  };
}

function evaluateRecipeSafety(result: any): {
  alcohol_warning: boolean;
  alcohol_strength_score: number | null;
  allergen_warning: boolean;
  allergen_types: string[];
  caffeine_warning: boolean;
  caffeine_sources: string[];
} {
  const alcoholSafety = getAlcoholSafetyForRecipe(result);
  const allergenSafety = getAllergenSafetyForRecipe(result);
  const caffeineSafety = getCaffeineSafetyForRecipe(result);

  return {
    alcohol_warning: alcoholSafety.alcohol_safety_warning,
    alcohol_strength_score: alcoholSafety.alcohol_strength_score,
    allergen_warning: allergenSafety.allergen_warning,
    allergen_types: allergenSafety.allergen_types,
    caffeine_warning: caffeineSafety.caffeine_warning,
    caffeine_sources: caffeineSafety.caffeine_sources,
  };
}

function normalizeVector05(vec: any): Record<string, number | null> | null {
  if (!vec || typeof vec !== "object") return null;
  const out: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(vec)) {
    if (v === null || v === undefined) {
      out[k] = null;
      continue;
    }
    const n = Number(v);
    out[k] = Number.isFinite(n) ? clamp(n, 0, 5) : null;
  }
  return out;
}


function inferIbaCodeFromAny(obj: any): string {
  const fromField = typeof obj?.iba_code === "string" ? String(obj.iba_code).trim() : "";
  if (fromField) return fromField;

  const fromRecipe = typeof obj?.recipe?.iba_code === "string" ? String(obj.recipe.iba_code).trim() : "";
  if (fromRecipe) return fromRecipe;

  return "";
}

function maybeParseCodeFromRecipeKey(recipeKey: string): string {
  const k = String(recipeKey || "").trim();
  if (!k) return "";
  const prefix = k.split("-")[0]?.trim() ?? "";
  if (!prefix) return "";
  if (/^[A-Za-z0-9_]+$/.test(prefix) && prefix.length <= 24) return prefix;
  return "";
}

function inferCanonicalFromDisplay(display: string): string {
  const s = String(display || "").toLowerCase();

  if (/(^|\b)vodka(\b|$)/.test(s)) return "vodka";
  if (/(^|\b)gin(\b|$)/.test(s)) return "gin";
  if (/(^|\b)tequila(\b|$)/.test(s) || /100%\s*agave/.test(s)) return "tequila";
  if (/(^|\b)rum(\b|$)/.test(s)) return "rum";
  if (/(^|\b)whiskey(\b|$)/.test(s) || /whisky/.test(s)) return "whiskey";
  if (/(^|\b)bourbon(\b|$)/.test(s)) return "bourbon";
  if (/(^|\b)rye(\b|$)/.test(s)) return "rye";
  if (/(^|\b)scotch(\b|$)/.test(s)) return "scotch";
  if (/(^|\b)brandy(\b|$)/.test(s)) return "brandy";
  if (/(^|\b)cognac(\b|$)/.test(s)) return "cognac";
  if (/(^|\b)vermouth(\b|$)/.test(s)) return "vermouth";

  return "";
}

function buildActiveIngredientsFromAnalyze(data: AnalyzeImageResponse): ActiveIngredient[] {
  const detected: any[] = Array.isArray((data as any)?.detected_items)
    ? ((data as any).detected_items as any[])
    : Array.isArray((data as any)?.detectedItems)
    ? ((data as any).detectedItems as any[])
    : [];

  const fromDetected: ActiveIngredient[] = detected
    .map((it, idx) => {
      const display = String(
        it?.display ?? it?.raw_display ?? it?.rawDisplay ?? it?.raw ?? it?.text ?? it?.label ?? ""
      ).trim();
      const canonicalRaw = String(it?.canonical ?? "").trim();
      const canonical = String(normalizeIngredientKey(canonicalRaw) || "").trim();
      if (!display && !canonical) return null;
      return {
        id: `scan-${idx}-${display || canonical}`,
        display: display || canonical || "(unknown)",
        canonical,
        isUserAdded: false,
      } as ActiveIngredient;
    })
    .filter(Boolean) as ActiveIngredient[];

  if (fromDetected.length > 0) return fromDetected;

  const lists = extractAnalyzeLists(data as any);
  const displayList = lists.display;
  const canonicalList = lists.canonical.map((x) => String(normalizeIngredientKey(x) || "").trim());

  const out: ActiveIngredient[] = [];
  const n = Math.max(displayList.length, canonicalList.length);

  for (let i = 0; i < n; i++) {
    const display = String(displayList[i] ?? "").trim();
    const canonical = String(canonicalList[i] ?? "").trim();
    const chosenDisplay = display || canonical;
    if (!chosenDisplay) continue;

    out.push({
      id: `scan-${i}-${chosenDisplay}`,
      display: chosenDisplay,
      canonical,
      isUserAdded: false,
    });
  }

  return out;
}

export default function TabOneScreen() {
  const [activeIngredients, setActiveIngredients] = useState<ActiveIngredient[]>([]);

  const activeCanonical = useMemo(() => {
    const list = activeIngredients
      .map((x) => String(x?.canonical ?? "").trim())
      .filter(Boolean)
      .map((x) => String(normalizeIngredientKey(x) || "").trim())
      .filter(Boolean);
    return dedupeCaseInsensitive(list);
  }, [activeIngredients]);

  const activeDisplay = useMemo(() => {
    return activeIngredients.map((x) => String(x?.display ?? "").trim()).filter(Boolean);
  }, [activeIngredients]);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [pickedBase64, setPickedBase64] = useState<string | null>(null);
  const [lastUploadInfo, setLastUploadInfo] = useState<{
    stage: string;
    base64_chars: number;
    width?: number;
    height?: number;
  } | null>(null);
  const [lastHttpStatus, setLastHttpStatus] = useState<number | null>(null);
  const [lastAnalyzeResponseText, setLastAnalyzeResponseText] = useState<string | null>(null);
  const [lastAnalyzeResponseJson, setLastAnalyzeResponseJson] = useState<any | null>(null);
  const [lastRecommendHttpStatus, setLastRecommendHttpStatus] = useState<number | null>(null);
  const [lastRecommendResponseJson, setLastRecommendResponseJson] = useState<any | null>(null);

  const flavorVector = useMemo(() => {
    return aggregateIngredientVectors(activeCanonical);
  }, [activeCanonical]);

  const unknownIngredients = useMemo(() => {
    const keys = dedupeCaseInsensitive(
      (activeCanonical || [])
        .map((x) => String(x ?? "").trim().toLowerCase())
        .filter(Boolean)
    );
    return getUnknownIngredients(keys);
  }, [activeCanonical]);

  const [recipes, setRecipes] = useState<ClassicItem[]>([]);
  const [recipesStale, setRecipesStale] = useState(false);
  const [recipesStaleReason, setRecipesStaleReason] = useState<"ingredients" | "preferences" | "mood" | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Stage 7: Mood selector
  type MoodOption = "chill" | "party" | "date_night" | "solo";
  const [selectedMood, setSelectedMood] = useState<MoodOption | null>(null);
  const lastRecommendMoodRef = React.useRef<MoodOption | null>(null);

  // Stage 10: Flavor Explorer
  type ExploreItem = {
    iba_code: string;
    name: string;
    iba_category?: string;
    missing_count: number;
    total_ings: number;
    overlap_count?: number;
    overlap_hits?: string[];
    ingredient_keys?: string[];
    missing_items?: string[];
    explore_score: number;
    explore_dims?: { dim: string; user_avg: number; recipe: number; diff: number; contribution: number }[];
    reasons?: string[];
    bucket?: "ready" | "one_missing";
  };
  const [exploreResults, setExploreResults] = useState<ExploreItem[]>([]);
  const [exploreMeta, setExploreMeta] = useState<any>(null);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [showExplore, setShowExplore] = useState(false);

  const appLocale = useMemo(() => {
    try {
      const l = Intl.DateTimeFormat().resolvedOptions().locale;
      return String(l || "en");
    } catch {
      return "en";
    }
  }, []);

  const isZh = useMemo(() => String(appLocale).toLowerCase().startsWith("zh"), [appLocale]);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<"idle" | "identifying ingredients" | "generating">("idle");
  const [error, setError] = useState<string | null>(null);
  const [safety, setSafety] = useState<Safety | null>(null);

  const [newIngredient, setNewIngredient] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  // Inventory Modal state
  const [inventoryModalTarget, setInventoryModalTarget] = useState<ActiveIngredient | null>(null);
  const { session } = useAuth();
  const { availableIngredientKeys, initialized: inventoryInitialized, refreshInventory, addInventoryItem } = useInventory();
  const [pendingScrollIndex, setPendingScrollIndex] = useState<number | null>(null);

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const feedback = useFeedback() as any;
  const ratingsByKey: Record<string, "like" | "dislike"> =
    feedback?.ratingsByKey ?? feedback?.ratings ?? {};
  const ratingMetaByKey: Record<string, any> = feedback?.ratingMetaByKey ?? {};

  const { favoritesByKey } = useFavorites();
  const { isUnlocked, spend: spendToken, earn: earnToken, costs: unlockCosts, balance: tokenBalance } = useTokens();

  const API_URL = useMemo(() => process.env.EXPO_PUBLIC_API_URL, []);

  const [hasRecommended, setHasRecommended] = useState(false);
  const [hasRecommendedLocal, setHasRecommendedLocal] = useState(false);

  const { resolvedVector, resolvedMeta } = usePreferencesContext();
  const { learnedVector } = useLearnedPreferences();

  // Use the learned vector when the user has not explicitly set preferences.
  // If the user HAS edited their preferences, those always take priority.
  const resolvedVector05 = useMemo(() => {
    if (resolvedMeta.source !== "user" && learnedVector) {
      return normalizeVector05(learnedVector);
    }
    return normalizeVector05(resolvedVector);
  }, [resolvedVector, resolvedMeta.source, learnedVector]);

  const preprocessImageForAnalyze = async (
    uri: string,
    fallbackBase64?: string | null,
    targetBase64Chars: number = 650_000
  ): Promise<{ uri: string; base64: string; width: number; height: number; used_target: number }> => {
    const cleanFallback = String(fallbackBase64 ?? "").trim();

    const attempts: Array<{ width: number; compress: number }> = [
      { width: 1400, compress: 0.78 },
      { width: 1200, compress: 0.74 },
      { width: 1024, compress: 0.7 },
      { width: 900, compress: 0.66 },
      { width: 768, compress: 0.62 },
      { width: 640, compress: 0.58 },
      { width: 512, compress: 0.54 },
      { width: 448, compress: 0.5 },
      { width: 384, compress: 0.46 },
      { width: 320, compress: 0.42 },
    ];

    const tryManipulate = async (w: number, c: number) => {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: w } }],
        {
          compress: c,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );

      const base64 = String(result?.base64 ?? "");
      if (!base64 || base64.length < 64) {
        throw new Error("Failed to preprocess image (empty base64)");
      }

      return {
        uri: result.uri,
        base64,
        width: result.width,
        height: result.height,
        used_target: targetBase64Chars,
      };
    };

    for (const a of attempts) {
      try {
        const out = await tryManipulate(a.width, a.compress);
        if (out.base64.length <= targetBase64Chars) return out;
      } catch {
        continue;
      }
    }

    if (cleanFallback && cleanFallback.length >= 64) {
      if (cleanFallback.length > targetBase64Chars) {
        throw new Error(
          `Image is too large to upload (${cleanFallback.length} base64 chars). Please crop/zoom closer and try again.`
        );
      }
      return { uri, base64: cleanFallback, width: 0, height: 0, used_target: targetBase64Chars };
    }

    throw new Error("Image preprocess failed. Please try a different photo or crop before scanning.");
  };

  const prefsKey = useMemo(() => {
    try {
      return JSON.stringify(resolvedVector ?? {});
    } catch {
      return "{}";
    }
  }, [resolvedVector]);

  const interactionSets = useMemo(() => {
    const favoriteCodes = new Set<string>();
    const likedCodes = new Set<string>();
    const dislikedCodes = new Set<string>();

    for (const fav of Object.values(favoritesByKey ?? {})) {
      const code = inferIbaCodeFromAny(fav);
      if (code) favoriteCodes.add(code);
      const fallback = maybeParseCodeFromRecipeKey(String((fav as any)?.recipe_key ?? ""));
      if (fallback) favoriteCodes.add(fallback);
    }

    for (const [k, meta] of Object.entries(ratingMetaByKey ?? {})) {
      const m: any = meta;
      const recipeKey = String(m?.recipe_key ?? k ?? "").trim();
      const rating = ratingsByKey?.[recipeKey] ?? ratingsByKey?.[k];

      if (rating !== "like" && rating !== "dislike") continue;

      const code = inferIbaCodeFromAny(m) || maybeParseCodeFromRecipeKey(recipeKey);
      if (!code) continue;

      if (rating === "like") likedCodes.add(code);
      else dislikedCodes.add(code);
    }

    const interactionCount = favoriteCodes.size + likedCodes.size + dislikedCodes.size;

    return { favoriteCodes, likedCodes, dislikedCodes, interactionCount };
  }, [favoritesByKey, ratingsByKey, ratingMetaByKey]);

  const hasPersonalSignal = useMemo(() => {
    return resolvedMeta?.source === "user" || interactionSets.interactionCount > 0;
  }, [resolvedMeta, interactionSets]);

  const getBucketRank = (r: ClassicItem): number => {
    const b = r?.bucket;
    if (b === "ready") return 0;
    if (b === "one_missing") return 1;
    if (b === "two_missing") return 2;
    return 9;
  };

  const pingApi = async () => {
    try {
      const base = process.env.EXPO_PUBLIC_API_URL;
      if (!base) {
        Alert.alert("Missing env", "EXPO_PUBLIC_API_URL is not set");
        return;
      }

      const r = await fetch(`${base}/health`);
      const j = await r.json();

      Alert.alert("API /health", JSON.stringify(j));
    } catch (e: any) {
      Alert.alert("API error", String(e?.message || e));
    }
  };

  const scrollRef = useRef<ScrollView>(null);
  const ingredientYRef = useRef<Record<number, number>>({});
  const lastRecommendPrefsKeyRef = useRef<string>("");

  const invalidateRecipes = (reason: "ingredients" | "preferences" = "ingredients") => {
    setRecipes([]);
    setExpandedIndex(null);
    setRecipesStale(true);
    setRecipesStaleReason(reason);
    setHasRecommended(false);
    setHasRecommendedLocal(false);
    lastRecommendPrefsKeyRef.current = "";
  };

  useEffect(() => {
    if (!hasRecommended) return;
    if (!Array.isArray(recipes) || recipes.length === 0) return;
    if (!lastRecommendPrefsKeyRef.current) return;
    if (prefsKey === lastRecommendPrefsKeyRef.current) return;

    setRecipesStale(true);
    setRecipesStaleReason("preferences");
  }, [prefsKey, hasRecommended, recipes]);

  const openRecipeInTab2 = (r: any, idx: number) => {
    const code = String(r?.iba_code ?? "").trim();
    const name = String(r?.name ?? "Recipe").trim() || "Recipe";

    const recipeHash = String(r?.recipe_hash ?? "").trim();
    const recipeKeyFromPayload = String(r?.recipe_key ?? "").trim();

    const recipe_key =
      recipeKeyFromPayload ||
      recipeHash ||
      (code ? `${code}-${name}` : `${idx + 1}-${name}`);

    const ingredients_json = encodeURIComponent(JSON.stringify(activeCanonical));

    const scan_items_json = encodeURIComponent(
      JSON.stringify(
        (activeIngredients || []).map((x) => ({
          canonical: String(normalizeIngredientKey(String(x?.canonical ?? "")) || "").trim(),
          display: String(x?.display ?? "").trim(),
        }))
      )
    );

    const missRaw =
      Array.isArray(r?.missing_items) && r.missing_items.length > 0
        ? r.missing_items
        : Array.isArray(r?.match?.missing_items)
        ? r.match.missing_items
        : [];

    const miss = Array.isArray(missRaw)
      ? missRaw.map((x: any) => String(x ?? "").trim()).filter(Boolean)
      : [];

    const missing_items_json = encodeURIComponent(JSON.stringify(miss));

    router.push({
      pathname: "/recipe",
      params: {
        idx: String(idx),
        recipe_key,
        recipe_hash: recipeHash || undefined,
        iba_code: code,
        ingredients_json,
        scan_items_json,
        missing_items_json,
      },
    });
  };

  const resolveCanonicalForDisplay = async (display: string): Promise<string> => {
    const hint = inferCanonicalFromDisplay(display);
    if (hint) return hint;

    const v = String(display || "").trim();
    if (!v) return "";

    if (!API_URL) return String(normalizeIngredientKey(v) || "").trim();

    try {
      const url = `${API_URL}/debug/canonicalize?q=${encodeURIComponent(v)}`;
      const r = await fetch(url);
      if (!r.ok) return String(normalizeIngredientKey(v) || "").trim();

      const j = (await r.json()) as CanonicalizeResponse;
      const c = String(j?.canonical || "").trim();
      const norm = String(normalizeIngredientKey(c) || "").trim();
      return norm || String(normalizeIngredientKey(v) || "").trim();
    } catch {
      return String(normalizeIngredientKey(v) || "").trim();
    }
  };

  const regenerateRecipes = async (overrideIngredients?: ActiveIngredient[]) => {
    if (!API_URL) {
      setError("Missing EXPO_PUBLIC_API_URL. Please check .env.");
      return;
    }

    const sourceIngredients = Array.isArray(overrideIngredients) ? overrideIngredients : activeIngredients;

    if (!sourceIngredients || sourceIngredients.length === 0) {
      setError("No ingredients yet. Please scan or add ingredients first.");
      return;
    }

    setLoading(true);
    setStage("generating");
    setExpandedIndex(null);
    setError(null);
    setRecipes([]);
    setRecipesStale(false);
    setRecipesStaleReason(null);
    setHasRecommended(true);
    setHasRecommendedLocal(true);

    setLastRecommendHttpStatus(null);
    setLastRecommendResponseJson(null);

    try {
      const updated: ActiveIngredient[] = [];
      const canonicalList: string[] = [];

      for (const it of sourceIngredients) {
        const display = String(it?.display ?? "").trim();
        if (!display) continue;

        let canon = String(it?.canonical ?? "").trim();
        canon = canonicalizeForRecommendation(canon);

        if (!canon) {
          canon = await resolveCanonicalForDisplay(display);
          canon = canonicalizeForRecommendation(canon);
        }

        if (canon) {
          canonicalList.push(canon);
        } else {
          console.warn("[recommend] failed to canonicalize scanned ingredient", {
            display,
            canonical: String(it?.canonical ?? "").trim(),
          });
        }

        updated.push({
          ...it,
          display,
          canonical: canon,
        });
      }

      const canonicalDeduped = dedupeCaseInsensitive(
        canonicalList.map(canonicalizeForRecommendation).filter(Boolean)
      );

      setActiveIngredients(updated);

      if (canonicalDeduped.length === 0) {
        throw new Error("No canonical ingredients resolved. Please try again.");
      }

      // Stage 6: 已登入時，合併 My Bar 的 ingredient_key 到推薦計算中
      let inventoryKeys = availableIngredientKeys;
      if (session?.access_token && !inventoryInitialized) {
        inventoryKeys = await refreshInventory({ silent: true }).then((items) =>
          items
            .filter((it) => Number(it.remaining_pct) > 0)
            .map((it) => {
              const rawKey = String(it.ingredient_key ?? "").trim();
              const normalizedKey = canonicalizeForRecommendation(rawKey);
              if (!normalizedKey) {
                console.warn("[recommend] failed to canonicalize inventory ingredient", {
                  ingredient_key: rawKey,
                });
              }
              return normalizedKey;
            })
            .filter(Boolean)
        );
      }

      for (const key of availableIngredientKeys) {
        if (!canonicalizeForRecommendation(key)) {
          console.warn("[recommend] failed to canonicalize inventory ingredient", {
            ingredient_key: String(key ?? "").trim(),
          });
        }
      }

      const mergedIngredients = dedupeCaseInsensitive(
        [...canonicalDeduped, ...inventoryKeys]
          .map(canonicalizeForRecommendation)
          .filter((key) => {
            if (key) return true;
            return false;
          })
      ).sort((a, b) => a.localeCompare(b));

      const localeForApi = isZh ? "zh" : "en";

      // Stage 7: build request body with optional mood filter
      const recommendBody: Record<string, any> = {
        detected_ingredients: mergedIngredients,
        locale: localeForApi,
        user_preference_vector: resolvedVector05,
        user_interactions: {
          favorite_codes: Array.from(interactionSets.favoriteCodes),
          liked_codes: Array.from(interactionSets.likedCodes),
          disliked_codes: Array.from(interactionSets.dislikedCodes),
        },
      };
      if (selectedMood) {
        recommendBody.mood = selectedMood;
      }
      lastRecommendMoodRef.current = selectedMood;

      const resp = await fetch(`${API_URL}/recommend-classics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recommendBody),
      });

      setLastRecommendHttpStatus(resp.status);

      const dataText = await resp.text();
      let dataParsed: any = null;
      try {
        dataParsed = dataText ? JSON.parse(dataText) : null;
      } catch {
        dataParsed = null;
      }
      setLastRecommendResponseJson(dataParsed ?? (dataText ? { raw: dataText } : null));

      if (!resp.ok) {
        throw new Error(`Recommend API failed: ${resp.status} ${dataText}`);
      }

      const data = (dataParsed ?? {}) as {
        can_make?: any[];
        one_away?: any[];
        two_away?: any[];
      };

      const canMake = Array.isArray(data.can_make) ? data.can_make : [];
      const oneAway = Array.isArray(data.one_away) ? data.one_away : [];
      const twoAway = Array.isArray(data.two_away) ? data.two_away : [];

      const flattened: ClassicItem[] = [
        ...canMake.map((x) => ({
          ...x,
          bucket: "ready" as const,
          ...getAlcoholSafetyForRecipe(x),
          ...getAllergenSafetyForRecipe(x),
          ...getCaffeineSafetyForRecipe(x),
          ...evaluateRecipeSafety(x),
        })),
        ...oneAway.map((x) => ({
          ...x,
          bucket: "one_missing" as const,
          ...getAlcoholSafetyForRecipe(x),
          ...getAllergenSafetyForRecipe(x),
          ...getCaffeineSafetyForRecipe(x),
          ...evaluateRecipeSafety(x),
        })),
        ...twoAway.map((x) => ({
          ...x,
          bucket: "two_missing" as const,
          ...getAlcoholSafetyForRecipe(x),
          ...getAllergenSafetyForRecipe(x),
          ...getCaffeineSafetyForRecipe(x),
          ...evaluateRecipeSafety(x),
        })),
      ];

      if (flattened.length === 0) {
        setRecipes([]);
        setRecipesStale(false);
        setRecipesStaleReason(null);
        setStage("idle");
        setError(null);
        lastRecommendPrefsKeyRef.current = "";
        return;
      }

      setRecipes(flattened);
      setRecipesStale(false);
      setRecipesStaleReason(null);
      lastRecommendPrefsKeyRef.current = prefsKey;
      setStage("idle");
    } catch (e: any) {
      setError(e?.message ?? "Failed to recommend classics.");
      setStage("idle");
    } finally {
      setLoading(false);
    }
  };

  // ── Stage 10: Flavor Explorer ─────────────────────────────────────────
  const fetchExplore = async () => {
    if (!API_URL || activeIngredients.length === 0) return;

    setExploreLoading(true);
    setError(null);
    try {
      const detectedList = activeIngredients.map((a) => String(a.canonical ?? a.display ?? "").trim()).filter(Boolean);

      const favoriteCodes = Object.values(favoritesByKey ?? {}).map((f: any) => String(f?.iba_code || f?.recipe_key || "").trim()).filter(Boolean);
      const likedCodes: string[] = [];
      const dislikedCodes: string[] = [];
      for (const [key, rating] of Object.entries(ratingsByKey)) {
        const meta = ratingMetaByKey[key];
        const code = String(meta?.iba_code || key || "").trim();
        if (!code) continue;
        if (rating === "like") likedCodes.push(code);
        else if (rating === "dislike") dislikedCodes.push(code);
      }

      const resp = await fetch(`${API_URL}/recommend-explore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          detected_ingredients: detectedList,
          locale: isZh ? "zh" : "en",
          user_interactions: {
            favorite_codes: favoriteCodes,
            liked_codes: likedCodes,
            disliked_codes: dislikedCodes,
          },
        }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Explore API failed: ${resp.status} ${t}`);
      }

      const data = await resp.json();
      setExploreResults(Array.isArray(data.explore) ? data.explore : []);
      setExploreMeta(data.meta || null);
      setShowExplore(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch explore recommendations.");
    } finally {
      setExploreLoading(false);
    }
  };

  const copyDebug = async () => {
    if (!__DEV__) {
      Alert.alert("Info", "Debug info is only available in development mode.");
      return;
    }
    try {
      const payload: any = {
        build: "RECIPES_V1",
        API_URL: API_URL ?? "(missing)",
        stage,
        loading,
        error,
        last_http_status: lastHttpStatus,
        last_upload: lastUploadInfo,
        last_analyze_response_keys:
          lastAnalyzeResponseJson && typeof lastAnalyzeResponseJson === "object"
            ? Object.keys(lastAnalyzeResponseJson)
            : null,
        last_analyze_response_preview: lastAnalyzeResponseText
          ? lastAnalyzeResponseText.length > 1200
            ? lastAnalyzeResponseText.slice(0, 1200) + "..."
            : lastAnalyzeResponseText
          : null,
        last_recommend_http_status: lastRecommendHttpStatus,
        last_recommend_response_keys:
          lastRecommendResponseJson && typeof lastRecommendResponseJson === "object"
            ? Object.keys(lastRecommendResponseJson)
            : null,
        last_recommend_response_preview: lastRecommendResponseJson
          ? (() => {
              try {
                const s = JSON.stringify(lastRecommendResponseJson);
                return s.length > 1200 ? s.slice(0, 1200) + "..." : s;
              } catch {
                return "(unserializable)";
              }
            })()
          : null,
        results_count: visibleRecipeCount,
        raw_recipe_count: Array.isArray(recipes) ? recipes.length : 0,
        visible_recipe_count: visibleRecipeCount,
        safety: safety ? { risk_level: safety.risk_level, non_count: safety.non_consumable_items.length } : null,
        hasRecommended,
        hasRecommendedLocal,
        active_ingredients: activeIngredients,
        canonical_count: activeCanonical.length,
        ingredients_display: activeDisplay,
        ingredients_canonical: activeCanonical,
        prefs: {
          resolvedMeta: resolvedMeta ?? null,
          resolvedVector: resolvedVector05 ?? null,
        },
        hasPersonalSignal,
        unknown_ingredients: unknownIngredients,
        flavor_vector: flavorVector ?? null,
        user_interactions: {
          favorite_codes: Array.from(interactionSets.favoriteCodes),
          liked_codes: Array.from(interactionSets.likedCodes),
          disliked_codes: Array.from(interactionSets.dislikedCodes),
          interaction_count: interactionSets.interactionCount,
        },
      };

      await Clipboard.setStringAsync(JSON.stringify(payload, null, 2));
      Alert.alert("Copied", "Debug JSON copied to clipboard.");
    } catch (e: any) {
      Alert.alert("Copy failed", String(e?.message || e));
    }
  };

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const h = e.endCoordinates?.height ?? 0;
      setKeyboardHeight(h);

      if (pendingScrollIndex !== null) {
        requestAnimationFrame(() => {
          scrollToIngredient(pendingScrollIndex);
          setPendingScrollIndex(null);
        });
      }
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [pendingScrollIndex]);

  const scrollToIngredient = (idx: number) => {
    const y = ingredientYRef.current[idx];
    if (typeof y !== "number") return;

    const windowH = Dimensions.get("window").height;
    const topPadding = 140;
    const visibleH = Math.max(200, windowH - keyboardHeight - topPadding);
    const targetY = Math.max(0, y - visibleH * 0.35);

    scrollRef.current?.scrollTo({ y: targetY, animated: true });
  };

  const pickImage = async () => {
    setError(null);

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Please allow photo library access.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      exif: false,
      base64: true,
    });

    if (result.canceled) return;

    const uri = result.assets?.[0]?.uri ?? null;
    const b64 = result.assets?.[0]?.base64 ?? null;

    setImageUri(uri);
    setPickedBase64(b64);

    setActiveIngredients([]);
    setRecipes([]);
    setSafety(null);
    setExpandedIndex(null);
    setRecipesStale(false);
    setRecipesStaleReason(null);
    setHasRecommended(false);
    setHasRecommendedLocal(false);
    setStage("idle");
  };

  const takePhoto = async () => {
    setError(null);

    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Please allow camera access.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.9,
      exif: false,
      base64: true,
    });
    if (result.canceled) return;

    const uri = result.assets?.[0]?.uri ?? null;
    const b64 = result.assets?.[0]?.base64 ?? null;

    setImageUri(uri);
    setPickedBase64(b64);

    setActiveIngredients([]);
    setRecipes([]);
    setSafety(null);
    setExpandedIndex(null);
    setRecipesStale(false);
    setRecipesStaleReason(null);
    setHasRecommended(false);
    setHasRecommendedLocal(false);
    setStage("idle");
  };

  const analyze = async () => {
    if (!imageUri) return;

    if (!API_URL) {
      setError("Missing EXPO_PUBLIC_API_URL. Please check .env.");
      return;
    }

    setLoading(true);
    setStage("identifying ingredients");
    setLastHttpStatus(null);
    setLastUploadInfo(null);
    setLastAnalyzeResponseText(null);
    setLastAnalyzeResponseJson(null);
    setExpandedIndex(null);
    setError(null);

    setActiveIngredients([]);
    setRecipes([]);
    setRecipesStale(false);
    setRecipesStaleReason(null);
    setSafety(null);
    setHasRecommended(false);
    setHasRecommendedLocal(false);

    try {
      const pre = await preprocessImageForAnalyze(imageUri, pickedBase64, 650_000);
      setLastUploadInfo({
        stage: "preprocess",
        base64_chars: pre.base64.length,
        width: pre.width,
        height: pre.height,
      });

      let resp = await fetch(`${API_URL}/analyze-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_base64: pre.base64,
          return_raw: true,
          return_detected_items: true,
          return_display: true,
        }),
      });

      setLastHttpStatus(resp.status);

      if (resp.status === 413) {
        const pre2 = await preprocessImageForAnalyze(imageUri, pickedBase64, 350_000);
        setLastUploadInfo({
          stage: "retry_413_1",
          base64_chars: pre2.base64.length,
          width: pre2.width,
          height: pre2.height,
        });

        resp = await fetch(`${API_URL}/analyze-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_base64: pre2.base64,
            return_raw: true,
            return_detected_items: true,
            return_display: true,
          }),
        });

        setLastHttpStatus(resp.status);

        if (resp.status === 413) {
          const pre3 = await preprocessImageForAnalyze(imageUri, pickedBase64, 170_000);
          setLastUploadInfo({
            stage: "retry_413_2",
            base64_chars: pre3.base64.length,
            width: pre3.width,
            height: pre3.height,
          });

          resp = await fetch(`${API_URL}/analyze-image`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              image_base64: pre3.base64,
              return_raw: true,
              return_detected_items: true,
              return_display: true,
            }),
          });

          setLastHttpStatus(resp.status);

          if (resp.status === 413) {
            const pre4 = await preprocessImageForAnalyze(imageUri, pickedBase64, 120_000);
            setLastUploadInfo({
              stage: "retry_413_3",
              base64_chars: pre4.base64.length,
              width: pre4.width,
              height: pre4.height,
            });

            resp = await fetch(`${API_URL}/analyze-image`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                image_base64: pre4.base64,
                return_raw: true,
                return_detected_items: true,
                return_display: true,
              }),
            });

            setLastHttpStatus(resp.status);
          }
        }
      }

      if (!resp.ok) {
        const t = await resp.text();
        if (resp.status === 413) {
          throw new Error(
            "Ingredient API failed: 413 (payload too large). Please crop tighter or use a closer shot. (Tip: focus on the label area only.)"
          );
        }
        throw new Error(`Ingredient API failed: ${resp.status} ${t}`);
      }

      const respText = await resp.text();
      setLastAnalyzeResponseText(respText);

      let parsed: any = null;
      try {
        parsed = respText ? JSON.parse(respText) : null;
      } catch {
        parsed = null;
      }
      setLastAnalyzeResponseJson(parsed);

      const data = (parsed ?? {}) as AnalyzeImageResponse;

      const next = buildActiveIngredientsFromAnalyze(data);
      const nextWithCanonicalNormalized = next
        .map((x, idx) => {
          const c = String(x.canonical ?? "").trim();
          const norm = String(normalizeIngredientKey(c) || "").trim();
          return {
            ...x,
            id: x.id || `scan-${idx}-${x.display}`,
            canonical: norm,
          };
        })
        .filter((x) => String(x.display || "").trim().length > 0);

      setActiveIngredients(nextWithCanonicalNormalized);
      setSafety(data.safety ?? null);
      setImageUri(pre.uri);
      setPickedBase64(null);

      setError(null);

      // Server-backed token earn for successful scan (deduped by timestamp key)
      earnToken("scan", `scan_${Date.now()}`);
    } catch (e: any) {
      setError(e?.message ?? "Failed to analyze image.");
      setStage("idle");
    } finally {
      setLoading(false);
    }
  };

  const addIngredient = async () => {
    const v = newIngredient.trim();
    if (!v) return;

    const exists = activeIngredients.some((x) => String(x.display || "").toLowerCase() === v.toLowerCase());
    if (exists) {
      setNewIngredient("");
      return;
    }

    if (recipes.length > 0) invalidateRecipes("ingredients");

    const newId = `user-${Date.now()}-${v}`;
    setActiveIngredients((prev) => [
      ...prev,
      {
        id: newId,
        display: v,
        canonical: "",
        isUserAdded: true,
      },
    ]);

    setNewIngredient("");
    setHasRecommended(false);
    setHasRecommendedLocal(false);

    try {
      const canon = await resolveCanonicalForDisplay(v);
      if (!canon) return;
      setActiveIngredients((prev) => {
        const stillExists = prev.some((x) => x.id === newId);
        if (!stillExists) return prev;
        return prev.map((x) => (x.id === newId ? { ...x, canonical: canon } : x));
      });
    } catch {
      return;
    }
  };

  const removeIngredient = (idx: number) => {
    if (recipes.length > 0) invalidateRecipes("ingredients");
    setActiveIngredients((prev) => prev.filter((_, i) => i !== idx));
    setHasRecommended(false);
    setHasRecommendedLocal(false);
  };

  const startEditIngredient = (id: string, current: string) => {
    setEditingId(id);
    setEditingValue(current ?? "");
  };

  const handleAddToInventory = async (payload: {
    ingredient_key: string;
    display_name: string;
    total_ml: number;
    remaining_pct: number;
  }) => {
    await addInventoryItem(payload);
  };

  const saveEditIngredient = async () => {
    if (!editingId) return;

    const id = editingId;
    const v = editingValue.trim();
    if (!v) {
      setError("Ingredient cannot be empty.");
      return;
    }

    const existing = activeIngredients.find((x) => x.id === id);
    const before = String(existing?.display ?? "").trim();

    if (before && before.toLowerCase() === v.toLowerCase()) {
      setEditingId(null);
      setEditingValue("");
      return;
    }

    const duplicate = activeIngredients.some(
      (x) => x.id !== id && String(x.display || "").toLowerCase() === v.toLowerCase()
    );
    if (duplicate) {
      setError("That ingredient already exists.");
      return;
    }

    if (recipes.length > 0) invalidateRecipes("ingredients");

    setActiveIngredients((prev) =>
      prev.map((x) => (x.id === id ? { ...x, display: v, canonical: "" } : x))
    );

    setEditingId(null);
    setEditingValue("");
    setHasRecommended(false);
    setHasRecommendedLocal(false);

    try {
      const canon = await resolveCanonicalForDisplay(v);
      if (!canon) return;
      setActiveIngredients((prev) => {
        const stillExists = prev.some((x) => x.id === id);
        if (!stillExists) return prev;
        return prev.map((x) => (x.id === id ? { ...x, canonical: canon } : x));
      });
    } catch {
      return;
    }
  };

  const { ready, oneMissing, twoMissing } = useMemo(() => {
    const all = Array.isArray(recipes) ? recipes : [];

    const enriched = all
      .map((r) => {
        const code = String(r?.iba_code ?? "").trim();
        if (!code) return null;

        const bucketRank = getBucketRank(r);
        const totalScore =
          typeof r?.score_breakdown?.total_score === "number"
            ? r.score_breakdown.total_score
            : typeof (r as any)?.total_score === "number"
            ? (r as any).total_score
            : null;
        return {
          ...r,
          _code: code,
          _bucketRank: bucketRank,
          _totalScore: totalScore,
          _name: String(r?.name ?? ""),
        };
      })
      .filter(Boolean) as Array<
      ClassicItem & {
        _code: string;
        _bucketRank: number;
        _totalScore: number | null;
        _name: string;
      }
    >;

    const cmp = (a: typeof enriched[number], b: typeof enriched[number]) => {
      if (a._bucketRank !== b._bucketRank) return a._bucketRank - b._bucketRank;
      const aHas = typeof a._totalScore === "number";
      const bHas = typeof b._totalScore === "number";
      if (aHas !== bHas) return aHas ? -1 : 1;
      if (aHas && bHas && a._totalScore !== b._totalScore) return (b._totalScore as number) - (a._totalScore as number);
      const byName = a._name.localeCompare(b._name);
      if (byName !== 0) return byName;
      return a._code.localeCompare(b._code);
    };

    const sorted = [...enriched].sort(cmp);

    return {
      ready: sorted.filter((x) => x.bucket === "ready"),
      oneMissing: sorted.filter((x) => x.bucket === "one_missing"),
      twoMissing: sorted.filter((x) => x.bucket === "two_missing"),
    };
  }, [recipes]);

  const visibleRecipeCount = ready.length + oneMissing.length + twoMissing.length;

  const toneStyles = (tone: SectionTone) => {
    if (tone === "ready") {
      return {
        bar: "#6F8F7C",
        bg: "#EEF2EF",
        text: "#3F5A4B",
        border: "#D7E0DA",
      };
    }
    if (tone === "one_missing") {
      return {
        bar: "#B6A77A",
        bg: "#F4F1E8",
        text: "#6B5D36",
        border: "#E6DECC",
      };
    }
    return {
      bar: "#B78A7A",
      bg: "#F5EEEB",
      text: "#6A3F34",
      border: "#E6D3CD",
    };
  };

  const Section = ({
    title,
    items,
    tone,
  }: {
    title: string;
    items: ClassicItem[];
    tone: SectionTone;
  }) => {
    if (items.length === 0) return null;

    const t = toneStyles(tone);

    return (
      <View style={{ padding: 12, borderWidth: 1, borderRadius: 12, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              backgroundColor: t.bar,
            }}
          />
          <View
            style={{
              borderWidth: 1,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 4,
              backgroundColor: t.bg,
              borderColor: t.border,
            }}
          >
            <Text style={{ fontWeight: "900", color: t.text }}>
              {title} ({items.length})
            </Text>
          </View>
        </View>

        {items.map((r, idx) => {
          const name = String(r?.name ?? "").trim() || "Recipe";

          const code = String(r?.iba_code || "").trim();
          const ratedKeyStable = code ? `${code}-${name}` : name;
          const ratedKeyLegacy = `${idx + 1}-${name}`;
          const rated = Boolean(ratingsByKey?.[ratedKeyStable] || ratingsByKey?.[ratedKeyLegacy]);

          const miss = Array.isArray(r.missing_items)
            ? r.missing_items.map((s) => String(s).trim()).filter(Boolean)
            : [];

          const safetyBadges = [
            r.alcohol_warning ? "High Proof" : null,
            r.allergen_warning ? "Allergen" : null,
            r.caffeine_warning ? "Caffeine + Alcohol" : null,
          ].filter(Boolean) as string[];

          return (
            <View
              key={`${r.iba_code}-${idx}`}
              style={{
                borderWidth: 1,
                borderRadius: 12,
                padding: 12,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ fontWeight: "800", flex: 1 }} numberOfLines={1}>
                  {name}
                </Text>

                {rated ? (
                  <View
                    style={{
                      borderWidth: 1,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderColor: "#DDD",
                    }}
                  >
                    <Text style={{ fontWeight: "400", color: "#777" }}>Rated</Text>
                  </View>
                ) : null}

                <Pressable
                  onPress={() => openRecipeInTab2(r, idx)}
                  style={{
                    borderWidth: 1,
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ fontWeight: "800" }}>View</Text>
                </Pressable>
              </View>

              {safetyBadges.length > 0 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {safetyBadges.map((badge) => (
                    <View
                      key={badge}
                      style={{
                        borderWidth: 1,
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        backgroundColor: "#faf5ff",
                        borderColor: "#d8b4fe",
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "800", color: "#7c3aed" }}>
                        {badge}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {Array.isArray((r as any)?.reasons) && (r as any).reasons.length > 0 ? (
                (() => {
                  const reasons = ((r as any).reasons as any[])
                    .map((x) => String(x ?? "").trim())
                    .filter(Boolean);

                  const missingLine =
                    reasons.find((s) => s.startsWith("Missing ") || s.startsWith("還缺 ")) ||
                    reasons.find((s) => s === "No missing ingredients." || s === "不缺材料。") ||
                    "";

                  if (!missingLine) return null;

                  return (
                    <Text style={{ color: "#555" }} numberOfLines={2}>
                      {missingLine}
                    </Text>
                  );
                })()
              ) : miss.length > 0 ? (
                <Text style={{ color: "#555" }} numberOfLines={2}>
                  {isZh ? "缺少：" : "Missing: "}
                  {miss.join(" • ")}
                </Text>
              ) : (
                <Text style={{ color: "#666" }}>{isZh ? "（不缺材料）" : "(No missing items)"}</Text>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <>
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ fontSize: 20, fontWeight: "800", flex: 1 }}>Scan Ingredients</Text>
      </View>

      {__DEV__ ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button title="Ping API (/health)" onPress={pingApi} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Copy Debug" onPress={copyDebug} />
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Button title="Choose Photo" onPress={pickImage} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Take Photo" onPress={takePhoto} />
        </View>
      </View>

      {imageUri ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: "700" }}>Preview</Text>
          <Image
            source={{ uri: imageUri }}
            style={{ width: "100%", height: 260, borderRadius: 12 }}
            resizeMode="cover"
          />

          <Button
            title={
              loading
                ? stage === "identifying ingredients"
                  ? "Identifying ingredients..."
                  : "Loading..."
                : "Run Ingredients"
            }
            onPress={analyze}
            disabled={loading}
          />
        </View>
      ) : (
        <Text style={{ color: "#666" }}>Choose a photo or take a photo to start.</Text>
      )}

      {error ? (
        <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
          <Text style={{ fontWeight: "800" }}>Error</Text>
          <Text>{error}</Text>
        </View>
      ) : null}

      {safety && (safety.risk_level !== "none" || safety.non_consumable_items.length > 0) ? (
        <View style={{ padding: 12, borderWidth: 2, borderRadius: 12 }}>
          <Text style={{ fontWeight: "900", marginBottom: 6 }}>Warning</Text>

          <Text style={{ marginBottom: 8 }}>
            {safety.message && safety.message.trim()
              ? safety.message
              : safety.risk_level === "high"
              ? "Non-consumable item(s) detected. Do NOT ingest."
              : "Possible non-consumable item(s) detected. Do NOT ingest and please double-check."}
          </Text>

          <Text style={{ fontWeight: "800", marginBottom: 4 }}>Risk: {safety.risk_level}</Text>

          {safety.non_consumable_items.length > 0 ? (
            <View style={{ gap: 4 }}>
              <Text style={{ fontWeight: "800" }}>Detected:</Text>
              {safety.non_consumable_items.map((x, i) => (
                <Text key={i}>• {x}</Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
        <Text style={{ fontWeight: "800", marginBottom: 8 }}>Ingredients (editable)</Text>

        {recipesStale ? (
          <View style={{ padding: 10, borderWidth: 1, borderRadius: 10, marginBottom: 8 }}>
            <Text style={{ fontWeight: "800" }}>Results out of date</Text>
            <Text style={{ color: "#555" }}>
              {recipesStaleReason === "preferences"
                ? "Preferences changed. Please refresh recommendations."
                : recipesStaleReason === "mood"
                ? "Mood changed. Please refresh recommendations."
                : "Ingredients changed. Please refresh recommendations."}
            </Text>
          </View>
        ) : null}

        {activeIngredients.length === 0 ? (
          <Text style={{ color: "#666" }}>(No ingredients yet)</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {activeIngredients.map((ing, idx) => {
              const isEditing = editingId === ing.id;

              return (
                <View
                  key={ing.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingVertical: 4,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {isEditing ? (
                      <TextInput
                        autoFocus
                        value={editingValue}
                        onChangeText={setEditingValue}
                        autoCapitalize="none"
                        maxLength={80}
                        onFocus={(e) => {
                          scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(
                            e.target as any,
                            120,
                            true
                          );
                        }}
                        style={{
                          borderWidth: 1,
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                        }}
                      />
                    ) : (
                      <Text style={{ flex: 1, flexShrink: 1, paddingRight: 8 }} numberOfLines={1}>
                        • {ing.display}
                      </Text>
                    )}
                  </View>

                  <View style={{ flexDirection: "row", gap: 8, flexShrink: 0 }}>
                    {isEditing ? (
                      <>
                        <Pressable
                          onPress={() => {
                            setEditingId(null);
                            setEditingValue("");
                          }}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderWidth: 1,
                            borderRadius: 10,
                          }}
                        >
                          <Text style={{ fontWeight: "800" }}>Cancel</Text>
                        </Pressable>

                        <Pressable
                          onPress={saveEditIngredient}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderWidth: 1,
                            borderRadius: 10,
                          }}
                        >
                          <Text style={{ fontWeight: "800" }}>Save</Text>
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Pressable
                          onPress={() => startEditIngredient(ing.id, ing.display)}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderWidth: 1,
                            borderRadius: 10,
                          }}
                        >
                          <Text style={{ fontWeight: "800" }}>Edit</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => removeIngredient(idx)}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderWidth: 1,
                            borderRadius: 10,
                          }}
                        >
                          <Text style={{ fontWeight: "800" }}>Delete</Text>
                        </Pressable>

                        {session ? (
                          <Pressable
                            onPress={() => setInventoryModalTarget(ing)}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              backgroundColor: '#111',
                              borderRadius: 10,
                            }}
                          >
                            <Text style={{ fontWeight: "800", color: '#FFF' }}>+ Bar</Text>
                          </Pressable>
                        ) : null}
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ marginTop: 12, gap: 8 }}>
          <Text style={{ fontWeight: "800" }}>Add ingredient</Text>

          <TextInput
            value={newIngredient}
            onChangeText={setNewIngredient}
            placeholder='e.g., "simple syrup"'
            autoCapitalize="none"
            maxLength={80}
            style={{
              borderWidth: 1,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />

          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Button title="Add" onPress={addIngredient} disabled={loading} />
            </View>
          </View>

          {/* Stage 7 + 9b: Mood selector with unlock */}
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontWeight: "700", fontSize: 13, marginBottom: 6 }}>Mood (optional)</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {(
                [
                  { key: "chill", label: "Chill", emoji: "😌", color: "#4ade80", feature: "mood_chill" as Feature },
                  { key: "party", label: "Party", emoji: "🎉", color: "#f59e0b", feature: "mood_party" as Feature },
                  { key: "date_night", label: "Date Night", emoji: "💕", color: "#f472b6", feature: "mood_date_night" as Feature },
                  { key: "solo", label: "Solo", emoji: "🧘", color: "#60a5fa", feature: "mood_solo" as Feature },
                ] as const
              ).map((m) => {
                const isActive = selectedMood === m.key;
                const unlocked = isUnlocked(m.feature);
                const cost = unlockCosts[m.feature] ?? 0;
                return (
                  <Pressable
                    key={m.key}
                    onPress={async () => {
                      if (!unlocked) {
                        // Show unlock dialog
                        if (!session) {
                          Alert.alert("Sign in required", "Please sign in to unlock mood filters.");
                          return;
                        }
                        Alert.alert(
                          `Unlock ${m.label}?`,
                          `Spend ${cost} tokens to unlock the ${m.label} mood filter?\n\nYour balance: ${tokenBalance} tokens`,
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: `Unlock (${cost} tokens)`,
                              onPress: async () => {
                                const result = await spendToken(m.feature);
                                if (result.ok) {
                                  Alert.alert("Unlocked!", `${m.label} mood is now available.`);
                                } else if (result.reason === "insufficient_balance") {
                                  Alert.alert("Not enough tokens", `You need ${cost} tokens but only have ${tokenBalance}. Keep scanning and rating to earn more!`);
                                }
                              },
                            },
                          ]
                        );
                        return;
                      }
                      const next = isActive ? null : m.key;
                      setSelectedMood(next);
                      if (hasRecommended && recipes.length > 0 && next !== lastRecommendMoodRef.current) {
                        setRecipesStale(true);
                        setRecipesStaleReason("mood");
                      } else if (hasRecommended && next === lastRecommendMoodRef.current) {
                        if (recipesStaleReason === "mood") {
                          setRecipesStale(false);
                          setRecipesStaleReason(null);
                        }
                      }
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 20,
                      borderWidth: 1.5,
                      borderColor: unlocked ? (isActive ? m.color : "#ccc") : "#e5e5e5",
                      backgroundColor: unlocked ? (isActive ? m.color + "18" : "transparent") : "#f5f5f5",
                      opacity: unlocked ? 1 : 0.7,
                    }}
                  >
                    {!unlocked ? (
                      <Text style={{ fontSize: 12 }}>🔒</Text>
                    ) : (
                      <Text style={{ fontSize: 14 }}>{m.emoji}</Text>
                    )}
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: isActive && unlocked ? "700" : "500",
                        color: unlocked ? (isActive ? m.color : "#888") : "#bbb",
                      }}
                    >
                      {m.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Stage 10: Flavor Explorer button — hidden during development */}
          {false && <View style={{ marginTop: 8 }}>
            {(() => {
              const exploreUnlocked = isUnlocked("flavor_explorer");
              const exploreCost = unlockCosts["flavor_explorer" as Feature] ?? 15;
              return (
                <Pressable
                  onPress={async () => {
                    if (!exploreUnlocked) {
                      if (!session) {
                        Alert.alert("Sign in required", "Please sign in to unlock Flavor Explorer.");
                        return;
                      }
                      Alert.alert(
                        "Unlock Flavor Explorer?",
                        `Spend ${exploreCost} tokens to unlock recommendations outside your comfort zone?\n\nYour balance: ${tokenBalance} tokens`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: `Unlock (${exploreCost} tokens)`,
                            onPress: async () => {
                              const result = await spendToken("flavor_explorer" as Feature);
                              if (result.ok) {
                                Alert.alert("Unlocked!", "Flavor Explorer is now available.");
                              } else if (result.reason === "insufficient_balance") {
                                Alert.alert("Not enough tokens", `You need ${exploreCost} tokens but only have ${tokenBalance}. Keep scanning and rating!`);
                              }
                            },
                          },
                        ]
                      );
                      return;
                    }
                    if (showExplore) {
                      setShowExplore(false);
                      return;
                    }
                    fetchExplore();
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: 20,
                    borderWidth: 1.5,
                    borderColor: exploreUnlocked ? (showExplore ? "#8b5cf6" : "#ccc") : "#e5e5e5",
                    backgroundColor: exploreUnlocked ? (showExplore ? "#8b5cf618" : "transparent") : "#f5f5f5",
                    opacity: exploreUnlocked ? 1 : 0.7,
                    alignSelf: "flex-start",
                  }}
                >
                  <Text style={{ fontSize: 14 }}>{exploreUnlocked ? "🧭" : "🔒"}</Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: showExplore && exploreUnlocked ? "700" : "500",
                      color: exploreUnlocked ? (showExplore ? "#8b5cf6" : "#888") : "#bbb",
                    }}
                  >
                    {exploreLoading ? "Exploring..." : "Flavor Explorer"}
                  </Text>
                </Pressable>
              );
            })()}
          </View>}

          <View style={{ marginTop: 8 }}>
            <Button
              title={loading ? "Loading..." : hasRecommended ? "Refresh Classics" : "Recommend Classics"}
              onPress={() => regenerateRecipes()}
              disabled={loading || activeIngredients.length === 0}
            />
          </View>
        </View>
      </View>

      {hasRecommended ? (
        <View style={{ gap: 12 }}>
          <Section title="Ready" items={ready} tone="ready" />
          <Section title="1 missing" items={oneMissing} tone="one_missing" />
          <Section title="2 missing" items={twoMissing} tone="two_missing" />

          {visibleRecipeCount === 0 ? (
            <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
              <Text style={{ fontWeight: "800" }}>No matches</Text>
              <Text style={{ color: "#666" }}>
                No suitable classic cocktails match your current ingredients. Please add more ingredients and try again.
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Stage 10: Flavor Explorer results — hidden during development */}
      {false && showExplore && exploreResults.length > 0 ? (
        <View style={{ gap: 10 }}>
          <View style={{ padding: 12, borderWidth: 1, borderRadius: 12, gap: 10, borderColor: "#8b5cf6" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: "#8b5cf6" }} />
              <View
                style={{
                  borderWidth: 1,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  backgroundColor: "#8b5cf618",
                  borderColor: "#8b5cf6",
                }}
              >
                <Text style={{ fontWeight: "900", color: "#8b5cf6" }}>
                  🧭 Explore ({exploreResults.length})
                </Text>
              </View>
            </View>

            {exploreMeta?.explore_dims ? (
              <Text style={{ color: "#666", fontSize: 12 }}>
                {isZh ? "探索方向：" : "Exploring: "}
                {(exploreMeta.explore_dims as any[]).map((d: any) => d.label || d.dim).join(", ")}
              </Text>
            ) : null}

            {exploreResults.map((r, idx) => {
              const name = String(r?.name ?? "").trim() || "Recipe";
              return (
                <View
                  key={`explore-${r.iba_code}-${idx}`}
                  style={{
                    borderWidth: 1,
                    borderRadius: 12,
                    padding: 12,
                    gap: 8,
                    borderColor: "#e5e7eb",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Text style={{ fontWeight: "800", flex: 1 }} numberOfLines={1}>
                      {name}
                    </Text>
                    <Pressable
                      onPress={() => openRecipeInTab2(r as any, idx)}
                      style={{
                        borderWidth: 1,
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ fontWeight: "800" }}>View</Text>
                    </Pressable>
                  </View>

                  {Array.isArray(r.reasons) && r.reasons.length > 0 ? (
                    <View style={{ gap: 2 }}>
                      {r.reasons.map((reason, ri) => (
                        <Text key={ri} style={{ color: "#555", fontSize: 13 }}>
                          {reason}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : false && showExplore && exploreMeta?.reason === "insufficient_data" ? (
        <View style={{ padding: 12, borderWidth: 1, borderRadius: 12, borderColor: "#8b5cf6" }}>
          <Text style={{ fontWeight: "700", color: "#8b5cf6" }}>🧭 Flavor Explorer</Text>
          <Text style={{ color: "#666", marginTop: 4 }}>
            {exploreMeta?.message || (isZh ? "需要更多互動資料才能生成探險推薦" : "Need more interactions to generate explore recommendations")}
          </Text>
        </View>
      ) : null}
    </ScrollView>

    {inventoryModalTarget ? (
      <AddToInventoryModal
        visible={true}
        ingredientKey={inventoryModalTarget.canonical}
        displayName={inventoryModalTarget.display}
        onClose={() => setInventoryModalTarget(null)}
        onConfirm={handleAddToInventory}
      />
    ) : null}
    </>
  );
}
