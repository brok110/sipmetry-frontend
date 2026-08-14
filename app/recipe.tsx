import FontAwesome from "@expo/vector-icons/FontAwesome";
import HintBubble, { GUIDE_KEYS, dismissGuide, isGoldenPathStepReady, isGuideDismissed } from "@/components/GuideBubble";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, router as staticRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import * as Sentry from "@sentry/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STAPLES_STORAGE_KEY } from "@/components/StaplesModal";
import { DbIngredientsList } from "@/components/DbIngredientsList";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/context/auth";
import { apiFetch } from "@/lib/api";
import { getTasteTags } from "@/lib/tasteTags";
import { BadgeRow } from "@/components/browse/Badges";
import { SoundService } from "@/lib/sounds";

import * as Clipboard from "expo-clipboard";

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
import Type from "@/constants/typography";
import { useUnitPreference } from "@/hooks/useUnitPreference";
import { formatOz } from "@/lib/formatOz";
import { R } from "@/constants/radius";

export type DbRecipeIngredient = {
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
  // SAFETY-BADGE (2026-08-14): server-sorted facts; normalization 白名單必須帶上,
  // 否則 API 有、state 沒有(本欄補洞的成因)。
  badges?: string[];
};

// Server-driven ingredient availability (SSoT)
export type IngredientAvailability = {
  ingredient_key: string;
  status: "in_bar" | "substitute" | "missing";
  matched_by: string | null;
  matched_display: string | null;
  remaining_volume: number | null;
};

function paramToString(v: any): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return "";
}

const NO_SELECTION_HEADER_OPTIONS = {
  title: "",
  headerStyle: { backgroundColor: OaklandDusk.bg.void },
  headerTintColor: OaklandDusk.brand.gold,
  headerShadowVisible: false,
  headerLeft: () => (
    <Pressable
      onPress={() => {
        if (staticRouter.canGoBack()) {
          staticRouter.back();
        } else {
          staticRouter.replace("/(tabs)/bartender" as any);
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
};

const RECIPE_HEADER_OPTIONS = { title: "", headerShown: false };

// UNITS-TOGGLE(2026-08-01 拍板):mini 膠囊 segmented,搬移非複製
// (Profile 的 Recipe Units 列同批移除)。同一 useUnitPreference 全域
// 偏好;oz 態經 formatOz snap 刻度,分享文字跟著走。
function UnitToggle({ unit, onChange }: { unit: "oz" | "ml"; onChange: (u: "oz" | "ml") => void }) {
  return (
    <View style={styles.unitSeg}>
      {(["oz", "ml"] as const).map((u) => (
        <Pressable
          key={u}
          onPress={() => onChange(u)}
          hitSlop={6}
          accessibilityLabel={`Show amounts in ${u}`}
          style={[styles.unitSegBtn, unit === u && styles.unitSegBtnOn]}
        >
          <Text style={[styles.unitSegText, unit === u && styles.unitSegTextOn]}>{u.toUpperCase()}</Text>
        </Pressable>
      ))}
    </View>
  )
}

export default function TabTwoScreen() {

  const router = useRouter();
  const insets = useSafeAreaInsets();

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
    mode?: string;
  }>();

  const isGuestSession = paramToString((params as any).mode) === "quick_look";

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

  const resolveDisplayForIngredientKey = useCallback(
    (ingredientKey: string): { display: string; substitute: boolean } => {
      const k = String(ingredientKey || "").trim().toLowerCase();
      if (!k) return { display: "", substitute: false };

      // Direct match from scan display names
      const direct = scanDisplayByCanonical[k];
      if (direct) return { display: direct, substitute: false };

      return { display: "", substitute: false };
    },
    [scanDisplayByCanonical]
  );

  const ibaCode = useMemo(() => {
    const fromParam = paramToString((params as any).iba_code).trim();
    const fromLegacy =
      legacyRecipe && typeof legacyRecipe === "object" && (legacyRecipe as any).iba_code
        ? String((legacyRecipe as any).iba_code).trim()
        : "";
    return fromParam || fromLegacy || "";
  }, [params.iba_code, legacyRecipe]);

  const { favoritesByKey, toggleFavorite, isAtLimit: favoritesAtLimit } = useFavorites();
  const { inventory, initialized: inventoryInitialized, refreshInventory, recordInventoryUse } = useInventory();
  const { track } = useInteractions();

  const [ingredientAvailability, setIngredientAvailability] = useState<Record<string, IngredientAvailability> | null>(null);
  const [confirmedStaplesSet, setConfirmedStaplesSet] = useState<Set<string>>(new Set());
  const [listedKeys, setListedKeys] = useState<Set<string>>(new Set());

  const { session } = useAuth();
  const { unit: displayUnit, setUnit } = useUnitPreference();

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
  const favHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (favHintTimeoutRef.current) clearTimeout(favHintTimeoutRef.current);
    };
  }, []);

  // Stage 4: Track whether user took any positive action during this visit
  const hadPositiveActionRef = useRef(false);

  // Recipe hints — chain: I made this → FAV ❤️ → SHARE 📤
  // FAV and SHARE are only triggered by "I made this", never auto-shown on mount.
  useEffect(() => {
    // Gate on dbRecipe: the sticky "I made this" footer is conditionally rendered
    // only after dbRecipe loads (line ~1441). Firing on mount would measure against
    // an unmounted target. Re-runs when dbRecipe arrives, which is the correct time.
    if (!dbRecipe) return;
    let alive = true;
    (async () => {
      // Only show GP_STEP_6 once the recipe data has loaded. FAV and SHARE hints
      // are triggered by the "I made this" button press, not here.
      if ((await isGoldenPathStepReady(6)) && alive) setGpStep6Visible(true);
    })();
    return () => { alive = false; };
  }, [dbRecipe]);

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
          badges: Array.isArray((r as any)?.badges) ? (r as any).badges : [],
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
            guest: isGuestSession,
            ...(isGuestSession
              ? { detected_ingredients: scanItems.map((it) => String(it.canonical ?? "").trim()).filter(Boolean) }
              : {}),
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
  }, [ibaCode, session, isGuestSession]);

  // SHOP-LIST 3c: sync open shopping-list keys on focus so "✓ On list"
  // stays correct across visits (server-side dedup is the backstop)
  useFocusEffect(
    useCallback(() => {
      if (!session || isGuestSession) {
        setListedKeys(new Set());
        return;
      }
      let alive = true;
      (async () => {
        try {
          const res = await apiFetch("/shopping-list", { session });
          if (!res.ok) throw new Error(`status ${res.status}`);
          const data = await res.json();
          if (!alive) return;
          const keys = Array.isArray(data.items)
            ? data.items.map((i: any) => String(i?.ingredient_key ?? "").trim()).filter(Boolean)
            : [];
          setListedKeys(new Set(keys));
        } catch {
          // keep last known state; POST-side dedup covers double taps
        }
      })();
      return () => {
        alive = false;
      };
    }, [session, isGuestSession])
  );

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

  const confidenceSignal = useMemo(() => {
    if (!ingredientAvailability || !dbRecipe) return null;
    const ingKeys = dbRecipe.ingredients
      .map((it) => String(it.item ?? "").trim())
      .filter(Boolean);
    const allAvailable = ingKeys.every((k) => {
      const info = ingredientAvailability[k];
      return info?.status === "in_bar" || info?.status === "substitute";
    });
    // Optional ingredients don't block making the drink (backend can_make
    // excludes is_optional), so they don't count toward "Missing N"
    const missingCount = dbRecipe.ingredients
      .filter((it) => !it.is_optional)
      .map((it) => String(it.item ?? "").trim())
      .filter(Boolean)
      .filter((k) => {
        const info = ingredientAvailability[k];
        return !info || info.status === "missing";
      }).length;
    // Optional-only gaps still count as ready (backend can_make parity)
    const isReady = missingCount === 0;
    return { allAvailable, missingCount, isReady };
  }, [ingredientAvailability, dbRecipe]);

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
              amount = formatOz(scaled);
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

    const celebrateMade = () => {
      try {
        Sentry.addBreadcrumb({
          category: "recipe",
          message: "made_drink",
          data: { recipe_name: recipeTitle, servings },
          level: "info",
        });
      } catch {}
      track({
        recipe_key: recipeKey,
        interaction_type: "made",
        context: { source: "detail" },
      });
      hadPositiveActionRef.current = true;
      setMadeDrinkState('done');
      SoundService.play('cheers');
      if (madeDrinkTimerRef.current) clearTimeout(madeDrinkTimerRef.current);
      madeDrinkTimerRef.current = setTimeout(() => {
        setMadeDrinkState('hidden');
        madeDrinkTimerRef.current = null;
      }, 1500);
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
        setMadeDrinkLoading(true)
        try {
          celebrateMade()
        } finally {
          setMadeDrinkLoading(false)
        }
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
        setMadeDrinkLoading(true)
        try {
          celebrateMade()
        } finally {
          setMadeDrinkLoading(false)
        }
        return
      }

      // 3. Confirm dialog — only when there's something to deduct
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
                celebrateMade()
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

  // SHOP-LIST 3c: add a missing ingredient to the shopping list from its row.
  // Optimistic flip to "✓ On list"; rolled back with an Alert on failure.
  const handleAddToList = useCallback(async (ingredientKey: string, displayName: string) => {
    if (!session?.access_token) {
      Alert.alert("Sign in required", "Please sign in to use the shopping list.");
      return;
    }
    const code = String(ibaCode || (dbRecipe?.iba_code ?? "")).trim();
    setListedKeys((prev) => new Set(prev).add(ingredientKey));
    try {
      const res = await apiFetch("/shopping-list", {
        session,
        method: "POST",
        body: {
          ingredient_key: ingredientKey,
          display_name: displayName,
          reason_iba_code: code || null,
          reason_name: String(recipeTitle || "").trim() || null,
          source: "recipe",
        },
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
    } catch {
      setListedKeys((prev) => {
        const next = new Set(prev);
        next.delete(ingredientKey);
        return next;
      });
      Alert.alert("Error", "Could not add to your shopping list. Please try again.");
    }
  }, [session, ibaCode, dbRecipe, recipeTitle]);

  const hasSelection = Boolean(ibaCode) || Boolean(legacyRecipe);

  if (!hasSelection) {
    return (
      <View style={{ flex: 1, backgroundColor: OaklandDusk.bg.void }}>
        <Stack.Screen options={NO_SELECTION_HEADER_OPTIONS} />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ fontSize: 20, fontWeight: "800", color: OaklandDusk.text.primary }}>Recipe</Text>
          <Text style={[Type.body, { color: OaklandDusk.text.secondary }]}>No recipe selected. Go back to Scan and tap "View".</Text>

          {__DEV__ ? (
            <View style={{ padding: 12, borderWidth: 1, borderColor: OaklandDusk.bg.border, borderRadius: 14, gap: 6, backgroundColor: OaklandDusk.bg.card }}>
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
    <View style={styles.screen}>
      <Stack.Screen options={RECIPE_HEADER_OPTIONS} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        {/* C1: Nav bar */}
        <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/(tabs)/bartender" as any);
              }
            }}
            hitSlop={16}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>
              ‹ {backLabel}
            </Text>
          </Pressable>
          <View style={styles.navBarActions}>
            {dbRecipe && (
              <HintBubble
                storageKey={GUIDE_KEYS.RECIPE_SHARE}
                visible={shareHintVisible}
                onDismiss={() => {
                  setShareHintVisible(false);
                }}
                hintType="tap"
                hintColor="skyblue"
              >
                <Pressable
                  onPress={() => {
                    if (shareHintVisible) {
                      dismissGuide(GUIDE_KEYS.RECIPE_SHARE);
                      setShareHintVisible(false);
                    }
                    handleSharePress();
                  }}
                  hitSlop={14}
                  accessibilityLabel="Share recipe"
                  accessibilityRole="button"
                >
                  <FontAwesome name="share" color={OaklandDusk.text.tertiary} size={18} />
                </Pressable>
              </HintBubble>
            )}
            <HintBubble
              storageKey={GUIDE_KEYS.RECIPE_FAV}
              visible={favHintVisible && !isFav}
              onDismiss={() => {
                setFavHintVisible(false);
                isGuideDismissed(GUIDE_KEYS.RECIPE_SHARE).then((d) => {
                  if (!d) setShareHintVisible(true);
                });
              }}
              hintType="tap"
              hintColor="skyblue"
            >
              <Pressable
                onPress={() => {
                  if (favHintVisible) {
                    setFavHintVisible(false);
                    dismissGuide(GUIDE_KEYS.RECIPE_FAV);
                    isGuideDismissed(GUIDE_KEYS.RECIPE_SHARE).then((d) => {
                      if (!d) setShareHintVisible(true);
                    });
                  }
                  onToggleFavorite();
                }}
                hitSlop={10}
              >
                <FontAwesome name={isFav ? "heart" : "heart-o"} color={isFav ? OaklandDusk.accent.crimson : OaklandDusk.text.tertiary} size={20} />
              </Pressable>
            </HintBubble>
          </View>
        </View>

        {/* C1: Hero image */}
        <View style={styles.heroImageContainer}>
          {dbRecipe?.image_url ? (
            <Image
              source={{ uri: dbRecipe.image_url }}
              style={styles.heroImage}
              contentFit="cover"
            />
          ) : null}
          <View style={styles.heroImageOverlay} />
          <LinearGradient
            colors={[OaklandDusk.bg.void, "transparent"]}
            start={{ x: 0, y: 1 }}
            end={{ x: 0, y: 0 }}
            style={styles.heroImageGradient}
          />
        </View>

        {/* Main content */}
        <View style={styles.mainContent}>
        {/* Type.display — recipe title */}
        <Text style={[Type.display, styles.primaryText]}>
          {recipeTitle ? recipeTitle : ibaCode ? "Recipe" : "Recipe"}
        </Text>

        {/* SAFETY-BADGE (2026-08-13): 成分事實列 — 全展、後端序 */}
        <BadgeRow badges={(dbRecipe as any)?.badges} />

        {tasteTags.length > 0 ? (
          <Pressable onLongPress={__DEV__ ? copyDebug : undefined} delayLongPress={450}>
            <View style={styles.tasteTagsRow}>
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
        {confidenceSignal && (
          <View style={confidenceSignal.isReady ? styles.confidenceBoxReady : styles.confidenceBoxNotReady}>
            {confidenceSignal.isReady ? (
              <Text style={styles.confidenceCheckmark}>✓</Text>
            ) : (
              <FontAwesome name="cart-plus" size={14} color={OaklandDusk.brand.gold} />
            )}
            <Text style={confidenceSignal.isReady ? styles.confidenceTextReady : styles.confidenceTextNotReady}>
              {confidenceSignal.isReady
                ? confidenceSignal.allAvailable ? "You have everything" : "Ready to make"
                : confidenceSignal.missingCount === 1
                  ? "Just 1 ingredient away"
                  : `${confidenceSignal.missingCount} ingredients away`}
            </Text>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingCard}>
            {/* Type.heading — loading state title */}
            <Text style={[Type.heading, styles.primaryText]}>Loading…</Text>
            {/* Type.body — loading state description */}
            <Text style={[Type.body, styles.secondaryText]}>
              Fetching full recipe from backend using iba_code: {ibaCode || "(missing)"}
            </Text>
          </View>
        ) : null}

        {/* Servings selector */}
        {session && dbRecipe && madeDrinkState !== 'hidden' ? (
          <View style={styles.servingsRow}>
            <Pressable
              onPress={() => setServings(s => Math.max(1, s - 1))}
              disabled={servings <= 1}
              hitSlop={10}
              style={[styles.stepperButtonBase, servings <= 1 ? styles.stepperButtonDisabled : styles.stepperButtonEnabled]}
            >
              <Text style={styles.stepperSymbolText}>−</Text>
            </Pressable>

            <Text style={styles.stepperCountText}>
              {servings} {servings === 1 ? 'serving' : 'servings'}
            </Text>

            <Pressable
              onPress={() => setServings(s => Math.min(5, s + 1))}
              disabled={servings >= 5}
              hitSlop={10}
              style={[styles.stepperButtonBase, servings >= 5 ? styles.stepperButtonDisabled : styles.stepperButtonEnabled]}
            >
              <Text style={styles.stepperSymbolText}>+</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.recipeContentCard}>
          <View>
            <View style={[styles.sectionHeaderRow, { justifyContent: "space-between" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <FontAwesome name="flask" size={14} color={OaklandDusk.brand.gold} />
                {/* Type.title — section header */}
                <Text style={[Type.title, styles.primaryText]}>Ingredients</Text>
              </View>
              {/* UNITS-TOGGLE:切換住效果旁(mockup 拍板) */}
              <UnitToggle unit={displayUnit} onChange={setUnit} />
            </View>
            {dbRecipe ? (
              <DbIngredientsList
                ingredients={dbRecipe.ingredients}
                inventoryInitialized={inventoryInitialized}
                inventory={inventory}
                resolveDisplayForIngredientKey={resolveDisplayForIngredientKey}
                ingredientAvailability={ingredientAvailability}
                servings={servings}
                displayUnit={displayUnit}
                confirmedStaplesSet={confirmedStaplesSet}
                onAddToList={isGuestSession ? undefined : handleAddToList}
                listedKeys={listedKeys}
              />
            ) : loading ? (
              <Text style={[Type.caption, styles.tertiaryText]}>(Loading full recipe…)</Text>
            ) : error ? (
              <Text style={[Type.body, styles.errorText]}>Failed to load recipe: {error}</Text>
            ) : ibaCode ? (
              <Text style={[Type.caption, styles.tertiaryText]}>(Waiting for full recipe…)</Text>
            ) : (
              <Text style={[Type.caption, styles.tertiaryText]}>(Missing iba_code)</Text>
            )}
          </View>

          {dbRecipe?.instructions ? (
            <View>
              <View style={styles.sectionHeaderRow}>
                <FontAwesome name="list-ol" size={14} color={OaklandDusk.brand.gold} />
                {/* Type.title — section header */}
                <Text style={[Type.title, styles.primaryText]}>Instructions</Text>
              </View>
              {/* Type.body — instructions paragraph */}
              <Text style={[Type.body, styles.secondaryText]}>{String(dbRecipe.instructions)}</Text>
            </View>
          ) : null}
        </View>

        {error ? (
          <View style={{ padding: 12, borderWidth: 1, borderColor: OaklandDusk.accent.crimson, borderRadius: 14, backgroundColor: OaklandDusk.accent.roseBg }}>
            {/* Type.heading — error state title */}
            <Text style={[Type.heading, { color: OaklandDusk.accent.crimson }]}>Error</Text>
            {/* Type.body — error description */}
            <Text style={[Type.body, { color: OaklandDusk.text.secondary }]}>{error}</Text>
          </View>
        ) : null}
        </View>{/* end main content wrapper */}

      </ScrollView>

      {/* Sticky footer — primary CTA, non-overlapping (flex sibling of ScrollView) */}
      {session && dbRecipe && madeDrinkState !== 'hidden' && !isGuestSession ? (
        <View style={[styles.footerContainer, { paddingBottom: insets.bottom + 12 }]}>
          <HintBubble
            storageKey={GUIDE_KEYS.GP_STEP_6}
            visible={gpStep6Visible && madeDrinkState === 'idle'}
            onDismiss={() => {
              setGpStep6Visible(false);
              isGuideDismissed(GUIDE_KEYS.RECIPE_FAV).then((d) => {
                if (!d) setFavHintVisible(true);
              });
            }}
            hintType="tap"
            hintColor="charcoal"
          >
            <Pressable
              onPress={() => {
                if (gpStep6Visible) {
                  dismissGuide(GUIDE_KEYS.GP_STEP_6);
                  setGpStep6Visible(false);
                }

                favHintTimeoutRef.current = setTimeout(() => {
                  isGuideDismissed(GUIDE_KEYS.RECIPE_FAV).then((d) => {
                    if (!d) {
                      setFavHintVisible(true);
                    }
                  });
                }, 3000);

                handleMadeDrink();
              }}
              disabled={madeDrinkLoading || madeDrinkState === 'done'}
              style={[
                styles.ctaButtonBase,
                madeDrinkState === 'done' ? styles.ctaButtonDone : styles.ctaButtonNotDone,
                madeDrinkLoading && styles.ctaButtonLoading,
              ]}
            >
              {madeDrinkLoading
                ? <ActivityIndicator size="small" color={madeDrinkState === 'done' ? '#FFF' : '#1A1A2E'} />
                : null}
              {/* Type.button — primary CTA */}
              <Text style={[Type.button, madeDrinkState === 'done' ? styles.ctaTextDone : styles.ctaTextNotDone]}>
                {madeDrinkState === 'done' ? 'Logged!' : 'I made this'}
              </Text>
            </Pressable>
          </HintBubble>
        </View>
      ) : null}

      {/* Stage 3: First-interaction feedback toast */}
      {feedbackToast && (
        <Animated.View
          pointerEvents="none"
          style={[styles.toastContainer, { opacity: toastOpacity }]}
        >
          <Text style={styles.toastText}>
            {feedbackToast}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: OaklandDusk.bg.void,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  navBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: OaklandDusk.bg.void,
  },
  backButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  backButtonText: {
    color: OaklandDusk.brand.gold,
    fontSize: 17,
  },
  navBarActions: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroImageContainer: {
    width: "100%",
    height: 150,
    backgroundColor: OaklandDusk.bg.void,
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroImageOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  heroImageGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 50,
  },
  mainContent: {
    padding: 16,
    gap: 10,
  },
  primaryText: {
    color: OaklandDusk.text.primary,
  },
  secondaryText: {
    color: OaklandDusk.text.secondary,
  },
  tasteTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  confidenceBoxReady: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(29,158,117,0.06)",
    borderWidth: 1,
    borderColor: "rgba(29,158,117,0.15)",
    borderRadius: 14,
    marginBottom: 12,
  },
  confidenceBoxNotReady: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(200,120,40,0.06)",
    borderWidth: 1,
    borderColor: "rgba(200,120,40,0.15)",
    borderRadius: 14,
    marginBottom: 12,
  },
  confidenceCheckmark: {
    color: OaklandDusk.semantic.ready,
    fontSize: 14,
    fontWeight: "700",
  },
  confidenceTextReady: {
    color: OaklandDusk.semantic.ready,
    fontSize: 12,
  },
  confidenceTextNotReady: {
    color: OaklandDusk.brand.gold,
    fontSize: 12,
  },
  loadingCard: {
    padding: 12,
    borderWidth: 1,
    borderColor: OaklandDusk.bg.border,
    borderRadius: 14,
    backgroundColor: OaklandDusk.bg.card,
  },
  servingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
  },
  stepperButtonBase: {
    width: 32,
    height: 32,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: {
    borderColor: OaklandDusk.bg.border,
    opacity: 0.3,
  },
  stepperButtonEnabled: {
    borderColor: OaklandDusk.text.tertiary,
    opacity: 1,
  },
  stepperSymbolText: {
    color: OaklandDusk.text.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  stepperCountText: {
    color: OaklandDusk.text.primary,
    fontSize: 20,
    fontWeight: '900',
    minWidth: 60,
    textAlign: 'center',
  },
  recipeContentCard: {
    padding: 12,
    borderWidth: 1,
    borderColor: OaklandDusk.bg.border,
    borderRadius: 14,
    gap: 12,
    backgroundColor: OaklandDusk.bg.card,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  unitSeg: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "rgba(200,120,40,0.35)",
    borderRadius: R.pill,
    overflow: "hidden",
  },
  unitSegBtn: {
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  unitSegBtnOn: {
    backgroundColor: OaklandDusk.brand.gold,
  },
  unitSegText: {
    fontFamily: "DMMono",
    fontSize: 10,
    letterSpacing: 1,
    color: OaklandDusk.text.tertiary,
  },
  unitSegTextOn: {
    color: OaklandDusk.bg.void,
    fontWeight: "700",
  },
  tertiaryText: {
    color: OaklandDusk.text.tertiary,
  },
  errorText: {
    color: OaklandDusk.semantic.error,
  },
  footerContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: OaklandDusk.bg.void,
    borderTopWidth: 0.5,
    borderTopColor: OaklandDusk.bg.border,
  },
  ctaButtonBase: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  ctaButtonDone: {
    backgroundColor: '#6F8F7C',
  },
  ctaButtonNotDone: {
    backgroundColor: '#D4A030',
  },
  ctaButtonLoading: {
    opacity: 0.7,
  },
  ctaTextDone: {
    color: '#FFF',
  },
  ctaTextNotDone: {
    color: '#1A1A2E',
  },
  toastContainer: {
    position: "absolute",
    bottom: 90,
    left: 24,
    right: 24,
    backgroundColor: "#1e293b",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  toastText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
});
