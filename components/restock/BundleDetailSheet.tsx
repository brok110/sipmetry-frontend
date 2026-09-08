// components/restock/BundleDetailSheet.tsx — PLUS-RAILS B2
// 瓶對 detail sheet(mockup v1 Frame 2):骨架沿用 RestockDetailSheet。
// 段序(裁決 d):ONLY TOGETHER 先(賣點,縮圖黃框)→ EACH ALONE 後(step 列,
// 不帶 ＋ LIST——兩瓶本身就是要買的東西,bigCap 處理)→ bigCap 三態(裁決 c)。
// ONLY TOGETHER 縮圖本階只顯示不可點(together_only_recipes 缺 iba_category,
// 不硬塞 openUnlocks;之後要點開再補)。
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import OaklandDusk from "@/constants/OaklandDusk";
import { Monogram } from "@/components/restock/RailCard";
import {
  BundleMonograms,
  addMissingMembers,
  bundleCapsuleState,
  type BundleAddTarget,
  type BundleItem,
  type BundleMember,
} from "@/components/restock/BundleRailCard";

const EACH_ALONE_MAX = 4;   // 每瓶最多列 4 杯,其餘「+N more」(sheet 不捲動,防小螢幕溢出)

export function BundleDetailSheet({
  data,
  listedKeys,
  onClose,
  onAdd,
}: {
  data: BundleItem | null;
  listedKeys: Set<string>;
  onClose: () => void;
  onAdd: (m: BundleAddTarget) => void | Promise<void>;
}) {
  if (!data) return null;
  const names = data.members.map((m) => m.display_name).join(" ＋ ");
  const cap = bundleCapsuleState(data, listedKeys);
  const together = data.together_only_recipes.slice(0, 8);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.top}>
          <BundleMonograms members={data.members} listedKeys={listedKeys} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{names}</Text>
            <Text style={styles.sub}>
              +{data.unlocks_total} cocktail{data.unlocks_total === 1 ? "" : "s"} · {data.together_only_count} only together
            </Text>
          </View>
        </View>

        {together.length > 0 && (
          <>
            <Text style={[styles.sec, styles.secHi]}>ONLY TOGETHER</Text>
            <View style={styles.thumbs}>
              {together.map((r, i) => (
                <View key={r.iba_code ?? `${r.name}:${i}`} style={styles.thumbWrap} accessibilityLabel={r.name ?? undefined}>
                  {r.image_url ? (
                    <Image source={{ uri: r.image_url }} style={styles.thumbImg} contentFit="cover" />
                  ) : (
                    <View style={styles.thumbHi}>
                      <Monogram label={r.name ?? "?"} size={46} />
                    </View>
                  )}
                  <Text style={styles.thumbCap} numberOfLines={2}>{r.name}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={styles.sec}>EACH ALONE</Text>
        {data.members.map((m) => (
          <EachAlone key={m.ingredient_key} member={m} />
        ))}

        <Pressable
          onPress={() => { void addMissingMembers(cap.missing, onAdd); }}
          disabled={cap.disabled}
          accessibilityRole="button"
          accessibilityLabel={cap.label}
          style={[styles.bigCap, cap.disabled && styles.bigCapOn]}
        >
          <Text style={[styles.bigCapText, cap.disabled && styles.bigCapTextOn]}>
            {cap.disabled ? cap.label : `${cap.label} to list`}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function EachAlone({ member }: { member: BundleMember }) {
  const rows = member.recipes.slice(0, EACH_ALONE_MAX);
  const more = member.recipes.length - rows.length;
  if (rows.length === 0) {
    return (
      <View style={styles.step}>
        <Text style={styles.stepNeed}>{member.display_name} alone · nothing yet — only together</Text>
      </View>
    );
  }
  return (
    <>
      {rows.map((r) => (
        <View key={`${member.ingredient_key}:${r.iba_code}`} style={styles.step}>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepName}>{r.name}</Text>
            <Text style={styles.stepNeed}>{member.display_name} alone</Text>
          </View>
        </View>
      ))}
      {more > 0 && <Text style={styles.more}>+{more} more with {member.display_name}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: OaklandDusk.bg.surface,
    borderTopWidth: 1,
    borderColor: OaklandDusk.brand.gold,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    paddingBottom: 34,
    gap: 10,
  },
  top: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  name: { fontSize: 19, fontWeight: "700", color: OaklandDusk.text.primary },
  sub: { fontFamily: "DMMono", fontSize: 11, color: OaklandDusk.brand.sundown, marginTop: 2 },
  sec: { fontFamily: "DMMono", fontSize: 10, letterSpacing: 1.5, color: OaklandDusk.text.tertiary, marginTop: 8 },
  secHi: { color: OaklandDusk.brand.yellow },
  thumbs: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  thumbWrap: { width: 56, gap: 4, alignItems: "center" },
  thumbImg: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: OaklandDusk.brand.tagBg,
    borderWidth: 1,
    borderColor: OaklandDusk.brand.yellow,
  },
  thumbHi: { borderWidth: 1, borderColor: OaklandDusk.brand.yellow, borderRadius: 10 },
  thumbCap: { fontSize: 8, lineHeight: 10, color: OaklandDusk.text.secondary, textAlign: "center" },
  step: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: OaklandDusk.bg.card,
    borderWidth: 1,
    borderColor: OaklandDusk.bg.border,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 6,
  },
  stepName: { fontSize: 12, color: OaklandDusk.text.primary },
  stepNeed: { fontFamily: "DMMono", fontSize: 10, color: OaklandDusk.text.tertiary, marginTop: 2 },
  more: { fontFamily: "DMMono", fontSize: 9, color: OaklandDusk.text.tertiary, marginTop: 4, marginLeft: 12 },
  bigCap: {
    marginTop: 14,
    backgroundColor: OaklandDusk.brand.gold,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: "center",
  },
  bigCapOn: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#4ade80" },
  bigCapText: { fontSize: 13, fontWeight: "600", color: OaklandDusk.bg.void },
  bigCapTextOn: { color: "#4ade80" },
});
