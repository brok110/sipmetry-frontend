import React, { useMemo, useState } from "react";
import { ActivityIndicator, Button, Image, ScrollView, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";

export default function ScanScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAnalyze = useMemo(() => !!imageUri && !loading, [imageUri, loading]);

  const pickFromLibrary = async () => {
    setError(null);
    setIngredients([]);

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!res.canceled) {
      setImageUri(res.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    setError(null);
    setIngredients([]);

    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError("相機權限未開啟。請到系統設定允許相機權限。");
      return;
    }

    const res = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!res.canceled) {
      setImageUri(res.assets[0].uri);
    }
  };

const analyzeMock = async () => {
  if (!imageUri) return;

  setLoading(true);
  setError(null);
  setIngredients([]);

  try {
    // 模擬 API 等待時間，讓你看到 loading
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIngredients(["tequila", "lime", "triple sec"]);
  } catch (e: any) {
    setError(e?.message ?? "分析失敗，請稍後再試。");
  } finally {
    setLoading(false);
  }
};


  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "600" }}>Scan Ingredients</Text>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <Button title="從相簿選擇" onPress={pickFromLibrary} />
        <Button title="拍照" onPress={takePhoto} />
      </View>

      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={{ width: "100%", height: 240, borderRadius: 12 }}
        />
      ) : (
        <View style={{ padding: 16, borderWidth: 1, borderRadius: 12 }}>
          <Text>尚未選擇照片</Text>
        </View>
      )}

      <Button title="Run Ingredient" onPress={analyzeMock} disabled={!canAnalyze} />

      {loading && (
        <View style={{ paddingVertical: 12 }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8 }}>分析中…</Text>
        </View>
      )}

      {error && (
        <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
          <Text style={{ fontWeight: "600" }}>錯誤</Text>
          <Text>{error}</Text>
        </View>
      )}

      <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
        <Text style={{ fontWeight: "600", marginBottom: 8 }}>識別結果</Text>
        {ingredients.length === 0 ? (
          <Text>（尚無結果）</Text>
        ) : (
          ingredients.map((it, idx) => <Text key={`${it}-${idx}`}>• {it}</Text>)
        )}
      </View>
    </ScrollView>
  );
}

