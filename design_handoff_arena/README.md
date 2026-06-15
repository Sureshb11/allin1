# Handoff: "Choose Your Arena" — Multi-Sport Scoring App

## Overview
A mobile (portrait) **sport & game picker** plus **live scoring screens** for a multi-sport
scoring app ("Local Legends"). The signature screen is an **Apple-Watch–style honeycomb**: 22
circular sport/game discs packed in a balanced honeycomb blob that the user **drags to pan**, with
a **fisheye** effect (the disc nearest the centre is largest; discs shrink and fade toward the
edges). The centred disc is the current selection. Cricket sits at the centre as the hero. Tapping
a disc animates it to centre and opens that discipline — **Cricket** opens a live cricket
scoreboard, **Rummy** opens a Pool-Rummy (201) score card, and every other sport opens a
"season soon" sheet.

## About the Design Files
The files in this bundle are **design references created in HTML/React-via-Babel** — runnable
prototypes that show the intended look, motion, and behavior. They are **not production code to
ship as-is**. The task is to **recreate these designs in the target codebase's environment**
(React Native, Swift/SwiftUI, Flutter, a React web app, etc.) using that project's established
patterns, navigation, state, and component library. If no codebase exists yet, choose the most
appropriate framework for a mobile-first product and implement the designs there.

The prototype uses inline `<script type="text/babel">` React with global components shared via
`window` — that pattern is a prototyping convenience and should **not** be reproduced; use normal
modules/components in the real app.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, iconography, motion, and interaction
are all specified below and in the files. Recreate the UI pixel-accurately using the codebase's
libraries. The one thing that is intentionally "mock" is the **data** (hard-coded sample scores) —
wire those to real state/data in the app.

---

## Design Tokens

### Colors
| Token | Hex / value | Use |
|---|---|---|
| `navy0` | `#0a0e18` | App background / deepest surface, honeycomb field |
| `navy1` | `#0d1320` | Screen background, scoring sheets |
| `navy2` | `#111a2b` | Raised panel (scoring pad, sheet headers) |
| `cell`  | `#161f30` | Card / disc base surface |
| `cellHi`| `#1d2942` | Elevated surface, chips, buttons (neutral) |
| `line`  | `rgba(150,180,230,0.10)` | Hairline borders |
| `ink`   | `#eaf0fb` | Primary text |
| `inkDim`| `#8a97b0` | Secondary / muted text |
| `lime`  | `#c4f82a` | **Primary accent** — focus ring, CTAs, highlights |
| `lime2` | `#a6e814` | Accent pressed/secondary |
| danger  | `#ff5a5a` / text `#ff7a7a` | LIVE, wicket, OUT, over-limit |
| warn    | `#ffb24a` | Progress meter "approaching limit" |

Disc gradients: non-focused `radial-gradient(circle at 50% 32%, #202a3d, #131b29)`;
focused `radial-gradient(circle at 50% 32%, #34465f, #1c2839)`.

### Typography
- **Display:** `Anton` (Google Fonts), used UPPERCASE for titles, scores, numbers, button labels.
  Letter-spacing ~0.4–1.4px. This is the brand's bold condensed voice.
- **UI / body:** `Archivo` (Google Fonts), weights 400–800; italic 700 used for the accent word
  "ARENA". Antialiased.
- Title lockup: "CHOOSE YOUR" (Anton ~30–36px, `ink`) over "ARENA" (Anton italic ~40–50px, `lime`).

### Spacing / radius / shadow
- Screen padding: 16–22px horizontal.
- Radii: discs `50%`; cards/sheets 14–26px; buttons 14–16px; chips/pills 20–30px.
- Card shadow: `0 12px 32px rgba(0,0,0,0.38)`. Disc shadow (resting):
  `inset 0 1px 0 rgba(255,255,255,0.06), 0 6px 16px rgba(0,0,0,0.5)`.
- Focus ring: a **2.5px solid `lime` border** on the centred disc (use a border, **not** a
  box-shadow spread ring — spread rings render unreliably).

---

## Screens / Views

### 1. Sport Picker — "Choose Your Arena" (primary screen)
**Purpose:** Browse 22 disciplines and pick one to score.

**Layout (top → bottom):**
- Status bar (device).
- **Top bar:** back chevron · "LOCAL LEGENDS" (Anton ~16px, letter-spacing 1) · circular profile
  avatar (36px) at right.
- **Title:** "CHOOSE YOUR / ARENA" centred (compact variant, no subtitle).
- **Honeycomb area (flex-fills remaining height):** see "Honeycomb" below.
- **Readout card (docked above home indicator):** a rounded 22px card (`cellHi→cell` vertical
  gradient) showing the **currently centred** discipline:
  - 50×50 lime-tinted icon chip (`rgba(196,248,42,0.12)` fill, `rgba(196,248,42,0.2)` border).
  - Category tag (e.g. "BAT & BALL", Anton-free, Archivo 800, 10px, `lime`, letter-spacing 1.4) +
    index "01 / 22" (Archivo 700, 10px, `inkDim`, tabular-nums).
  - Name (Anton, auto-sized: ≤9 chars 24px, ≤13 chars 20px, else 17px; wraps, `textWrap: balance`).
  - **START** button: `lime` fill, `navy0` text, Anton 15px, 50px tall, play-triangle icon.
  - The icon chip + text block animate (slide-up `readoutIn` 0.3s) each time the centred sport
    changes.
- Home indicator (device).

**The Honeycomb (core component):**
- 22 circular discs (64px design size) hex-packed; neighbour distance (`spacing`) 78px.
- **Layout algorithm:** fill complete hex rings from the centre outward (1, 6, 12 = 19), then
  spread the remaining 3 evenly around the next ring so there are **no detached stragglers** — the
  cluster always reads as one balanced blob. (See `app/data.jsx → layoutHoney`.) Cricket is index 0
  (dead centre).
- **Fisheye:** every frame, for each disc compute screen distance `d` from the viewport centre and
  scale `s = minScale + (1 - minScale) / (1 + (d/falloff)² · 1.35)`, clamped; featured disc
  (Cricket) gets a slight ×1.14 boost. Params for this screen: `minScale 0.36`, `falloff 120`.
  Opacity fades with scale (floor ~0.32) so edge discs dim but stay legible. The disc whose centre
  is closest becomes the **focused** disc.
- **Focused disc:** lighter gradient + **2.5px solid lime border** + a brief "lock-pop" scale
  (0.82→1.06→1, 0.34s) when a new disc snaps to centre.
- **Pan:** free drag with **inertia** (velocity EMA, 0.92 decay) and **rubber-band** overscroll
  (0.42 resistance past bounds, springs back). Pan is clamped so every disc can reach the centre.
- **Tap a disc:** animate-pan it to the centre (~300ms, ease-out cubic) then fire select.
- Entrance: discs cascade in (staggered by ring). Gate any entrance animation so the resting state
  is the visible state (don't leave discs stuck at opacity 0 if animations are disabled).

### 2. Cricket — Live Scoreboard (opens when Cricket selected)
**Purpose:** Score a live cricket innings.
**Layout:** slides up (`sheetUp` 0.42s). Header: back button · cricket icon + "CRICKET" · **LIVE**
pill (red dot pulsing). Big score `runs-wkts` (Anton 56px, wkts in `lime`) with a `+run` flash
animation; overs (e.g. "16.2 ov") and CRR beside it; chase line ("Need 47 off 22 · Target 189").
**THIS OVER** ball chips (4/6 = lime, W = red). Two batter rows (striker dot in `lime`, name, runs
(balls)). **Scoring pad** on a raised `navy2` panel: row 0/1/2/3, row 4/6/WD/W; 4 & 6 are lime,
W is danger. Tapping a run updates score, over, strike rotation.

### 3. Rummy — Pool (201) Score Card (opens when Rummy selected)
**Purpose:** Track a pool-rummy game across deals.
**Layout:** Header: back · cards icon + "RUMMY" · **POOL · 201** pill.
- **Standings row:** 4 player cards (flex, equal). Each: 26px avatar (initial), name, total (Anton
  21px), a **3px progress meter** = `total / 201` (lime → `#ffb24a` >75% → red when OUT), and
  "X LEFT" (or "OUT"). Leader card: lime-tinted bg + "LEAD" pill. Eliminated (total > 201): red
  tint + dimmed.
- **Deals table:** header row (DEAL + player initials); scrollable deal rows ("01"… with each
  player's points that deal, winner shown as "—" in lime); a faint **♠♥♦♣ watermark** centred
  behind the rows fills empty space; sticky **TOTAL** footer (lime, or red if eliminated).
- **Footer:** circular **reset** button + **+ NEW DEAL** button (lime, single line). Adding a deal
  appends the next hand; players over 201 stop scoring; when one remains the button shows
  "&lt;name&gt; WINS 🏆".

### 4. "Season Soon" sheet (every other sport)
Bottom sheet over a blurred scrim: grab handle, 56px icon, name + "{tag} · scoring rolls out this
season", **NOTIFY ME** (lime) and "Pick another arena" buttons.

---

## Interactions & Behavior
- **Pan / inertia / rubber-band / fisheye** as described (the heart of the picker).
- **Focus change** → updates the readout (animated) and the lock-ring/lock-pop.
- **Select** → pan-to-centre then route: `cricket` → scoreboard, `rummy` → rummy card, else → soon
  sheet. Back returns to the picker.
- **Cricket pad** mutates score/over/strike; `+run` flash, LIVE pulse.
- **Rummy +NEW DEAL** mutates deals, recomputes totals/eliminations/winner from the deal list
  (compute from source-of-truth each time, not stale snapshots).
- All transitions respect `prefers-reduced-motion` where reasonable; entrance animations must not
  hide content in their resting state.

## State Management
- **Picker:** `panX/panY` (+ velocity) for the grid; `focusId` (centred disc); `route`
  (`null | 'cricket' | 'rummy' | {soonSport}`).
- **Cricket:** `runs, wickets, balls, thisOver[], striker{runs,balls}, nonStriker{...}`.
- **Rummy:** `deals: number[][]` (rows = deals, cols = players); derive `totals`, `live[]`,
  `leaderIdx`, `liveCount`. Pool limit constant `201`. (Wire players/data to real sources.)

## Assets
- **Fonts:** Google Fonts `Anton` and `Archivo` (swap for the app's own display/grotesque if it
  has them).
- **Icons:** 22 **custom single-color SVG sport glyphs** authored in `app/icons.jsx` (24×24,
  `currentColor`, 1.7px rounded strokes + occasional solid accent) — cricket (batsman + bat),
  football, kabaddi, hockey, badminton, tennis, basketball, volleyball, boxing, wrestling, table
  tennis, kho-kho, handball, squash, pickleball, judo, karate, golf, archery, bowling, snowboarding,
  rummy (cards). Reuse these SVG paths directly; no icon-font dependency. Status-bar/chrome glyphs
  are inline SVG in `app/phone.jsx`.
- No raster images.

## Files (in this bundle)
- `Arena.html` — entry point; loads fonts, defines keyframes, mounts the app in an iPhone frame.
- `app/data.jsx` — design tokens (`ARENA`), the 22-item `SPORTS` list, and the honeycomb
  `layoutHoney` algorithm.
- `app/icons.jsx` — all 22 sport glyphs (`<SportIcon id size />`).
- `app/honeycomb.jsx` — the pan/inertia/rubber-band/fisheye engine (`<Honeycomb>`).
- `app/variants.jsx` — the picker screen (`PickerSpotlight`) + select→route logic (`useArena`).
- `app/phone.jsx` — device chrome (status bar, top bar, title, screen shell).
- `app/scoring.jsx` — `CricketScoring`, `RummyScorecard`, `ComingSoonSheet`.
- `app/main.jsx` — iPhone frame wrapper + mount.

> Open `Arena.html` in a browser to interact with the reference. Drag the grid to pan; tap a disc
> to open it (Cricket and Rummy have full scoring screens).
