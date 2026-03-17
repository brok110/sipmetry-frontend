// Feature Flags for Phase 1: Purchase Intent & Cash Flow Focus
// These flags control which features are visible in the UI.
// Set to false to hide a feature without deleting its code.

export const FEATURE_FLAGS = {
  ENABLE_MOOD_SELECTOR: false, // Hidden: simplify UX for cash flow focus
  ENABLE_PURCHASE_INTENT: true, // Active: purchase tracking & buy links
  ENABLE_SMART_BOTTLE_RECOMMENDATION: false, // Future: smart bottle reco
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag];
}
