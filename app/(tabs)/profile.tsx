import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";

import { apiFetch } from "@/lib/api";

import { useAuth } from "@/context/auth";
import OaklandDusk from "@/constants/OaklandDusk";
import { useUnitPreference } from "@/hooks/useUnitPreference";

function ProfileMenuItem({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderWidth: 1,
        borderRadius: 12,
        backgroundColor: "white",
      }}
    >
      <FontAwesome name={icon} size={18} color="#555" />
      <Text style={{ fontWeight: "800", flex: 1 }}>{label}</Text>
      <FontAwesome name="chevron-right" size={14} color="#999" />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { unit: displayUnit, setUnit: setDisplayUnit } = useUnitPreference();
  const userEmail = session?.user?.email;
  const isZh = useMemo(() => {
    try {
      const l = Intl.DateTimeFormat().resolvedOptions().locale;
      return String(l || "en").toLowerCase().startsWith("zh");
    } catch {
      return false;
    }
  }, []);

  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      isZh ? "刪除帳號" : "Delete Account",
      isZh
        ? "此操作不可逆。你的所有資料（庫存、收藏、偏好、互動紀錄）將被永久刪除。確定要繼續嗎？"
        : "This action is irreversible. All your data (inventory, favorites, preferences, interactions) will be permanently deleted. Are you sure?",
      [
        { text: isZh ? "取消" : "Cancel", style: "cancel" },
        {
          text: isZh ? "永久刪除" : "Delete Permanently",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              isZh ? "最後確認" : "Final Confirmation",
              isZh ? "真的要刪除帳號嗎？這無法復原。" : "Really delete your account? This cannot be undone.",
              [
                { text: isZh ? "取消" : "Cancel", style: "cancel" },
                {
                  text: isZh ? "確認刪除" : "Confirm Delete",
                  style: "destructive",
                  onPress: async () => {
                    setDeleting(true);
                    try {
                      const resp = await apiFetch("/account", {
                        session,
                        method: "DELETE",
                      });
                      if (!resp.ok) {
                        const body = await resp.json().catch(() => ({}));
                        throw new Error(body?.error || `HTTP ${resp.status}`);
                      }
                      await signOut();
                    } catch (e: any) {
                      setDeleting(false);
                      Alert.alert(
                        "Error",
                        isZh
                          ? `刪除失敗：${e?.message || "未知錯誤"}`
                          : `Deletion failed: ${e?.message || "Unknown error"}`
                      );
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, [isZh, session, signOut]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      {/* User info */}
      <View style={{ padding: 16, borderWidth: 1, borderRadius: 12, gap: 10, backgroundColor: "white" }}>
        <FontAwesome name="user-circle" size={40} color="#333" style={{ alignSelf: "center" }} />
        {userEmail ? (
          <Text style={{ textAlign: "center", fontWeight: "700", color: "#333" }}>{userEmail}</Text>
        ) : (
          <>
            <Text style={{ textAlign: "center", color: "#888" }}>Not signed in</Text>
            <Pressable
              onPress={() => router.push("/login")}
              style={{
                alignSelf: "center",
                borderWidth: 1,
                borderRadius: 999,
                paddingHorizontal: 20,
                paddingVertical: 10,
                backgroundColor: "#111",
              }}
            >
              <Text style={{ fontWeight: "800", color: "white" }}>Sign In</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Menu items */}
      <View style={{ gap: 10 }}>
        <ProfileMenuItem
          icon="sliders"
          label="Preferences"
          onPress={() => router.push("/profile/preferences")}
        />
        <ProfileMenuItem
          icon="heart"
          label="Favorites"
          onPress={() => router.push("/profile/favorites")}
        />
        {/* Stage 12: Taste DNA — hidden during development
        <ProfileMenuItem
          icon="pie-chart"
          label="Taste DNA"
          onPress={() => router.push("/profile/taste-dna" as any)}
        />
        */}

        {/* Recipe unit toggle */}
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 12,
          paddingHorizontal: 4,
        }}>
          <Text style={{ fontWeight: "700", color: OaklandDusk.text.primary }}>
            Recipe Units
          </Text>
          <View style={{ flexDirection: "row", gap: 0 }}>
            <Pressable
              onPress={() => setDisplayUnit("oz")}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderTopLeftRadius: 10,
                borderBottomLeftRadius: 10,
                borderWidth: 1,
                borderColor: OaklandDusk.bg.border,
                backgroundColor: displayUnit === "oz" ? OaklandDusk.brand.gold : "transparent",
              }}
            >
              <Text style={{
                fontWeight: "800",
                fontSize: 13,
                color: displayUnit === "oz" ? OaklandDusk.bg.void : OaklandDusk.text.tertiary,
              }}>oz</Text>
            </Pressable>
            <Pressable
              onPress={() => setDisplayUnit("ml")}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderTopRightRadius: 10,
                borderBottomRightRadius: 10,
                borderWidth: 1,
                borderLeftWidth: 0,
                borderColor: OaklandDusk.bg.border,
                backgroundColor: displayUnit === "ml" ? OaklandDusk.brand.gold : "transparent",
              }}
            >
              <Text style={{
                fontWeight: "800",
                fontSize: 13,
                color: displayUnit === "ml" ? OaklandDusk.bg.void : OaklandDusk.text.tertiary,
              }}>ml</Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={() => {
            Alert.alert(
              isZh ? "📸 拍照小技巧" : "📸 Photo Tips",
              isZh
                ? "🏷️ 讓酒瓶標籤正面朝向鏡頭，距離約 30-50cm\n\n💡 確保光線充足，標籤文字清晰可見\n\n🍾 一次拍 1-4 瓶，標籤之間不要互相遮擋\n\n🔍 如果某瓶辨識失敗，可以單獨拍那瓶的標籤特寫"
                : "🏷️ Face bottle labels toward the camera, about 30-50cm away\n\n💡 Make sure lighting is good and label text is clearly visible\n\n🍾 Capture 1-4 bottles at a time, don't let labels overlap\n\n🔍 If a bottle isn't recognized, try a close-up of just that label"
            );
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderWidth: 0.5,
            borderRadius: 10,
            borderColor: OaklandDusk.bg.border,
            backgroundColor: OaklandDusk.bg.card,
          }}
        >
          <Text style={{ fontSize: 14 }}>📸</Text>
          <Text style={{ flex: 1, fontSize: 14, color: OaklandDusk.text.primary }}>
            {isZh ? "拍照小技巧" : "Photo tips"}
          </Text>
          <Text style={{ fontSize: 14, color: OaklandDusk.text.tertiary }}>›</Text>
        </Pressable>

        <Pressable
          onPress={() => Linking.openURL("https://brok110.github.io/sipmetry-frontend/privacy")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderWidth: 0.5,
            borderRadius: 10,
            borderColor: OaklandDusk.bg.border,
            backgroundColor: OaklandDusk.bg.card,
          }}
        >
          <Text style={{ fontSize: 14 }}>🔒</Text>
          <Text style={{ flex: 1, fontSize: 14, color: OaklandDusk.text.primary }}>
            {isZh ? "隱私政策" : "Privacy Policy"}
          </Text>
          <Text style={{ fontSize: 14, color: OaklandDusk.text.tertiary }}>›</Text>
        </Pressable>

        <Pressable
          onPress={() => Linking.openURL("https://brok110.github.io/sipmetry-frontend/terms")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderWidth: 0.5,
            borderRadius: 10,
            borderColor: OaklandDusk.bg.border,
            backgroundColor: OaklandDusk.bg.card,
          }}
        >
          <Text style={{ fontSize: 14 }}>📄</Text>
          <Text style={{ flex: 1, fontSize: 14, color: OaklandDusk.text.primary }}>
            {isZh ? "服務條款" : "Terms of Service"}
          </Text>
          <Text style={{ fontSize: 14, color: OaklandDusk.text.tertiary }}>›</Text>
        </Pressable>
      </View>

      {/* Sign out + Delete account */}
      {userEmail && (
        <View style={{ gap: 10 }}>
          <Pressable
            onPress={signOut}
            style={{
              borderWidth: 1,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: "center",
              backgroundColor: "white",
            }}
          >
            <Text style={{ fontWeight: "800", color: "#E11D48" }}>Sign Out</Text>
          </Pressable>

          <Pressable
            onPress={handleDeleteAccount}
            disabled={deleting}
            style={{
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: "center",
              opacity: deleting ? 0.5 : 1,
            }}
          >
            {deleting ? (
              <ActivityIndicator size="small" color="#999" />
            ) : (
              <Text style={{ fontSize: 13, color: "#999" }}>
                {isZh ? "刪除帳號" : "Delete Account"}
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
