import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "@/context/auth";
import OaklandDusk from "@/constants/OaklandDusk";
import { apiFetch } from "@/lib/api";

const CATEGORIES = [
  { key: "bug", labelEn: "Bug Report", labelZh: "回報問題", icon: "bug" as const },
  { key: "feature", labelEn: "Feature Request", labelZh: "功能建議", icon: "lightbulb-o" as const },
  { key: "other", labelEn: "Other", labelZh: "其他", icon: "comment-o" as const },
];

export default function FeedbackScreen() {
  const router = useRouter();
  const { session } = useAuth();

  const [category, setCategory] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isZh = useMemo(() => {
    try {
      const l = Intl.DateTimeFormat().resolvedOptions().locale;
      return String(l || "en").toLowerCase().startsWith("zh");
    } catch {
      return false;
    }
  }, []);

  const canSubmit = category && content.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const resp = await apiFetch("/app-feedback", {
        session,
        method: "POST",
        body: {
          category,
          content: content.trim(),
          app_version: "1.0.0",
        },
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${resp.status}`);
      }
      Alert.alert(
        isZh ? "感謝回饋！" : "Thank you!",
        isZh ? "你的意見對我們很重要。" : "Your feedback helps us improve Sipmetry.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert(
        "Error",
        isZh
          ? `提交失敗：${e?.message || "未知錯誤"}`
          : `Submission failed: ${e?.message || "Unknown error"}`
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: OaklandDusk.bg.void }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 16, fontWeight: "700", color: OaklandDusk.text.primary }}>
          {isZh ? "選擇類別" : "Category"}
        </Text>

        <View style={{ flexDirection: "row", gap: 10 }}>
          {CATEGORIES.map((cat) => {
            const selected = category === cat.key;
            return (
              <Pressable
                key={cat.key}
                onPress={() => setCategory(cat.key)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  gap: 6,
                  paddingVertical: 14,
                  borderWidth: 1.5,
                  borderRadius: 12,
                  borderColor: selected ? OaklandDusk.brand.gold : OaklandDusk.bg.border,
                  backgroundColor: selected ? OaklandDusk.brand.gold + "15" : OaklandDusk.bg.card,
                }}
              >
                <FontAwesome
                  name={cat.icon}
                  size={20}
                  color={selected ? OaklandDusk.brand.gold : OaklandDusk.text.tertiary}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: selected ? OaklandDusk.brand.gold : OaklandDusk.text.secondary,
                  }}
                >
                  {isZh ? cat.labelZh : cat.labelEn}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ fontSize: 16, fontWeight: "700", color: OaklandDusk.text.primary }}>
          {isZh ? "詳細說明" : "Details"}
        </Text>

        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder={isZh ? "請描述你的問題或建議..." : "Describe your issue or suggestion..."}
          placeholderTextColor={OaklandDusk.text.tertiary}
          multiline
          textAlignVertical="top"
          maxLength={5000}
          style={{
            minHeight: 150,
            borderWidth: 1,
            borderColor: OaklandDusk.bg.border,
            borderRadius: 12,
            padding: 14,
            fontSize: 15,
            color: OaklandDusk.text.primary,
            backgroundColor: OaklandDusk.bg.card,
          }}
        />

        <Text style={{ fontSize: 12, color: OaklandDusk.text.tertiary, textAlign: "right" }}>
          {content.length} / 5000
        </Text>

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={{
            backgroundColor: canSubmit ? OaklandDusk.brand.gold : OaklandDusk.bg.border,
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: "center",
            opacity: submitting ? 0.6 : 1,
          }}
        >
          <Text
            style={{
              fontWeight: "800",
              color: canSubmit ? OaklandDusk.bg.void : OaklandDusk.text.tertiary,
            }}
          >
            {submitting
              ? isZh ? "提交中..." : "Submitting..."
              : isZh ? "送出回饋" : "Submit Feedback"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
