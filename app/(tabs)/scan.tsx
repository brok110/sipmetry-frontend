import FontAwesome from "@expo/vector-icons/FontAwesome";
import { apiFetch } from "@/lib/api";
import { log, warn } from "@/lib/logger";
import AddToInventoryModal from "@/components/AddToInventoryModal";
import StaplesModal from "@/components/StaplesModal";
import GuideBubble, { GUIDE_KEYS, dismissGuide, isGuideDismissed } from "@/components/GuideBubble";
import SwipeRow from "@/components/ui/SwipeRow";
import OaklandDusk from "@/constants/OaklandDusk";
import { useAuth } from "@/context/auth";
import { useFavorites } from "@/context/favorites";
import { useFeedback } from "@/context/feedback";
import { useInteractions } from "@/context/interactions";
import { useInventory } from "@/context/inventory";
import { useLearnedPreferences } from "@/context/learnedPreferences";
import {
  aggregateIngredientVectors,
  fetchCategoryMap,
  getUnknownIngredients,
  isAlcoholicIngredient,
  normalizeIngredientKey,
} from "@/context/ontology";
import { usePreferences as usePreferencesContext } from "@/context/preferences";

import * as Sentry from "@sentry/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
    confidence?: string;
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
  confidence?: "high" | "low";
};

function getTasteTags(vec: Record<string, any> | null | undefined, max = 4): string[] {
  if (!vec) return [];
  const tags: string[] = [];
  const v = (k: string) => Number(vec[k] ?? 0);
  if (v("alcoholStrength") >= 2.0) tags.push("Strong");
  else if (v("alcoholStrength") >= 1.0) tags.push("Medium");
  else if (v("alcoholStrength") > 0) tags.push("Light");
  if (v("sweetness") >= 0.5) tags.push("Sweet");
  if (v("sourness") >= 0.5) tags.push("Sour");
  if (v("bitterness") >= 0.5) tags.push("Bitter");
  if (v("fruity") >= 0.5) tags.push("Fruity");
  if (v("herbal") >= 0.3) tags.push("Herbal");
  if (v("smoky") >= 0.5) tags.push("Smoky");
  if (v("fizz") >= 0.5) tags.push("Fizzy");
  if (v("body") >= 1.0) tags.push("Full-bodied");
  return tags.slice(0, max);
}

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

  // --- Citrus juices (must come before bare "lime"/"lemon" checks) ---
  if (/lime\s*juice|fresh\s*lime/.test(s)) return "lime_juice";
  if (/lemon\s*juice|fresh\s*lemon/.test(s)) return "lemon_juice";
  if (/orange\s*juice/.test(s)) return "orange_juice";
  if (/grapefruit\s*juice/.test(s)) return "grapefruit_juice";
  if (/pineapple\s*juice/.test(s)) return "pineapple_juice";
  if (/cranberry\s*juice/.test(s)) return "cranberry_juice";

  // --- Common mixers / syrups ---
  if (/simple\s*syrup|sugar\s*syrup|gomme/.test(s)) return "simple_syrup";
  if (/ginger\s*beer/.test(s)) return "ginger_beer";
  if (/ginger\s*ale/.test(s)) return "ginger_ale";
  if (/tonic\s*water|tonic/.test(s)) return "tonic_water";
  if (/soda\s*water|club\s*soda/.test(s)) return "soda_water";
  if (/coconut\s*cream/.test(s)) return "coconut_cream";
  if (/grenadine/.test(s)) return "grenadine";

  // --- Base spirits ---
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
      const confidence = String(it?.confidence ?? "").trim();
      return {
        id: `scan-${idx}-${display || canonical}`,
        display: display || canonical || "(unknown)",
        canonical,
        isUserAdded: false,
        confidence: confidence === "low" ? "low" : "high",
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
      confidence: "high",
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
  const [showPhotoTips, setShowPhotoTips] = useState(true);

  const [newIngredient, setNewIngredient] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  // Inventory Modal state
  const [inventoryModalTarget, setInventoryModalTarget] = useState<ActiveIngredient | null>(null);

  // Staples Modal state
  const [showStaplesModal, setShowStaplesModal] = useState(false);

  // Dual-path scan state (Stage 2)
  type ScanMode = "undecided" | "inventory" | "quick_look";
  const [scanMode, setScanMode] = useState<ScanMode>("undecided");
  const [multiScanResults, setMultiScanResults] = useState<ActiveIngredient[]>([]);
  const [scanCount, setScanCount] = useState(0);
  const [scanPhase, setScanPhase] = useState<"idle" | "scanning" | "choice" | "accumulating" | "review">("idle");
  // Incremented once per completed batch (full photo queue drained); drives "Scan More or Done" alert
  const [batchCompleteCount, setBatchCompleteCount] = useState(0);

  // Guide bubble state (Stages 2-4)
  const [guideScanVisible, setGuideScanVisible] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(false);

  // BYPASSED: auto-add replaces manual add-to-bar flow
  // const [showAddToBar, setShowAddToBar] = useState(false);
  // const [addedToBar, setAddedToBar] = useState<Set<string>>(new Set());
  // const [newIngredients, setNewIngredients] = useState<ActiveIngredient[]>([]);
  // const [guideAddBarVisible, setGuideAddBarVisible] = useState(false);

  // Guide #4
  const [guideCocktailsVisible, setGuideCocktailsVisible] = useState(false);
  const { session } = useAuth();
  const { availableIngredientKeys, inventoryByIngredientKey, initialized: inventoryInitialized, refreshInventory, addInventoryItem } = useInventory();

  const isInInventory = useCallback((canonical: string): boolean => {
    const key = String(canonical ?? "").trim().toLowerCase().replace(/\s+/g, "_");
    if (!key) return false;
    return key in inventoryByIngredientKey;
  }, [inventoryByIngredientKey]);
  const [pendingScrollIndex, setPendingScrollIndex] = useState<number | null>(null);

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const feedback = useFeedback() as any;
  const ratingsByKey: Record<string, "like" | "dislike"> =
    feedback?.ratingsByKey ?? feedback?.ratings ?? {};
  const ratingMetaByKey: Record<string, any> = feedback?.ratingMetaByKey ?? {};

  const { favoritesByKey } = useFavorites();
  const { queueView, flushViews } = useInteractions();

  // Ensure category map is loaded; triggers re-render when fetch completes.
  const [categoryMapReady, setCategoryMapReady] = useState(false);
  useEffect(() => {
    if (!session) return;
    fetchCategoryMap(session).then(() => setCategoryMapReady(true)).catch(() => setCategoryMapReady(true));
  }, [session]);

  const SCAN_COUNT_KEY = "sipmetry_scan_count";
  const PHOTO_TIPS_THRESHOLD = 3;

  useEffect(() => {
    AsyncStorage.getItem(SCAN_COUNT_KEY).then((val) => {
      const count = parseInt(val || "0", 10);
      if (count >= PHOTO_TIPS_THRESHOLD) {
        setShowPhotoTips(false);
      }
    });
  }, []);

  // Initialize guide bubble visibility from AsyncStorage
  useEffect(() => {
    isGuideDismissed(GUIDE_KEYS.SCAN).then((dismissed) => {
      setGuideScanVisible(!dismissed);
    });
    // BYPASSED: auto-add replaces manual add-to-bar flow
    // isGuideDismissed(GUIDE_KEYS.ADD_BAR).then((dismissed) => {
    //   setGuideAddBarVisible(!dismissed);
    // });
    isGuideDismissed(GUIDE_KEYS.COCKTAILS).then((dismissed) => {
      setGuideCocktailsVisible(!dismissed);
    });
  }, []);

  // Auto-analyze when image is ready
  useEffect(() => {
    if (autoAnalyze && imageUri) {
      setAutoAnalyze(false);
      analyze();
    }
  }, [autoAnalyze, imageUri]);

  // Path choice alert — fires when scan phase becomes "choice"
  useEffect(() => {
    if (scanPhase !== "choice" || multiScanResults.length === 0) return;
    const n = multiScanResults.length;
    Alert.alert(
      "What would you like to do?",
      `${n} bottle${n !== 1 ? "s" : ""} identified`,
      [
        {
          text: "Add to My Bar",
          onPress: async () => {
            setScanMode("inventory");
            if (session) {
              for (const ing of multiScanResults) {
                if (isAlcoholicIngredient(ing.canonical) === false) continue;
                if (isInInventory(ing.canonical)) continue;
                try {
                  await addInventoryItem({
                    ingredient_key: ing.canonical,
                    display_name: ing.display,
                    total_ml: 750,
                    remaining_pct: 100,
                  });
                } catch {}
              }
              await refreshInventory({ silent: true });
            }
            // Trigger "Scan More or Done" alert (after all inventory adds complete)
            setScanPhase("accumulating");
            setBatchCompleteCount((c) => c + 1);
          },
        },
        {
          text: "Just See Recipes",
          onPress: () => {
            setScanMode("quick_look");
            // Same "Scan More or Done" flow as inventory
            setScanPhase("accumulating");
            setBatchCompleteCount((c) => c + 1);
          },
        },
      ],
      { cancelable: false }
    );
  }, [scanPhase, multiScanResults.length]);

  // "Scan More or Done" alert — fires once per completed batch via batchCompleteCount
  // Path A (inventory): distinguishes alcoholic (saved to bar) vs non-alcoholic (used for recipes only)
  // Path B (quick_look): simple item count, no inventory distinction
  useEffect(() => {
    if (scanPhase !== "accumulating") return;
    if (scanMode !== "inventory" && scanMode !== "quick_look") return;

    let title = "";
    let subtitle = "";

    if (scanMode === "inventory") {
      // Path A: distinguish alcoholic (saved) vs non-alcoholic (not saved but used for recipes)
      const alcoholic = multiScanResults.filter(
        (ing) => isAlcoholicIngredient(ing.canonical) !== false
      );
      const nonAlcoholic = multiScanResults.filter(
        (ing) => isAlcoholicIngredient(ing.canonical) === false
      );
      // Only count items not already in the bar
      const newlyAdded = alcoholic.filter((ing) => !isInInventory(ing.canonical));
      const addedCount = newlyAdded.length;

      if (addedCount > 0) {
        title = `${addedCount} bottle${addedCount !== 1 ? "s" : ""} added to My Bar`;
      } else if (alcoholic.length > 0) {
        title = "Already in your bar";
      } else {
        title = "No spirits found";
      }

      if (nonAlcoholic.length > 0) {
        const names = nonAlcoholic.map((x) => x.display).join(", ");
        subtitle = `ℹ️ ${names} — not a spirit, still used for recipes`;
      }
    } else {
      // Path B: simple count, no inventory distinction
      const n = multiScanResults.length;
      title = `${n} item${n !== 1 ? "s" : ""} found`;
    }

    Alert.alert(
      title,
      subtitle,
      [
        {
          text: "Scan More",
          onPress: () => {
            Alert.alert(
              "Scan bottles",
              "Choose an option",
              [
                { text: "Take a photo", onPress: () => takePhoto() },
                { text: "Choose from library", onPress: () => pickImage() },
                { text: "Cancel", style: "cancel", onPress: () => setScanPhase("review") },
              ]
            );
          },
        },
        { text: "Done", onPress: () => setScanPhase("review") },
      ],
      { cancelable: false }
    );
  }, [batchCompleteCount, scanMode]);

  const [hasRecommended, setHasRecommended] = useState(false);
  const [hasRecommendedLocal, setHasRecommendedLocal] = useState(false);

  const { preferences, resolvedVector, resolvedMeta } = usePreferencesContext();
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
      return JSON.stringify({
        resolvedVector: resolvedVector ?? {},
        safetyMode: preferences?.safetyMode ?? {},
      });
    } catch {
      return "{}";
    }
  }, [resolvedVector, preferences?.safetyMode]);

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

  const pingApi = async () => {
    try {
      const r = await apiFetch("/health", { session });
      const j = await r.json();

      Alert.alert("API /health", JSON.stringify(j));
    } catch (e: any) {
      Alert.alert("API error", String(e?.message || e));
    }
  };

  const scrollRef = useRef<ScrollView>(null);
  const ingredientYRef = useRef<Record<number, number>>({});
  // Queue for sequential processing of multi-selected photos from library
  const imageQueueRef = useRef<Array<{ uri: string; base64: string | null }>>([]);

  const invalidateRecipes = () => {
    setRecipes([]);
    setHasRecommended(false);
    setHasRecommendedLocal(false);
  };

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

    const overlapHitsRaw = Array.isArray(r?.overlap_hits) ? r.overlap_hits : [];
    const overlap_hits_json = encodeURIComponent(
      JSON.stringify(overlapHitsRaw.map((x: any) => String(x ?? "").trim()).filter(Boolean))
    );

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
        overlap_hits_json,
      },
    });
  };

  const resolveCanonicalForDisplay = async (display: string): Promise<string> => {
    const hint = inferCanonicalFromDisplay(display);
    if (hint) return hint;

    const v = String(display || "").trim();
    if (!v) return "";

    // F3 Security: removed /debug/canonicalize call (requires admin auth).
    // Use local normalizeIngredientKey instead — backend /inventory POST
    // also applies smartCanonicalize as a safety net.
    return String(normalizeIngredientKey(v) || "").trim();
  };

  const regenerateRecipes = async (
    overrideIngredients?: ActiveIngredient[],
    staplesKeys: string[] = [],
    mode: "inventory" | "quick_look" = "quick_look"
  ) => {
    if (!process.env.EXPO_PUBLIC_API_URL) {
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
    setError(null);
    setRecipes([]);
    setHasRecommended(true);
    setHasRecommendedLocal(true);

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
          warn("[recommend] failed to canonicalize scanned ingredient", {
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
                warn("[recommend] failed to canonicalize inventory ingredient", {
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
          warn("[recommend] failed to canonicalize inventory ingredient", {
            ingredient_key: String(key ?? "").trim(),
          });
        }
      }

      const mergedIngredients = dedupeCaseInsensitive(
        [...canonicalDeduped, ...inventoryKeys, ...staplesKeys]
          .map(canonicalizeForRecommendation)
          .filter((key) => {
            if (key) return true;
            return false;
          })
      ).sort((a, b) => a.localeCompare(b));

      const localeForApi = isZh ? "zh" : "en";

      // DEBUG: log canonicalization result before sending to backend
      log("[DEBUG] canonicalDeduped:", canonicalDeduped);
      log("[DEBUG] mergedIngredients:", mergedIngredients);

      // Stage 7: build request body with optional mood filter
      const resp = await apiFetch("/recommend-classics", {
        session,
        method: "POST",
        body: {
          detected_ingredients: mergedIngredients,
          locale: localeForApi,
          user_preference_vector: resolvedVector05,
        },
      });

      const dataText = await resp.text();
      let dataParsed: any = null;
      try {
        dataParsed = dataText ? JSON.parse(dataText) : null;
      } catch {
        dataParsed = null;
      }

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

      const flattenedWithSafety: ClassicItem[] = [
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

      const flattened = flattenedWithSafety.filter((recipe) => {
        if (preferences.safetyMode.avoidHighProof && recipe.alcohol_warning) return false;
        if (preferences.safetyMode.avoidAllergens && recipe.allergen_warning) return false;
        if (preferences.safetyMode.avoidCaffeineAlcohol && recipe.caffeine_warning) return false;
        return true;
      });

      if (flattened.length === 0) {
        setRecipes([]);
        setStage("idle");
        setError(null);
        return;
      }

      setRecipes(flattened);
      setStage("idle");

      // Stage 4: navigate to dedicated recommendations page
      router.push({
        pathname: "/recommendations",
        params: {
          recipes: JSON.stringify(flattened),
          ingredientCount: String(sourceIngredients.length),
          activeCanonical: JSON.stringify(canonicalDeduped),
          scanItems: JSON.stringify(
            (overrideIngredients ?? activeIngredients).map((x) => ({
              canonical: String(normalizeIngredientKey(String(x?.canonical ?? "")) || "").trim(),
              display: String(x?.display ?? "").trim(),
            }))
          ),
          mode,
        },
      });
      // Note: recipe_vec is embedded in each recipe item in the flattened array

      // Stage 1: batch-track "view" for all returned recommendations
      for (let i = 0; i < flattened.length; i++) {
        const r = flattened[i];
        const rk = String(r?.recipe_key ?? r?.iba_code ?? "").trim();
        if (!rk) continue;
        queueView({
          recipe_key: rk,
          context: {
            source: "recommend",
            has_ingredients: r?.bucket === "ready",
            position: i,
          },
        });
      }
      flushViews();
    } catch (e: any) {
      setError(e?.message ?? "Failed to recommend classics.");
      setStage("idle");
    } finally {
      setLoading(false);
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
        API_URL: process.env.EXPO_PUBLIC_API_URL ?? "(missing)",
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
        raw_recipe_count: Array.isArray(recipes) ? recipes.length : 0,
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
      allowsMultipleSelection: true,
      quality: 0.9,
      exif: false,
      base64: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) return;

    // Reset scan state for the new batch (only when undecided / starting fresh)
    if (scanMode === "undecided") {
      setActiveIngredients([]);
      setMultiScanResults([]);
      setScanCount(0);
      setRecipes([]);
      setSafety(null);
      setHasRecommended(false);
      setHasRecommendedLocal(false);
    }
    setStage("idle");

    // Queue remaining photos (index 1+) for sequential processing after the first
    imageQueueRef.current = result.assets.slice(1).map((a) => ({
      uri: a.uri,
      base64: a.base64 ?? null,
    }));

    // Kick off first photo via the existing autoAnalyze mechanism
    const first = result.assets[0];
    setImageUri(first.uri);
    setPickedBase64(first.base64 ?? null);
    setAutoAnalyze(true);
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
    setAutoAnalyze(true);

    if (scanMode === "undecided") {
      setActiveIngredients([]);
      setMultiScanResults([]);
      setScanCount(0);
      setRecipes([]);
      setSafety(null);
      setHasRecommended(false);
      setHasRecommendedLocal(false);
    }
    setStage("idle");
  };

  const analyze = async () => {
    if (!imageUri) return;

    if (!process.env.EXPO_PUBLIC_API_URL) {
      setError("Missing EXPO_PUBLIC_API_URL. Please check .env.");
      return;
    }

    setLoading(true);
    setStage("identifying ingredients");
    setLastHttpStatus(null);
    setLastUploadInfo(null);
    setLastAnalyzeResponseText(null);
    setLastAnalyzeResponseJson(null);
    setError(null);

    setActiveIngredients([]);
    setRecipes([]);
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

      let resp = await apiFetch("/analyze-image", {
        session,
        method: "POST",
        body: { image_base64: pre.base64, return_raw: true, return_detected_items: true, return_display: true },
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

        resp = await apiFetch("/analyze-image", {
          session,
          method: "POST",
          body: { image_base64: pre2.base64, return_raw: true, return_detected_items: true, return_display: true },
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

          resp = await apiFetch("/analyze-image", {
            session,
            method: "POST",
            body: { image_base64: pre3.base64, return_raw: true, return_detected_items: true, return_display: true },
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

            resp = await apiFetch("/analyze-image", {
              session,
              method: "POST",
              body: { image_base64: pre4.base64, return_raw: true, return_detected_items: true, return_display: true },
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

      try {
        Sentry.addBreadcrumb({
          category: "scan",
          message: "scan_complete",
          data: { detected_count: nextWithCanonicalNormalized.length },
          level: "info",
        });
      } catch {}

      setPickedBase64(null);

      // BYPASSED: auto-add replaces manual add-to-bar flow
      // const detected = nextWithCanonicalNormalized.filter(
      //   (ing) =>
      //     ing.canonical &&
      //     !inventoryByIngredientKey[ing.canonical] &&
      //     isAlcoholicIngredient(ing.canonical) !== false
      // );
      // if (detected.length > 0) {
      //   setNewIngredients(detected);
      //   setAddedToBar(new Set());
      //   setShowAddToBar(true);
      // }

      // Dual-path: accumulate scan results and branch based on scanMode
      setMultiScanResults((prev) => {
        const existing = new Set(prev.map((x) => x.canonical).filter(Boolean));
        const newItems = nextWithCanonicalNormalized.filter(
          (x) => x.canonical && !existing.has(x.canonical)
        );
        return [...prev, ...newItems];
      });
      setScanCount((c) => c + 1);

      // Inventory mode: add this photo's bottles to My Bar as they come in
      if (scanMode === "inventory" && session) {
        for (const ing of nextWithCanonicalNormalized) {
          if (isAlcoholicIngredient(ing.canonical) === false) continue;
          if (isInInventory(ing.canonical)) continue;
          try {
            await addInventoryItem({
              ingredient_key: ing.canonical,
              display_name: ing.display,
              total_ml: 750,
              remaining_pct: 100,
            });
          } catch {}
        }
        await refreshInventory({ silent: true });
      }

      setError(null);

      AsyncStorage.getItem(SCAN_COUNT_KEY).then((val) => {
        const count = parseInt(val || "0", 10) + 1;
        AsyncStorage.setItem(SCAN_COUNT_KEY, String(count));
        if (count >= PHOTO_TIPS_THRESHOLD) {
          setShowPhotoTips(false);
        }
      });

      // Pop next queued photo.
      // Only transition phase AFTER the whole batch (queue) is drained — this ensures
      // "What would you like to do?" and "Scan More or Done" each appear exactly once.
      const nextAsset = imageQueueRef.current.shift();
      if (nextAsset) {
        // More photos remaining — continue processing silently
        setImageUri(nextAsset.uri);
        setPickedBase64(nextAsset.base64);
        setAutoAnalyze(true);
      } else {
        // Entire batch complete — trigger the appropriate dialog
        if (scanMode === "undecided") {
          setScanPhase("choice");
        } else {
          // inventory or quick_look: show "Scan More or Done"
          setScanPhase("accumulating");
          setBatchCompleteCount((c) => c + 1);
        }
      }

    } catch (e: any) {
      setError(e?.message ?? "Failed to analyze image.");
      setStage("idle");
      // Clear queue on error so stale photos don't carry over
      imageQueueRef.current = [];
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

    if (recipes.length > 0) invalidateRecipes();

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

  // ── Guide: Scan bottles action sheet ─────────────────────────────────────
  const handleScanBottles = () => {
    dismissGuide(GUIDE_KEYS.SCAN);
    setGuideScanVisible(false);

    // resetScan() is deferred to when the user actually commits to a new scan.
    // This way pressing Cancel leaves the previous session intact so the user
    // can still tap "Show me recipes" if ingredients were already identified.
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Take a photo", "Choose from library"],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) { resetScan(); takePhoto(); }
          else if (buttonIndex === 2) { resetScan(); pickImage(); }
          // buttonIndex === 0 (Cancel): do nothing, preserve previous state
        }
      );
    } else {
      Alert.alert("Scan bottles", "Choose an option", [
        { text: "Cancel", style: "cancel" },
        { text: "Take a photo", onPress: () => { resetScan(); takePhoto(); } },
        { text: "Choose from library", onPress: () => { resetScan(); pickImage(); } },
      ]);
    }
  };

  const resetScan = () => {
    setScanMode("undecided");
    setMultiScanResults([]);
    setScanCount(0);
    setScanPhase("idle");
    setBatchCompleteCount(0);
    imageQueueRef.current = [];
    setActiveIngredients([]);
    setImageUri(null);
    setPickedBase64(null);
    setRecipes([]);
    setError(null);
    setSafety(null);
    setHasRecommended(false);
    setHasRecommendedLocal(false);
  };

  const removeIngredient = (idx: number) => {
    if (recipes.length > 0) invalidateRecipes();
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
    // Canonicalize the ingredient_key before sending to avoid duplicates
    // caused by the AI returning inconsistent keys (e.g. "rum" vs "white_rum").
    // Falls back to the raw key if the network call fails — the backend
    // POST /inventory also applies smartCanonicalize as a safety net.
    let canonicalKey = payload.ingredient_key;
    try {
      const canonResponse = await apiFetch("/canonicalize", {
        session,
        method: "POST",
        body: { items: [payload.ingredient_key] },
      });
      const canonData = await canonResponse.json();
      canonicalKey = canonData?.canonical?.[0] || payload.ingredient_key;
      if (canonicalKey !== payload.ingredient_key) {
        log(`[handleAddToInventory] canonicalized: "${payload.ingredient_key}" → "${canonicalKey}"`);
      }
    } catch (err) {
      warn("[handleAddToInventory] canonicalize failed, using raw key:", err);
    }
    await addInventoryItem({ ...payload, ingredient_key: canonicalKey });
  };

  // BYPASSED: auto-add replaces manual add-to-bar flow
  // ── Add to My Bar helpers (Stage 3) ──────────────────────────────────────
  // const handleQuickAddToBar = async (ing: ActiveIngredient) => {
  //   try {
  //     await handleAddToInventory({
  //       ingredient_key: ing.canonical,
  //       display_name: ing.display,
  //       total_ml: 750,
  //       remaining_pct: 100,
  //     });
  //     setAddedToBar((prev) => new Set(prev).add(ing.canonical));
  //   } catch {
  //     // best-effort
  //   }
  // };

  // const handleAddAllToBar = async () => {
  //   dismissGuide(GUIDE_KEYS.ADD_BAR);
  //   setGuideAddBarVisible(false);
  //   for (const ing of newIngredients) {
  //     if (!addedToBar.has(ing.canonical)) {
  //       await handleQuickAddToBar(ing);
  //     }
  //   }
  //   setShowAddToBar(false);
  //   // Don't auto-regenerate — user taps sticky footer to see cocktails
  // };

  // const handleSkipAddToBar = () => {
  //   dismissGuide(GUIDE_KEYS.ADD_BAR);
  //   setGuideAddBarVisible(false);
  //   setShowAddToBar(false);
  //   // Don't auto-regenerate — user taps sticky footer to see cocktails
  // };

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

    if (recipes.length > 0) invalidateRecipes();

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

  return (
    <>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 120 : 0}
    >
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 88 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ fontSize: 20, fontWeight: "800", flex: 1, color: OaklandDusk.brand.gold }}>Sipmetry</Text>
      </View>


      <View style={{ position: "relative" }}>
        <GuideBubble
          storageKey={GUIDE_KEYS.SCAN}
          text={isZh ? "點這裡開始！" : "Tap here to start!"}
          visible={guideScanVisible}
          onDismiss={() => setGuideScanVisible(false)}
        />
        <Pressable
          onPress={handleScanBottles}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            height: 56,
            borderRadius: 16,
            backgroundColor: OaklandDusk.brand.gold,
          }}
        >
          <FontAwesome name="camera" size={18} color={OaklandDusk.bg.void} />
          <Text style={{ fontSize: 16, fontWeight: "800", color: OaklandDusk.bg.void }}>
            Scan bottles
          </Text>
        </Pressable>
      </View>

      {imageUri ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: "700", color: OaklandDusk.text.primary }}>Preview</Text>
          <Image
            source={{ uri: imageUri }}
            style={{ width: "100%", height: 260, borderRadius: 12 }}
            resizeMode="cover"
          />

          {loading && (
            <View style={{
              alignSelf: "stretch",
              padding: 20,
              borderRadius: 12,
              backgroundColor: OaklandDusk.bg.card,
              borderWidth: 1,
              borderColor: "rgba(200,120,40,.2)",
              alignItems: "center",
              gap: 12,
            }}>
              <ActivityIndicator size="large" color={OaklandDusk.brand.gold} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: OaklandDusk.brand.gold }}>
                {isZh ? "正在辨識你的酒瓶..." : "Identifying your bottles..."}
              </Text>
              <Text style={{ fontSize: 12, color: OaklandDusk.text.tertiary, textAlign: "center" }}>
                {isZh ? "這通常需要幾秒鐘" : "This usually takes a few seconds"}
              </Text>
            </View>
          )}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <View style={{ alignItems: "center", paddingVertical: 20, gap: 8 }}>
            <FontAwesome name="camera" size={40} color={OaklandDusk.text.tertiary} />
            <Text style={{ fontSize: 16, color: OaklandDusk.text.secondary, textAlign: "center" }}>
              {isZh ? "掃描你的酒瓶，找到完美雞尾酒" : "Scan your bottles to find cocktails"}
            </Text>
          </View>

          {showPhotoTips ? (
            <View style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 10,
              padding: 12,
              borderRadius: 10,
              backgroundColor: "#2A2518",
              borderWidth: 0.5,
              borderColor: "#5A4820",
            }}>
              <Text style={{ fontSize: 14 }}>💡</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 13, color: "#C8B880" }}>
                  {isZh
                    ? "標籤朝向鏡頭、光線充足，1-4 瓶不重疊"
                    : "Point labels at camera, good lighting, 1-4 bottles, no overlap"}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      )}

      {error ? (
        <View style={{ padding: 12, borderWidth: 1, borderRadius: 12, borderColor: OaklandDusk.accent.crimson, backgroundColor: OaklandDusk.accent.roseBg }}>
          <Text style={{ fontWeight: "800", color: OaklandDusk.accent.crimson }}>Error</Text>
          <Text style={{ color: OaklandDusk.text.secondary }}>{error}</Text>
        </View>
      ) : null}

      {safety && (safety.risk_level !== "none" || safety.non_consumable_items.length > 0) ? (
        <View style={{ padding: 12, borderWidth: 2, borderRadius: 12, borderColor: OaklandDusk.brand.rust, backgroundColor: OaklandDusk.brand.tagBg }}>
          <Text style={{ fontWeight: "900", marginBottom: 6, color: OaklandDusk.brand.sundown }}>Warning</Text>

          <Text style={{ marginBottom: 8, color: OaklandDusk.text.secondary }}>
            {safety.message && safety.message.trim()
              ? safety.message
              : safety.risk_level === "high"
              ? "Non-consumable item(s) detected. Do NOT ingest."
              : "Possible non-consumable item(s) detected. Do NOT ingest and please double-check."}
          </Text>

          <Text style={{ fontWeight: "800", marginBottom: 4, color: OaklandDusk.text.primary }}>Risk: {safety.risk_level}</Text>

          {safety.non_consumable_items.length > 0 ? (
            <View style={{ gap: 4 }}>
              <Text style={{ fontWeight: "800", color: OaklandDusk.text.primary }}>Detected:</Text>
              {safety.non_consumable_items.map((x, i) => (
                <Text key={i} style={{ color: OaklandDusk.text.secondary }}>• {x}</Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={{ padding: 12, borderWidth: 1, borderRadius: 12, borderColor: OaklandDusk.bg.border, backgroundColor: OaklandDusk.bg.card }}>
        <Text style={{ fontWeight: "800", marginBottom: 8, color: OaklandDusk.text.primary }}>Ingredients (editable)</Text>

        {activeIngredients.length === 0 ? (
          <Text style={{ color: OaklandDusk.text.tertiary }}>(No ingredients yet)</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {activeIngredients.map((ing, idx) => {
              const isEditing = editingId === ing.id;

              return (
                <SwipeRow
                  key={ing.id}
                  onEdit={() => startEditIngredient(ing.id, ing.display)}
                  onDelete={() => removeIngredient(idx)}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingVertical: 8,
                      paddingHorizontal: 4,
                      backgroundColor: OaklandDusk.bg.card,
                      borderRadius: 10,
                      marginBottom: 4,
                    }}
                  >
                    {isEditing ? (
                      <>
                        <TextInput
                          autoFocus
                          value={editingValue}
                          onChangeText={setEditingValue}
                          autoCapitalize="none"
                          maxLength={80}
                          placeholderTextColor={OaklandDusk.text.tertiary}
                          onFocus={(e) => {
                            scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(
                              e.target as any,
                              120,
                              true
                            );
                          }}
                          style={{
                            flex: 1,
                            borderWidth: 1,
                            borderRadius: 10,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderColor: OaklandDusk.brand.gold,
                            backgroundColor: OaklandDusk.bg.surface,
                            color: OaklandDusk.text.primary,
                          }}
                        />
                        <Pressable
                          onPress={() => { setEditingId(null); setEditingValue(""); }}
                          style={{ paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderRadius: 10, borderColor: OaklandDusk.bg.border }}
                        >
                          <Text style={{ fontWeight: "800", color: OaklandDusk.text.secondary }}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          onPress={saveEditIngredient}
                          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: OaklandDusk.brand.gold }}
                        >
                          <Text style={{ fontWeight: "800", color: OaklandDusk.bg.void }}>Save</Text>
                        </Pressable>
                      </>
                    ) : (
                      <>
                        {/* Gold dot */}
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: OaklandDusk.brand.gold, flexShrink: 0 }} />

                        <Text style={{ flex: 1, color: OaklandDusk.text.primary }} numberOfLines={1}>
                          {ing.display}
                          {ing.confidence === "low" && !ing.isUserAdded ? " ⚠️" : ""}
                        </Text>

                        {session ? (
                          (() => {
                            const alcoholic = isAlcoholicIngredient(ing.canonical);
                            log(`[bar-filter] canonical="${ing.canonical}" alcoholic=${alcoholic}`);
                            if (alcoholic === false) return null;
                            if (!isInInventory(ing.canonical)) return null;

                            // BYPASSED: auto-add replaces manual add-to-bar flow
                            // Read-only status badge — not tappable
                            return (
                              <View style={{
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                backgroundColor: OaklandDusk.bg.surface,
                                borderRadius: 8,
                                borderWidth: 0.5,
                                borderColor: "#7AB89A",
                              }}>
                                <Text style={{ fontWeight: "600", color: "#7AB89A", fontSize: 11 }}>
                                  In bar ✓
                                </Text>
                              </View>
                            );
                          })()
                        ) : null}
                      </>
                    )}
                  </View>
                </SwipeRow>
              );
            })}
          </View>
        )}

        {session && activeIngredients.some((ing) => isAlcoholicIngredient(ing.canonical) === false) ? (
          <View style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 6,
            paddingVertical: 6,
            paddingHorizontal: 4,
          }}>
            <Text style={{ fontSize: 12, color: OaklandDusk.text.tertiary, lineHeight: 18 }}>
              {isZh
                ? "ℹ️ Sipmetry 僅管理酒精類產品，果汁、糖漿等短效期材料不納入 My Bar"
                : "ℹ️ Sipmetry only manages spirits & liqueurs. Juices, syrups, and perishables are not tracked in My Bar."}
            </Text>
          </View>
        ) : null}

        {activeIngredients.some((ing) => ing.confidence === "low" && !ing.isUserAdded) ? (
          <View style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 6,
            paddingVertical: 6,
            paddingHorizontal: 4,
          }}>
            <Text style={{ fontSize: 12, color: OaklandDusk.brand.gold, lineHeight: 18 }}>
              {isZh
                ? "⚠️ 標有警告的項目辨識信心較低，點擊 ⚠️ 可以編輯修正"
                : "⚠️ Items marked with ⚠️ may be inaccurate. Tap to edit."}
            </Text>
          </View>
        ) : null}

        {/* Stage 2: accumulating + review — handled via Alert dialogs; no inline UI */}

        <View style={{ marginTop: 12, gap: 8 }}>
          <Text style={{ fontSize: 13, color: OaklandDusk.text.tertiary }}>Add ingredient</Text>

          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TextInput
              value={newIngredient}
              onChangeText={setNewIngredient}
              placeholder='e.g., "simple syrup"'
              placeholderTextColor={OaklandDusk.text.tertiary}
              autoCapitalize="none"
              maxLength={80}
              style={{
                flex: 1,
                borderWidth: 1,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderColor: OaklandDusk.bg.border,
                backgroundColor: OaklandDusk.bg.surface,
                color: OaklandDusk.text.primary,
                fontSize: 13,
              }}
            />
            <Pressable
              onPress={addIngredient}
              disabled={loading || !newIngredient.trim()}
              style={{
                backgroundColor: OaklandDusk.brand.gold,
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 8,
                opacity: loading || !newIngredient.trim() ? 0.4 : 1,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: OaklandDusk.bg.void }}>
                {isZh ? "加入" : "Add"}
              </Text>
            </Pressable>
          </View>

          {/* Stage 10: Flavor Explorer — future feature, not yet implemented */}

          {/* Stage 3: Add to My Bar — rendered as bottom sheet Modal below */}

          {/* Stage 4: Show me cocktails — moved to sticky footer below ScrollView */}
        </View>
      </View>

      {/* Recommendations are shown on the dedicated /recommendations page (Stage 4) */}

    </ScrollView>

    {/* Sticky "Show me recipes" footer
        - Hidden until user presses Done in the "Scan More or Done" alert
        - inventory: "Based on my bar" | quick_look: "Based on X ingredients" */}
    {!loading && scanPhase === "review" && scanMode !== "undecided" && (
      <View style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        paddingHorizontal: 16, paddingTop: 12,
        paddingBottom: Platform.OS === "ios" ? 16 : 12,
        backgroundColor: OaklandDusk.bg.void,
        borderTopWidth: 0.5, borderTopColor: OaklandDusk.bg.border,
      }}>
        <View style={{ position: "relative" }}>
          <GuideBubble
            storageKey={GUIDE_KEYS.COCKTAILS}
            text={isZh ? "看你的雞尾酒！" : "See your cocktails!"}
            visible={guideCocktailsVisible && activeIngredients.length > 0}
            onDismiss={() => setGuideCocktailsVisible(false)}
          />
          <Pressable
            onPress={() => {
              dismissGuide(GUIDE_KEYS.COCKTAILS);
              setGuideCocktailsVisible(false);
              setShowStaplesModal(true);
            }}
            style={{ backgroundColor: OaklandDusk.brand.gold, paddingVertical: 14, borderRadius: 12, alignItems: "center" }}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: OaklandDusk.bg.void }}>
              {isZh ? "看我能做什麼食譜" : "Show me recipes"}
            </Text>
            <Text style={{ fontSize: 12, color: OaklandDusk.bg.void, opacity: 0.7, marginTop: 2 }}>
              {scanMode === "inventory"
                ? (isZh ? "根據我的酒吧庫存" : "Based on my bar")
                : (() => {
                    // Use multiScanResults (all scans accumulated) not just the last scan
                    const n = multiScanResults.length > 0 ? multiScanResults.length : activeIngredients.length;
                    return isZh
                      ? `根據 ${n} 種材料`
                      : `Based on ${n} ingredient${n !== 1 ? "s" : ""}`;
                  })()}
            </Text>
          </Pressable>
        </View>
      </View>
    )}
    </KeyboardAvoidingView>

    {inventoryModalTarget ? (
      <AddToInventoryModal
        visible={true}
        ingredientKey={inventoryModalTarget.canonical}
        displayName={inventoryModalTarget.display}
        onClose={() => setInventoryModalTarget(null)}
        onConfirm={handleAddToInventory}
      />
    ) : null}

    <StaplesModal
      visible={showStaplesModal}
      loading={loading}
      onConfirm={(staplesKeys) => {
        setShowStaplesModal(false);
        const mode = scanMode === "inventory" ? "inventory" : "quick_look";
        // For quick_look: pass ALL accumulated scan results (multiScanResults),
        // not just the last scan's activeIngredients
        const ingredientSource = mode === "quick_look" && multiScanResults.length > 0
          ? multiScanResults
          : undefined;
        regenerateRecipes(ingredientSource, staplesKeys, mode);
      }}
      onCancel={() => setShowStaplesModal(false)}
    />

    {/* BYPASSED: auto-add replaces manual add-to-bar flow — bottom sheet removed */}
    {/* <Modal
      visible={showAddToBar && newIngredients.length > 0}
      transparent
      animationType="slide"
      onRequestClose={handleSkipAddToBar}
    >
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
        <Pressable style={{ flex: 1 }} onPress={handleSkipAddToBar} />
        <View style={{
          backgroundColor: OaklandDusk.bg.card,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingTop: 12,
          paddingHorizontal: 16,
          paddingBottom: 36,
          maxHeight: "70%",
        }}>
          <View style={{
            width: 36, height: 4, borderRadius: 2,
            backgroundColor: OaklandDusk.bg.border,
            alignSelf: "center", marginBottom: 16,
          }} />
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 8,
            padding: 8, borderRadius: 8,
            backgroundColor: "rgba(200,120,40,.08)",
            marginBottom: 10,
          }}>
            <View style={{
              width: 20, height: 20, borderRadius: 10,
              backgroundColor: OaklandDusk.brand.gold,
              alignItems: "center", justifyContent: "center",
            }}>
              <Text style={{ fontSize: 12, fontWeight: "800", color: OaklandDusk.bg.void }}>
                {newIngredients.length}
              </Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: "700", color: OaklandDusk.brand.gold }}>
              {isZh ? "偵測到新食材！" : "New ingredients detected!"}
            </Text>
          </View>
          <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
            {newIngredients.map((ing) => {
              const isAdded = addedToBar.has(ing.canonical);
              return (
                <View key={ing.id ?? ing.canonical} style={{
                  flexDirection: "row", alignItems: "center",
                  paddingVertical: 10,
                  borderBottomWidth: 0.5,
                  borderBottomColor: OaklandDusk.bg.border,
                }}>
                  <Text style={{ flex: 1, fontSize: 14, color: OaklandDusk.text.primary }}>
                    {ing.display}
                  </Text>
                  {isAdded ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <FontAwesome name="check" size={12} color="#6B8F6B" />
                      <Text style={{ fontSize: 12, color: "#6B8F6B" }}>Added</Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => handleQuickAddToBar(ing)}
                      style={{
                        backgroundColor: OaklandDusk.brand.gold,
                        paddingHorizontal: 12, paddingVertical: 5,
                        borderRadius: 8,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "700", color: OaklandDusk.bg.void }}>
                        {isZh ? "加入" : "Add"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </ScrollView>
          <View style={{ gap: 8, marginTop: 14 }}>
            <View style={{ position: "relative" }}>
              <GuideBubble
                storageKey={GUIDE_KEYS.ADD_BAR}
                text={isZh ? "儲存你的瓶子！" : "Save your bottles!"}
                visible={guideAddBarVisible}
                onDismiss={() => setGuideAddBarVisible(false)}
              />
              <Pressable onPress={handleAddAllToBar} style={{
                backgroundColor: OaklandDusk.brand.gold,
                paddingVertical: 14, borderRadius: 12, alignItems: "center",
              }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: OaklandDusk.bg.void }}>
                  {isZh ? "全部加入 My Bar" : "Add all to My Bar"}
                </Text>
              </Pressable>
            </View>
            <Pressable onPress={handleSkipAddToBar}>
              <Text style={{ fontSize: 13, color: OaklandDusk.text.tertiary, textAlign: "center" }}>
                {isZh ? "跳過 — 直接看雞尾酒" : "Skip — just show cocktails"}
              </Text>
            </Pressable>
            <Text style={{ fontSize: 11, color: OaklandDusk.text.tertiary, textAlign: "center" }}>
              {addedToBar.size} of {newIngredients.length} saved
            </Text>
          </View>
        </View>
      </View>
    </Modal> */}
    </>
  );
}
