import React, { useCallback } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
} from 'react-native-reanimated'

type Props = {
  value: number
  onChange: (v: number) => void
  height?: number
}

function snapTo5(pct: number): number {
  'worklet'
  return Math.round(pct / 5) * 5
}

function clampPct(y: number, height: number): number {
  'worklet'
  const raw = (1 - y / height) * 100
  return Math.max(0, Math.min(100, raw))
}

export default function BottleFillSlider({ value, onChange, height = 200 }: Props) {
  const fillPct = useSharedValue(value)

  React.useEffect(() => {
    fillPct.value = value
  }, [value])

  const stableOnChange = useCallback((v: number) => {
    onChange(v)
  }, [onChange])

  const gesture = Gesture.Pan()
    .onBegin((e) => {
      'worklet'
      const pct = clampPct(e.y, height)
      fillPct.value = pct
    })
    .onUpdate((e) => {
      'worklet'
      const pct = clampPct(e.y, height)
      fillPct.value = pct
    })
    .onEnd(() => {
      'worklet'
      const snapped = snapTo5(fillPct.value)
      fillPct.value = withTiming(snapped, { duration: 80 })
      runOnJS(stableOnChange)(snapped)
    })
    .hitSlop({ top: 20, bottom: 20, left: 30, right: 30 })
    .minDistance(0)

  const fillStyle = useAnimatedStyle(() => {
    const isLow = fillPct.value <= 5
    return {
      height: (fillPct.value / 100) * height,
      backgroundColor: isLow ? '#E53935' : '#D4A017',
    }
  })

  const isLow = value <= 5
  const markers = [100, 75, 50, 25]

  return (
    <View style={styles.container}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.track, { height }]}>
          <Animated.View style={[styles.fill, fillStyle]} />

          {markers.map((m) => (
            <View
              key={m}
              style={[
                styles.marker,
                { bottom: (m / 100) * height - 1 },
              ]}
            />
          ))}
        </Animated.View>
      </GestureDetector>

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
