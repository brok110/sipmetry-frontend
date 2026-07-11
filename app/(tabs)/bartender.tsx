// app/(tabs)/bartender.tsx
// V2 Category Carousel homepage per sipmetry-v3-carousel.html:
// sticky search input → SPOTLIGHT row (existing hero pipeline) → up to 5
// looping rails driven by GET /browse-recipes through the pure row engine
// (lib/browse/rowEngine). Typing in the search bar swaps the body for an
// inline 2-col results grid (Mode B lite, q-only); clearing restores the
// carousel. Components stay dumb.

import { apiFetch } from "@/lib/api";
import { track as analytics } from "@/lib/analytics/analytics";
import { EVENTS } from "@/lib/analytics/events";
import Masthead from "@/components/Masthead";
import RailRow from "@/components/browse/RailRow";
import RecipeCard from "@/components/browse/RecipeCard";
import SpotlightCard from "@/components/browse/SpotlightCard";
import OaklandDusk from "@/constants/OaklandDusk";
import { V3 } from "@/constants/v3DesignTokens";
import { useAuth } from "@/context/auth";
import { useInventory } from "@/context/inventory";
import { usePreferences } from "@/context/preferences";
import { useBartenderRefresh } from "@/context/bartenderRefresh";
import { fetchBrowseRecipes } from "@/lib/browse/browseApi";
import { buildRails, type BrowseItem } from "@/lib/browse/rowEngine";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

const SCREEN_PAD = 26;
const GRID_GAP = 12;
const SEARCH_DEBOUNCE_MS = 300;

// Hero pipeline pick (/bartender-recommend). Kept because it carries the
// interaction/rerank/exclude logic the browse endpoint doesn't.
type Pick = {
  iba_code: string;
  name: string;
  iba_category: string | null;
  style: string | null;
  glass: string | null;
  instructions: string | null;
  ingredient_keys: string[];
  overlap_hits: string[];
  missing_items: string[];
  missing_count: number;
  recipe_vec: Record<string, number> | null;
  score: number;
  material_score: number;
  flavor_score: number;
  anchor_score: number;
  profile_score: number;
  preset_match: boolean;
  image_url?: string | null;
  explain?: string;
};

export default function BartenderScreen() {
  const { session } = useAuth();
  const { inventory, availableIngredientKeys, initialized: inventoryInitialized } = useInventory();
  const { preferences } = usePreferences();
  const { refreshNonce } = useBartenderRefresh();
  const { width: windowWidth } = useWindowDimensions();

  // ── Spotlight (hero pipeline) state ──
  const [heroPick, setHeroPick] = useState<Pick | null>(null);
  const [heroLoading, setHeroLoading] = useState(false);
  const [explorationMode, setExplorationMode] = useState(false);
  // Tracks last fetched signature to dedupe hero refetches (preferences
  // changes + the empty↔non-empty inventory transition trigger one fetch).
  const lastFetchSignatureRef = useRef<string | null>(null);

  // ── Browse (rails) state ──
  const [browseItems, setBrowseItems] = useState<BrowseItem[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const browseSeqRef = useRef(0);

  // ── Inline search (Mode B lite) state ──
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BrowseItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const searchSeqRef = useRef(0);

  const [isLogoRefreshing, setIsLogoRefreshing] = useState(false);

  const fetchHero = useCallback(async () => {
    setHeroLoading(true);
    try {
      const res = await apiFetch("/bartender-recommend", {
        session,
        method: "POST",
        body: {
          detected_ingredients: [...availableIngredientKeys],
          occasion: null,
          base_spirits: [],
          style_presets: [],
          excludes: [],
          profile_style_preset: preferences.stylePreset,
        },
      });
      analytics(EVENTS.RECOMMENDATION_GENERATED, { source: "bartender" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setExplorationMode(data?.meta?.exploration_mode === true);

      let recs: Pick[] = data.recommendations || [];
      if (preferences.safetyMode?.avoidHighProof) {
        // recipe_vec values are 0..3 scale; ≥2.5 = top sixth = "high proof".
        recs = recs.filter(
          (r) => Number(r.recipe_vec?.alcoholStrength ?? 0) < 2.5
        );
      }
      const top = recs[0] || null;
      setHeroPick(top);
      if (top) {
        analytics(EVENTS.RECOMMENDATION_VIEWED, { source: "bartender", count: 1 });
      }
    } catch {
      // Spotlight is best-effort: on failure the row simply hides and the
      // rails (independent fetch) carry the screen.
      setHeroPick(null);
    } finally {
      setHeroLoading(false);
    }
  }, [session, availableIngredientKeys, preferences]);

  const fetchBrowse = useCallback(async () => {
    const seq = ++browseSeqRef.current;
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      const data = await fetchBrowseRecipes(session, { limit: 100, sort: "score" });
      if (seq !== browseSeqRef.current) return;
      setBrowseItems(data.items);
    } catch (e: any) {
      if (seq !== browseSeqRef.current) return;
      setBrowseError(e?.message || "Something went wrong");
    } finally {
      if (seq === browseSeqRef.current) setBrowseLoading(false);
    }
  }, [session]);

  // Rails: one fetch on mount/focus (keeps previous data while refreshing).
  useFocusEffect(
    useCallback(() => {
      if (!inventoryInitialized) return;
      fetchBrowse();
    }, [inventoryInitialized, fetchBrowse])
  );

  // Spotlight: signature-deduped fetch. Refetches on preferences changes
  // and on the empty↔non-empty inventory transition (backend injects a
  // starter bar for empty inventory → exploration_mode drives the banner).
  useEffect(() => {
    if (!inventoryInitialized) return;
    const signature = JSON.stringify({
      stylePreset: preferences.stylePreset,
      dims: preferences.dims,
      safetyMode: preferences.safetyMode,
      inventoryEmpty: inventory.length === 0,
    });
    if (signature === lastFetchSignatureRef.current) return;
    const t = setTimeout(() => {
      lastFetchSignatureRef.current = signature;
      fetchHero();
    }, 300);
    return () => clearTimeout(t);
  }, [inventoryInitialized, inventory.length, preferences]); // eslint-disable-line react-hooks/exhaustive-deps

  // Masthead logo refresh: bypasses signature dedup, pulls both pipelines
  // fresh. Guard skips initial mount (nonce starts at 0).
  useEffect(() => {
    if (refreshNonce === 0) return;
    setIsLogoRefreshing(true);
    Promise.allSettled([fetchHero(), fetchBrowse()]).finally(() =>
      setIsLogoRefreshing(false)
    );
  }, [refreshNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inline search: debounced q-only fetch; sequence counter drops
  // out-of-order responses. Empty query resets to the carousel.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      searchSeqRef.current++; // invalidate any in-flight response
      setSearchResults([]);
      setSearchError(null);
      setSearched(false);
      setSearchLoading(false);
      return;
    }
    const seq = ++searchSeqRef.current;
    setSearchLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await fetchBrowseRecipes(session, { q, limit: 30 });
        if (seq !== searchSeqRef.current) return;
        setSearchResults(data.items);
        setSearchError(null);
        setSearched(true);
      } catch (e: any) {
        if (seq !== searchSeqRef.current) return;
        setSearchError(e?.message || "Something went wrong");
        setSearched(true);
      } finally {
        if (seq === searchSeqRef.current) setSearchLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, session]);

  // Spotlight joins the used-set so its recipe never repeats in a rail.
  const rails = useMemo(
    () => buildRails(browseItems, { excludeCodes: heroPick ? [heroPick.iba_code] : [] }),
    [browseItems, heroPick]
  );

  const openHeroRecipe = useCallback(() => {
    if (!heroPick) return;
    analytics(EVENTS.RECOMMENDATION_ENGAGED, { source: "bartender", recipe_key: heroPick.iba_code });
    router.push({
      pathname: "/recipe",
      params: {
        recipe_key: heroPick.iba_code,
        iba_code: heroPick.iba_code,
        source: "bartender",
        ingredients_json: encodeURIComponent(JSON.stringify(heroPick.ingredient_keys)),
        scan_items_json: encodeURIComponent(JSON.stringify(
          inventory.map(item => ({ canonical: item.ingredient_key, display: item.display_name }))
        )),
        missing_items_json: encodeURIComponent(JSON.stringify(heroPick.missing_items || [])),
        overlap_hits_json: encodeURIComponent(JSON.stringify(heroPick.overlap_hits || [])),
      },
    });
  }, [heroPick, inventory]);

  const openBrowseRecipe = useCallback((item: BrowseItem, source: "browse" | "search") => {
    analytics(EVENTS.RECOMMENDATION_ENGAGED, { source, recipe_key: item.iba_code });
    // Recipe screen self-fetches by iba_code; availability comes from the
    // server-side SSoT endpoint, so no ingredient params are needed here.
    router.push({
      pathname: "/recipe",
      params: {
        recipe_key: item.iba_code,
        iba_code: item.iba_code,
        source,
      },
    });
  }, []);

  // Branch 0: Inventory context not yet initialized — brief flicker on
  // app open; avoids firing the hero fetch with an empty key set.
  if (!inventoryInitialized) {
    return (
      <View style={styles.root}>
        <Masthead />
        <View style={styles.centerFill}>
          <ActivityIndicator color={OaklandDusk.brand.gold} size="small" />
        </View>
      </View>
    );
  }

  const searchActive = query.trim().length > 0;
  const initialBrowseLoad = browseLoading && browseItems.length === 0;
  const browseFailed = !!browseError && browseItems.length === 0 && !browseLoading;
  const gridCardWidth = (windowWidth - SCREEN_PAD * 2 - GRID_GAP) / 2;

  return (
    <View style={styles.root}>
      <Masthead />

      {/* Exploration-mode banner — backend used a starter bar (empty
          inventory). Tap routes to the scan flow. */}
      {explorationMode && (
        <Pressable
          style={styles.explorationBanner}
          onPress={() => router.push({ pathname: "/scan", params: { intent: "addToBar" } })}
        >
          <Text style={styles.explorationBannerText}>
            EXPLORING WITH A SAMPLE BAR  ·  TAP TO SCAN YOUR BOTTLES
          </Text>
        </Pressable>
      )}

      {/* Sticky Mode B entry: fixed above the scroll container so it never
          scrolls off, and stays reachable with the keyboard open. */}
      <View style={styles.searchBar}>
        <FontAwesome
          name="search"
          size={13}
          color={`${OaklandDusk.text.primary}80`}
        />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="search · name, spirit, style"
          placeholderTextColor={`${OaklandDusk.text.primary}52`}
          selectionColor={OaklandDusk.brand.gold}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search cocktails"
        />
        {searchActive && searchLoading && (
          <ActivityIndicator color={OaklandDusk.brand.gold} size="small" />
        )}
        {searchActive && !searchLoading && (
          <Pressable
            onPress={() => setQuery("")}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <FontAwesome
              name="times-circle"
              size={15}
              color={`${OaklandDusk.text.primary}52`}
            />
          </Pressable>
        )}
      </View>

      {searchActive ? (
        /* ── Inline search results (Mode B lite) ── */
        searchResults.length > 0 ? (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.iba_code}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.grid}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <RecipeCard
                item={item}
                width={gridCardWidth}
                onPress={() => openBrowseRecipe(item, "search")}
              />
            )}
          />
        ) : searchLoading || !searched ? (
          <View style={styles.centerFill}>
            <ActivityIndicator color={OaklandDusk.brand.gold} size="small" />
          </View>
        ) : searchError ? (
          <View style={styles.centerFill}>
            <Text style={styles.stateMsg}>something went wrong</Text>
            <Text style={styles.stateSubMsg}>{searchError}</Text>
          </View>
        ) : (
          <View style={styles.centerFill}>
            <FontAwesome name="glass" size={48} color={OaklandDusk.text.tertiary} />
            <Text style={[styles.stateMsg, { marginTop: 16 }]}>no cocktails found</Text>
            <Text style={styles.stateSubMsg}>TRY A DIFFERENT NAME OR SPIRIT</Text>
          </View>
        )
      ) : (
        /* ── Carousel homepage ── */
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Row 0: SPOTLIGHT — hero pipeline top result */}
          {heroPick && (
            <View style={styles.spotlightRow}>
              <View style={styles.rowHead}>
                <Text style={styles.rowTitle}>TONIGHT'S POUR</Text>
              </View>
              <View style={styles.spotlightBody}>
                <SpotlightCard
                  data={{
                    name: heroPick.name,
                    subline: heroPick.explain,
                    imageUrl: heroPick.image_url,
                    missingCount: heroPick.missing_count ?? 0,
                    firstMissing: heroPick.missing_items?.[0],
                  }}
                  onPress={openHeroRecipe}
                />
              </View>
            </View>
          )}

          {/* Rails */}
          {initialBrowseLoad ? (
            <View style={styles.railsPending}>
              <ActivityIndicator color={OaklandDusk.brand.gold} size="small" />
            </View>
          ) : browseFailed ? (
            <View style={styles.railsPending}>
              <Text style={styles.stateMsg}>couldn't load the menu</Text>
              <Text style={styles.stateSubMsg}>{browseError}</Text>
              <Pressable style={styles.retryBtn} onPress={fetchBrowse}>
                <Text style={styles.retryBtnText}>TRY AGAIN</Text>
              </Pressable>
            </View>
          ) : (
            rails.map((rail) => (
              <RailRow
                key={rail.key}
                rail={rail}
                onPressItem={(item) => openBrowseRecipe(item, "browse")}
              />
            ))
          )}

          {/* Spotlight slot spinner when hero is still warming up and rails
              already rendered (keeps layout calm — no full-screen takeover) */}
          {!heroPick && heroLoading && !initialBrowseLoad && (
            <View style={styles.railsPending}>
              <ActivityIndicator color={OaklandDusk.brand.gold} size="small" />
            </View>
          )}
        </ScrollView>
      )}

      {isLogoRefreshing && (
        <View style={styles.refreshOverlay} pointerEvents="none">
          <ActivityIndicator color={OaklandDusk.brand.gold} size="small" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: OaklandDusk.bg.void,
  },

  explorationBanner: {
    marginHorizontal: 26,
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: `${OaklandDusk.brand.gold}47`, // brand gold @28%
    backgroundColor: `${OaklandDusk.brand.gold}1F`, // brand gold @12%
    alignItems: "center",
    justifyContent: "center",
  },
  explorationBannerText: {
    fontFamily: V3.fonts.mono,
    fontSize: 10,
    letterSpacing: 1.8,
    color: OaklandDusk.brand.gold,
    textTransform: "uppercase",
    textAlign: "center",
  },

  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
    paddingBottom: 80, // optical center above the keyboard
  },

  // Sticky Mode B search bar
  searchBar: {
    marginHorizontal: SCREEN_PAD,
    marginTop: 16,
    marginBottom: 6,
    paddingVertical: 4,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: `${OaklandDusk.text.primary}12`, // ~7% ivory hairline
    borderRadius: 22,
    backgroundColor: OaklandDusk.bg.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    fontFamily: V3.fonts.mono,
    fontSize: 12,
    letterSpacing: 1.2,
    color: OaklandDusk.text.primary,
  },

  // Search results grid
  grid: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 16,
    paddingBottom: 40,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: 20,
  },

  // Spotlight row
  spotlightRow: {
    marginTop: 12,
  },
  spotlightBody: {
    paddingHorizontal: 26,
  },
  rowHead: {
    paddingHorizontal: 26,
    paddingBottom: 10,
  },
  rowTitle: {
    fontFamily: V3.fonts.bebas,
    fontSize: 20,
    letterSpacing: 1.6,
    color: OaklandDusk.text.primary,
  },

  // Rails pending / error block
  railsPending: {
    paddingVertical: 48,
    paddingHorizontal: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  stateMsg: {
    fontFamily: V3.fonts.cormorant,
    fontStyle: "italic",
    fontSize: 18,
    color: `${OaklandDusk.text.primary}94`,
    textAlign: "center",
    marginBottom: 8,
  },
  stateSubMsg: {
    fontFamily: V3.fonts.mono,
    fontSize: 11,
    letterSpacing: 1,
    color: `${OaklandDusk.text.primary}52`,
    textAlign: "center",
    textTransform: "uppercase",
    marginBottom: 24,
  },
  retryBtn: {
    borderWidth: 1,
    borderColor: OaklandDusk.brand.gold,
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  retryBtnText: {
    fontFamily: V3.fonts.mono,
    fontSize: 11,
    letterSpacing: 3.3,
    color: OaklandDusk.brand.gold,
    textTransform: "uppercase",
  },

  refreshOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${OaklandDusk.bg.void}B3`, // ~70% void scrim
    zIndex: 10,
  },
});
