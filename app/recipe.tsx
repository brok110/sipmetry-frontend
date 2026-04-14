import FontAwesome from "@expo/vector-icons/FontAwesome";
import HintBubble, { GUIDE_KEYS, TapPulse, dismissGuide, isGoldenPathStepReady, isGuideDismissed } from "@/components/GuideBubble";
import { useNavigation } from "@react-navigation/native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Image, Pressable, ScrollView, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import * as Sentry from "@sentry/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STAPLES_STORAGE_KEY } from "@/components/StaplesModal";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/context/auth";
import { apiFetch } from "@/lib/api";
import { getTasteTags } from "@/lib/tasteTags";
import { SoundService } from "@/lib/sounds";

import * as Clipboard from "expo-clipboard";

import { FeedbackRating, useFeedback } from "@/context/feedback";
import { useInteractions } from "@/context/interactions";
import { useInventory } from "@/context/inventory";
import {
  aggregateIngredientVectors,
  buildFourWordDescriptor,
  compareFlavorVectors,
  DEFAULT_FLAVOR_WEIGHTS,
  getUnknownIngredients,
  PreferencePreset,
  PRESET_VECTORS,
} from "@/context/ontology";
import { useFavorites } from "@/context/favorites";
import OaklandDusk from "@/constants/OaklandDusk";
import { useUnitPreference } from "@/hooks/useUnitPreference";

type DbRecipeIngredient = {
  sort_order: number;
  item: string;
  amount_ml: string | number | null;
  amount_text: string | null;
  unit: string | null;
  is_optional: boolean | null;
};

type DbRecipe = {
  iba_code: string;
  name: string;
  iba_category: string | null;
  method: string | null;
  glass: string | null;
  instructions: string | null;
  is_published: boolean | null;
  image_url?: string | null;
  ingredients: DbRecipeIngredient[];
  recipe_vec?: Record<string, any> | null;
};


export default function TabTwoScreen() {

  const router = useRouter();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    navigation?.setOptions?.({ title: "Recipe" });
  }, [navigation]);

  const params = useLocalSearchParams<{
    idx?: string;
    source?: string;
    recipe_json?: string;
    ingredients_json?: string;
    recipe_key?: string;
    iba_code?: string;
    missing_items_json?: string;
    scan_items_json?: string;
    overlap_hits_json?: string;
  }>();

  const paramToString = (v: any): string => {
    if (typeof v === "string") return v;
    if (Array.isArray(v) && typeof v[0] === "string") return v[0];
    return "";
  };

  const idxNum = Number(paramToString((params as any).idx) || "0");

  const legacyRecipe = useMemo(() => {
    try {
      const raw0 = paramToString((params as any).recipe_json);
      if (!raw0) return null;

      const tryParse = (s: string) => {
        const t = String(s || "").trim();
        if (!t) return null;
        try {
          return JSON.parse(t);
        } catch {
          return null;
        }
      };

      const direct = tryParse(raw0);
      if (direct) return direct;

      const once = tryParse(decodeURIComponent(raw0));
      if (once) return once;

      const twice = tryParse(decodeURIComponent(decodeURIComponent(raw0)));
      if (twice) return twice;

      return null;
    } catch {
      return null;
    }
  }, [params.recipe_json]);

  const ingredientsFromScan = useMemo<string[]>(() => {
    try {
      const raw0 = paramToString((params as any).ingredients_json);
      if (!raw0) return [];

      const tryParseArr = (s: string) => {
        const t = String(s || "").trim();
        if (!t) return null;
        try {
          const v = JSON.parse(t);
          return Array.isArray(v) ? v : null;
        } catch {
          return null;
        }
      };

      const direct = tryParseArr(raw0);
      if (direct) return direct;

      const once = tryParseArr(decodeURIComponent(raw0));
      if (once) return once;

      const twice = tryParseArr(decodeURIComponent(decodeURIComponent(raw0)));
      if (twice) return twice;

      return [];
    } catch {
      return [];
    }
  }, [params.ingredients_json]);

  const scanItems = useMemo<Array<{ canonical?: string; display?: string }>>(() => {
    try {
      const raw0 = paramToString((params as any).scan_items_json);
      if (!raw0) return [];

      const tryParse = (s: string) => {
        const t = String(s || "").trim();
        if (!t) return null;
        try {
          const v = JSON.parse(t);
          return Array.isArray(v) ? v : null;
        } catch {
          return null;
        }
      };

      const direct = tryParse(raw0);
      if (direct) return direct;

      const once = tryParse(decodeURIComponent(raw0));
      if (once) return once;

      const twice = tryParse(decodeURIComponent(decodeURIComponent(raw0)));
      if (twice) return twice;

      return [];
    } catch {
      return [];
    }
  }, [params.scan_items_json]);

  const scanDisplayByCanonical = useMemo(() => {
    const m: Record<string, string> = {};

    for (const it of scanItems) {
      const c = String((it as any)?.canonical ?? "").trim().toLowerCase();
      const d = String((it as any)?.display ?? "").trim();
      if (!c || !d) continue;
      if (!m[c]) m[c] = d;
    }

    return m;
  }, [scanItems]);

  // Parse overlap_hits from navigation params (passed from Scan results).
  // Used to show "✓ Detected" for ingredients found in the current scan session,
  // ensuring the Recipe detail page agrees with the Scan list's "Ready" judgment.
  const overlapHitsSet = useMemo(() => {
    try {
      const raw0 = paramToString((params as any).overlap_hits_json);
      if (!raw0) return new Set<string>();
      const tryParse = (s: string) => {
        const t = String(s || "").trim();
        if (!t) return null;
        try { const v = JSON.parse(t); return Array.isArray(v) ? v : null; } catch { return null; }
      };
      const arr = tryParse(raw0) ?? tryParse(decodeURIComponent(raw0)) ?? tryParse(decodeURIComponent(decodeURIComponent(raw0))) ?? [];
      return new Set<string>(arr.map((x: any) => String(x || "").trim()).filter(Boolean));
    } catch {
      return new Set<string>();
    }
  }, [(params as any).overlap_hits_json]);

  const humanizeKey = (k: string) => {
    const s = String(k || "").trim();
    if (!s) return "";
    return s
      .split("_")
      .filter(Boolean)
      .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : ""))
      .join(" ");
  };


  const resolveDisplayForIngredientKey = (ingredientKey: string): { display: string; substitute: boolean } => {
    const k = String(ingredientKey || "").trim().toLowerCase();
    if (!k) return { display: "", substitute: false };

    // Direct match from scan display names
    const direct = scanDisplayByCanonical[k];
    if (direct) return { display: direct, substitute: false };

    return { display: "", substitute: false };
  };

  const ibaCode = useMemo(() => {
    const fromParam = paramToString((params as any).iba_code).trim();
    const fromLegacy =
      legacyRecipe && typeof legacyRecipe === "object" && (legacyRecipe as any).iba_code
        ? String((legacyRecipe as any).iba_code).trim()
        : "";
    return fromParam || fromLegacy || "";
  }, [params.iba_code, legacyRecipe]);

  const { ratingsByKey, setRating, clearRating } = useFeedback();
  const { favoritesByKey, toggleFavorite, isAtLimit: favoritesAtLimit } = useFavorites();
  const { inventory, initialized: inventoryInitialized, refreshInventory, recordInventoryUse } = useInventory();
  const { track } = useInteractions();

  // Server-driven ingredient availability (SSoT)
  type IngredientAvailability = {
    ingredient_key: string;
    status: "in_bar" | "substitute" | "missing";
    matched_by: string | null;
    matched_display: string | null;
    remaining_volume: number | null;
  };
  const [ingredientAvailability, setIngredientAvailability] = useState<Record<string, IngredientAvailability> | null>(null);
  const [confirmedStaplesSet, setConfirmedStaplesSet] = useState<Set<string>>(new Set());

  const { session } = useAuth();
  const { unit: displayUnit } = useUnitPreference();

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dbRecipe, setDbRecipe] = useState<DbRecipe | null>(null);

  // Stage 3: First-interaction feedback toast
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const showFeedbackToast = useCallback((message: string) => {
    setFeedbackToast(message);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => setFeedbackToast(null));
  }, [toastOpacity]);

  const maybeShowFirstInteractionToast = useCallback(async (type: "favorite" | "like") => {
    try {
      const key = "sipmetry:first_interaction_toast_shown";
      const shown = await AsyncStorage.getItem(key);
      if (shown) return;
      await AsyncStorage.setItem(key, "1");
      const msg = type === "favorite"
        ? "Got it! We'll show you more drinks like this."
        : "Noted! Your recommendations will adapt.";
      showFeedbackToast(msg);
    } catch { /* ignore */ }
  }, [showFeedbackToast]);

  // Stage 9: 「我做了這杯！」確認流程
  // idle   → 顯示黑色「I made this! 🍹」
  // done   → 顯示綠色「Logged! 🍹」（3 秒）
  // hidden → 按鈕完全隱藏（3 秒後，直到離開再回來）
  type MadeDrinkState = 'idle' | 'done' | 'hidden'
  const [madeDrinkState, setMadeDrinkState] = useState<MadeDrinkState>('idle');
  const [madeDrinkLoading, setMadeDrinkLoading] = useState(false);
  const [servings, setServings] = useState(1);
  const [gpStep6Visible, setGpStep6Visible] = useState(false);
  const [shareHintVisible, setShareHintVisible] = useState(false);
  const [favHintVisible, setFavHintVisible] = useState(false);
  const madeDrinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stage 4: Track whether user took any positive action during this visit
  const hadPositiveActionRef = useRef(false);

  // Recipe hints — sequential chain: I made this → Share → Favorites
  // On mount, only show the first hint in the chain that hasn't been dismissed yet.
  useEffect(() => {
    (async () => {
      // Step 1: "I made this" (GP_STEP_6)
      const gpReady = await isGoldenPathStepReady(6);
      if (gpReady) {
        setGpStep6Visible(true);
        return; // Show only this one, wait for dismiss
      }

      // Step 2: Share — only if GP_STEP_6 already dismissed
      const shareDismissed = await isGuideDismissed(GUIDE_KEYS.RECIPE_SHARE);
      if (!shareDismissed) {
        setShareHintVisible(true);
        return; // Show only this one
      }

      // Step 3: Favorites — only if Share already dismissed
      const favDismissed = await isGuideDismissed(GUIDE_KEYS.RECIPE_FAV);
      if (!favDismissed) {
        setFavHintVisible(true);
      }
    })();
  }, []);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      setError(null);

      if (!ibaCode) {
        setDbRecipe(null);
        return;
      }

      setLoading(true);
      try {
        const resp = await apiFetch(`/recipes/${encodeURIComponent(ibaCode)}`, { session });
        if (!resp.ok) {
          const t = await resp.text();
          throw new Error(`Recipe API failed: ${resp.status} ${t}`);
        }

        const data = (await resp.json()) as { recipe?: DbRecipe };
        const r = (data as any)?.recipe ?? null;

        if (!alive) return;

        if (!r || !(r as any).iba_code) {
          setDbRecipe(null);
          setError("Recipe not found.");
          return;
        }

        const normalized: DbRecipe = {
          iba_code: String((r as any).iba_code || "").trim(),
          name: String((r as any).name || "").trim(),
          iba_category: (r as any).iba_category ?? null,
          method: (r as any).method ?? null,
          glass: (r as any).glass ?? null,
          instructions: (r as any).instructions ?? null,
          is_published: (r as any).is_published ?? null,
          image_url: typeof (r as any).image_url === "string" ? (r as any).image_url : null,
          ingredients: Array.isArray((r as any).ingredients)
            ? (r as any).ingredients.map((it: any) => {
                const amountMlRaw =
                  it?.amount_ml ??
                  it?.amountMl ??
                  it?.amountML ??
                  it?.ml ??
                  it?.amount;

                const amountTextRaw =
                  it?.amount_text ??
                  it?.amountText ??
                  (typeof it?.amount === "string" ? it.amount : null);

                return {
                  sort_order: Number(it?.sort_order ?? it?.sortOrder ?? 0) || 0,
                  item: String(it?.item ?? it?.name ?? "").trim(),
                  amount_ml:
                    amountMlRaw === null || amountMlRaw === undefined || amountMlRaw === ""
                      ? null
                      : amountMlRaw,
                  amount_text:
                    amountTextRaw === null ||
                    amountTextRaw === undefined ||
                    String(amountTextRaw).trim() === ""
                      ? null
                      : String(amountTextRaw).trim(),
                  unit:
                    it?.unit === null || it?.unit === undefined || String(it.unit).trim() === ""
                      ? null
                      : String(it.unit).trim(),
                  is_optional: Boolean(it?.is_optional ?? it?.isOptional ?? false),
                } as DbRecipeIngredient;
              })
            : [],
          recipe_vec: (r as any)?.recipe_vec ?? (r as any)?.recipeVec ?? null,
        };

        setDbRecipe(normalized);

        try {
          Sentry.addBreadcrumb({
            category: "recipe",
            message: "recipe_view",
            data: { recipe_name: normalized.name },
            level: "info",
          });
        } catch {}
      } catch (e: any) {
        if (!alive) return;
        setDbRecipe(null);
        setError(e?.message ?? "Failed to load recipe.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    run();

    return () => {
      alive = false;
    };
  }, [ibaCode]);

  // Fetch server-computed ingredient availability (SSoT)
  useEffect(() => {
    if (!ibaCode || !session) {
      setIngredientAvailability(null);
      return;
    }

    let alive = true;

    const fetchAvailability = async () => {
      // Read confirmed staples from AsyncStorage so the backend knows about them
      let confirmedStaples: string[] = [];
      try {
        const val = await AsyncStorage.getItem(STAPLES_STORAGE_KEY);
        if (val) {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) confirmedStaples = parsed;
        }
      } catch {}

      setConfirmedStaplesSet(new Set(confirmedStaples));

      try {
        const r = await apiFetch('/recipe-availability', {
          session,
          method: 'POST',
          body: {
            iba_code: ibaCode,
            confirmed_staples: confirmedStaples,
          },
        });
        if (!r.ok) throw new Error(`availability ${r.status}`);
        const data = await r.json();
        if (!alive) return;
        const map: Record<string, IngredientAvailability> = {};
        for (const ing of (data?.ingredients ?? [])) {
          if (ing?.ingredient_key) {
            map[ing.ingredient_key] = ing;
          }
        }
        setIngredientAvailability(map);
      } catch {
        if (alive) setIngredientAvailability(null);
      }
    };

    fetchAvailability();

    return () => { alive = false; };
  }, [ibaCode, session]);

  const recipe = dbRecipe ?? legacyRecipe;

  const recipeTitle = useMemo(() => {
    if (dbRecipe?.name) return dbRecipe.name;
    return String((recipe as any)?.short_name ?? (recipe as any)?.name ?? "Recipe").trim();
  }, [dbRecipe, recipe]);

  const stableRecipeKey = useMemo(() => {
    const fromParam = paramToString((params as any).recipe_key).trim();
    if (fromParam) return fromParam;

    const code = String(ibaCode || "").trim();
    if (code) return `${code}-${recipeTitle}`;

    return `${idxNum + 1}-${recipeTitle}`;
  }, [params.recipe_key, ibaCode, recipeTitle, idxNum]);

  const recipeKey = stableRecipeKey;

  // 離開畫面時重置（回來會重新看到「I made this!」，且 inventory 也會重新 fetch）
  useFocusEffect(
    useCallback(() => {
      hadPositiveActionRef.current = false;
      return () => {
        setMadeDrinkState('idle');
        setServings(1);
        if (madeDrinkTimerRef.current) {
          clearTimeout(madeDrinkTimerRef.current);
          madeDrinkTimerRef.current = null;
        }
        // Stage 4: Fire "skip" if user left without any positive action
        if (!hadPositiveActionRef.current && recipeKey) {
          track({
            recipe_key: recipeKey,
            interaction_type: "skip",
            context: {
              source: "detail",
              has_ingredients: ingredientsFromScan.length > 0,
            },
          });
        }
      };
    }, [recipeKey, ingredientsFromScan.length, track])
  );

  const currentRating: FeedbackRating | null = (ratingsByKey?.[recipeKey] as FeedbackRating) ?? null;

  const isFav = !!favoritesByKey?.[recipeKey];

  // Stage 1: track "click" when user opens recipe detail
  const clickTrackedRef = useRef(false);
  useEffect(() => {
    if (!recipeKey || clickTrackedRef.current) return;
    clickTrackedRef.current = true;
    track({
      recipe_key: recipeKey,
      interaction_type: "click",
      context: {
        source: "detail",
        has_ingredients: ingredientsFromScan.length > 0,
        ingredient_keys: ingredientsFromScan.slice(0, 20),
      },
    });
  }, [recipeKey]);

  useEffect(() => {
    setError(null);
  }, [recipeKey]);

  const recipeIngredientsForOntology = useMemo<string[]>(() => {
    if (dbRecipe?.ingredients && Array.isArray(dbRecipe.ingredients) && dbRecipe.ingredients.length > 0) {
      return dbRecipe.ingredients.map((it) => String(it?.item ?? "").trim()).filter(Boolean);
    }

    const legacy = legacyRecipe as any;
    const legacyList = Array.isArray(legacy?.ingredients_ml)
      ? legacy.ingredients_ml
      : Array.isArray(legacy?.ingredients)
      ? legacy.ingredients
      : null;

    if (Array.isArray(legacyList) && legacyList.length > 0) {
      return legacyList
        .map((x: any) => {
          if (typeof x === "string") return x.trim();
          if (x && typeof x === "object") return String(x.item ?? x.name ?? "").trim();
          return "";
        })
        .filter(Boolean);
    }

    return ingredientsFromScan;
  }, [dbRecipe, legacyRecipe, ingredientsFromScan]);

  const recipeFlavorVector = useMemo(() => {
    const v = (dbRecipe as any)?.recipe_vec ?? null;
    if (v && typeof v === "object") return v as any;
    return aggregateIngredientVectors(recipeIngredientsForOntology);
  }, [dbRecipe, recipeIngredientsForOntology]);

  const unknownIngredients = useMemo(() => {
    return getUnknownIngredients(recipeIngredientsForOntology);
  }, [recipeIngredientsForOntology]);

  const descriptor = useMemo(() => {
    return buildFourWordDescriptor(recipeFlavorVector);
  }, [recipeFlavorVector]);

  const stylePartRaw = useMemo(() => {
    const fromDb = dbRecipe?.iba_category ? String(dbRecipe.iba_category).trim() : "";
    const fromLegacy =
      legacyRecipe && typeof legacyRecipe === "object" && (legacyRecipe as any).iba_category
        ? String((legacyRecipe as any).iba_category).trim()
        : "";
    return fromDb || fromLegacy || "";
  }, [dbRecipe, legacyRecipe]);

  const tasteWords = Array.isArray((descriptor as any)?.words) ? (descriptor as any).words : [];
  const tastePart = tasteWords.length ? tasteWords.slice(0, 3).join(" • ") : "";

  const headerLine = [stylePartRaw].filter(Boolean).join(" • ");

  const tasteTags = useMemo(() => getTasteTags((dbRecipe as any)?.recipe_vec), [dbRecipe]);

  const subtitleTokensForFavorite = useMemo(() => {
    const tokens: string[] = [];
    if (stylePartRaw) tokens.push(stylePartRaw);
    if (tasteWords.length) tokens.push(...tasteWords.slice(0, 3));
    return tokens.filter((x) => String(x || "").trim());
  }, [stylePartRaw, tasteWords]);

  const prefPreset: PreferencePreset = "Balanced";
  const userPreferenceVector = useMemo(() => {
    return PRESET_VECTORS[prefPreset];
  }, [prefPreset]);

  const vectorComparison = useMemo(() => {
    return compareFlavorVectors(recipeFlavorVector, userPreferenceVector, DEFAULT_FLAVOR_WEIGHTS);
  }, [recipeFlavorVector, userPreferenceVector]);


  const copyDebug = async () => {
    try {
      const payload = {
        ibaCode,
        recipeTitle,
        recipeKey,
        API_URL: process.env.EXPO_PUBLIC_API_URL || "(missing)",
        subtitle: headerLine || "(none)",
        subtitle_tokens: subtitleTokensForFavorite,
        recipe_ingredients_for_ontology: recipeIngredientsForOntology,
        unknown_ingredients: unknownIngredients,
        recipe_flavor_vector: recipeFlavorVector,
        recipe_vec_source: (dbRecipe as any)?.recipe_vec ? "backend" : "local_ontology",
        backend_recipe_vec: (dbRecipe as any)?.recipe_vec ?? null,
        four_word_descriptor: descriptor,
        prefPreset,
        user_preference_vector: userPreferenceVector,
        comparison_rows: vectorComparison.rows,
        overall_score_100: vectorComparison.score100,
        db_loaded: Boolean(dbRecipe),
        scan_items: scanItems,
        scan_display_by_canonical: scanDisplayByCanonical,
        db_ingredient_display_preview: Array.isArray(dbRecipe?.ingredients)
          ? dbRecipe!.ingredients
              .slice()
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              .map((it) => {
                const key = String(it?.item ?? "").trim();
                const fromScan = resolveDisplayForIngredientKey(key);
                return { key, resolved: fromScan.display || null };
              })
          : null,
      };

      await Clipboard.setStringAsync(JSON.stringify(payload, null, 2));
      Alert.alert("Copied", "Debug JSON copied to clipboard.");
    } catch (e: any) {
      Alert.alert("Copy failed", String(e?.message || e));
    }
  };

  const doAddFavorite = () => {
    const safeTitle = String(recipeTitle || "").trim() || "Recipe";
    const code = String(ibaCode || (dbRecipe?.iba_code ?? "")).trim();

    toggleFavorite({
      recipe_key: recipeKey,
      iba_code: code || undefined,
      title: safeTitle,
      tags: subtitleTokensForFavorite,
      recipe: recipe,
      ingredients: ingredientsFromScan,
      image_url: dbRecipe?.image_url ?? null,
      saved_at: Date.now(),
    });
  };

  const onToggleFavorite = () => {
    const wasFav = !!favoritesByKey?.[recipeKey];

    // Guard: show alert if user tries to add when already at the 50-recipe limit
    if (!wasFav && favoritesAtLimit) {
      Alert.alert(
        "Favorites full",
        "You've reached the 50-recipe limit. Remove a favorite to add a new one."
      );
      return;
    }

    // Stage 1: track favorite/unfavorite
    track({
      recipe_key: recipeKey,
      interaction_type: wasFav ? "unfavorite" : "favorite",
      context: { source: "detail", has_ingredients: ingredientsFromScan.length > 0 },
    });
    // Stage 3: first-interaction toast (only on add, not remove)
    if (!wasFav) maybeShowFirstInteractionToast("favorite");
    // Stage 4: mark positive action (suppress skip on leave)
    if (!wasFav) hadPositiveActionRef.current = true;
    doAddFavorite();
  };

  const sendFeedback = async (next: FeedbackRating) => {
    setError(null);

    // Stage 1: track like/dislike
    track({
      recipe_key: recipeKey,
      interaction_type: next === "like" ? "like" : "dislike",
      context: { source: "detail", has_ingredients: ingredientsFromScan.length > 0 },
    });
    // Stage 3: first-interaction toast (only on like)
    if (next === "like") maybeShowFirstInteractionToast("like");
    // Stage 4: mark positive action (suppress skip on leave)
    if (next === "like") hadPositiveActionRef.current = true;

    const prev = (ratingsByKey?.[recipeKey] as FeedbackRating) ?? null;
    const code = String(ibaCode || (dbRecipe?.iba_code ?? "")).trim();

    setRating(recipeKey, next, {
      recipe_key: recipeKey,
      iba_code: code || undefined,
      title: String(recipeTitle || "").trim() || undefined,
      tags: subtitleTokensForFavorite,
      recipe,
      ingredients: ingredientsFromScan,
    });

    try {
      const resp = await apiFetch("/feedback", {
        session,
        method: "POST",
        body: { recipe_key: recipeKey, rating: next, recipe, ingredients: ingredientsFromScan, context: { app_version: "RECIPES_V1" } },
      });

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Feedback API failed: ${resp.status} ${t}`);
      }

    } catch (e: any) {
      if (prev) setRating(recipeKey, prev);
      else clearRating(recipeKey);
      setError(e?.message ?? "Failed to send feedback.");
    }
  };

  const createShareAndGo = async () => {
    setError(null);

    try {
      const resp = await apiFetch("/share-recipe", {
        session,
        method: "POST",
        body: { recipe, ingredients: ingredientsFromScan },
      });

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Share API failed: ${resp.status} ${t}`);
      }

      const data = (await resp.json()) as { share_id: string; share_url: string };

      const recipe_json = encodeURIComponent(JSON.stringify(recipe));
      const ingredients_json = encodeURIComponent(JSON.stringify(ingredientsFromScan));

      router.push({
        pathname: "/qr",
        params: {
          share_id: encodeURIComponent(data.share_id),
          share_url: encodeURIComponent(data.share_url),
          idx: String(idxNum),
          recipe_key: recipeKey,
          recipe_json,
          ingredients_json,
        },
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to create share link.");
    }
  };

  const handleNativeShare = async () => {
    try {
      const ingredientsList = dbRecipe?.ingredients
        ?.slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((it) => {
          const key = String(it?.item ?? "").trim();
          const name = key.replace(/_/g, " ");
          const ml = it?.amount_ml !== null && it?.amount_ml !== undefined ? Number(it.amount_ml) : null;
          const unit = it?.unit ? String(it.unit).trim() : "";

          let amount = "";
          if (Number.isFinite(ml)) {
            const scaled = ml! * servings;
            if (displayUnit === "oz") {
              const oz = scaled * 0.033814;
              amount = `${oz < 0.1 ? oz.toFixed(2) : oz.toFixed(1)} oz`;
            } else {
              amount = `${scaled} ml`;
            }
          } else if (it?.amount_text && String(it.amount_text).trim()) {
            amount = unit ? `${String(it.amount_text).trim()} ${unit}` : String(it.amount_text).trim();
          }

          return amount ? `• ${name} — ${amount}` : `• ${name}`;
        })
        .join("\n") ?? "";

      const title = recipeTitle || "Cocktail Recipe";
      const message = `${title}\n\n${ingredientsList}\n\nMade with Sipmetry\nhttps://sipmetry.app`;

      try {
        Sentry.addBreadcrumb({
          category: "recipe",
          message: "share_recipe",
          data: { recipe_name: title },
          level: "info",
        });
      } catch {}

      const result = await Share.share({ message, title });

      if (result.action === Share.dismissedAction) return;
      showFeedbackToast("Shared!");
    } catch (e: any) {
      if (String(e?.message ?? "").includes("cancel")) return;
      showFeedbackToast("Couldn't share this recipe");
    }
  };

  const handleSharePress = () => {
    if (!dbRecipe) return;
    Alert.alert(
      "Share Recipe",
      recipeTitle || "Share this cocktail",
      [
        {
          text: "Share as Text",
          onPress: handleNativeShare,
        },
        ...(session?.access_token
          ? [{
              text: "Show QR Code",
              onPress: createShareAndGo,
            }]
          : []),
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  };

  // Stage 9: 確認製作，扣除 My Bar 庫存
  const handleMadeDrink = async () => {
    if (gpStep6Visible) {
      dismissGuide(GUIDE_KEYS.GP_STEP_6);
      setGpStep6Visible(false);
      // Chain: show share hint next
      isGuideDismissed(GUIDE_KEYS.RECIPE_SHARE).then((d) => {
        if (!d) setShareHintVisible(true);
      });
    }
    if (!session?.access_token) {
      Alert.alert('Sign in required', 'Please sign in to track your usage.')
      return
    }

    if (!dbRecipe || dbRecipe.ingredients.length === 0) {
      Alert.alert('Not ready', 'Recipe not loaded yet. Please wait.')
      return
    }

    if (!process.env.EXPO_PUBLIC_API_URL) {
      Alert.alert('Error', 'Missing API URL.')
      return
    }

    try {
      // 1. Build recipe ingredient keys with amounts
      const recipeIngredientKeys = dbRecipe.ingredients
        .map((ing) => {
          const key = String(ing.item ?? '').trim()
          const ml = ing.amount_ml !== null && ing.amount_ml !== undefined ? Number(ing.amount_ml) : null
          if (!key || ml === null || !Number.isFinite(ml) || ml <= 0) return null
          return { key, amount_ml: ml }
        })
        .filter(Boolean) as Array<{ key: string; amount_ml: number }>

      if (recipeIngredientKeys.length === 0) {
        Alert.alert('Nothing to update', 'This recipe has no measurable ingredients.')
        return
      }

      // 2. Call backend to resolve which inventory items match
      const resolveResp = await apiFetch('/inventory/resolve-deductions', {
        session,
        method: 'POST',
        body: {
          recipe_ingredient_keys: recipeIngredientKeys,
          servings,
        },
      })

      if (!resolveResp.ok) {
        const errData = await resolveResp.json().catch(() => ({}))
        Alert.alert('Error', errData?.error ?? 'Failed to resolve ingredients')
        return
      }

      const { deductions } = (await resolveResp.json()) as {
        deductions: Array<{
          ingredient_id: string
          ingredient_key: string
          display_name: string
          amount_ml: number
          remaining_volume: number
          recipe_key: string
        }>
      }

      if (!deductions || deductions.length === 0) {
        Alert.alert(
          'Nothing to update',
          "None of this recipe's ingredients (with amounts) match your My Bar."
        )
        return
      }

      // 3. Confirm dialog
      const lines = deductions.map((x) => `• ${x.display_name}: −${x.amount_ml}ml`)
      Alert.alert(
        servings > 1 ? `I made this! ×${servings}` : 'I made this!',
        `Deduct from My Bar:\n\n${lines.join('\n')}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            onPress: async () => {
              setMadeDrinkLoading(true)
              try {
                await recordInventoryUse({
                  recipe_id: ibaCode || recipeKey,
                  made_at: new Date().toISOString(),
                  ingredients_used: deductions.map((x) => ({
                    ingredient_id: x.ingredient_id,
                    amount_ml: x.amount_ml,
                  })),
                })
                try {
                  Sentry.addBreadcrumb({
                    category: "recipe",
                    message: "made_drink",
                    data: { recipe_name: recipeTitle, servings },
                    level: "info",
                  });
                } catch {}
                setMadeDrinkState('done');
                SoundService.play('cheers');
                if (madeDrinkTimerRef.current) clearTimeout(madeDrinkTimerRef.current);
                madeDrinkTimerRef.current = setTimeout(() => {
                  setMadeDrinkState('hidden');
                  madeDrinkTimerRef.current = null;
                }, 1500);
              } catch (e: any) {
                Alert.alert('Error', e?.message ?? 'Failed to update inventory')
              } finally {
                setMadeDrinkLoading(false)
              }
            },
          },
        ]
      )
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong')
    }
  }

  const renderDbIngredients = () => {
    const list = Array.isArray(dbRecipe?.ingredients) ? dbRecipe!.ingredients : [];
    if (list.length === 0) return <Text style={{ color: OaklandDusk.text.tertiary }}>(No ingredients)</Text>;

    const sorted = [...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    // Build inventory lookup for availability display (ingredient_key → remaining_volume)
    const invByKey: Record<string, number> = {};
    if (inventoryInitialized) {
      for (const inv of inventory) {
        const k = String(inv.ingredient_key ?? '').trim();
        if (k) invByKey[k] = Number(inv.remaining_volume ?? 0);
      }
    }

    return (
      <View style={{ gap: 6 }}>
        {sorted.map((it, i) => {
          const key = String(it?.item ?? "").trim();
          const resolved = resolveDisplayForIngredientKey(key);
          const serverInfo = ingredientAvailability?.[key];
          // Server substitute takes priority over scan-based resolve
          const isSubstitute = serverInfo?.status === "substitute" || resolved.substitute;
          const name = (
            serverInfo?.status === "substitute" && serverInfo.matched_display
              ? serverInfo.matched_display
              : resolved.display || humanizeKey(key) || "unknown"
          ).trim();
          const isOptional = Boolean(it?.is_optional);

          const ml =
            it?.amount_ml === null || it?.amount_ml === undefined || it?.amount_ml === ""
              ? null
              : Number(it.amount_ml);

          const unit = it?.unit ? String(it.unit).trim() : "";

          let amountLabel = "";
          if (Number.isFinite(ml)) {
            const scaledMl = ml! * servings;
            if (displayUnit === "oz") {
              const oz = scaledMl * 0.033814;
              amountLabel = `${oz < 0.1 ? oz.toFixed(2) : oz.toFixed(1)} oz`;
            } else {
              amountLabel = `${scaledMl} ml`;
            }
          } else if (it?.amount_text && String(it.amount_text).trim()) {
            amountLabel = unit ? `${String(it.amount_text).trim()} ${unit}` : String(it.amount_text).trim();
          } else {
            amountLabel = "n/a";
          }

          let availBadge: React.ReactNode = null;

          if (ingredientAvailability && key) {
            // Server-driven availability (SSoT)
            const info = ingredientAvailability[key];
            const needed = Number.isFinite(ml) ? ml! : null;

            if (!info || info.status === "missing") {
              availBadge = (
                <Text style={{ color: OaklandDusk.brand.sundown, fontSize: 13, fontWeight: '500' }}> ✗ Missing</Text>
              );
            } else if (info.status === "in_bar") {
              if (needed !== null && info.remaining_volume !== null && info.remaining_volume < needed) {
                availBadge = (
                  <Text style={{ color: '#D97706', fontSize: 12 }}> ⚠ Running low ({info.remaining_volume}ml left)</Text>
                );
              } else {
                availBadge = (
                  <Text style={{ color: '#22C55E', fontSize: 12 }}>
                    {confirmedStaplesSet.has(key) ? ' \u2713' : ' \u2713 In your bar'}
                  </Text>
                );
              }
            } else if (info.status === "substitute") {
              availBadge = (
                <Text style={{ color: '#22C55E', fontSize: 12 }}> ✓ Have {info.matched_display}</Text>
              );
            }
          } else if (inventoryInitialized && key) {
            // Fallback: no server availability (unauthenticated or fetch failed)
            // Use exact inventory match only — no substitute inference
            const remaining = invByKey[key];
            if (remaining !== undefined) {
              const needed2 = Number.isFinite(ml) ? ml! : null;
              if (needed2 !== null && remaining < needed2) {
                availBadge = (
                  <Text style={{ color: '#D97706', fontSize: 12 }}> ⚠ Running low ({remaining}ml left)</Text>
                );
              } else {
                availBadge = (
                  <Text style={{ color: '#22C55E', fontSize: 12 }}> ✓ In your bar</Text>
                );
              }
            }
            // NOTE: Don't show "Missing" in fallback — we lack full matching context
          }

          // Build "Originally: Gin" label for substitute ingredients
          const originalName = isSubstitute ? humanizeKey(key) : "";

          // Derive band color from server availability
          const avail = ingredientAvailability?.[key];
          const bandIsInBar = avail?.status === "in_bar";
          const bandIsSubstitute = avail?.status === "substitute";
          const bandHasData = ingredientAvailability !== null;

          return (
            <View key={i} style={{ gap: 2 }}>
              <View style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 6,
                backgroundColor: "rgba(255,255,255,0.02)",
                borderLeftWidth: 3,
                borderLeftColor: !bandHasData
                  ? OaklandDusk.bg.border
                  : bandIsInBar ? "#7AB89A"
                  : bandIsSubstitute ? "#D4A030"
                  : "#C87070",
              }}>
                <Text style={{ flex: 1, fontSize: 12, color: OaklandDusk.text.primary }}>
                  {name}{isOptional ? <Text style={{ color: OaklandDusk.text.tertiary }}> (optional)</Text> : ""}
                </Text>
                <Text style={{ fontSize: 12, color: OaklandDusk.text.tertiary, marginRight: 8 }}>
                  {amountLabel}
                </Text>
                {bandHasData && (
                  <View style={{
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                    borderRadius: 3,
                    backgroundColor: bandIsInBar
                      ? "rgba(122,184,154,0.1)"
                      : bandIsSubstitute ? "rgba(212,160,48,0.1)"
                      : "rgba(200,112,112,0.1)",
                  }}>
                    <Text style={{
                      fontSize: 9,
                      color: bandIsInBar ? "#7AB89A" : bandIsSubstitute ? "#D4A030" : "#C87070",
                    }}>
                      {bandIsInBar ? "✓" : bandIsSubstitute ? "alt" : "need"}
                    </Text>
                  </View>
                )}
              </View>
              {isSubstitute && originalName ? (
                <Text style={{ fontSize: 10, color: "#D4A030", marginLeft: 14, marginBottom: 4 }}>
                  Originally: {originalName}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    );
  };

  const hasSelection = Boolean(ibaCode) || Boolean(legacyRecipe);

  if (!hasSelection) {
    return (
      <View style={{ flex: 1, backgroundColor: OaklandDusk.bg.void }}>
        <Stack.Screen options={{
          title: "",
          headerStyle: { backgroundColor: OaklandDusk.bg.void },
          headerTintColor: OaklandDusk.brand.gold,
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace("/(tabs)/bartender" as any);
                }
              }}
              hitSlop={16}
              style={{ paddingHorizontal: 8, paddingVertical: 8 }}
            >
              <Text style={{ color: OaklandDusk.brand.gold, fontSize: 17 }}>
                ‹ Back
              </Text>
            </Pressable>
          ),
        }} />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ fontSize: 20, fontWeight: "800", color: OaklandDusk.text.primary }}>Recipe</Text>
          <Text style={{ color: OaklandDusk.text.secondary }}>No recipe selected. Go back to Scan and tap "View".</Text>

          {__DEV__ ? (
            <View style={{ padding: 12, borderWidth: 1, borderColor: OaklandDusk.bg.border, borderRadius: 12, gap: 6, backgroundColor: OaklandDusk.bg.card }}>
              <Text style={{ fontWeight: "800", color: OaklandDusk.text.primary }}>Debug</Text>
              <Text style={{ color: OaklandDusk.text.tertiary }}>ibaCode: {ibaCode || "(empty)"}</Text>
              <Text style={{ color: OaklandDusk.text.tertiary }}>recipe_key: {String((params as any)?.recipe_key ?? "") || "(empty)"}</Text>
              <Text style={{ color: OaklandDusk.text.tertiary }}>idx: {String((params as any)?.idx ?? "") || "(empty)"}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  // Fix 7: dynamic back title based on navigation source
  const fromParam = String((params as any).from ?? "").trim();
  const backLabel =
    params.source === "favorites"
      ? "Favorites"
      : params.source === "bartender"
        ? "Picks"
        : params.source === "cocktails" || fromParam === "recommendations"
          ? "Cocktails"
          : "Back";

  return (
    <View style={{ flex: 1, backgroundColor: OaklandDusk.bg.void }}>
      <Stack.Screen options={{ title: "", headerShown: false }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* C1: Nav bar */}
        <View style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: insets.top + 8,
          paddingBottom: 8,
          backgroundColor: OaklandDusk.bg.void,
        }}>
          <Pressable
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/(tabs)/bartender" as any);
              }
            }}
            hitSlop={16}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderWidth: 1,
              borderColor: OaklandDusk.bg.border,
              borderRadius: 8,
              backgroundColor: OaklandDusk.bg.card,
            }}
          >
            <Text style={{ color: OaklandDusk.brand.gold, fontSize: 15, fontWeight: "600" }}>
              ‹ {backLabel}
            </Text>
          </Pressable>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center", paddingHorizontal: 10, paddingVertical: 4 }}>
            {dbRecipe && (
              <View style={{ position: "relative" }}>
                <HintBubble
                  storageKey={GUIDE_KEYS.RECIPE_SHARE}
                  visible={shareHintVisible}
                  onDismiss={() => {
                    setShareHintVisible(false);
                    isGuideDismissed(GUIDE_KEYS.RECIPE_FAV).then((d) => {
                      if (!d) setFavHintVisible(true);
                    });
                  }}
                  hintType="tap"
                  hintColor="skyblue"
                />
                <Pressable
                  onPress={() => {
                    if (shareHintVisible) {
                      dismissGuide(GUIDE_KEYS.RECIPE_SHARE);
                      setShareHintVisible(false);
                      isGuideDismissed(GUIDE_KEYS.RECIPE_FAV).then((d) => {
                        if (!d) setFavHintVisible(true);
                      });
                    }
                    handleSharePress();
                  }}
                  hitSlop={14}
                  accessibilityLabel="Share recipe"
                  accessibilityRole="button"
                >
                  <FontAwesome name="share" color={OaklandDusk.text.tertiary} size={18} />
                </Pressable>
              </View>
            )}
            <View style={{ position: "relative" }}>
              {favHintVisible && !isFav && (
                <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", zIndex: 100 }} pointerEvents="none">
                  <TapPulse color="skyblue" />
                </View>
              )}
              <Pressable
                onPress={() => {
                  if (favHintVisible) {
                    setFavHintVisible(false);
                    dismissGuide(GUIDE_KEYS.RECIPE_FAV);
                  }
                  onToggleFavorite();
                }}
                hitSlop={10}
              >
                <FontAwesome name={isFav ? "heart" : "heart-o"} color={isFav ? OaklandDusk.accent.crimson : OaklandDusk.text.tertiary} size={20} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* C1: Hero image */}
        <View style={{ width: "100%", height: 160, backgroundColor: OaklandDusk.bg.card }}>
          {dbRecipe?.image_url ? (
            <Image
              source={{ uri: dbRecipe.image_url }}
              style={{ width: "100%", height: "100%", resizeMode: "contain" }}
            />
          ) : null}
          <LinearGradient
            colors={[OaklandDusk.bg.void, "transparent"]}
            start={{ x: 0, y: 1 }}
            end={{ x: 0, y: 0 }}
            style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 50 }}
          />
        </View>

        {/* Main content */}
        <View style={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: "700", color: OaklandDusk.text.primary }}>
          {recipeTitle ? recipeTitle : ibaCode ? "Recipe" : "Recipe"}
        </Text>

        {tasteTags.length > 0 ? (
          <Pressable onLongPress={__DEV__ ? copyDebug : undefined} delayLongPress={450}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {tasteTags.map((tag) => (
                <View
                  key={tag}
                  style={{
                    backgroundColor: OaklandDusk.brand.tagBg,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: OaklandDusk.brand.gold }}>{tag}</Text>
                </View>
              ))}
            </View>
          </Pressable>
        ) : null}

        {/* C2: Confidence signal */}
        {ingredientAvailability && dbRecipe && (() => {
          const ingKeys = dbRecipe.ingredients
            .map(it => String(it.item ?? "").trim())
            .filter(Boolean);
          const allAvailable = ingKeys.every(k => {
            const info = ingredientAvailability[k];
            return info?.status === "in_bar" || info?.status === "substitute";
          });
          const missingCount = ingKeys.filter(k => {
            const info = ingredientAvailability[k];
            return !info || info.status === "missing";
          }).length;
          return (
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingVertical: 8,
              paddingHorizontal: 12,
              backgroundColor: allAvailable ? "rgba(122,184,154,0.06)" : "rgba(200,120,40,0.06)",
              borderWidth: 1,
              borderColor: allAvailable ? "rgba(122,184,154,0.15)" : "rgba(200,120,40,0.15)",
              borderRadius: 8,
              marginBottom: 12,
            }}>
              <Text style={{ color: allAvailable ? "#7AB89A" : OaklandDusk.brand.gold, fontSize: 14, fontWeight: "700" }}>
                {allAvailable ? "✓" : "!"}
              </Text>
              <Text style={{ color: allAvailable ? "#7AB89A" : OaklandDusk.brand.gold, fontSize: 12 }}>
                {allAvailable
                  ? "You have everything"
                  : `Missing ${missingCount} ingredient${missingCount > 1 ? "s" : ""}`}
              </Text>
            </View>
          );
        })()}

        {loading ? (
          <View style={{ padding: 12, borderWidth: 1, borderColor: OaklandDusk.bg.border, borderRadius: 12, backgroundColor: OaklandDusk.bg.card }}>
            <Text style={{ fontWeight: "800", color: OaklandDusk.text.primary }}>Loading…</Text>
            <Text style={{ color: OaklandDusk.text.secondary }}>
              Fetching full recipe from backend using iba_code: {ibaCode || "(missing)"}
            </Text>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Pressable
            onPress={() => sendFeedback("like")}
            hitSlop={12}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 12,
              backgroundColor: currentRating === "like" ? "#1A2A1A" : OaklandDusk.bg.card,
              borderWidth: 0.5,
              borderColor: currentRating === "like" ? "#6B8F6B" : OaklandDusk.bg.border,
              opacity: currentRating === "dislike" ? 0.4 : 1,
            }}
          >
            <FontAwesome
              name={currentRating === "like" ? "thumbs-up" : "thumbs-o-up"}
              color={currentRating === "like" ? "#6B8F6B" : OaklandDusk.text.tertiary}
              size={16}
            />
            <Text style={{
              fontSize: 13,
              fontWeight: "700",
              color: currentRating === "like" ? "#6B8F6B" : OaklandDusk.text.tertiary,
            }}>
              {currentRating === "like" ? "Liked" : "Like"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => sendFeedback("dislike")}
            hitSlop={12}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 12,
              backgroundColor: currentRating === "dislike" ? "#3A2A2A" : OaklandDusk.bg.card,
              borderWidth: 0.5,
              borderColor: currentRating === "dislike" ? OaklandDusk.accent.crimson : OaklandDusk.bg.border,
              opacity: currentRating === "like" ? 0.4 : 1,
            }}
          >
            <FontAwesome
              name={currentRating === "dislike" ? "thumbs-down" : "thumbs-o-down"}
              color={currentRating === "dislike" ? OaklandDusk.accent.crimson : OaklandDusk.text.tertiary}
              size={16}
            />
            <Text style={{
              fontSize: 13,
              fontWeight: "700",
              color: currentRating === "dislike" ? OaklandDusk.accent.crimson : OaklandDusk.text.tertiary,
            }}>
              {currentRating === "dislike" ? "Disliked" : "Dislike"}
            </Text>
          </Pressable>
        </View>

        {/* Servings selector */}
        {session && dbRecipe && madeDrinkState !== 'hidden' ? (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            marginTop: 12,
          }}>
            <Pressable
              onPress={() => setServings(s => Math.max(1, s - 1))}
              disabled={servings <= 1}
              hitSlop={10}
              style={{
                width: 36, height: 36,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: servings <= 1 ? OaklandDusk.bg.border : OaklandDusk.text.tertiary,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: servings <= 1 ? 0.3 : 1,
              }}
            >
              <Text style={{ color: OaklandDusk.text.primary, fontSize: 18, fontWeight: '700' }}>−</Text>
            </Pressable>

            <Text style={{ color: OaklandDusk.text.primary, fontSize: 20, fontWeight: '900', minWidth: 60, textAlign: 'center' }}>
              {servings} {servings === 1 ? 'serving' : 'servings'}
            </Text>

            <Pressable
              onPress={() => setServings(s => Math.min(5, s + 1))}
              disabled={servings >= 5}
              hitSlop={10}
              style={{
                width: 36, height: 36,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: servings >= 5 ? OaklandDusk.bg.border : OaklandDusk.text.tertiary,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: servings >= 5 ? 0.3 : 1,
              }}
            >
              <Text style={{ color: OaklandDusk.text.primary, fontSize: 18, fontWeight: '700' }}>+</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={{ padding: 12, borderWidth: 1, borderColor: OaklandDusk.bg.border, borderRadius: 12, gap: 12, backgroundColor: OaklandDusk.bg.card }}>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <FontAwesome name="flask" size={14} color={OaklandDusk.brand.gold} />
              <Text style={{ fontWeight: "900", color: OaklandDusk.text.primary }}>Ingredients</Text>
            </View>
            {dbRecipe ? (
              renderDbIngredients()
            ) : loading ? (
              <Text style={{ color: OaklandDusk.text.tertiary }}>(Loading full recipe…)</Text>
            ) : error ? (
              <Text style={{ color: OaklandDusk.semantic.error }}>Failed to load recipe: {error}</Text>
            ) : ibaCode ? (
              <Text style={{ color: OaklandDusk.text.tertiary }}>(Waiting for full recipe…)</Text>
            ) : (
              <Text style={{ color: OaklandDusk.text.tertiary }}>(Missing iba_code)</Text>
            )}
          </View>

          {dbRecipe?.instructions ? (
            <View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <FontAwesome name="list-ol" size={14} color={OaklandDusk.brand.gold} />
                <Text style={{ fontWeight: "900", color: OaklandDusk.text.primary }}>Instructions</Text>
              </View>
              <Text style={{ color: OaklandDusk.text.secondary }}>{String(dbRecipe.instructions)}</Text>
            </View>
          ) : null}
        </View>

        {/* Primary CTA: Make this cocktail — placed after instructions per UX flow */}
        {session && dbRecipe && madeDrinkState !== 'hidden' ? (
          <View style={{ position: "relative" }}>
            <HintBubble
              storageKey={GUIDE_KEYS.GP_STEP_6}
              visible={gpStep6Visible && madeDrinkState === 'idle'}
              onDismiss={() => {
                setGpStep6Visible(false);
                // Chain: show share hint next
                isGuideDismissed(GUIDE_KEYS.RECIPE_SHARE).then((d) => {
                  if (!d) setShareHintVisible(true);
                });
              }}
              hintType="tap"
              hintColor="charcoal"
            />
            <Pressable
              onPress={handleMadeDrink}
              disabled={madeDrinkLoading || madeDrinkState === 'done'}
              style={{
                borderRadius: 12,
                paddingVertical: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: madeDrinkState === 'done' ? '#6F8F7C' : '#D4A030',
                flexDirection: 'row',
                gap: 8,
                marginTop: 8,
                opacity: madeDrinkLoading ? 0.7 : 1,
              }}
            >
              {madeDrinkLoading
                ? <ActivityIndicator size="small" color={madeDrinkState === 'done' ? '#FFF' : '#1A1A2E'} />
                : null}
              <Text style={{ fontWeight: '900', color: madeDrinkState === 'done' ? '#FFF' : '#1A1A2E', fontSize: 18 }}>
                {madeDrinkState === 'done' ? 'Logged!' : 'I made this'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {error ? (
          <View style={{ padding: 12, borderWidth: 1, borderColor: OaklandDusk.accent.crimson, borderRadius: 12, backgroundColor: OaklandDusk.accent.roseBg }}>
            <Text style={{ fontWeight: "800", color: OaklandDusk.accent.crimson }}>Error</Text>
            <Text style={{ color: OaklandDusk.text.secondary }}>{error}</Text>
          </View>
        ) : null}
        </View>{/* end main content wrapper */}

      </ScrollView>

      {/* Stage 3: First-interaction feedback toast */}
      {feedbackToast && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 90,
            left: 24,
            right: 24,
            opacity: toastOpacity,
            backgroundColor: "#1e293b",
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 16,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontSize: 14, fontWeight: "600", textAlign: "center" }}>
            {feedbackToast}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}
