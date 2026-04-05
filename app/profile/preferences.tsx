import FontAwesome from "@expo/vector-icons/FontAwesome";
import Slider from "@react-native-community/slider";
import OaklandDusk from "@/constants/OaklandDusk";
import { useNavigation } from "@react-navigation/native";
import React, { useEffect, useMemo, useState } from "react";
import HintBubble, { GUIDE_KEYS, dismissGuide, isGuideDismissed } from "@/components/GuideBubble";
import { ActivityIndicator, Animated, Pressable, ScrollView, Text, View } from "react-native";

import { apiFetch } from "@/lib/api";
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

const LEARNED_DISPLAY_DIMS: { key: string; label: string }[] = [
  { key: "sweetness",      label: "Sweetness" },
  { key: "sourness",       label: "Sourness" },
  { key: "bitterness",     label: "Bitterness" },
  { key: "alcoholStrength", label: "Alcohol" },
  { key: "fruity",         label: "Fruity" },
  { key: "smoky",          label: "Smoky" },
];

const SLIDER_DIM_MAP: Record<string, "sweetness" | "bitterness" | "alcoholStrength"> = {
  sweetness: "sweetness",
  bitterness: "bitterness",
  alcoholStrength: "alcoholStrength",
};

function LearnedDimRow({ label, value }: { label: string; value: number }) {
  const pct = Math.round((value / 5) * 100);
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: OaklandDusk.text.primary }}>{label}</Text>
        <Text style={{ fontSize: 12, color: OaklandDusk.text.tertiary }}>{value.toFixed(1)}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: OaklandDusk.bg.border, overflow: "hidden" }}>
        <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: OaklandDusk.brand.gold }} />
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
        borderRadius: 16,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderColor: active ? OaklandDusk.brand.gold : OaklandDusk.bg.border,
        backgroundColor: active ? OaklandDusk.brand.tagBg : "transparent",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text style={{ fontWeight: "700", fontSize: 12, color: active ? OaklandDusk.brand.gold : OaklandDusk.text.secondary }}>
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
        borderColor: OaklandDusk.bg.border,
        backgroundColor: OaklandDusk.bg.surface,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <FontAwesome name={icon} size={16} color={OaklandDusk.text.secondary} />
      <Text style={{ fontWeight: "700", color: OaklandDusk.text.primary }}>{label}</Text>
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
        borderColor: OaklandDusk.bg.border,
        backgroundColor: OaklandDusk.bg.card,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ fontWeight: "600", color: OaklandDusk.text.primary, flex: 1 }}>{label}</Text>
      <View
        style={{
          width: 44,
          height: 26,
          borderRadius: 999,
          padding: 3,
          backgroundColor: value ? OaklandDusk.brand.gold : OaklandDusk.bg.surface,
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 999,
            backgroundColor: OaklandDusk.text.primary,
            alignSelf: value ? "flex-end" : "flex-start",
          }}
        />
      </View>
    </Pressable>
  );
}

export default function TabZeroPreferencesScreen() {
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
  const [saving, setSaving] = useState(false);
  const saveButtonOpacity = React.useRef(new Animated.Value(1)).current;
  const [draftAvoidCaffeineAlcohol, setDraftAvoidCaffeineAlcohol] = useState<boolean>(
    preferences.safetyMode.avoidCaffeineAlcohol
  );

  // Guide bubble state (Stage 7 — guide #11)
  const [guidePrefsStyleVisible, setGuidePrefsStyleVisible] = useState(false);

  useEffect(() => {
    isGuideDismissed(GUIDE_KEYS.PREFS_STYLE).then((d) => setGuidePrefsStyleVisible(!d));
  }, []);

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

  const draftSliderValues: Record<string, number> = useMemo(
    () => ({
      sweetness: Number(draftSweetness),
      bitterness: Number(draftBitterness),
      alcoholStrength: Number(draftAlcohol),
    }),
    [draftSweetness, draftBitterness, draftAlcohol]
  );

  const mergedLearnedVector = useMemo(() => {
    if (!learnedVector) return null;

    const merged: Record<string, number> = {};

    for (const { key } of LEARNED_DISPLAY_DIMS) {
      const learnedVal = Number(learnedVector[key] ?? 2.5);

      if (key in SLIDER_DIM_MAP) {
        const sliderNorm = (draftSliderValues[key] / 3) * 5;
        merged[key] = Math.max(0, Math.min(5, sliderNorm * 0.6 + learnedVal * 0.4));
      } else {
        merged[key] = learnedVal;
      }
    }

    return merged;
  }, [learnedVector, draftSliderValues]);

  const disabled = !hydrated;

  const save = () => {
    if (!hydrated || saving) return;
    setSaving(true);

    Animated.sequence([
      Animated.timing(saveButtonOpacity, {
        toValue: 0.3,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(saveButtonOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    const newPrefs = {
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
    };

    setPreferences(newPrefs);

    if (session?.access_token) {
      const toScale5 = (v: number) => Math.round((v / 3) * 5 * 10) / 10;
      apiFetch("/preferences/save", {
        session,
        method: "POST",
        body: {
          manual_vector: {
            sweetness: toScale5(draftSweetness),
            bitterness: toScale5(draftBitterness),
            alcoholStrength: toScale5(draftAlcohol),
          },
          safety_mode: newPrefs.safetyMode,
        },
      }).catch((e) => console.warn("[preferences/save] sync failed:", e?.message));
    }

    setTimeout(() => setSaving(false), 800);
  };

  const reset = () => {
    if (!hydrated) return;
    resetPreferences();
  };

  return (
    <View style={{ flex: 1, backgroundColor: OaklandDusk.bg.void }}>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 30 }}>
        <Text style={{ fontSize: 20, fontWeight: "700", color: OaklandDusk.text.primary }}>Taste profile</Text>

        {/* Flavor card */}
        <View style={{ position: "relative" }}>
          <HintBubble
            storageKey={GUIDE_KEYS.PREFS_STYLE}
            visible={guidePrefsStyleVisible}
            onDismiss={() => setGuidePrefsStyleVisible(false)}
            hintType="tap"
            hintColor="skyblue"
          />
          <View
            style={{
              padding: 10,
              borderWidth: 1,
              borderColor: OaklandDusk.bg.border,
              borderRadius: 12,
              backgroundColor: OaklandDusk.bg.card,
              gap: 6,
              opacity: disabled ? 0.7 : 1,
            }}
          >
            <Text style={{ fontWeight: "700", fontSize: 13, color: OaklandDusk.text.primary }}>Flavor</Text>
            <Text style={{ color: OaklandDusk.text.secondary, fontSize: 12 }}>Pick a flavor you like (you can change it anytime).</Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {STYLE_PRESETS.map((x) => (
                <StyleChip
                  key={x.key}
                  label={x.label}
                  active={x.key === draftStyle}
                  onPress={() => {
                    dismissGuide(GUIDE_KEYS.PREFS_STYLE);
                    setGuidePrefsStyleVisible(false);
                    setDraftStyle(x.key);
                  }}
                  disabled={disabled}
                />
              ))}
            </View>
          </View>
        </View>

        {/* Taste card */}
        <View
          style={{
            padding: 10,
            borderWidth: 1,
            borderColor: OaklandDusk.bg.border,
            borderRadius: 12,
            backgroundColor: OaklandDusk.bg.card,
            gap: 6,
            opacity: disabled ? 0.7 : 1,
          }}
        >
          <Text style={{ fontWeight: "700", fontSize: 13, color: OaklandDusk.text.primary }}>Taste</Text>
          <Text style={{ color: OaklandDusk.text.secondary, fontSize: 12 }}>Slide to adjust intensity (0–3).</Text>

          <View style={{ gap: 8 }}>
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <FontAwesome name="glass" size={14} color={OaklandDusk.text.secondary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "600", fontSize: 13, color: OaklandDusk.text.primary }}>Alcohol Strength</Text>
                  <Text style={{ fontSize: 11, color: OaklandDusk.text.secondary }}>{alcoholWord}</Text>
                </View>
                <Text style={{ color: OaklandDusk.text.tertiary, fontWeight: "700" }}>{Number(draftAlcohol)}</Text>
              </View>
              <Slider
                value={Number(draftAlcohol)}
                minimumValue={0}
                maximumValue={3}
                step={1}
                disabled={disabled}
                minimumTrackTintColor={OaklandDusk.brand.gold}
                maximumTrackTintColor={OaklandDusk.bg.border}
                onValueChange={(v) => setDraftAlcohol(toLevel3(v))}
              />
            </View>

            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <FontAwesome name="cube" size={14} color={OaklandDusk.text.secondary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "600", fontSize: 13, color: OaklandDusk.text.primary }}>Sweetness</Text>
                  <Text style={{ fontSize: 11, color: OaklandDusk.text.secondary }}>{sweetnessWord}</Text>
                </View>
                <Text style={{ color: OaklandDusk.text.tertiary, fontWeight: "700" }}>{Number(draftSweetness)}</Text>
              </View>
              <Slider
                value={Number(draftSweetness)}
                minimumValue={0}
                maximumValue={3}
                step={1}
                disabled={disabled}
                minimumTrackTintColor={OaklandDusk.brand.gold}
                maximumTrackTintColor={OaklandDusk.bg.border}
                onValueChange={(v) => setDraftSweetness(toLevel3(v))}
              />
            </View>

            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <FontAwesome name="leaf" size={14} color={OaklandDusk.text.secondary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "600", fontSize: 13, color: OaklandDusk.text.primary }}>Bitterness</Text>
                  <Text style={{ fontSize: 11, color: OaklandDusk.text.secondary }}>{bitternessWord}</Text>
                </View>
                <Text style={{ color: OaklandDusk.text.tertiary, fontWeight: "700" }}>{Number(draftBitterness)}</Text>
              </View>
              <Slider
                value={Number(draftBitterness)}
                minimumValue={0}
                maximumValue={3}
                step={1}
                disabled={disabled}
                minimumTrackTintColor={OaklandDusk.brand.gold}
                maximumTrackTintColor={OaklandDusk.bg.border}
                onValueChange={(v) => setDraftBitterness(toLevel3(v))}
              />
            </View>
          </View>
        </View>

        {/* Safety Mode card */}
        <View
          style={{
            padding: 10,
            borderWidth: 1,
            borderColor: OaklandDusk.bg.border,
            borderRadius: 12,
            backgroundColor: OaklandDusk.bg.card,
            gap: 6,
            opacity: disabled ? 0.7 : 1,
          }}
        >
          <Text style={{ fontWeight: "700", fontSize: 13, color: OaklandDusk.text.primary }}>Safety Mode</Text>
          <Text style={{ color: OaklandDusk.text.secondary, fontSize: 12 }}>Filter out recommendations based on safety preferences.</Text>

          <View style={{ gap: 4 }}>
            <SafetyToggleRow
              label="Avoid Strong Drinks"
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

        {/* Save / Reset */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Animated.View style={{ flex: 1, opacity: saveButtonOpacity }}>
            <Pressable
              onPress={save}
              disabled={disabled || !hasChanges || saving}
              style={{
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: "center",
                backgroundColor: OaklandDusk.brand.gold,
                opacity: disabled || !hasChanges ? 0.35 : 1,
              }}
            >
              <Text style={{ fontWeight: "700", fontSize: 13, color: OaklandDusk.bg.void }}>
                {saving ? "Saved ✓" : "Save preferences"}
              </Text>
            </Pressable>
          </Animated.View>

          <Pressable
            onPress={reset}
            disabled={disabled}
            style={{
              borderWidth: 1,
              borderColor: OaklandDusk.bg.border,
              borderRadius: 10,
              paddingVertical: 10,
              paddingHorizontal: 14,
              alignItems: "center",
              backgroundColor: OaklandDusk.bg.card,
              opacity: disabled ? 0.55 : 0.9,
            }}
          >
            <Text style={{ fontWeight: "600", fontSize: 13, color: OaklandDusk.text.secondary }}>Reset</Text>
          </Pressable>
        </View>

        {!hydrated ? (
          <Text style={{ color: OaklandDusk.text.tertiary }}>Loading saved preferences…</Text>
        ) : null}

        {false && isLoggedIn && (
          <View
            style={{
              padding: 12,
              borderWidth: 1,
              borderColor: OaklandDusk.bg.border,
              borderRadius: 12,
              backgroundColor: OaklandDusk.bg.card,
              gap: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <FontAwesome name="bar-chart" size={14} color={OaklandDusk.text.secondary} />
              <Text style={{ fontWeight: "700", color: OaklandDusk.text.primary, flex: 1 }}>Learned from your history</Text>
              <Pressable onPress={refreshLearned} hitSlop={8}>
                <FontAwesome name="refresh" size={14} color={learnedLoading ? OaklandDusk.text.disabled : OaklandDusk.text.secondary} />
              </Pressable>
            </View>

            {learnedLoading ? (
              <ActivityIndicator size="small" color={OaklandDusk.brand.gold} />
            ) : learnedVector && eventCount > 0 ? (
              <>
                <Text style={{ fontSize: 12, color: OaklandDusk.text.tertiary }}>
                  Based on {eventCount} rating{eventCount === 1 ? "" : "s"} • updates automatically
                </Text>
                <View style={{ gap: 10 }}>
                  {LEARNED_DISPLAY_DIMS.map(({ key, label }) => {
                    const val = mergedLearnedVector?.[key];
                    if (val === undefined || val === null) return null;
                    return <LearnedDimRow key={key} label={label} value={Number(val)} />;
                  })}
                </View>
              </>
            ) : (
              <Text style={{ fontSize: 13, color: OaklandDusk.text.tertiary }}>
                Rate a few cocktails and your taste profile will appear here.
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
