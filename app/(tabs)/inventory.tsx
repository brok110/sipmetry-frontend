import Shelf from '@/components/cabinet/Shelf'
import HintBubble, { GUIDE_KEYS, dismissGuide, isGuideDismissed } from '@/components/GuideBubble'
import Masthead from '@/components/Masthead'
import RegistrationPrompt from '@/components/RegistrationPrompt'
import ScanSourceSheet, { ScanSourceResult } from '@/components/ScanSourceSheet'
import StaplesModal, { DEFAULT_STAPLES } from '@/components/StaplesModal'
import CabinetTokens, { withAlpha } from '@/constants/cabinetTokens'
import OaklandDusk from '@/constants/OaklandDusk'
import Type from '@/constants/typography'
import { V3 } from '@/constants/v3DesignTokens'
import { useAuth } from '@/context/auth'
import { useInventory } from '@/context/inventory'
import { apiFetch } from '@/lib/api'
import { SHELF_ORDER, groupInventoryByShelf } from '@/lib/cabinet'
import { pickBottlePhotoFromCamera, pickBottlePhotoFromLibrary } from '@/lib/pickBottlePhoto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Svg, { Circle, Defs, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg'

// ── SCAN 鈕相機 icon(handoff README camera path)─────────────────────────────
function CameraGlyph() {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8 h3 l1.4-2.2 h7.2 L17 8 h3 v11 h-16 z"
        stroke={OaklandDusk.brand.gold}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={13} r={3.4} stroke={OaklandDusk.brand.gold} strokeWidth={1.6} />
    </Svg>
  )
}

// 環境暖光(mock:radial 520×520 at top 120,金 0.10→0.03→0)
function AmbientWash() {
  return (
    <View pointerEvents="none" style={styles.ambientWash}>
      <Svg width={520} height={520}>
        <Defs>
          <RadialGradient id="ambient-wash" cx="50%" cy="40%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={OaklandDusk.brand.gold} stopOpacity={0.1} />
            <Stop offset="0.42" stopColor={OaklandDusk.brand.gold} stopOpacity={0.03} />
            <Stop offset="0.66" stopColor={OaklandDusk.brand.gold} stopOpacity={0} />
            <Stop offset="1" stopColor={OaklandDusk.brand.gold} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={520} height={520} fill="url(#ambient-wash)" />
      </Svg>
    </View>
  )
}

// 櫃體木紋(README:repeating 91° 細紋;近似即可,grain 很淡)
function CabinetGrain() {
  return (
    <Svg width="100%" height="100%">
      <Defs>
        <Pattern id="cabinet-grain" patternUnits="userSpaceOnUse" width={11} height={40}>
          <Rect x={0.5} y={0} width={1} height={40} fill={withAlpha(CabinetTokens.wood.plankHigh, 0.35)} />
          <Rect x={1.5} y={0} width={2} height={40} fill={withAlpha(CabinetTokens.black, 0.14)} />
        </Pattern>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#cabinet-grain)" opacity={0.6} />
    </Svg>
  )
}

// ── Screen:My Bar 酒櫃(CABINET-3A §C4)───────────────────────────────────────
export default function MyBarScreen() {
  const { session, isAnonymous } = useAuth()
  const {
    inventory,
    availableIngredientKeys,
    loading,
    refreshing,
    error,
    initialized,
    refreshInventory,
  } = useInventory()

  const [scanSheetVisible, setScanSheetVisible] = useState(false)

  // ── Guide bubble state (Stage 5) ──────────────────────────────────────────
  const [guideMyBarEmptyVisible, setGuideMyBarEmptyVisible] = useState(false)
  const [guideMyBarCtaVisible, setGuideMyBarCtaVisible] = useState(false)

  // ── Registration prompt (anonymous users with ≥3 bottles) ────────────────
  const [showRegPrompt, setShowRegPrompt] = useState(false)
  const regPromptChecked = useRef(false)

  useEffect(() => {
    if (!isAnonymous || regPromptChecked.current) return
    if (inventory.length >= 3) {
      AsyncStorage.getItem('sipmetry_reg_prompt_dismissed').then((v) => {
        // TODO: scope key per user_id when volume grows (currently device-scoped)
        if (v !== 'true') setShowRegPrompt(true)
      })
      regPromptChecked.current = true
    }
  }, [inventory.length, isAnonymous])

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const emptyD = await isGuideDismissed(GUIDE_KEYS.MYBAR_EMPTY);
        if (!emptyD) setGuideMyBarEmptyVisible(true);

        const ctaD = await isGuideDismissed(GUIDE_KEYS.MYBAR_CTA);
        if (!ctaD) setGuideMyBarCtaVisible(true);
      })();
    }, [])
  )

  // ── See recipes loading state ──────────────────────────────────────────────
  const [recommendLoading, setRecommendLoading] = useState(false)
  const [showStaplesModal, setShowStaplesModal] = useState(false)

  const promptScanBottles = () => {
    setScanSheetVisible(true)
  }

  const handleScanSourcePick = async (result: ScanSourceResult) => {
    try {
      const picked =
        result.source === 'camera'
          ? await pickBottlePhotoFromCamera()
          : await pickBottlePhotoFromLibrary()

      setScanSheetVisible(false)

      if (!picked) return

      const intent = result.guest === true ? 'guest' : 'addToBar'
      const assets = picked.assets
      const params =
        assets.length === 1
          ? { photoUri: assets[0].uri, intent }
          : { photoUris: JSON.stringify(assets.map((a) => a.uri)), intent }

      router.push({ pathname: '/scan', params })
    } catch (e: any) {
      setScanSheetVisible(false)
      Alert.alert('Scan picker error', String(e?.message ?? e))
    }
  }

  useFocusEffect(
    React.useCallback(() => {
      refreshInventory({ silent: true }).catch(() => {})
    }, [refreshInventory])
  )

  const handleRefresh = () => {
    refreshInventory({ silent: true, notifyLowStock: true }).catch(() => {})
  }

  // ── Cabinet 分組(lib/cabinet):空層不渲染,層序 = P2 ──────────────────────
  const shelvesById = useMemo(() => groupInventoryByShelf(inventory), [inventory])
  const nonEmptyShelves = useMemo(
    () =>
      SHELF_ORDER.map((id) => ({ id, items: shelvesById.get(id)! })).filter(
        (shelf) => shelf.items.length > 0
      ),
    [shelvesById]
  )

  const handleSeeRecipes = async (staplesKeys: string[] = []) => {
    if (recommendLoading) return
    if (availableIngredientKeys.length === 0) return

    setRecommendLoading(true)
    try {
      const mergedIngredients = [...new Set([...availableIngredientKeys, ...staplesKeys])]
      const resp = await apiFetch('/recommend-classics', {
        session,
        method: 'POST',
        body: {
          detected_ingredients: mergedIngredients,
          locale: 'en',
        },
      })

      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`Recommend API failed: ${resp.status} ${text}`)
      }

      const data = await resp.json() as {
        can_make?: any[]
        one_away?: any[]
        two_away?: any[]
      }

      const canMake = Array.isArray(data.can_make) ? data.can_make : []
      const oneAway = Array.isArray(data.one_away) ? data.one_away : []
      const twoAway = Array.isArray(data.two_away) ? data.two_away : []

      const flattened = [
        ...canMake.map((x: any) => ({ ...x, bucket: 'ready' as const })),
        ...oneAway.map((x: any) => ({ ...x, bucket: 'one_missing' as const })),
        ...twoAway.map((x: any) => ({ ...x, bucket: 'two_missing' as const })),
      ]

      router.push({
        pathname: '/recommendations',
        params: {
          recipes: JSON.stringify(flattened),
          ingredientCount: String(availableIngredientKeys.length),
          activeCanonical: JSON.stringify(availableIngredientKeys),
          scanItems: JSON.stringify([
            ...inventory.map((item) => ({
              canonical: item.ingredient_key,
              display: item.display_name,
            })),
            ...staplesKeys.map((k) => ({
              canonical: k,
              display: DEFAULT_STAPLES.find((s) => s.ingredient_key === k)?.display_name ?? k.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
            })),
          ]),
          mode: 'inventory',
        },
      })
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not load recipes')
    } finally {
      setRecommendLoading(false)
    }
  }

  if ((loading || !initialized) && inventory.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111" />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: OaklandDusk.bg.void }}>
      <AmbientWash />

      {/* Masthead:共用元件(logo 24、tap → Bartender),SCAN 鈕走 actions 槽
          (舊 My Bar 相機鈕同模式);下方僅留 meta 行 */}
      <Masthead
        actions={
          <Pressable
            onPress={promptScanBottles}
            hitSlop={6}
            accessibilityLabel="Scan bottles"
            style={styles.scanBtn}
          >
            <View style={styles.scanFrame}>
              <CameraGlyph />
            </View>
            <Text style={styles.scanLabel}>SCAN</Text>
          </Pressable>
        }
      />
      <View style={styles.metaRow}>
        <Text style={styles.metaNum}>{inventory.length}</Text>
        <Text style={styles.metaUnit}>{inventory.length === 1 ? 'bottle' : 'bottles'}</Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.metaNum}>{nonEmptyShelves.length}</Text>
        <Text style={styles.metaUnit}>{nonEmptyShelves.length === 1 ? 'shelf' : 'shelves'}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {inventory.length === 0 && !error ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Your bar is empty</Text>
            <Text style={styles.emptySubtitle}>
              Scan your bottles to start building your bar.
            </Text>
            <View style={{ width: '100%', marginTop: 12 }}>
              <HintBubble
                storageKey={GUIDE_KEYS.MYBAR_EMPTY}
                visible={guideMyBarEmptyVisible}
                onDismiss={() => setGuideMyBarEmptyVisible(false)}
                hintType="tap"
                hintColor="skyblue"
              >
                <Pressable
                  onPress={() => {
                    dismissGuide(GUIDE_KEYS.MYBAR_EMPTY)
                    setGuideMyBarEmptyVisible(false)
                    promptScanBottles()
                  }}
                  style={{
                    borderWidth: 1.5,
                    borderColor: OaklandDusk.brand.gold,
                    borderRadius: 12,
                    paddingVertical: 12,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontWeight: '700', color: OaklandDusk.brand.gold }}>
                    Scan your bottles
                  </Text>
                </Pressable>
              </HintBubble>
            </View>
          </View>
        ) : (
          <>
            {/* The Cabinet:one furniture piece(crown / backboard / base rail) */}
            <View style={styles.cabinet}>
              <LinearGradient
                colors={[CabinetTokens.wood.bodyTop, CabinetTokens.wood.bodyMid, CabinetTokens.wood.bodyBottom]}
                locations={[0, 0.55, 1]}
                style={[StyleSheet.absoluteFill, { borderRadius: 6 }]}
              />
              <View pointerEvents="none" style={styles.grainClip}>
                <CabinetGrain />
              </View>

              {/* crown */}
              <View style={styles.crown}>
                <LinearGradient
                  colors={[CabinetTokens.wood.crownTop, CabinetTokens.wood.crownBottom]}
                  style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 6, borderTopRightRadius: 6 }]}
                />
                <View style={styles.crownTopHighlight} />
                <LinearGradient
                  colors={['transparent', withAlpha(CabinetTokens.black, 0.5)]}
                  style={styles.crownInnerShadow}
                />
                <LinearGradient
                  colors={[
                    'transparent',
                    withAlpha(OaklandDusk.brand.gold, 0.28),
                    withAlpha(OaklandDusk.brand.yellow, 0.5),
                    withAlpha(OaklandDusk.brand.gold, 0.28),
                    'transparent',
                  ]}
                  locations={[0, 0.2, 0.5, 0.8, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.crownLightLine}
                />
                {/* signature emblem:12×12 diamond */}
                <View style={styles.crownEmblem} />
              </View>

              {/* backboard(side padding 12 = 櫃柱) */}
              <View style={styles.backboardWrap}>
                <View style={styles.backboardPanel}>
                  <LinearGradient
                    colors={[CabinetTokens.backboard.top, CabinetTokens.backboard.bottom]}
                    style={StyleSheet.absoluteFill}
                  />
                  <LinearGradient
                    colors={[withAlpha(CabinetTokens.black, 0.8), 'transparent']}
                    style={styles.backboardInnerShadow}
                    pointerEvents="none"
                  />
                  {nonEmptyShelves.map(({ id, items }) => (
                    <Shelf key={id} shelfId={id} items={items} />
                  ))}
                </View>
              </View>

              {/* base rail */}
              <View style={styles.baseRail}>
                <LinearGradient
                  colors={[CabinetTokens.wood.baseTop, CabinetTokens.wood.baseBottom]}
                  style={[StyleSheet.absoluteFill, { borderBottomLeftRadius: 6, borderBottomRightRadius: 6 }]}
                />
                <View style={styles.baseRailHighlight} />
              </View>
            </View>
            {/* 0 2px 0 gold@0.06 副陰影 */}
            <View style={styles.cabinetUnderGlow} />
          </>
        )}
      </ScrollView>

      {/* Sticky footer: Show me recipes */}
      {inventory.length > 0 && (
        <View style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: Platform.OS === 'ios' ? 16 : 12,
          backgroundColor: OaklandDusk.bg.void,
          borderTopWidth: 0.5,
          borderTopColor: OaklandDusk.bg.border,
        }}>
          <HintBubble
            storageKey={GUIDE_KEYS.MYBAR_CTA}
            visible={guideMyBarCtaVisible}
            onDismiss={() => setGuideMyBarCtaVisible(false)}
            hintType="tap"
            hintColor="charcoal"
          >
            <Pressable
              onPress={() => {
                dismissGuide(GUIDE_KEYS.MYBAR_CTA)
                setGuideMyBarCtaVisible(false)
                setShowStaplesModal(true)
              }}
              disabled={recommendLoading}
              style={{
                backgroundColor: OaklandDusk.brand.gold,
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: 'center',
                opacity: recommendLoading ? 0.7 : 1,
              }}
            >
              {recommendLoading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color={OaklandDusk.bg.void} />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: OaklandDusk.bg.void }}>
                    Finding recipes...
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: OaklandDusk.bg.void }}>
                    Show me recipes
                  </Text>
                  <Text style={{ fontSize: 12, color: OaklandDusk.bg.void, opacity: 0.7, marginTop: 2 }}>
                    Based on your bar
                  </Text>
                </>
              )}
            </Pressable>
          </HintBubble>
        </View>
      )}

      <ScanSourceSheet
        visible={scanSheetVisible}
        onClose={() => setScanSheetVisible(false)}
        onPick={handleScanSourcePick}
      />

      <StaplesModal
        visible={showStaplesModal}
        loading={recommendLoading}
        onConfirm={(staplesKeys) => {
          setShowStaplesModal(false)
          handleSeeRecipes(staplesKeys)
        }}
        onCancel={() => setShowStaplesModal(false)}
      />

      <RegistrationPrompt
        visible={showRegPrompt}
        bottleCount={inventory.length}
        onCreateAccount={() => {
          setShowRegPrompt(false)
          router.push('/login')
        }}
        onDismiss={async () => {
          setShowRegPrompt(false)
          await AsyncStorage.setItem('sipmetry_reg_prompt_dismissed', 'true')
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 2,
    paddingHorizontal: 12,
    paddingBottom: 120,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },

  ambientWash: {
    position: 'absolute',
    top: 120,
    left: '50%',
    marginLeft: -260,
    width: 520,
    height: 520,
  },

  // Masthead 下的 meta 行(視覺修正批 4 拍板 D:數字金色強調;padding 對齊 Masthead 26)
  metaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 9,
    marginTop: 5,
    paddingHorizontal: 26,
    paddingBottom: 14,
  },
  metaNum: {
    fontFamily: V3.fonts.bebas,
    fontSize: 31,
    lineHeight: 34, // Bebas 防裁切:lineHeight ≥ fontSize
    color: OaklandDusk.brand.gold,
  },
  metaUnit: {
    fontFamily: V3.fonts.monoMedium,
    fontSize: 13,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: withAlpha(OaklandDusk.text.primary, 0.85),
  },
  metaDot: {
    fontSize: 14,
    color: withAlpha(OaklandDusk.text.primary, 0.32),
  },
  scanBtn: {
    alignItems: 'center',
    gap: 4,
  },
  // 方形圓角外框:對齊既有 iconBtn 樣式(32×32、radius 8、gold@0.3 border)
  scanFrame: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: withAlpha(OaklandDusk.brand.gold, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanLabel: {
    fontFamily: 'DMMono',
    fontSize: 8,
    letterSpacing: 2,
    color: OaklandDusk.brand.gold,
  },

  // The Cabinet
  cabinet: {
    borderRadius: 6,
    backgroundColor: CabinetTokens.wood.bodyMid,
    shadowColor: CabinetTokens.black,
    shadowOffset: { width: 0, height: 24 },
    shadowRadius: 48,
    shadowOpacity: 0.7,
    elevation: 12,
  },
  grainClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 6,
    overflow: 'hidden',
  },
  cabinetUnderGlow: {
    height: 2,
    backgroundColor: withAlpha(OaklandDusk.brand.gold, 0.06),
  },

  crown: {
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crownTopHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: withAlpha(OaklandDusk.brand.gold, 0.3),
  },
  crownInnerShadow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 6,
  },
  crownLightLine: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 7,
    height: 1,
  },
  crownEmblem: {
    width: 12,
    height: 12,
    transform: [{ rotate: '45deg' }],
    borderWidth: 1,
    borderColor: withAlpha(OaklandDusk.brand.yellow, 0.55),
    backgroundColor: withAlpha(OaklandDusk.brand.gold, 0.1),
    shadowColor: OaklandDusk.brand.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 0.35,
  },

  backboardWrap: {
    paddingHorizontal: 12,
  },
  backboardPanel: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: withAlpha(OaklandDusk.brand.gold, 0.1),
  },
  backboardInnerShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 26,
  },

  baseRail: {
    height: 16,
  },
  baseRailHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: withAlpha(OaklandDusk.brand.gold, 0.2),
  },

  errorBox: {
    padding: 12,
    borderWidth: 1,
    borderColor: OaklandDusk.semantic.error,
    borderRadius: 10,
    marginBottom: 8,
  },
  errorText: {
    ...Type.body,
    color: OaklandDusk.semantic.error,
  },
  emptyBox: {
    padding: 24,
    borderWidth: 1,
    borderColor: OaklandDusk.bg.border,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    ...Type.title,
    color: OaklandDusk.text.primary,
  },
  emptySubtitle: {
    ...Type.body,
    color: OaklandDusk.text.tertiary,
    textAlign: 'center',
  },
})
