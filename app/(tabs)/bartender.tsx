import { apiFetch } from "@/lib/api";
import { getTasteTags } from "@/lib/tasteTags";
import HintBubble, { GUIDE_KEYS, dismissGuide, isGoldenPathStepReady } from "@/components/GuideBubble";
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

const BASE_SPIRITS = ["gin", "whiskey", "rum", "tequila", "vodka", "brandy"];
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
    <Animated.View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: 0.8 }}>
      {showLeft && (
        <Animated.Text style={{ color: '#E8C88A', fontSize: 22, transform: [{ translateX: Animated.multiply(bounce, -1) }] }}>
          {"\u2190"}
        </Animated.Text>
      )}
      <Text style={{ color: '#E8C88A', fontSize: 20, fontWeight: "700", letterSpacing: 0.5 }}>
        {text}
      </Text>
      {showRight && (
        <Animated.Text style={{ color: '#E8C88A', fontSize: 22, transform: [{ translateX: bounce }] }}>
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
  const [gpStep1Visible, setGpStep1Visible] = useState(false);
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
      let recs = data.recommendations || [];
      let away = data.one_away || [];

      if (preferences.safetyMode?.avoidHighProof) {
        const isHighProof = (pick: Pick) => {
          const strength = Number(pick.recipe_vec?.alcoholStrength ?? 0);
          return strength > 3.5;
        };
        recs = recs.filter((r: Pick) => !isHighProof(r));
        away = away.filter((r: Pick) => !isHighProof(r));
      }

      setResults(recs);
      setOneAway(away);
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
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
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
                                  <Text style={{ fontSize: 12, color: OaklandDusk.brand.sundown, fontWeight: '500', marginTop: 8 }}>
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
          const pos = e.nativeEvent.position;
          setActiveIndex(pos);
          if (pos === PAGE_COUNT - 1) {
            // Reached Avoid page — check if GP step 1 should show
            isGoldenPathStepReady(1).then((ready) => {
              if (ready) setGpStep1Visible(true);
            });
          }
        }}
      >
        {/* Page 0: Welcome */}
        <View key="welcome" style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
          <View style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            backgroundColor: "rgba(200,120,40,0.15)",
            borderWidth: 1,
            borderColor: "rgba(200,120,40,0.25)",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}>
            <Text style={{ fontSize: 32, fontWeight: "800", color: OaklandDusk.brand.gold }}>S</Text>
          </View>
          <Text style={{
            fontSize: 11,
            fontWeight: "700",
            color: "#B8956A",
            letterSpacing: 1.5,
            textTransform: "uppercase",
            marginBottom: 4,
          }}>
            Welcome to
          </Text>
          <Animated.Text style={{
            fontSize: 30,
            fontWeight: "800",
            color: "#E8C88A",
            textAlign: "center",
            marginBottom: 16,
            opacity: welcomeTitleOpacity,
          }}>
            Sipmetry
          </Animated.Text>
          <Text style={{
            fontSize: 20,
            fontWeight: "700",
            color: "#D4A55A",
            textAlign: "center",
            marginBottom: 6,
          }}>
            {(() => {
              const h = new Date().getHours();
              if (h < 12) return "Good morning";
              if (h < 17) return "Good afternoon";
              if (h < 21) return "Good evening";
              return "Night owl mode";
            })()}
          </Text>
          <Text style={{
            fontSize: 14,
            color: "#9A8165",
            textAlign: "center",
            lineHeight: 20,
            marginBottom: 32,
          }}>
            {(() => {
              const h = new Date().getHours();
              if (h < 17) return "What are we mixing today?";
              if (h < 21) return "It\u2019s cocktail hour \u2014 what are we mixing?";
              return "Let\u2019s find your nightcap.";
            })()}
          </Text>
        </View>

        {/* Page 1: Base Spirit */}
        <ScrollView key="1" contentContainerStyle={{ padding: 20, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
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
        <ScrollView key="2" contentContainerStyle={{ padding: 20, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
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
        <ScrollView key="3" contentContainerStyle={{ padding: 20, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
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
          direction={activeIndex === 0 ? "left" : activeIndex === PAGE_COUNT - 1 ? "left" : "both"}
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

      {activeIndex > 0 && (
        <View style={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12, position: "relative" }}>
          <HintBubble
            storageKey={GUIDE_KEYS.GP_STEP_1}
            visible={gpStep1Visible}
            onDismiss={() => setGpStep1Visible(false)}
            hintType="tap"
            hintColor="charcoal"
          />
          <Pressable
            onPress={() => {
              if (gpStep1Visible) {
                dismissGuide(GUIDE_KEYS.GP_STEP_1);
                setGpStep1Visible(false);
              }
              setShowBottomSheet(true);
            }}
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
      )}

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
                    router.push("/scan?intent=addToBar");
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
                    // Auto-dismiss GP step 2 so step 3 can unlock on Scan page
                    dismissGuide(GUIDE_KEYS.GP_STEP_2);
                    setShowBottomSheet(false);
                    router.push("/scan?intent=addToBar");
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
