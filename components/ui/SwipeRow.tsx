import React, { useRef } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import OaklandDusk from '@/constants/OaklandDusk'

interface SwipeRowProps {
  children: React.ReactNode
  onEdit?: () => void
  onDelete?: () => void
  deleteLabel?: string
  onSwipeOpen?: () => void
}

export default function SwipeRow({
  children,
  onEdit,
  onDelete,
  deleteLabel = 'Delete',
  onSwipeOpen,
}: SwipeRowProps) {
  const swipeableRef = useRef<Swipeable>(null)

  const close = () => swipeableRef.current?.close()

  const renderRightActions = () => {
    return (
      <View style={styles.actionsContainer}>
        {onEdit && (
          <Pressable
            style={styles.editAction}
            onPress={() => {
              close()
              onEdit()
            }}
          >
            <Text style={styles.actionText}>Edit</Text>
          </Pressable>
        )}
        {onDelete && (
          <Pressable
            style={styles.deleteAction}
            onPress={() => {
              close()
              onDelete()
            }}
          >
            <Text style={styles.actionText}>{deleteLabel}</Text>
          </Pressable>
        )}
      </View>
    )
  }

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
      onSwipeableOpen={() => { if (onSwipeOpen) onSwipeOpen() }}
    >
      {children}
    </Swipeable>
  )
}

const styles = StyleSheet.create({
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 8,
  },
  editAction: {
    backgroundColor: OaklandDusk.bg.surface,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  deleteAction: {
    backgroundColor: OaklandDusk.accent.crimson,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
  },
  actionText: {
    color: OaklandDusk.text.primary,
    fontSize: 13,
    fontWeight: '600',
  },
})
