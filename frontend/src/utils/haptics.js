// Lightweight haptics — the "Kinetic Athlete" tactile layer.
//
// We use the built-in Vibration API (no native module needed). iOS's Vibration
// has no short-tick and feels heavy, so ticks are Android-only; longer,
// meaningful buzzes (wicket, win) fire on both platforms.
//
//   import { haptic } from '../utils/haptics';
//   haptic.tick();     // light — taps, likes, chip selects
//   haptic.impact();   // medium — primary CTA, score run
//   haptic.success();  // celebratory double-tap — win / milestone
//   haptic.warn();     // attention — invalid action / wicket-out

import { Vibration, Platform } from 'react-native';

const isAndroid = Platform.OS === 'android';

export const haptic = {
  // Light tick — high-frequency, low-stakes feedback. Android only (iOS heavy).
  tick() {
    if (isAndroid) Vibration.vibrate(8);
  },
  // Medium impact — a primary action landed (CTA press, run scored).
  impact() {
    if (isAndroid) Vibration.vibrate(18);
  },
  // Success — a short celebratory double pulse. Both platforms.
  success() {
    Vibration.vibrate(isAndroid ? [0, 24, 60, 40] : [0, 40, 80, 40]);
  },
  // Warn — a single firm buzz for "wrong / big moment" (wicket, foul, error).
  warn() {
    Vibration.vibrate(isAndroid ? 40 : 60);
  },
};

export default haptic;
