# Cricket Scoring — QA Final Report

Full audit of the cricket scoring workflow: rules engine, aggregation,
API, database, and automated tests. Per-bug detail in `CRICKET_BUG_AUDIT.md`.

---

## 1–6. Bug totals

| | count |
|---|---|
| **Total found** | **13** |
| CRITICAL | 1 |
| HIGH | 5 |
| MEDIUM | 6 |
| LOW | 1 |
| **Fixed** | **12** |
| Open (by decision) | 1 |

Six were affecting production data **at the time of the audit**. Six were
latent — correct today only because the triggering data does not exist yet.

## 7. Remaining issues

**BUG-12 — historical data, 4–14 July 2026.** Four faults (26 over-long overs,
150 deliveries faced by dismissed batters, 7 bowlers past their spell limit, 3
headline scores disagreeing with ball totals). All predate fixes that have since
landed; **nothing after 14 July is affected**, including matches scored today.

Left open deliberately. Correcting it is a production data migration, and it
needs an explicit decision plus a dry run showing exactly which rows change.
It is not a code defect — the code that caused it is already fixed.

## 8. Tests added

| file | tests | covers |
|---|---|---|
| `backend/test/cricketRules.test.js` | 29 | the four rule questions across all 8 extra types and 15 wicket types; Prisma filters vs their predicates; overs arithmetic; innings phases; pace/spin parsing |
| `backend/test/scoringEngine.test.js` | 22 | a full over of every delivery type with figures worked out by hand; maidens; who gets each wicket; stumping off a wide; run out off a no ball; chase end conditions; all-out for non-standard squad sizes |

Every bug in the audit has a regression test except BUG-11 and BUG-12, which
are verified against live data rather than in-process (noted below).

Figures in `scoringEngine.test.js` are computed by hand in the comments, not
copied from a run. A test that agrees with the implementation by construction
proves nothing.

## 9. Tests passed

```
backend    node --test test/*.test.js     76 passed, 0 failed
frontend   jest                          138 passed, 0 failed
                                    TOTAL 214 passed, 0 failed
```

Pre-existing suites (`matchSquad`, `mvp`, `runOutEngine`) were run before any
changes and pass unchanged after them. **No test was modified or disabled to
make it pass.**

## 10. Build status

| check | result |
|---|---|
| `prisma validate` | schema valid |
| backend syntax (every `src/**/*.js`) | all parse |
| `eslint --quiet src` (whole frontend) | **0 errors** |
| Metro production bundle (android, `--dev false`) | succeeds |
| Prisma migrations | up to date on Neon |

`eslint` over the whole frontend initially reported **4 errors** — duplicate
object keys in `TournamentsScreen`, left over from a blue→lime colour
migration. Removing the dead keys exposed a genuine defect underneath: the
tournaments FAB had `justifyContent` and no `alignItems`, so its icon sat
left-of-centre in a 56pt circle. Both fixed (BUG-13, LOW).

There is no type checker in this project (plain JS, no TypeScript), so type
checking is not applicable.

## 11. Final cricket scoring verification

**Rules — verified by test.** Legal vs illegal deliveries; ball count and over
completion; maidens (including that byes do *not* break one); bowler runs
conceded, wickets and economy; batter runs, balls faced, strike rate,
boundaries; extras by kind; wicket attribution for all 10 dismissals; chase
targets, ties and all-out for squads of any size.

**Data — verified against production (read-only).**

| check | result |
|---|---|
| innings totals vs ball-by-ball | 57 innings, **0 discrepancies** |
| orphaned overs / innings / balls | 0 |
| empty overs (undo residue) | 0 |
| unknown batter / bowler / dismissed player | 0 |
| wickets with no dismissed player | 0 |
| duplicate idempotency keys | 0 |
| orphaned shot rows | 0 |
| duplicate innings numbers | 0 |
| legal-ball filter vs predicate | 1,795 = 1,795 over 1,965 balls |

**API — verified by probe.** Request validation now rejects negative runs,
absurd runs and unknown extra types while accepting every value the client
actually sends. Cross-match writes and deletes are refused with 403.

**Cross-file agreement.** Every duplicated cricket rule was compared
implementation-by-implementation across all inputs, in both halves of the app:
`isLegalDelivery`, `isBallFaced`, `offTheBat`/`batRuns`, boundaries,
`isBowlerWicket`, maidens. All now resolve to one definition per half, and the
frontend copy is verified identical to the backend authority.

## 12. Risks that remain

**Not tested — no device was attached.** `adb devices` was empty throughout, so
nothing below was exercised and none of it should be read as passing:

- on-device UI interaction: button enabled/disabled states, modal behaviour,
  navigation, back-button handling
- responsiveness across phone/tablet/desktop, overflow, text clipping
- runtime console errors and network-failure behaviour in the app
- real-time scorer↔spectator synchronisation against a live device
- the full scorer workflow end to end (toss → innings → chase → completion)
  performed by a human

The scoring engine underneath that workflow is now covered by tests; the
*interaction* is not, and that is the class of problem this audit structurally
could not reach.

**Concurrency is bounded, not eliminated.** Duplicate submissions are handled by
the `clientEventId` idempotency key, and the two destructive endpoints (undo,
short run) now refuse to act while a delivery is in flight. Two scorers editing
one match simultaneously is prevented by `assertScorer` allowing only one. What
is *not* covered is two devices signed in as the same scorer — last write wins.

**The July data still skews those matches' figures** until BUG-12 is decided.

**Six of the fixes are latent-bug fixes.** They are correct by construction and
by test, but no production data exercises them yet — the first `deadBall`, the
first `obstructing` dismissal. They are proven by test, not by traffic.

**Super over and DLS are not implemented.** A tied knockout and a rain-affected
target both fall outside what the app can currently score. Neither was in scope
to add; both are real gaps for competitive cricket.

---

## Summary

Thirteen bugs found, twelve fixed, one left open as a data decision. Eleven of
the thirteen had a single shape — **a cricket rule written out in more than one
file, drifting in one copy** — which is why the fixes consolidated rules into
`backend/src/lib/deliveries.js` and `frontend/src/utils/cricketRules.js` rather
than patching each site. Fifty-one new tests exist to stop them being retyped.

The most serious finding was not a cricket rule at all: **BUG-11**, where the
authorisation check proved the caller could score *this match* while the write
used an `inningId` from the request body, unverified — allowing a ball to be
written into, or deleted from, a different match entirely.
