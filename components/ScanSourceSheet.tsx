import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import OaklandDusk from "@/constants/OaklandDusk";

export type ScanSource = "camera" | "library" | "guest";

type ScanSourceSheetProps = {
  visible: boolean;
  onClose: () => void;
  onPick: (source: ScanSource) => void;
};

export default function ScanSourceSheet({ visible, onClose, onPick }: ScanSourceSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
        onPress={onClose}
      >
        <Pressable
          style={{
            backgroundColor: OaklandDusk.bg.card,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            paddingTop: 20,
            paddingBottom: 28,
            width: "100%",
          }}
          onPress={(e) => e.stopPropagation()}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "800",
              color: OaklandDusk.text.primary,
              paddingHorizontal: 20,
              paddingBottom: 12,
            }}
          >
            Scan Bottles
          </Text>

          <Pressable
            onPress={() => onPick("camera")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
              paddingVertical: 16,
              paddingHorizontal: 20,
            }}
          >
            <View style={{ width: 28, alignItems: "center" }}>
              <FontAwesome name="camera" size={20} color={OaklandDusk.text.secondary} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: "600", color: OaklandDusk.text.primary }}>
              Take Photo
            </Text>
          </Pressable>

          <Pressable
            onPress={() => onPick("library")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
              paddingVertical: 16,
              paddingHorizontal: 20,
            }}
          >
            <View style={{ width: 28, alignItems: "center" }}>
              <FontAwesome name="photo" size={20} color={OaklandDusk.text.secondary} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: "600", color: OaklandDusk.text.primary }}>
              Choose Photos
            </Text>
          </Pressable>

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: OaklandDusk.bg.border,
              marginTop: 8,
            }}
          />
          <Pressable
            onPress={() => onPick("guest")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
              paddingVertical: 16,
              paddingLeft: 0,
              paddingRight: 20,
              backgroundColor: `${OaklandDusk.brand.gold}0F`,
            }}
          >
            <View
              style={{
                width: 3,
                alignSelf: "stretch",
                backgroundColor: OaklandDusk.brand.gold,
                marginRight: 1,
              }}
            />
            <View style={{ width: 28, alignItems: "center" }}>
              <FontAwesome name="users" size={20} color={OaklandDusk.brand.gold} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: OaklandDusk.text.primary }}>
                Scan a guest bar
              </Text>
              <Text style={{ fontSize: 12, color: OaklandDusk.text.secondary }}>
                Won&apos;t be saved to My Bar
              </Text>
            </View>
          </Pressable>

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: OaklandDusk.bg.border,
              marginTop: 8,
            }}
          />
          <Pressable
            onPress={onClose}
            style={{
              paddingVertical: 16,
              paddingHorizontal: 20,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: OaklandDusk.text.tertiary }}>
              Cancel
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
