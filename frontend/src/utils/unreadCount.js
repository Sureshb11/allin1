// App-wide unread-notification count, for the badge on the header's bell.
//
// A singleton with subscribers, the same shape as utils/currentUser: the count
// is one number that several headers show at once, and each of them fetching it
// on its own would mean N requests for one answer and N different answers while
// they land.
//
// The server has always returned it — GET /notifications carries `unread`, and
// the Notification model has an index whose comment says "Unread badge counts".
// Nothing had ever drawn the badge.
import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import legendsApi from '../services/LegendsApi';
import { onForegroundMessage } from '../services/push';

let count = 0;
let inFlight = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(count));

export const getUnreadCount = () => count;

/** Set it directly — the bell screen knows the answer after a read-all. */
export function setUnreadCount(n) {
  const next = Math.max(0, Number(n) || 0);
  if (next === count) return;
  count = next;
  emit();
}

/** Nudge it without a round trip, e.g. after marking one notification read. */
export function bumpUnreadCount(delta) {
  setUnreadCount(count + delta);
}

/**
 * Refresh from the server. Concurrent callers share one request: several
 * headers mount at once when a tab pager renders its neighbours, and they would
 * otherwise fire the same fetch three times on every focus.
 */
export function refreshUnreadCount() {
  if (inFlight) return inFlight;
  // limit:1 — only the `unread` total is wanted here, not the page of rows the
  // bell screen fetches for itself.
  inFlight = legendsApi.getNotifications({ limit: 1 })
    .then((res) => { if (res.success) setUnreadCount(res.unread); })
    .catch(() => {})
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** Wipe on logout, so the next account does not inherit a badge. */
export function clearUnreadCount() {
  count = 0;
  emit();
}

/**
 * The count, kept current: refreshed whenever the screen regains focus and the
 * moment a push arrives while the app is open. A push is what makes the badge
 * worth having — it is the case where the number changes with nobody navigating.
 */
export function useUnreadCount() {
  const [n, setN] = useState(count);

  useEffect(() => {
    listeners.add(setN);
    setN(count);
    const stop = onForegroundMessage(() => refreshUnreadCount());
    return () => { listeners.delete(setN); stop?.(); };
  }, []);

  useFocusEffect(useCallback(() => { refreshUnreadCount(); }, []));

  return n;
}
