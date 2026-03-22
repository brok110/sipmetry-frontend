import React from 'react'
import { View } from 'react-native'
import Svg, { Circle, Text as SvgText } from 'react-native-svg'
import OaklandDusk from '@/constants/OaklandDusk'

interface LevelRingProps {
  percent: number
  size?: number
}

export default function LevelRing({ percent, size = 36 }: LevelRingProps) {
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clampedPercent = Math.min(100, Math.max(0, percent))
  const strokeDashoffset = `${circumference * (1 - clampedPercent / 100)}`
  const fillColor =
    clampedPercent >= 20 ? OaklandDusk.brand.gold : OaklandDusk.accent.crimson

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* Background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={OaklandDusk.bg.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={fillColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
        {/* Centre percentage label */}
        <SvgText
          x={size / 2}
          y={size / 2 + 4}
          textAnchor="middle"
          fontSize="9"
          fontWeight="600"
          fill={fillColor}
        >
          {Math.round(clampedPercent)}
        </SvgText>
      </Svg>
    </View>
  )
}
