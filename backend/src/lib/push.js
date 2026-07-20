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
    // firebase-admin v13+ exposes the modular API on subpaths; the legacy
    // default export has no `.apps`/`.messaging()` under ESM.
    const { initializeApp, getApps, cert, applicationDefault } = await import('firebase-admin/app');
    const { getMessaging } = await import('firebase-admin/messaging');
    const app = getApps()[0] || initializeApp({
      credential: inline ? cert(JSON.parse(inline)) : applicationDefault(),
    });
    messaging = getMessaging(app);
    console.log('[push] Firebase messaging ready');
  } catch (e) {
    console.error('[push] Firebase init failed — device push disabled:', e.message);
    messaging = null;
  }
  return messaging;
}

// Tokens FCM tells us are gone for good. Anything else (rate limits, transient
// server errors) is left alone so a blip doesn't wipe someone's registration.
// FCM hard limit for a multicast send.
const FCM_BATCH = 500;

const DEAD = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Silent, data-only push — no notification block, so nothing appears in the
 * tray and the phone doesn't buzz. Used to tell watching devices that a live
 * match changed so they refetch, in place of polling. Delivered to the app's
 * message handler; on Android a high priority still wakes a backgrounded app.
 */
export async function pushDataToUsers(userIds, data = {}) {
  return pushToUsers(userIds, { data, silent: true });
}

/**
 * Push a notification to every device the given users are signed in on.
 * Best-effort: never throws, returns the number of messages delivered.
 * `data` values must be strings — FCM rejects other types.
 */
export async function pushToUsers(userIds, { title, message, data = {}, silent = false } = {}) {
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

  // sendEachForMulticast accepts at most 500 tokens per call — over that it
  // rejects the WHOLE batch, so a popular team's match would push to nobody.
  // Chunk, and keep going if one chunk fails so a single bad batch can't
  // silently drop everyone else's notification.
  let sent = 0;
  const dead = [];
  for (let i = 0; i < tokens.length; i += FCM_BATCH) {
    const chunk = tokens.slice(i, i + FCM_BATCH);
    try {
      const res = await fcm.sendEachForMulticast({
        tokens: chunk,
        // Omitting `notification` entirely is what makes a message data-only:
        // include it and Android renders a tray entry, which would buzz the
        // phone on every ball of a live match.
        ...(silent ? {} : { notification: { title, body: message } }),
        data: stringData,
        android: silent
          ? { priority: 'high' }
          : { priority: 'high', notification: { channelId: 'default', sound: 'default' } },
      });
      sent += res.successCount;
      res.responses.forEach((r, j) => {
        if (!r.success && DEAD.has(r.error?.code)) dead.push(chunk[j]);
      });
    } catch (e) {
      console.error(`[push] batch ${i / FCM_BATCH} failed:`, e.message);
    }
  }

  // Prune tokens FCM says are permanently gone (uninstalled apps).
  if (dead.length) {
    await prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
    console.log(`[push] pruned ${dead.length} dead token(s)`);
  }
  return sent;
}
