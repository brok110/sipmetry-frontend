import { apiFetch } from "@/lib/api";
import StaplesModal, { DEFAULT_STAPLES, STAPLES_STORAGE_KEY } from "@/components/StaplesModal";
import AsyncStorage from "@react-native-async-storage/async-storage";
import CocktailThumbnail from "@/components/CocktailThumbnail";
import OaklandDusk from "@/constants/OaklandDusk";
import { useAuth } from "@/context/auth";
import { useInventory } from "@/context/inventory";
import { usePreferences } from "@/context/preferences";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  NativeModules,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import PagerView from "react-native-pager-view";

const BASE_SPIRITS = ["gin", "whiskey", "rum", "tequila", "vodka", "mezcal"];
const FLAVORS = ["Clean", "Rich", "Bitter-forward", "Sweet-tooth", "Herbal", "Fruity", "Smoky", "Sparkling"];
const EXCLUDES = [
  { key: "too_sweet", label: "Not too sweet" },
  { key: "too_bitter", label: "Not too bitter" },
  { key: "too_strong", label: "Not too strong" },
];

const PAGE_COUNT = 4;

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
};

function getTasteTags(vec: Record<string, number> | null | undefined, max = 3): string[] {
  if (!vec) return [];
  const dimLabels: Record<string, string> = {
    sweetness: "Sweet", sourness: "Sour", bitterness: "Bitter",
    alcoholStrength: "Strong", aromaIntensity: "Aromatic", herbal: "Herbal",
    fruity: "Fruity", smoky: "Smoky", body: "Full-bodied", fizz: "Fizzy",
  };
  return Object.entries(dimLabels)
    .map(([k, label]) => ({ label, val: Number(vec[k] || 0) }))
    .filter(d => d.val >= 3)
    .sort((a, b) => b.val - a.val)
    .slice(0, max)
    .map(d => d.label);
}

function Tag({
  label,
  selected,
  onPress,
  variant = "default",
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  variant?: "default" | "exclude";
}) {
  const isExclude = variant === "exclude";
  const activeBg = isExclude ? "rgba(122,36,32,0.2)" : "rgba(200,120,40,0.15)";
  const activeBorder = isExclude ? OaklandDusk.brand.rust : OaklandDusk.brand.gold;
  const activeText = isExclude ? OaklandDusk.accent.crimson : OaklandDusk.brand.yellow;

  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: selected ? activeBorder : "rgba(200,120,40,0.25)",
        backgroundColor: selected ? activeBg : "transparent",
      }}
    >
      <Text style={{
        fontSize: 14,
        fontWeight: selected ? "700" : "500",
        color: selected ? activeText : OaklandDusk.text.secondary,
        textTransform: "capitalize",
      }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SectionHeader({ children }: { children: string }) {
  return (
    <Text style={{
      fontSize: 12,
      fontWeight: "700",
      color: OaklandDusk.brand.gold,
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: 10,
      marginTop: 20,
    }}>
      {children}
    </Text>
  );
}

function ProgressDots({ count, activeIndex }: { count: number; activeIndex: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 8, justifyContent: "center", marginBottom: 20 }}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: i === activeIndex
              ? OaklandDusk.brand.gold
              : OaklandDusk.text.tertiary,
          }}
        />
      ))}
    </View>
  );
}

function SwipeHint({ text, bounce, direction = "both" }: { text: string; bounce: Animated.Value; direction?: "left" | "right" | "both" }) {
  const showLeft = direction === "left" || direction === "both";
  const showRight = direction === "right" || direction === "both";
  return (
    <Animated.View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: 0.55 }}>
      {showLeft && (
        <Animated.Text style={{ color: OaklandDusk.text.secondary, fontSize: 18, transform: [{ translateX: Animated.multiply(bounce, -1) }] }}>
          {"\u2190"}
        </Animated.Text>
      )}
      <Text style={{ color: OaklandDusk.text.secondary, fontSize: 18, fontWeight: "500", letterSpacing: 0.5 }}>
        {text}
      </Text>
      {showRight && (
        <Animated.Text style={{ color: OaklandDusk.text.secondary, fontSize: 18, transform: [{ translateX: bounce }] }}>
          {"\u2192"}
        </Animated.Text>
      )}
    </Animated.View>
  );
}

function isChineseLocale(): boolean {
  try {
    if (Platform.OS === "ios") {
      const langs = NativeModules.SettingsManager?.settings?.AppleLanguages;
      if (Array.isArray(langs) && langs.length > 0) return String(langs[0]).toLowerCase().startsWith("zh");
    } else if (Platform.OS === "android") {
      const locale = NativeModules.I18nManager?.localeIdentifier;
      if (locale) return String(locale).toLowerCase().startsWith("zh");
    }
  } catch {}
  return false;
}

export default function BartenderScreen() {
  const { session } = useAuth();
  const { inventory, availableIngredientKeys } = useInventory();
  const { preferences } = usePreferences();

  const pagerRef = useRef<PagerView>(null);
  const pendingPageRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const welcomeTitleOpacity = useRef(new Animated.Value(0)).current;
  const arrowBounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!showResults && pendingPageRef.current !== null) {
      const target = pendingPageRef.current;
      pendingPageRef.current = null;
      // PagerView 剛掛載，需要等一幀讓 ref 就緒
      requestAnimationFrame(() => {
        pagerRef.current?.setPage(target);
        setActiveIndex(target);
      });
    }
  }, [showResults]);

  useEffect(() => {
    Animated.timing(welcomeTitleOpacity, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(arrowBounce, { toValue: 4, duration: 900, useNativeDriver: true }),
        Animated.timing(arrowBounce, { toValue: -4, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const [selectedSpirits, setSelectedSpirits] = useState<string[]>([]);
  const [selectedFlavors, setSelectedFlavors] = useState<string[]>([]);
  const [selectedExcludes, setSelectedExcludes] = useState<string[]>([]);
  const [results, setResults] = useState<Pick[]>([]);
  const [oneAway, setOneAway] = useState<Pick[]>([]);
  const [hint, setHint] = useState<{ preset: string; message_en: string; message_zh: string; suggested_ingredients: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [showStaples, setShowStaples] = useState(false);
  const [confirmedStaples, setConfirmedStaples] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STAPLES_STORAGE_KEY).then((raw) => {
      try {
        const parsed = JSON.parse(raw ?? "[]");
        if (Array.isArray(parsed)) setConfirmedStaples(parsed);
      } catch {}
    });
  }, []);

  const toggle = (arr: string[], val: string, setter: (v: string[]) => void) => {
    setter(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };

  const fetchRecommendations = async (extraKeys: string[] = []) => {
    setLoading(true);
    setError(null);
    try {
      const allKeys = [...new Set([...availableIngredientKeys, ...extraKeys])];
      const res = await apiFetch("/bartender-recommend", {
        session,
        method: "POST",
        body: {
          detected_ingredients: allKeys,
          base_spirits: selectedSpirits,
          style_presets: selectedFlavors,
          excludes: selectedExcludes,
          profile_style_preset: preferences.stylePreset,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setResults(data.recommendations || []);
      setOneAway(data.one_away || []);
      setHint(data.hint || null);
      setShowResults(true);
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const openRecipe = (pick: Pick) => {
    router.push({
      pathname: "/recipe",
      params: {
        recipe_key: pick.iba_code,
        iba_code: pick.iba_code,
        source: "bartender",
        ingredients_json: encodeURIComponent(JSON.stringify(pick.ingredient_keys)),
        scan_items_json: encodeURIComponent(JSON.stringify([
          ...inventory.map(item => ({ canonical: item.ingredient_key, display: item.display_name })),
          ...confirmedStaples.map((k) => ({
            canonical: k,
            display: DEFAULT_STAPLES.find((s) => s.ingredient_key === k)?.display_name ?? k.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
          })),
        ])),
        missing_items_json: encodeURIComponent(JSON.stringify(pick.missing_items || [])),
        overlap_hits_json: encodeURIComponent(JSON.stringify(pick.overlap_hits || [])),
      },
    });
  };


  if (showResults) {
    return (
      <View style={{ flex: 1, backgroundColor: OaklandDusk.bg.void }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <Text style={{
            fontSize: 26,
            fontWeight: "800",
            color: OaklandDusk.text.primary,
            marginBottom: 16,
          }}>
            Your picks
          </Text>

          {results.length === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 40 }}>
              <Text style={{
                fontSize: 16,
                color: OaklandDusk.text.secondary,
                textAlign: "center",
                lineHeight: 24,
              }}>
                Your bar doesn't have a match yet.{"\n"}
                Try different tags or add more bottles.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {(() => {
                const hasPreset = selectedFlavors.length > 0;
                const hasSpirit = selectedSpirits.length > 0;
                const readyMatched = results.filter(p => p.missing_count === 0 && (!hasPreset || p.preset_match));
                const alsoAvailable = (hasPreset && hasSpirit)
                  ? results.filter(p => p.missing_count === 0 && !p.preset_match)
                  : [];
                const missingMatched = results.filter(p => p.missing_count > 0 && (!hasPreset || p.preset_match));
                const hasNoContent = readyMatched.length === 0 && missingMatched.length === 0 && oneAway.length === 0;

                return (
                  <>
                    {hasPreset && hasNoContent && (
                      <View style={{ alignItems: "center", paddingTop: 20, paddingBottom: 8 }}>
                        <Text style={{ fontSize: 16, fontWeight: "700", color: OaklandDusk.text.primary, marginBottom: 6 }}>
                          {isChineseLocale() ? "\u597D\u54C1\u5473\u3002" : "Great taste."}
                        </Text>
                        <Text style={{ fontSize: 14, color: OaklandDusk.text.secondary, textAlign: "center", lineHeight: 22 }}>
                          {isChineseLocale()
                            ? "\u770B\u770B\u4E0B\u9762\u7684\u5EFA\u8B70\uFF0C\u5E6B\u4F60\u7684\u5427\u53F0\u5347\u7D1A\u3002"
                            : "Check below for what to add to your bar."}
                        </Text>
                      </View>
                    )}

                    {readyMatched.length > 0 && (
                      <>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: OaklandDusk.text.tertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                          Ready to make
                        </Text>
                        {readyMatched.map(pick => {
                          const tags = getTasteTags(pick.recipe_vec);
                          return (
                            <Pressable key={pick.iba_code} onPress={() => openRecipe(pick)} style={{ backgroundColor: OaklandDusk.bg.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: OaklandDusk.bg.border }}>
                              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                                <CocktailThumbnail imageUrl={pick.image_url} />
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 20, fontWeight: "800", color: OaklandDusk.text.primary }}>{pick.name}</Text>
                                  {tags.length > 0 && (
                                    <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                                      {tags.map(t => (
                                        <View key={t} style={{ backgroundColor: OaklandDusk.brand.tagBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                                          <Text style={{ fontSize: 11, color: OaklandDusk.brand.gold }}>{t}</Text>
                                        </View>
                                      ))}
                                    </View>
                                  )}
                                  {pick.style && (
                                    <Text style={{ fontSize: 11, color: OaklandDusk.text.tertiary, marginTop: 8, textTransform: "capitalize" }}>
                                      {pick.style}{pick.glass ? ` \u00B7 ${pick.glass}` : ""}
                                    </Text>
                                  )}
                                </View>
                              </View>
                            </Pressable>
                          );
                        })}
                      </>
                    )}

                    {(missingMatched.length > 0 || oneAway.length > 0) && (
                      <>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: OaklandDusk.text.tertiary, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>
                          Just 1 bottle away
                        </Text>
                        {[...missingMatched, ...oneAway].map(pick => {
                          const tags = getTasteTags(pick.recipe_vec);
                          return (
                            <Pressable key={pick.iba_code || pick.name} onPress={() => openRecipe(pick)} style={{ backgroundColor: OaklandDusk.bg.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "rgba(200,120,40,0.15)", borderLeftWidth: 3, borderLeftColor: OaklandDusk.brand.gold }}>
                              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                                <CocktailThumbnail imageUrl={pick.image_url} />
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 20, fontWeight: "800", color: OaklandDusk.text.primary }}>{pick.name}</Text>
                                  {tags.length > 0 && (
                                    <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                                      {tags.map(t => (
                                        <View key={t} style={{ backgroundColor: OaklandDusk.brand.tagBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                                          <Text style={{ fontSize: 11, color: OaklandDusk.brand.gold }}>{t}</Text>
                                        </View>
                                      ))}
                                    </View>
                                  )}
                                  <Text style={{ fontSize: 11, color: OaklandDusk.accent.crimson, marginTop: 8 }}>
                                    Need: {(pick.missing_items || []).map(k => k.replace(/_/g, " ")).join(", ")}
                                  </Text>
                                </View>
                              </View>
                            </Pressable>
                          );
                        })}
                      </>
                    )}

                    {alsoAvailable.length > 0 && (
                      <>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: OaklandDusk.text.tertiary, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>
                          {isChineseLocale() ? "\u4F60\u4E5F\u80FD\u505A" : "Also in your bar"}
                        </Text>
                        {alsoAvailable.map(pick => {
                          const tags = getTasteTags(pick.recipe_vec);
                          return (
                            <Pressable key={pick.iba_code} onPress={() => openRecipe(pick)} style={{ backgroundColor: OaklandDusk.bg.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: OaklandDusk.bg.border, opacity: 0.7 }}>
                              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                                <CocktailThumbnail imageUrl={pick.image_url} />
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 20, fontWeight: "800", color: OaklandDusk.text.primary }}>{pick.name}</Text>
                                  {tags.length > 0 && (
                                    <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                                      {tags.map(t => (
                                        <View key={t} style={{ backgroundColor: OaklandDusk.brand.tagBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                                          <Text style={{ fontSize: 11, color: OaklandDusk.brand.gold }}>{t}</Text>
                                        </View>
                                      ))}
                                    </View>
                                  )}
                                  {pick.style && (
                                    <Text style={{ fontSize: 11, color: OaklandDusk.text.tertiary, marginTop: 8, textTransform: "capitalize" }}>
                                      {pick.style}{pick.glass ? ` \u00B7 ${pick.glass}` : ""}
                                    </Text>
                                  )}
                                </View>
                              </View>
                            </Pressable>
                          );
                        })}
                      </>
                    )}
                  </>
                );
              })()}

              {hint && (
                <View style={{ backgroundColor: "rgba(200,120,40,0.08)", borderWidth: 1, borderColor: "rgba(200,120,40,0.2)", borderRadius: 12, padding: 14, marginTop: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: OaklandDusk.brand.gold, marginBottom: 4 }}>
                    {isChineseLocale() ? "\uD83D\uDCA1 \u5C0F\u63D0\u793A" : "\uD83D\uDCA1 Tip"}
                  </Text>
                  <Text style={{ fontSize: 13, color: OaklandDusk.text.secondary, lineHeight: 20 }}>
                    {isChineseLocale() ? hint.message_zh : hint.message_en}
                  </Text>
                </View>
              )}
            </View>
          )}

          {error && (
            <Text style={{
              color: OaklandDusk.accent.crimson,
              textAlign: "center",
              marginTop: 16,
              fontSize: 14,
            }}>
              {error}
            </Text>
          )}

          <Pressable
            onPress={() => {
              setResults([]);
              setOneAway([]);
              setHint(null);
              setError(null);
              pendingPageRef.current = 1;
              setShowResults(false);
            }}
            style={{
              borderWidth: 1.5,
              borderColor: OaklandDusk.brand.gold,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
              marginTop: 24,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: OaklandDusk.brand.gold }}>
              Try another drink
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: OaklandDusk.bg.void }}>
      <ProgressDots count={PAGE_COUNT} activeIndex={activeIndex} />

      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={(e) => {
          setActiveIndex(e.nativeEvent.position);
        }}
      >
        {/* Page 0: Welcome */}
        <View key="welcome" style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
          <View style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            backgroundColor: "rgba(200,120,40,0.12)",
            borderWidth: 1,
            borderColor: "rgba(200,120,40,0.2)",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}>
            <FontAwesome name="glass" size={30} color={OaklandDusk.brand.gold} />
          </View>
          <Animated.Text style={{
            fontSize: 26,
            fontWeight: "800",
            color: OaklandDusk.text.primary,
            textAlign: "center",
            lineHeight: 34,
            marginBottom: 10,
            opacity: welcomeTitleOpacity,
          }}>
            Your personal bartender, ready when you are.
          </Animated.Text>
          <Text style={{
            fontSize: 14,
            color: OaklandDusk.text.tertiary,
            textAlign: "center",
            lineHeight: 20,
            marginBottom: 32,
          }}>
            Swipe through a few questions {"\u2014"} or skip straight to your drink.
          </Text>
        </View>

        {/* Page 1: Base Spirit */}
        <ScrollView key="1" contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
          <Text style={{ fontSize: 26, fontWeight: "800", color: OaklandDusk.text.primary, marginBottom: 6 }}>
            What base spirit sounds good?
          </Text>
          <Text style={{ fontSize: 14, color: OaklandDusk.text.tertiary, marginBottom: 20 }}>
            Pick as many as you like, or skip ahead.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {BASE_SPIRITS.map(s => (
              <Tag
                key={s}
                label={s}
                selected={selectedSpirits.includes(s)}
                onPress={() => toggle(selectedSpirits, s, setSelectedSpirits)}
              />
            ))}
          </View>
        </ScrollView>

        {/* Page 2: Flavor */}
        <ScrollView key="2" contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
          <Text style={{ fontSize: 26, fontWeight: "800", color: OaklandDusk.text.primary, marginBottom: 6 }}>
            What flavors are you feeling?
          </Text>
          <Text style={{ fontSize: 14, color: OaklandDusk.text.tertiary, marginBottom: 20 }}>
            Select any that appeal to you.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {FLAVORS.map(f => (
              <Tag
                key={f}
                label={f}
                selected={selectedFlavors.includes(f)}
                onPress={() => toggle(selectedFlavors, f, setSelectedFlavors)}
              />
            ))}
          </View>
        </ScrollView>

        {/* Page 3: Avoid */}
        <ScrollView key="3" contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
          <Text style={{ fontSize: 26, fontWeight: "800", color: OaklandDusk.text.primary, marginBottom: 6 }}>
            Anything to avoid?
          </Text>
          <Text style={{ fontSize: 14, color: OaklandDusk.text.tertiary, marginBottom: 12 }}>
            Tap what you'd rather skip. Totally fine to leave this blank.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {EXCLUDES.map(ex => (
              <Tag
                key={ex.key}
                label={ex.label}
                variant="exclude"
                selected={selectedExcludes.includes(ex.key)}
                onPress={() => toggle(selectedExcludes, ex.key, setSelectedExcludes)}
              />
            ))}
          </View>
        </ScrollView>
      </PagerView>

      {/* 統一的 SwipeHint — 固定在 PagerView 和 CTA 之間 */}
      <View style={{ paddingVertical: 12, alignItems: "center" }}>
        <SwipeHint
          text={activeIndex === 0 ? "swipe to start" : activeIndex === PAGE_COUNT - 1 ? "swipe back" : "swipe for more"}
          bounce={arrowBounce}
          direction={activeIndex === 0 ? "right" : activeIndex === PAGE_COUNT - 1 ? "left" : "both"}
        />
      </View>

      {error && (
        <Text style={{
          color: OaklandDusk.accent.crimson,
          textAlign: "center",
          paddingHorizontal: 20,
          fontSize: 14,
        }}>
          {error}
        </Text>
      )}

      <View style={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12 }}>
        <Pressable
          onPress={() => setShowBottomSheet(true)}
          disabled={loading}
          style={{
            backgroundColor: OaklandDusk.brand.gold,
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          {loading ? (
            <ActivityIndicator color={OaklandDusk.bg.void} />
          ) : (
            <Text style={{ fontSize: 15, fontWeight: "700", color: OaklandDusk.bg.void }}>
              Let's make a drink
            </Text>
          )}
        </Pressable>
      </View>

      <Modal
        visible={showBottomSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBottomSheet(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
          onPress={() => setShowBottomSheet(false)}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: OaklandDusk.bg.card,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              paddingBottom: 36,
            }}
          >
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: OaklandDusk.bg.border }} />
            </View>

            <Text style={{ fontSize: 20, fontWeight: "800", color: OaklandDusk.text.primary, marginBottom: 4 }}>
              {inventory.length > 0 ? "How do you want to explore?" : "Let\u2019s get you started"}
            </Text>
            <Text style={{ fontSize: 14, color: OaklandDusk.text.tertiary, marginBottom: 20 }}>
              {inventory.length > 0
                ? `Your bar has ${inventory.length} bottle${inventory.length === 1 ? "" : "s"} ready`
                : "Your bar is empty \u2014 scan your bottles to unlock personalized picks"}
            </Text>

            {inventory.length > 0 ? (
              <View style={{ gap: 12 }}>
                <Pressable
                  onPress={() => {
                    setShowBottomSheet(false);
                    setShowStaples(true);
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: OaklandDusk.brand.gold,
                    backgroundColor: "rgba(200,120,40,0.08)",
                    borderRadius: 14,
                    padding: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <FontAwesome name="archive" size={20} color={OaklandDusk.brand.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: OaklandDusk.text.primary }}>
                      Use what's in my bar
                    </Text>
                    <Text style={{ fontSize: 13, color: OaklandDusk.text.tertiary, marginTop: 2 }}>
                      Recipes based on your bottles
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setShowBottomSheet(false);
                    router.push("/scan");
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(200,120,40,0.25)",
                    borderRadius: 14,
                    padding: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <FontAwesome name="camera" size={20} color={OaklandDusk.text.secondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: OaklandDusk.text.primary }}>
                      Scan something new
                    </Text>
                    <Text style={{ fontSize: 13, color: OaklandDusk.text.tertiary, marginTop: 2 }}>
                      Snap a photo and see what you can make
                    </Text>
                  </View>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                <Pressable
                  onPress={() => {
                    setShowBottomSheet(false);
                    router.push("/scan");
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: OaklandDusk.brand.gold,
                    backgroundColor: "rgba(200,120,40,0.08)",
                    borderRadius: 14,
                    padding: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <FontAwesome name="camera" size={20} color={OaklandDusk.brand.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: OaklandDusk.text.primary }}>
                      Scan my bottles
                    </Text>
                    <Text style={{ fontSize: 13, color: OaklandDusk.text.tertiary, marginTop: 2 }}>
                      Build your bar and get personal picks
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setShowBottomSheet(false);
                    router.push("/scan");
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(200,120,40,0.25)",
                    borderRadius: 14,
                    padding: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <FontAwesome name="glass" size={20} color={OaklandDusk.text.secondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: OaklandDusk.text.primary }}>
                      Just explore recipes
                    </Text>
                    <Text style={{ fontSize: 13, color: OaklandDusk.text.tertiary, marginTop: 2 }}>
                      Browse without scanning
                    </Text>
                  </View>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <StaplesModal
        visible={showStaples}
        loading={loading}
        onConfirm={(stapleKeys) => {
          setShowStaples(false);
          setConfirmedStaples(stapleKeys);
          fetchRecommendations(stapleKeys);
        }}
        onCancel={() => setShowStaples(false)}
      />
    </View>
  );
}
