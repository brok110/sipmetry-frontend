import React, { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

// NOTE: expo-blur is not currently installed. To get a true glassmorphic blur
// on iOS, add it: `npx expo install expo-blur`, then swap in <BlurView>
// below following the commented-out snippet.
//
// import { BlurView } from 'expo-blur';

import type { SpotlightColor } from './types';
import { SPOTLIGHT, GLOW_COLORS, GLASS } from './SpotlightTokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IconPosition = 'above' | 'below';

interface GlassIconProps {
  icon: string;
  color: SpotlightColor;
  /** Absolute screen position of the icon center */
  centerX: number;
  centerY: number;
  /** Whether the arrow should point downward (icon above target) or upward (icon below) */
  arrowPosition: IconPosition;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GlassIcon({ icon, color, centerX, centerY, arrowPosition }: GlassIconProps) {
  const glow = GLOW_COLORS[color];
  const size = SPOTLIGHT.ICON_SIZE;
  const arrowSize = 10;

  // Entrance animation: fade + slide up + scale
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(arrowPosition === 'above' ? -8 : 8);
  const scale = useSharedValue(0.88);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: SPOTLIGHT.ENTER_DURATION });
    translateY.value = withSpring(0, SPOTLIGHT.SPRING);
    scale.value = withSpring(1, SPOTLIGHT.SPRING);
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // Position: centered on centerX, offset by half height from centerY.
  const containerStyle = {
    position: 'absolute' as const,
    left: centerX - size / 2,
    top:  centerY - size / 2,
    alignItems: 'center' as const,
  };

  const arrowAbove = arrowPosition === 'above';
  // Arrow points toward the target — downward triangle when icon is above target,
  // upward triangle when icon is below target.
  const arrowStyle = [
    styles.arrow,
    {
      borderColor: GLASS.border,
      backgroundColor: GLASS.bg,
      // Rotate to point in the right direction
      transform: [{ rotate: arrowAbove ? '45deg' : '45deg' }],
      // Position arrow on the bottom edge (icon above) or top edge (icon below)
      ...(arrowAbove
        ? { bottom: -arrowSize / 2, marginBottom: 0 }
        : { top: -arrowSize / 2, marginTop: 0 }),
    },
  ];

  return (
    <Animated.View style={[containerStyle, animStyle]} pointerEvents="none">
      {/* Arrow on top (when icon is below target) */}
      {!arrowAbove && <View style={arrowStyle} />}

      {/*
       * Glass badge
       *
       * iOS with expo-blur installed — replace the inner View with:
       *   <BlurView intensity={40} tint="dark" style={[styles.badge, { borderColor: GLASS.border }]}>
       *     ...children
       *   </BlurView>
       *
       * For now: solid fallback that matches the design on both platforms.
       */}
      <View
        style={[
          styles.badge,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: GLASS.bg,
            borderColor: GLASS.border,
            // Simulate highlight on the top edge (glassmorphism "catch light")
            shadowColor: glow.inner,
            shadowOpacity: Platform.OS === 'ios' ? 0.5 : 0,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 0 },
            elevation: Platform.OS === 'android' ? 4 : 0,
          },
        ]}
      >
        {/* Top highlight border (inner) */}
        <View style={[styles.topHighlight, { borderTopColor: GLASS.borderTop }]} />

        <Text style={styles.iconText}>{icon}</Text>
      </View>

      {/* Arrow on bottom (when icon is above target) */}
      {arrowAbove && <View style={arrowStyle} />}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  badge: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: '10%',
    right: '10%',
    height: 1,
    borderTopWidth: 1,
    borderTopColor: 'transparent',
  },
  iconText: {
    fontSize: 26,
    // Prevent emoji from rendering with OS color profile overrides on Android
    includeFontPadding: false,
  },
  arrow: {
    width: 10,
    height: 10,
    borderWidth: 1,
    // Overlap with badge edge so there's no gap
    marginVertical: -5,
  },
});
