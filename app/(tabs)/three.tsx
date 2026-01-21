import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useFavorites } from "../../context/favorites"; // ✅ [UPDATED]

export default function TabThreeScreen() {
  const router = useRouter();

  // ✅ [UPDATED] Favorites store (NOT feedback)
  const { favoritesByKey, removeFavorite } = useFavorites();

  const favoritesList = useMemo(() => {
    const arr = Object.values(favoritesByKey ?? {});
    // ✅ [UPDATED] sort by saved_at (newest first)
    return arr.sort((a: any, b: any) => (b.saved_at ?? 0) - (a.saved_at ?? 0));
  }, [favoritesByKey]);

  const openFavorite = (favKey: string) => {
    const fav: any = favoritesByKey?.[favKey];
    if (!fav) return;

    router.push({
      pathname: "/(tabs)/two",
      params: {
        idx: "0",
        // ✅ [UPDATED] stable key for Tab 2
        recipe_key: fav.recipe_key,
        recipe_json: encodeURIComponent(JSON.stringify(fav.recipe)),
        ingredients_json: encodeURIComponent(JSON.stringify(fav.ingredients)),
      },
    });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <FontAwesome name="heart" size={20} color="#E11D48" />
        <Text style={{ fontSize: 20, fontWeight: "900" }}>My Favorites</Text>
      </View>

      {favoritesList.length === 0 ? (
        <Text style={{ color: "#666" }}>(No favorites yet)</Text>
      ) : (
        <View style={{ gap: 10 }}>
          {favoritesList.map((fav: any) => {
            const favTags = Array.isArray(fav.tags) ? fav.tags : [];
            const key = String(fav.recipe_key || "");

            return (
              <View
                key={key}
                style={{
                  borderWidth: 1,
                  borderRadius: 12,
                  padding: 12,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text style={{ fontWeight: "800", flex: 1 }} numberOfLines={1}>
                    {String(fav.title ?? "Recipe")}
                  </Text>

                  <Pressable
                    onPress={() => openFavorite(key)}
                    style={{
                      borderWidth: 1,
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ fontWeight: "800" }}>Open</Text>
                  </Pressable>
                </View>

                {favTags.length === 4 ? (
                  <Text style={{ color: "#555" }}>{favTags.join(" • ")}</Text>
                ) : (
                  <Text style={{ color: "#666" }}>(No flavor tags)</Text>
                )}

                <Pressable
                  onPress={() => removeFavorite(key)}
                  style={{
                    alignSelf: "flex-start",
                    borderWidth: 1,
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ fontWeight: "800" }}>Remove</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}