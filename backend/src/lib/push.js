// push.js — real device push via Firebase Cloud Messaging.
//
// Layered on top of the in-app Notification rows: notifyUsers() writes the row
// (the bell screen) and then hands the same payload here, so every existing
// notification path (match live, results, awards, tournaments, milestones,
// likes) gains push for free.
//
// Credentials come from the environment and are OPTIONAL — with none set this
// module degrades to a no-op and logs once, so the API runs unchanged on a
// machine that has no Firebase set up. Provide ONE of:
//   FIREBASE_SERVICE_ACCOUNT       — the service-account JSON, inline
//   GOOGLE_APPLICATION_CREDENTIALS — path to that JSON file
//
// Dead tokens: FCM reports unregistered/invalid tokens per-message; those rows
// are pruned so we stop pushing to uninstalled apps.

import { prisma } from './prisma.js';

let messaging = null;      // resolved firebase-admin messaging, or null
let initTried = false;

async function getMessaging() {
  if (initTried) return messaging;
  initTried = true;

  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!inline && !path) {
    console.warn('[push] no Firebase credentials set — device push disabled (in-app notifications still work)');
    return null;
  }

  try {
    const admin = (await import('firebase-admin')).default;
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: inline
          ? admin.credential.cert(JSON.parse(inline))
          : admin.credential.applicationDefault(),
      });
    }
    messaging = admin.messaging();
    console.log('[push] Firebase messaging ready');
  } catch (e) {
    console.error('[push] Firebase init failed — device push disabled:', e.message);
    messaging = null;
  }
  return messaging;
}

// Tokens FCM tells us are gone for good. Anything else (rate limits, transient
// server errors) is left alone so a blip doesn't wipe someone's registration.
const DEAD = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Push a notification to every device the given users are signed in on.
 * Best-effort: never throws, returns the number of messages delivered.
 * `data` values must be strings — FCM rejects other types.
 */
export async function pushToUsers(userIds, { title, message, data = {} } = {}) {
  const uniq = [...new Set((userIds || []).filter(Boolean))];
  if (!uniq.length) return 0;

  const fcm = await getMessaging();
  if (!fcm) return 0;

  const devices = await prisma.deviceToken.findMany({
    where: { userId: { in: uniq } },
    select: { token: true },
  });
  if (!devices.length) return 0;

  const tokens = devices.map((d) => d.token);
  const stringData = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
  );

  try {
    const res = await fcm.sendEachForMulticast({
      tokens,
      notification: { title, body: message },
      data: stringData,
      android: { priority: 'high', notification: { channelId: 'default', sound: 'default' } },
    });

    // Prune tokens FCM says are permanently gone.
    const dead = res.responses
      .map((r, i) => (!r.success && DEAD.has(r.error?.code) ? tokens[i] : null))
      .filter(Boolean);
    if (dead.length) {
      await prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
      console.log(`[push] pruned ${dead.length} dead token(s)`);
    }
    return res.successCount;
  } catch (e) {
    console.error('[push] send failed:', e.message);
    return 0;
  }
}
