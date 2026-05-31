import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import OaklandDusk from "@/constants/OaklandDusk";
import Type from "@/constants/typography";

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
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      {/* Type.display — page heading */}
      <Text style={[Type.display, { color: OaklandDusk.text.primary }]}>Share Recipe</Text>

      {/* Type.body — description */}
      <Text style={[Type.body, { color: OaklandDusk.text.secondary }]}>
        Ask your friend to scan this QR code. It will open the recipe link.
      </Text>

      <View style={{ padding: 12, borderWidth: 1, borderRadius: 12, gap: 10 }}>
        {/* Type.heading — card section title */}
        <Text style={[Type.heading, { color: OaklandDusk.text.primary }]}>QR Code</Text>

        {hasLink ? (
          <View style={{ alignItems: "center", paddingVertical: 10, gap: 10 }}>
            <QRCode value={shareUrl} size={220} />

            {/* Type.caption — "Share link:" label */}
            <Text style={[Type.caption, { color: OaklandDusk.text.tertiary }]}>Share link:</Text>
            {/* Type.caption — share URL (selectable) */}
            <Text selectable style={[Type.caption, { color: OaklandDusk.text.secondary }]}>
              {shareUrl}
            </Text>

            {/* Type.caption — share ID */}
            {shareId ? <Text style={[Type.caption, { color: OaklandDusk.text.tertiary }]}>ID: {shareId}</Text> : null}
          </View>
        ) : (
          // Type.body — no link fallback
          <Text style={[Type.body, { color: OaklandDusk.text.secondary }]}>
            No share link found. Please go back and tap Share again.
          </Text>
        )}
      </View>

      {/* ✅ [UPDATED] Back to the SAME Recipe (Tab 2) with params */}
      <Pressable
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace({ pathname: "/recipe", params: backParams });
          }
        }}
        style={{
          alignSelf: "flex-start",
          borderWidth: 1,
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        {/* Type.button — back CTA */}
        <Text style={[Type.button, { color: OaklandDusk.brand.gold }]}>Back to Recipe</Text>
      </Pressable>
    </ScrollView>
  );
}
