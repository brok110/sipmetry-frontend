import { CABINET_PHOTO, cabinetPhotoScale } from '@/constants/cabinetTokens'
import OaklandDusk from '@/constants/OaklandDusk'
import React from 'react'
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native'

// CABINET-PHOTO Stage 2:照片酒櫃的背景層。
// 渲染契約:width = 螢幕寬、height = 寬 × sourceHeight / sourceWidth、頂端對齊;
// 不用 cover / contain(置中裁切會讓 CABINET_PHOTO 的座標全錯)。
// __DEV__ 下畫 6 條除錯線,每條必須壓在層板頂緣上 —— 這是渲染契約的驗收。

function assertAssetMatchesTokens() {
  const asset = Image.resolveAssetSource(CABINET_PHOTO.background)
  if (asset.width !== CABINET_PHOTO.sourceWidth || asset.height !== CABINET_PHOTO.sourceHeight) {
    throw new Error(
      `CABINET_PHOTO: asset is ${asset.width}x${asset.height} but tokens say ` +
        `${CABINET_PHOTO.sourceWidth}x${CABINET_PHOTO.sourceHeight}; re-run measure_shelves.py and replace the tokens`,
    )
  }
}

export default function PhotoCabinet() {
  const { width } = useWindowDimensions()
  const scale = cabinetPhotoScale(width)
  const height = CABINET_PHOTO.sourceHeight * scale

  if (__DEV__) assertAssetMatchesTokens()

  return (
    <View style={{ width, height }}>
      <Image source={CABINET_PHOTO.background} style={{ width, height }} resizeMode="stretch" />
      {__DEV__ &&
        CABINET_PHOTO.shelfTopY.map((y) => (
          <View
            key={y}
            pointerEvents="none"
            style={[
              styles.debugLine,
              {
                top: y * scale,
                left: CABINET_PHOTO.shelfLeftX * scale,
                width: (CABINET_PHOTO.shelfRightX - CABINET_PHOTO.shelfLeftX + 1) * scale,
              },
            ]}
          />
        ))}
    </View>
  )
}

const styles = StyleSheet.create({
  debugLine: {
    position: 'absolute',
    height: 1,
    backgroundColor: OaklandDusk.accent.crimson,
  },
})
