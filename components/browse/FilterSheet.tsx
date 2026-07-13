// components/browse/FilterSheet.tsx
// Mode B filter bottom sheet: BASE SPIRIT (single) / STYLE (single) /
// WITHOUT (multi excludes). Controlled component — committed filter state
// lives in bartender.tsx; this sheet edits a draft and hands it back via
// onApply. Follows the ScanSourceSheet modal pattern. The primary button
// carries a live result count (debounced limit=1 fetch); on failure it
// degrades to a countless label and never blocks Apply.

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import OaklandDusk from "@/constants/OaklandDusk";
import { V3 } from "@/constants/v3DesignTokens";
import { useAuth } from "@/context/auth";
import SuggestionList from "@/components/browse/SuggestionList";
import {
  fetchBrowseRecipes,
  fetchSearchSuggestions,
  type SearchSuggestion,
} from "@/lib/browse/browseApi";
import { STYLE_DISPLAY_NAMES } from "@/lib/browse/rowEngine";

export type BrowseFilters = {
  baseSpirit?: string;
  style?: string;
  excludes: string[];
};

type FilterSheetProps = {
  visible: boolean;
  initial: BrowseFilters;
  query: string; // current search text — the live count stacks on it
  onApply: (f: BrowseFilters) => void;
  onClose: () => void;
};

// "none" deliberately omitted (v1 known limitation — no-base as a filter
// reads oddly; backlogged).
const BASE_SPIRITS = ["gin", "whiskey", "rum", "vodka", "tequila", "mezcal", "brandy"];
// Style keys + display copy come from the rowEngine record — single source.
const STYLE_KEYS = Object.keys(STYLE_DISPLAY_NAMES);
const MAX_EXCLUDES = 10; // server cap on exclude= values
const MAX_SUGGEST_ROWS = 5; // keep the sheet on-screen with the keyboard up
const COUNT_DEBOUNCE_MS = 250;
const SUGGEST_DEBOUNCE_MS = 200;
const SUGGEST_LIMIT = 8;

export default function FilterSheet({
  visible,
  initial,
  query,
  onApply,
  onClose,
}: FilterSheetProps) {
  const { session } = useAuth();
  const [draft, setDraft] = useState<BrowseFilters>(initial);
  // null = count unknown (in flight or failed) → countless button label.
  const [count, setCount] = useState<number | null>(null);
  const countSeqRef = useRef(0);
  // Bumped on every completed recount → flashes the button (even when the
  // number itself didn't change).
  const [countNonce, setCountNonce] = useState(0);
  const flashAnim = useRef(new Animated.Value(1)).current;

  const [withoutQuery, setWithoutQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const suggestSeqRef = useRef(0);

  const draftEmpty =
    !draft.baseSpirit && !draft.style && draft.excludes.length === 0;

  // Re-seed the draft from committed filters each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setDraft(initial);
    setWithoutQuery("");
    setSuggestions([]);
  }, [visible, initial]);

  // Live count: draft or query change → debounce → limit=1 fetch for total.
  // Nothing selected and no query → no count (button reads "Done").
  useEffect(() => {
    if (!visible) return;
    if (draftEmpty && !query) {
      countSeqRef.current++;
      setCount(null);
      return;
    }
    const seq = ++countSeqRef.current;
    setCount(null);
    const t = setTimeout(async () => {
      try {
        const data = await fetchBrowseRecipes(session, {
          q: query || undefined,
          limit: 1,
          base_spirit: draft.baseSpirit,
          style: draft.style,
          exclude: draft.excludes.length > 0 ? draft.excludes : undefined,
        });
        if (seq !== countSeqRef.current) return;
        setCount(data.total);
        setCountNonce((n) => n + 1);
      } catch {
        // Count is decorative — stay on the fallback label.
        if (seq !== countSeqRef.current) return;
        setCount(null);
      }
    }, COUNT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [visible, session, query, draft]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recount flash: quick opacity dip on the button each time a count lands.
  useEffect(() => {
    if (countNonce === 0) return;
    flashAnim.setValue(0.4);
    Animated.timing(flashAnim, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [countNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // WITHOUT typeahead: same suggestion pipe as the search bar, narrowed to
  // ingredient/spirit rows and minus already-picked excludes.
  useEffect(() => {
    const q = withoutQuery.trim();
    if (!visible || !q) {
      suggestSeqRef.current++;
      setSuggestions([]);
      return;
    }
    const seq = ++suggestSeqRef.current;
    const t = setTimeout(async () => {
      try {
        const list = await fetchSearchSuggestions(session, q, SUGGEST_LIMIT);
        if (seq !== suggestSeqRef.current) return;
        setSuggestions(
          list
            .filter(
              (s) =>
                (s.type === "ingredient" || s.type === "spirit") &&
                !draft.excludes.includes(
                  s.label.trim().toLowerCase().replace(/\s+/g, "_")
                )
            )
            .slice(0, MAX_SUGGEST_ROWS)
        );
      } catch {
        // Suggestions are best-effort — on failure just show nothing.
        if (seq !== suggestSeqRef.current) return;
        setSuggestions([]);
      }
    }, SUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [visible, withoutQuery, session, draft.excludes]);

  const toggleBaseSpirit = (key: string) =>
    setDraft((d) => ({ ...d, baseSpirit: d.baseSpirit === key ? undefined : key }));

  const toggleStyle = (key: string) =>
    setDraft((d) => ({ ...d, style: d.style === key ? undefined : key }));

  const addExclude = (s: SearchSuggestion) => {
    // Underscored key matches the backend's normalizeKey — multi-word
    // ingredients sent with spaces silently match nothing.
    const key = s.label.trim().toLowerCase().replace(/\s+/g, "_");
    setDraft((d) =>
      d.excludes.includes(key) || d.excludes.length >= MAX_EXCLUDES
        ? d
        : { ...d, excludes: [...d.excludes, key] }
    );
    setWithoutQuery("");
    suggestSeqRef.current++;
    setSuggestions([]);
  };

  const removeExclude = (key: string) =>
    setDraft((d) => ({ ...d, excludes: d.excludes.filter((k) => k !== key) }));

  const atExcludeCap = draft.excludes.length >= MAX_EXCLUDES;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.scrim} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.headerRow}>
              <Text style={[styles.sectionLabel, styles.headerTitle]}>FILTERS</Text>
              <Pressable
                onPress={onClose}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close filters"
              >
                <FontAwesome name="times" size={16} color={OaklandDusk.text.tertiary} />
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>BASE SPIRIT</Text>
            <View style={styles.chipRow}>
              {BASE_SPIRITS.map((key) => {
                const on = draft.baseSpirit === key;
                return (
                  <Pressable
                    key={key}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => toggleBaseSpirit(key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Base spirit ${key}`}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {key.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>STYLE</Text>
            <View style={styles.chipRow}>
              {STYLE_KEYS.map((key) => {
                const on = draft.style === key;
                return (
                  <Pressable
                    key={key}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => toggleStyle(key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Style ${STYLE_DISPLAY_NAMES[key]}`}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {STYLE_DISPLAY_NAMES[key]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>WITHOUT</Text>
            {draft.excludes.length > 0 && (
              <View style={styles.chipRow}>
                {draft.excludes.map((key) => (
                  <Pressable
                    key={key}
                    style={[styles.chip, styles.chipOn]}
                    onPress={() => removeExclude(key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove without ${key}`}
                  >
                    <Text style={[styles.chipText, styles.chipTextOn]}>
                      NO {key.replace(/_/g, " ").toUpperCase()} ✕
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            {!atExcludeCap && (
              <TextInput
                style={styles.withoutInput}
                value={withoutQuery}
                onChangeText={setWithoutQuery}
                placeholder="ingredient to avoid"
                placeholderTextColor={`${OaklandDusk.text.primary}52`}
                selectionColor={OaklandDusk.brand.gold}
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel="Ingredient to avoid"
              />
            )}
            {suggestions.length > 0 && (
              <View style={styles.suggestWrap}>
                <SuggestionList suggestions={suggestions} onPick={addExclude} />
              </View>
            )}

            <View style={styles.footer}>
              <Pressable
                onPress={() => setDraft({ excludes: [] })}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Clear filters"
              >
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
              <Animated.View style={{ opacity: flashAnim }}>
                <Pressable
                  style={styles.applyBtn}
                  onPress={() => {
                    onApply(draft);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Apply filters"
                >
                  <Text style={styles.applyText}>
                    {draftEmpty && !query
                      ? "Done"
                      : count != null
                        ? `Show ${count > 10 ? "10+" : count} cocktails`
                        : "Show cocktails"}
                  </Text>
                </Pressable>
              </Animated.View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: OaklandDusk.bg.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 28,
    width: "100%",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: V3.spacing.chipsGroupGapBottom,
  },
  headerTitle: {
    color: OaklandDusk.text.primary,
    marginBottom: 0, // row spacing owned by headerRow
  },
  sectionLabel: {
    fontFamily: V3.fonts.monoMedium,
    fontSize: 11,
    letterSpacing: 2.2,
    color: OaklandDusk.text.tertiary,
    marginBottom: V3.spacing.chipsLabelGapBottom,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: V3.spacing.chipRowGap,
    marginBottom: V3.spacing.chipsGroupGapBottom,
  },
  chip: {
    paddingHorizontal: V3.spacing.chipPaddingH,
    paddingVertical: V3.spacing.chipPaddingV,
    borderWidth: 1,
    borderColor: `${OaklandDusk.text.primary}1F`, // ivory @12% hairline
    borderRadius: 999,
  },
  chipOn: {
    borderColor: OaklandDusk.brand.gold,
    backgroundColor: `${OaklandDusk.brand.gold}1F`, // gold @12%
  },
  chipText: {
    fontFamily: V3.fonts.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    color: OaklandDusk.text.secondary,
  },
  chipTextOn: {
    color: OaklandDusk.brand.gold,
  },
  withoutInput: {
    backgroundColor: OaklandDusk.bg.surface,
    borderWidth: 1,
    borderColor: `${OaklandDusk.text.primary}12`, // ~7% ivory hairline
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: V3.fonts.mono,
    fontSize: 12,
    letterSpacing: 1.2,
    color: OaklandDusk.text.primary,
  },
  suggestWrap: {
    marginTop: 6,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: OaklandDusk.bg.border,
    marginTop: V3.spacing.chipsGroupGapBottom,
    paddingTop: 16,
  },
  clearText: {
    fontFamily: V3.fonts.mono,
    fontSize: 11,
    letterSpacing: 1.65,
    color: OaklandDusk.text.tertiary,
  },
  applyBtn: {
    backgroundColor: OaklandDusk.brand.gold,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: "center",
  },
  applyText: {
    fontSize: 15,
    fontWeight: "700",
    color: OaklandDusk.bg.void,
  },
});
