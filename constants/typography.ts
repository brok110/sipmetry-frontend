import type { TextStyle } from 'react-native';

const Type = {
  display: { fontFamily: 'EBGaramond', fontSize: 34, letterSpacing: 0, lineHeight: 40 },
  title:   { fontFamily: 'EBGaramond', fontSize: 22, letterSpacing: 0, lineHeight: 28 },
  heading: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  body:    { fontSize: 15, lineHeight: 24 },
  label:   { fontFamily: 'DMMono', fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  caption: { fontSize: 12, lineHeight: 16 },
  button:  { fontSize: 15, fontWeight: '600' },
} as const satisfies Record<string, TextStyle>;

export default Type;
