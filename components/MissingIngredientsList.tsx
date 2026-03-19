import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { PurchaseButton } from "./PurchaseButton";
import { FEATURE_FLAGS } from "@/constants/Features";
import OaklandDusk from "@/constants/OaklandDusk";

interface Ingredient {
  key: string;
  display_name: string;
}

interface MissingIngredientsListProps {
  missingIngredients: Ingredient[];
  recipeId?: string;
  recipeTitle?: string;
  source?: "recommendation" | "missing_ingredients";
}

export function MissingIngredientsList({
  missingIngredients,
  recipeId,
  recipeTitle,
  source = "missing_ingredients",
}: MissingIngredientsListProps) {
  if (missingIngredients.length === 0) {
    return null;
  }

  // Single missing ingredient: show prominent "1 ingredient away" card
  if (missingIngredients.length === 1) {
    const ingredient = missingIngredients[0];
    const name = ingredient.display_name
      ? ingredient.display_name.charAt(0).toUpperCase() + ingredient.display_name.slice(1)
      : ingredient.key.replace(/_/g, " ");

    return (
      <View style={styles.singleCard}>
        <Text style={styles.singleCardHeader}>🔓 1 ingredient away!</Text>

        {recipeTitle ? (
          <Text style={styles.singleCardBody}>
            Get <Text style={{ fontWeight: "700" }}>{name}</Text> to make {recipeTitle}
          </Text>
        ) : (
          <Text style={styles.singleCardBody}>
            Just <Text style={{ fontWeight: "700" }}>{name}</Text> away from this cocktail
          </Text>
        )}

        {FEATURE_FLAGS.ENABLE_PURCHASE_INTENT && (
          <View style={styles.singleCardButton}>
            <PurchaseButton
              ingredientKey={ingredient.key}
              displayName={name}
              source={source}
              recipeId={recipeId}
              variant="primary"
              size="medium"
            />
          </View>
        )}
      </View>
    );
  }

  // Multiple missing ingredients: compact list
  return (
    <View style={styles.container}>
      {missingIngredients.map((ingredient) => {
        const name = ingredient.display_name
          ? ingredient.display_name.charAt(0).toUpperCase() + ingredient.display_name.slice(1)
          : ingredient.key.replace(/_/g, " ");
        return (
          <View key={ingredient.key} style={styles.ingredientRow}>
            <Text style={styles.ingredientName}>{name}</Text>

            {FEATURE_FLAGS.ENABLE_PURCHASE_INTENT && (
              <PurchaseButton
                ingredientKey={ingredient.key}
                displayName={name}
                source={source}
                recipeId={recipeId}
                variant="subtle"
                size="small"
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Single missing ingredient — prominent card
  singleCard: {
    marginTop: 8,
    padding: 14,
    backgroundColor: OaklandDusk.brand.tagBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: OaklandDusk.brand.gold,
    gap: 8,
  },
  singleCardHeader: {
    fontSize: 15,
    fontWeight: "800",
    color: OaklandDusk.brand.gold,
  },
  singleCardBody: {
    fontSize: 14,
    color: OaklandDusk.text.secondary,
    lineHeight: 20,
  },
  singleCardButton: {
    marginTop: 4,
  },

  // Multiple missing ingredients — compact list
  container: {
    marginTop: 8,
    padding: 12,
    backgroundColor: OaklandDusk.bg.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: OaklandDusk.bg.border,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: OaklandDusk.text.secondary,
    marginBottom: 6,
  },
  ingredientRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  ingredientName: {
    fontSize: 13,
    color: OaklandDusk.text.primary,
    flex: 1,
  },
  hint: {
    fontSize: 12,
    color: OaklandDusk.text.tertiary,
    marginTop: 6,
    fontStyle: "italic",
  },
});
