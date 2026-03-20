import { useState, useCallback } from "react";
import { Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "@/context/auth";
import { apiFetch } from "@/lib/api";

interface PurchaseIntentParams {
  ingredientKey: string;
  displayName?: string;
  source: "recommendation" | "missing_ingredients" | "my_bar";
  recipeId?: string;
}

export function usePurchaseIntent() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);

  const trackAndOpenPurchaseLink = useCallback(
    async ({ ingredientKey, displayName, source, recipeId }: PurchaseIntentParams) => {
      const searchTerm = displayName || ingredientKey.replace(/_/g, " ");
      const buyUrl = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(searchTerm + " bottle")}`;

      setLoading(true);

      try {
        if (session?.access_token) {
          apiFetch("/affiliate/click", {
            session,
            method: "POST",
            body: { ingredient_key: ingredientKey, source, buy_url: buyUrl },
          }).catch(() => {});
        }

        await WebBrowser.openBrowserAsync(buyUrl);
      } catch (error) {
        console.error("[usePurchaseIntent] error:", error);
        Alert.alert("發生錯誤", "無法開啟購買頁面，請稍後再試");
      } finally {
        setLoading(false);
      }
    },
    [session]
  );

  return {
    trackAndOpenPurchaseLink,
    loading,
  };
}
