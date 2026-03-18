import React from "react";
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { usePurchaseIntent } from "@/hooks/usePurchaseIntent";

interface PurchaseButtonProps {
  ingredientKey: string;
  displayName: string;
  source: "recommendation" | "missing_ingredients" | "my_bar";
  recipeId?: string;
  variant?: "primary" | "secondary" | "subtle";
  size?: "small" | "medium" | "large";
}

export function PurchaseButton({
  ingredientKey,
  displayName,
  source,
  recipeId,
  variant = "primary",
  size = "medium",
}: PurchaseButtonProps) {
  const { trackAndOpenPurchaseLink, loading } = usePurchaseIntent();

  const handlePress = () => {
    trackAndOpenPurchaseLink({
      ingredientKey,
      source,
      recipeId,
    });
  };

  const buttonText = `Find ${displayName}`;

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: loading }}
      style={({ pressed }) => [
        styles.button,
        variantStyles[variant],
        sizeStyles[size],
        pressed && styles.pressed,
        loading && styles.loading,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          testID="activity-indicator"
          color={variant === "subtle" ? "#374151" : "#fff"}
          size="small"
        />
      ) : (
        <Text style={[styles.buttonText, textStyles[variant], textSizeStyles[size]]}>
          {buttonText}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  pressed: {
    opacity: 0.8,
  },
  loading: {
    opacity: 0.6,
  },
  buttonText: {
    fontWeight: "600",
  },
});

const variantStyles: Record<string, ViewStyle> = {
  primary: {
    backgroundColor: "#059669",
  },
  secondary: {
    backgroundColor: "#0284c7",
  },
  subtle: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
};

const sizeStyles: Record<string, ViewStyle> = {
  small: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  medium: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  large: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
};

const textStyles: Record<string, TextStyle> = {
  primary: {
    color: "#fff",
  },
  secondary: {
    color: "#fff",
  },
  subtle: {
    color: "#374151",
  },
};

const textSizeStyles: Record<string, TextStyle> = {
  small: {
    fontSize: 12,
  },
  medium: {
    fontSize: 14,
  },
  large: {
    fontSize: 16,
  },
};
