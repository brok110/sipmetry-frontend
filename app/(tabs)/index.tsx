import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  Alert,
  Button,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  Dimensions,
} from "react-native";


import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

export default function TabOneScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [recipesStale, setRecipesStale] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<
    "idle" | "identifying ingredients" | "generating"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [newIngredient, setNewIngredient] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [pendingScrollIndex, setPendingScrollIndex] = useState<number | null>(null);

  
  // keyboard height (iPhone)
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const h = e.endCoordinates?.height ?? 0;
      setKeyboardHeight(h);

      // 關鍵：鍵盤要出現時（iOS willShow），才做 scroll
      if (pendingScrollIndex !== null) {
        // 等下一個 frame，讓 layout/keyboard 生效再捲（更穩）
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



  const API_URL = useMemo(() => process.env.EXPO_PUBLIC_API_URL, []);
  const scrollRef = useRef<ScrollView>(null);
  const ingredientYRef = useRef<Record<number, number>>({});

  const scrollToIngredient = (idx: number) => {
    const y = ingredientYRef.current[idx];
    if (typeof y !== "number") return;
    const windowH = Dimensions.get("window").height;
    // 這個 padding 是預留給上方標題/安全區/卡片間距
    const topPadding = 140;
    // 可視高度 = 螢幕高度 - 鍵盤高度 - 上方預留
    const visibleH = Math.max(200, windowH - keyboardHeight - topPadding);
    // 0.45：讓輸入框落在「可視區偏中間」
    const targetY = Math.max(0, y - visibleH * 0.35);
    scrollRef.current?.scrollTo({ y: targetY, animated: true });
  };

  const invalidateRecipes = () => {
    // ingredients 變了 → 舊 recipes 不可信
    setRecipes([]);
    setExpandedIndex(null);
    setRecipesStale(true);
  };



  const pickImage = async () => {
    setError(null);

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("需要權限", "請允許相簿權限以選擇照片。");
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
    setExpandedIndex(null);
    setStage("idle");
  };

  const takePhoto = async () => {
    setError(null);

    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("需要權限", "請允許相機權限以拍照。");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (result.canceled) return;

    const uri = result.assets?.[0]?.uri ?? null;
    setImageUri(uri);
    setIngredients([]);
    setRecipes([]);
    setExpandedIndex(null);
    setStage("idle");
  };

  const analyze = async () => {
    if (!imageUri) return;

    if (!API_URL) {
      setError("缺少 EXPO_PUBLIC_API_URL。請檢查前端 .env 是否設定正確。");
      return;
    }

    // reset UI state
    setLoading(true);
    setStage("identifying ingredients");
    setExpandedIndex(null);
    setError(null);

    setIngredients([]);
    setRecipes([]);
    setRecipesStale(false); // ←【新增】重新辨識時先清掉「recipes 過期」提示（此時也沒有 recipes）

    try {
      // 1) 讀取圖片為 base64
      const base64 = await FileSystem.readAsStringAsync(
        imageUri,
        { encoding: "base64" } as any
      );

      // 2) 呼叫辨識 ingredients（只做到這裡，不生成 recipes）
      const resp = await fetch(`${API_URL}/analyze-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: base64 }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Ingredient API 失敗：${resp.status} ${t}`);
      }

      const data = (await resp.json()) as { ingredients: string[] };
      const list = Array.isArray(data.ingredients) ? data.ingredients : [];
      setIngredients(list);

      // ←【改動】不再 setStage("generating")，也不呼叫 /generate-recipes
      setStage("idle");
    } catch (e: any) {
      setError(e?.message ?? "分析失敗，請稍後再試。");
      setStage("idle");
    } finally {
      setLoading(false);
    }
  };





  const removeIngredient = (idx: number) => {
    // 只有當目前有 recipes 時才提示過期（避免一開始就顯示）
    if (recipes.length > 0) invalidateRecipes();

    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  };


  const addIngredient = () => {
    const v = newIngredient.trim();
    if (!v) return;

    setIngredients((prev) => {
      const exists = prev.some((x) => x.toLowerCase() === v.toLowerCase());
      if (exists) return prev;

      // 真的有新增才讓 recipes 失效
      if (recipes.length > 0) invalidateRecipes();
      return [...prev, v];
    });

    setNewIngredient("");
  };


  const regenerateRecipes = async () => {
    if (!API_URL) {
      setError("缺少 EXPO_PUBLIC_API_URL。請檢查前端 .env 是否設定正確。");
      return;
    }
    if (!ingredients || ingredients.length === 0) {
      setError("目前沒有 ingredients，請先辨識或新增。");
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
        throw new Error(`Recipe API 失敗：${resp.status} ${t}`);
      }

      const data = (await resp.json()) as { recipes: any[] };
      setRecipes(Array.isArray(data.recipes) ? data.recipes : []);
      setRecipesStale(false);
      setStage("idle");
    } catch (e: any) {
      setError(e?.message ?? "生成失敗，請稍後再試。");
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
      setError("Ingredient 不能是空白。");
      return;
    }

    // 若其實沒變更（忽略大小寫），就直接收起來，不要讓 recipes 過期
    const before = (ingredients[editingIndex] ?? "").trim();
    if (before && before.toLowerCase() === v.toLowerCase()) {
      setEditingIndex(null);
      setEditingValue("");
      return;
    }

    let changed = false;

    setIngredients((prev) => {
      // 避免和其他項重複（大小寫不敏感）
      const exists = prev.some(
        (x, i) => i !== editingIndex && x.toLowerCase() === v.toLowerCase()
      );
      if (exists) return prev;

      const next = [...prev];
      next[editingIndex] = v;
      changed = true;
      return next;
    });

    // 只有真的改動才讓 recipes 過期
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
      <Text style={{ fontSize: 20, fontWeight: "800" }}>Scan Ingredients</Text>

      {/* Debug info: only show in development */}
      {__DEV__ ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: "#555" }}>BUILD: RECIPES_V1</Text>

          <Text style={{ color: "#555" }}>API_URL: {API_URL ?? "(missing)"}</Text>

          <Text style={{ color: "#555" }}>
            stage: {stage} | loading: {String(loading)} | recipes:{" "}
            {recipes.length}
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
                : "Run Ingredient"
            }
            onPress={analyze}
            disabled={loading}
          />
        </View>
      ) : (
        <Text style={{ color: "#666" }}>先選一張照片或拍照。</Text>
      )}

      {error ? (
        <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
          <Text style={{ fontWeight: "800" }}>Error</Text>
          <Text>{error}</Text>
        </View>
      ) : null}

      {/* Ingredients */}
      <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
        <Text style={{ fontWeight: "800", marginBottom: 8 }}>
          Ingredients (editable)
        </Text>

        {recipesStale ? (
          <View style={{ padding: 10, borderWidth: 1, borderRadius: 10, marginBottom: 8 }}>
            <Text style={{ fontWeight: "800" }}>Recipes out of date</Text>
            <Text style={{ color: "#555" }}>
              Ingredients 已變更。請按「Regenerate Recipes」重新生成 recipes。
            </Text>
          </View>
        ) : null}


        {ingredients.length === 0 ? (
          <Text>（尚無 ingredients）</Text>
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
                  {/* Left: text or input */}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {isEditing ? (
                      <TextInput
                        autoFocus
                        value={editingValue}
                        onChangeText={setEditingValue}
                        autoCapitalize="none"
                        onFocus={(e) => {
                          // iPhone: scroll input above keyboard (most stable)
                          // @ts-ignore
                          scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(
                            // @ts-ignore
                            e.target,
                            120, // 額外往上推的距離（iPhone 建議 120~180）
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

                  {/* Right: actions */}
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

        {/* Add new ingredient (independent state: newIngredient) */}
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

      {/* Recipes */}
      <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
        <Text style={{ fontWeight: "800", marginBottom: 8 }}>Recipes</Text>

        {recipes.length === 0 ? (
          <Text>（尚無 recipes）</Text>
        ) : (
          recipes.map((r, idx) => {
            const isOpen = expandedIndex === idx;
            const title = r?.short_name ?? r?.name ?? `Recipe ${idx + 1}`;
            const tags =
              Array.isArray(r?.flavor_4) && r.flavor_4.length === 4
                ? r.flavor_4
                : [];

            const liquids = Array.isArray(r?.ingredients_ml)
              ? r.ingredients_ml
              : [];
            const steps = Array.isArray(r?.instructions) ? r.instructions : [];
            const garnish = Array.isArray(r?.garnish) ? r.garnish : [];

            return (
              <View
                key={idx}
                style={{
                  borderWidth: 1,
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ fontWeight: "800", flex: 1, paddingRight: 8 }}>
                    {idx + 1}. {title}
                  </Text>

                  <Text
                    onPress={() => setExpandedIndex(isOpen ? null : idx)}
                    style={{ fontWeight: "800" }}
                  >
                    {isOpen ? "Hide" : "View"}
                  </Text>
                </View>

                {tags.length > 0 ? (
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 8,
                      marginTop: 8,
                    }}
                  >
                    {tags.map((t: string, tIdx: number) => (
                      <View
                        key={tIdx}
                        style={{
                          borderWidth: 1,
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                        }}
                      >
                        <Text style={{ fontWeight: "700" }}>{t}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={{ marginTop: 8, color: "#666" }}>
                    （無 flavor tags）
                  </Text>
                )}

                {isOpen ? (
                  <View style={{ marginTop: 12, gap: 10 }}>
                    <View>
                      <Text style={{ fontWeight: "800", marginBottom: 6 }}>
                        Ingredients (ml)
                      </Text>
                      {liquids.length === 0 ? (
                        <Text style={{ color: "#666" }}>（無 ingredients_ml）</Text>
                      ) : (
                        liquids.map((it: any, i2: number) => (
                          <Text key={i2}>
                            • {String(it?.item ?? "").trim() || "unknown"} —{" "}
                            {Number.isFinite(it?.ml) ? `${it.ml} ml` : "n/a"}
                          </Text>
                        ))
                      )}
                    </View>

                    <View>
                      <Text style={{ fontWeight: "800", marginBottom: 6 }}>
                        Garnish
                      </Text>
                      {garnish.length === 0 ? (
                        <Text style={{ color: "#666" }}>（無 garnish）</Text>
                      ) : (
                        garnish.map((g: any, gIdx: number) => (
                          <Text key={gIdx}>• {String(g)}</Text>
                        ))
                      )}
                    </View>

                    <View>
                      <Text style={{ fontWeight: "800", marginBottom: 6 }}>
                        Instructions
                      </Text>
                      {steps.length === 0 ? (
                        <Text style={{ color: "#666" }}>（無 instructions）</Text>
                      ) : (
                        steps.map((s: any, sIdx: number) => (
                          <Text key={sIdx}>
                            {sIdx + 1}. {String(s)}
                          </Text>
                        ))
                      )}
                    </View>

                    {typeof r?.why_it_works === "string" &&
                    r.why_it_works.trim() ? (
                      <View>
                        <Text style={{ fontWeight: "800", marginBottom: 6 }}>
                          Why it works
                        </Text>
                        <Text>{r.why_it_works}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>

  );
}
