// app/search.tsx
// Search Mode B lite (q-only): debounced text input → GET
// /browse-recipes?q=...&limit=30, results as a 2-col grid of the shared
// RecipeCard. Spirit/style/exclude filter UI is out of scope (next task);
// extending is additive — add fields to BrowseQueryParams and pass them
// in the fetch below, the query-string builder handles the rest.

import RecipeCard from "@/components/browse/RecipeCard";
import OaklandDusk from "@/constants/OaklandDusk";
import { V3 } from "@/constants/v3DesignTokens";
import { useAuth } from "@/context/auth";
import { track as analytics } from "@/lib/analytics/analytics";
import { EVENTS } from "@/lib/analytics/events";
import { fetchBrowseRecipes } from "@/lib/browse/browseApi";
import type { BrowseItem } from "@/lib/browse/rowEngine";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

const SCREEN_PAD = 26;
const GRID_GAP = 12;
const SEARCH_DEBOUNCE_MS = 300;

export default function SearchScreen() {
  const { session } = useAuth();
  const { width: windowWidth } = useWindowDimensions();

  const [query, setQuery] = useState("");
  const [items, setItems] = useState<BrowseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const seqRef = useRef(0);

  const cardWidth = (windowWidth - SCREEN_PAD * 2 - GRID_GAP) / 2;

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      seqRef.current++; // invalidate any in-flight response
      setItems([]);
      setError(null);
      setSearched(false);
      setLoading(false);
      return;
    }
    const seq = ++seqRef.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await fetchBrowseRecipes(session, { q, limit: 30 });
        if (seq !== seqRef.current) return;
        setItems(data.items);
        setError(null);
        setSearched(true);
      } catch (e: any) {
        if (seq !== seqRef.current) return;
        setError(e?.message || "Something went wrong");
        setSearched(true);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, session]);

  const openRecipe = (item: BrowseItem) => {
    analytics(EVENTS.RECOMMENDATION_ENGAGED, { source: "search", recipe_key: item.iba_code });
    router.push({
      pathname: "/recipe",
      params: {
        recipe_key: item.iba_code,
        iba_code: item.iba_code,
        source: "search",
      },
    });
  };

  return (
    <View style={styles.root}>
      <View style={styles.searchBar}>
        <FontAwesome name="search" size={13} color={`${OaklandDusk.text.primary}80`} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="name, spirit, style"
          placeholderTextColor={`${OaklandDusk.text.primary}52`}
          selectionColor={OaklandDusk.brand.gold}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search cocktails"
        />
        {loading && <ActivityIndicator color={OaklandDusk.brand.gold} size="small" />}
      </View>

      {!query.trim() ? (
        <View style={styles.centerFill}>
          <FontAwesome name="search" size={48} color={OaklandDusk.text.tertiary} />
          <Text style={styles.emptyTitle}>find your next pour</Text>
          <Text style={styles.emptySub}>SEARCH BY NAME, SPIRIT, OR STYLE</Text>
        </View>
      ) : searched && !loading && error ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyTitle}>something went wrong</Text>
          <Text style={styles.emptySub}>{error}</Text>
        </View>
      ) : searched && !loading && items.length === 0 ? (
        <View style={styles.centerFill}>
          <FontAwesome name="glass" size={48} color={OaklandDusk.text.tertiary} />
          <Text style={styles.emptyTitle}>no cocktails found</Text>
          <Text style={styles.emptySub}>TRY A DIFFERENT NAME OR SPIRIT</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.iba_code}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.grid}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <RecipeCard item={item} width={cardWidth} onPress={() => openRecipe(item)} />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: OaklandDusk.bg.void,
  },
  searchBar: {
    marginHorizontal: SCREEN_PAD,
    marginTop: 16,
    marginBottom: 6,
    paddingVertical: 4,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: `${OaklandDusk.text.primary}12`,
    borderRadius: 22,
    backgroundColor: OaklandDusk.bg.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 8,
    fontFamily: V3.fonts.mono,
    fontSize: 13,
    letterSpacing: 1.2,
    color: OaklandDusk.text.primary,
  },
  grid: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 16,
    paddingBottom: 40,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: 20,
  },
  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
    paddingBottom: 80, // optical center above the keyboard
  },
  emptyTitle: {
    fontFamily: V3.fonts.cormorant,
    fontStyle: "italic",
    fontSize: 18,
    color: `${OaklandDusk.text.primary}94`,
    textAlign: "center",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySub: {
    fontFamily: V3.fonts.mono,
    fontSize: 11,
    letterSpacing: 1,
    color: `${OaklandDusk.text.primary}52`,
    textAlign: "center",
    textTransform: "uppercase",
  },
});
