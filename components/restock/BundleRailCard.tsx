// components/restock/BundleRailCard.tsx — PLUS-RAILS B2
// 瓶對卡(mockup SMART_RESTOCK_BUY_TOGETHER_MOCKUP_v1 Frame 1 pcard):
// 雙 monogram + 「＋」、名稱、+N cocktails、N ONLY TOGETHER 標、組合才解鎖酒名
// (上限 2,超過「+N」,裁決 e)、膠囊三態(裁決 c:Add both / Add 缺的那瓶 /
// Both on list)。members 承 backend bundle 合約(註記六十四);listed 狀態以前端
// listedKeys 為準(比 member.on_list 新)。命名通用(bundle / members),三瓶卡直接沿用。
import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import OaklandDusk from "@/constants/OaklandDusk";
import { Monogram } from "@/components/restock/RailCard";

export type BundleRecipe = {
  iba_code: string | null;
  name: string | null;
  image_url?: string | null;
};

export type BundleMember = {
  ingredient_key: string;
  display_name: string;
  unlocks_count: number;
  on_list: boolean;
  category_key?: string | null;
  recipes: { iba_code: string; name: string; image_url?: string | null }[];
};

export type BundleItem = {
  bundle_key: string;
  members: BundleMember[];
  unlocks_total: number;
  together_only_count: number;
  together_only_recipes: BundleRecipe[];
};

export type BundleAddTarget = Pick<BundleMember, "ingredient_key" | "display_name">;

/** 膠囊三態:依 listedKeys 算出缺的成員(裁決 c)。card 與 sheet 共用。 */
export function bundleCapsuleState(item: BundleItem, listedKeys: Set<string>) {
  const missing = item.members.filter((m) => !listedKeys.has(m.ingredient_key));
  if (missing.length === 0) return { missing, label: "✓ Both on list", disabled: true };
  if (missing.length === 1) return { missing, label: `＋ Add ${missing[0].display_name}`, disabled: false };
  return { missing, label: "＋ Add both", disabled: false };
}

/** 逐一加缺的成員;handleAddToList 用 functional setState,連呼安全,server 端 deduped。 */
export async function addMissingMembers(
  missing: BundleMember[],
  onAdd: (m: BundleAddTarget) => void | Promise<void>,
) {
  for (const m of missing) {
    await onAdd({ ingredient_key: m.ingredient_key, display_name: m.display_name });
  }
}

/** 組合才解鎖酒名:上限 2,超過「A · B +N」(裁決 e)。 */
export function togetherOnlyLabel(recipes: BundleRecipe[]) {
  const names = recipes.map((r) => r.name).filter((n): n is string => !!n);
  const head = names.slice(0, 2).join(" · ");
  const rest = names.length - 2;
  return rest > 0 ? `${head} +${rest}` : head;
}

/** 雙 monogram 一列;已在清單的成員角落帶 ✓(card 與 sheet 共用)。 */
export function BundleMonograms({
  members,
  listedKeys,
  size,
}: {
  members: BundleMember[];
  listedKeys: Set<string>;
  size: number;
}) {
  return (
    <View style={styles.pair}>
      {members.map((m, i) => (
        <React.Fragment key={m.ingredient_key}>
          {i > 0 && <Text style={styles.plus}>＋</Text>}
          <View>
            <Monogram label={m.display_name} size={size} />
            {listedKeys.has(m.ingredient_key) && (
              <View style={styles.onList} accessibilityLabel={`${m.display_name} on list`}>
                <Text style={styles.onListText}>✓</Text>
              </View>
            )}
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

export const BundleRailCard = memo(function BundleRailCard({
  item,
  listedKeys,
  onAdd,
  onPress,
}: {
  item: BundleItem;
  listedKeys: Set<string>;
  onAdd: (m: BundleAddTarget) => void | Promise<void>;
  onPress: (item: BundleItem) => void;
}) {
  const names = item.members.map((m) => m.display_name).join(" ＋ ");
  const cap = bundleCapsuleState(item, listedKeys);
  const recipesLabel = togetherOnlyLabel(item.together_only_recipes);
  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${names}, unlocks ${item.unlocks_total}, ${item.together_only_count} only together`}
      style={styles.card}
    >
      <BundleMonograms members={item.members} listedKeys={listedKeys} size={42} />
      <Text style={styles.name} numberOfLines={2}>{names}</Text>
      <Text style={styles.unlocks} numberOfLines={1}>
        +{item.unlocks_total} cocktail{item.unlocks_total === 1 ? "" : "s"}
      </Text>
      <View style={styles.togTag}>
        <Text style={styles.togTagText}>{item.together_only_count} ONLY TOGETHER</Text>
      </View>
      {recipesLabel ? (
        <Text style={styles.recipes} numberOfLines={1}>{recipesLabel}</Text>
      ) : null}
      <Pressable
        onPress={() => { void addMissingMembers(cap.missing, onAdd); }}
        disabled={cap.disabled}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={cap.label}
        style={[styles.cap, cap.disabled && styles.capOn]}
      >
        <Text style={[styles.capText, cap.disabled && styles.capTextOn]}>{cap.label}</Text>
      </Pressable>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    width: 196,
    backgroundColor: OaklandDusk.bg.card,
    borderWidth: 1,
    borderColor: OaklandDusk.bg.border,
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  pair: { flexDirection: "row", alignItems: "center", gap: 6 },
  plus: { fontSize: 16, lineHeight: 18, color: OaklandDusk.text.tertiary },
  onList: {
    position: "absolute",
    top: -5,
    right: -5,
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: OaklandDusk.semantic.ready,
    alignItems: "center",
    justifyContent: "center",
  },
  onListText: { fontFamily: "DMMono", fontSize: 9, lineHeight: 11, color: OaklandDusk.bg.void },
  name: { fontSize: 12, lineHeight: 15.5, minHeight: 31, color: OaklandDusk.text.primary },
  unlocks: { fontFamily: "DMMono", fontSize: 10, color: OaklandDusk.brand.sundown },
  togTag: {
    alignSelf: "flex-start",
    backgroundColor: OaklandDusk.brand.tagBg,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  togTagText: { fontFamily: "DMMono", fontSize: 8, letterSpacing: 0.5, color: OaklandDusk.brand.yellow },
  recipes: { fontSize: 9, lineHeight: 12, color: OaklandDusk.text.secondary },
  cap: {
    borderWidth: 1,
    borderColor: OaklandDusk.brand.gold,
    borderRadius: 999,
    paddingVertical: 4,
    alignItems: "center",
  },
  capOn: { borderColor: "#4ade80" },
  capText: { fontFamily: "DMMono", fontSize: 10, color: OaklandDusk.brand.gold },
  capTextOn: { color: "#4ade80" },
});
