import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import StaplesModal, { STAPLES_STORAGE_KEY } from "@/components/StaplesModal";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import SwipeRow from "@/components/ui/SwipeRow";
import OaklandDusk from "@/constants/OaklandDusk";
import { useFeedback } from "@/context/feedback";
import { aggregateIngredientVectors, buildFourWordDescriptor } from "@/context/ontology";
import { useFavorites } from "@/context/favorites";
import { useInventory } from "@/context/inventory";

function getTasteTags(vec: Record<string, any> | null | undefined, max = 4): string[] {
  if (!vec) return [];
  const tags: string[] = [];
  const v = (k: string) => Number(vec[k] ?? 0);
  if (v("alcoholStrength") >= 2.0) tags.push("Strong");
  else if (v("alcoholStrength") >= 1.0) tags.push("Medium");
  else if (v("alcoholStrength") > 0) tags.push("Light");
  if (v("sweetness") >= 0.5) tags.push("Sweet");
  if (v("sourness") >= 0.5) tags.push("Sour");
  if (v("bitterness") >= 0.5) tags.push("Bitter");
  if (v("fruity") >= 0.5) tags.push("Fruity");
  if (v("herbal") >= 0.3) tags.push("Herbal");
  if (v("smoky") >= 0.5) tags.push("Smoky");
  if (v("fizz") >= 0.5) tags.push("Fizzy");
  if (v("body") >= 1.0) tags.push("Full-bodied");
  return tags.slice(0, max);
}

function asStringList(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function extractIngredientsFromAnyRecipe(recipe: any): string[] {
  if (!recipe || typeof recipe !== "object") return [];

  if (Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0) {
    const fromDb = recipe.ingredients
      .map((x: any) => String(x?.item ?? x?.name ?? "").trim())
      .filter(Boolean);
    if (fromDb.length > 0) return fromDb;
  }

  if (Array.isArray(recipe.ingredients_ml) && recipe.ingredients_ml.length > 0) {
    const fromLegacyMl = recipe.ingredients_ml
      .map((x: any) => {
        if (typeof x === "string") return x.trim();
        if (x && typeof x === "object") return String(x.item ?? x.name ?? "").trim();
        return "";
      })
      .filter(Boolean);
    if (fromLegacyMl.length > 0) return fromLegacyMl;
  }

  if (Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0) {
    const fromLegacy = recipe.ingredients
      .map((x: any) => {
        if (typeof x === "string") return x.trim();
        if (x && typeof x === "object") return String(x.item ?? x.name ?? "").trim();
        return "";
      })
      .filter(Boolean);
    if (fromLegacy.length > 0) return fromLegacy;
  }

  return [];
}

function extractStyleFromRecipe(recipe: any): string {
  if (!recipe || typeof recipe !== "object") return "";
  return String((recipe as any)?.iba_category ?? "").trim();
}

function isSubtitleTokens(tags: string[]): boolean {
  return tags.length === 4 || tags.length === 3;
}

function buildSubtitleFromStyleAndDescriptor(style: string, descriptor: any): string {
  const words = Array.isArray(descriptor?.words) ? descriptor.words : [];
  const taste = words.length ? words.slice(0, 3).join(" • ") : "";
  const line = [style, taste].filter(Boolean).join(" • ");
  return line.trim();
}

export default function TabThreeScreen() {
  const router = useRouter();
  const { favoritesByKey, removeFavorite } = useFavorites();
  const { inventory, initialized: inventoryInitialized } = useInventory();

  const feedback = useFeedback() as any;
  const ratingsByKey: Record<string, "like" | "dislike"> =
    feedback?.ratingsByKey ?? feedback?.ratings ?? {};
  const clearRating: ((recipeKey: string) => void) | undefined = feedback?.clearRating;

  const favoritesList = useMemo(() => {
    const arr = Object.values(favoritesByKey ?? {});
    return arr.sort((a: any, b: any) => (b.saved_at ?? 0) - (a.saved_at ?? 0));
  }, [favoritesByKey]);

  const invKeySet = useMemo(() => {
    if (!inventoryInitialized) return null;
    const s = new Set<string>();
    for (const it of inventory) {
      const k = String(it.ingredient_key ?? "").trim();
      if (k) s.add(k);
    }
    return s;
  }, [inventory, inventoryInitialized]);

  // ── Staples awareness ──────────────────────────────────────────
  const [staplesKeys, setStaplesKeys] = useState<Set<string>>(new Set());
  const [staplesLoaded, setStaplesLoaded] = useState(false);
  const [showStaplesModal, setShowStaplesModal] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STAPLES_STORAGE_KEY)
      .then((val) => {
        if (val) {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
              setStaplesKeys(new Set(parsed));
            }
          } catch {}
        } else if (favoritesList.length > 0) {
          // 用戶從未設定過 staples，且有 favorites — 彈 modal
          setShowStaplesModal(true);
        }
        setStaplesLoaded(true);
      })
      .catch(() => setStaplesLoaded(true));
  }, [favoritesList.length]);

  const handleStaplesConfirm = (selectedKeys: string[]) => {
    setStaplesKeys(new Set(selectedKeys));
    setShowStaplesModal(false);
  };

  const handleStaplesCancel = () => {
    setShowStaplesModal(false);
  };

  const getAvailability = (fav: any): { ready: boolean; missingCount: number } | null => {
    if (!invKeySet) return null;
    const keys = extractIngredientsFromAnyRecipe(fav?.recipe);
    if (keys.length === 0) return null;
    const missing = keys.filter((k) => !invKeySet.has(k) && !staplesKeys.has(k));
    return { ready: missing.length === 0, missingCount: missing.length };
  };

  const openFavorite = (favKey: string) => {
    const fav: any = favoritesByKey?.[favKey];
    if (!fav) return;

    const ibaCode = String(fav.iba_code ?? fav.recipe?.iba_code ?? "").trim();

    router.push({
      pathname: "/recipe",
      params: {
        idx: "0",
        source: "favorites",
        recipe_key: fav.recipe_key,
        iba_code: ibaCode || undefined,
        recipe_json: encodeURIComponent(JSON.stringify(fav.recipe)),
        ingredients_json: encodeURIComponent(JSON.stringify(fav.ingredients)),
      },
    });
  };

  const getSubtitleForFavorite = (fav: any) => {
    const tags = asStringList(fav?.tags);
    if (isSubtitleTokens(tags)) {
      return tags.join(" • ");
    }

    const recipe = fav?.recipe;
    const style = extractStyleFromRecipe(recipe);

    const ing = extractIngredientsFromAnyRecipe(recipe);
    if (!ing.length) {
      return style ? style : "";
    }

    const vec = aggregateIngredientVectors(ing);
    const desc = buildFourWordDescriptor(vec);

    return buildSubtitleFromStyleAndDescriptor(style, desc);
  };

  const onRemoveWithConfirm = (favKey: string) => {
    const fav: any = favoritesByKey?.[favKey];
    const title = String(fav?.title ?? "Recipe").trim() || "Recipe";
    const hasRating = Boolean(ratingsByKey?.[favKey]);

    if (!hasRating || typeof clearRating !== "function") {
      Alert.alert("Remove from Favorites", `Remove "${title}"?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => removeFavorite(favKey) },
      ]);
      return;
    }

    Alert.alert(
      "Remove favorite",
      `Remove "${title}" from Favorites?\n\nYou also have a Like/Dislike on this recipe.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove only",
          style: "destructive",
          onPress: () => removeFavorite(favKey),
        },
        {
          text: "Remove + clear rating",
          style: "destructive",
          onPress: () => {
            removeFavorite(favKey);
            clearRating(favKey);
          },
        },
      ]
    );
  };

  return (
    <>
      <ScrollView
        style={{ backgroundColor: OaklandDusk.bg.void }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
      <Text style={{ fontSize: 28, fontWeight: "600", color: OaklandDusk.text.primary, marginBottom: 16 }}>
        Favorites
      </Text>

      {favoritesList.length === 0 ? (
        <Text style={{ color: OaklandDusk.text.tertiary }}>(No favorites yet)</Text>
      ) : (
        <View>
          {favoritesList.map((fav: any) => {
            const key = String(fav.recipe_key || "");
            const title = String(fav.title ?? "Recipe").trim() || "Recipe";
            const subtitle = getSubtitleForFavorite(fav);
            const avail = getAvailability(fav);
            const tags = asStringList(fav?.tags);

            return (
              <SwipeRow
                key={key}
                deleteLabel="Unfavorite"
                onDelete={() => onRemoveWithConfirm(key)}
              >
                <Card>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    {/* Thumbnail */}
                    {fav.image_url ? (
                      <Image
                        source={{ uri: fav.image_url }}
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 10,
                          backgroundColor: "#1A1428",
                        }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 10,
                          backgroundColor: "#1A1428",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ fontSize: 22, color: "#3A3040" }}>🍸</Text>
                      </View>
                    )}
                    <Pressable style={{ flex: 1, marginLeft: 12 }} onPress={() => openFavorite(key)}>
                      <Text style={{ fontSize: 15, fontWeight: "600", color: OaklandDusk.text.primary }}>
                        {title}
                      </Text>
                      {(() => {
                        const recipeTasteTags = getTasteTags((fav as any)?.recipe?.recipe_vec);
                        if (recipeTasteTags.length > 0) {
                          return (
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                              {recipeTasteTags.map((tag) => (
                                <View
                                  key={tag}
                                  style={{
                                    backgroundColor: OaklandDusk.brand.tagBg,
                                    paddingHorizontal: 8,
                                    paddingVertical: 3,
                                    borderRadius: 6,
                                  }}
                                >
                                  <Text style={{ fontSize: 11, fontWeight: "700", color: OaklandDusk.brand.gold }}>{tag}</Text>
                                </View>
                              ))}
                            </View>
                          );
                        }
                        return null;
                      })()}
                      <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                        {tags.slice(0, 3).map((t) => (
                          <Pill key={t} label={t} />
                        ))}
                        {avail && avail.missingCount > 0 && (
                          <Pill label={`Missing ${avail.missingCount}`} variant="missing" />
                        )}
                        {avail?.ready && (
                          <Pill label="Ready" variant="ready" />
                        )}
                      </View>
                    </Pressable>

                  </View>
                </Card>
              </SwipeRow>
            );
          })}
        </View>
      )}

      {favoritesList.length > 0 && (
        <Text style={{ fontSize: 11, color: OaklandDusk.text.disabled, textAlign: "center", marginTop: 16 }}>
          Swipe left to unfavorite
        </Text>
      )}
    </ScrollView>

      <StaplesModal
        visible={showStaplesModal}
        loading={false}
        onConfirm={handleStaplesConfirm}
        onCancel={handleStaplesCancel}
      />
    </>
  );
}
