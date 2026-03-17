import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useNavigation } from "@react-navigation/native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";

import { useAuth } from "@/context/auth";

import * as Clipboard from "expo-clipboard";

import { FeedbackRating, useFeedback } from "@/context/feedback";
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
import { useFavorites } from "../context/favorites";

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
  ingredients: DbRecipeIngredient[];
  recipe_vec?: Record<string, any> | null;
};

export default function TabTwoScreen() {
  const API_URL = useMemo(() => {
    const v = String(process.env.EXPO_PUBLIC_API_URL ?? "").trim();
    return v ? v.replace(/\/+$/, "") : "";
  }, []);

  const router = useRouter();
  const navigation = useNavigation<any>();

  useEffect(() => {
    navigation?.setOptions?.({ title: "Recipe" });
  }, [navigation]);

  const params = useLocalSearchParams<{
    idx?: string;
    recipe_json?: string;
    ingredients_json?: string;
    recipe_key?: string;
    iba_code?: string;
    missing_items_json?: string;
    scan_items_json?: string;
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

  const humanizeKey = (k: string) => {
    const s = String(k || "").trim();
    if (!s) return "";
    return s
      .split("_")
      .filter(Boolean)
      .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : ""))
      .join(" ");
  };


  const resolveDisplayForIngredientKey = (ingredientKey: string) => {
    const k = String(ingredientKey || "").trim().toLowerCase();
    if (!k) return "";

    // 1) direct match
    const direct = scanDisplayByCanonical[k];
    if (direct) return direct;

    // 2) identity fallbacks: scan label uses a different key than the DB ingredient_key
    //    (e.g. scan sees "tequila_blanco" but user scanned "tequila" and vice versa)
    //    Note: server-side recommendation already handles family/type matching via
    //    identityMap; this is UI-only display name resolution for the recipe screen.
    //    Kept in sync with ingredient_ontology alternatives (Stage 14 Part 5).
    const identityFallbacks: Record<string, string[]> = {
      // ── Tequila family ──────────────────────────────────────────────────────
      tequila_blanco:   ["tequila", "tequila_reposado", "mezcal"],
      tequila:          ["tequila_blanco", "tequila_reposado"],
      tequila_reposado: ["tequila_blanco", "tequila", "tequila_anejo"],
      tequila_anejo:    ["tequila_reposado", "tequila_blanco", "tequila"],
      mezcal:           ["tequila_blanco"],

      // ── Orange liqueur family ────────────────────────────────────────────────
      triple_sec:     ["cointreau", "orange_curacao", "grand_marnier", "combier"],
      cointreau:      ["triple_sec", "orange_curacao", "grand_marnier", "combier"],
      orange_curacao: ["triple_sec", "cointreau", "grand_marnier", "combier"],
      grand_marnier:  ["cointreau", "triple_sec", "orange_curacao"],
      combier:        ["cointreau", "triple_sec", "orange_curacao"],
      orange_liqueur: ["orange_curacao", "triple_sec", "cointreau", "grand_marnier"],

      // ── Whiskey family ───────────────────────────────────────────────────────
      bourbon:       ["irish_whiskey", "rye_whiskey"],
      irish_whiskey: ["bourbon", "rye_whiskey"],
      rye_whiskey:   ["bourbon"],

      // ── Sparkling wine ───────────────────────────────────────────────────────
      champagne: ["prosecco"],
      prosecco:  ["champagne"],

      // ── Herbal liqueur ───────────────────────────────────────────────────────
      green_chartreuse:  ["yellow_chartreuse"],
      yellow_chartreuse: ["green_chartreuse"],

      // ── Rum family ───────────────────────────────────────────────────────────
      gold_rum: ["aged_rum", "dark_rum"],
      aged_rum: ["gold_rum", "dark_rum"],
      dark_rum: ["aged_rum", "gold_rum"],

      // ── Citrus ───────────────────────────────────────────────────────────────
      lemon_juice: ["lime_juice"],
      lime_juice:  ["lemon_juice"],

      // ── Fruit liqueur ────────────────────────────────────────────────────────
      apricot_liqueur: ["peach_schnapps"],
      peach_schnapps:  ["apricot_liqueur"],

      // ── Base spirits (light alternatives) ───────────────────────────────────
      gin:       ["vodka"],
      white_rum: ["vodka"],

      // ── Bitters alias ────────────────────────────────────────────────────────
      peychaud_s_bitters: ["peychaud_bitters"],
      peychaud_bitters:   ["peychaud_s_bitters"],
    };

    const alts = identityFallbacks[k] ?? [];
    for (const alt of alts) {
      const hit = scanDisplayByCanonical[String(alt || "").trim().toLowerCase()];
      if (hit) return hit;
    }

    // 3) fallback: prefix/contains matching (useful when DB key is more specific)
    // e.g. tequila_blanco -> tequila, or orange_curacao -> curacao-like matches
    for (const [scanKey, scanDisplay] of Object.entries(scanDisplayByCanonical)) {
      const sk = String(scanKey || "").trim().toLowerCase();
      if (!sk || !scanDisplay) continue;

      if (k === sk) return scanDisplay;
      if (k.startsWith(sk + "_") || sk.startsWith(k + "_")) return scanDisplay;

      // very small heuristic: if both contain a shared root token, accept
      // (kept conservative to avoid weird matches)
      if ((k.includes("tequila") && sk.includes("tequila")) || (k.includes("curacao") && sk.includes("curacao"))) {
        return scanDisplay;
      }
    }

    return "";
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
  const { favoritesByKey, toggleFavorite } = useFavorites();
  const { inventory, initialized: inventoryInitialized, refreshInventory, recordInventoryUse } = useInventory();

  const { session } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dbRecipe, setDbRecipe] = useState<DbRecipe | null>(null);

  // Stage 9: 「我做了這杯！」確認流程
  // idle   → 顯示黑色「I made this! 🍹」
  // done   → 顯示綠色「Logged! 🍹」（3 秒）
  // hidden → 按鈕完全隱藏（3 秒後，直到離開再回來）
  type MadeDrinkState = 'idle' | 'done' | 'hidden'
  const [madeDrinkState, setMadeDrinkState] = useState<MadeDrinkState>('idle');
  const [madeDrinkLoading, setMadeDrinkLoading] = useState(false);
  const madeDrinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 離開畫面時重置（回來會重新看到「I made this!」，且 inventory 也會重新 fetch）
  useFocusEffect(
    useCallback(() => {
      return () => {
        setMadeDrinkState('idle');
        if (madeDrinkTimerRef.current) {
          clearTimeout(madeDrinkTimerRef.current);
          madeDrinkTimerRef.current = null;
        }
      };
    }, [])
  );

  useEffect(() => {
    let alive = true;

    const run = async () => {
      setError(null);

      if (!ibaCode) {
        setDbRecipe(null);
        return;
      }

      if (!API_URL) {
        setDbRecipe(null);
        setError("Missing EXPO_PUBLIC_API_URL. Please check .env.");
        return;
      }

      setLoading(true);
      try {
        const resp = await fetch(`${API_URL}/recipes/${encodeURIComponent(ibaCode)}`);
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
  }, [ibaCode, API_URL]);

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

  const currentRating: FeedbackRating | null = (ratingsByKey?.[recipeKey] as FeedbackRating) ?? null;

  const isFav = !!favoritesByKey?.[recipeKey];

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
        API_URL: API_URL || "(missing)",
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
                return { key, resolved: fromScan || null };
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
      saved_at: Date.now(),
    });
  };

  const onToggleFavorite = () => {
    doAddFavorite();
  };

  const sendFeedback = async (next: FeedbackRating) => {
    setError(null);

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

    if (!API_URL) {
      if (prev) setRating(recipeKey, prev);
      else clearRating(recipeKey);
      setError("Missing EXPO_PUBLIC_API_URL. Please check .env.");
      return;
    }

    try {
      const resp = await fetch(`${API_URL}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe_key: recipeKey,
          rating: next,
          recipe,
          ingredients: ingredientsFromScan,
          context: { app_version: "RECIPES_V1" },
        }),
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

    if (!API_URL) {
      setError("Missing EXPO_PUBLIC_API_URL. Please check .env.");
      return;
    }

    try {
      const resp = await fetch(`${API_URL}/share-recipe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe, ingredients: ingredientsFromScan }),
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

  // Stage 9: 確認製作，扣除 My Bar 庫存
  const handleMadeDrink = async () => {
    if (!session?.access_token) {
      Alert.alert('Sign in required', 'Please sign in to track your usage.')
      return
    }

    if (!dbRecipe || dbRecipe.ingredients.length === 0) {
      Alert.alert('Not ready', 'Recipe not loaded yet. Please wait.')
      return
    }

    if (!API_URL) {
      Alert.alert('Error', 'Missing API URL.')
      return
    }

    try {
      const inventoryItems = inventoryInitialized
        ? inventory
        : await refreshInventory({ silent: true });

      // 建立 ingredient_key → inventory item 的 map
      const invByKey: Record<string, { id: string; display_name: string; remaining_volume: number }> = {}
      for (const it of inventoryItems) {
        invByKey[String(it.ingredient_key ?? '').trim()] = {
          id: it.id,
          display_name: it.display_name,
          remaining_volume: Number(it.remaining_volume ?? 0),
        }
      }

      // 2. 比對食譜食材 vs 庫存
      type DeductItem = { ingredient_id: string; amount_ml: number; display_name: string }
      const toDeduct: DeductItem[] = []

      for (const ing of dbRecipe.ingredients) {
        const key = String(ing.item ?? '').trim()
        const ml = ing.amount_ml !== null && ing.amount_ml !== undefined ? Number(ing.amount_ml) : null
        if (!key || ml === null || !Number.isFinite(ml) || ml <= 0) continue

        const invItem = invByKey[key]
        if (!invItem) continue

        toDeduct.push({
          ingredient_id: invItem.id,
          amount_ml: Math.round(ml),
          display_name: invItem.display_name,
        })
      }

      if (toDeduct.length === 0) {
        Alert.alert(
          'Nothing to update',
          "None of this recipe's ingredients (with amounts) match your My Bar."
        )
        return
      }

      // 3. 確認 dialog
      const lines = toDeduct.map((x) => `• ${x.display_name}: −${x.amount_ml}ml`)
      Alert.alert(
        'I made this! 🍹',
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
                  ingredients_used: toDeduct.map((x) => ({
                    ingredient_id: x.ingredient_id,
                    amount_ml: x.amount_ml,
                  })),
                })
                setMadeDrinkState('done');
                // 3 秒後完全隱藏按鈕
                if (madeDrinkTimerRef.current) clearTimeout(madeDrinkTimerRef.current);
                madeDrinkTimerRef.current = setTimeout(() => {
                  setMadeDrinkState('hidden');
                  madeDrinkTimerRef.current = null;
                }, 3000);
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
    if (list.length === 0) return <Text style={{ color: "#666" }}>(No ingredients)</Text>;

    const sorted = [...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    return (
      <View style={{ gap: 6 }}>
        {sorted.map((it, i) => {
          const key = String(it?.item ?? "").trim();
          const fromScan = resolveDisplayForIngredientKey(key);
          const name = (fromScan || humanizeKey(key) || "unknown").trim();
          const isOptional = Boolean(it?.is_optional);

          const ml =
            it?.amount_ml === null || it?.amount_ml === undefined || it?.amount_ml === ""
              ? null
              : Number(it.amount_ml);

          const unit = it?.unit ? String(it.unit).trim() : "";

          let amountLabel = "";
          if (Number.isFinite(ml)) {
            amountLabel = `${ml} ml`;
          } else if (it?.amount_text && String(it.amount_text).trim()) {
            amountLabel = unit ? `${String(it.amount_text).trim()} ${unit}` : String(it.amount_text).trim();
          } else {
            amountLabel = "n/a";
          }

          return (
            <Text key={i}>
              • {name} — {amountLabel}
              {isOptional ? " (optional)" : ""}
            </Text>
          );
        })}
      </View>
    );
  };

  const hasSelection = Boolean(ibaCode) || Boolean(legacyRecipe);

  if (!hasSelection) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: "800" }}>Recipe</Text>
        <Text style={{ color: "#666" }}>No recipe selected. Go back to Scan and tap “View”.</Text>

        {__DEV__ ? (
          <View style={{ padding: 12, borderWidth: 1, borderRadius: 12, gap: 6 }}>
            <Text style={{ fontWeight: "800" }}>Debug</Text>
            <Text style={{ color: "#666" }}>ibaCode: {ibaCode || "(empty)"}</Text>
            <Text style={{ color: "#666" }}>recipe_key: {String((params as any)?.recipe_key ?? "") || "(empty)"}</Text>
            <Text style={{ color: "#666" }}>idx: {String((params as any)?.idx ?? "") || "(empty)"}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => router.replace("/(tabs)/scan")}
          style={{
            alignSelf: "flex-start",
            borderWidth: 1,
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 8,
            marginTop: 8,
          }}
        >
          <Text style={{ fontWeight: "800" }}>Back</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          gap: 12,
          paddingBottom: 40,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ fontSize: 22, fontWeight: "900", flex: 1 }}>
            {recipeTitle ? recipeTitle : ibaCode ? "Recipe" : "Recipe"}
          </Text>

          <Pressable onPress={onToggleFavorite} hitSlop={10} style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
            <FontAwesome name={isFav ? "heart" : "heart-o"} color={isFav ? "#E11D48" : "#888"} size={20} />
          </Pressable>

          {__DEV__ ? (
            <Pressable
              onPress={copyDebug}
              hitSlop={10}
              style={{
                borderWidth: 1,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
                marginLeft: 8,
              }}
            >
              <Text style={{ fontWeight: "800", color: "#666" }}>Copy Debug</Text>
            </Pressable>
          ) : null}
        </View>

        {headerLine ? (
          <Pressable onLongPress={copyDebug} delayLongPress={450}>
            <Text style={{ color: "#555" }}>{headerLine}</Text>
          </Pressable>
        ) : null}


        {loading ? (
          <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
            <Text style={{ fontWeight: "800" }}>Loading…</Text>
            <Text style={{ color: "#666" }}>
              Fetching full recipe from backend using iba_code: {ibaCode || "(missing)"}
            </Text>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => sendFeedback("like")}
            style={{
              flex: 1,
              borderWidth: 1,
              borderRadius: 12,
              paddingVertical: 10,
              alignItems: "center",
              opacity: currentRating === "dislike" ? 0.6 : 1,
            }}
          >
            <Text style={{ fontWeight: "800" }}>{currentRating === "like" ? "Liked" : "Like"}</Text>
          </Pressable>

          <Pressable
            onPress={() => sendFeedback("dislike")}
            style={{
              flex: 1,
              borderWidth: 1,
              borderRadius: 12,
              paddingVertical: 10,
              alignItems: "center",
              opacity: currentRating === "like" ? 0.6 : 1,
            }}
          >
            <Text style={{ fontWeight: "800" }}>{currentRating === "dislike" ? "Disliked" : "Dislike"}</Text>
          </Pressable>
        </View>

        {/* Stage 9: 「I made this!」按鈕（hidden 時完全不顯示） */}
        {session && dbRecipe && madeDrinkState !== 'hidden' ? (
          <Pressable
            onPress={handleMadeDrink}
            disabled={madeDrinkLoading || madeDrinkState === 'done'}
            style={{
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: madeDrinkState === 'done' ? '#6F8F7C' : '#111',
              flexDirection: 'row',
              gap: 8,
              opacity: madeDrinkLoading ? 0.7 : 1,
            }}
          >
            {madeDrinkLoading
              ? <ActivityIndicator size="small" color="#FFF" />
              : null}
            <Text style={{ fontWeight: '900', color: '#FFF', fontSize: 15 }}>
              {madeDrinkState === 'done' ? 'Logged! 🍹' : 'I made this! 🍹'}
            </Text>
          </Pressable>
        ) : null}

        {error ? (
          <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
            <Text style={{ fontWeight: "800" }}>Error</Text>
            <Text>{error}</Text>
          </View>
        ) : null}

        <View style={{ padding: 12, borderWidth: 1, borderRadius: 12, gap: 12 }}>
          <View>
            <Text style={{ fontWeight: "900", marginBottom: 6 }}>Ingredients</Text>
            {dbRecipe ? (
              renderDbIngredients()
            ) : loading ? (
              <Text style={{ color: "#666" }}>(Loading full recipe…)</Text>
            ) : error ? (
              <Text style={{ color: "#B00020" }}>Failed to load recipe: {error}</Text>
            ) : ibaCode ? (
              <Text style={{ color: "#666" }}>(Waiting for full recipe…)</Text>
            ) : (
              <Text style={{ color: "#666" }}>(Missing iba_code)</Text>
            )}
          </View>

          {dbRecipe?.instructions ? (
            <View>
              <Text style={{ fontWeight: "900", marginBottom: 6 }}>Instructions</Text>
              <Text>{String(dbRecipe.instructions)}</Text>
            </View>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 4 }}>
          <Pressable
            onPress={() => router.replace("/(tabs)/scan")}
            style={{
              borderWidth: 1,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ fontWeight: "800" }}>Back</Text>
          </Pressable>

          <Pressable
            onPress={createShareAndGo}
            style={{
              borderWidth: 1,
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 8,
              backgroundColor: "white",
            }}
          >
            <Text style={{ fontWeight: "900" }}>Share</Text>
          </Pressable>
        </View>

        <Text style={{ color: "#666" }}>You can switch back to Scan anytime to view another recipe.</Text>
      </ScrollView>
    </View>
  );
}
