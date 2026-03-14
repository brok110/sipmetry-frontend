import { useLowStockAlert } from '@/context/lowStockAlert'
import React, { useEffect, useRef } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'

export default function LowStockBanner() {
  const { alert, clearAlert } = useLowStockAlert()
  const opacity = useRef(new Animated.Value(0)).current
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!alert) return

    // Fade in
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start()

    // Auto-dismiss after 5 seconds
    timerRef.current = setTimeout(dismiss, 5000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert])

  const dismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    Animated.timing(opacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => clearAlert())
  }

  if (!alert) return null

  return (
    <Animated.View style={[styles.container, { opacity }]} pointerEvents="box-none">
      <View style={styles.banner}>
        <Text style={styles.icon}>⚠️</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {alert.name} is running low ({alert.pct}% left)
          </Text>
          <Text style={styles.subtitle}>Time to restock!</Text>
        </View>
        <Pressable onPress={dismiss} hitSlop={10} style={styles.dismissBtn}>
          <Text style={styles.dismissText}>Got it</Text>
        </Pressable>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    paddingHorizontal: 14,
    paddingTop: 54, // safe area + status bar
    paddingBottom: 4,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  icon: {
    fontSize: 20,
  },
  title: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 14,
  },
  subtitle: {
    color: '#999',
    fontSize: 12,
    marginTop: 2,
  },
  dismissBtn: {
    paddingHorizontal: 4,
  },
  dismissText: {
    color: '#D4A017',
    fontWeight: '800',
    fontSize: 13,
  },
})
