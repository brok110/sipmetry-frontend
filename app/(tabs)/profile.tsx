import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";

import { apiFetch } from "@/lib/api";

import { useAuth } from "@/context/auth";
import OaklandDusk from "@/constants/OaklandDusk";
import { useUnitPreference } from "@/hooks/useUnitPreference";

function ProfileRow({
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
        borderRadius: 12,
        backgroundColor: OaklandDusk.bg.card,
      }}
    >
      <FontAwesome name={icon} size={18} color={OaklandDusk.text.secondary} />
      <Text style={{ fontWeight: "600", flex: 1, color: OaklandDusk.text.primary }}>{label}</Text>
      <Text style={{ fontSize: 16, color: OaklandDusk.text.tertiary }}>›</Text>
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
    <ScrollView
      style={{ backgroundColor: OaklandDusk.bg.void }}
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
    >
      {/* Avatar / email card */}
      <View style={{
        padding: 20,
        borderRadius: 14,
        backgroundColor: OaklandDusk.bg.card,
        alignItems: "center",
        gap: 10,
      }}>
        <FontAwesome name="user-circle" size={40} color={OaklandDusk.brand.gold} />
        {userEmail ? (
          <Text style={{ textAlign: "center", fontWeight: "600", color: OaklandDusk.text.primary }}>{userEmail}</Text>
        ) : (
          <>
            <Text style={{ textAlign: "center", color: OaklandDusk.text.secondary }}>Not signed in</Text>
            <Pressable
              onPress={() => router.push("/login")}
              style={{
                borderRadius: 999,
                paddingHorizontal: 20,
                paddingVertical: 10,
                backgroundColor: OaklandDusk.brand.gold,
              }}
            >
              <Text style={{ fontWeight: "800", color: OaklandDusk.bg.void }}>Sign In</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Menu items */}
      <View style={{ gap: 8 }}>
        <ProfileRow
          icon="sliders"
          label="Preferences"
          onPress={() => router.push("/profile/preferences")}
        />
        <ProfileRow
          icon="heart"
          label="Favorites"
          onPress={() => router.push("/profile/favorites")}
        />

        {/* Recipe unit toggle */}
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: 12,
          backgroundColor: OaklandDusk.bg.card,
        }}>
          <Text style={{ fontWeight: "600", color: OaklandDusk.text.primary }}>
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
                backgroundColor: displayUnit === "oz" ? OaklandDusk.brand.gold : OaklandDusk.bg.surface,
              }}
            >
              <Text style={{
                fontWeight: "700",
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
                backgroundColor: displayUnit === "ml" ? OaklandDusk.brand.gold : OaklandDusk.bg.surface,
              }}
            >
              <Text style={{
                fontWeight: "700",
                fontSize: 13,
                color: displayUnit === "ml" ? OaklandDusk.bg.void : OaklandDusk.text.tertiary,
              }}>ml</Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={() => {
            Alert.alert(
              isZh ? "📸 拍照小技巧" : "Photo Tips",
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
            paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: OaklandDusk.bg.card,
          }}
        >
          <FontAwesome name="camera" size={16} color={OaklandDusk.text.secondary} />
          <Text style={{ flex: 1, fontSize: 14, color: OaklandDusk.text.primary }}>
            {isZh ? "拍照小技巧" : "Photo tips"}
          </Text>
          <Text style={{ fontSize: 16, color: OaklandDusk.text.tertiary }}>›</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/profile/feedback" as any)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: OaklandDusk.bg.card,
          }}
        >
          <FontAwesome name="comment" size={16} color={OaklandDusk.text.secondary} />
          <Text style={{ flex: 1, fontSize: 14, color: OaklandDusk.text.primary }}>
            {isZh ? "意見回饋" : "Send Feedback"}
          </Text>
          <Text style={{ fontSize: 16, color: OaklandDusk.text.tertiary }}>›</Text>
        </Pressable>

        <Pressable
          onPress={() => Linking.openURL("https://brok110.github.io/sipmetry-frontend/privacy")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: OaklandDusk.bg.card,
          }}
        >
          <FontAwesome name="lock" size={16} color={OaklandDusk.text.secondary} />
          <Text style={{ flex: 1, fontSize: 14, color: OaklandDusk.text.primary }}>
            {isZh ? "隱私政策" : "Privacy Policy"}
          </Text>
          <Text style={{ fontSize: 16, color: OaklandDusk.text.tertiary }}>›</Text>
        </Pressable>

        <Pressable
          onPress={() => Linking.openURL("https://brok110.github.io/sipmetry-frontend/terms")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: OaklandDusk.bg.card,
          }}
        >
          <FontAwesome name="file-text-o" size={16} color={OaklandDusk.text.secondary} />
          <Text style={{ flex: 1, fontSize: 14, color: OaklandDusk.text.primary }}>
            {isZh ? "服務條款" : "Terms of Service"}
          </Text>
          <Text style={{ fontSize: 16, color: OaklandDusk.text.tertiary }}>›</Text>
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
              borderColor: OaklandDusk.bg.border,
              backgroundColor: OaklandDusk.bg.card,
            }}
          >
            <Text style={{ fontWeight: "700", color: OaklandDusk.accent.crimson }}>Sign Out</Text>
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
              <ActivityIndicator size="small" color={OaklandDusk.text.tertiary} />
            ) : (
              <Text style={{ fontSize: 13, color: OaklandDusk.text.disabled }}>
                {isZh ? "刪除帳號" : "Delete Account"}
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
