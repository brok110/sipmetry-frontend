import PhotoCabinet from '@/components/cabinet/PhotoCabinet'
import HintBubble, { GUIDE_KEYS, dismissGuide, isGuideDismissed } from '@/components/GuideBubble'
import Masthead from '@/components/Masthead'
import RegistrationPrompt from '@/components/RegistrationPrompt'
import ScanSourceSheet, { ScanSourceResult } from '@/components/ScanSourceSheet'
import StaplesModal, { DEFAULT_STAPLES } from '@/components/StaplesModal'
import { withAlpha } from '@/constants/cabinetTokens'
import OaklandDusk from '@/constants/OaklandDusk'
import Type from '@/constants/typography'
import { V3 } from '@/constants/v3DesignTokens'
import { useAuth } from '@/context/auth'
import { useInventory } from '@/context/inventory'
import { apiFetch } from '@/lib/api'
import { groupBottlesByShelf } from '@/lib/cabinet'
import { pickBottlePhotoFromCamera, pickBottlePhotoFromLibrary } from '@/lib/pickBottlePhoto'
import AsyncStorage from '@react-native-async-storage/async-storage'
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
import Svg, { Circle, Path } from 'react-native-svg'

// 開發用:改成 true 可以在自己的帳號上預覽「新使用者的空酒櫃」(只在開發版生效,看完改回 false)——同 PhotoCabinet 的 SHOW_DEBUG_LINES
const DEV_PREVIEW_EMPTY_BAR = false
const NO_BOTTLES: ReturnType<typeof useInventory>['inventory'] = []

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

// ── Screen:My Bar 酒櫃(CABINET-3A §C4)───────────────────────────────────────
export default function MyBarScreen() {
  const { session, isAnonymous } = useAuth()
  const {
    inventory,
    availableIngredientKeys,
    loading,
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

  // 下拉轉圈只跟手指走:背景重抓(進頁、回前景、編輯後補抓)不碰它(SILENT-REFRESH)
  const [pulling, setPulling] = useState(false)
  const handleRefresh = () => {
    setPulling(true)
    refreshInventory({ silent: true, notifyLowStock: true })
      .catch(() => {})
      .finally(() => setPulling(false))
  }

  // ── Cabinet 分組(lib/cabinet):一瓶一張照片瓶;PhotoCabinet 再併成 6 層 ──────
  // 畫面用的庫存(DEV_PREVIEW_EMPTY_BAR 時當作空的;資料與其他邏輯照舊用真的 inventory)
  const viewInventory = __DEV__ && DEV_PREVIEW_EMPTY_BAR ? NO_BOTTLES : inventory
  const shelvesById = useMemo(() => groupBottlesByShelf(viewInventory), [viewInventory])
  const totalBottles = useMemo(
    () => [...shelvesById.values()].reduce((n, units) => n + units.length, 0),
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

  // CABINET-PHOTO Stage 5(四)(Brok 2026-09-26):一律照片酒櫃,舊的畫出來的櫃子退場。
  // 空庫存(新使用者)= 空的照片酒櫃 + 標頭 YOUR BAR IS EMPTY + 底部 Scan your bottles(引導先拍照);空層不寫 + ADD、點層也是去拍照。
  // 載入出錯:錯誤訊息疊在標頭下,櫃子照舊畫手上的資料。
  const barIsEmpty = viewInventory.length === 0 && !error
  return (
    <View style={{ flex: 1, backgroundColor: OaklandDusk.bg.void }}>
      {/* Masthead:共用元件(logo 24、tap → Bartender),SCAN 鈕走 actions 槽;浮在木牆上,下方僅留 meta 行 */}
      <View pointerEvents="box-none" style={styles.photoTopOverlay}>
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
        {/* 定案 mockup 第 7 點:只留 N BOTTLES(照片櫃固定 6 層,不數層);空庫存改寫 YOUR BAR IS EMPTY */}
        <View style={styles.metaRow}>
          {barIsEmpty ? (
            <Text style={styles.metaEmpty}>Your bar is empty</Text>
          ) : (
            <React.Fragment>
              <Text style={styles.metaNum}>{totalBottles}</Text>
              <Text style={styles.metaUnit}>{totalBottles === 1 ? 'bottle' : 'bottles'}</Text>
            </React.Fragment>
          )}
        </View>
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Couldn't load your bar just now — pull down to try again.</Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.photoContainer}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={pulling} onRefresh={handleRefresh} tintColor={OaklandDusk.brand.gold} />
        }
      >

        <PhotoCabinet shelves={shelvesById} onEmptyBarPress={barIsEmpty ? promptScanBottles : undefined} />
      </ScrollView>

      {/* Stage 5(四):空庫存 → 同一個位置放 Scan your bottles(原本空狀態的引導泡泡搬過來) */}
      {barIsEmpty && (
        <View style={styles.footer}>
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
              accessibilityRole="button"
              style={styles.footerButton}
            >
              <Text style={styles.footerTitle}>Scan your bottles</Text>
              <Text style={styles.footerSubtitle}>Start with what you already own</Text>
            </Pressable>
          </HintBubble>
        </View>
      )}

      {/* Sticky footer: Show me recipes */}
      {viewInventory.length > 0 && (
        <View style={styles.footer}>
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
                borderRadius: 14,
                alignItems: 'center',
                opacity: recommendLoading ? 0.7 : 1,
              }}
            >
              {recommendLoading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color={OaklandDusk.bg.void} />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: OaklandDusk.bg.void }}>
                    Seeing what you can make…
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
  // CABINET-PHOTO Stage 2:masthead + meta 行浮在木牆上;牆全幅,不留邊
  photoTopOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  photoContainer: {
    padding: 0,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 16 : 12,
  },
  footerButton: {
    backgroundColor: OaklandDusk.brand.gold,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  footerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: OaklandDusk.bg.void,
  },
  footerSubtitle: {
    fontSize: 12,
    color: OaklandDusk.bg.void,
    opacity: 0.7,
    marginTop: 2,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
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
  // 空庫存的 meta 行:同 metaUnit 的字,稍大
  metaEmpty: {
    fontFamily: V3.fonts.monoMedium,
    fontSize: 15,
    lineHeight: 34,
    letterSpacing: 2.8,
    textTransform: 'uppercase',
    color: withAlpha(OaklandDusk.text.primary, 0.85),
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

  errorBox: {
    marginHorizontal: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: OaklandDusk.semantic.error,
    borderRadius: 14,
    backgroundColor: OaklandDusk.bg.void,
  },
  errorText: {
    ...Type.body,
    color: OaklandDusk.semantic.error,
  },
})
