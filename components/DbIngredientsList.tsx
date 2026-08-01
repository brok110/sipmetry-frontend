import React, { memo, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, type ViewStyle } from "react-native";
import OaklandDusk from "@/constants/OaklandDusk";
import Type from "@/constants/typography";
import type { DbRecipeIngredient, IngredientAvailability } from "@/app/recipe";
import type { InventoryItem } from "@/context/inventory";
import type { UnitPreference } from "@/hooks/useUnitPreference";
import { formatOz } from "@/lib/formatOz";

// NOTE: intentionally NOT the same as rowEngine.ts:104's humanizeKey (that
// one does not capitalize) — keep this a separate, local helper.
function humanizeKey(k: string): string {
  const s = String(k || "").trim();
  if (!s) return "";
  return s
    .split("_")
    .filter(Boolean)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

interface DbIngredientsListProps {
  ingredients: DbRecipeIngredient[];
  inventoryInitialized: boolean;
  inventory: InventoryItem[];
  resolveDisplayForIngredientKey: (ingredientKey: string) => { display: string; substitute: boolean };
  ingredientAvailability: Record<string, IngredientAvailability> | null;
  servings: number;
  displayUnit: UnitPreference;
  confirmedStaplesSet: Set<string>;
  onAddToList?: (ingredientKey: string, displayName: string) => void;
  listedKeys: Set<string>;
}

type BandKey = "neutral" | "ready" | "substitute" | "missing";

export const DbIngredientsList = memo(function DbIngredientsList({
  ingredients,
  inventoryInitialized,
  inventory,
  resolveDisplayForIngredientKey,
  ingredientAvailability,
  servings,
  displayUnit,
  confirmedStaplesSet,
  onAddToList,
  listedKeys,
}: DbIngredientsListProps) {
  const rows = useMemo(() => {
    const list = Array.isArray(ingredients) ? ingredients : [];
    if (list.length === 0) return [];

    const sorted = [...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const invByKey: Record<string, number> = {};
    if (inventoryInitialized) {
      for (const inv of inventory) {
        const k = String(inv.ingredient_key ?? "").trim();
        if (k) invByKey[k] = Number(inv.remaining_volume ?? 0);
      }
    }

    return sorted.map((it, i) => {
      const key = String(it?.item ?? "").trim();
      const resolved = resolveDisplayForIngredientKey(key);
      const serverInfo = ingredientAvailability?.[key];
      // Server substitute takes priority over scan-based resolve
      const isSubstitute = serverInfo?.status === "substitute" || resolved.substitute;
      const name = (
        serverInfo?.status === "substitute" && serverInfo.matched_display
          ? serverInfo.matched_display
          : resolved.display || humanizeKey(key) || "unknown"
      ).trim();
      const isOptional = Boolean(it?.is_optional);

      const ml =
        it?.amount_ml === null || it?.amount_ml === undefined || it?.amount_ml === ""
          ? null
          : Number(it.amount_ml);

      const unit = it?.unit ? String(it.unit).trim() : "";

      let amountLabel = "";
      if (Number.isFinite(ml)) {
        const scaledMl = ml! * servings;
        if (displayUnit === "oz") {
          amountLabel = formatOz(scaledMl);
        } else {
          amountLabel = `${scaledMl} ml`;
        }
      } else if (it?.amount_text && String(it.amount_text).trim()) {
        amountLabel = unit ? `${String(it.amount_text).trim()} ${unit}` : String(it.amount_text).trim();
      } else {
        amountLabel = "n/a";
      }

      let availBadge: React.ReactNode = null;

      if (ingredientAvailability && key) {
        // Server-driven availability (SSoT)
        const info = ingredientAvailability[key];
        const needed = Number.isFinite(ml) ? ml! : null;

        if (!info || info.status === "missing") {
          availBadge = <Text style={styles.availMissingText}> ✗ Missing</Text>;
        } else if (info.status === "in_bar") {
          if (needed !== null && info.remaining_volume !== null && info.remaining_volume < needed) {
            availBadge = <Text style={styles.availLowText}> ⚠ Running low ({info.remaining_volume}ml left)</Text>;
          } else {
            availBadge = (
              <Text style={styles.availOkText}>
                {confirmedStaplesSet.has(key) ? " ✓" : " ✓ In your bar"}
              </Text>
            );
          }
        } else if (info.status === "substitute") {
          availBadge = <Text style={styles.availOkText}> ✓ Have {info.matched_display}</Text>;
        }
      } else if (inventoryInitialized && key) {
        // Fallback: no server availability (unauthenticated or fetch failed)
        // Use exact inventory match only — no substitute inference
        const remaining = invByKey[key];
        if (remaining !== undefined) {
          const needed2 = Number.isFinite(ml) ? ml! : null;
          if (needed2 !== null && remaining < needed2) {
            availBadge = <Text style={styles.availLowText}> ⚠ Running low ({remaining}ml left)</Text>;
          } else {
            availBadge = <Text style={styles.availOkText}> ✓ In your bar</Text>;
          }
        }
        // NOTE: Don't show "Missing" in fallback — we lack full matching context
      }

      // Build "Originally: Gin" label for substitute ingredients
      const originalName = isSubstitute ? humanizeKey(key) : "";

      // Derive band color from server availability
      const avail = ingredientAvailability?.[key];
      const bandIsInBar = avail?.status === "in_bar";
      const bandIsSubstitute = avail?.status === "substitute";
      const bandHasData = ingredientAvailability !== null;

      const bandKey: BandKey = !bandHasData
        ? "neutral"
        : bandIsInBar
        ? "ready"
        : bandIsSubstitute
        ? "substitute"
        : "missing";

      return (
        <View key={i} style={styles.row}>
          <View style={ROW_STYLE_BY_BAND[bandKey]}>
            <Text style={styles.name}>
              {name}{isOptional ? <Text style={styles.optionalSuffix}> (optional)</Text> : ""}
            </Text>
            {bandHasData && (
              bandKey === "missing" && onAddToList ? (
                listedKeys.has(key) ? (
                  <Text style={styles.onListText}>✓ On list</Text>
                ) : (
                  <Pressable
                    onPress={() => onAddToList(key, name)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${name} to shopping list`}
                    style={styles.addToListButton}
                  >
                    <Text style={styles.addToListText}>＋ LIST</Text>
                  </Pressable>
                )
              ) : (
                <View style={bandIsInBar ? styles.badgeReady : bandIsSubstitute ? styles.badgeSubstitute : styles.badgeMissing}>
                  <Text style={bandIsInBar ? styles.badgeTextReady : bandIsSubstitute ? styles.badgeTextSubstitute : styles.badgeTextMissing}>
                    {bandIsInBar ? "✓" : bandIsSubstitute ? "alt" : "need"}
                  </Text>
                </View>
              )
            )}
            <Text style={styles.amount}>{amountLabel}</Text>
          </View>
          {isSubstitute && originalName ? (
            <Text style={styles.originallyText}>Originally: {originalName}</Text>
          ) : null}
        </View>
      );
    });
  }, [
    ingredients,
    inventoryInitialized,
    inventory,
    resolveDisplayForIngredientKey,
    ingredientAvailability,
    servings,
    displayUnit,
    confirmedStaplesSet,
    onAddToList,
    listedKeys,
  ]);

  if (rows.length === 0) {
    return <Text style={[Type.caption, { color: OaklandDusk.text.tertiary }]}>(No ingredients)</Text>;
  }

  return <View style={styles.container}>{rows}</View>;
});

const styles = StyleSheet.create({
  container: { gap: 6 },
  row: { gap: 2 },

  rowNeutral: {
    flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: 8, backgroundColor: "rgba(255,255,255,0.02)", borderLeftWidth: 3,
    borderLeftColor: OaklandDusk.bg.border,
  },
  rowReady: {
    flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: 8, backgroundColor: "rgba(255,255,255,0.02)", borderLeftWidth: 3,
    borderLeftColor: OaklandDusk.semantic.ready,
  },
  rowSubstitute: {
    flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: 8, backgroundColor: "rgba(255,255,255,0.02)", borderLeftWidth: 3,
    borderLeftColor: "#D4A030",
  },
  rowMissing: {
    flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: 8, backgroundColor: "rgba(255,255,255,0.02)", borderLeftWidth: 3,
    borderLeftColor: "#C87070",
  },

  name: { flexShrink: 1, fontSize: 12, color: OaklandDusk.text.primary, marginRight: 8 },
  optionalSuffix: { color: OaklandDusk.text.tertiary },
  amount: { fontSize: 12, color: OaklandDusk.text.tertiary, marginLeft: "auto" },

  badgeReady: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, backgroundColor: "rgba(29,158,117,0.1)" },
  badgeSubstitute: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, backgroundColor: "rgba(212,160,48,0.1)" },
  badgeMissing: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, backgroundColor: "rgba(200,112,112,0.1)" },

  badgeTextReady: { fontSize: 9, color: OaklandDusk.semantic.ready },
  badgeTextSubstitute: { fontSize: 9, color: "#D4A030" },
  badgeTextMissing: { fontSize: 9, color: "#C87070" },

  originallyText: { fontSize: 10, color: "#D4A030", marginLeft: 14, marginBottom: 4 },

  availMissingText: { color: OaklandDusk.brand.sundown, fontSize: 13, fontWeight: "500" },
  availLowText: { color: "#D97706", fontSize: 12 },
  availOkText: { color: "#22C55E", fontSize: 12 },

  addToListButton: { borderWidth: 1, borderColor: "#E0A030", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  addToListText: { fontSize: 10, color: "#E0A030" },
  onListText: { fontSize: 10, color: "#22C55E", paddingVertical: 3 },
});

// Must come after `styles` — references styles.* values, not string names.
const ROW_STYLE_BY_BAND: Record<BandKey, ViewStyle> = {
  neutral: styles.rowNeutral,
  ready: styles.rowReady,
  substitute: styles.rowSubstitute,
  missing: styles.rowMissing,
};
