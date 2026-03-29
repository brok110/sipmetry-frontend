import FontAwesome from "@expo/vector-icons/FontAwesome";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import OaklandDusk from "@/constants/OaklandDusk";

const STAPLES_STORAGE_KEY = "sipmetry:staples_selection";

export type StapleItem = {
  ingredient_key: string;
  display_name: string;
};

const DEFAULT_STAPLES: StapleItem[] = [
  { ingredient_key: "lime_juice", display_name: "Lime Juice" },
  { ingredient_key: "lemon_juice", display_name: "Lemon Juice" },
  { ingredient_key: "simple_syrup", display_name: "Simple Syrup" },
];

type StaplesModalProps = {
  visible: boolean;
  loading: boolean;
  onConfirm: (selectedKeys: string[]) => void;
  onCancel: () => void;
};

export default function StaplesModal({ visible, loading, onConfirm, onCancel }: StaplesModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(STAPLES_STORAGE_KEY)
      .then((val) => {
        if (val) {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) setSelected(new Set(parsed));
          } catch {}
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [visible]);

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const keys = Array.from(selected);
    AsyncStorage.setItem(STAPLES_STORAGE_KEY, JSON.stringify(keys)).catch(() => {});
    onConfirm(keys);
  }, [selected, onConfirm]);

  if (!loaded) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" }}
        onPress={onCancel}
      >
        <Pressable
          style={{
            backgroundColor: OaklandDusk.bg.card,
            borderRadius: 16, padding: 24, marginHorizontal: 32,
            width: "85%", maxWidth: 360, gap: 16,
          }}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={{ fontSize: 18, fontWeight: "800", color: OaklandDusk.text.primary }}>
            Do you have these?
          </Text>
          <Text style={{ fontSize: 13, color: OaklandDusk.text.secondary, lineHeight: 18 }}>
            Common ingredients that improve your recommendations.
          </Text>

          <View style={{ gap: 10 }}>
            {DEFAULT_STAPLES.map((item) => {
              const isSelected = selected.has(item.ingredient_key);
              return (
                <Pressable
                  key={item.ingredient_key}
                  onPress={() => toggle(item.ingredient_key)}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 12,
                    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10,
                    borderWidth: 1,
                    borderColor: isSelected ? "#6B8F6B" : OaklandDusk.bg.border,
                    backgroundColor: isSelected ? "rgba(107,143,107,0.08)" : "transparent",
                  }}
                >
                  <View style={{
                    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
                    borderColor: isSelected ? "#6B8F6B" : OaklandDusk.text.tertiary,
                    backgroundColor: isSelected ? "rgba(107,143,107,0.15)" : "transparent",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    {isSelected && <FontAwesome name="check" size={11} color="#6B8F6B" />}
                  </View>
                  <Text style={{
                    fontSize: 15, fontWeight: "600",
                    color: isSelected ? OaklandDusk.text.primary : OaklandDusk.text.secondary,
                  }}>
                    {item.display_name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ gap: 8, marginTop: 4 }}>
            <Pressable
              onPress={handleConfirm} disabled={loading}
              style={{
                backgroundColor: OaklandDusk.brand.gold,
                borderRadius: 12, paddingVertical: 14, alignItems: "center",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? (
                <ActivityIndicator size="small" color={OaklandDusk.bg.void} />
              ) : (
                <Text style={{ fontSize: 15, fontWeight: "700", color: OaklandDusk.bg.void }}>Show Recipes</Text>
              )}
            </Pressable>
            <Pressable onPress={onCancel}>
              <Text style={{ fontSize: 13, color: OaklandDusk.text.tertiary, textAlign: "center" }}>Skip</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export { DEFAULT_STAPLES, STAPLES_STORAGE_KEY };
