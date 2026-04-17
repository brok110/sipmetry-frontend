import { useRef } from 'react';
import { View } from 'react-native';
import type { TargetRect } from './types';

/**
 * Returns a ref to attach to the target View, and a measure() function that
 * resolves to the element's absolute screen coordinates.
 *
 * Uses measureInWindow (not measure) so coordinates are always relative to
 * the device screen — safe to use with the root-level SpotlightOverlay.
 *
 * Attach collapsable={false} to the View on Android so the native view node
 * isn't collapsed away before we try to measure it.
 */
export function useTargetMeasurement() {
  const ref = useRef<View>(null);

  function measure(): Promise<TargetRect | null> {
    return new Promise((resolve) => {
      const node = ref.current;
      if (!node) {
        resolve(null);
        return;
      }
      node.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          resolve({ x, y, width, height });
        } else {
          resolve(null);
        }
      });
    });
  }

  return { ref, measure };
}
