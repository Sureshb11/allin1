# Run out — implementation specification

Every combination of **run out** with a legal ball, a **wide**, a **no ball**, and
the pre-delivery dismissal, resolved to an exact book entry. Written against the
**MCC Laws of Cricket, 2017 Code (3rd edition, 2022)**.

This is the specification the code implements, not a parallel document:

| Concern | Where it lives |
|---|---|
| The rules, as a pure function | [`frontend/src/utils/runOutEngine.js`](../frontend/src/utils/runOutEngine.js) |
| Executable test cases | [`frontend/__tests__/runOutEngine.test.js`](../frontend/__tests__/runOutEngine.test.js) — `npm test` |
| The four scorer sheets + state | `frontend/src/screens/ScoringScreen.js` (`openRunOut` → `commitRunOut` → `handleScore`) |
| Persistence, over placement, legality | `backend/src/routes/matches.js` (`PUT /:id/score`, `NON_BALL_EXTRAS`) |

---

## 0. The model

A run out is the only dismissal that

* can arrive on **any** delivery — legal, wide, no ball, or before the ball is bowled,
* **scores runs on the ball that took the wicket**, and
* can leave the **not-out batter at either end**.

So it cannot be recorded from a dismissal type alone. Four inputs are needed, and
the flow asks for them in the order they happen on the field.

| # | Input | Values | Why it is asked |
|---|---|---|---|
| 1 | `delivery` | `legal`, `wide`, `noball`, `nodelivery` | Decides whether the ball counts toward the over, whether the free hit survives, and how the runs are credited |
| 2 | `runsCompleted` (+ `runsType`) | `0…6`, `bat`/`bye`/`legbye` | The runs on the board. The run **in progress** is never one of them (Law 18.11) |
| 3 | `outSlot` | `striker`, `nonstriker` | Who is dismissed — named by where they **started** the delivery |
| 4 | `dismissalEnd` | `striker`, `nonstriker` | Which end the wicket was put down at. **This is what decides the crease** |

### Why the end of dismissal is the crease question

While a run is being attempted the two batters travel in **opposite directions**,
so at the instant the wicket is put down they are at opposite ends. The dismissed
batter is, by definition, short of the end the wicket fell at. Therefore:

> **The incoming batter takes the end the wicket fell at; the not-out batter is at
> the other end.** (Law 18.12)

This holds for every case, including the three that catch scorers out:

* no run attempted (the keeper whips the bails off) — both are where they started;
* a batter sent back and beaten at the end they came from (never crossed);
* a batter beaten at the far end after crossing.

It also means **the completed-run count never moves the crease** — the end of
dismissal already accounts for every crossing. Runs decide the score; the end
decides who faces. The end of an over then swaps who is *facing*, not who *stands
where*, which is applied after the incoming batter is chosen.

`resolveEnds()` is exactly this:

```js
survivorSlot         = outSlot === 'striker' ? 'nonstriker' : 'striker'
survivorAtStrikerEnd = dismissalEnd === 'nonstriker'
newBatterEnd         = dismissalEnd
nextStrikerIs        = (overComplete ? !survivorAtStrikerEnd : survivorAtStrikerEnd)
                       ? 'survivor' : 'new'
```

---

## 1. Wide + run out

**Laws 22.4, 22.5, 22.7, 38.1.** Constant for every row below:

| Property | Value |
|---|---|
| Can a run out occur? | Yes — the ball is live |
| Which batter can be out? | Either |
| Runs type | **Wide** extras only — nothing off a Wide is ever credited to the bat (Law 22.4) |
| Runs awarded | `1 (penalty) + runs completed` (Law 22.5) |
| Does the ball count? | **No** (Law 22.7) |
| Does the over increase? | No |
| Ball faced by the striker? | No |
| Charged to the bowler? | Yes, all of it |
| Free hit | Unchanged — a Wide is not the free-hit delivery |
| Bowler credited with the wicket? | Never (Law 38.2) |

| # | Scenario | Runs completed | Team runs | Chip | Notes |
|---|---|---|---|---|---|
| 1.1 | Wide + striker run out | 0 | 1 | `WD+W` | |
| 1.2 | Wide + non-striker run out | 0 | 1 | `WD+W` | |
| 1.3 | Wide + keeper run out (stumping-style, not a stumping) | 0 | 1 | `WD+W` | A keeper breaking the wicket while the batter is **running** is a run out; if the batter is out of their ground *without attempting a run*, it is a **stumping** on a wide — a separate dismissal |
| 1.4 | Wide + bowler run out | 0 | 1 | `WD+W` | Fielder = the bowler; still not the bowler's wicket |
| 1.5 | Wide + direct hit | any | `1+r` | | Only the fielder credited differs |
| 1.6 | Wide + relay throw | any | `1+r` | | Credit the fielder who broke the wicket; the app records one fielder |
| 1.7 | Wide + throw deflection | any | `1+r` | | As above |
| 1.8 | Wide + one run completed | 1 | 2 | `2wd+W` | |
| 1.9 | Wide + two completed | 2 | 3 | `3wd+W` | |
| 1.10 | Wide + three completed | 3 | 4 | `4wd+W` | |
| 1.11 | Wide + four completed (all **run**) | 4 | 5 | `5wd+W` | |
| 1.12 | Wide + five completed | 5 | 6 | `6wd+W` | |
| 1.13 | Wide + overthrow, runs **completed**, then run out | r incl. overthrow runs | `1+r` | | Overthrow runs completed before the wicket count normally |
| 1.14 | Wide + **boundary** overthrow + run out | — | — | — | **Cannot both happen.** The ball is dead when the wicket is put down (Law 20.1). Either the wicket fell (score the completed runs, no boundary) or the ball reached the boundary (5 wides, no wicket) |
| 1.15 | Wide + boundary before the wicket | — | — | — | Same as 1.14 — the boundary makes the ball dead |
| 1.16 | Wide + no crossing (turned back, beaten at the end they left) | r | `1+r` | | `dismissalEnd` = the end they came from |
| 1.17 | Wide + crossing before the wicket | r | `1+r` | | `dismissalEnd` = the far end |
| 1.18 | Wide + returning to the same end | r | `1+r` | | Same as 1.16 |
| 1.19 | Wide + short run | r − short | `1+r−short` | | Enter the **corrected** completed-run count |
| 1.20 | Wide + deliberate short run | 0 + 5 penalty to fielding side | — | | **Not modelled** — Law 18.5.2 requires a 5-run penalty *and* the umpire disallowing the runs. Record the run out, then adjust with PEN 5 |
| 1.21 | Wide + helmet penalty | `1+r` **+5** | | | The 5 penalty runs ride along as a separate entry (existing PEN 5 path) |
| 1.22 | Wide + dead ball | — | — | — | If the umpire calls dead ball **before** the wicket, nothing is recorded at all |
| 1.23 | Wide + last ball of the over | r | `1+r` | | The over does **not** end — a wide is never the sixth ball. Another delivery follows, ends unchanged |
| 1.24 | Wide + last ball of the innings | r | `1+r` | | Same: the innings is not over, one more delivery is owed |
| 1.25 | Wide + match-winning run attempt | r | `1+r` | | The wide penalty alone can win the match — the win check runs on the resulting total |
| 1.26 | Wide + tie situation | r | `1+r` | | Scores level and the innings ends → tie, decided by the innings-end logic, not here |
| 1.27 | Wide + super over | r | `1+r` | | **Not implemented** — no super-over flow in the app (see §10) |

---

## 2. No ball + run out

**Laws 21.4, 21.13, 21.18, 38.1, 38.3.** Constant for every row:

| Property | Value |
|---|---|
| Can a run out occur? | Yes — the run out is the **only** dismissal the striker isn't protected from on a free hit (with obstructing the field and hitting the ball twice) |
| Runs awarded | `1 (penalty) + runs completed` |
| Runs type | Off the bat → the striker's runs. **Anything not off the bat is still a No ball extra** (Law 21.13) — byes and leg byes off a no ball are not recorded as byes |
| Does the ball count? | **No** (Law 21.18) |
| Ball faced by the striker? | **Yes** |
| Charged to the bowler? | Yes, all of it |
| Free hit | **Set** for the next delivery |
| Bowler credited with the wicket? | Never |

| # | Scenario | Runs | Type | Team runs | Bat runs | Chip |
|---|---|---|---|---|---|---|
| 2.1 | No ball + striker run out | 0 | — | 1 | 0 | `NB+W` |
| 2.2 | No ball + non-striker run out | 0 | — | 1 | 0 | `NB+W` |
| 2.3 | No ball + keeper run out | 0 | — | 1 | 0 | `NB+W` |
| 2.4 | No ball + bowler run out | 0 | — | 1 | 0 | `NB+W` |
| 2.5 | No ball + direct hit / relay / deflection | any | any | `1+r` | | Only the fielder credited differs |
| 2.6 | No ball + hit ball, 1 run, run out | 1 | bat | 2 | 1 | `2nb+W` |
| 2.7 | No ball + missed ball, batters run, run out | 1 | bye | 2 | 0 | `2nb+W` |
| 2.8 | No ball + bye | r | bye | `1+r` | 0 | `{1+r}nb+W` |
| 2.9 | No ball + leg bye | r | legbye | `1+r` | 0 | `{1+r}nb+W` |
| 2.10 | No ball + overthrow **run** | r incl. overthrows | bat | `1+r` | r | |
| 2.11 | No ball + **boundary** overthrow + run out | — | — | — | — | Impossible together — see 1.14 |
| 2.12 | No ball + boundary off the bat + run out | — | — | — | — | Impossible — the ball is dead at the boundary |
| 2.13 | No ball + crossing / no crossing / returning | r | any | `1+r` | | Expressed through `dismissalEnd` |
| 2.14 | No ball + short run | r − short | any | | | Enter the corrected count |
| 2.15 | No ball + deliberate short run | | | | | Not modelled (see 1.20) |
| 2.16 | No ball + free hit | r | any | `1+r` | | The free hit **stays on** — the next delivery is still a free hit |
| 2.17 | No ball + dead ball | — | — | — | — | Umpire's dead ball before the wicket → nothing recorded |
| 2.18 | No ball + last ball of the over | r | any | `1+r` | | The over does not end |
| 2.19 | No ball + match-winning run | r | any | `1+r` | | The no-ball penalty alone can win it |
| 2.20 | No ball + tie | r | any | `1+r` | | Handled by the innings-end logic |
| 2.21 | No ball + super over | | | | | Not implemented (§10) |
| 2.22 | **Non-striker run out before release** (Law 38.3) | 0 | — | **0** | 0 | `W` |

### 2.22 — the pre-delivery run out in full

`delivery = 'nodelivery'`. The bowler removes the bails with the non-striker
backing up, before entering their delivery stride's completion. Since the 2022
Code this is an ordinary run out (moved out of Law 41, Unfair Play).

| Property | Value |
|---|---|
| Ball bowled? | No — nothing is charged to anyone |
| Runs | 0, and no runs can be scored |
| Does the ball count? | No — the over is untouched |
| Which batter? | The non-striker only |
| Which end? | The bowler's end only |
| Ball faced? | No |
| Free hit | Unchanged |
| Strike | Unchanged — the striker keeps strike; the new batter comes in at the bowler's end |
| Stored as | `extraType: 'deadBall'`, `isWicket: true`, `wicketType: 'runout'`, `runs: 0`, `extras: 0` |

`deadBall` is in `NON_BALL_EXTRAS` on **both** sides (server over placement and the
scorecard's legal-ball counts), so it can never consume one of the over's six balls.

---

## 3. Scoring engine — the formulas

Let `r` = completed runs (already net of short runs), `d` = delivery.

```
scored          = max(0, runsCompleted − shortRuns)          # Law 18.5

batRuns         = d == noball && type == bat ? scored
                : d == legal  && type == bat ? scored
                : 0

extras          = d == wide   ? 1 + scored                    # Law 22.5
                : d == noball ? (type == bat ? 1 : 1 + scored) # Laws 21.4, 21.13
                : d == legal  ? (type == bat ? 0 : scored)     # Law 23
                : 0                                            # nodelivery

extraType       = d == wide ? 'wide' : d == noball ? 'noBall'
                : d == nodelivery ? 'deadBall'
                : type == bye ? 'bye' : type == legbye ? 'legBye' : null

teamRuns        = batRuns + extras
chargedToBowler = d == wide || d == noball ? 1 + scored
                : d == legal && type == bat ? scored : 0

countsAsBall    = d == legal                                   # Laws 21.18, 22.7
ballFaced       = d == wide || d == nodelivery ? 0 : 1
overComplete    = countsAsBall && ballsInOverBefore + 1 >= 6

freeHitNext     = d == noball ? true : d == legal ? false : freeHit
wicketToBowler  = false                                        # Law 38.2
```

Derived elsewhere, unchanged by a run out:

```
Current run rate      = totalRuns / (legalBalls / 6)
Required run rate     = (target − totalRuns) / (ballsRemaining / 6)
Bowler economy        = chargedRuns / (legalBallsBowled / 6)
Batter strike rate    = batterRuns / ballsFaced × 100
Maiden                = 0 runs charged to the bowler in the over
```

---

## 4. Database model

The `Ball` row is the single record of a delivery (`backend/prisma/schema.prisma`).
Everything else in a scorecard is derived from the ball stream — deliberately, so
there is one source of truth and no tallies to fall out of sync.

| Requested field | How it is handled |
|---|---|
| `deliveryType` / `ballType` | `extraType` — `null` (legal), `wide`, `noBall`, `bye`, `legBye`, `penalty`, `retired`, `deadBall` |
| `isWide`, `isNoBall`, `isBye`, `isLegBye` | Derived: `extraType === …` |
| `wideRuns`, `noBallRuns`, `byeRuns`, `legByeRuns` | `extras` on a row of that `extraType` |
| `batRuns` | `runs` |
| `completedRuns` | `runs + extras` minus the delivery's own penalty |
| `attemptedRuns` | **Not stored.** Always `completedRuns + 1` on a run out, and it scores nothing (Law 18.11) — no consumer |
| `dismissalType` | `wicketType` (`'runout'`) |
| `dismissedBatter` | `dismissedPlayerId` |
| `dismissedEnd` | **Not stored.** Consumed at scoring time to place the crease; the resulting crease *is* persisted (`Inning.strikerId` / `nonStrikerId`), so a resume restores the right ends |
| `fielder` | `wicketAssists` (name string) |
| `assistantFielder` | Not modelled — one fielder is credited |
| `keeper` | Not stored per ball; resolved from the XI's role (see the caught-behind flow) |
| `bowler` | `bowlerId` (per-ball, so shared overs work) |
| `crossed` | **Not stored** — subsumed by the end of dismissal (§0) |
| `shortRun` | Applied to the runs before saving; the correction route tags the ball (`'Accidental Short Run'`) |
| `intentionalShortRun` | Not modelled (§10) |
| `overthrow`, `boundary` | Not modelled as flags — overthrow runs are part of the completed runs; a boundary and a run out are mutually exclusive |
| `deadBall` | `extraType: 'deadBall'` for the pre-delivery run out |
| `appealMade`, `appealSuccessful` | Not modelled — only the outcome is recorded |
| `ballCounts` / `overCounts` | Derived server-side from `NON_BALL_EXTRAS`; the client's `countsAsBall` must agree |
| `nextStriker`, `nextNonStriker` | Persisted on the innings (`Inning.strikerId`, `nonStrikerId`) via the crease save |
| `inningsEnded`, `matchEnded` | `Inning` / `Match.status` |
| `freeHit` | Client state; re-derived on resume from the last delivery |

**Legality is server-authoritative.** The client sends `extraType`; the server
decides which over the ball lands in and when the over rolls
(`NON_BALL_EXTRAS = ['wide','noBall','penalty','retired','deadBall']`), so a stale
or malicious client cannot manufacture a seven-ball over.

---

## 5. Decision tree

```
WICKET → Run out
  │
  ├─ 1. What was bowled?
  │     ├─ Legal ball ─────────────► counts as a ball, consumes the free hit
  │     ├─ Wide ──────────────────► +1, no ball counted, free hit stands
  │     ├─ No ball ───────────────► +1, no ball counted, free hit set
  │     └─ Before release (38.3) ─► nothing scored, nothing counted → skip to 4
  │
  ├─ 2. Runs completed? (0–4)
  │     └─ if > 0 and legal ball → off the bat / byes / leg byes
  │        (wide → always wide extras; no ball → bat, else no-ball extras)
  │
  ├─ 3a. Which batter is out?  (striker / non-striker, as at the start of the ball)
  ├─ 3b. Which end was the wicket put down at?
  │        └─ new batter walks in there; not-out batter is at the other end
  │
  ├─ 4. Which fielder? (or "not sure")
  │
  └─ COMMIT
        ├─ team runs  += batRuns + extras
        ├─ wickets    += 1
        ├─ balls      += countsAsBall ? 1 : 0
        ├─ striker figures  += batRuns, ballFaced
        ├─ bowler figures   += chargedToBowler, ballFaced; NO wicket
        ├─ free hit    = freeHitNext
        ├─ crease      = survivor to the end opposite the dismissal
        ├─ over ends?  → defer the change of ends until the new batter is in
        ├─ 10 down / target passed? → innings / match end
        └─ persist ball, sync summary, notify watchers
```

---

## 6. Pseudocode

```js
function commitRunOut(draft, fielder) {                 // ScoringScreen
  handleScore('out', draft.runs, 'runout', draft.outSlot, fielder, null, false, draft);
}

function handleScore(value, addRuns, wicketType, dismissed, catcher, penalty, isRetry, runOut) {
  if (matchComplete || saving) return;
  if (!striker || !nonStriker) return askForNewBatter();
  if (firstBallOfOver && bowlerIneligible()) return askForBowler();

  const ro = runOut && resolveRunOut({
    delivery: runOut.delivery, runsCompleted: runOut.runs, runsType: runOut.runsType,
    outSlot: dismissed, dismissalEnd: runOut.end,
    ballsInOverBefore: score.balls, freeHit,
  });

  snapshot();                                            // for Undo
  score.wickets += 1;
  score.runs    += ro.teamRuns;
  score.balls   += ro.countsAsBall ? 1 : 0;
  overStrip.push(ro.chip);

  await persistBall({                                    // throws → nothing applied
    runs: ro.batRuns, extras: ro.extras, extraType: ro.extraType,
    isWicket: true, wicketType: 'runout',
    dismissedPlayerId: outPlayer.id, wicketAssists: catcher,
    countsAsBall: ro.countsAsBall, clientEventId,        // idempotent on retry
  });

  batStats[striker]  += { runs: ro.batRuns, balls: ro.ballFaced };
  bowlStats[bowler]  += { runs: ro.chargedToBowler, balls: ro.countsAsBall ? 1 : 0, wickets: 0 };

  //  Law 18.12 — the survivor stands opposite the end that fell
  if (ro.survivorAtStrikerEnd) { striker = survivor; nonStriker = null; empty = 'nonstriker'; }
  else                         { nonStriker = survivor; striker = null; empty = 'striker'; }
  askForNewBatterAt(empty);

  if (score.balls >= 6) { closeOver(); deferChangeOfEnds(); }
  freeHit = ro.freeHitNext;
  if (chaseComplete(score) || allOut(score) || oversDone(score)) endInningsOrMatch();
}
```

`resolveRunOut`, `resolveEnds`, `ballChip`, `chipRuns` are in
[`runOutEngine.js`](../frontend/src/utils/runOutEngine.js) — read them as the
normative version of §3 and §0.

---

## 7. JSON

What the client sends (`PUT /api/matches/:id/score`) — a wide + 1 run + run out of
the non-striker at the bowler's end:

```json
{
  "inningId": "cly…",
  "overNumber": 8,
  "ballNumber": 3,
  "bowlerId": "p_starc",
  "batterId": "p_rohit",
  "nonStrikerId": "p_gill",
  "runs": 0,
  "extras": 2,
  "extraType": "wide",
  "isWicket": true,
  "wicketType": "runout",
  "dismissedPlayerId": "p_gill",
  "wicketAssists": "Maxwell",
  "clientEventId": "1722…-a91f3c-0"
}
```

What the engine resolved it to (the shape of `resolveRunOut`'s return):

```json
{
  "valid": true, "errors": [], "notes": [],
  "batRuns": 0, "extras": 2, "extraType": "wide", "teamRuns": 2,
  "chargedToBowler": 2, "creditedAs": "wide",
  "runsCompleted": 1, "runInProgressScored": false,
  "countsAsBall": false, "ballFaced": 0, "ballsInOverAfter": 2, "overComplete": false,
  "wicketToBowler": false, "wicketType": "runout", "freeHitNext": false,
  "outSlot": "nonstriker", "dismissalEnd": "nonstriker",
  "survivorSlot": "striker", "survivorAtStrikerEnd": true,
  "newBatterAtStrikerEnd": false, "newBatterEnd": "nonstriker",
  "nextStrikerIs": "survivor",
  "chip": "2wd+W"
}
```

Commentary for the same ball (`runOutCommentary`):

> `Wide, 1 run then OUT — Gill run out (Maxwell)`

---

## 8. Test cases

`cd frontend && npm test` — **138 cases**, table-driven, in
[`__tests__/runOutEngine.test.js`](../frontend/__tests__/runOutEngine.test.js):

| Group | Cases | What it pins down |
|---|---|---|
| Wide + run out | 17 | Penalty, runs run as wide extras, ball never counted, free hit, ends |
| No ball + run out | 15 | Penalty, bat vs non-bat runs, ball faced, free hit set |
| Pre-delivery run out (38.3) | 5 | Nothing bowled, nothing scored, over untouched, strike unchanged |
| Legal delivery | 16 | Bat runs, byes, leg byes, bowler charge, over completion |
| Ends and strike | 15 | The full 2 × 2 × 2 crease matrix, plus runs-don't-move-the-crease |
| Validation | 15 | Impossible inputs refused; legitimate ones accepted |
| Notation | 24 | Chip strings, and that every chip reads back at its own run value |
| Commentary | 8 | One line per delivery type |
| Match situations | 10 | End-to-end rows in the shape a scorer reads them |
| Invariants (swept) | 13 | Each asserts over all **360** delivery × runs × type × batter × end × over-position combinations |

The invariant sweep is the important one: it re-checks every Law-derived rule
across the entire input space, so a change to one branch cannot quietly break a
Law somewhere else.

---

## 9. Law references

| Law | Clause used here |
|---|---|
| **18.5** | Short runs — disallowed runs are docked before scoring |
| **18.11** | Runs completed before a dismissal are scored; **the run in progress is not** |
| **18.12** | The ends the batters occupy after a dismissal |
| **20.1** | The ball is dead when the wicket is put down — nothing after it scores (so a boundary and a run out cannot both stand) |
| **21.4** | No ball penalty: 1 run, charged to the bowler |
| **21.13** | Runs off a no ball not off the bat are still recorded as no-ball extras |
| **21.18** | A no ball is not one of the over's six balls |
| **22.4** | Nothing can be scored off the bat from a wide |
| **22.5** | The wide penalty plus every run run is recorded as wide extras |
| **22.7** | A wide is not one of the over's six balls |
| **23** | Byes and leg byes — legal deliveries only; not charged to the bowler |
| **29 / 30** | Wicket put down; batter out of their ground — the physical test behind the scorer's answer |
| **38.1** | A batter is run out when the wicket is put down while they are out of their ground |
| **38.2** | A run out is **not** credited to the bowler |
| **38.3** | The non-striker may be run out before the ball is released; no delivery is bowled |
| **41** | Unfair play — deliberate short runs and their 5-run penalties (see §10) |

---

## 10. Deliberate limitations

Stated plainly so nobody assumes coverage that isn't there:

1. **Deliberate short runs** (Law 18.5.2 / 41) — the 5-run penalty to the fielding
   side and the disallowing of the runs are not automated. Record the run out with
   the corrected run count, then award PEN 5 from More Options.
2. **Super overs** — no super-over flow exists in the app, so the super-over rows in
   §1/§2 are "same rules, no dedicated UI".
3. **Appeals** — only outcomes are recorded, never the appeal itself.
4. **Two fielders** (relay/deflection) — one fielder is credited; the assist is lost.
5. **Boundary + run out** — treated as mutually exclusive, per Law 20.1. There is no
   input for "the throw went for four **after** the wicket fell", because those runs
   do not exist.
6. **Byes off a no ball** are recorded as no-ball extras (Law 21.13), so the extras
   breakdown shows them under no balls, not byes. That is the Law, not a shortcut —
   but it differs from some club scorebooks that split them out.
7. **Both batters at the same end** — a rare mix-up where the survivor ends up at the
   same end as the dismissed batter. The flow always places the survivor opposite the
   dismissal; correct it afterwards if it ever happens.
