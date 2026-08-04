// Whether to ask "do you play?" on the way into a sport.
//
// The Arena picker is shown on EVERY launch, so the step behind it has to be
// answerable once and then stay quiet — including for the person who answers
// "I'm just watching". A parent opening the app to follow their kid's match
// must never be asked again what kind of bowler they are.
//
// One key holding a small map rather than a key per sport, so logging out can
// clear it in a single call — the next account has to be asked for itself.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@ll_player_setup';

// Only cricket. The step asks for a batting hand and a bowling style, which are
// cricket's questions — offering them for football would be worse than not
// asking. Other sports go straight in until they have questions of their own.
const ASKS = ['cricket'];

let cache = null;                 // { [sport]: 'player' | 'watching' }

async function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse((await AsyncStorage.getItem(KEY)) || '{}') || {};
  } catch {
    cache = {};
  }
  return cache;
}

/** Has this person already said whether they play this sport? */
export async function needsPlayerSetup(sport) {
  if (!ASKS.includes(sport)) return false;
  const answered = await load();
  return !answered[sport];
}

/** Remember the answer — 'player' or 'watching'. Both mean "don't ask again". */
export async function markPlayerSetup(sport, answer) {
  const answered = await load();
  cache = { ...answered, [sport]: answer };
  AsyncStorage.setItem(KEY, JSON.stringify(cache)).catch(() => {});
}

/** Logout. The next person to sign in on this phone is a different person. */
export function clearPlayerSetup() {
  cache = null;
  AsyncStorage.removeItem(KEY).catch(() => {});
}
