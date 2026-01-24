import React, { useEffect, useMemo, useRef, useState } from "react";

import { router } from "expo-router";
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

import * as Clipboard from "expo-clipboard";

import { useFeedback } from "@/context/feedback";
import {
  aggregateIngredientVectors,
  getUnknownIngredients,
  normalizeIngredientKey,
} from "@/context/ontology";

import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";

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
};

type SectionTone = "ready" | "one_missing" | "two_missing";

type AnalyzeImageResponse = {
  ingredients?: string[];
  ingredients_raw?: string[];
  safety?: Safety;
  alias?: { loaded_at: string | null; count: number };
};

type CanonicalizeResponse = {
  raw?: string;
  canonical?: string;
  alias?: { loaded_at: string | null; count: number };
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

export default function TabOneScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);

  const [ingredients, setIngredients] = useState<string[]>([]);
  const [ingredientsCanonical, setIngredientsCanonical] = useState<string[]>([]);

  const ontologyIngredients = useMemo(() => {
    return ingredientsCanonical.length > 0 ? ingredientsCanonical : ingredients;
  }, [ingredientsCanonical, ingredients]);

  const normalizedOntologyIngredients = useMemo(() => {
    const normalized = ontologyIngredients
      .map((x) => normalizeIngredientKey(x))
      .filter(Boolean);
    return dedupeCaseInsensitive(normalized);
  }, [ontologyIngredients]);

  const flavorVector = useMemo(() => {
    return aggregateIngredientVectors(normalizedOntologyIngredients);
  }, [normalizedOntologyIngredients]);

  const unknownIngredients = useMemo(() => {
    return getUnknownIngredients(normalizedOntologyIngredients);
  }, [normalizedOntologyIngredients]);

  const [recipes, setRecipes] = useState<ClassicItem[]>([]);
  const [recipesStale, setRecipesStale] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<"idle" | "identifying ingredients" | "generating">("idle");
  const [error, setError] = useState<string | null>(null);
  const [safety, setSafety] = useState<Safety | null>(null);

  const [newIngredient, setNewIngredient] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [pendingScrollIndex, setPendingScrollIndex] = useState<number | null>(null);

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const feedback = useFeedback() as any;
  const ratingsByKey: Record<string, "like" | "dislike"> =
    feedback?.ratingsByKey ?? feedback?.ratings ?? {};

  const API_URL = useMemo(() => process.env.EXPO_PUBLIC_API_URL, []);

  const [hasRecommended, setHasRecommended] = useState(false);

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

  const copyUnknownTemplate = async () => {
    if (!unknownIngredients || unknownIngredients.length === 0) return;

    const lines = unknownIngredients.map((k) => `  "${k}": {  },`).join("\n");
    const payload = "{" + "\n" + lines + "\n" + "}";

    try {
      await Clipboard.setStringAsync(payload);
      Alert.alert("Copied", "Unknown ingredient template copied to clipboard.");
    } catch (e: any) {
      Alert.alert("Copy failed", String(e?.message || e));
    }
  };

  const scrollRef = useRef<ScrollView>(null);
  const ingredientYRef = useRef<Record<number, number>>({});

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

  const invalidateRecipes = () => {
    setRecipes([]);
    setExpandedIndex(null);
    setRecipesStale(true);
    setHasRecommended(false);
  };

  const openRecipeInTab2 = (r: any, idx: number) => {
    const recipe_json = encodeURIComponent(JSON.stringify(r));
    const ingredients_json = encodeURIComponent(JSON.stringify(normalizedOntologyIngredients));

    router.push({
      pathname: "/(tabs)/two",
      params: {
        idx: String(idx),
        recipe_json,
        ingredients_json,
      },
    });
  };

  const pickImage = async () => {
    setError(null);

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Please allow photo library access.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });

    if (result.canceled) return;

    const uri = result.assets?.[0]?.uri ?? null;
    setImageUri(uri);
    setIngredients([]);
    setIngredientsCanonical([]);
    setRecipes([]);
    setSafety(null);
    setExpandedIndex(null);
    setRecipesStale(false);
    setHasRecommended(false);
    setStage("idle");
  };

  const takePhoto = async () => {
    setError(null);

    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Please allow camera access.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (result.canceled) return;

    const uri = result.assets?.[0]?.uri ?? null;
    setImageUri(uri);
    setIngredients([]);
    setIngredientsCanonical([]);
    setRecipes([]);
    setSafety(null);
    setExpandedIndex(null);
    setRecipesStale(false);
    setHasRecommended(false);
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
    setExpandedIndex(null);
    setError(null);

    setIngredients([]);
    setIngredientsCanonical([]);
    setRecipes([]);
    setRecipesStale(false);
    setSafety(null);
    setHasRecommended(false);

    try {
      const base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: "base64" } as any);

      const resp = await fetch(`${API_URL}/analyze-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: base64 }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Ingredient API failed: ${resp.status} ${t}`);
      }

      const data = (await resp.json()) as AnalyzeImageResponse;

      const canonical = Array.isArray(data.ingredients) ? data.ingredients : [];
      const raw =
        Array.isArray(data.ingredients_raw) && data.ingredients_raw.length > 0
          ? data.ingredients_raw
          : canonical;

      const canonicalClean = dedupeCaseInsensitive(
        canonical.map((x) => normalizeIngredientKey(x)).filter(Boolean)
      );

      setIngredients(raw);
      setIngredientsCanonical(canonicalClean);
      setSafety(data.safety ?? null);

      setStage("idle");
    } catch (e: any) {
      setError(e?.message ?? "Failed to analyze image.");
      setStage("idle");
    } finally {
      setLoading(false);
    }
  };

  const canonicalizeOne = async (raw: string) => {
    const v = String(raw || "").trim();
    if (!v) return "";

    if (!API_URL) return v;

    try {
      const url = `${API_URL}/debug/canonicalize?q=${encodeURIComponent(v)}`;
      const r = await fetch(url);
      if (!r.ok) return v;

      const j = (await r.json()) as CanonicalizeResponse;
      const c = String(j?.canonical || "").trim();
      return c || v;
    } catch {
      return v;
    }
  };

  const canonicalizeList = async (rawList: string[]) => {
    const seenRaw = new Set<string>();
    const cleanedRaw = rawList
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .filter((s) => {
        const k = s.toLowerCase();
        if (seenRaw.has(k)) return false;
        seenRaw.add(k);
        return true;
      });

    const out: string[] = [];
    const seenCanon = new Set<string>();

    for (const raw of cleanedRaw) {
      const c = await canonicalizeOne(raw);
      const k = String(c || "").trim();
      if (!k) continue;

      const kk = k.toLowerCase();
      if (seenCanon.has(kk)) continue;

      seenCanon.add(kk);
      out.push(k);
    }

    return out;
  };

  const addIngredient = () => {
    const v = newIngredient.trim();
    if (!v) return;

    setIngredients((prev) => {
      const exists = prev.some((x) => x.toLowerCase() === v.toLowerCase());
      if (exists) return prev;

      if (recipes.length > 0) invalidateRecipes();
      return [...prev, v];
    });

    setIngredientsCanonical([]);
    setNewIngredient("");
    setHasRecommended(false);
  };

  const removeIngredient = (idx: number) => {
    if (recipes.length > 0) invalidateRecipes();
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
    setIngredientsCanonical([]);
    setHasRecommended(false);
  };

  const regenerateRecipes = async () => {
    if (!API_URL) {
      setError("Missing EXPO_PUBLIC_API_URL. Please check .env.");
      return;
    }
    if (!ingredients || ingredients.length === 0) {
      setError("No ingredients yet. Please scan or add ingredients first.");
      return;
    }

    setLoading(true);
    setStage("generating");
    setExpandedIndex(null);
    setError(null);
    setRecipes([]);
    setHasRecommended(true);

    try {
      const canonicalListRaw = await canonicalizeList(ingredients);

      const canonicalList = dedupeCaseInsensitive(
        canonicalListRaw.map((x) => normalizeIngredientKey(x)).filter(Boolean)
      );

      setIngredientsCanonical(canonicalList);

      if (canonicalList.length === 0) {
        throw new Error("No canonical ingredients resolved. Please try again.");
      }

      const resp = await fetch(`${API_URL}/recommend-classics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detected_ingredients: canonicalList }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Recommend API failed: ${resp.status} ${t}`);
      }

      const data = (await resp.json()) as {
        can_make?: any[];
        one_away?: any[];
        two_away?: any[];
      };

      const canMake = Array.isArray(data.can_make) ? data.can_make : [];
      const oneAway = Array.isArray(data.one_away) ? data.one_away : [];
      const twoAway = Array.isArray(data.two_away) ? data.two_away : [];

      const flattened: ClassicItem[] = [
        ...canMake.map((x) => ({ ...x, bucket: "ready" as const })),
        ...oneAway.map((x) => ({ ...x, bucket: "one_missing" as const })),
        ...twoAway.map((x) => ({ ...x, bucket: "two_missing" as const })),
      ];

      setRecipes(flattened);
      setRecipesStale(false);
      setStage("idle");
    } catch (e: any) {
      setError(e?.message ?? "Failed to recommend classics.");
      setStage("idle");
    } finally {
      setLoading(false);
    }
  };

  const startEditIngredient = (idx: number) => {
    setEditingIndex(idx);
    setEditingValue(ingredients[idx] ?? "");
  };

  const saveEditIngredient = () => {
    if (editingIndex === null) return;

    const v = editingValue.trim();
    if (!v) {
      setError("Ingredient cannot be empty.");
      return;
    }

    const before = (ingredients[editingIndex] ?? "").trim();
    if (before && before.toLowerCase() === v.toLowerCase()) {
      setEditingIndex(null);
      setEditingValue("");
      return;
    }

    let changed = false;

    setIngredients((prev) => {
      const exists = prev.some(
        (x, i) => i !== editingIndex && x.toLowerCase() === v.toLowerCase()
      );
      if (exists) return prev;

      const next = [...prev];
      next[editingIndex] = v;
      changed = true;
      return next;
    });

    if (changed && recipes.length > 0) invalidateRecipes();
    if (changed) setIngredientsCanonical([]);

    setEditingIndex(null);
    setEditingValue("");
    setHasRecommended(false);
  };

  const ready = recipes.filter((x) => x.bucket === "ready");
  const oneMissing = recipes.filter((x) => x.bucket === "one_missing");
  const twoMissing = recipes.filter((x) => x.bucket === "two_missing");

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
          const ratedKey = `${idx + 1}-${name}`;
          const rated = Boolean(ratingsByKey?.[ratedKey]);

          const miss = Array.isArray(r.missing_items)
            ? r.missing_items.map((s) => String(s).trim()).filter(Boolean)
            : [];

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

              {miss.length > 0 ? (
                <Text style={{ color: "#555" }} numberOfLines={2}>
                  Missing: {miss.join(" • ")}
                </Text>
              ) : (
                <Text style={{ color: "#666" }}>(No missing items)</Text>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ fontSize: 20, fontWeight: "800", flex: 1 }}>Scan Ingredients</Text>

        <Pressable
          onPress={() => router.push("/(tabs)/three")}
          style={{
            borderWidth: 1,
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          <Text style={{ fontWeight: "800", color: "#666" }}>My Favorites</Text>
        </Pressable>
      </View>

      <Button title="Ping API (/health)" onPress={pingApi} />

      {__DEV__ ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: "#555" }}>BUILD: RECIPES_V1</Text>
          <Text style={{ color: "#555" }}>API_URL: {API_URL ?? "(missing)"}</Text>
          <Text style={{ color: "#555" }}>
            stage: {stage} | loading: {String(loading)} | results: {recipes.length}
          </Text>
          <Text style={{ color: "#555" }}>
            safety:{" "}
            {safety ? `${safety.risk_level} | non=${safety.non_consumable_items.length}` : "null"}
          </Text>
          <Text style={{ color: "#555" }}>hasRecommended: {String(hasRecommended)}</Text>
          <Text style={{ color: "#555" }}>canonical_count: {ingredientsCanonical.length}</Text>

          <Text style={{ color: "#555" }}>
            ontologyIngredients: {ontologyIngredients.length ? ontologyIngredients.join(", ") : "(none)"}
          </Text>
          <Text style={{ color: "#555" }}>
            normalizedIngredients:{" "}
            {normalizedOntologyIngredients.length ? normalizedOntologyIngredients.join(", ") : "(none)"}
          </Text>

          <Pressable
            onPress={copyUnknownTemplate}
            disabled={!unknownIngredients || unknownIngredients.length === 0}
            style={{
              opacity: !unknownIngredients || unknownIngredients.length === 0 ? 0.5 : 1,
            }}
          >
            <Text style={{ color: "#555" }}>
              unknown_ingredients:{" "}
              {unknownIngredients.length ? unknownIngredients.join(", ") : "(none)"}{" "}
              {unknownIngredients.length ? "(tap to copy template)" : ""}
            </Text>
          </Pressable>

          <Text style={{ color: "#555" }}>flavor_vector:</Text>
          <Text style={{ color: "#555" }}>{JSON.stringify(flavorVector)}</Text>
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
            <Text style={{ color: "#555" }}>Ingredients changed. Please refresh recommendations.</Text>
          </View>
        ) : null}

        {ingredients.length === 0 ? (
          <Text style={{ color: "#666" }}>(No ingredients yet)</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {ingredients.map((ing, idx) => {
              const isEditing = editingIndex === idx;

              return (
                <View
                  key={`${ing}-${idx}`}
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
                        • {ing}
                      </Text>
                    )}
                  </View>

                  <View style={{ flexDirection: "row", gap: 8, flexShrink: 0 }}>
                    {isEditing ? (
                      <>
                        <Pressable
                          onPress={() => {
                            setEditingIndex(null);
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
                          onPress={() => startEditIngredient(idx)}
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
            <View style={{ flex: 1 }}>
              <Button
                title={
                  loading ? "Loading..." : hasRecommended ? "Refresh Classics" : "Recommend Classics"
                }
                onPress={regenerateRecipes}
                disabled={loading || ingredients.length === 0}
              />
            </View>
          </View>
        </View>
      </View>

      {hasRecommended ? (
        <View style={{ gap: 12 }}>
          <Section title="Ready" items={ready} tone="ready" />
          <Section title="1 missing" items={oneMissing} tone="one_missing" />
          <Section title="2 missing" items={twoMissing} tone="two_missing" />
          {recipes.length === 0 ? (
            <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
              <Text style={{ fontWeight: "800" }}>No matches</Text>
              <Text style={{ color: "#666" }}>Try adding more ingredients, or check spelling.</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}