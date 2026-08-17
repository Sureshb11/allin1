// Shot capture that cannot cost the scorer a ball.
//
// Every shot goes into a durable queue FIRST and is sent from there. The caller
// never awaits a network round trip, never sees an error, and never has a code
// path where a failed shot can interrupt scoring — enqueue() returns
// synchronously and the send happens behind it.
//
// The queue survives the app being killed, because the realistic failure here is
// not a flaky second, it is a ground with no signal for an hour and a scorer who
// closes the app on the way home. Rows sit in AsyncStorage until they land.
//
// Keyed by the delivery's own clientEventId — the same idempotency key the ball
// was written with. The server upserts on it, so re-sending a shot that actually
// landed is harmless, which is what lets this retry as bluntly as it does.

import AsyncStorage from '@react-native-async-storage/async-storage';
import legendsApi from '../services/LegendsApi';

const KEY = 'll_shot_queue_v1';

// A wagon wheel is small; a stuck queue should not grow without limit. At six
// balls an over this is well over a full match, and the oldest entries are the
// ones least worth keeping if something has gone badly wrong.
const MAX_QUEUED = 400;

let mem = [];          // in-memory mirror, so enqueue() never has to await a read
let loaded = false;
let flushing = false;
let onPermanentDrop = null;   // told when a shot is discarded for a fixable reason

/**
 * Register a handler for shots dropped permanently (bad session, wrong scorer).
 *
 * Deliberately NOT called for a delivery the scorer undid — that drop is
 * expected and warning about it would be noise. Pass null to clear.
 */
export const setShotDropHandler = (fn) => { onPermanentDrop = fn; };

const persist = () => AsyncStorage.setItem(KEY, JSON.stringify(mem)).catch(() => {});

/** Load anything left over from a previous session. Safe to call repeatedly. */
export const loadShotQueue = async () => {
  if (loaded) return mem.length;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    mem = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(mem)) mem = [];
  } catch {
    mem = [];
  }
  return mem.length;
};

/**
 * Record a shot. Returns immediately; never throws.
 *
 * `shot` needs the delivery's clientEventId plus whatever the scorer answered.
 * Re-recording the same delivery REPLACES the queued entry rather than adding a
 * second — the scorer refining "cover" into "cover, cover drive" is one shot
 * being edited, and sending both would be two writes racing to be last.
 */
export const enqueueShot = (matchId, shot) => {
  if (!matchId || !shot?.clientEventId) return;
  const row = { matchId, ...shot, queuedAt: Date.now() };
  const at = mem.findIndex((r) => r.clientEventId === shot.clientEventId);
  if (at >= 0) mem[at] = { ...mem[at], ...row };
  else mem.push(row);
  if (mem.length > MAX_QUEUED) mem = mem.slice(-MAX_QUEUED);
  persist();
  // Fire the send behind the caller. No await, no .then that touches UI state.
  flushShotQueue();
};

/**
 * Try to send everything pending.
 *
 * Runs one at a time and stops at the first network failure: if the ground has
 * no signal, hammering the remaining forty is pointless and costs battery. The
 * next enqueue (or the next call from the screen) picks up where this left off.
 */
export const flushShotQueue = async () => {
  if (flushing) return;
  if (!loaded) await loadShotQueue();
  if (!mem.length) return;
  flushing = true;
  try {
    while (mem.length) {
      const row = mem[0];
      const { matchId, queuedAt, ...payload } = row;
      let res;
      try {
        res = await legendsApi.recordShot(matchId, payload);
      } catch {
        break;                        // network — keep the row, try again later
      }
      if (res?.success) {
        // Only drop the row we ACTUALLY sent.
        //
        // enqueueShot replaces mem[at] with a NEW object when the same delivery
        // is recorded again, and that happens constantly: the sheet's whole flow
        // is "tap the wheel, then tap a shot type", a second or so apart, which
        // lands squarely inside this await. A blind shift() removed the UPDATED
        // row after sending the OLD one — so the shot type was silently thrown
        // away on every capture where the scorer answered both halves, which is
        // to say on the ones where they did the most work.
        //
        // Identity comparison is what makes this work: an untouched row is the
        // same object, a corrected one is not. If it changed, leave it in place
        // and let the loop send the newer version on the next turn.
        if (mem[0] === row) mem.shift();
        persist();
        continue;
      }
      // No identity check on either branch below, deliberately, unlike the
      // success case above: a 404 means the ball is gone, a 403 means this
      // device is not the scorer, and correcting the shot changes neither.
      // Re-sending an edited version would just fail again and spin the queue.

      // The delivery was undone by the scorer. Dropping its shot is correct AND
      // expected — they took the ball off the board themselves, so there is
      // nothing to tell them.
      if (res?.code === 'BALL_GONE') {
        mem.shift();
        persist();
        continue;
      }

      // Anything else permanent is the scorer's work being thrown away for a
      // reason they could act on — an expired session, or a device that is not
      // the assigned scorer. Silence here meant they tapped the wheel, watched
      // it highlight, closed the sheet believing it was recorded, and found out
      // never. Not blocking scoring is right; not telling them is not.
      if (res?.permanent) {
        mem.shift();
        persist();
        try { onPermanentDrop?.(res); } catch { /* a warning must not break the queue */ }
        continue;
      }
      break;                          // anything else: leave it and back off
    }
  } finally {
    flushing = false;
  }
};

// Deliberately no dropShotsForMatch() / pendingShotCount() here. Both were
// written and both turned out to have no caller: a shot whose delivery is gone
// (undo, discarded innings, re-taken toss) already resolves itself — the server
// answers BALL_GONE and the loop above drops it. An unused export is a promise
// to keep something working that nothing exercises.

export default { loadShotQueue, enqueueShot, flushShotQueue, setShotDropHandler };
