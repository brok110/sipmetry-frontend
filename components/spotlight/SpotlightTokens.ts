export const SPOTLIGHT = {
  PAD_X: 14,          // cutout extends beyond target horizontally
  PAD_Y: 4,           // cutout extends beyond target vertically
  RADIUS: 18,         // cutout corner radius
  ICON_SIZE: 56,      // glass icon diameter
  ICON_GAP: 14,       // gap between cutout edge and icon center
  OVERLAY_OPACITY: 0.74,
  ENTER_DURATION: 200,
  EXIT_DURATION: 150,
  MEASURE_DELAY: 80,  // ms before measuring (wait for layout)
  MEASURE_RETRY: 100, // ms retry delay if first measure returns null
  SPRING: { damping: 20, stiffness: 300, mass: 0.8 },
} as const;

export const GLOW_COLORS = {
  gold:    { outer: 'rgba(200, 148, 74, 0.4)',   inner: 'rgba(200, 148, 74, 0.9)' },
  skyblue: { outer: 'rgba(130, 190, 255, 0.4)',  inner: 'rgba(130, 190, 255, 0.9)' },
} as const;

export const GLASS = {
  bg:        'rgba(36, 32, 25, 0.88)',
  border:    'rgba(232, 188, 120, 0.20)',
  borderTop: 'rgba(232, 220, 196, 0.32)',
} as const;
