import { apiFetch } from "@/lib/api";
import OaklandDusk from "@/constants/OaklandDusk";
import { useAuth } from "@/context/auth";
import { useInventory } from "@/context/inventory";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

const BASE_SPIRITS = ["gin", "whiskey", "rum", "tequila", "vodka", "mezcal"];
const FLAVORS = ["sweet", "strong", "smoky", "refreshing", "fruity", "bitter"];
const STYLES = ["tiki", "classic", "sour", "highball", "tropical"];
const EXCLUDES = [
  { key: "too_sweet", label: "too sweet" },
  { key: "too_bitter", label: "too bitter" },
  { key: "too_strong", label: "too strong" },
  { key: "no_vodka", label: "no vodka" },
  { key: "no_rum", label: "no rum" },
  { key: "no_gin", label: "no gin" },
  { key: "no_whiskey", label: "no whiskey" },
  { key: "no_tequila", label: "no tequila" },
];
const ANCHORS = [
  { code: "IBA_MARGARITA", name: "Margarita", desc: "Citrus, tequila, refreshing" },
  { code: "IBA_OLD_FASHIONED", name: "Old Fashioned", desc: "Whiskey, rich, classic" },
  { code: "IBA_MOJITO", name: "Mojito", desc: "Rum, minty, refreshing" },
  { code: "IBA_NEGRONI", name: "Negroni", desc: "Gin, bitter, herbal" },
  { code: "IBA_DAIQUIRI", name: "Daiquiri", desc: "Rum, citrus, balanced" },
];

type StepId = 1 | 2 | 3 | "results";

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

function StepIndicator({ step }: { step: StepId }) {
  const steps = [1, 2, 3] as const;
  const current = step === "results" ? 4 : step;
  return (
    <View style={{ flexDirection: "row", gap: 8, justifyContent: "center", marginBottom: 20 }}>
      {steps.map(s => (
        <View
          key={s}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: s <= current
              ? OaklandDusk.brand.gold
              : OaklandDusk.text.tertiary,
          }}
        />
      ))}
    </View>
  );
}

export default function BartenderScreen() {
  const { session } = useAuth();
  const { inventory, availableIngredientKeys } = useInventory();

  const [step, setStep] = useState<StepId>(1);
  const [selectedSpirits, setSelectedSpirits] = useState<string[]>([]);
  const [selectedFlavors, setSelectedFlavors] = useState<string[]>([]);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [selectedExcludes, setSelectedExcludes] = useState<string[]>([]);
  const [selectedAnchor, setSelectedAnchor] = useState<string | null>(null);
  const [results, setResults] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (arr: string[], val: string, setter: (v: string[]) => void) => {
    setter(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };

  const fetchRecommendations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/bartender-recommend", {
        session,
        method: "POST",
        body: {
          detected_ingredients: availableIngredientKeys,
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
      setStep("results");
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
        ingredients_json: encodeURIComponent(JSON.stringify(pick.ingredient_keys)),
        scan_items_json: encodeURIComponent(JSON.stringify(
          inventory.map(item => ({ canonical: item.ingredient_key, display: item.display_name }))
        )),
        missing_items_json: encodeURIComponent(JSON.stringify(pick.missing_items || [])),
        overlap_hits_json: encodeURIComponent(JSON.stringify(pick.overlap_hits || [])),
      },
    });
  };

  if (inventory.length === 0) {
    return (
      <View style={{
        flex: 1,
        backgroundColor: OaklandDusk.bg.void,
        justifyContent: "center",
        alignItems: "center",
        padding: 32,
      }}>
        <Text style={{
          fontSize: 28,
          fontWeight: "800",
          color: OaklandDusk.text.primary,
          marginBottom: 8,
          textAlign: "center",
        }}>
          What are you in the mood for?
        </Text>
        <Text style={{
          fontSize: 15,
          color: OaklandDusk.text.secondary,
          textAlign: "center",
          marginBottom: 32,
          lineHeight: 22,
        }}>
          Add some bottles first so I can work with what you have.
        </Text>
        <Pressable
          onPress={() => router.push("/(tabs)/inventory")}
          style={{
            backgroundColor: OaklandDusk.brand.gold,
            paddingVertical: 14,
            paddingHorizontal: 32,
            borderRadius: 12,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: "700", color: OaklandDusk.bg.void }}>
            Go to My Bar
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: OaklandDusk.bg.void }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{
          fontSize: 26,
          fontWeight: "800",
          color: OaklandDusk.text.primary,
          marginBottom: 4,
        }}>
          {step === "results" ? "Your picks" : "What are you in the mood for?"}
        </Text>
        {step !== "results" && (
          <Text style={{
            fontSize: 14,
            color: OaklandDusk.text.tertiary,
            marginBottom: 8,
          }}>
            {step === 1 && "Pick what sounds good. Skip what doesn\u2019t matter."}
            {step === 2 && "Anything you want to avoid?"}
            {step === 3 && "Something like this?"}
          </Text>
        )}

        <StepIndicator step={step} />

        {step === 1 && (
          <>
            <SectionHeader>Base Spirit</SectionHeader>
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

            <SectionHeader>Flavor</SectionHeader>
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

            <SectionHeader>Style</SectionHeader>
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
          </>
        )}

        {step === 2 && (
          <>
            <SectionHeader>Avoid</SectionHeader>
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
          </>
        )}

        {step === 3 && (
          <>
            <SectionHeader>Like one of these?</SectionHeader>
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
          </>
        )}

        {step === "results" && (
          <>
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
              <View style={{ gap: 16, marginTop: 8 }}>
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
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <Text style={{
                          fontSize: 20,
                          fontWeight: "800",
                          color: OaklandDusk.text.primary,
                          flex: 1,
                        }}>
                          {pick.name}
                        </Text>
                        {pick.missing_count > 0 && (
                          <View style={{
                            backgroundColor: "rgba(192,72,88,0.15)",
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 8,
                            marginLeft: 8,
                          }}>
                            <Text style={{ fontSize: 11, fontWeight: "700", color: OaklandDusk.accent.crimson }}>
                              {pick.missing_count === 1 ? "1 missing" : `${pick.missing_count} missing`}
                            </Text>
                          </View>
                        )}
                      </View>

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

                      <View style={{ marginTop: 10, gap: 3 }}>
                        {(pick.ingredient_keys || []).map(key => {
                          const have = (pick.overlap_hits || []).includes(key);
                          const missing = (pick.missing_items || []).includes(key);
                          return (
                            <Text key={key} style={{
                              fontSize: 13,
                              color: missing
                                ? OaklandDusk.accent.crimson
                                : have
                                  ? OaklandDusk.text.secondary
                                  : OaklandDusk.text.tertiary,
                            }}>
                              {have ? "\u2713 " : missing ? "\u2717 " : "  "}{key.replace(/_/g, " ")}
                            </Text>
                          );
                        })}
                      </View>

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

            <Pressable
              onPress={() => setStep(1)}
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
                Try different mood
              </Text>
            </Pressable>
          </>
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

        {step !== "results" && (
          <View style={{ flexDirection: "row", gap: 12, marginTop: 28 }}>
            <Pressable
              onPress={fetchRecommendations}
              disabled={loading}
              style={{
                flex: 1,
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
                  Show me
                </Text>
              )}
            </Pressable>

            {step < 3 && (
              <Pressable
                onPress={() => setStep((step + 1) as StepId)}
                style={{
                  flex: 1,
                  borderWidth: 1.5,
                  borderColor: OaklandDusk.brand.gold,
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: "700", color: OaklandDusk.brand.gold }}>
                  Next
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
