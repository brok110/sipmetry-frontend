import React from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useSpotlight } from './SpotlightContext';
import SpotlightSvg from './SpotlightSvg';
import GlassIcon, { type IconPosition } from './GlassIcon';
import { SPOTLIGHT } from './SpotlightTokens';
import type { TargetRect } from './types';
import { dismissGuide, type GuideKey } from '../GuideBubble';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveIconPosition(
  rect: TargetRect,
  screenHeight: number,
  requested: 'above' | 'below' | 'auto',
): IconPosition {
  if (requested !== 'auto') return requested;
  // Target in the bottom 40% of the screen → icon goes above to stay visible.
  return rect.y + rect.height > screenHeight * 0.6 ? 'above' : 'below';
}

function iconCenter(
  rect: TargetRect,
  position: IconPosition,
): { x: number; y: number } {
  const cx = rect.x + rect.width / 2;

  if (position === 'above') {
    return {
      x: cx,
      y: rect.y - SPOTLIGHT.PAD_Y - SPOTLIGHT.ICON_GAP - SPOTLIGHT.ICON_SIZE / 2,
    };
  }
  return {
    x: cx,
    y: rect.y + rect.height + SPOTLIGHT.PAD_Y + SPOTLIGHT.ICON_GAP + SPOTLIGHT.ICON_SIZE / 2,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SpotlightOverlay() {
  const { activeHint, activeRect, overlayOpacity, hide } = useSpotlight();
  const { height: screenH } = useWindowDimensions();

  // Return null only after clearActive() runs (after fade-out completes), so
  // the SVG opacity animation can finish before this component unmounts.
  if (!activeHint || !activeRect) return null;

  // Persist dismissal to AsyncStorage, fire the screen's onDismiss callback
  // to update React state (which may chain to the next hint), then hide after
  // a short delay so the chained hint has time to call show() before the
  // spotlight context clears activeKey.
  const handleDismiss = () => {
    dismissGuide(activeHint.storageKey as GuideKey);
    activeHint.onDismiss?.();
    setTimeout(() => hide(), 50);
  };

  // Padded cutout bounds used to position the 4 dismiss regions.
  // The cutout area itself has NO touch handler so touches pass through
  // natively to the highlighted element below.
  const px = activeRect.x - SPOTLIGHT.PAD_X;
  const py = activeRect.y - SPOTLIGHT.PAD_Y;
  const pw = activeRect.width  + SPOTLIGHT.PAD_X * 2;
  const ph = activeRect.height + SPOTLIGHT.PAD_Y * 2;

  const iconPos = resolveIconPosition(activeRect, screenH, activeHint.iconPosition);
  const center  = iconCenter(activeRect, iconPos);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/*
       * Dismiss layer — 4 Pressable regions surrounding the cutout.
       * The cutout area is intentionally left uncovered so touches reach the
       * highlighted button below.
       */}
      {/* Top region */}
      <Pressable onPress={handleDismiss} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: py }} />
      {/* Bottom region */}
      <Pressable onPress={handleDismiss} style={{ position: 'absolute', top: py + ph, left: 0, right: 0, bottom: 0 }} />
      {/* Left region (cutout row) */}
      <Pressable onPress={handleDismiss} style={{ position: 'absolute', top: py, left: 0, width: px, height: ph }} />
      {/* Right region (cutout row) */}
      <Pressable onPress={handleDismiss} style={{ position: 'absolute', top: py, left: px + pw, right: 0, height: ph }} />

      {/* SVG overlay — visual only, receives no touches */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <SpotlightSvg
          rect={activeRect}
          color={activeHint.color}
          overlayOpacity={overlayOpacity}
        />
      </View>

      {/* Glass icon badge — rendered if the hint descriptor has an icon */}
      {activeHint.icon != null && (
        <GlassIcon
          icon={activeHint.icon}
          color={activeHint.color}
          centerX={center.x}
          centerY={center.y}
          arrowPosition={iconPos}
        />
      )}
    </View>
  );
}
