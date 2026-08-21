import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import legendsApi from '../services/LegendsApi';

// Lightweight app-wide cache of the logged-in user's identity so every avatar can
// show the profile photo without each screen re-fetching. Backed by AsyncStorage so
// the avatar shows instantly on next launch, and refreshed from the API in the
// background. Follows the selected-sport singleton pattern.

const AVATAR_KEY = '@ll_avatar';
const NAME_KEY = '@ll_name';
// The id has to survive a cold start too. Hydrating only name+avatar left the
// cached user id-less until /users/me answered, and screens that ask "is this
// mine?" got a confident no in the meantime — your own Scout listing offered
// you a Connect button. If that request failed, it never corrected.
const ID_KEY = '@ll_uid';
const SPORTS_KEY = '@ll_sports';

let cache = null;                 // { id, name, avatarUrl }
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(cache));

export function getCurrentUser() {
  return cache;
}

// Wipe the cached identity on logout — the module cache and storage keys would
// otherwise survive an account switch, leaving the OLD user's id/name/avatar
// visible to the next login (this made spectators look like the scorer).
export function clearCurrentUser() {
  cache = null;
  AsyncStorage.multiRemove([AVATAR_KEY, NAME_KEY, ID_KEY, SPORTS_KEY]).catch(() => {});
  emit();
}

// Optimistically update the avatar everywhere (e.g. right after an upload).
export function setCurrentAvatar(url) {
  cache = { ...(cache || {}), avatarUrl: url || null };
  if (url) AsyncStorage.setItem(AVATAR_KEY, url); else AsyncStorage.removeItem(AVATAR_KEY);
  emit();
}

export async function loadCurrentUser(force = false) {
  if (cache && !force) return cache;
  const res = await legendsApi.getUserProfile();
  if (res?.success) {
    const u = res.data || {};
    cache = {
      id: u.id,
      name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
      avatarUrl: u.avatarUrl || null,
      sports: res.sports || [],
    };
    AsyncStorage.setItem(AVATAR_KEY, cache.avatarUrl || '');
    AsyncStorage.setItem(NAME_KEY, cache.name || '');
    AsyncStorage.setItem(ID_KEY, cache.id || '');
    AsyncStorage.setItem(SPORTS_KEY, JSON.stringify(cache.sports));
    emit();
  }
  return cache;
}

// Hook: returns the cached user, hydrating instantly from storage then refreshing.
export function useCurrentUser() {
  const [user, setUser] = useState(cache);
  useEffect(() => {
    listeners.add(setUser);
    if (cache) setUser(cache);
    else {
      // Instant hydrate from storage, then refresh from the API.
      Promise.all([
        AsyncStorage.getItem(AVATAR_KEY),
        AsyncStorage.getItem(NAME_KEY),
        AsyncStorage.getItem(ID_KEY),
        AsyncStorage.getItem(SPORTS_KEY),
      ]).then(([av, nm, id, sp]) => {
        if (!cache && (av || nm || id || sp)) {
          let sports = [];
          try { if (sp) sports = JSON.parse(sp) || []; } catch {}
          setUser((prev) => prev || { id: id || undefined, avatarUrl: av || null, name: nm || '', sports });
        }
      });
      loadCurrentUser();
    }
    return () => listeners.delete(setUser);
  }, []);
  return user;
}
