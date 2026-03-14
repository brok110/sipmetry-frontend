import React from 'react'
import { View, Text, PanResponder, StyleSheet } from 'react-native'

type Props = {
  value: number          // 0..100
  onChange: (v: number) => void
  height?: number
}

export default function BottleFillSlider({ value, onChange, height = 200 }: Props) {
  const isLow = value <= 5
  const fillColor = isLow ? '#E53935' : '#D4A017'   // 紅 or 琥珀色
  const fillHeight = (value / 100) * height

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const y = e.nativeEvent.locationY
      const pct = Math.round(Math.max(0, Math.min(100, (1 - y / height) * 100)))
      onChange(pct)
    },
    onPanResponderMove: (e) => {
      const y = e.nativeEvent.locationY
      const pct = Math.round(Math.max(0, Math.min(100, (1 - y / height) * 100)))
      onChange(pct)
    },
  })

  const markers = [100, 75, 50, 25]

  return (
    <View style={styles.container}>
      {/* 酒瓶軌道 */}
      <View
        style={[styles.track, { height }]}
        {...panResponder.panHandlers}
      >
        {/* 液體填充 */}
        <View
          style={[
            styles.fill,
            {
              height: fillHeight,
              backgroundColor: fillColor,
            },
          ]}
        />

        {/* 刻度線 */}
        {markers.map((m) => (
          <View
            key={m}
            style={[
              styles.marker,
              { bottom: (m / 100) * height - 1 },
            ]}
          />
        ))}
      </View>

      {/* 百分比標示 */}
      <View style={[styles.labels, { height }]}>
        {markers.map((m) => (
          <Text
            key={m}
            style={[
              styles.label,
              {
                bottom: (m / 100) * height - 8,
                color: value === m ? '#111' : '#999',
                fontWeight: value === m ? '800' : '400',
              },
            ]}
          >
            {m}%
          </Text>
        ))}
      </View>

      {/* 目前數值 */}
      <Text style={[styles.currentValue, { color: isLow ? '#E53935' : '#111' }]}>
        {value}%
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
  },
  track: {
    width: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#CCC',
    backgroundColor: '#F5F5F5',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  fill: {
    width: '100%',
    borderRadius: 22,
  },
  marker: {
    position: 'absolute',
    left: 4,
    right: 4,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  labels: {
    position: 'absolute',
    left: 60,
    top: 0,
  },
  label: {
    position: 'absolute',
    fontSize: 12,
  },
  currentValue: {
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4,
  },
})
