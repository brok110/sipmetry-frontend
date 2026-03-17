import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { PurchaseButton } from "./PurchaseButton";
import { FEATURE_FLAGS } from "@/constants/Features";

interface Ingredient {
  key: string;
  display_name: string;
}

interface MissingIngredientsListProps {
  missingIngredients: Ingredient[];
  recipeId?: string;
  source?: "recommendation" | "missing_ingredients";
}

export function MissingIngredientsList({
  missingIngredients,
  recipeId,
  source = "missing_ingredients",
}: MissingIngredientsListProps) {
  if (missingIngredients.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        缺少 {missingIngredients.length} 樣材料
      </Text>

      {missingIngredients.map((ingredient) => (
        <View key={ingredient.key} style={styles.ingredientRow}>
          <Text style={styles.ingredientName}>{ingredient.display_name}</Text>

          {FEATURE_FLAGS.ENABLE_PURCHASE_INTENT && (
            <PurchaseButton
              ingredientKey={ingredient.key}
              displayName={ingredient.display_name}
              source={source}
              recipeId={recipeId}
              variant="subtle"
              size="small"
            />
          )}
        </View>
      ))}

      {missingIngredients.length === 1 && (
        <Text style={styles.hint}>只差一瓶就能做這杯調酒!</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#fef3c7",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#92400e",
    marginBottom: 8,
  },
  ingredientRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  ingredientName: {
    fontSize: 14,
    color: "#78350f",
    flex: 1,
  },
  hint: {
    fontSize: 12,
    color: "#92400e",
    marginTop: 8,
    fontStyle: "italic",
  },
});
