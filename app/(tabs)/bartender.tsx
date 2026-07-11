// app/(tabs)/bartender.tsx
// V2 Category Carousel homepage per sipmetry-v3-carousel.html:
// search pill → SPOTLIGHT row (existing hero pipeline) → up to 5 looping
// rails driven by GET /browse-recipes through the pure row engine
// (lib/browse/rowEngine). Components stay dumb.

import { apiFetch } from "@/lib/api";
import { track as analytics } from "@/lib/analytics/analytics";
import { EVENTS } from "@/lib/analytics/events";
import Masthead from "@/components/Masthead";
import RailRow from "@/components/browse/RailRow";
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
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

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

  // ── Spotlight (hero pipeline) state ──
  const [heroPick, setHeroPick] = useState<Pick | null>(null);
  const [heroLoading, setHeroLoading] = useState(false);
  const [explorationMode, setExplorationMode] = useState(false);
  // Tracks last fetched signature to dedupe hero refetches (preferences
  // changes + the empty↔non-empty inventory transition trigger one fetch).
  const lastFetchSignatureRef = useRef<string | null>(null);

  // ── Browse (rails) state ──
  const [browseItems, setBrowseItems] = useState<BrowseItem[]>([]);
  const [browseTotal, setBrowseTotal] = useState<number | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const browseSeqRef = useRef(0);

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
      setBrowseTotal(data.total);
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

  const rails = useMemo(() => buildRails(browseItems), [browseItems]);

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

  const openBrowseRecipe = useCallback((item: BrowseItem) => {
    analytics(EVENTS.RECOMMENDATION_ENGAGED, { source: "browse", recipe_key: item.iba_code });
    // Recipe screen self-fetches by iba_code; availability comes from the
    // server-side SSoT endpoint, so no ingredient params are needed here.
    router.push({
      pathname: "/recipe",
      params: {
        recipe_key: item.iba_code,
        iba_code: item.iba_code,
        source: "browse",
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

  const initialBrowseLoad = browseLoading && browseItems.length === 0;
  const browseFailed = !!browseError && browseItems.length === 0 && !browseLoading;
  const searchLabel =
    browseTotal && browseTotal > 0
      ? `search ${browseTotal} cocktails · name, spirit, style`
      : "search cocktails · name, spirit, style";

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

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Mode B entry */}
        <Pressable
          style={styles.searchPill}
          onPress={() => router.push("/search")}
          accessibilityRole="button"
          accessibilityLabel="Search cocktails"
        >
          <FontAwesome
            name="search"
            size={13}
            color={`${OaklandDusk.text.primary}80`}
          />
          <Text style={styles.searchPillText} numberOfLines={1}>
            {searchLabel}
          </Text>
        </Pressable>

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
            <RailRow key={rail.key} rail={rail} onPressItem={openBrowseRecipe} />
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
  },

  // Mode B entry pill
  searchPill: {
    marginHorizontal: 26,
    marginTop: 16,
    marginBottom: 6,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: `${OaklandDusk.text.primary}12`, // ~7% ivory hairline
    borderRadius: 22,
    backgroundColor: OaklandDusk.bg.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchPillText: {
    flex: 1,
    fontFamily: V3.fonts.mono,
    fontSize: 11,
    letterSpacing: 1.54,
    color: `${OaklandDusk.text.primary}52`, // textFaint
  },

  // Spotlight row
  spotlightRow: {
    marginTop: 18,
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
