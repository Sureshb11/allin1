# Live scoring — realtime write/read path (design spec)

How live scores get from the scorer's phone to thousands of spectators, and the
staged plan to take it from "works for a room" to "works for a stadium." Grounded
in the current code (`backend/src/routes/matches.js` `PUT /:id/score`,
`frontend/src/screens/ScorecardScreen.js`, `MatchStatsScreen.js`). Companion to
[`SCALING.md`](./SCALING.md).

Written 2026-07-23.

---

## 0. Where we are now (post-fix)

```
Scorer app ──PUT /:id/score──▶ Vercel fn ──▶ Neon Postgres (source of truth)
                                             (Ball/Over/Inning + Match.score1/2)
                                                     │
Spectator app ──GET /:id/scorecard every 6s────────▶│  (also a best-effort FCM nudge)
```

- **Transport = polling.** Reliable, but O(spectators): every watcher hits the API
  every 6s. Fine at today's scale, impossible at thousands × thousands.
- **The FCM "silent push" is a nudge, not a channel** — throttled, and it only
  reaches the two teams' members (`matchAudience`), never general spectators. Keep
  it (it's the only thing that reaches a *backgrounded* app) but never depend on it
  for the foreground live experience.

> Correction to SCALING.md: the "poll → 30s + FCM primary" change (`f35a213`) was
> **reverted** — it made the score look frozen for spectators. Poll is back to a
> reliable 6s (`38e4bf0`). Realtime (below) is the real fix, not a slower poll.

---

## The constraint that shapes everything

**Vercel serverless functions can't hold a long-lived connection** (WebSocket/SSE).
A function spins up, responds, dies. So realtime fan-out has to live *outside* the
function — either a managed pub/sub service, or (later, on Azure) an always-on
socket server. The write path stays a normal short HTTP request that *publishes* a
message; the persistent connections live elsewhere.

---

## Phase 0 — Edge-cache the read path (do first; ~half a day)

Biggest win for the least work, **no client or vendor change**. Put the live
scorecard read behind Vercel's edge cache with a tiny TTL:

```js
// GET /:id/scorecard  (and /sport-stats)
const live = match.status === 'live';
res.set('Cache-Control', live
  ? 'public, s-maxage=2, stale-while-revalidate=8'   // live: 1 origin hit / 2s
  : 'public, s-maxage=30');                           // finished: cache hard
res.json({ ... });
```

Effect: 10,000 spectators polling one match collapse into **one origin query every
2 seconds**; everyone else is served from the edge. Latency stays ~2s (same as a
poll). This alone carries tens of thousands of concurrent watchers on the current
stack. Ship it before touching realtime.

Caveat: only cache the *read*; keep `Cache-Control: no-store` on scorer writes and
anything auth-personalised.

---

## Phase 1 — Realtime pub/sub (managed) — the scalable answer

Add a managed pub/sub service (recommend **Ably**; Pusher or Supabase Realtime are
equivalent). Channel per match: `match:{id}`.

### Write path — hook into `PUT /:id/score`

Right after the DB writes + score compute, publish **the compact live state** so
subscribers update *without a follow-up fetch* (this is what makes it O(1) on the
server):

```js
// backend/src/lib/realtime.js  (new)
import Ably from 'ably';
const client = process.env.ABLY_API_KEY ? new Ably.Rest(process.env.ABLY_API_KEY) : null;

/** Fire-and-forget: publish must never fail the score write. */
export function publishScore(matchId, payload) {
  if (!client) return;                       // no key configured → no-op (dev)
  client.channels.get(`match:${matchId}`)
    .publish('update', payload)
    .catch((e) => console.error('[realtime] publish failed:', e.message));
}
```

```js
// in PUT /:id/score, replacing the pingMatchWatchers line:
const summary = liveSummary(inningId /* or events */);   // { score1, score2, overs, target, lastBall }
publishScore(req.params.id, { type: 'ball', summary, ts: Date.now() });
safeNotify(() => pingMatchWatchers(req.params.id));       // keep FCM for backgrounded apps
res.json({ success: true, ball });
```

`liveSummary` is the small object the scoreboard needs — reuse the existing
`score1/score2` + `deriveRally`/`deriveTennis`/`computeSportScore` logic so the
delta and the `/scorecard` fetch can never disagree.

### Read path — `ScorecardScreen` / `MatchStatsScreen`

```
On focus:
  1. GET /scorecard  ← one fetch, full detail (batting card, tabs) + first paint
  2. subscribe('match:{id}', msg => applyLiveSummary(msg.summary))  ← instant thereafter
  3. keep a SLOW poll (20–30s) ONLY as a reconnect safety net
On blur / unmount: unsubscribe + clear the safety poll
```

- The subscription updates the **headline score/overs/last-ball instantly** off the
  published delta — zero per-update fetches.
- The detailed tabs (full scorecard, per-over) still fetch on open and on a
  reconnect; they don't need every-ball precision.
- Ably's RN SDK handles reconnect, connection state, and (optionally) `history` to
  backfill missed messages after a drop.

### Auth

Spectators subscribe read-only. Issue an **Ably token** from an authed endpoint
(`GET /realtime/token`) scoped to `subscribe` on `match:*`; only the backend's API
key can `publish`. Never ship the API key to the app.

---

## Phase 2 — Own the socket layer (Azure, later)

Per SCALING.md, when the backend leaves Vercel for **Azure** (App Service /
Container Apps, which *can* hold sockets), the managed service can be swapped for
**Azure SignalR Service** (same channel model, first-party, cheaper at very high
volume) — or kept as-is if Ably's economics still win. No client rewrite: it's the
same subscribe/publish shape behind an interface.

---

## Scale math (why this works)

| | Polling (today) | Edge cache (P0) | Realtime (P1) |
|---|---|---|---|
| 1 match, 10k watchers | 10k×(1/6s) ≈ **1.7k req/s** to origin | **~0.5 req/s** origin (1 / 2s) | **1 publish/ball**, fanout by Ably |
| 1k matches × 1k watchers | ~**170k req/s** → falls over | ~500 origin req/s | ~1k publishes/s peak, N-fanout offloaded |
| Server work per update | O(spectators) | O(matches) | **O(1)** (one publish) |
| Added latency | ~6s | ~2s | **<1s** |

The server only ever does O(matches) work; the O(spectators) fan-out is the managed
service's job. That's the whole point.

---

## Rollout checklist

- [x] **P0a** — revert to a reliable 6s poll (`38e4bf0`) so it works *now*.
- [ ] **P0b** — add `Cache-Control` (s-maxage=2, SWR) to `/scorecard` + `/sport-stats` for live matches.
- [ ] **P1a** — add `ABLY_API_KEY` secret; `backend/src/lib/realtime.js`; publish in `PUT /:id/score` (and undo, innings-change, end-match).
- [ ] **P1b** — `GET /realtime/token` (subscribe-scoped); client subscribes in `ScorecardScreen`/`MatchStatsScreen`; drop the 6s poll to a 20–30s reconnect net.
- [ ] **P1c** — publish a `liveSummary` shaped so delta == `/scorecard` headline (single source: reuse `computeSportScore`/`deriveRally`).
- [ ] **P2** — on Azure, evaluate Azure SignalR vs staying on Ably.

Keep FCM throughout — it's the only path to a **closed/backgrounded** app.
