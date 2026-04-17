import React, { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import Svg, { Path, Defs, Filter, FeGaussianBlur } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { TargetRect, SpotlightColor } from './types';
import { SPOTLIGHT, GLOW_COLORS } from './SpotlightTokens';

// Must be outside the component — Reanimated requires a stable animated component
// reference; recreating it on every render causes subtle issues.
const AnimatedPath = Animated.createAnimatedComponent(Path);

// ---------------------------------------------------------------------------
// Helpers (plain functions; called inside worklets by inlining via closure)
// ---------------------------------------------------------------------------

/**
 * Build an SVG rounded-rect path string for the given bounds.
 * Called inside useDerivedValue worklets — keep arithmetic-only, no JS APIs.
 */
function roundedRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  'worklet';
  return (
    `M ${x + r} ${y} ` +
    `H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} ` +
    `V ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} ` +
    `H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} ` +
    `V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SpotlightSvgProps {
  rect: TargetRect;
  color: SpotlightColor;
  /** Controlled externally by SpotlightOverlay — 0 hidden, 1 visible */
  overlayOpacity: SharedValue<number>;
}

export default function SpotlightSvg({ rect, color, overlayOpacity }: SpotlightSvgProps) {
  const { width: W, height: H } = useWindowDimensions();
  const glow = GLOW_COLORS[color];

  // Store screen size as shared values so worklets can read them on the UI thread.
  const screenW = useSharedValue(W);
  const screenH = useSharedValue(H);
  useEffect(() => {
    screenW.value = W;
    screenH.value = H;
  }, [W, H]);

  // Padded cut coordinates — animated to the current rect.
  const cutX = useSharedValue(rect.x - SPOTLIGHT.PAD_X);
  const cutY = useSharedValue(rect.y - SPOTLIGHT.PAD_Y);
  const cutW = useSharedValue(rect.width  + SPOTLIGHT.PAD_X * 2);
  const cutH = useSharedValue(rect.height + SPOTLIGHT.PAD_Y * 2);

  useEffect(() => {
    const timing = { duration: 350 };
    cutX.value = withTiming(rect.x      - SPOTLIGHT.PAD_X,     timing);
    cutY.value = withTiming(rect.y      - SPOTLIGHT.PAD_Y,     timing);
    cutW.value = withTiming(rect.width  + SPOTLIGHT.PAD_X * 2, timing);
    cutH.value = withTiming(rect.height + SPOTLIGHT.PAD_Y * 2, timing);
  }, [rect.x, rect.y, rect.width, rect.height]);

  // ---------------------------------------------------------------------------
  // Derived path strings (computed on UI thread)
  // ---------------------------------------------------------------------------

  /** Full-screen rect + cutout, rendered with fillRule="evenodd" for the dark veil */
  const overlayD = useDerivedValue(() => {
    'worklet';
    const x = cutX.value;
    const y = cutY.value;
    const w = cutW.value;
    const h = cutH.value;
    const screen = `M 0 0 H ${screenW.value} V ${screenH.value} H 0 Z`;
    const cutout = roundedRect(x, y, w, h, SPOTLIGHT.RADIUS);
    return `${screen} ${cutout}`;
  });

  /** Just the cutout rounded rect — used for both glow ring paths */
  const glowD = useDerivedValue(() => {
    'worklet';
    return roundedRect(
      cutX.value,
      cutY.value,
      cutW.value,
      cutH.value,
      SPOTLIGHT.RADIUS,
    );
  });

  // ---------------------------------------------------------------------------
  // Animated props — each AnimatedPath needs its own instance
  // ---------------------------------------------------------------------------

  const overlayProps = useAnimatedProps(() => ({ d: overlayD.value }));
  // Two separate instances referencing the same derived value is fine —
  // each component owns its own native props object.
  const outerGlowProps = useAnimatedProps(() => ({ d: glowD.value }));
  const innerGlowProps = useAnimatedProps(() => ({ d: glowD.value }));

  // Fade the entire SVG in/out via the parent Animated.View opacity.
  const wrapStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  return (
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, wrapStyle]} pointerEvents="none">
      <Svg width={W} height={H}>
        <Defs>
          {/*
           * Gaussian blur filter for the outer glow ring.
           * Renders correctly on iOS. On Android, SVG filter support is
           * best-effort and may not apply — the inner (sharp) glow still shows.
           */}
          <Filter id="spotlight-glow" x="-30%" y="-30%" width="160%" height="160%">
            <FeGaussianBlur stdDeviation={5} />
          </Filter>
        </Defs>

        {/* 1. Dark overlay — evenodd fillRule punches a transparent hole at the cutout */}
        <AnimatedPath
          animatedProps={overlayProps}
          fill={`rgba(0, 0, 0, ${SPOTLIGHT.OVERLAY_OPACITY})`}
          fillRule="evenodd"
        />

        {/* 2. Outer glow — blurred stroke around the cutout edge */}
        <AnimatedPath
          animatedProps={outerGlowProps}
          fill="none"
          stroke={glow.outer}
          strokeWidth={8}
          filter="url(#spotlight-glow)"
        />

        {/* 3. Inner glow — sharp stroke, crisp edge */}
        <AnimatedPath
          animatedProps={innerGlowProps}
          fill="none"
          stroke={glow.inner}
          strokeWidth={1.5}
        />
      </Svg>
    </Animated.View>
  );
}
