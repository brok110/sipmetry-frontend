import React from 'react'
import { Text, StyleSheet } from 'react-native'
import OaklandDusk from '@/constants/OaklandDusk'

interface SectionLabelProps {
  children: string
}

export default function SectionLabel({ children }: SectionLabelProps) {
  return <Text style={styles.label}>{children}</Text>
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: OaklandDusk.text.tertiary,
    marginTop: 16,
    marginBottom: 8,
  },
})
