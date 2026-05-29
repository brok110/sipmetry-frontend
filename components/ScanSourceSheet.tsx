import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, Switch, Text, View } from "react-native";
import OaklandDusk from "@/constants/OaklandDusk";

export type ScanSourceResult = {
  source: "camera" | "library";
  guest: boolean;
};

type ScanSourceSheetProps = {
  visible: boolean;
  onClose: () => void;
  onPick: (result: ScanSourceResult) => void;
  lockGuest?: boolean;
  forceGuest?: boolean;
};

export default function ScanSourceSheet({
  visible,
  onClose,
  onPick,
  lockGuest,
  forceGuest,
}: ScanSourceSheetProps) {
  const [guest, setGuest] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setGuest(lockGuest ? !!forceGuest : false);
  }, [visible, lockGuest, forceGuest]);

  const accentColor = guest ? OaklandDusk.brand.gold : OaklandDusk.text.tertiary;
  const iconColor = guest ? OaklandDusk.brand.gold : OaklandDusk.text.tertiary;
  const titleColor = guest ? OaklandDusk.text.primary : OaklandDusk.text.tertiary;
  const subtitleColor = guest ? OaklandDusk.text.secondary : OaklandDusk.text.tertiary;
  const guestRowBg = guest ? `${OaklandDusk.brand.gold}14` : "transparent";

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

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
              paddingVertical: 16,
              paddingLeft: 0,
              paddingRight: 20,
              backgroundColor: guestRowBg,
            }}
          >
            <View
              style={{
                width: 3,
                alignSelf: "stretch",
                backgroundColor: accentColor,
                marginRight: 1,
              }}
            />
            <View style={{ width: 28, alignItems: "center" }}>
              <FontAwesome name="users" size={20} color={iconColor} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: titleColor }}>
                Guest bar
              </Text>
              <Text style={{ fontSize: 12, color: subtitleColor }}>
                Scan won&apos;t be saved to My Bar
              </Text>
            </View>
            <Switch
              value={guest}
              onValueChange={setGuest}
              disabled={lockGuest === true}
              trackColor={{ false: OaklandDusk.bg.border, true: OaklandDusk.brand.gold }}
              thumbColor={guest ? OaklandDusk.text.primary : OaklandDusk.text.tertiary}
              ios_backgroundColor={OaklandDusk.bg.border}
            />
          </View>

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: OaklandDusk.bg.border,
              marginTop: 8,
            }}
          />
          <Pressable
            onPress={() => onPick({ source: "camera", guest })}
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
            onPress={() => onPick({ source: "library", guest })}
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
