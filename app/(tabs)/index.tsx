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

// ✅ [UPDATED] useFeedback (NOT useFeedbackStore)
import { useFeedback } from "@/context/feedback";

import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";

type Safety = {
  non_consumable_items: string[];
  risk_level: "none" | "possible" | "high";
  message: string;
};

export default function TabOneScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
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

  // keyboard height (iPhone)
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // ✅ [UPDATED] read ratings map from shared feedback context
  const feedback = useFeedback() as any;
  const ratingsByKey: Record<string, "like" | "dislike"> =
    feedback?.ratingsByKey ?? feedback?.ratings ?? {};

  const API_URL = useMemo(() => process.env.EXPO_PUBLIC_API_URL, []);

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
  };

  const openRecipeInTab2 = (r: any, idx: number) => {
    const recipe_json = encodeURIComponent(JSON.stringify(r));
    const ingredients_json = encodeURIComponent(JSON.stringify(ingredients));

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
    setRecipes([]);
    setSafety(null);
    setExpandedIndex(null);
    setRecipesStale(false);
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
    setRecipes([]);
    setSafety(null);
    setExpandedIndex(null);
    setRecipesStale(false);
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
    setRecipes([]);
    setRecipesStale(false);
    setSafety(null);

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

      // ✅ [UPDATED] parse safety too
      const data = (await resp.json()) as { ingredients: string[]; safety?: Safety };
      const list = Array.isArray(data.ingredients) ? data.ingredients : [];
      setIngredients(list);
      setSafety(data.safety ?? null);

      setStage("idle");
    } catch (e: any) {
      setError(e?.message ?? "Failed to analyze image.");
      setStage("idle");
    } finally {
      setLoading(false);
    }
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

    setNewIngredient("");
  };

  const removeIngredient = (idx: number) => {
    if (recipes.length > 0) invalidateRecipes();
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
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

    try {
      const resp = await fetch(`${API_URL}/generate-recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Recipe API failed: ${resp.status} ${t}`);
      }

      const data = (await resp.json()) as { recipes: any[] };
      setRecipes(Array.isArray(data.recipes) ? data.recipes : []);
      setRecipesStale(false);
      setStage("idle");
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate recipes.");
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

    setEditingIndex(null);
    setEditingValue("");
  };

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >

      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ fontSize: 20, fontWeight: "800", flex: 1 }}>
          Scan Ingredients
        </Text>

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


      {__DEV__ ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: "#555" }}>BUILD: RECIPES_V1</Text>
          <Text style={{ color: "#555" }}>API_URL: {API_URL ?? "(missing)"}</Text>
          <Text style={{ color: "#555" }}>
            stage: {stage} | loading: {String(loading)} | recipes: {recipes.length}
          </Text>
          <Text style={{ color: "#555" }}>
            safety:{" "}
            {safety ? `${safety.risk_level} | non=${safety.non_consumable_items.length}` : "null"}
          </Text>
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
                  : "Generating recipes..."
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

      {/* Safety warning */}
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

          <Text style={{ fontWeight: "800", marginBottom: 4 }}>
            Risk: {safety.risk_level}
          </Text>

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

      {/* Ingredients */}
      <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
        <Text style={{ fontWeight: "800", marginBottom: 8 }}>Ingredients (editable)</Text>

        {recipesStale ? (
          <View style={{ padding: 10, borderWidth: 1, borderRadius: 10, marginBottom: 8 }}>
            <Text style={{ fontWeight: "800" }}>Recipes out of date</Text>
            <Text style={{ color: "#555" }}>
              Ingredients changed. Please regenerate recipes.
            </Text>
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
                          // @ts-ignore
                          scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(
                            // @ts-ignore
                            e.target,
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
                      <Text
                        style={{ flex: 1, flexShrink: 1, paddingRight: 8 }}
                        numberOfLines={1}
                      >
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
                  loading
                    ? "Generating..."
                    : recipes.length === 0
                    ? "Run Recipes"
                    : "Regenerate Recipes"
                }
                onPress={regenerateRecipes}
                disabled={loading || ingredients.length === 0}
              />
            </View>
          </View>
        </View>
      </View>

      {/* Recipes (compact list) */}
      <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
        <Text style={{ fontWeight: "800", marginBottom: 8 }}>Recipes</Text>

        {recipes.length === 0 ? (
          <Text style={{ color: "#666" }}>(No recipes yet)</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {recipes.map((r, idx) => {
              const title = String(r?.short_name ?? r?.name ?? `Recipe ${idx + 1}`).trim();
              const recipeKey = `${idx + 1}-${title}`;
              const rated = Boolean(ratingsByKey?.[recipeKey]);

              const tags =
                Array.isArray(r?.flavor_4) && r.flavor_4.length === 4 ? r.flavor_4 : [];

              return (
                <View
                  key={`${title}-${idx}`}
                  style={{
                    borderWidth: 1,
                    borderRadius: 12,
                    padding: 12,
                    gap: 8,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Text style={{ fontWeight: "800", flex: 1 }}>
                      {idx + 1}. {title}
                    </Text>

                    {/* Rated badge (no liked/disliked text) */}
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
                        <Text
                          style={{
                            fontWeight: "400", 
                            color: "#777", 
                          }}
                        >
                          Rated
                        </Text>
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

                  {tags.length === 4 ? (
                    <Text style={{ color: "#555" }}>{tags.join(" • ")}</Text>
                  ) : (
                    <Text style={{ color: "#666" }}>(No flavor tags)</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
