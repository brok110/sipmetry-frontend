import OaklandDusk from '@/constants/OaklandDusk'
import React from 'react'
import {
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native'

type Props = {
  visible: boolean
  bottleCount: number
  onCreateAccount: () => void
  onDismiss: () => void
}

export default function RegistrationPrompt({
  visible,
  bottleCount,
  onCreateAccount,
  onDismiss,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'flex-end',
        }}
        onPress={onDismiss}
      >
        <Pressable
          style={{
            backgroundColor: OaklandDusk.bg.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 28,
            gap: 16,
          }}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Handle bar */}
          <View style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: OaklandDusk.bg.border,
            alignSelf: 'center',
            marginBottom: 4,
          }} />

          <Text style={{
            fontSize: 20,
            fontWeight: '800',
            color: OaklandDusk.text.primary,
            textAlign: 'center',
          }}>
            Keep your bar safe
          </Text>

          <Text style={{
            color: OaklandDusk.text.secondary,
            textAlign: 'center',
            lineHeight: 22,
            fontSize: 15,
          }}>
            Create an account to protect your{' '}
            <Text style={{ color: OaklandDusk.brand.gold, fontWeight: '700' }}>
              {bottleCount} {bottleCount === 1 ? 'bottle' : 'bottles'}
            </Text>
            . Switch phones without losing anything.
          </Text>

          <Pressable
            onPress={onCreateAccount}
            style={{
              backgroundColor: OaklandDusk.brand.gold,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
              marginTop: 4,
            }}
          >
            <Text style={{
              color: OaklandDusk.bg.void,
              fontWeight: '800',
              fontSize: 16,
            }}>
              Create Account
            </Text>
          </Pressable>

          <Pressable
            onPress={onDismiss}
            style={{
              borderWidth: 1,
              borderColor: OaklandDusk.bg.border,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
            }}
          >
            <Text style={{
              color: OaklandDusk.text.secondary,
              fontWeight: '600',
              fontSize: 16,
            }}>
              Maybe Later
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
