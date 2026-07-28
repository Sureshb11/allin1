import { NativeModules } from 'react-native';

// Keeps the device screen on. Android-only for now: the flag lives on the
// Activity window (see KeepAwakeModule.kt). iOS needs its own module setting
// UIApplication.shared.isIdleTimerDisabled — until that exists these are no-ops
// there rather than a crash, so callers don't have to platform-check.
const { KeepAwake } = NativeModules;

export function activateKeepAwake() {
  KeepAwake?.activate?.();
}

export function deactivateKeepAwake() {
  KeepAwake?.deactivate?.();
}
