# Live Telecast — broadcast authorization + score overlay

Implementation notes for the Live Telecast spec. Companion to
[`LIVE-SCORING-REALTIME.md`](./LIVE-SCORING-REALTIME.md) (which owns the score
transport) and [`SCALING.md`](./SCALING.md).

Written 2026-08-12.

---

## What this is

A scorer puts a match on air; an authorized broadcaster points a camera at it;
the live score is burned into the video before it reaches YouTube, so it
survives fullscreen, the archive, and being watched anywhere but the app.

```
Scorer app ──PUT /matches/:id/score──▶ Neon (Ball/Over/Inning = source of truth)
                                              │
                          GET /overlay/:sid/state (every 2s, edge-cached)
                                              │
Encoder (OBS browser source) ──▶ /overlay/:sid ──▶ composites score over camera
                                              │
                                          RTMP ──▶ YouTube Live ──▶ spectators
```

## The rule the whole design serves

```
match id        identifies a match       — never authorizes anything
JWT             identifies the user
UserRole        what they may do at all  — e.g. "is a broadcaster"
MatchRole       what they may do here    — organizer / scorer / broadcaster
session token   authorizes ONE pairing   — short-lived, single-use, hashed
overlay token   read-only, one match     — revoked when the session ends
```

`backend/src/lib/broadcastAuth.js` is where this is enforced; nothing accepts a
match id as evidence of anything.

---

## What is built

| Area | Where | Notes |
|---|---|---|
| Session lifecycle | `routes/broadcast.js` | 16 endpoints, PENDING→…→ENDED |
| Pairing (QR + 6-digit) | `lib/pairing.js` | 256-bit token, SHA-256 at rest, 3-min TTL, single-use |
| Authorization | `lib/broadcastAuth.js` | spec §15's 8 checks as one ordered function |
| Match lifecycle | `lib/matchLifecycle.js` | DRAFT→SCHEDULED→READY→LIVE→COMPLETED |
| Live state projection | `lib/liveSummary.js` | derived from Ball/Over/Inning, not stored |
| Overlay engine | `routes/overlay.js` | self-contained page for a browser source |
| Audit trail | `lib/broadcastAudit.js` | append-only, fire-and-forget |
| **Spectator screen** | `screens/LiveMatchScreen.js` | in-app telecast + score + tabs (§12) |

### Where the video actually plays

Two different surfaces, and they are easy to confuse:

- **`/overlay/:id` is not a viewing page.** Nobody watches it. The *encoder*
  loads it as a browser source and composites it onto the camera, so the score
  arrives inside the video. It is a production tool.
- **`LiveMatchScreen` is what a spectator opens.** In-app: the YouTube live
  player, the headline score under it, and Scorecard / Commentary / Players /
  Info tabs. Reached by tapping a live match in the cricket feed.

The score on that screen and the score burned into the video both come from
`lib/liveSummary.js` — one function, so they cannot drift apart.

`react-native-webview` was added for this and is pinned manually in
`react-native.config.js` (RN 0.75's autolinker needs it). YouTube publishes no
stream URL you may hand to a native player, so its iframe player is the only
supported way to show a YouTube live broadcast in-app; `react-native-video`
stays the right tool if the video ever moves to an HLS provider.

**This needs a native rebuild** — new native module. Until then the screen
detects the missing view manager and offers "Watch on YouTube" instead of
crashing.

### Deliberate deviations from the spec

Three, all load-bearing:

1. **Status strings stay lowercase.** The spec names states `LIVE`/`COMPLETED`;
   the app compares `status === 'live'` in ~30 places and `'completed'` in ~13.
   The *states* are the spec's, the *spelling* is the database's. `'break'`
   (innings break) is treated as a sub-state of live — a broadcast must survive
   it.

2. **`LiveMatchState` is computed, not stored.** Spec §19 asks for a table
   holding score/wickets/overs/batsmen. `Ball`/`Over`/`Inning` already are that
   table. A second copy is a second thing that can be wrong, and its failure
   mode is an overlay reading 153/4 while the scorecard reads 157/4, live, on
   air, with no way to know which lied.

3. **Approval sets `APPROVED`, not `CONNECTED`.** Spec §5 says approval →
   CONNECTED. Here the broadcaster fetching its stream config makes it
   CONNECTED. Both states are in the spec's own §6, and splitting them is what
   lets a scorer distinguish "I approved them" from "their encoder is actually
   talking to us" — the question they will have thirty seconds before the first
   ball.

---

## What is NOT built

Be clear-eyed about this before planning around it.

- **YouTube integration (spec §13, §14).** No OAuth, no `liveBroadcasts.insert`,
  no stream key handling. Needs Google Cloud credentials and a channel decision
  (see below) that hasn't been made.
- **The compositing tier.** The overlay page exists and is the durable piece,
  but nothing yet drives an encoder. Phase 1 is OBS on a laptop; see below.
- **React Native screens for the operators (spec §4, §5).** No scorer QR
  screen and no broadcaster pairing screen. The spectator screen (§12) is
  built; these two are not. The API they need is complete and documented below.
- **Rate limiting (spec §15).** The pairing attempt cap is DB-backed and works
  across instances; general per-IP rate limiting is not implemented and needs a
  shared store (Upstash/Redis), because in-memory counters are per-instance and
  therefore useless on Vercel.
- **Reporting/abuse flows (spec §18).** Audit logging is in; the report/block
  user-facing flows are not.

### Two gaps that are not just "unbuilt work"

**Revocation is not yet a kill switch.** `POST /sessions/:id/revoke` stops the
overlay, fails the broadcaster's next heartbeat, and bars reconnection. It does
not stop bytes already flowing to RTMP — the stream key is a credential the
encoder holds. Until the YouTube-side stop exists, a scorer revoking a hostile
broadcaster must *also* stop the stream at the encoder or on the channel.

**Latency skew.** YouTube Live runs seconds behind real time. Spec §12 puts a
live score panel directly above the video player, so spectators will read the
wicket before the video shows it. Either delay the in-app score to match the
stream, or drop that panel and rely on the burned-in overlay. This is a product
decision, and it is not made.

---

## Running the overlay (phase 1: OBS)

1. Scorer starts broadcast setup → approves the broadcaster.
2. The approve response returns `overlayUrl`, once. It looks like:
   `https://<api>/overlay/<sessionId>?token=<overlayToken>`
3. In OBS: **Sources → + → Browser**, paste the URL, 1920×1080, tick
   *Shutdown source when not visible* off.
4. Optional per-tournament sponsor art: append `&sponsor=<image url>`.

The page is transparent, so OBS composites it straight over the camera. It is
sized in `vw`/`vh` units and anchored inside a 5% title-safe inset, so it is
identical at 720p and 1080p and survives TV overscan.

---

## The channel decision (unmade, and it blocks §13)

One shared Local Legends channel means concurrent-broadcast limits and one
copyright strike taking down every match. Per-broadcaster OAuth avoids both but
scatters the content. Also unresolved: YouTube Data API daily quota (write
operations are expensive, and raising the cap requires a compliance audit with
real calendar time), and the "made for kids" flag — amateur cricket means
under-18 players on a public broadcast, which needs a consent step and a
takedown path.

---

## API

All routes need `Authorization: Bearer <jwt>` except the overlay pair.

### Scorer / organizer
```
POST   /broadcast/matches/:matchId/sessions   → { session, qr, expiresInSeconds }
GET    /broadcast/matches/:matchId/session    → { session, broadcaster }
POST   /broadcast/sessions/:id/approve        → { session, overlayUrl }   ← once
POST   /broadcast/sessions/:id/reject
POST   /broadcast/sessions/:id/revoke         { reason? }
GET    /broadcast/matches/:matchId/audit
```

### Broadcaster
```
POST   /broadcast/pair          { qr } | { code }   ← needs BROADCASTER capability
POST   /broadcast/sessions/:id/connect
POST   /broadcast/sessions/:id/start
POST   /broadcast/sessions/:id/heartbeat  → { status, stop }  ← stop:true means quit
POST   /broadcast/sessions/:id/end
```

### Admin
```
POST   /broadcast/roles                  { userId, role, status }
POST   /broadcast/sessions/:id/force-stop
GET    /broadcast/me                     → { admin, capabilities, canBroadcast }
```

### Overlay (token in query — a browser source has no headers)
```
GET    /overlay/:sessionId               the page
GET    /overlay/:sessionId/state         the score, edge-cached 2s
```

### Spectator (public — a live telecast is public by definition)
```
GET    /matches/:id/live-summary         headline score, edge-cached 2s
GET    /broadcast/matches/:matchId/public → { onAir, youtubeVideoId, verified }
```

`/live-summary` exists separately from `/scorecard` because the app polls it
every 6s from a ground on mobile data: measured against a real completed match
it is ~2.5KB, where `/scorecard` carries every delivery plus both full rosters.
The screen fetches the big payload only when a tab needs it.

---

## Migration

`prisma/migrations/20260812090000_live_telecast_broadcast/` adds four tables
(`UserRole`, `MatchRole`, `BroadcastSession`, `BroadcastAuditLog`) and **alters
no existing table** — verified against the live schema before it was written.

It has **not been applied.** Per `CLAUDE.md`, migrations reach Neon only when
someone runs this by hand, and that hits the live database:

```bash
cd backend && npx prisma migrate deploy
```

Apply it *before* deploying code that queries these tables, or the API 500s
until it lands.

### Granting the first broadcaster

`POST /broadcast/roles` requires an admin, and admins come from
`ADMIN_USER_IDS` in `backend/.env` — so seed that before expecting anyone to be
able to pair.
