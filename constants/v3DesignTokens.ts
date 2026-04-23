// constants/v3DesignTokens.ts
// Design tokens extracted from v3 bartender mockup.
// Used by Round 3 bartender feed-first rewrite (Stages 2a-4).
// Note: React Native letterSpacing is in px, not em.
// Conversion: letterSpacing_px = fontSize × em_value

export const V3 = {
  // Colors (align with existing OaklandDusk where possible)
  colors: {
    gold: "#C9A458",
    goldDeep: "#9F7F3E",
    goldSoft: "rgba(201, 164, 88, 0.12)",
    goldLine: "rgba(201, 164, 88, 0.28)",
    goldFaint: "rgba(201, 164, 88, 0.08)",
    void: "#07060E",
    card: "#0E0B1A",
    cardRaised: "#141023",
    text: "#EDE6D6",
    textDim: "rgba(237, 230, 214, 0.58)",
    textFaint: "rgba(237, 230, 214, 0.32)",
    textGhost: "rgba(237, 230, 214, 0.18)",
    danger: "rgba(184, 84, 80, 0.85)",
  },
  // Font families (must match useFonts names in app/_layout.tsx)
  fonts: {
    bebas: "BebasNeue",
    cormorant: "CormorantGaramond",
    mono: "DMMono",
    monoMedium: "DMMonoMedium",
  },
  // Typography presets
  type: {
    masthead: { fontFamily: "BebasNeue", fontSize: 13, letterSpacing: 4.55, color: "#C9A458" },
    mastheadMeta: { fontFamily: "CormorantGaramond", fontStyle: "italic" as const, fontSize: 13 },
    pourCounter: { fontFamily: "DMMono", fontSize: 9, letterSpacing: 3.15 },
    drinkName: { fontFamily: "BebasNeue", fontSize: 48, letterSpacing: 1.92, lineHeight: 45.6 },
    drinkIngredients: { fontFamily: "DMMono", fontSize: 10, letterSpacing: 2.2 },
    drinkExplain: { fontFamily: "DMMono", fontSize: 11, letterSpacing: 1.32 },
    barStatus: { fontFamily: "CormorantGaramond", fontStyle: "italic" as const, fontSize: 14 },
    seeRecipe: { fontFamily: "DMMono", fontSize: 11, letterSpacing: 3.3 },
    actionLabel: { fontFamily: "DMMono", fontSize: 8, letterSpacing: 1.2 },
    indexKicker: { fontFamily: "DMMono", fontSize: 9, letterSpacing: 3.6 },
    indexTitle: { fontFamily: "BebasNeue", fontSize: 26, letterSpacing: 1.56 },
    indexSub: { fontFamily: "CormorantGaramond", fontStyle: "italic" as const, fontSize: 14 },
    filterToggle: { fontFamily: "DMMono", fontSize: 10, letterSpacing: 2.5 },
    chipLabel: { fontFamily: "DMMono", fontSize: 8, letterSpacing: 2.4 },
    chip: { fontFamily: "DMMono", fontSize: 10, letterSpacing: 1.2 },
    entryNum: { fontFamily: "DMMono", fontSize: 9, letterSpacing: 1.35 },
    entryName: { fontFamily: "BebasNeue", fontSize: 18, letterSpacing: 0.72 },
    entryIngr: { fontFamily: "DMMono", fontSize: 9, letterSpacing: 1.17 },
    entryExplain: { fontFamily: "DMMono", fontSize: 9, letterSpacing: 0.9 },
    entryStatus: { fontFamily: "CormorantGaramond", fontStyle: "italic" as const, fontSize: 12 },
    personalizeTitle: { fontFamily: "BebasNeue", fontSize: 14, letterSpacing: 1.4 },
    personalizeSub: { fontFamily: "DMMono", fontSize: 9, letterSpacing: 2.25 },
  },
  spacing: {
    spreadPaddingH: 30,
    spreadPaddingTop: 40,
    spreadPaddingBottom: 28,
    indexPaddingH: 26,
    indexPaddingTop: 44,
    indexPaddingBottom: 32,
    drinkSize: 260,      // hero thumbnail size
    entryVizW: 60,       // index entry thumbnail width
    entryVizH: 75,       // index entry thumbnail height
    // Stage 3b: chips panel layout
    chipsPanelMarginTop:    16,  // mockup .chips-panel.open margin-top
    chipsPanelMarginBottom: 20,  // mockup .chips-panel.open margin-bottom
    chipsGroupGapBottom:    14,  // mockup .chips-group margin-bottom
    chipsLabelGapBottom:     8,  // mockup .chips-label margin-bottom
    chipRowGap:              6,  // mockup .chip-row gap
    chipPaddingH:           13,  // mockup .chip padding horizontal
    chipPaddingV:            7,  // mockup .chip padding vertical
    filterDisclosureMarginB: 24, // mockup .filter-disclosure margin-bottom
  },
};
