# Cricket Scoring — Bug Audit

Audit of the cricket scoring workflow: rules engine, aggregation, API, database.
Every bug below was reproduced before being fixed and re-checked afterwards.

**Scope note.** No device or emulator was attached during this audit (`adb devices`
empty), so this covers code, data, API behaviour and automated tests. It does
**not** cover on-device UI interaction — button states, responsiveness, modal
behaviour, console errors. Those are listed as untested in the final report
rather than claimed as passed.

---

## The pattern

Eleven of the twelve bugs have one shape: **a cricket rule written out in more
than one file, drifting in one copy.** Four questions that look like one:

| question | function | a no ball answers |
|---|---|---|
| does this advance the over? | `isLegalDelivery` | **no** |
| did the batter face it? | `isBallFaced` | **yes** |
| are the runs the batter's? | `offTheBat` | **yes** |
| is the wicket the bowler's? | `isBowlerWicket` | independent |

Almost every bug was one counter using another counter's answer.

---

## BUG-01 — Bowler credited for wickets the Laws give to nobody

- **Severity** HIGH · **Module** `lib/deliveries.js`, scoring screen
- **Description** `isBowlerWicket` defaults to *"the bowler's"* and excludes a named list. Obstructing the field, timed out and hit-the-ball-twice were not on it.
- **Reproduce** `isBowlerWicket({isWicket:true, wicketType:'obstructing'})` → `true`
- **Expected** none of the three is the bowler's wicket
- **Actual** all three credited to the bowler
- **Root cause** Default-allow list; the three dismissals did not exist in the app so nobody had added them.
- **Fix** Added to `NOT_BOWLERS_WICKET` and to `BOWLER_WICKET_WHERE` **before** the scoring screen learned to offer them. Also added the three missing dismissal types (the Laws have 10; the app offered 7).
- **Test** `cricketRules.test.js` — "the bowler gets none of the three the Laws credit to nobody"
- **Status** FIXED · commit `d6530a6`

## BUG-02 — Bowler spell limit bypassed by a mid-over change

- **Severity** HIGH · **Module** `PUT /matches/:id/score`
- **Description** The over quota was checked only when a NEW over was created. The same endpoint supports mid-over bowler changes, and that path checked nothing.
- **Reproduce** Bring on a bowler who has bowled their full quota part-way through an over.
- **Expected** 409 `BOWLER_OVER_LIMIT`
- **Actual** Accepted; the bowler continues past their allowance.
- **Root cause** The check lived inside the `else` branch that creates an over.
- **Fix** Checked on every delivery. Still lets a bowler finish the over they are in (21 legal balls → `floor(21/6)=3` under a cap of 4) and stops them at 24. The no-consecutive-overs rule deliberately stays on the new-over branch — it is about who *starts* an over.
- **Test** Boundary verified at 17/18/21/22/23/24/25 legal balls.
- **Status** FIXED · commit `8f86268`

## BUG-03 — Leaderboard counted a dead ball as a legal delivery

- **Severity** MEDIUM (latent) · **Module** `lib/leaderboard.js`
- **Description** Its rule chain ended in `else { charged = b.runs; legal = true; }`, and `deadBall` fell into it.
- **Expected** `deadBall` is in `NON_BALL_EXTRAS`; it does not advance the over.
- **Actual** Counted toward the bowler's overs, flattering economy against every other screen.
- **Root cause** Local copy of the rule. The file had already moved its *wicket* rule to `deliveries.js` and left this one behind.
- **Fix** Uses `isLegalDelivery()`; charged chain inverted so anything unnamed is not charged.
- **Test** All three implementations compared across all 8 extra types.
- **Status** FIXED · commit `40530cc`

## BUG-04 — Same dead-ball omission in a second file

- **Severity** MEDIUM (latent) · **Module** `routes/players.js`
- **Description** Legal-ball filter listed `['wide','noBall','penalty','retired']` — missing `deadBall`.
- **Root cause** A fourth handwritten copy. Two files, same fault, unconnected — the problem is the retyping, not the typo.
- **Fix** Added `LEGAL_DELIVERY_WHERE` to `deliveries.js`, **derived from `NON_BALL_EXTRAS`**, and used it. Mirror of the existing `BOWLER_WICKET_WHERE`.
- **Test** Prisma filter vs predicate over all 1,965 balls: both return 1,795.
- **Status** FIXED · commit `ea919b0`

## BUG-05 — My Stats understated every affected batter's strike rate ⚠ LIVE

- **Severity** HIGH · **Module** `lib/playerCareer.js`
- **Description** Four files defined "balls faced" four ways. `playerCareer` — the one behind My Stats — excluded only wides, so penalties and retirements counted as balls faced.
- **Reproduce** Any batter on strike for a penalty or retirement.
- **Expected** Neither is a delivery; neither was faced.
- **Actual** Denominator inflated, strike rate flattened. **Nine such balls in production, five batters affected:**

```
Shivam Dube      faced 50 -> 46   SR understated by 8.7%
Karthik Raja     faced 80 -> 78   SR understated by 2.6%
Ruturaj Gaikwad  faced 93 -> 92   SR understated by 1.1%
Palani PS        faced 44 -> 43   SR understated by 2.3%
Suresh Krish    faced 157 -> 156  SR understated by 0.6%
```

- **Fix** `isBallFaced()` in `deliveries.js`, used by all four. `leaderboard.js` and live-state also missed `deadBall`.
- **Test** `cricketRules.test.js` — the penalty/retired/deadBall case, and the no-ball-is-faced case.
- **Status** FIXED · commit `fbb2a6a` · **no migration — derived on read, corrects on deploy**

## BUG-06 — A four off a no ball was not a four on team screens ⚠ LIVE

- **Severity** MEDIUM · **Module** `lib/teamStats.js`
- **Description** `if (!b.extraType && r === 4)` — requires no extra at all, so a boundary struck off a no ball was excluded.
- **Expected** Runs off the bat on a no ball are the batter's, boundaries included.
- **Actual** Two exist in production. Team fours 198 → 200.
- **Root cause** Its own spelling of `batRuns` too — correct today only because no wide/retirement/dead ball carries runs off the bat. Correct by coincidence.
- **Fix** `offTheBat()` and `batRuns()` moved to `deliveries.js`; `playerCareer` also lost a private `offTheBat` it had defined and then not used for its own boundary counts.
- **Test** `scoringEngine.test.js` — "a four off a no ball IS the batter's four"
- **Status** FIXED · commit `b91d763`

## BUG-07 — The scorecard disagreed with itself ⚠ LIVE

- **Severity** MEDIUM · **Module** `screens/ScorecardScreen.js`
- **Description** Three sites in one file, three answers:

| line | what | no-ball four? |
|---|---|---|
| 259 | batting table | counts it |
| 535 | ball-by-ball card | does not |
| 114 | over-strip chip | does not |

- **Actual** The same delivery was a four in the batter's 4s column and not a boundary in the commentary line describing it. Balls-faced also omitted `deadBall`.
- **Fix** Added `frontend/src/utils/cricketRules.js` — a deliberate copy of the backend's rules (the phone must work offline), with a header naming the authority. All three sites use it.
- **Test** Frontend copy verified against the backend across all 8 extra types — identical.
- **Status** FIXED · commit `422dbe5`

## BUG-08 — Live bowler figures disagreed with the final scorecard ⚠ LIVE

- **Severity** HIGH · **Module** `screens/ScoringScreen.js`
- **Description** Two local copies of the bowler-credit rule, neither matching the backend nor each other.

```
              live (scoring)   final (server)
retiredout    bowler           NOT bowler
retiredhurt   bowler           NOT bowler
obstructing   bowler           NOT bowler
timedout      bowler           NOT bowler
hitballtwice  bowler           NOT bowler
```

- **Actual** A bowler's wicket count ticked up in front of the scorer and quietly went back down after the match. `retiredout` exists in production twice.
- **Root cause** Three of the five were introduced by BUG-01's fix — the canonical list was corrected and a client-side copy was not searched for.
- **Fix** `isBowlerWicket` added to `utils/cricketRules.js`; both sites use it.
- **Test** Verified against the backend across 15 inputs including odd casing, spaces, empty, null.
- **Status** FIXED · commit `cc59763`

## BUG-09 — Five more copies of the bowler-credit rule ⚠ LIVE

- **Severity** HIGH · **Module** live-state, scorecard route, scorecard screen (×3)
- **Description** Found by grepping **both halves** for the shape of the rule rather than the file in hand.
- **Actual** Bowling figures on the scorecard credited retired-out and retired-hurt. Wickets credited to bowlers: **101 → 99 of 110**.
- **Fix** All five use the shared rule. No `!== 'runout'` remains anywhere outside the two files that define it.
- **Status** FIXED · commit `b9235e2`

## BUG-10 — Scoring endpoint accepted negative and absurd values

- **Severity** HIGH · **Module** `PUT /matches/:id/score`
- **Description** `runs` and `extras` were bare `z.number().int()` with no bounds, and `extraType` was a free string.
- **Reproduce** `{ runs: -10 }` → accepted. `{ extraType: 'banana' }` → accepted.
- **Expected** Rejected.
- **Actual** The route applies `increment: data.runs + data.extras`, so a negative **subtracts from the innings total**. A junk `extraType` is stored and read back as a *legal* delivery (not in `NON_BALL_EXTRAS`) whose runs belong to nobody (not `offTheBat`) — a ball that counts against the over and pays no one.
- **Fix** `runs`/`extras` bounded `0..12` (client maximum is 7; 12 leaves room for overthrows). `extraType` is now an enum of the seven values the client actually sends. `wicketType` left free text — historical spellings exist and `isBowlerWicket` is deliberately tolerant — but length-capped at 30.
- **Test** Verified rejection of `-10`, `9999`, `-5`, `'banana'`; verified acceptance of `6`, `7`, no-ball+6, penalty 5, dead-ball run out, null.
- **Status** FIXED · this audit

## BUG-11 — Cross-match writes and deletes ⚠ AUTHORIZATION

- **Severity** CRITICAL · **Module** all three scoring endpoints
- **Description** `assertScorer` proves the caller may score **match `:id`**. It says nothing about the `inningId` they then send, and every scoring endpoint used that id directly.
- **Reproduce** As scorer of match A, `PUT /matches/A/score` with match B's `inningId`.
- **Expected** 403.
- **Actual** Accepted — the ball is written into match B's innings and B's totals are incremented. The same hole existed on `DELETE /:id/score/last` (deletes another match's last ball) and on the short-run endpoint.
- **Root cause** The authorisation check answered a different question from the one the write asked.
- **Fix** `assertInningInMatch()` on all three: 400 without an id, 404 if unknown, 403 `INNING_MISMATCH` if it belongs elsewhere.
- **Test** Verified against two real innings from different matches: own → allowed, other match's → 403, made-up → 404.
- **Status** FIXED · this audit
- **Note** Not reachable from the app, which always sends the correct id. Fixed anyway: the app is not the only thing that can call this, and a stale client is an accident rather than an attack.

## BUG-12 — Historical data faults (NOT fixed — needs a decision)

- **Severity** MEDIUM · **Module** production data
- **Description** Four faults confined to **4–14 July 2026**, all predating fixes that have since landed:

| fault | count |
|---|---|
| overs holding 7–13 legal balls | 26 |
| deliveries faced by an already-dismissed batter | 150 |
| bowlers past their spell limit (up to 7 in a T20) | 7 |
| completed matches whose headline score ≠ ball total | 3 → **see BUG-13, not legacy** |

- **Verified not ongoing** — nothing after 14 July is affected, including matches from today.
- **Impact** Those matches' career figures are skewed (a bowler carrying 7 overs in a T20 has a wrong economy).
- **Status** OPEN — deliberately. Cleaning is a production data migration; it needs an explicit decision and a dry run showing exactly which rows change.


## BUG-13 — Undo left the headline score one ball ahead ⚠ LIVE

- **Severity** HIGH · **Module** `DELETE /matches/:id/score/last`
- **Found** on the emulator, by scoring a ball and undoing it — not by reading code.
- **Description** Undo removes the ball and corrects the innings totals, but
  `Match.score1`/`score2` is a **separate denormalised string** that only the
  scoring screen wrote, and only on the way forward.
- **Reproduce** Score a four, undo it, compare screens.
- **Expected** Every surface shows the same score.
- **Actual**

```
scorecard / scoring screen   92/1 (4.0)   ← from the ball rows
match list / team / feed     96/1 (4.1)   ← from Match.score1
inning.totalRuns             92           ← correct
sum of ball rows             92           ← correct
```

  The scorecard was right and the headline was one ball ahead, permanently.
- **Root cause** Two representations of one number, only one of them maintained
  on the reverse path. The same shape as every other bug in this audit — a fact
  stored twice, with one copy left behind.
- **Fix** The undo endpoint now recomputes the headline **from the ball rows**
  and writes it back. Recomputed rather than decremented, because a string that
  has already drifted cannot be corrected by taking one ball off it.
- **This supersedes part of BUG-12.** The three completed matches whose headline
  disagreed with their ball total were filed as historical July damage. They are
  not. Undo reproduces it on demand, and the July dates were coincidence — that
  is when those matches happened to be undone.
- **Status** FIXED. The one match this audit's own testing left stale was
  corrected in place (96/1 → 92/1).
