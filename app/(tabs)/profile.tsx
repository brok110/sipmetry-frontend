import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useAuth } from "@/context/auth";

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
  const userEmail = session?.user?.email;
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
      </View>

      {/* Sign out */}
      {userEmail && (
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
      )}
    </ScrollView>
  );
}
