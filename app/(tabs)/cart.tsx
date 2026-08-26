import FontAwesome from "@expo/vector-icons/FontAwesome";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useInventory } from "@/context/inventory";

import * as Sentry from "@sentry/react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/context/auth";
import Masthead from "@/components/Masthead";
import { useFavorites } from "@/context/favorites";
import { useFeedback } from "@/context/feedback";
import { apiFetch } from "@/lib/api";
import { track as analytics } from "@/lib/analytics/analytics";
import { EVENTS } from "@/lib/analytics/events";
import OaklandDusk from "@/constants/OaklandDusk";
import Type from "@/constants/typography";
import { R } from "@/constants/radius";
import { STAPLES_STORAGE_KEY } from "@/components/StaplesModal";
import { Monogram, RailCard } from "@/components/restock/RailCard";
import { RestockDetailSheet, type SheetData } from "@/components/restock/RestockDetailSheet";

// Stage 0: Business Validation — Smart Restock with Buy CTA
// Shows bottle recommendations based on user inventory + preferences.
// Tracks "Buy" clicks via POST /affiliate/click for conversion analysis.

type ScoreBreakdown = {
  unlock: number;
  versatility: number;
  preference: number;
  interaction: number;
  similar_penalty: number;
};

// RESTOCK-REDESIGN S4:WHATIF 搜尋的單一結果(後端 target 欄)
type TargetResult = {
  ingredient_key: string;
  display_name: string;
  owned: boolean;
  remaining_pct: number | null;
  unlocks_count: number;
  recipes: { iba_code: string; name: string; iba_category: string; image_url?: string | null; badges?: string[] }[];
  category_key?: string | null;
  family_key?: string | null;
  // B-3:owned === false 時後端附(A-1 接線裁決②)
  next_step?: RailNextStep[];
  next_step_count?: number;
};

type Suggestion = {
  ingredient_key: string;
  display_name: string;
  unlocks_count: number;
  avg_pref_match: number;
  score: number;
  score_breakdown?: ScoreBreakdown;
  category_key?: string | null;
  family_key?: string | null;
  versatility_categories?: string[];
  reason: string;
  buy_url: string;
  recipes: { iba_code: string; name: string; iba_category: string; image_url?: string | null; badges?: string[] }[];
  is_alternative_upgrade?: boolean;
  covering_alternative?: { user_has: string; user_has_display: string } | null;
  alt_description?: string | null;
};

// RESTOCK-EXPLORE B-1:後端 rails(include_rails: true 時回;A-2 Group 25 已鎖形狀)
type RailNextStep = {
  iba_code: string;
  name: string;
  image_url?: string | null;
  missing_key: string;
  missing_display: string;
};

type RailItem = {
  ingredient_key: string;
  display_name: string;
  unlocks_count: number;
  avg_pref_match: number;
  score: number;
  category_key?: string | null;
  family_key?: string | null;
  versatility_categories?: string[];
  recipes: Suggestion["recipes"];
  is_alternative_upgrade: boolean;
  covering_alternative?: { user_has: string; user_has_display: string } | null;
  alt_description?: string | null;
  on_list: boolean;
  next_step_count: number;
  next_step: RailNextStep[];
};

type Rail = {
  key: string;
  title: string;
  subtitle: string;
  items: RailItem[];
};

type RailsMeta = {
  tier: "free" | "plus";
  rotation_seed: string;
  pool_size: number;
  returned: number;
};

// S2:+N / hero → 明細頁(呼叫端已有 recipes,免二次請求)
function openUnlocks(title: string, recipes: Suggestion["recipes"]) {
  router.push({
    pathname: "/restock-unlocks",
    params: {
      title,
      recipes_json: encodeURIComponent(JSON.stringify(
        (recipes ?? []).map((r) => ({ iba_code: r.iba_code, name: r.name, image_url: r.image_url ?? null, badges: Array.isArray(r.badges) ? r.badges : [] }))
      )),
    },
  });
}

// RESTOCK-REDESIGN S4-FE-a:卡片抽成元件(純重構,零行為改變)。
// S4-FE-b 的 WHATIF 搜尋結果卡會複用同一顆,避免兩處維護。
// B-2:補 React.memo(RESTOCK-REDESIGN 衍生待議第 7 項併入)。
const SuggestionCard = React.memo(function SuggestionCard({
  s,
  isTop,
  listed,
  onAdd,
  onOpenUnlocks,
}: {
  // 收窄:卡片實際只讀這三個欄位,WHATIF target 骨架即可複用
  s: Pick<Suggestion, "ingredient_key" | "display_name" | "unlocks_count">;
  isTop: boolean;
  listed: boolean;
  onAdd: () => void;
  onOpenUnlocks: () => void;
}) {
  return (
        <View
          key={s.ingredient_key}
          style={{
            borderRadius: 14,
            borderWidth: 0.5,
            borderLeftWidth: isTop ? 3 : 0.5,
            borderColor: OaklandDusk.bg.border,
            borderLeftColor: isTop ? OaklandDusk.brand.gold : OaklandDusk.bg.border,
            backgroundColor: OaklandDusk.bg.card,
            overflow: "visible",
            position: "relative",
          }}
        >
          {/* #1 pick badge */}
          {isTop && (
            <View style={{
              position: "absolute",
              top: -9,
              left: 14,
              backgroundColor: OaklandDusk.brand.gold,
              paddingHorizontal: 9,
              paddingVertical: 3,
              borderRadius: R.control,
              zIndex: 1,
            }}>
              {/* Type.label — badge kicker */}
              <Text style={[Type.label, { color: OaklandDusk.bg.void }]}>#1 pick</Text>
            </View>
          )}

          <View style={{ padding: 16, gap: 10 }}>
            {/* Row 1(Z 案):左 = 名字 + Add 膠囊直排;右 = +N 獨佔 */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1, paddingRight: 12, gap: 12, alignItems: "flex-start" }}>
                {/* Type.heading — ingredient name;tap → 說明頁(S3) */}
                <Pressable
                  onPress={() => router.push({
                    pathname: "/ingredient-info",
                    params: {
                      key: s.ingredient_key,
                      name: s.display_name,
                      listed: listed ? "1" : "0",
                    },
                  })}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`About ${s.display_name}`}
                >
                  <Text style={[Type.heading, { color: OaklandDusk.text.primary }]}>
                    {s.display_name}
                  </Text>
                </Pressable>
                {/* SHOP-LIST 3b-fix: single primary CTA — add to shopping
                    list. I Want This / notify / browser jump removed by
                    ruling 2026-07-28; the intent stream is now the
                    shopping_list table + check-off. */}
                {/* B v4 + Z 案:Add 膠囊移入名字下方(卡高收斂);已加 = 綠描邊 */}
                <Pressable
                  onPress={onAdd}
                  disabled={listed}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${s.display_name} to shopping list`}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 7,
                    backgroundColor: "transparent",
                    borderWidth: 1,
                    borderColor: listed
                      ? "rgba(74,222,128,0.4)"
                      : "rgba(200,120,40,0.45)",
                    borderRadius: R.pill, paddingVertical: 8, paddingHorizontal: 15,
                  }}
                >
                  <FontAwesome
                    name={listed ? "check" : "shopping-bag"}
                    size={12}
                    color={listed ? "#4ade80" : OaklandDusk.brand.gold}
                  />
                  {/* Type.caption — 小膠囊標籤 */}
                  <Text style={[Type.caption, {
                    fontWeight: "700",
                    color: listed ? "#4ade80" : OaklandDusk.brand.gold,
                  }]}>
                    {listed ? "On list" : "Add"}
                  </Text>
                </Pressable>
              </View>
              <Pressable
                onPress={onOpenUnlocks}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`See the ${s.unlocks_count} cocktails ${s.display_name} unlocks`}
                style={{ alignItems: "flex-end" }}
              >
                {/* +N 裸字(mockup v6 拍板):Bebas 金,無框無副標;tap → 明細頁 */}
                <Text style={[Type.title, { fontSize: 32, lineHeight: 34, color: OaklandDusk.brand.gold }]}>
                  +{s.unlocks_count}
                </Text>
              </Pressable>
            </View>

          </View>
        </View>
  );
});

export default function CartScreen() {
  const { session } = useAuth();
  const { favoritesByKey } = useFavorites();
  const feedback = useFeedback() as any;
  const params = useLocalSearchParams<{ autoFetch?: string }>();

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [meta, setMeta] = useState<{ reason?: string; message?: string } | null>(null);

  // SHOP-LIST 3b: open-list badge count + per-key "already listed" feedback
  const [listCount, setListCount] = useState(0);
  const [listedKeys, setListedKeys] = useState<Set<string>>(new Set());

  // Staples — keys the user confirmed they already have; excluded from suggestions
  const [staplesKeys, setStaplesKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(STAPLES_STORAGE_KEY)
      .then((val) => {
        if (val) {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) setStaplesKeys(new Set(parsed));
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const { inventory } = useInventory();

  // ── WHATIF 搜尋(S4)──────────────────────────────────────────────
  const [searchText, setSearchText] = useState("");
  const [typeahead, setTypeahead] = useState<string[]>([]);
  const [target, setTarget] = useState<TargetResult | null>(null);
  const [targetLoading, setTargetLoading] = useState(false);

  // RESTOCK-EXPLORE B-1:rails 資料層。null = 後端未回(舊版/錯誤)→ fail-soft
  // 走現行版面;locked_rails 依 2026-08-25 裁 B 不渲染、不入 state。
  const [rails, setRails] = useState<Rail[] | null>(null);
  const [railsMeta, setRailsMeta] = useState<RailsMeta | null>(null);

  // B-3:detail sheet(rail 卡 / hero / WHATIF target 共用)
  const [sheetItem, setSheetItem] = useState<SheetData | null>(null);

  // WHATIF typeahead 的「IN MY BAR」判定來源(S1 曾移除 useInventory,S4 重新需要)
  const ownedKeys = useMemo(
    () => new Set((inventory ?? []).map((it) => String(it.ingredient_key || "").trim()).filter(Boolean)),
    [inventory]
  );

  // S1 直入:tab 進頁即載入(入口鈕頁移除;RESTOCK-REDESIGN 拍板)
  useEffect(() => {
    if (!hasFetched && !loading) fetchSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-fetch when navigated from Recommendations with autoFetch=true
  useEffect(() => {
    if (params.autoFetch === "true") {
      fetchSuggestions();
      router.setParams({ autoFetch: undefined });
    }
  }, [params.autoFetch]);

  // Build user interactions payload for preference-aware scoring
  const userInteractions = useMemo(() => {
    const ratingsByKey = feedback?.ratingsByKey ?? feedback?.ratings ?? {};
    return {
      favorite_codes: Object.keys(favoritesByKey ?? {}),
      liked_codes: Object.entries(ratingsByKey)
        .filter(([, v]) => v === "like")
        .map(([k]) => k),
      disliked_codes: Object.entries(ratingsByKey)
        .filter(([, v]) => v === "dislike")
        .map(([k]) => k),
    };
  }, [favoritesByKey, feedback?.ratingsByKey, feedback?.ratings]);

  // Filter out staples the user already confirmed having
  const filteredSuggestions = useMemo(
    () => suggestions.filter((s) => !staplesKeys.has(s.ingredient_key)),
    [suggestions, staplesKeys]
  );

  // Split into primary (true must-buys) vs explore (user already has a substitute)
  const primarySuggestions = useMemo(
    () => filteredSuggestions.filter((s) => !s.is_alternative_upgrade),
    [filteredSuggestions]
  );

  // ── RESTOCK-EXPLORE B-2:rails 呈現層 ─────────────────────────────
  // hero = make_tonight 首卡(v5 拍板:monogram hero 卡取代 48px 數字,
  // 2026-08-26 Brok 裁;聚合「全解鎖」入口隨舊 hero 退場,已知取捨)。
  // rails 缺席(fail-soft)→ 下方全部條件回落現行版面。
  const railsActive = !!rails && rails.length > 0;
  const heroItem = useMemo(() => {
    if (!rails || rails.length === 0) return null;
    const mt = rails.find((r) => r.key === "make_tonight");
    return mt?.items?.[0] ?? null;
  }, [rails]);
  const railsForRender = useMemo(() => {
    if (!rails) return [];
    if (!heroItem) return rails;
    return rails
      .map((r) => (r.key === "make_tonight" ? { ...r, items: r.items.slice(1) } : r))
      .filter((r) => r.items.length > 0);
  }, [rails, heroItem]);
  // B-3:rail 卡 / hero 點擊 → detail sheet(取代 B-2 過渡的 openUnlocks 直開)
  const handleOpenRailItem = useCallback((it: { display_name: string } & Partial<RailItem>) => {
    const r = it as RailItem;
    setSheetItem({
      ingredient_key: r.ingredient_key,
      display_name: r.display_name,
      unlocks_count: r.unlocks_count ?? 0,
      category_key: r.category_key ?? null,
      recipes: r.recipes ?? [],
      next_step: r.next_step ?? [],
    });
  }, []);

  // SHOP-LIST 3b: refresh the badge whenever the tab regains focus (e.g.
  // returning from the list page after checking items off).
  const fetchListCount = useCallback(async () => {
    if (!session) return;
    try {
      const res = await apiFetch("/shopping-list", { session });
      if (!res.ok) return;
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      setListCount(items.length);
      setListedKeys(new Set(items.map((it: { ingredient_key: string }) => String(it.ingredient_key))));
    } catch {
      // badge is best-effort — never block the screen
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      fetchListCount();
    }, [fetchListCount])
  );

  const fetchSuggestions = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await apiFetch("/restock-suggestions", {
        session,
        method: "POST",
        body: { user_interactions: userInteractions, include_rails: true },
      });

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`${resp.status} ${t}`);
      }

      const data = await resp.json();
      setSuggestions(data.suggestions ?? []);
      setMeta(data.meta ?? null);
      setRails(Array.isArray(data.rails) ? data.rails : null);
      setRailsMeta(data.rails_meta ?? null);
      if (__DEV__ && Array.isArray(data.rails)) {
        console.log(
          `[restock] rails=${data.rails.length} keys=${data.rails.map((r: Rail) => r.key).join(",")} ` +
          `tier=${data.rails_meta?.tier} seed=${data.rails_meta?.rotation_seed}`
        );
      }
      setHasFetched(true);

      analytics(EVENTS.SMART_RESTOCK_VIEWED, { count: data.suggestions?.length ?? 0 });

      try {
        Sentry.addBreadcrumb({
          category: "restock",
          message: "restock_view",
          level: "info",
        });
      } catch {}
    } catch (e: any) {
      setError(e?.message ?? "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  }, [session, userInteractions]);

  // ── WHATIF(S4):typeahead 串既有 /search-suggestions,只取 ingredient ──
  useEffect(() => {
    const q = searchText.trim();
    if (!session?.access_token || q.length < 2 || target) {
      setTypeahead([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/search-suggestions?q=${encodeURIComponent(q)}&limit=8`, { session });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const labels = (Array.isArray(data.suggestions) ? data.suggestions : [])
          .filter((it: { type?: string }) => it?.type === "ingredient")
          .map((it: { label: string }) => String(it.label || "").trim())
          .filter(Boolean)
          .slice(0, 6);
        setTypeahead(labels);
      } catch {
        // typeahead is best-effort — never block typing
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchText, session, target]);

  // 選定一支原料 → 對單一 key 問後端(已擁有 / 邊際解鎖)
  const selectTarget = useCallback(
    async (label: string) => {
      if (!session?.access_token) return;
      const key = label.trim().toLowerCase().replace(/\s+/g, "_");
      if (!key) return;
      analytics(EVENTS.WHATIF_SELECTED, { target_key: key });
      setSearchText(label);
      setTypeahead([]);
      setTargetLoading(true);
      try {
        const res = await apiFetch("/restock-suggestions", {
          session,
          method: "POST",
          body: { user_interactions: userInteractions, target_key: key },
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        const t = data.target ?? null;
        setTarget(t);
        // B-3(mockup 態三):未擁有的 target 直接開 detail sheet 富卡
        if (t && t.owned === false) {
          setSheetItem({
            ingredient_key: t.ingredient_key,
            display_name: t.display_name,
            unlocks_count: t.unlocks_count ?? 0,
            category_key: t.category_key ?? null,
            recipes: t.recipes ?? [],
            next_step: t.next_step ?? [],
          });
        }
      } catch {
        setToastMessage("Could not look that up — try again.");
        setTimeout(() => setToastMessage(null), 3500);
      } finally {
        setTargetLoading(false);
      }
    },
    [session, userInteractions]
  );

  const clearSearch = useCallback(() => {
    setSearchText("");
    setTypeahead([]);
    setTarget(null);
  }, []);

  // SHOP-LIST 3b: add a suggestion to the shopping list (source: restock).
  const handleAddToList = useCallback(
    // 收窄:實際只讀這兩欄;WHATIF target 可直接傳入,免斷言(S4-FE-b 修訂)
    async (suggestion: Pick<Suggestion, "ingredient_key" | "display_name">) => {
      try {
        const res = await apiFetch("/shopping-list", {
          session,
          method: "POST",
          body: {
            ingredient_key: suggestion.ingredient_key,
            display_name: suggestion.display_name,
            source: "restock",
          },
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        setListedKeys((prev) => new Set(prev).add(suggestion.ingredient_key));
        if (!data.deduped) setListCount((c) => c + 1);
        setToastMessage("Added to your shopping list.");
      } catch {
        setToastMessage("Could not add to list — try again.");
      } finally {
        setTimeout(() => setToastMessage(null), 3500);
      }
    },
    [session]
  );

  // Not logged in
  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: OaklandDusk.bg.void }}>
        <Masthead />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 16 }}>
          <FontAwesome name="shopping-cart" size={48} color={OaklandDusk.text.tertiary} />
          {/* Type.title — empty-state section title */}
          <Text style={[Type.title, { color: OaklandDusk.text.primary }]}>Smart Restock</Text>
          {/* Type.body — sign-in description */}
          <Text style={[Type.body, { color: OaklandDusk.text.secondary, textAlign: "center" }]}>
            Sign in to get personalized bottle recommendations based on your bar.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, position: "relative", backgroundColor: OaklandDusk.bg.void }}>
    <Masthead
      actions={
        <Pressable
          onPress={() => router.push("/shopping-list")}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Shopping list"
          style={{ alignItems: "center", gap: 4 }}
        >
          <View style={{
            width: 32, height: 32, borderRadius: 8, borderWidth: 1,
            borderColor: `${OaklandDusk.brand.gold}4D`,
            alignItems: "center", justifyContent: "center",
          }}>
            <FontAwesome name="shopping-bag" size={14} color={OaklandDusk.brand.gold} />
            {listCount > 0 && (
              <View style={{
                position: "absolute", top: -5, right: -5, minWidth: 15, height: 15,
                borderRadius: 7.5, backgroundColor: OaklandDusk.brand.rust,
                alignItems: "center", justifyContent: "center", paddingHorizontal: 3,
              }}>
                {/* LEAVE: 9px badge count — smaller than any Type token by design */}
                <Text style={{ fontSize: 9, color: OaklandDusk.text.primary, fontFamily: "DMMono" }}>
                  {listCount > 9 ? "9+" : listCount}
                </Text>
              </View>
            )}
          </View>
          {/* LEAVE: 8px DMMono frame label — mirrors shelf sortLabel spec */}
          <Text style={{ fontFamily: "DMMono", fontSize: 8, letterSpacing: 2, color: OaklandDusk.brand.gold }}>
            LIST
          </Text>
        </Pressable>
      }
    />
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={fetchSuggestions} tintColor={OaklandDusk.brand.gold} />
      }
    >
      {/* Header */}
      <View style={{ gap: 4 }}>
        {/* Type.display — page-level heading */}
        <Text style={[Type.display, { color: OaklandDusk.text.primary }]}>What to buy next?</Text>
        {/* Type.caption — small secondary subtitle */}
        <Text style={[Type.caption, { color: OaklandDusk.text.secondary }]}>
          Based on bottles you already own
        </Text>
      </View>

      {/* WHATIF 搜尋列(S4) */}
      {hasFetched && !loading && (
        <View style={{ gap: 10 }}>
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 9,
            backgroundColor: OaklandDusk.bg.surface,
            borderWidth: 1,
            borderColor: searchText ? "rgba(200,120,40,0.45)" : OaklandDusk.bg.border,
            borderRadius: R.pill, paddingVertical: 11, paddingHorizontal: 15,
          }}>
            <FontAwesome name="search" size={13} color={OaklandDusk.text.tertiary} />
            <TextInput
              value={searchText}
              onChangeText={(t) => {
                setSearchText(t);
                if (target) setTarget(null);
              }}
              placeholder="What if I add…"
              placeholderTextColor={OaklandDusk.text.tertiary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => searchText.trim() && selectTarget(searchText)}
              style={{ flex: 1, fontFamily: "DMMono", fontSize: 13, color: OaklandDusk.text.primary, padding: 0 }}
            />
            {searchText.length > 0 && (
              <Pressable onPress={clearSearch} hitSlop={10} accessibilityLabel="Clear search">
                <FontAwesome name="times-circle" size={15} color={OaklandDusk.text.tertiary} />
              </Pressable>
            )}
          </View>

          {typeahead.length > 0 && (
            <View style={{
              backgroundColor: OaklandDusk.bg.surface,
              borderWidth: 1, borderColor: OaklandDusk.bg.border,
              borderRadius: R.panel, padding: 5,
            }}>
              {typeahead.map((label) => {
                const owned = ownedKeys.has(label.trim().toLowerCase().replace(/\s+/g, "_"));
                return (
                  <Pressable
                    key={label}
                    onPress={() => selectTarget(label)}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    style={{
                      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                      paddingVertical: 10, paddingHorizontal: 11, borderRadius: R.control,
                    }}
                  >
                    <Text style={[Type.body, { color: OaklandDusk.text.primary }]}>{label}</Text>
                    {owned && (
                      <Text style={{ fontFamily: "DMMono", fontSize: 9, letterSpacing: 1, color: "#4ade80" }}>
                        IN MY BAR
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* Loading */}
      {loading && !hasFetched && (
        <View style={{ padding: 40, alignItems: "center" }}>
          <ActivityIndicator size="large" color={OaklandDusk.brand.gold} />
          {/* Type.body — loading state description */}
          <Text style={[Type.body, { color: OaklandDusk.text.secondary, marginTop: 12 }]}>Analyzing your bar...</Text>
        </View>
      )}

      {/* Error — S1:tap 重試 */}
      {error && (
        <Pressable
          onPress={fetchSuggestions}
          accessibilityRole="button"
          accessibilityLabel="Retry loading recommendations"
          style={{ padding: 12, borderWidth: 1, borderRadius: 14, borderColor: OaklandDusk.accent.crimson, backgroundColor: OaklandDusk.accent.roseBg, gap: 4 }}
        >
          {/* Type.caption — error message */}
          <Text style={[Type.caption, { color: OaklandDusk.semantic.error }]}>{error}</Text>
          <Text style={[Type.caption, { color: OaklandDusk.text.tertiary }]}>Tap to retry</Text>
        </Pressable>
      )}

      {/* B-2 v5 hero:#1 PICK monogram 卡(railsActive 時取代 48px 數字 hero) */}
      {hasFetched && railsActive && heroItem && !loading && !target && (
        <Pressable
          onPress={() => handleOpenRailItem(heroItem)}
          accessibilityRole="button"
          accessibilityLabel={`Top pick ${heroItem.display_name}`}
          style={{
            flexDirection: "row", alignItems: "center", gap: 12,
            backgroundColor: OaklandDusk.bg.card,
            borderWidth: 1, borderColor: OaklandDusk.brand.gold,
            borderRadius: 14, padding: 14, marginTop: 6,
          }}
        >
          <View style={{
            position: "absolute", top: -9, left: 14,
            backgroundColor: OaklandDusk.brand.yellow,
            paddingHorizontal: 9, paddingVertical: 3, borderRadius: R.control, zIndex: 1,
          }}>
            {/* Type.label — badge kicker(沿用 #1 pick 樣式,底色 v5 yellow) */}
            <Text style={[Type.label, { color: OaklandDusk.bg.void }]}>#1 pick</Text>
          </View>
          <Monogram label={heroItem.display_name} size={48} />
          <View style={{ flex: 1 }}>
            {/* Type.heading — hero ingredient name */}
            <Text style={[Type.heading, { color: OaklandDusk.text.primary }]}>{heroItem.display_name}</Text>
            {/* LEAVE: DMMono 11px hero unlock line — mockup v5 spec */}
            <Text style={{ fontFamily: "DMMono", fontSize: 11, color: OaklandDusk.brand.sundown, marginTop: 2 }}>
              +{heroItem.unlocks_count} cocktail{heroItem.unlocks_count === 1 ? "" : "s"} tonight
            </Text>
          </View>
        </Pressable>
      )}

      {/* Hero number — top PRIMARY suggestion's unlock count(fail-soft 回落) */}
      {hasFetched && !railsActive && primarySuggestions.length > 0 && !loading && !target && (
        <Pressable
          onPress={() => openUnlocks(
            "All new cocktails",
            Array.from(
              new Map(
                primarySuggestions.flatMap((s) => s.recipes ?? []).map((r) => [r.iba_code, r])
              ).values()
            )
          )}
          accessibilityRole="button"
          accessibilityLabel="See all new cocktails"
          style={{ alignItems: "center", paddingVertical: 16 }}
        >
          {/* LEAVE: 14px hero support text — no matching role */}
          <Text style={{ fontSize: 14, color: OaklandDusk.text.tertiary }}>Add one bottle, make</Text>
          {/* LEAVE: 48px hero number — outside type scale */}
          <Text style={{ fontSize: 48, fontWeight: "800", color: OaklandDusk.brand.gold, lineHeight: 56 }}>
            {primarySuggestions[0].unlocks_count} more ›
          </Text>
          {/* LEAVE: 16px "cocktails" companion — no matching role */}
          <Text style={{ fontSize: 16, fontWeight: "700", color: OaklandDusk.brand.gold }}>cocktails</Text>
        </Pressable>
      )}

      {hasFetched && filteredSuggestions.length === 0 && !loading && (
        meta?.reason === "no_inventory" ? (
          <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
            <FontAwesome name="search" size={36} color={OaklandDusk.text.tertiary} />
            {/* Type.heading — empty-state title */}
            <Text style={[Type.heading, { color: OaklandDusk.text.primary }]}>No bottles in your bar yet</Text>
            {/* Type.caption — empty-state description */}
            <Text style={[Type.caption, { color: OaklandDusk.text.secondary, textAlign: "center" }]}>
              Scan your bottles first, then come back for personalized recommendations.
            </Text>
            <Pressable
              onPress={() => router.push("/(tabs)/inventory")}
              style={{
                backgroundColor: OaklandDusk.brand.gold,
                borderRadius: 12,
                paddingVertical: 12,
                paddingHorizontal: 24,
                marginTop: 8,
              }}
            >
              {/* Type.button — CTA */}
              <Text style={[Type.button, { color: OaklandDusk.bg.void }]}>
                Go to My Bar
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
            <FontAwesome name="check-circle" size={36} color="#6B8F6B" />
            {/* Type.heading — empty-state title */}
            <Text style={[Type.heading, { color: OaklandDusk.text.primary }]}>Your bar is well stocked!</Text>
            {/* Type.caption — empty-state description */}
            <Text style={[Type.caption, { color: OaklandDusk.text.secondary, textAlign: "center" }]}>
              Scan more bottles or add favorites to get better suggestions.
            </Text>
          </View>
        )
      )}

      {/* Primary suggestion cards — true must-buys */}
      {/* WHATIF 結果(S4):未擁有 = 標準卡原封;已擁有 = 庫存剩量 + 補貨鈕 */}
      {targetLoading && (
        <ActivityIndicator color={OaklandDusk.brand.gold} style={{ marginVertical: 8 }} />
      )}

      {target && !targetLoading && (
        <View style={{ gap: 10 }}>
          <Text style={{ fontFamily: "DMMono", fontSize: 10, letterSpacing: 2.5, color: OaklandDusk.text.tertiary }}>YOUR SEARCH</Text>
          {target.owned ? (
            <View style={{
              borderRadius: R.panel, borderWidth: 1,
              borderColor: "rgba(200,120,40,0.45)",
              backgroundColor: OaklandDusk.bg.card, padding: 16,
            }}>
              <Pressable
                onPress={() => router.push({
                  pathname: "/ingredient-info",
                  params: {
                    key: target.ingredient_key,
                    name: target.display_name,
                    listed: listedKeys.has(target.ingredient_key) ? "1" : "0",
                  },
                })}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`About ${target.display_name}`}
              >
                <Text style={[Type.heading, { color: OaklandDusk.text.primary }]}>{target.display_name}</Text>
              </Pressable>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginTop: 5 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#4ade80" }} />
                <Text style={[Type.caption, { color: OaklandDusk.text.secondary }]}>
                  {target.remaining_pct === null
                    ? "In My Bar"
                    : `In My Bar · ${target.remaining_pct}% left`}
                </Text>
              </View>
              <Pressable
                onPress={() => handleAddToList(target)}
                disabled={listedKeys.has(target.ingredient_key)}
                accessibilityRole="button"
                accessibilityLabel={`Add ${target.display_name} to shopping list`}
                style={{
                  alignSelf: "flex-start", marginTop: 14,
                  flexDirection: "row", alignItems: "center", gap: 7,
                  borderWidth: 1,
                  borderColor: listedKeys.has(target.ingredient_key)
                    ? "rgba(74,222,128,0.4)"
                    : "rgba(200,120,40,0.45)",
                  borderRadius: R.pill, paddingVertical: 8, paddingHorizontal: 15,
                }}
              >
                <FontAwesome
                  name={listedKeys.has(target.ingredient_key) ? "check" : "shopping-bag"}
                  size={12}
                  color={listedKeys.has(target.ingredient_key) ? "#4ade80" : OaklandDusk.brand.gold}
                />
                <Text style={[Type.caption, {
                  fontWeight: "700",
                  color: listedKeys.has(target.ingredient_key) ? "#4ade80" : OaklandDusk.brand.gold,
                }]}>
                  {listedKeys.has(target.ingredient_key) ? "On list" : "Add"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <SuggestionCard
              s={target}
              isTop={false}
              listed={listedKeys.has(target.ingredient_key)}
              onAdd={() => handleAddToList(target)}
              onOpenUnlocks={() => handleOpenRailItem(target)}
            />
          )}
        </View>
      )}

      {target && !railsActive && primarySuggestions.length > 0 && (
        <Text style={{ fontFamily: "DMMono", fontSize: 10, letterSpacing: 2.5, color: OaklandDusk.text.tertiary }}>SUGGESTED</Text>
      )}

      {!railsActive && (
      <View style={target ? { opacity: 0.45, gap: 16 } : { gap: 16 }}>
        {primarySuggestions.map((s, i) => (
          <SuggestionCard
            key={s.ingredient_key}
            s={s}
            isTop={i === 0 && !target}
            listed={listedKeys.has(s.ingredient_key)}
            onAdd={() => handleAddToList(s)}
            onOpenUnlocks={() => openUnlocks(`${s.display_name} unlocks`, s.recipes)}
          />
        ))}
      </View>
      )}

      {/* B-2:rails 區塊(v5 Frame 1;WHATIF target 時同調暗;出血對齊 GUTTER 24) */}
      {railsActive && (
        <View style={target ? { opacity: 0.45, gap: 20 } : { gap: 20 }}>
          {railsForRender.map((rail) => (
            <View key={rail.key} style={{ gap: 8 }}>
              <View style={{ gap: 2 }}>
                {/* Type.title — rail 標題 */}
                <Text style={[Type.title, { color: OaklandDusk.text.primary }]}>{rail.title}</Text>
                {/* Type.caption italic — rail 副標 */}
                <Text style={[Type.caption, { color: OaklandDusk.text.tertiary, fontStyle: "italic" }]}>
                  {rail.subtitle}
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -24 }}
                contentContainerStyle={{ paddingHorizontal: 24, gap: 10 }}
              >
                {rail.items.map((it) => (
                  <RailCard
                    key={it.ingredient_key}
                    item={it}
                    listed={listedKeys.has(it.ingredient_key)}
                    onAdd={handleAddToList}
                    onPress={handleOpenRailItem}
                  />
                ))}
              </ScrollView>
            </View>
          ))}
        </View>
      )}

      {/* Preference match info */}
      {hasFetched && filteredSuggestions.length > 0 && (
        // LEAVE: 11px footnote — label textTransform would uppercase the hint text
        <Text style={{ color: OaklandDusk.text.tertiary, fontSize: 11, textAlign: "center", marginTop: 4 }}>
          Recommendations based on your inventory, favorites, and taste preferences.
          {"\n"}Pull down to refresh.
        </Text>
      )}
    </ScrollView>

      {/* Toast notification */}
      {/* B-3:detail sheet(rail 卡 / hero / WHATIF target 共用) */}
      <RestockDetailSheet
        data={sheetItem}
        listedKeys={listedKeys}
        onClose={() => setSheetItem(null)}
        onAdd={handleAddToList}
        onOpenUnlocks={() => {
          if (sheetItem) openUnlocks(`${sheetItem.display_name} unlocks`, sheetItem.recipes as Suggestion["recipes"]);
        }}
      />

      {toastMessage && (
        <View style={{
          position: "absolute", bottom: 40, left: 20, right: 20,
          backgroundColor: "#0E0B1A",
          borderWidth: 1, borderColor: "rgba(74,222,128,0.3)",
          borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18,
          flexDirection: "row", alignItems: "center", gap: 10,
          shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
        }}>
          <FontAwesome name="check-circle" size={16} color="#4ade80" />
          {/* LEAVE: 13px toast message with hardcoded color — UI component, not content role */}
          <Text style={{ fontSize: 13, color: "#F2E8D8", flex: 1 }}>
            {toastMessage}
          </Text>
        </View>
      )}
    </View>
  );
}
