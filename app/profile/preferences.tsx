import FontAwesome from "@expo/vector-icons/FontAwesome";
import Slider from "@react-native-community/slider";
import { useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { useAuth } from "@/context/auth";
import { useLearnedPreferences } from "@/context/learnedPreferences";
import {
  FlavorLevel,
  levelWordAlcohol,
  levelWordBitterness,
  levelWordSweetness,
  StylePreset,
  usePreferences,
} from "@/context/preferences";

// Dims to display in the Learned section (most intuitive for users)
const LEARNED_DISPLAY_DIMS: { key: string; label: string }[] = [
  { key: "sweetness",      label: "Sweetness" },
  { key: "sourness",       label: "Sourness" },
  { key: "bitterness",     label: "Bitterness" },
  { key: "alcoholStrength", label: "Alcohol" },
  { key: "fruity",         label: "Fruity" },
  { key: "smoky",          label: "Smoky" },
];

function LearnedDimRow({ label, value }: { label: string; value: number }) {
  const pct = Math.round((value / 5) * 100);
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: "#333" }}>{label}</Text>
        <Text style={{ fontSize: 12, color: "#888" }}>{value.toFixed(1)}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: "#eee", overflow: "hidden" }}>
        <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: "#111" }} />
      </View>
    </View>
  );
}

const STYLE_PRESETS: { key: StylePreset; label: string }[] = [
  { key: "Clean", label: "Clean" },
  { key: "Rich", label: "Rich" },
  { key: "Bitter-forward", label: "Bitter-forward" },
  { key: "Sweet-tooth", label: "Sweet-tooth" },
  { key: "Herbal", label: "Herbal" },
  { key: "Fruity", label: "Fruity" },
  { key: "Smoky", label: "Smoky" },
  { key: "Sparkling", label: "Sparkling" },
];

function cycleLevel(v: FlavorLevel): FlavorLevel {
  const next = (Number(v) + 1) % 4;
  return next as FlavorLevel;
}

function toLevel3(v: number): FlavorLevel {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0 as FlavorLevel;
  const r = Math.round(n);
  const clamped = Math.max(0, Math.min(3, r));
  return clamped as FlavorLevel;
}

function StyleChip({
  label,
  active,
  onPress,
  disabled,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: active ? "#111" : "white",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text style={{ fontWeight: "800", color: active ? "white" : "#111" }}>
        {active ? `• ${label}` : label}
      </Text>
    </Pressable>
  );
}

function TasteChip({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: "white",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <FontAwesome name={icon} size={16} color="#555" />
      <Text style={{ fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}

function SafetyToggleRow({
  label,
  value,
  onPress,
  disabled,
}: {
  label: string;
  value: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: "white",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ fontWeight: "800", color: "#111", flex: 1 }}>{label}</Text>
      <View
        style={{
          width: 44,
          height: 26,
          borderRadius: 999,
          padding: 3,
          backgroundColor: value ? "#111" : "#ddd",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 999,
            backgroundColor: "white",
            alignSelf: value ? "flex-end" : "flex-start",
          }}
        />
      </View>
    </Pressable>
  );
}

export default function TabZeroPreferencesScreen() {
  const router = useRouter();
  const navigation = useNavigation<any>();

  useEffect(() => {
    navigation?.setOptions?.({ title: "Preferences" });
  }, [navigation]);

  const { preferences, setPreferences, resetPreferences, hydrated } = usePreferences();
  const { session } = useAuth();
  const { learnedVector, eventCount, isLoading: learnedLoading, refresh: refreshLearned } = useLearnedPreferences();
  const isLoggedIn = !!session?.access_token;

  const [draftStyle, setDraftStyle] = useState<StylePreset>(preferences.stylePreset);
  const [draftAlcohol, setDraftAlcohol] = useState<FlavorLevel>(preferences.dims.alcoholStrength);
  const [draftSweetness, setDraftSweetness] = useState<FlavorLevel>(preferences.dims.sweetness);
  const [draftBitterness, setDraftBitterness] = useState<FlavorLevel>(preferences.dims.bitterness);
  const [draftAvoidHighProof, setDraftAvoidHighProof] = useState<boolean>(preferences.safetyMode.avoidHighProof);
  const [draftAvoidAllergens, setDraftAvoidAllergens] = useState<boolean>(preferences.safetyMode.avoidAllergens);
  const [draftAvoidCaffeineAlcohol, setDraftAvoidCaffeineAlcohol] = useState<boolean>(
    preferences.safetyMode.avoidCaffeineAlcohol
  );

  useEffect(() => {
    if (!hydrated) return;
    setDraftStyle(preferences.stylePreset);
    setDraftAlcohol(preferences.dims.alcoholStrength);
    setDraftSweetness(preferences.dims.sweetness);
    setDraftBitterness(preferences.dims.bitterness);
    setDraftAvoidHighProof(preferences.safetyMode.avoidHighProof);
    setDraftAvoidAllergens(preferences.safetyMode.avoidAllergens);
    setDraftAvoidCaffeineAlcohol(preferences.safetyMode.avoidCaffeineAlcohol);
  }, [
    hydrated,
    preferences.stylePreset,
    preferences.dims.alcoholStrength,
    preferences.dims.sweetness,
    preferences.dims.bitterness,
    preferences.safetyMode.avoidHighProof,
    preferences.safetyMode.avoidAllergens,
    preferences.safetyMode.avoidCaffeineAlcohol,
  ]);

  const alcoholWord = useMemo(() => levelWordAlcohol(draftAlcohol), [draftAlcohol]);
  const sweetnessWord = useMemo(() => levelWordSweetness(draftSweetness), [draftSweetness]);
  const bitternessWord = useMemo(() => levelWordBitterness(draftBitterness), [draftBitterness]);

  const hasChanges = useMemo(() => {
    if (!hydrated) return false;
    return (
      draftStyle !== preferences.stylePreset ||
      draftAlcohol !== preferences.dims.alcoholStrength ||
      draftSweetness !== preferences.dims.sweetness ||
      draftBitterness !== preferences.dims.bitterness ||
      draftAvoidHighProof !== preferences.safetyMode.avoidHighProof ||
      draftAvoidAllergens !== preferences.safetyMode.avoidAllergens ||
      draftAvoidCaffeineAlcohol !== preferences.safetyMode.avoidCaffeineAlcohol
    );
  }, [
    hydrated,
    draftStyle,
    draftAlcohol,
    draftSweetness,
    draftBitterness,
    preferences.stylePreset,
    preferences.dims.alcoholStrength,
    preferences.dims.sweetness,
    preferences.dims.bitterness,
    draftAvoidHighProof,
    draftAvoidAllergens,
    draftAvoidCaffeineAlcohol,
    preferences.safetyMode.avoidHighProof,
    preferences.safetyMode.avoidAllergens,
    preferences.safetyMode.avoidCaffeineAlcohol,
  ]);

  const disabled = !hydrated;

  const save = () => {
    if (!hydrated) return;

    setPreferences({
      stylePreset: draftStyle,
      dims: {
        alcoholStrength: draftAlcohol,
        sweetness: draftSweetness,
        bitterness: draftBitterness,
      },
      safetyMode: {
        avoidHighProof: draftAvoidHighProof,
        avoidAllergens: draftAvoidAllergens,
        avoidCaffeineAlcohol: draftAvoidCaffeineAlcohol,
      },
    });

    router.back();
  };

  const reset = () => {
    if (!hydrated) return;
    resetPreferences();
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <Text style={{ fontSize: 22, fontWeight: "900" }}>Your preferences</Text>

        <View
          style={{
            padding: 12,
            borderWidth: 1,
            borderRadius: 12,
            gap: 10,
            opacity: disabled ? 0.7 : 1,
          }}
        >
          <Text style={{ fontWeight: "900" }}>Style</Text>
          <Text style={{ color: "#555" }}>Pick a style you like (you can change it anytime).</Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {STYLE_PRESETS.map((x) => (
              <StyleChip
                key={x.key}
                label={x.label}
                active={x.key === draftStyle}
                onPress={() => setDraftStyle(x.key)}
                disabled={disabled}
              />
            ))}
          </View>
        </View>

        <View
          style={{
            padding: 12,
            borderWidth: 1,
            borderRadius: 12,
            gap: 12,
            opacity: disabled ? 0.7 : 1,
          }}
        >
          <Text style={{ fontWeight: "900" }}>Taste</Text>
          <Text style={{ color: "#555" }}>Slide to adjust intensity (0–3).</Text>

          <View style={{ gap: 14 }}>
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <FontAwesome name="glass" size={16} color="#555" />
                <Text style={{ fontWeight: "800", flex: 1 }}>{alcoholWord}</Text>
                <Text style={{ color: "#777", fontWeight: "800" }}>{Number(draftAlcohol)}</Text>
              </View>

              <Slider
                value={Number(draftAlcohol)}
                minimumValue={0}
                maximumValue={3}
                step={1}
                disabled={disabled}
                onValueChange={(v) => setDraftAlcohol(toLevel3(v))}
              />
            </View>

            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <FontAwesome name="cube" size={16} color="#555" />
                <Text style={{ fontWeight: "800", flex: 1 }}>{sweetnessWord}</Text>
                <Text style={{ color: "#777", fontWeight: "800" }}>{Number(draftSweetness)}</Text>
              </View>

              <Slider
                value={Number(draftSweetness)}
                minimumValue={0}
                maximumValue={3}
                step={1}
                disabled={disabled}
                onValueChange={(v) => setDraftSweetness(toLevel3(v))}
              />
            </View>

            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <FontAwesome name="leaf" size={16} color="#555" />
                <Text style={{ fontWeight: "800", flex: 1 }}>{bitternessWord}</Text>
                <Text style={{ color: "#777", fontWeight: "800" }}>{Number(draftBitterness)}</Text>
              </View>

              <Slider
                value={Number(draftBitterness)}
                minimumValue={0}
                maximumValue={3}
                step={1}
                disabled={disabled}
                onValueChange={(v) => setDraftBitterness(toLevel3(v))}
              />
            </View>
          </View>
        </View>

        <View
          style={{
            padding: 12,
            borderWidth: 1,
            borderRadius: 12,
            gap: 10,
            opacity: disabled ? 0.7 : 1,
          }}
        >
          <Text style={{ fontWeight: "900" }}>Safety Mode</Text>
          <Text style={{ color: "#555" }}>Filter out recommendations that match your safety preferences.</Text>

          <View style={{ gap: 8 }}>
            <SafetyToggleRow
              label="Avoid High Proof"
              value={draftAvoidHighProof}
              onPress={() => setDraftAvoidHighProof((v) => !v)}
              disabled={disabled}
            />
            <SafetyToggleRow
              label="Avoid Allergens"
              value={draftAvoidAllergens}
              onPress={() => setDraftAvoidAllergens((v) => !v)}
              disabled={disabled}
            />
            <SafetyToggleRow
              label="Avoid Caffeine + Alcohol"
              value={draftAvoidCaffeineAlcohol}
              onPress={() => setDraftAvoidCaffeineAlcohol((v) => !v)}
              disabled={disabled}
            />
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={save}
            disabled={disabled || !hasChanges}
            style={{
              flex: 1,
              borderWidth: 1,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: "center",
              backgroundColor: "white",
              opacity: disabled || !hasChanges ? 0.55 : 1,
            }}
          >
            <Text style={{ fontWeight: "900" }}>Save preferences</Text>
          </Pressable>

          <Pressable
            onPress={reset}
            disabled={disabled}
            style={{
              borderWidth: 1,
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 14,
              alignItems: "center",
              opacity: disabled ? 0.55 : 0.9,
            }}
          >
            <Text style={{ fontWeight: "900" }}>Reset</Text>
          </Pressable>
        </View>

        {!hydrated ? (
          <Text style={{ color: "#666" }}>Loading saved preferences…</Text>
        ) : (
          <Text style={{ color: "#666" }}>
            These settings will shape your recommendations and matching.
          </Text>
        )}

        {/* Learned preferences — only shown when logged in */}
        {isLoggedIn && (
          <View
            style={{
              padding: 12,
              borderWidth: 1,
              borderRadius: 12,
              gap: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <FontAwesome name="bar-chart" size={14} color="#555" />
              <Text style={{ fontWeight: "900", flex: 1 }}>Learned from your history</Text>
              <Pressable onPress={refreshLearned} hitSlop={8}>
                <FontAwesome name="refresh" size={14} color={learnedLoading ? "#ccc" : "#555"} />
              </Pressable>
            </View>

            {learnedLoading ? (
              <ActivityIndicator size="small" color="#555" />
            ) : learnedVector && eventCount > 0 ? (
              <>
                <Text style={{ fontSize: 12, color: "#888" }}>
                  Based on {eventCount} rating{eventCount === 1 ? "" : "s"} • updates automatically
                </Text>
                <View style={{ gap: 10 }}>
                  {LEARNED_DISPLAY_DIMS.map(({ key, label }) => {
                    const val = learnedVector[key];
                    if (val === undefined || val === null) return null;
                    return <LearnedDimRow key={key} label={label} value={Number(val)} />;
                  })}
                </View>
              </>
            ) : (
              <Text style={{ fontSize: 13, color: "#888" }}>
                Rate a few cocktails and your taste profile will appear here.
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
