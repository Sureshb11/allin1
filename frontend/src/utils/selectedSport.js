/**
 * The active sport, shared app-wide.
 *
 * Set by the Arena picker (and the profile sport switcher) and read by every
 * sport-scoped screen to filter its data. Kept as a module-level singleton so
 * screens can read it synchronously during render, without threading it through
 * navigation params (which break when navigators reuse cached state).
 *
 * It is ALSO persisted: this used to be memory-only, so every app restart reset
 * it to null. Screens then passed no sport filter at all and quietly fell back
 * to unfiltered data — the selection looked sticky (the app reopened on the
 * right feed) while the filtering silently wasn't.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'll_selected_sport';

let _sport  = null;
let _format = null;

export const setSelectedSport = (sport, format) => {
  _sport  = sport  || null;
  _format = format || null;
  // Fire-and-forget: a storage failure must never block navigation.
  AsyncStorage.setItem(KEY, JSON.stringify({ sport: _sport, format: _format })).catch(() => {});
};

export const getSelectedSport = () => ({ sport: _sport, format: _format });

/**
 * Restore the last selection on launch. Call once before the app renders, so the
 * first screens already filter correctly. Safe to call more than once.
 */
export const loadSelectedSport = async () => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const { sport, format } = JSON.parse(raw) || {};
      // Don't clobber a selection made while this read was in flight.
      if (!_sport && sport) { _sport = sport; _format = format || null; }
    }
  } catch { /* ignore — falls back to "no sport", i.e. the previous behaviour */ }
  return { sport: _sport, format: _format };
};
