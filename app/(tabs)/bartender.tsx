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
  Modal,
  NativeModules,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

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
  const activeBg = isExclude ? "rgba(192,72,88,0.18)" : "rgba(200,120,40,0.15)";
  const activeBorder = isExclude ? OaklandDusk.brand.rust : OaklandDusk.brand.gold;
  const activeText = isExclude ? OaklandDusk.accent.crimson : OaklandDusk.brand.yellow;
  const idleBorder = isExclude ? "rgba(192,72,88,0.2)" : "rgba(200,120,40,0.25)";
  const idleBg = isExclude ? "rgba(192,72,88,0.05)" : "rgba(200,120,40,0.06)";
  const idleText = isExclude ? "#c8a0a0" : OaklandDusk.text.secondary;

  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: selected ? activeBorder : idleBorder,
        backgroundColor: selected ? activeBg : idleBg,
        alignItems: "center",
        transform: selected ? [{ scale: 1.03 }] : [],
      }}
    >
      <Text style={{
        fontSize: 15,
        fontWeight: selected ? "700" : "500",
        color: selected ? activeText : idleText,
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

  const [showResults, setShowResults] = useState(false);

  const [selectedOccasion, setSelectedOccasion] = useState<string | null>(null);
  const [selectedSpirits, setSelectedSpirits] = useState<string[]>([]);
  const [selectedExcludes, setSelectedExcludes] = useState<string[]>([]);
  const [results, setResults] = useState<Pick[]>([]);
  const [oneAway, setOneAway] = useState<Pick[]>([]);
  const [hint, setHint] = useState<{ preset: string; message_en: string; message_zh: string; suggested_ingredients: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [showStaples, setShowStaples] = useState(false);
  const [confirmedStaples, setConfirmedStaples] = useState<string[]>([]);
  const [staplesConfirmed, setStaplesConfirmed] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STAPLES_STORAGE_KEY).then((raw) => {
      try {
        if (raw !== null) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setConfirmedStaples(parsed);
          setStaplesConfirmed(true);
        }
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
          occasion: selectedOccasion,
          base_spirit: selectedSpirits.length === 1 ? selectedSpirits[0] : undefined,
          base_spirits: selectedSpirits,
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
      // Mark user as having used the bartender (for skip-Welcome on next launch)
      AsyncStorage.setItem("sipmetry_has_used_bartender", "true").catch(() => {});
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
                const hasPreset = false;
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
                          const isHeroPick = results.length > 0 && pick.iba_code === results[0].iba_code;
                          const tags = getTasteTags(pick.recipe_vec);
                          return (
                            <View key={pick.iba_code} style={isHeroPick ? { position: "relative", marginTop: 4 } : {}}>
                              {isHeroPick && (
                                <View style={{
                                  position: "absolute",
                                  top: -1,
                                  right: 12,
                                  backgroundColor: OaklandDusk.brand.gold,
                                  paddingHorizontal: 10,
                                  paddingVertical: 3,
                                  borderBottomLeftRadius: 8,
                                  borderBottomRightRadius: 8,
                                  zIndex: 2,
                                }}>
                                  <Text style={{ fontSize: 11, fontWeight: "800", color: OaklandDusk.bg.void }}>#1 pick</Text>
                                </View>
                              )}
                              <Pressable
                                onPress={() => openRecipe(pick)}
                                style={{
                                  backgroundColor: OaklandDusk.bg.card,
                                  borderRadius: 14,
                                  padding: 16,
                                  borderWidth: isHeroPick ? 1.5 : 1,
                                  borderColor: isHeroPick ? OaklandDusk.brand.gold : OaklandDusk.bg.border,
                                }}
                              >
                                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                                  <CocktailThumbnail imageUrl={pick.image_url} size={isHeroPick ? 96 : undefined} />
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: isHeroPick ? 24 : 20, fontWeight: "800", color: OaklandDusk.text.primary }}>
                                      {pick.name}
                                    </Text>
                                    {pick.explain ? (
                                      <Text style={{ fontSize: 12, color: OaklandDusk.text.secondary, marginTop: 4 }}>
                                        {pick.explain}
                                      </Text>
                                    ) : null}
                                    {tags.length > 0 && (
                                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                                        {tags.map(t => (
                                          <View key={t} style={{ backgroundColor: OaklandDusk.brand.tagBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                                            <Text style={{ fontSize: 11, color: OaklandDusk.brand.gold }}>{t}</Text>
                                          </View>
                                        ))}
                                      </View>
                                    )}
                                    {!isHeroPick && pick.style && (
                                      <Text style={{ fontSize: 11, color: OaklandDusk.text.tertiary, marginTop: 8, textTransform: "capitalize" }}>
                                        {pick.style}{pick.glass ? ` \u00B7 ${pick.glass}` : ""}
                                      </Text>
                                    )}
                                  </View>
                                </View>
                                {isHeroPick && (
                                  <Pressable
                                    onPress={(e) => { e.stopPropagation(); openRecipe(pick); }}
                                    style={{
                                      marginTop: 14,
                                      backgroundColor: OaklandDusk.brand.gold,
                                      paddingVertical: 12,
                                      borderRadius: 12,
                                      alignItems: "center",
                                    }}
                                  >
                                    <Text style={{ fontSize: 15, fontWeight: "700", color: OaklandDusk.bg.void }}>Make this</Text>
                                  </Pressable>
                                )}
                              </Pressable>
                            </View>
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
                          const isHeroPick = results.length > 0 && pick.iba_code === results[0].iba_code;
                          const tags = getTasteTags(pick.recipe_vec);
                          return (
                            <View key={pick.iba_code || pick.name} style={isHeroPick ? { position: "relative", marginTop: 4 } : {}}>
                              {isHeroPick && (
                                <View style={{
                                  position: "absolute",
                                  top: -1,
                                  right: 12,
                                  backgroundColor: OaklandDusk.brand.gold,
                                  paddingHorizontal: 10,
                                  paddingVertical: 3,
                                  borderBottomLeftRadius: 8,
                                  borderBottomRightRadius: 8,
                                  zIndex: 2,
                                }}>
                                  <Text style={{ fontSize: 11, fontWeight: "800", color: OaklandDusk.bg.void }}>#1 pick</Text>
                                </View>
                              )}
                              <Pressable
                                onPress={() => openRecipe(pick)}
                                style={{
                                  backgroundColor: OaklandDusk.bg.card,
                                  borderRadius: 14,
                                  padding: 16,
                                  borderWidth: isHeroPick ? 1.5 : 1,
                                  borderColor: isHeroPick ? OaklandDusk.brand.gold : "rgba(200,120,40,0.15)",
                                  borderLeftWidth: isHeroPick ? 1.5 : 3,
                                  borderLeftColor: isHeroPick ? OaklandDusk.brand.gold : OaklandDusk.brand.gold,
                                }}
                              >
                                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                                  <CocktailThumbnail imageUrl={pick.image_url} size={isHeroPick ? 96 : undefined} />
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: isHeroPick ? 24 : 20, fontWeight: "800", color: OaklandDusk.text.primary }}>
                                      {pick.name}
                                    </Text>
                                    {pick.explain ? (
                                      <Text style={{ fontSize: 12, color: OaklandDusk.text.secondary, marginTop: 4 }}>
                                        {pick.explain}
                                      </Text>
                                    ) : null}
                                    {tags.length > 0 && (
                                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                                        {tags.map(t => (
                                          <View key={t} style={{ backgroundColor: OaklandDusk.brand.tagBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                                            <Text style={{ fontSize: 11, color: OaklandDusk.brand.gold }}>{t}</Text>
                                          </View>
                                        ))}
                                      </View>
                                    )}
                                    <Text style={{ fontSize: 12, color: OaklandDusk.brand.sundown, fontWeight: "500", marginTop: 8 }}>
                                      Need: {(pick.missing_items || []).map(k => k.replace(/_/g, " ")).join(", ")}
                                    </Text>
                                  </View>
                                </View>
                                {isHeroPick && (
                                  <Pressable
                                    onPress={(e) => { e.stopPropagation(); openRecipe(pick); }}
                                    style={{
                                      marginTop: 14,
                                      backgroundColor: OaklandDusk.brand.gold,
                                      paddingVertical: 12,
                                      borderRadius: 12,
                                      alignItems: "center",
                                    }}
                                  >
                                    <Text style={{ fontSize: 15, fontWeight: "700", color: OaklandDusk.bg.void }}>Make this</Text>
                                  </Pressable>
                                )}
                              </Pressable>
                            </View>
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
                                  {pick.explain ? (
                                    <Text style={{ fontSize: 12, color: OaklandDusk.text.secondary, marginTop: 4 }}>
                                      {pick.explain}
                                    </Text>
                                  ) : null}
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
        </ScrollView>

        <View style={{ paddingHorizontal: 24, paddingBottom: 24, paddingTop: 12 }}>
          <Pressable
            onPress={() => {
              setResults([]);
              setOneAway([]);
              setHint(null);
              setError(null);
              setSelectedOccasion(null);
              setSelectedSpirits([]);
              setSelectedExcludes([]);
              setShowResults(false);
            }}
            style={{
              backgroundColor: OaklandDusk.brand.gold,
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: OaklandDusk.bg.void }}>
              Show me another
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: OaklandDusk.bg.void }}>
      {error && (
        <Text style={{
          color: OaklandDusk.accent.crimson,
          textAlign: "center",
          paddingHorizontal: 20,
          fontSize: 14,
          marginTop: 40,
        }}>
          {error}
        </Text>
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
                    // Skip modal if staples were previously confirmed; fetch directly
                    if (staplesConfirmed) {
                      fetchRecommendations(confirmedStaples);
                    } else {
                      setShowStaples(true);
                    }
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
          setStaplesConfirmed(true);
          fetchRecommendations(stapleKeys);
        }}
        onCancel={() => setShowStaples(false)}
      />
    </View>
  );
}
