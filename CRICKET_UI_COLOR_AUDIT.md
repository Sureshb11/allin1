# Cricket UI — Colour & Consistency Audit

**Scope note.** No device or emulator was attached (`adb devices` empty). This
audit is code, token and **measured contrast**; it is not a visual inspection.
Hover/pressed/focus states, responsiveness, and on-device appearance are listed
as unverified rather than claimed as passed.

---

## 1. Existing colour problems

### 1.1 The same cricket meaning, three different colours

The core finding. One event, three answers:

| event | scoring screen | wagon wheel | scorecard commentary |
|---|---|---|---|
| **FOUR** | `DS.blueDeep` (blue) | `limeBright` (green) | `DS.lime` (green) |
| **SIX** | `DS.lime + '24'` (green tint) | `lime` (green) | `'#f59e0b'` (hardcoded amber) |
| **WICKET** | — | `wicketText` | `wicketText` *and* `live` in two places |

The blue is worse than merely inconsistent: `ThemeContext`'s own header says
*"Single-accent system: green carries every action/highlight, red means only
wicket/live/danger, **blue is gone**."* The FOUR button was using a colour the
design system had explicitly retired.

### 1.2 A four and a six were the same colour in light mode ⚠

The wagon wheel drew a six in `lime` and a four in `limeBright`. In the light
theme:

```
lime        #0a5227
limeBright  #0a5227     ← identical
limeDark    #0a5227     ← identical
```

All three lime tokens collapse to one value in light mode. So the wheel's legend
named two colours and the wheel drew one — a four and a six were
indistinguishable in daylight, which is when a phone is read at a ground.

This is the same fault as the flip-tile contrast bug fixed earlier: any pair of
lime tokens is invisible against itself in light mode.

### 1.3 Nine semantic names with conflicting values across theme files

Five theme files (`ThemeContext`, `index`, `scoringTokens`, `controls`,
`pavilion`) define overlapping tokens. Genuine cross-file conflicts:

| token | conflicting definitions |
|---|---|
| `live` | `#c62828`/`#f87171` · `#ef4444` · `#c62828`/`#ff5b52` |
| `accent` | `#e6b800` (gold) vs `#3ecf6e` (green) |
| `error` | `#ef4444` vs `#c62828`/`#ff5b52` |
| `primary` | `#2d7a3a` vs `#0a5227`/`#3ecf6e` |
| `secondary` | `#16213e` (navy) vs `#c62828`/`#ff5b52` (red) |
| `border`, `textMuted`, `textPrimary`, `textSecondary` | three-way splits |

`theme/index.js` holds most of the outliers and is imported by four files —
but three of them take only `Spacing`/`Radius`/`Typography`. **Exactly one
screen** (`SportScoringScreen`, the non-cricket scorer) consumes its `Colors`.
That is the whole source of the conflict.

### 1.4 Hardcoded colour values

**147 hex + 45 rgba literals across 16 cricket screens and components.**

Not all are wrong, and this audit deliberately did not remove them all:

| legitimately literal | why |
|---|---|
| `#25D366` | WhatsApp brand green on a share button — theming it would make it wrong |
| `#FFD700` `#C0C0C0` `#CD7F32` `#b87333` | gold/silver/bronze medals — the meaning *is* the metal |
| `#2c2723` `#d7bc8b` `#e7d2a6` | the bat-flip illustration's willow and grip |
| `'#000'` in `shadowColor` | shadows are not themed surfaces |

The ones that mattered were the cricket-semantic ones, fixed below.

### 1.5 Duplicate keys silently dropping styles

`eslint` over the whole `src` (rather than only touched files) found 4 errors —
duplicate `backgroundColor` / `shadowColor` / `borderRadius` keys in
`TournamentsScreen`, left from a blue→lime migration. The second value wins, so
the dead lines were invisible in review. Removing them exposed a real defect
underneath: the FAB had `justifyContent` and **no `alignItems`**, so its icon sat
left of centre in a 56pt circle.

---

## 2. The new colour system

`frontend/src/theme/cricketColors.js` — semantic names over the **existing**
brand, not a new palette. Built around the single-accent rule already documented
in `ThemeContext`: green carries action, red means only wicket/live/danger.

```js
cricketColors(DS)   // → the cricket palette for the current theme
outcomeColor(ball, C)  // → the colour for a delivery's outcome
statusColor(status, C) // → the colour for a match state
```

`outcomeColor` exists so a ball chip, a wagon-wheel line and a commentary line
cannot disagree about what colour a six is — the same discipline the cricket
*rules* were consolidated under in `deliveries.js`.

### The rule for four vs six

**A six always has more contrast against the page than a four.** On dark that
means brighter; on light it means darker. Stated that way it holds in both
themes rather than being two arbitrary pairs — and it encodes the hierarchy a
scorer needs, since the two events are related and one is bigger.

---

## 3. Semantic definitions (all values measured)

| token | dark | ratio | light | ratio |
|---|---|---|---|---|
| `four` | `#10B981` | 7.44:1 | `#1B7F4C` | 5.02:1 |
| `six` | `#34D399` | 9.82:1 | `#0a5227` | 9.34:1 |
| `wicket` | `#F87171` | 6.83:1 | `#c62828` | 5.62:1 |
| `wide` / `noBall` / `penalty` | `#F59E0B` | 8.79:1 | `#8a5200` | 6.39:1 |
| `bye` / `legBye` | `#94A3B8` | 7.36:1 | `#4b5563` | 7.56:1 |
| `dot` | `#8B8B8B` | — | `#727880` | — |
| `runs` | `#EAECED` | — | `#131619` | — |

**Every token clears WCAG AA (4.5:1)** against its own background.
**Four vs six are 1.32:1 apart on dark and 1.86:1 on light** — distinguishable
in both, which is the bug in §1.2 closed.

Amber fails on white (`#F59E0B` is 2.2:1), so the light theme uses its dark twin
`#8a5200` rather than the same value in both — the thing the brief asked for
when it said *"do not simply invert"*.

Also defined: match states (`live`, `upcoming`, `completed`, `paused`,
`inningsBreak`) and crease roles (`striker`, `nonStriker`, `bowler`).

---

## 4. Components updated

| file | change |
|---|---|
| `theme/cricketColors.js` | **new** — the semantic layer |
| `components/WagonWheel.js` | four/six/wicket/runs from the palette; fixes the light-mode collision |
| `components/ShotBoard.js` | legend reads the same source the wheel draws from |
| `screens/ScoringScreen.js` | FOUR off the retired blue; SIX solid rather than a tint; both get inverse text |
| `screens/ScorecardScreen.js` | commentary six off hardcoded `#f59e0b`; four to the shared token |
| `screens/TournamentsScreen.js` | 4 duplicate keys removed; FAB icon centred |

## 5. Hardcoded colours removed

- `'#f59e0b'` — scorecard commentary six
- `DS.blueDeep` as a boundary colour — the retired brand blue
- `c.lime` / `c.limeBright` as *cricket* meanings in two components
- 4 dead duplicate style keys in `TournamentsScreen`

Deliberately **kept**: WhatsApp green, medal metals, bat-flip willow, shadow
blacks (§1.4).

## 6. Accessibility improvements

- Every cricket token measured against its own background; all clear AA
- Four vs six now distinguishable in **both** themes (was identical in light)
- Amber replaced with a darker twin in light mode, where it failed at 2.2:1
- Boundary buttons now carry inverse text on a solid fill rather than accent-on-tint
- Colour is not the only signal: run buttons keep their numeral and label
  (`4`/`FOUR`), and the accessibility labels added in the previous audit remain

---

## 7. Screens verified

**By code and measurement:** live scoring controls, scorecard commentary, wagon
wheel, shot board, tournaments FAB. Whole-`src` lint clean; 214 tests pass;
production bundle builds.

**Not verified — no device:** match creation, toss, squad/XI selection, batter
and bowler pickers, wicket flow, extras, ball-by-ball timeline, spectator mode,
innings break, match result, match history, and every modal/drawer/toast in
those flows. Their *code* was searched for hardcoded colours (§1.4); their
appearance was not inspected.

---

## 8. Remaining UI issues

**Five theme files still overlap.** `theme/index.js` carries a conflicting
palette consumed by one screen (`SportScoringScreen`). Consolidating it is the
obvious next step, but it is a non-cricket screen and folding it in blind — with
no device to check the result — risks changing a working screen's appearance for
no verifiable gain. Left as a documented conflict.

**~140 hardcoded literals remain** in cricket screens, most of them legitimate
(§1.4) and the rest low-value one-offs in stats screens. The cricket-semantic
ones — the ones where two screens disagreed about the same event — are done.

**Component standardisation was not attempted.** Buttons, cards, tabs, pills,
inputs and modals share `theme/controls.js` already; auditing their height,
radius, padding and press states properly needs a device to see the result. What
could be verified without one — colour, contrast, token consistency — was.

**Hover/pressed/focus/disabled states unverified.** React Native has no hover;
pressed and disabled states exist in code but were not exercised.
