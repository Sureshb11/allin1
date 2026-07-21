// push.js — FCM registration + message handling for the app.
//
// Flow: once signed in we ask for notification permission, hand the resulting
// FCM token to the backend (/devices/register), and keep it fresh when FCM
// rotates it. The backend then mirrors every in-app notification (match live,
// results, awards, tournaments, milestones) to the device.
//
// Everything here is best-effort and defensive: a device with no Play Services,
// a denied permission, or a backend that's down must never break app start-up.
//
// Uses the RN Firebase MODULAR API (getMessaging(getApp()) + free functions).
// The old namespaced form (messaging().getToken() …) is deprecated in v22 and
// logs a console warning on every call.

import { Platform, PermissionsAndroid } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import {
  getMessaging, getToken, onMessage, onTokenRefresh, requestPermission,
  AuthorizationStatus,
} from '@react-native-firebase/messaging';
import legendsApi from './LegendsApi';

// One messaging instance for the default app, resolved lazily so a device
// without Firebase/Play Services fails inside a try rather than at import.
const fcm = () => getMessaging(getApp());

let currentToken = null;      // remembered so we can unregister on sign-out
let unsubscribeRefresh = null;

// Android 13+ needs the runtime POST_NOTIFICATIONS grant; older Androids and
// iOS fall back to the Firebase permission prompt.
async function ensurePermission() {
  try {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const res = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      return res === PermissionsAndroid.RESULTS.GRANTED;
    }
    const status = await requestPermission(fcm());
    return (
      status === AuthorizationStatus.AUTHORIZED ||
      status === AuthorizationStatus.PROVISIONAL
    );
  } catch (e) {
    console.warn('[push] permission request failed:', e.message);
    return false;
  }
}

/**
 * Call once the user is authenticated. Safe to call repeatedly — re-registering
 * the same token is an upsert on the backend.
 */
export async function registerForPush() {
  try {
    if (!(await ensurePermission())) {
      console.log('[push] notification permission not granted');
      return null;
    }

    const token = await getToken(fcm());
    if (!token) return null;

    currentToken = token;
    await legendsApi.registerDevice(token, Platform.OS);

    // FCM rotates tokens; push the new one straight through.
    unsubscribeRefresh?.();
    unsubscribeRefresh = onTokenRefresh(fcm(), async (next) => {
      currentToken = next;
      await legendsApi.registerDevice(next, Platform.OS);
    });

    return token;
  } catch (e) {
    console.warn('[push] registration failed:', e.message);
    return null;
  }
}

/** Call on sign-out so the next user on this device doesn't get our pushes. */
export async function unregisterFromPush() {
  try {
    unsubscribeRefresh?.();
    unsubscribeRefresh = null;
    if (currentToken) await legendsApi.unregisterDevice(currentToken);
    currentToken = null;
  } catch (e) {
    console.warn('[push] unregister failed:', e.message);
  }
}

/**
 * Foreground messages. Android only shows a tray notification when the app is
 * backgrounded, so in the foreground we hand the payload to `onMessage` (e.g.
 * to refresh the bell badge or show an in-app toast).
 * Returns an unsubscribe function.
 */
export function onForegroundMessage(handler) {
  try {
    return onMessage(fcm(), async (msg) => {
      handler?.({
        title: msg?.notification?.title,
        body: msg?.notification?.body,
        data: msg?.data || {},
      });
    });
  } catch (e) {
    console.warn('[push] foreground listener failed:', e.message);
    return () => {};
  }
}
