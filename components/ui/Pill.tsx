import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import OaklandDusk from '@/constants/OaklandDusk'

type PillVariant = 'default' | 'missing' | 'ready'

interface PillProps {
  label: string
  variant?: PillVariant
}

const variantStyles: Record<PillVariant, { bg: string; color: string }> = {
  default: {
    bg: OaklandDusk.bg.surface,
    color: OaklandDusk.text.secondary,
  },
  missing: {
    bg: 'rgba(192,72,88,0.12)',
    color: OaklandDusk.accent.crimson,
  },
  ready: {
    bg: 'rgba(29,158,117,0.12)',
    color: '#1D9E75',
  },
}

export default function Pill({ label, variant = 'default' }: PillProps) {
  const { bg, color } = variantStyles[variant]

  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  label: {
    fontSize: 11,
  },
})
