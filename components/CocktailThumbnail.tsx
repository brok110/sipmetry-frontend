import React, { useState } from "react";
import { Dimensions, Image, Modal, Pressable, Text, View } from "react-native";
import OaklandDusk from "@/constants/OaklandDusk";

type CocktailThumbnailProps = {
  imageUrl?: string | null;
  size?: number;
};

export default function CocktailThumbnail({ imageUrl, size = 56 }: CocktailThumbnailProps) {
  const [lightboxVisible, setLightboxVisible] = useState(false);

  if (!imageUrl) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          backgroundColor: OaklandDusk.bg.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 22, color: OaklandDusk.text.disabled }}>🍸</Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          setLightboxVisible(true);
        }}
      >
        <Image
          source={{ uri: imageUrl }}
          style={{
            width: size,
            height: size,
            borderRadius: 10,
            backgroundColor: OaklandDusk.bg.surface,
          }}
          resizeMode="cover"
        />
      </Pressable>

      <Modal
        visible={lightboxVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxVisible(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.8)",
            justifyContent: "center",
            alignItems: "center",
          }}
          onPress={() => setLightboxVisible(false)}
        >
          <Image
            source={{ uri: imageUrl }}
            style={{
              width: Dimensions.get("window").width * 0.85,
              height: Dimensions.get("window").width * 0.85,
              borderRadius: 14,
            }}
            resizeMode="cover"
          />
        </Pressable>
      </Modal>
    </>
  );
}
