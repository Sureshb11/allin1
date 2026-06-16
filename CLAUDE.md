# Local Legends — Project Guide

Multi-sport scoring & community app. A player picks a sport ("Choose Your Arena"
honeycomb picker), lands on an Instagram-style cricket feed, and can score live
matches. This repo is a **monorepo** with two top-level apps.

```
allin1-local/
├── frontend/        React Native 0.75 mobile app (Android + iOS)
├── backend/         Node + Express + Prisma API server
├── design_handoff_arena/   Design references (HTML/React prototypes — not shipped)
├── CLAUDE.md        ← you are here
└── README.md
```

> Historical note: the project was formerly named `allin1`. It has been renamed to
> **Local Legends** (`com.local.legends`, JS app key `LocalLegends`,
> npm `local-legends`). The top-level folder is still `allin1-local` — renaming it
> needs `sudo` (the parent `/Volumes/BSB` is root-owned). Gradle paths are now
> folder-independent, so renaming is a single command with no follow-up edits:
>
> ```bash
> # stop Metro + close the editor first
> sudo mv /Volumes/BSB/allin1-local /Volumes/BSB/local-legends
> # then reopen at the new path and: cd frontend && npm start --reset-cache
> ```

---

## frontend/ — React Native app

RN **0.75.2**, React Navigation (stack + bottom tabs), `react-native-svg`,
`react-native-vector-icons` (MaterialCommunityIcons), AsyncStorage.

```
frontend/
├── App.js                  Root navigator (Auth → SportPicker → SportSetup → MainApp)
├── index.js                AppRegistry.registerComponent('LocalLegends', …)
├── src/
│   ├── navigation/         AuthNavigator, AppNavigator (HomeStack + tabs)
│   ├── screens/            SHARED screens (SportPickerScreen, CricketFeedScreen, HomeScreen, …)
│   ├── sports/             Per-sport config registry (see "Sports module" below)
│   ├── components/         Shared UI (SportIcon, Header, SimpleSidebar, Skeleton)
│   ├── theme/              Colors / Typography / Spacing / Radius / Shadows (+ scoringTokens)
│   ├── services/           LegendsApi (multi-sport API client → backend :4000)
│   ├── utils/              selectedSport singleton, helpers
│   └── config/             apiConfig
├── android/                Native Android (package com.local.legends)
└── ios/                    Native iOS (Xcode project still named "allin1")
```

### Key flows
- **Sport picker** — `src/screens/SportPickerScreen.js`: Apple-Watch honeycomb with
  pan + inertia + fisheye. Tap a disc to centre/select it; **START** enters the sport.
  Custom SVG glyphs in `src/components/SportIcon.js`.
- **Cricket landing** — `src/screens/CricketFeedScreen.js`: "From Your Circle"
  horizontal match rail + Instagram-style player feed (like / comment / share).
  Registered as the **initial route of `HomeStack`** in `src/navigation/AppNavigator.js`;
  the older dashboard is still reachable as the `Home` route.
- **Design system** — dark "Kinetic Athlete" palette: bg `#0f131f`, surfaces
  `#171b28`/`#262a37`, accent lime `#abd600`, text `#dfe2f3`/`#8d90a2`. The Arena
  picker uses a brighter lime `#c4f82a`.

### Sports module (`src/sports/`) — one app, 22+ sports
All per-sport config lives under `src/sports/`, so shared screens stay generic and
adding a sport doesn't mean editing six screens.
- `index.js` — registry: `getSport(id)`, `listSports()`, `sportMeta(id)`. Each sport is
  a folder `src/sports/<id>/index.js` calling `defineSport({...})` (meta: name, icon,
  tag, color, accent; plus a `custom: { homeRoute }` for sports with dedicated screens).
- Data-table domains are kept in one file each (they share design tokens / helpers, so
  splitting per-folder added risk with no gain): `scoring.js` (`getScoringConfig`),
  `formats.js` (`getFormats`), `dashboard.js` (`SPORTS` + `getDashboard`), `find.js`
  (`getFind`), `start.js` (`getStartFormat`). Consumer screens read these via the getters
  (e.g. `SportScoringScreen` → `getScoringConfig(sport)`).
- Sport-specific **screens** live with their sport, e.g. `src/sports/rummy/screens/`.
- **Landing feed** — every match sport shares ONE themed template,
  `src/screens/SportFeedScreen.js` (featured live match + results rail + quick actions +
  community). It renders the *selected* sport, themed from the registry: `feed.accent`
  (else `getScoringConfig(id).color`), `feed.scoreUnit`, `feed.copy`. So each sport has
  its own distinct feed via ~10 lines of `feed:{}` config — no per-sport feed file.
  Cricket keeps its bespoke `src/screens/CricketFeedScreen.js`; rummy uses its custom
  game flow. Routing: `AppNavigator` sends `cricket → CricketFeed`, everything else →
  `SportFeed`. Match detail for event sports = shared `MatchStatsScreen`.

**Adding a sport:** add `src/sports/<id>/index.js` (+ register it in `sports/index.js` and
the picker). It gets a themed feed automatically; add an optional `feed:{}` block to
customise colour/copy, and a `scoring.js`/`formats.js`/etc. entry only where it needs
custom behaviour (otherwise it falls back to the generic/cricket default). Individual
(1v1) sports set `individual: true` + `competitorLabel: 'Player'`. Sport-specific API
routes go in `backend/src/routes/sports/` (e.g. `rummy.js`), mounted in `backend/src/index.js`.

### Run (from `frontend/`)
```bash
npm start                 # Metro bundler (add --reset-cache if stale)
npm run android           # build + install + launch on device/emulator
npm run ios
npm run build:android     # release APK (cd android && ./gradlew assembleRelease)
```
Naming touch-points if you ever rename again: `index.js` (`registerComponent`),
`android/app/src/main/java/com/local/legends/MainActivity.kt` (`getMainComponentName`),
`ios/allin1/AppDelegate.mm` (`moduleName`) — all must share the same JS app key.
The embedded `android/app/src/main/assets/index.android.bundle` only matters for
release builds; regenerate with `react-native bundle …` after JS changes.

---

## backend/ — API server

Node + Express + **Prisma** ORM (Postgres via Docker). Auth uses phone + OTP
(test OTP `1234`). Serves on **:4000**; the app's `LegendsApi` client targets this. In dev, `src/config/apiConfig.js` points to the local backend (Android emulator: http://10.0.2.2:4000, iOS sim: http://localhost:4000).

```
backend/
├── src/{index.js,routes,lib}
├── prisma/                 schema + migrations + seed
├── docker-compose.yml      local Postgres
└── .env                    DB connection / secrets
```

### Run (from `backend/`)
```bash
npm run db:up             # start Postgres (docker compose)
npm run prisma:migrate    # apply migrations
npm run dev               # nodemon dev server on :4000
```

---

## Conventions
- Match the surrounding screen's style: heavy system font weights + letter-spacing
  stand in for the brand fonts (Anton/Archivo are not bundled).
- Mock data is intentional in design-derived screens — wire to `LegendsApi` /
  backend when implementing for real.
- This repo is **not under git**; back up before large refactors.
