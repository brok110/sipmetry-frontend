import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

export default function TabFourScreen() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    share_id?: string;
    share_url?: string;

    // ✅ [ADDED] keep the original recipe params for back navigation
    idx?: string;
    recipe_json?: string;
    ingredients_json?: string;
  }>();

  const shareId = useMemo(() => {
    try {
      return params.share_id ? decodeURIComponent(params.share_id) : "";
    } catch {
      return "";
    }
  }, [params.share_id]);

  const shareUrl = useMemo(() => {
    try {
      return params.share_url ? decodeURIComponent(params.share_url) : "";
    } catch {
      return "";
    }
  }, [params.share_url]);

  const hasLink = Boolean(shareUrl && shareUrl.trim());

  // ✅ [ADDED] build back params (do NOT decode/encode again; pass through as-is)
  const backParams = {
    idx: params.idx ?? "0",
    recipe_json: params.recipe_json ?? "",
    ingredients_json: params.ingredients_json ?? "",
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "900" }}>Share Recipe</Text>

      <Text style={{ color: "#555" }}>
        Ask your friend to scan this QR code. It will open the recipe link.
      </Text>

      <View style={{ padding: 12, borderWidth: 1, borderRadius: 12, gap: 10 }}>
        <Text style={{ fontWeight: "900" }}>QR Code</Text>

        {hasLink ? (
          <View style={{ alignItems: "center", paddingVertical: 10, gap: 10 }}>
            <QRCode value={shareUrl} size={220} />

            <Text style={{ color: "#666" }}>Share link:</Text>
            <Text selectable style={{ fontWeight: "800" }}>
              {shareUrl}
            </Text>

            {shareId ? <Text style={{ color: "#999" }}>ID: {shareId}</Text> : null}
          </View>
        ) : (
          <Text style={{ color: "#666" }}>
            No share link found. Please go back and tap Share again.
          </Text>
        )}
      </View>

      {/* ✅ [UPDATED] Back to the SAME Recipe (Tab 2) with params */}
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/(tabs)/recipe",
            params: backParams,
          })
        }
        style={{
          alignSelf: "flex-start",
          borderWidth: 1,
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <Text style={{ fontWeight: "800" }}>Back to Recipe</Text>
      </Pressable>
    </ScrollView>
  );
}
