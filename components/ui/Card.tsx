import React from 'react'
import { Pressable, View, StyleSheet, ViewStyle } from 'react-native'
import OaklandDusk from '@/constants/OaklandDusk'

interface CardProps {
  children: React.ReactNode
  onPress?: () => void
  style?: ViewStyle
}

export default function Card({ children, onPress, style }: CardProps) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, style, pressed && styles.pressed]}
      >
        {children}
      </Pressable>
    )
  }

  return <View style={[styles.card, style]}>{children}</View>
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: OaklandDusk.bg.card,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  pressed: {
    opacity: 0.75,
  },
})
