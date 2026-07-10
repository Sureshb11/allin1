// Tiny SFX loader — wraps react-native-sound so screens can fire a one-shot UI
// sound without juggling load state, and so a missing/native-unlinked module
// degrades to a silent no-op instead of crashing the JS bundle.

let Sound = null;
try {
  Sound = require('react-native-sound').default;
} catch (e) {
  Sound = null; // native module not linked (e.g. running an older build) → stay silent
}

let batHit = null;
let ready = false;
let initStarted = false;

// Prepare the bat-hit clip once. Safe to call repeatedly; only the first runs.
export function initSfx() {
  if (!Sound || initStarted) return;
  initStarted = true;
  try {
    // 'Ambient' → obeys the iOS mute switch / Android notification volume and
    // mixes with other audio, so a UI blip never hijacks the device.
    Sound.setCategory('Ambient');
  } catch (e) {}
  // 'bat_hit.mp3' resolves to res/raw/bat_hit on Android and the main bundle on iOS.
  batHit = new Sound('bat_hit.mp3', Sound.MAIN_BUNDLE, (err) => {
    if (err) { batHit = null; return; }
    ready = true;
    batHit.setVolume(0.85);
  });
}

// Play the bat-hit, rewound so rapid repeats always retrigger from the start.
export function playBatHit() {
  if (!batHit || !ready) return;
  batHit.stop(() => batHit.play());
}

// Release native resources when a screen using SFX unmounts.
export function releaseSfx() {
  if (batHit) { try { batHit.release(); } catch (e) {} }
  batHit = null;
  ready = false;
  initStarted = false;
}
