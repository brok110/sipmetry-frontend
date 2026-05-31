import { SPOTLIGHT } from './SpotlightTokens';
import type { TargetRect } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IconPosition = 'above' | 'below' | 'center';

// ---------------------------------------------------------------------------
// Pure helpers (no React, no side-effects — easy to unit-test)
// ---------------------------------------------------------------------------

/**
 * Resolve the icon badge position for this hint.
 * - swipe hints always center the badge on the target (the finger is ON the target).
 * - tap hints respect the explicit `requested` override, falling back to auto
 *   (above when target is in the bottom 40% of screen, else below).
 */
export function resolveIconPosition(
  rect: TargetRect,
  screenH: number,
  requested: 'above' | 'below' | 'auto',
  hintType: 'tap' | 'swipe',
): IconPosition {
  if (hintType === 'swipe') return 'center';
  if (requested !== 'auto') return requested;
  return rect.y + rect.height > screenH * 0.6 ? 'above' : 'below';
}

/**
 * Compute the absolute screen center {x, y} of the icon badge.
 * 'center' places the badge over the midpoint of the target rect.
 */
export function iconCenter(
  rect: TargetRect,
  position: IconPosition,
): { x: number; y: number } {
  const cx = rect.x + rect.width / 2;

  if (position === 'center') {
    return { x: cx, y: rect.y + rect.height / 2 };
  }
  if (position === 'above') {
    return {
      x: cx,
      y: rect.y - SPOTLIGHT.PAD_Y - SPOTLIGHT.ICON_GAP - SPOTLIGHT.ICON_SIZE / 2,
    };
  }
  // 'below'
  return {
    x: cx,
    y: rect.y + rect.height + SPOTLIGHT.PAD_Y + SPOTLIGHT.ICON_GAP + SPOTLIGHT.ICON_SIZE / 2,
  };
}

/**
 * Clamp the badge center to the screen so the badge is never clipped at an edge.
 * Uses ICON_SIZE/2 + 8px margin on every side.
 */
export function clampToScreen(
  center: { x: number; y: number },
  screenW: number,
  screenH: number,
): { x: number; y: number } {
  const half = SPOTLIGHT.ICON_SIZE / 2;
  const m = 8;
  return {
    x: Math.min(Math.max(center.x, half + m), screenW - half - m),
    y: Math.min(Math.max(center.y, half + m), screenH - half - m),
  };
}
