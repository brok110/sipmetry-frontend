// components/browse/Badges.tsx
// SAFETY-BADGE (2026-08-13) — badge family per mockup v5
// (sipmetry-safety-badge-mockup-v5.html, shasum 526ff0a8).
// Order arrives pre-sorted from the backend (single authority, buildBadges):
// egg > nuts > dairy > caffeine > high_proof. This component never re-sorts.
// Card level: <BadgeStack> — first badge full (icon + micro label), the rest
// as empty offset plates (Brok 手繪第二稿: no rotation, +10/+6 per layer,
// whole stack shifted left so the tail hugs the card corner).
// Detail level: <BadgeRow> — all badges fully expanded.
// Icons are bundled PNG assets (OTA-safe, no react-native-svg dependency);
// high_proof renders as a "%" DM Mono text glyph.

import React from "react";
import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import OaklandDusk from "@/constants/OaklandDusk";
import { V3 } from "@/constants/v3DesignTokens";

export type BadgeKey = "egg" | "nuts" | "dairy" | "caffeine" | "high_proof";

const LABELS: Record<BadgeKey, string> = {
  egg: "EGG",
  nuts: "NUTS",
  dairy: "DAIRY",
  caffeine: "CAFFEINE",
  high_proof: "HIGH PROOF",
};

const ICONS: Partial<Record<BadgeKey, number>> = {
  egg: require("@/assets/badges/badge_egg.png"),
  nuts: require("@/assets/badges/badge_nuts.png"),
  dairy: require("@/assets/badges/badge_dairy.png"),
  caffeine: require("@/assets/badges/badge_caffeine.png"),
  // high_proof: text glyph, no asset.
};

const GOLD = OaklandDusk.brand.gold;
const IVORY = OaklandDusk.text.primary; // badge 底色(2026-08-14 Brok:帶白底提升可讀)
const INK = OaklandDusk.bg.void;        // badge 前景(字/icon)
const PLATE_STEP_X = 10;
const PLATE_STEP_Y = 6;
const MAX_PLATES = 3;

function isBadgeKey(x: unknown): x is BadgeKey {
  return (
    x === "egg" || x === "nuts" || x === "dairy" || x === "caffeine" || x === "high_proof"
  );
}

export function sanitizeBadges(badges: unknown): BadgeKey[] {
  if (!Array.isArray(badges)) return [];
  return badges.filter(isBadgeKey);
}

function Icon({ k, size }: { k: BadgeKey; size: number }) {
  if (k === "high_proof") {
    return (
      <Text
        style={{
          fontFamily: V3.fonts.monoMedium,
          fontSize: size,
          lineHeight: size + 2,
          color: INK,
        }}
      >
        %
      </Text>
    );
  }
  return (
    <Image
      source={ICONS[k]}
      style={{ width: size, height: size }}
      contentFit="contain"
      tintColor={INK}
    />
  );
}

// ── Card level: first badge full, rest as stacked plates(階梯攤開)──
export function BadgeStack({ badges }: { badges?: unknown }) {
  const list = sanitizeBadges(badges);
  if (list.length === 0) return null;
  const front = list[0];
  const plates = Math.min(list.length - 1, MAX_PLATES);
  return (
    <View pointerEvents="none" style={{ marginRight: plates * PLATE_STEP_X }}>
      {/* 2026-08-14 Brok:錨點移至照片右下 → 階梯鏡射向上攤(往下會被卡緣裁掉),
          尾端仍貼右緣(marginRight 左移整疊)。 */}
      {Array.from({ length: plates }, (_, i) => {
        const step = plates - i; // farthest plate renders first (lowest)
        return (
          <View
            key={`plate-${step}`}
            style={[
              styles.plate,
              {
                transform: [
                  { translateX: PLATE_STEP_X * step },
                  { translateY: -PLATE_STEP_Y * step },
                ],
                zIndex: MAX_PLATES - step,
              },
            ]}
          />
        );
      })}
      <View style={styles.micro}>
        <Icon k={front} size={11} />
        <Text style={styles.microText} numberOfLines={1}>
          {LABELS[front]}
        </Text>
      </View>
    </View>
  );
}

// ── Detail level: all badges expanded, server order preserved ──
export function BadgeRow({ badges }: { badges?: unknown }) {
  const list = sanitizeBadges(badges);
  if (list.length === 0) return null;
  return (
    <View style={styles.row}>
      {list.map((k) => (
        <View key={k} style={styles.full}>
          <Icon k={k} size={13} />
          <Text style={styles.fullText}>{LABELS[k]}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // 疊後板:無內容,與前牌同框線,右下錯位
  plate: {
    ...StyleSheet.absoluteFill,
    backgroundColor: `${IVORY}D9`, // ivory @85%
    borderWidth: 1,
    borderColor: `${GOLD}66`, // gold @40%
    borderRadius: 4,
  },
  // 卡片前牌:icon + 微字
  micro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 20,
    paddingHorizontal: 7,
    backgroundColor: `${IVORY}F2`, // ivory @95%
    borderWidth: 1,
    borderColor: `${GOLD}66`,
    borderRadius: 4,
    zIndex: MAX_PLATES + 1,
  },
  microText: {
    fontFamily: V3.fonts.mono,
    fontSize: 8,
    letterSpacing: 0.96, // 0.12em @ 8px
    color: INK,
    textTransform: "uppercase",
  },
  // 詳情頁全展列
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  full: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: `${IVORY}F2`, // ivory @95%(與卡片同家族)
    borderWidth: 1,
    borderColor: `${GOLD}66`,
    borderRadius: 4,
  },
  fullText: {
    fontFamily: V3.fonts.mono,
    fontSize: 9,
    letterSpacing: 1.62, // 0.18em @ 9px
    color: INK,
    textTransform: "uppercase",
  },
});
