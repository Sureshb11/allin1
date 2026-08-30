// App-wide unread-chat count, for the badge on the header's chat icon.
//
// The same singleton shape as utils/unreadCount (notifications), and for the
// same reason: one number, several headers, and each of them fetching it alone
// would mean N requests and N different answers while they land.
//
// It counts CONVERSATIONS waiting, not messages. Twenty messages in one room is
// still one room to open, and a chat icon reading "20" says the wrong thing
// about how much work is in front of you.
import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import legendsApi from '../services/LegendsApi';
import { onForegroundMessage } from '../services/push';

let rooms = 0;
let inFlight = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(rooms));

export const getUnreadChats = () => rooms;

export function setUnreadChats(n) {
  const next = Math.max(0, Number(n) || 0);
  if (next === rooms) return;
  rooms = next;
  emit();
}

/** Concurrent callers share one request — several headers mount at once. */
export function refreshUnreadChats() {
  if (inFlight) return inFlight;
  inFlight = legendsApi.getUnreadChats()
    .then((res) => { if (res.success) setUnreadChats(res.rooms); })
    .catch(() => {})
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** Wipe on logout, so the next account does not inherit a badge. */
export function clearUnreadChats() {
  rooms = 0;
  emit();
}

/**
 * The count, kept current: refreshed on focus, and the moment a CHAT push
 * arrives while the app is open — the case where the number changes with
 * nobody navigating, which is the whole reason a badge is worth having.
 */
export function useUnreadChats() {
  const [n, setN] = useState(rooms);

  useEffect(() => {
    listeners.add(setN);
    setN(rooms);
    const stop = onForegroundMessage((msg) => {
      if (msg?.data?.type === 'chat') refreshUnreadChats();
    });
    return () => { listeners.delete(setN); stop?.(); };
  }, []);

  useFocusEffect(useCallback(() => { refreshUnreadChats(); }, []));

  return n;
}
