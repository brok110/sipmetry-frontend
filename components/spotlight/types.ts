export type TargetRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SpotlightColor = 'gold' | 'skyblue';

export type HintDescriptor = {
  storageKey: string;
  measureFn: () => Promise<TargetRect | null>;
  hintType: 'tap' | 'swipe';
  color: SpotlightColor;
  icon: string | null;
  iconPosition: 'above' | 'below' | 'auto';
  onDismiss?: () => void;
};
