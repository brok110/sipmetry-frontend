import { useState, useCallback } from "react";
import { Linking, Alert } from "react-native";
import { useAuth } from "@/context/auth";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface PurchaseIntentParams {
  ingredientKey: string;
  source: "recommendation" | "missing_ingredients" | "my_bar";
  recipeId?: string;
}

interface PurchaseLinkResponse {
  purchase_link: string;
  ingredient: string;
  retailer: string;
  region: string;
  has_affiliate: boolean;
}

export function usePurchaseIntent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const trackAndOpenPurchaseLink = useCallback(
    async ({ ingredientKey, source, recipeId }: PurchaseIntentParams) => {
      if (!user?.id) {
        Alert.alert("請先登入", "需要登入才能查看購買連結");
        return;
      }

      if (!API_URL) {
        Alert.alert("設定錯誤", "API URL 未設定");
        return;
      }

      setLoading(true);

      try {
        // Step 1: Track purchase intent (fire-and-forget style, but await for reliability)
        const trackResponse = await fetch(
          `${API_URL}/api/track-purchase-intent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: user.id,
              ingredient_key: ingredientKey,
              source,
              recipe_id: recipeId,
            }),
          }
        );

        if (!trackResponse.ok) {
          console.warn(
            "[usePurchaseIntent] tracking failed:",
            trackResponse.status
          );
          // Continue anyway — don't block the user from buying
        }

        // Step 2: Get purchase link
        const linkResponse = await fetch(
          `${API_URL}/api/purchase-link/${encodeURIComponent(ingredientKey)}?region=TW&user_id=${user.id}`
        );

        if (!linkResponse.ok) {
          throw new Error("Failed to get purchase link");
        }

        const data: PurchaseLinkResponse = await linkResponse.json();

        // Step 3: Open link in browser
        const canOpen = await Linking.canOpenURL(data.purchase_link);

        if (canOpen) {
          await Linking.openURL(data.purchase_link);
        } else {
          Alert.alert(
            "無法開啟連結",
            `請手動搜尋: ${data.ingredient}\n零售商: ${data.retailer}`
          );
        }
      } catch (error) {
        console.error("[usePurchaseIntent] error:", error);
        Alert.alert("發生錯誤", "無法開啟購買頁面,請稍後再試");
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  return {
    trackAndOpenPurchaseLink,
    loading,
  };
}
