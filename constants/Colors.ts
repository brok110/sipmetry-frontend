import OaklandDusk from './OaklandDusk'

const tintColorLight = '#2f95dc';

export default {
  light: {
    text: '#000',
    background: '#fff',
    tint: tintColorLight,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text:            OaklandDusk.text.primary,
    background:      OaklandDusk.bg.void,
    tint:            OaklandDusk.brand.gold,
    tabIconDefault:  OaklandDusk.text.tertiary,
    tabIconSelected: OaklandDusk.brand.gold,
  },
};
