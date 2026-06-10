import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import OaklandDusk from "@/constants/OaklandDusk";
import { V3 } from "@/constants/v3DesignTokens";
import { useBartenderRefresh } from "@/context/bartenderRefresh";

type MastheadProps = {
  counter?: { current: number; total: number };
  actions?: React.ReactNode;
};

// Gap below the top safe-area edge. With a native header present this
// adds to insets.top=0 (header consumes the inset); with the header
// hidden it sits below the real status-bar / Dynamic Island inset.
const MASTHEAD_TOP_GAP = 20;

export default function Masthead({ counter, actions }: MastheadProps) {
  const insets = useSafeAreaInsets();
  const { requestBartenderRefresh } = useBartenderRefresh();

  const onLogoPress = () => {
    requestBartenderRefresh();            // bump nonce → BartenderScreen refetches + resets
    router.navigate("/(tabs)/bartender"); // switch to Bartender (no-op if already there)
  };

  return (
    <View style={[styles.masthead, { paddingTop: insets.top + MASTHEAD_TOP_GAP }]}>
      <Pressable
        onPress={onLogoPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Bartender"
        style={({ pressed }) => [styles.logoBtn, pressed && styles.logoBtnPressed]}
      >
        <Image
          source={require("@/assets/images/sipmetry-icon.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </Pressable>
      {counter && (
        <View style={styles.mastheadCounterRow}>
          <Text style={[styles.mastheadCounter, styles.mastheadCounterCur]}>
            {String(counter.current).padStart(2, "0")}
          </Text>
          <Text style={[styles.mastheadCounter, styles.mastheadCounterSep]}>
            {" / "}
          </Text>
          <Text style={styles.mastheadCounter}>
            {String(counter.total).padStart(2, "0")}
          </Text>
        </View>
      )}
      {actions}
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    width: 24,
    height: 24,
  },
  logoBtn: { padding: 6, margin: -6, borderRadius: 8 },
  logoBtnPressed: { opacity: 0.55, transform: [{ scale: 0.9 }] },
  masthead: {
    paddingHorizontal: 26,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mastheadCounterRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  mastheadCounter: {
    fontFamily: V3.fonts.mono,
    fontSize: 11,
    letterSpacing: 3.3,
    color: `${OaklandDusk.text.primary}94`,
    textTransform: "uppercase",
  },
  mastheadCounterCur: {
    color: OaklandDusk.text.primary,
  },
  mastheadCounterSep: {
    color: `${OaklandDusk.text.primary}2E`,
  },
});
