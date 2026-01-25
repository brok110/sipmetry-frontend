import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
    FlavorLevel,
    levelWordAlcohol,
    levelWordBitterness,
    levelWordSweetness,
    StylePreset,
    usePreferences,
} from "@/context/preferences";

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

export default function TabZeroPreferencesScreen() {
  const router = useRouter();
  const navigation = useNavigation<any>();

  useEffect(() => {
    navigation?.setOptions?.({ title: "Preferences" });
  }, [navigation]);

  const { preferences, setPreferences, resetPreferences, hydrated } = usePreferences();

  const [draftStyle, setDraftStyle] = useState<StylePreset>(preferences.stylePreset);
  const [draftAlcohol, setDraftAlcohol] = useState<FlavorLevel>(preferences.dims.alcoholStrength);
  const [draftSweetness, setDraftSweetness] = useState<FlavorLevel>(preferences.dims.sweetness);
  const [draftBitterness, setDraftBitterness] = useState<FlavorLevel>(preferences.dims.bitterness);

  useEffect(() => {
    if (!hydrated) return;
    setDraftStyle(preferences.stylePreset);
    setDraftAlcohol(preferences.dims.alcoholStrength);
    setDraftSweetness(preferences.dims.sweetness);
    setDraftBitterness(preferences.dims.bitterness);
  }, [
    hydrated,
    preferences.stylePreset,
    preferences.dims.alcoholStrength,
    preferences.dims.sweetness,
    preferences.dims.bitterness,
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
      draftBitterness !== preferences.dims.bitterness
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
    });

    router.replace("/(tabs)");
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
          <Text style={{ color: "#555" }}>
            Tap a chip to adjust intensity (cycles through 4 levels).
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <TasteChip
              icon="glass"
              label={alcoholWord}
              onPress={() => setDraftAlcohol((v) => cycleLevel(v))}
              disabled={disabled}
            />
            <TasteChip
              icon="cube"
              label={sweetnessWord}
              onPress={() => setDraftSweetness((v) => cycleLevel(v))}
              disabled={disabled}
            />
            <TasteChip
              icon="leaf"
              label={bitternessWord}
              onPress={() => setDraftBitterness((v) => cycleLevel(v))}
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
      </ScrollView>
    </View>
  );
}