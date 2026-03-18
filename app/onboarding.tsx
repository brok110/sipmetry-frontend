import AsyncStorage from "@react-native-async-storage/async-storage";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Stack, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

const ONBOARDING_STORAGE_KEY = "sipmetry_onboarding_complete";

type Step = {
  title: string;
  text: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  accent: string;
};

const STEPS: Step[] = [
  {
    title: "Welcome to Sipmetry",
    text: "Scan your bottles to build your bar",
    icon: "camera",
    accent: "#4F7A63",
  },
  {
    title: "Classic cocktail recommendations",
    text: "Discover classic cocktails you can make with what you already have",
    icon: "glass",
    accent: "#9A6B3A",
  },
  {
    title: "Safety-aware cocktails",
    text: "Avoid high proof, allergens, and caffeine + alcohol",
    icon: "shield",
    accent: "#486A86",
  },
];

function ProgressDots({ count, activeIndex }: { count: number; activeIndex: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
      {Array.from({ length: count }).map((_, idx) => (
        <View
          key={idx}
          style={{
            width: idx === activeIndex ? 24 : 8,
            height: 8,
            borderRadius: 999,
            backgroundColor: idx === activeIndex ? "#111" : "#D4D4D4",
          }}
        />
      ))}
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const step = useMemo(() => STEPS[stepIndex], [stepIndex]);
  const isLast = stepIndex === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) return;
    setStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const handleGetStarted = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    } catch {
      // Continue into the app even if persistence fails.
    } finally {
      router.replace("/(tabs)/scan");
    }
  };

  const handleResetOnboarding = async () => {
    try {
      await AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY);
    } catch {}
    router.replace("/onboarding");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#F7F3EC" }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ flex: 1, padding: 24, paddingTop: 72, paddingBottom: 36, justifyContent: "space-between" }}>
        <View style={{ gap: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: "#666" }}>
            {stepIndex + 1} / {STEPS.length}
          </Text>

          <View
            style={{
              width: 120,
              height: 120,
              borderRadius: 32,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: step.accent,
            }}
          >
            <FontAwesome name={step.icon} size={48} color="#FFF8EE" />
          </View>

          <View style={{ gap: 12 }}>
            <Text style={{ fontSize: 32, lineHeight: 38, fontWeight: "900", color: "#111" }}>
              {step.title}
            </Text>
            <Text style={{ fontSize: 18, lineHeight: 27, color: "#4F4F4F" }}>{step.text}</Text>
          </View>
        </View>

        <View style={{ gap: 18 }}>
          <ProgressDots count={STEPS.length} activeIndex={stepIndex} />

          {isLast ? (
            <View style={{ gap: 12 }}>
              <View style={{ gap: 2, alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: "#666" }}>Next step:</Text>
                <Text style={{ fontSize: 16, fontWeight: "900", color: "#111" }}>Scan your first bottle</Text>
              </View>

              <Pressable
                onPress={handleGetStarted}
                disabled={saving}
                style={{
                  borderRadius: 16,
                  paddingVertical: 16,
                  alignItems: "center",
                  backgroundColor: "#111",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                <Text style={{ color: "#FFF", fontWeight: "900", fontSize: 16 }}>
                  {saving ? "Loading..." : "Get Started"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={handleNext}
              style={{
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: "center",
                backgroundColor: "#111",
              }}
            >
              <Text style={{ color: "#FFF", fontWeight: "900", fontSize: 16 }}>Next</Text>
            </Pressable>
          )}

          {__DEV__ ? (
            <Pressable onPress={handleResetOnboarding} style={{ alignItems: "center", paddingVertical: 4 }}>
              <Text style={{ fontSize: 13, color: "#666", textDecorationLine: "underline" }}>
                Reset Onboarding
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
