import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import Svg, { Circle, Line, Polygon, Text as SvgText } from "react-native-svg";

import { useAuth } from "@/context/auth";
import { useFavorites } from "@/context/favorites";
import { useFeedback } from "@/context/feedback";
import { apiFetch } from "@/lib/api";

type RadarDim = { key: string; label: string; value: number };
type Strength = RadarDim & { representative?: { iba_code: string; name: string } | null };
type Unexplored = RadarDim & { suggestions?: { iba_code: string; name: string }[] };
type AffinityItem = { key: string; label: string; score: number; count: number };


// ── Radar Chart (pure SVG) ───────────────────────────────────────────────
function RadarChart({ data, size = 280 }: { data: RadarDim[]; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 36;
  const n = data.length;

  if (n < 3) return null;

  const angleStep = (2 * Math.PI) / n;
  // Start from top (-PI/2)
  const startAngle = -Math.PI / 2;

  const getPoint = (i: number, r: number) => {
    const angle = startAngle + i * angleStep;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  // Grid rings (1-3)
  const rings = [1, 2, 3];

  // Data polygon points
  const dataPoints = data.map((d, i) => {
    const r = (d.value / 3) * maxR;
    return getPoint(i, r);
  });
  const dataPolygon = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size}>
        {/* Grid rings */}
        {rings.map((ring) => (
          <Circle
            key={ring}
            cx={cx}
            cy={cy}
            r={(ring / 3) * maxR}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={ring === 3 ? 1.5 : 0.5}
          />
        ))}

        {/* Axis lines */}
        {data.map((_, i) => {
          const p = getPoint(i, maxR);
          return (
            <Line
              key={`axis-${i}`}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke="#d1d5db"
              strokeWidth={0.5}
            />
          );
        })}

        {/* Data polygon */}
        <Polygon
          points={dataPolygon}
          fill="rgba(139, 92, 246, 0.2)"
          stroke="#8b5cf6"
          strokeWidth={2}
        />

        {/* Data points */}
        {dataPoints.map((p, i) => (
          <Circle key={`dot-${i}`} cx={p.x} cy={p.y} r={4} fill="#8b5cf6" />
        ))}

        {/* Labels */}
        {data.map((d, i) => {
          const labelR = maxR + 20;
          const p = getPoint(i, labelR);
          const angle = startAngle + i * angleStep;
          // Adjust text anchor based on position
          let textAnchor: "start" | "middle" | "end" = "middle";
          if (Math.cos(angle) > 0.3) textAnchor = "start";
          else if (Math.cos(angle) < -0.3) textAnchor = "end";

          return (
            <SvgText
              key={`label-${i}`}
              x={p.x}
              y={p.y + 4}
              textAnchor={textAnchor}
              fontSize={11}
              fontWeight="600"
              fill="#6b7280"
            >
              {d.label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────
export default function TasteDNAScreen() {
  const { session } = useAuth();
  const { favoritesByKey } = useFavorites();
  const feedback = useFeedback() as any;
  const ratingsByKey: Record<string, "like" | "dislike"> =
    feedback?.ratingsByKey ?? feedback?.ratings ?? {};
  const ratingMetaByKey: Record<string, any> = feedback?.ratingMetaByKey ?? {};

  const [radar, setRadar] = useState<RadarDim[]>([]);
  const [strengths, setStrengths] = useState<Strength[]>([]);
  const [unexplored, setUnexplored] = useState<Unexplored[]>([]);
  const [spiritAffinity, setSpiritAffinity] = useState<AffinityItem[]>([]);
  const [categoryAffinity, setCategoryAffinity] = useState<AffinityItem[]>([]);
  const [confidence, setConfidence] = useState<number>(0);
  const [meta, setMeta] = useState<any>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isZh = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith("zh");
    } catch {
      return false;
    }
  }, []);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const favoriteCodes = Object.values(favoritesByKey ?? {})
        .map((f: any) => String(f?.iba_code || f?.recipe_key || "").trim())
        .filter(Boolean);
      const likedCodes: string[] = [];
      const dislikedCodes: string[] = [];
      for (const [key, rating] of Object.entries(ratingsByKey)) {
        const m = ratingMetaByKey[key];
        const code = String(m?.iba_code || key || "").trim();
        if (!code) continue;
        if (rating === "like") likedCodes.push(code);
        else if (rating === "dislike") dislikedCodes.push(code);
      }

      const resp = await apiFetch("/taste-profile", {
        session,
        method: "POST",
        body: {
          locale: isZh ? "zh" : "en",
          user_interactions: {
            favorite_codes: favoriteCodes,
            liked_codes: likedCodes,
            disliked_codes: dislikedCodes,
          },
        },
      });

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Taste Profile API failed: ${resp.status} ${t}`);
      }

      const data = await resp.json();
      setReady(!!data.ready);

      if (data.ready) {
        setRadar(Array.isArray(data.radar) ? data.radar : []);
        setStrengths(Array.isArray(data.strengths) ? data.strengths : []);
        setUnexplored(Array.isArray(data.unexplored) ? data.unexplored : []);
        setSpiritAffinity(Array.isArray(data.spirit_affinity) ? data.spirit_affinity : []);
        setCategoryAffinity(Array.isArray(data.category_affinity) ? data.category_affinity : []);
        setConfidence(typeof data.confidence === "number" ? data.confidence : 0);
      }
      setMeta(data.meta || null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load taste profile.");
    } finally {
      setLoading(false);
    }
  }, [favoritesByKey, ratingsByKey, ratingMetaByKey, isZh, session?.access_token]);

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [])
  );

  if (loading && ready === null) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
        <Text style={{ color: "#888", marginTop: 12 }}>
          {isZh ? "分析你的口味..." : "Analyzing your taste..."}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <FontAwesome name="exclamation-circle" size={40} color="#ef4444" />
        <Text style={{ color: "#ef4444", marginTop: 12, textAlign: "center" }}>{error}</Text>
      </View>
    );
  }

  if (ready === false) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 16 }}>
        <Text style={{ fontSize: 48 }}>🧬</Text>
        <Text style={{ fontSize: 20, fontWeight: "900", color: "#333" }}>
          {isZh ? "口味 DNA" : "Taste DNA"}
        </Text>
        <Text style={{ color: "#888", textAlign: "center", lineHeight: 22 }}>
          {meta?.message || (isZh ? "需要更多互動資料" : "Need more interaction data")}
        </Text>
        <View style={{
          flexDirection: "row", alignItems: "center", gap: 8,
          paddingHorizontal: 16, paddingVertical: 10,
          borderRadius: 20, backgroundColor: "#f3f4f6",
        }}>
          <Text style={{ fontWeight: "800", color: "#6b7280" }}>
            {meta?.interaction_count ?? 0} / {meta?.required ?? 5}
          </Text>
          <Text style={{ color: "#9ca3af", fontSize: 12 }}>
            {isZh ? "次互動" : "interactions"}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      {/* Header */}
      <View style={{ alignItems: "center", gap: 4 }}>
        <Text style={{ fontSize: 24, fontWeight: "900" }}>
          🧬 {isZh ? "口味 DNA" : "Taste DNA"}
        </Text>
        <Text style={{ color: "#888", fontSize: 13 }}>
          {isZh
            ? `根據 ${meta?.interaction_count ?? 0} 次互動分析`
            : `Based on ${meta?.interaction_count ?? 0} interactions`}
        </Text>
      </View>

      {/* Confidence bar */}
      {confidence > 0 && (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#6b7280" }}>
              {isZh ? "分析信心度" : "Profile Confidence"}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: "700", color: confidence >= 0.7 ? "#059669" : confidence >= 0.4 ? "#d97706" : "#9ca3af" }}>
              {Math.round(confidence * 100)}%
            </Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: "#e5e7eb" }}>
            <View style={{
              height: 6,
              borderRadius: 3,
              width: `${Math.round(confidence * 100)}%` as any,
              backgroundColor: confidence >= 0.7 ? "#059669" : confidence >= 0.4 ? "#d97706" : "#d1d5db",
            }} />
          </View>
          {confidence < 0.5 && (
            <Text style={{ fontSize: 11, color: "#9ca3af" }}>
              {isZh ? "繼續探索以提高準確度" : "Keep exploring to improve accuracy"}
            </Text>
          )}
        </View>
      )}

      {/* Radar chart */}
      {radar.length > 0 ? (
        <View style={{
          borderWidth: 1, borderRadius: 16, padding: 16,
          borderColor: "#e5e7eb", backgroundColor: "#fafafa",
          alignItems: "center",
        }}>
          <RadarChart data={radar} size={280} />
        </View>
      ) : null}

      {/* Top 3 strengths */}
      {strengths.length > 0 ? (
        <View style={{ borderWidth: 1, borderRadius: 16, padding: 16, gap: 12, borderColor: "#e5e7eb" }}>
          <Text style={{ fontWeight: "900", fontSize: 15 }}>
            {isZh ? "🏆 你的強項" : "🏆 Your Strengths"}
          </Text>
          {strengths.map((s, i) => (
            <View key={s.key} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{
                width: 28, height: 28, borderRadius: 14,
                backgroundColor: i === 0 ? "#8b5cf6" : i === 1 ? "#a78bfa" : "#c4b5fd",
                justifyContent: "center", alignItems: "center",
              }}>
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700" }}>
                  {s.label} — {s.value.toFixed(1)}/3
                </Text>
                {s.representative ? (
                  <Text style={{ color: "#888", fontSize: 12 }}>
                    {isZh ? "代表作：" : "e.g. "}{s.representative.name}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Unexplored areas */}
      {unexplored.length > 0 ? (
        <View style={{ borderWidth: 1, borderRadius: 16, padding: 16, gap: 12, borderColor: "#e5e7eb" }}>
          <Text style={{ fontWeight: "900", fontSize: 15 }}>
            {isZh ? "🗺️ 未探索領域" : "🗺️ Unexplored Territory"}
          </Text>
          {unexplored.map((u) => (
            <View key={u.key} style={{ gap: 6 }}>
              <Text style={{ fontWeight: "700" }}>
                {u.label} — {u.value.toFixed(1)}/3
              </Text>
              {Array.isArray(u.suggestions) && u.suggestions.length > 0 ? (
                <View style={{ gap: 4 }}>
                  <Text style={{ color: "#888", fontSize: 12 }}>
                    {isZh ? "推薦嘗試：" : "Try these:"}
                  </Text>
                  {u.suggestions.map((s) => (
                    <View key={s.iba_code} style={{
                      flexDirection: "row", alignItems: "center", gap: 6,
                      paddingVertical: 4, paddingHorizontal: 8,
                      borderRadius: 8, backgroundColor: "#f9fafb",
                    }}>
                      <Text style={{ fontSize: 13 }}>→ {s.name}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {/* Spirit Affinity */}
      {spiritAffinity.length > 0 && (
        <View style={{ borderWidth: 1, borderRadius: 16, padding: 16, gap: 10, borderColor: "#e5e7eb" }}>
          <Text style={{ fontWeight: "900", fontSize: 15 }}>
            {isZh ? "🥃 烈酒偏好" : "🥃 Spirit Affinity"}
          </Text>
          {spiritAffinity.map((item) => (
            <View key={item.key} style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontWeight: "700", fontSize: 14 }}>{item.label}</Text>
                <Text style={{ fontSize: 12, color: "#6b7280" }}>
                  {item.count} {isZh ? "杯" : item.count === 1 ? "drink" : "drinks"}
                </Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: "#e5e7eb" }}>
                <View style={{
                  height: 6,
                  borderRadius: 3,
                  width: `${Math.min(100, Math.round(item.score * 100))}%` as any,
                  backgroundColor: "#8b5cf6",
                }} />
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Category Affinity */}
      {categoryAffinity.length > 0 && (
        <View style={{ borderWidth: 1, borderRadius: 16, padding: 16, gap: 10, borderColor: "#e5e7eb" }}>
          <Text style={{ fontWeight: "900", fontSize: 15 }}>
            {isZh ? "🍸 類別偏好" : "🍸 Category Affinity"}
          </Text>
          {categoryAffinity.map((item) => (
            <View key={item.key} style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontWeight: "700", fontSize: 14 }}>{item.label}</Text>
                <Text style={{ fontSize: 12, color: "#6b7280" }}>
                  {item.count} {isZh ? "杯" : item.count === 1 ? "drink" : "drinks"}
                </Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: "#e5e7eb" }}>
                <View style={{
                  height: 6,
                  borderRadius: 3,
                  width: `${Math.min(100, Math.round(item.score * 100))}%` as any,
                  backgroundColor: "#f59e0b",
                }} />
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Meta footer */}
      <Text style={{ color: "#bbb", fontSize: 11, textAlign: "center" }}>
        {isZh
          ? `${meta?.positive_count ?? 0} 正面 · ${meta?.negative_count ?? 0} 負面 · ${meta?.recipes_with_vectors ?? 0} 有風味數據`
          : `${meta?.positive_count ?? 0} positive · ${meta?.negative_count ?? 0} negative · ${meta?.recipes_with_vectors ?? 0} with flavor data`}
      </Text>
    </ScrollView>
  );
}
