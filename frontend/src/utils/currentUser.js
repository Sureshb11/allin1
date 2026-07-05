import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import legendsApi from '../services/LegendsApi';

// Lightweight app-wide cache of the logged-in user's identity so every avatar can
// show the profile photo without each screen re-fetching. Backed by AsyncStorage so
// the avatar shows instantly on next launch, and refreshed from the API in the
// background. Follows the selected-sport singleton pattern.

const AVATAR_KEY = '@ll_avatar';
const NAME_KEY = '@ll_name';

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
  AsyncStorage.multiRemove([AVATAR_KEY, NAME_KEY]).catch(() => {});
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
    };
    AsyncStorage.setItem(AVATAR_KEY, cache.avatarUrl || '');
    AsyncStorage.setItem(NAME_KEY, cache.name || '');
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
      Promise.all([AsyncStorage.getItem(AVATAR_KEY), AsyncStorage.getItem(NAME_KEY)]).then(([av, nm]) => {
        if (!cache && (av || nm)) setUser((prev) => prev || { avatarUrl: av || null, name: nm || '' });
      });
      loadCurrentUser();
    }
    return () => listeners.delete(setUser);
  }, []);
  return user;
}
