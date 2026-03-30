import AsyncStorage from "@react-native-async-storage/async-storage";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Stack, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import OaklandDusk from "@/constants/OaklandDusk";

const ONBOARDING_STORAGE_KEY = "sipmetry_onboarding_complete";

type Step = {
  title: string;
  text: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  accent: string;
};

// 2B. Updated STEPS with new copy and OaklandDusk accent colors
const STEPS: Step[] = [
  {
    title: "Snap your bottles",
    text: "Take a photo — Sipmetry instantly identifies what you have and builds your bar",
    icon: "camera",
    accent: OaklandDusk.brand.gold,
  },
  {
    title: "See what you can make",
    text: "Only cocktails you can actually make right now — no guessing, no missing ingredients",
    icon: "glass",
    accent: OaklandDusk.brand.rust,
  },
  {
    title: "Buy smart, unlock more",
    text: "Sipmetry tells you which one bottle to buy next to unlock the most new cocktails",
    icon: "shopping-cart",
    accent: OaklandDusk.brand.sundown,
  },
];

// 2D. ProgressDots with OaklandDusk colors
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
            backgroundColor: idx === activeIndex ? OaklandDusk.brand.gold : OaklandDusk.bg.border,
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
      router.replace("/(tabs)/bartender");
    }
  };

  const handleResetOnboarding = async () => {
    try {
      await AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY);
    } catch {}
    router.replace("/onboarding");
  };

  return (
    // 2C. Dark background
    <View style={{ flex: 1, backgroundColor: OaklandDusk.bg.void }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ flex: 1, padding: 24, paddingTop: 72, paddingBottom: 36, justifyContent: "space-between" }}>
        <View style={{ gap: 20 }}>
          {/* 2F. Step counter + Skip button */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: OaklandDusk.text.tertiary }}>
              {stepIndex + 1} / {STEPS.length}
            </Text>
            {!isLast && (
              <Pressable onPress={handleGetStarted}>
                <Text style={{ fontSize: 14, color: OaklandDusk.text.tertiary }}>Skip</Text>
              </Pressable>
            )}
          </View>

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
            <FontAwesome name={step.icon} size={48} color={OaklandDusk.bg.void} />
          </View>

          <View style={{ gap: 12 }}>
            {/* 2C. Title and description colors */}
            <Text style={{ fontSize: 32, lineHeight: 38, fontWeight: "900", color: OaklandDusk.text.primary }}>
              {step.title}
            </Text>
            <Text style={{ fontSize: 18, lineHeight: 27, color: OaklandDusk.text.secondary }}>{step.text}</Text>
          </View>
        </View>

        <View style={{ gap: 18 }}>
          <ProgressDots count={STEPS.length} activeIndex={stepIndex} />

          {isLast ? (
            // 2E. Last step CTA button
            <Pressable
              onPress={handleGetStarted}
              disabled={saving}
              style={{
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: "center",
                backgroundColor: OaklandDusk.brand.gold,
                opacity: saving ? 0.7 : 1,
              }}
            >
              {/* 2G. CTA text */}
              <Text style={{ color: OaklandDusk.bg.void, fontWeight: "900", fontSize: 16 }}>
                {saving ? "Loading..." : "Scan my first bottle"}
              </Text>
            </Pressable>
          ) : (
            // 2E. Next button
            <Pressable
              onPress={handleNext}
              style={{
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: "center",
                backgroundColor: OaklandDusk.brand.gold,
              }}
            >
              <Text style={{ color: OaklandDusk.bg.void, fontWeight: "900", fontSize: 16 }}>Next</Text>
            </Pressable>
          )}

          {__DEV__ ? (
            <Pressable onPress={handleResetOnboarding} style={{ alignItems: "center", paddingVertical: 4 }}>
              <Text style={{ fontSize: 13, color: OaklandDusk.text.tertiary, textDecorationLine: "underline" }}>
                Reset Onboarding
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
