import React, { useState } from 'react'
import {
  Modal, View, Text, TextInput, Pressable,
  ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native'
import BottleFillSlider from './BottleFillSlider'

const TOTAL_ML_OPTIONS = [375, 500, 700, 750, 1000, 1750]

type Confidence = 'high' | 'medium' | 'low'

type Props = {
  visible: boolean
  ingredientKey: string
  displayName: string
  initialTotalMl?: number        // pre-fill bottle size if AI detected it
  detectedSizeMl?: number | null // raw AI value (null = not read from label)
  confidence?: Confidence        // AI confidence level
  onClose: () => void
  onConfirm: (payload: {
    ingredient_key: string
    display_name: string
    total_ml: number
    remaining_pct: number
  }) => Promise<void>
}

// "tequila_blanco" → "Tequila Blanco"
function formatIngredientKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function AddToInventoryModal({
  visible,
  ingredientKey,
  displayName,
  initialTotalMl,
  detectedSizeMl,
  confidence,
  onClose,
  onConfirm,
}: Props) {
  const [name, setName] = useState(displayName)
  const [totalMl, setTotalMl] = useState(700)
  const [remainingPct, setRemainingPct] = useState(100)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 每次 Modal 開啟時重置，若有 initialTotalMl 則 pre-fill
  React.useEffect(() => {
    if (visible) {
      setName(displayName)
      setTotalMl(
        initialTotalMl && TOTAL_ML_OPTIONS.includes(initialTotalMl)
          ? initialTotalMl
          : 700
      )
      setRemainingPct(100)
      setError(null)
    }
  }, [visible, displayName, initialTotalMl])

  const handleConfirm = async () => {
    if (!name.trim()) {
      setError('Please enter a name')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await onConfirm({
        ingredient_key: ingredientKey,
        display_name: name.trim(),
        total_ml: totalMl,
        remaining_pct: remainingPct,
      })
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to add. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <Text style={styles.title}>Add to Inventory</Text>

        {/* AI Detection Info — only shown when scanned via camera */}
        {confidence ? (
          <View style={styles.aiRow}>
            <Text style={styles.aiLabel}>🤖 AI detected</Text>
            <View style={styles.aiTags}>
              {/* Type tag */}
              <View style={styles.aiTag}>
                <Text style={styles.aiTagText}>{formatIngredientKey(ingredientKey)}</Text>
              </View>
              {/* Size tag */}
              <View style={styles.aiTag}>
                <Text style={styles.aiTagText}>
                  {detectedSizeMl != null
                    ? `${detectedSizeMl >= 1000 ? (detectedSizeMl / 1000) + 'L' : detectedSizeMl + 'ml'} (from label)`
                    : 'Size not read'}
                </Text>
              </View>
              {/* Confidence badge */}
              <View style={[
                styles.aiTag,
                confidence === 'high' && styles.aiTagHigh,
                confidence === 'medium' && styles.aiTagMedium,
                confidence === 'low' && styles.aiTagLow,
              ]}>
                <Text style={[
                  styles.aiTagText,
                  confidence === 'high' && { color: '#2E7D32' },
                  confidence === 'medium' && { color: '#E65100' },
                  confidence === 'low' && { color: '#C62828' },
                ]}>
                  {confidence === 'high' ? '● High' : confidence === 'medium' ? '◐ Medium' : '○ Low'} confidence
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Item Name */}
        <Text style={styles.label}>Item Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          maxLength={80}
          style={styles.input}
          placeholder="e.g., Hendrick's Gin"
        />

        {/* Bottle Volume */}
        <Text style={styles.label}>Bottle Volume</Text>
        <View style={styles.mlRow}>
          {TOTAL_ML_OPTIONS.map((ml) => (
            <Pressable
              key={ml}
              onPress={() => setTotalMl(ml)}
              style={[
                styles.mlBtn,
                totalMl === ml && styles.mlBtnActive,
              ]}
            >
              <Text style={[
                styles.mlBtnText,
                totalMl === ml && styles.mlBtnTextActive,
              ]}>
                {ml >= 1750 ? '1.75L' : ml >= 1000 ? '1L' : `${ml}ml`}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Bottle fill */}
        <Text style={styles.label}>Remaining</Text>
        <View style={styles.sliderWrapper}>
          <BottleFillSlider
            value={remainingPct}
            onChange={setRemainingPct}
            height={200}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* 按鈕 */}
        <View style={styles.btnRow}>
          <Pressable onPress={onClose} style={styles.cancelBtn} disabled={loading}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>

          <Pressable onPress={handleConfirm} style={styles.confirmBtn} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#FFF" />
              : <Text style={styles.confirmText}>Add to Inventory</Text>
            }
          </Pressable>
        </View>

      </ScrollView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 40,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#444',
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  mlRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  mlBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 20,
  },
  mlBtnActive: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  mlBtnText: {
    fontWeight: '700',
    color: '#444',
  },
  mlBtnTextActive: {
    color: '#FFF',
  },
  // AI detection row
  aiRow: {
    backgroundColor: '#F8F8F8',
    borderRadius: 10,
    padding: 12,
    gap: 6,
    marginBottom: 4,
  },
  aiLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  aiTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  aiTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#EEE',
    borderRadius: 20,
  },
  aiTagHigh: {
    backgroundColor: '#E8F5E9',
  },
  aiTagMedium: {
    backgroundColor: '#FFF3E0',
  },
  aiTagLow: {
    backgroundColor: '#FFEBEE',
  },
  aiTagText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
  },
  sliderWrapper: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  error: {
    color: '#E53935',
    marginTop: 8,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontWeight: '700',
    color: '#444',
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 14,
    backgroundColor: '#111',
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmText: {
    color: '#FFF',
    fontWeight: '900',
  },
})
