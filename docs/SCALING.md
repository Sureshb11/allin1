# Scaling & infrastructure backlog

Deferred work, why it was deferred, and what changes when the backend moves to
**Azure**. Written 2026-07-20, when the app was at ~70 users / 25 matches and the
target discussed was 1 crore (10M) users.

Current deployment: **Vercel serverless** (`@vercel/node`, `backend/vercel.json`),
Postgres on **Neon**, push via **FCM** (Firebase project `locallegends-a4a69`).

---

## Already fixed (no action needed)

| Item | Fix | Commit |
|---|---|---|
| FCM rejected sends of 500+ tokens, so a big match pushed to **nobody** | chunk into 500s, continue past a failed chunk | `07ff46b` |
| `Notification` had no indexes; every read was a sequential scan | `(userId, createdAt)` + `(userId, read)` — unread count is now an Index Only Scan | `07ff46b` |
| `GET /notifications` returned **every** notification ever | cursor paging, default 30 / cap 100, server-side unread count | `07ff46b` |
| Notification table grew forever (fan-out on write) | 60-day retention, prunes **read** rows only, runs on ~1/200 writes | `07ff46b` |
| ~~Live scorecard polled every 6s per watcher~~ **REVERTED** | The "FCM push primary, 30s poll" change (`f35a213`) made the score look **frozen for spectators** — silent FCM pushes are throttled and only reach team members, so general watchers got a 30s-or-never refresh. Restored the reliable **6s poll**; realtime is the real fix, not a slower poll. | `f35a213` → reverted `38e4bf0` |

---

## Deferred — revisit on Azure

### 1. Realtime transport (the big one)

> **Concrete, code-grounded plan:** see
> [`LIVE-SCORING-REALTIME.md`](./LIVE-SCORING-REALTIME.md) — phased (edge cache →
> managed pub/sub → Azure SignalR) with the exact `PUT /:id/score` publish hook and
> the client subscribe path. Summary below.

The live-score updates use a **data-only FCM push** rather than WebSockets/SSE.
That was not a preference — **Vercel serverless cannot hold a long-lived
connection**. WS/SSE would have worked locally and failed in production. The
cheapest win *before* sockets is **edge-caching the scorecard read** (Vercel
`s-maxage=2` + stale-while-revalidate): thousands of pollers collapse to one origin
query every 2s, no client change.

**On Azure this constraint disappears.** App Service and Container Apps both
support WebSockets, so the options become:

- **Azure SignalR Service** — managed, handles fan-out and scale-out; the
  natural fit if realtime grows beyond live scores (chat, presence, live feed).
- **Plain WebSockets** on App Service / Container Apps — simpler, but you own
  connection state across instances (needs a backplane once you scale out).

Keep the FCM path regardless: it is the only thing that reaches a **backgrounded
or closed** app. Sockets replace polling for *foreground* watchers; push still
delivers when the app isn't open.

Remaining polls not yet converted: **chat (3s)** — best candidate for sockets —
and **feed (5s)**.

### 2. `Ball` table volume

A T20 is ~240 balls, an ODI ~600. At 1M matches/year that is ~240M rows/year.

**Deliberately not partitioned yet** — the table currently holds **1,457 rows**,
and Prisma does not model partitioned tables, so every future migration would
fight it. Do this when volume justifies it, not before.

On Azure Database for PostgreSQL: declarative partitioning by month/season, or
archive completed matches to cheaper storage. Trigger point: roughly 10M+ rows.

### 3. Notification fan-out on write

`notifyUsers()` writes one row per recipient. Fine while teams have tens or
hundreds of followers; it only becomes a problem at celebrity-scale followings,
which a local sports app is unlikely to hit. Indexes + paging + retention keep
it comfortable for now.

If a team's following ever does get large, switch to **fan-out-on-read**: store
one event row plus an audience descriptor, resolve at read time, and track the
unread boundary with a per-user timestamp rather than a row per user.

### 4. Read scaling

Not started — it is configuration, not code.

- **Read replicas** for the read-heavy paths (`/matches/circle`, feeds, stats).
- **Caching** (Azure Cache for Redis) in front of the same paths.
- Connection pooling: Neon's pooler endpoint is in use today; on Azure use
  PgBouncer or the built-in pooler, and keep Prisma's pool sized for the number
  of app instances.

---

## Azure migration checklist (backend)

- [ ] Host: App Service or Container Apps (**not** Functions, if you want sockets)
- [ ] Postgres: Azure Database for PostgreSQL — migrate from Neon, keep the
      Prisma migration history intact
- [ ] Secrets: move `DATABASE_URL`, `JWT_SECRET` and the Firebase service
      account into **Key Vault** (the service-account JSON is referenced by
      `GOOGLE_APPLICATION_CREDENTIALS` and must stay out of the repo)
- [ ] Re-point `PROD_URL` in `frontend/src/config/apiConfig.js`
- [ ] Push: keep FCM. Azure Notification Hubs is optional and only worth it if
      you add APNs/iOS and want one API for both
- [ ] Then revisit realtime (item 1) now that sockets are possible
