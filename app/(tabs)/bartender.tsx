import { apiFetch } from "@/lib/api";
import StaplesModal from "@/components/StaplesModal";
import OaklandDusk from "@/constants/OaklandDusk";
import { useAuth } from "@/context/auth";
import { useInventory } from "@/context/inventory";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import PagerView from "react-native-pager-view";

const BASE_SPIRITS = ["gin", "whiskey", "rum", "tequila", "vodka", "mezcal"];
const FLAVORS = ["sweet", "strong", "smoky", "refreshing", "fruity", "bitter"];
const STYLES = ["tiki", "classic", "sour", "highball", "tropical"];
const EXCLUDES = [
  { key: "too_sweet", label: "too sweet" },
  { key: "too_bitter", label: "too bitter" },
  { key: "too_strong", label: "too strong" },
  { key: "no_vodka", label: "Vodka" },
  { key: "no_rum", label: "Rum" },
  { key: "no_gin", label: "Gin" },
  { key: "no_whiskey", label: "Whiskey" },
  { key: "no_tequila", label: "Tequila" },
];
const ANCHORS = [
  { code: "IBA_MARGARITA", name: "Margarita", desc: "Citrus, tequila, refreshing" },
  { code: "IBA_OLD_FASHIONED", name: "Old Fashioned", desc: "Whiskey, rich, classic" },
  { code: "IBA_MOJITO", name: "Mojito", desc: "Rum, minty, refreshing" },
  { code: "IBA_NEGRONI", name: "Negroni", desc: "Gin, bitter, herbal" },
  { code: "IBA_DAIQUIRI", name: "Daiquiri", desc: "Rum, citrus, balanced" },
];

const PAGE_COUNT = 6;

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

function SwipeHint({ text, bounce }: { text: string; bounce: Animated.Value }) {
  return (
    <Animated.View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 32, opacity: 0.4 }}>
      <Animated.Text style={{ color: OaklandDusk.text.secondary, fontSize: 13, transform: [{ translateX: Animated.multiply(bounce, -1) }] }}>
        {"\u2190"}
      </Animated.Text>
      <Text style={{ color: OaklandDusk.text.secondary, fontSize: 13 }}>
        {text}
      </Text>
      <Animated.Text style={{ color: OaklandDusk.text.secondary, fontSize: 13, transform: [{ translateX: bounce }] }}>
        {"\u2192"}
      </Animated.Text>
    </Animated.View>
  );
}

export default function BartenderScreen() {
  const { session } = useAuth();
  const { inventory, availableIngredientKeys } = useInventory();

  const pagerRef = useRef<PagerView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const welcomeTitleOpacity = useRef(new Animated.Value(0)).current;
  const arrowBounce = useRef(new Animated.Value(0)).current;

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
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [selectedExcludes, setSelectedExcludes] = useState<string[]>([]);
  const [selectedAnchor, setSelectedAnchor] = useState<string | null>(null);
  const [results, setResults] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [showStaples, setShowStaples] = useState(false);

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
          flavors: selectedFlavors,
          styles: selectedStyles,
          excludes: selectedExcludes,
          anchor_recipe: selectedAnchor,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setResults(data.recommendations || []);
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
        scan_items_json: encodeURIComponent(JSON.stringify(
          inventory.map(item => ({ canonical: item.ingredient_key, display: item.display_name }))
        )),
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
            <View style={{ gap: 16 }}>
              {results.map(pick => {
                const tags = getTasteTags(pick.recipe_vec);
                return (
                  <Pressable
                    key={pick.iba_code}
                    onPress={() => openRecipe(pick)}
                    style={{
                      backgroundColor: OaklandDusk.bg.card,
                      borderRadius: 14,
                      padding: 16,
                      borderWidth: 1,
                      borderColor: OaklandDusk.bg.border,
                    }}
                  >
                    <Text style={{
                      fontSize: 20,
                      fontWeight: "800",
                      color: OaklandDusk.text.primary,
                    }}>
                      {pick.name}
                    </Text>

                    {tags.length > 0 && (
                      <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                        {tags.map(t => (
                          <View key={t} style={{
                            backgroundColor: OaklandDusk.brand.tagBg,
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 6,
                          }}>
                            <Text style={{ fontSize: 11, color: OaklandDusk.brand.gold }}>{t}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {pick.style && (
                      <Text style={{
                        fontSize: 11,
                        color: OaklandDusk.text.tertiary,
                        marginTop: 8,
                        textTransform: "capitalize",
                      }}>
                        {pick.style}{pick.glass ? ` \u00B7 ${pick.glass}` : ""}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
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
              setShowResults(false);
              setSelectedSpirits([]);
              setSelectedFlavors([]);
              setSelectedStyles([]);
              setSelectedExcludes([]);
              setSelectedAnchor(null);
              setResults([]);
              setError(null);
              pagerRef.current?.setPage(0);
              setActiveIndex(0);
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
          <SwipeHint text="swipe to start" bounce={arrowBounce} />
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
          <SwipeHint text="swipe for more" bounce={arrowBounce} />
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
          <SwipeHint text="swipe for more" bounce={arrowBounce} />
        </ScrollView>

        {/* Page 3: Style */}
        <ScrollView key="3" contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
          <Text style={{ fontSize: 26, fontWeight: "800", color: OaklandDusk.text.primary, marginBottom: 6 }}>
            Any style in mind?
          </Text>
          <Text style={{ fontSize: 14, color: OaklandDusk.text.tertiary, marginBottom: 20 }}>
            Choose one or more, or just skip.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {STYLES.map(s => (
              <Tag
                key={s}
                label={s}
                selected={selectedStyles.includes(s)}
                onPress={() => toggle(selectedStyles, s, setSelectedStyles)}
              />
            ))}
          </View>
          <SwipeHint text="swipe for more" bounce={arrowBounce} />
        </ScrollView>

        {/* Page 4: Avoid */}
        <ScrollView key="4" contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
          <Text style={{ fontSize: 26, fontWeight: "800", color: OaklandDusk.text.primary, marginBottom: 6 }}>
            Not in the mood for...
          </Text>
          <Text style={{ fontSize: 14, color: OaklandDusk.text.tertiary, marginBottom: 12 }}>
            Anything you'd rather leave out? Totally fine to skip this.
          </Text>
          <SectionHeader>Taste</SectionHeader>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {EXCLUDES.filter(ex => ex.key.startsWith("too_")).map(ex => (
              <Tag
                key={ex.key}
                label={ex.label}
                variant="exclude"
                selected={selectedExcludes.includes(ex.key)}
                onPress={() => toggle(selectedExcludes, ex.key, setSelectedExcludes)}
              />
            ))}
          </View>
          <SectionHeader>Skip these spirits</SectionHeader>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {EXCLUDES.filter(ex => ex.key.startsWith("no_")).map(ex => (
              <Tag
                key={ex.key}
                label={ex.label}
                variant="exclude"
                selected={selectedExcludes.includes(ex.key)}
                onPress={() => toggle(selectedExcludes, ex.key, setSelectedExcludes)}
              />
            ))}
          </View>
          <SwipeHint text="swipe for more" bounce={arrowBounce} />
        </ScrollView>

        {/* Page 5: Anchors */}
        <ScrollView key="5" contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
          <Text style={{ fontSize: 26, fontWeight: "800", color: OaklandDusk.text.primary, marginBottom: 6 }}>
            Something like this?
          </Text>
          <Text style={{ fontSize: 14, color: OaklandDusk.text.tertiary, marginBottom: 20 }}>
            Tap a cocktail that matches your vibe.
          </Text>
          <View style={{ gap: 10 }}>
            {ANCHORS.map(a => {
              const active = selectedAnchor === a.code;
              return (
                <Pressable
                  key={a.code}
                  onPress={() => setSelectedAnchor(active ? null : a.code)}
                  style={{
                    borderWidth: 1,
                    borderColor: active ? OaklandDusk.brand.gold : "rgba(200,120,40,0.25)",
                    backgroundColor: active ? "rgba(200,120,40,0.1)" : "transparent",
                    borderRadius: 12,
                    padding: 14,
                  }}
                >
                  <Text style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: active ? OaklandDusk.brand.yellow : OaklandDusk.text.primary,
                  }}>
                    {a.name}
                  </Text>
                  <Text style={{
                    fontSize: 13,
                    color: OaklandDusk.text.tertiary,
                    marginTop: 2,
                  }}>
                    {a.desc}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <SwipeHint text="swipe back" bounce={arrowBounce} />
        </ScrollView>
      </PagerView>

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
          fetchRecommendations(stapleKeys);
        }}
        onCancel={() => setShowStaples(false)}
      />
    </View>
  );
}
