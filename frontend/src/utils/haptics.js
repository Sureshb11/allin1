// Haptics — the "Kinetic Athlete" tactile layer.
//
// Backed by react-native-haptic-feedback (real iOS Taptic + Android VibrationEffect)
// with a graceful fallback to the built-in Vibration API if the native module isn't
// linked yet (e.g. a JS-only Metro reload before a native rebuild). The public API
// is unchanged, so every existing caller keeps working — it just feels better now,
// including on iOS where the old Vibration tick was too heavy to use.
//
//   import { haptic } from '../utils/haptics';
//   haptic.tick();     // light — taps, likes, chip selects, tab settle
//   haptic.impact();   // medium — primary CTA, score run
//   haptic.success();  // celebratory — win / milestone / Accept
//   haptic.warn();     // attention — invalid action / wicket-out

import { Vibration, Platform } from 'react-native';

const isAndroid = Platform.OS === 'android';

// Load the native module defensively — a missing/unlinked module must degrade to
// Vibration, never crash the import.
let RNHaptic = null;
try { RNHaptic = require('react-native-haptic-feedback').default; } catch (e) { RNHaptic = null; }

const OPTS = { enableVibrateFallback: true, ignoreAndroidSystemSettings: false };

// Try the rich haptic; if the native module is absent or throws, run the supplied
// Vibration fallback so behaviour degrades to the previous (still-fine) experience.
const fire = (type, fallback) => {
  if (RNHaptic) {
    try { RNHaptic.trigger(type, OPTS); return; } catch (e) { /* fall through */ }
  }
  try { fallback && fallback(); } catch (e) { /* no-op */ }
};

export const haptic = {
  // Light tick — high-frequency, low-stakes feedback. Now cross-platform.
  tick() {
    fire('soft', () => { if (isAndroid) Vibration.vibrate(8); });
  },
  // Medium impact — a primary action landed (CTA press, run scored).
  impact() {
    fire('impactMedium', () => { if (isAndroid) Vibration.vibrate(18); });
  },
  // Success — a celebratory outcome (win / milestone / accept).
  success() {
    fire('notificationSuccess', () => Vibration.vibrate(isAndroid ? [0, 24, 60, 40] : [0, 40, 80, 40]));
  },
  // Warn — "wrong / big moment" (wicket, foul, error).
  warn() {
    fire('notificationWarning', () => Vibration.vibrate(isAndroid ? 40 : 60));
  },
};

export default haptic;
