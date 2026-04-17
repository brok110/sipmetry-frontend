import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { BackHandler } from 'react-native';
import {
  runOnJS,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { HintDescriptor, TargetRect } from './types';
import { SPOTLIGHT } from './SpotlightTokens';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface SpotlightContextValue {
  show: (hint: HintDescriptor) => void;
  hide: (storageKey?: string) => void;
  activeKey: string | null;
  activeHint: HintDescriptor | null;
  activeRect: TargetRect | null;
  overlayOpacity: SharedValue<number>;
}

const SpotlightContext = createContext<SpotlightContextValue | null>(null);

export function useSpotlight(): SpotlightContextValue {
  const ctx = useContext(SpotlightContext);
  if (!ctx) throw new Error('useSpotlight must be used inside <SpotlightProvider>');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SpotlightProvider({ children }: { children: React.ReactNode }) {
  const [activeHint, setActiveHint] = useState<HintDescriptor | null>(null);
  const [activeRect, setActiveRect] = useState<TargetRect | null>(null);
  const overlayOpacity = useSharedValue(0);

  // Mutable ref: lets hide() read the current key without becoming a dep.
  const activeKeyRef = useRef<string | null>(null);

  const clearActive = useCallback(() => {
    setActiveHint(null);
    setActiveRect(null);
    activeKeyRef.current = null;
  }, []);

  const hide = useCallback(
    (storageKey?: string) => {
      // If a specific key is given, only dismiss if it's still the active one.
      if (storageKey != null && storageKey !== activeKeyRef.current) return;

      overlayOpacity.value = withTiming(
        0,
        { duration: SPOTLIGHT.EXIT_DURATION },
        (finished) => {
          'worklet';
          if (finished) runOnJS(clearActive)();
        },
      );
    },
    [clearActive],
  );

  const show = useCallback((hint: HintDescriptor) => {
    const doShow = async () => {
      // Measure — retry once if the first attempt returns null (layout not ready).
      let rect = await hint.measureFn();
      if (!rect) {
        await new Promise<void>((r) => setTimeout(r, SPOTLIGHT.MEASURE_RETRY));
        rect = await hint.measureFn();
      }
      if (!rect) return; // Still unmeasurable — skip silently rather than crash.

      activeKeyRef.current = hint.storageKey;
      setActiveHint(hint);
      setActiveRect(rect);
      overlayOpacity.value = withTiming(1, { duration: SPOTLIGHT.ENTER_DURATION });
    };

    doShow();
  }, []);

  // Android hardware back button dismisses the active hint.
  useEffect(() => {
    if (!activeHint) return;

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      hide();
      return true; // Prevent default back navigation while hint is visible.
    });
    return () => sub.remove();
  }, [activeHint, hide]);

  return (
    <SpotlightContext.Provider
      value={{
        show,
        hide,
        activeKey: activeKeyRef.current,
        activeHint,
        activeRect,
        overlayOpacity,
      }}
    >
      {children}
    </SpotlightContext.Provider>
  );
}
