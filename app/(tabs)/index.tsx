import React, { useMemo, useState } from "react";
import { Alert, Button, Image, ScrollView, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

export default function TabOneScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<"idle" | "ingredients" | "recipes">("idle");
  const [error, setError] = useState<string | null>(null);

  const API_URL = useMemo(() => process.env.EXPO_PUBLIC_API_URL, []);

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
    setStage("idle");
  };

  const analyze = async () => {
    if (!imageUri) return;

    if (!API_URL) {
      setError("缺少 EXPO_PUBLIC_API_URL。請檢查前端 .env 是否設定正確。");
      return;
    }

    setLoading(true);
    setError(null);
    setIngredients([]);
    setRecipes([]);
    setStage("idle");

    try {
      // 1) 讀取圖片為 base64
      const base64 = await FileSystem.readAsStringAsync(
        imageUri,
        { encoding: "base64" } as any
      );

      // 2) 呼叫辨識 ingredients
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
      setStage("ingredients");

      // 3) 呼叫生成 recipes
      const resp2 = await fetch(`${API_URL}/generate-recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients: list }),
      });

      if (!resp2.ok) {
        const t2 = await resp2.text();
        throw new Error(`Recipe API 失敗：${resp2.status} ${t2}`);
      }

      const data2 = (await resp2.json()) as { recipes: any[] };
      setRecipes(Array.isArray(data2.recipes) ? data2.recipes : []);
      setStage("recipes");
    } catch (e: any) {
      setError(e?.message ?? "分析失敗，請稍後再試。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: "800" }}>
        Scan Ingredients
      </Text>

      {/* 版本標記：用來確認你手機真的載入了最新程式 */}
      {/* Debug info: only show in development */}
    {/* Debug info: only show in development */}
    {__DEV__ ? (
      <View style={{ gap: 4 }}>
        <Text style={{ color: "#555" }}>BUILD: RECIPES_V1</Text>

        <Text style={{ color: "#555" }}>
          API_URL: {API_URL ?? "(missing)"}
        </Text>

        <Text style={{ color: "#555" }}>
          stage: {stage} | loading: {String(loading)} | recipes: {recipes.length}
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
            title={loading ? "Running..." : "Run Ingredient"}
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

      {/* 先顯示 Recipes（避免你覺得「只到 ingredients」） */}
      <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
        <Text style={{ fontWeight: "800", marginBottom: 8 }}>Recipes</Text>
        {recipes.length === 0 ? (
          <Text>（尚無 recipes）</Text>
        ) : (
          recipes.map((r, idx) => (
            <View key={idx} style={{ marginBottom: 12 }}>
              <Text style={{ fontWeight: "800" }}>
                {idx + 1}. {r.short_name ?? r.name ?? "Untitled"}
              </Text>
              {Array.isArray(r.flavor_4) && r.flavor_4.length === 4 ? (
                <Text>{r.flavor_4.join(" • ")}</Text>
              ) : (
                <Text style={{ color: "#666" }}>（無 flavor tags）</Text>
              )}
            </View>
          ))
        )}
      </View>

      <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
        <Text style={{ fontWeight: "800", marginBottom: 8 }}>
          Ingredients
        </Text>
        {ingredients.length === 0 ? (
          <Text>（尚無 ingredients）</Text>
        ) : (
          ingredients.map((ing, idx) => <Text key={idx}>• {ing}</Text>)
        )}
      </View>
    </ScrollView>
  );
}
