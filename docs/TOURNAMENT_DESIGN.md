# Tournament Management — Business Logic & Data Design

Design only: entities, relationships, validation, workflows and cricket rules.
No technology, framework or language decisions here.

It is written against **what this app already has**, not a blank page. Section 12
lists exactly what exists, what is missing, and the four places where the
requested design contradicts the current schema.

---

## 1. Design rules that shape everything below

Five decisions drive the rest of the model. They are stated first because most of
the table design follows from them.

### 1.1 Balls are the source of truth. Everything else is derived.

`PointsTable`, `PlayerStatistics` and `TeamStatistics` are **materialised
projections**, never authored. They exist for read speed. Every one of them must
be reproducible by replaying matches, and a `Rebuild` operation must exist for
each. If a stored table and a rebuild ever disagree, the rebuild is right.

This matters because scorers correct things. A ball is edited three days later; a
result is overturned. If standings are hand-maintained, that correction silently
never reaches the table. Derived-and-rebuildable is the only shape that survives
a correction.

### 1.2 Store balls, never decimal overs.

`4.3 overs` is 27 balls. It is **not** 4.3, and arithmetic on it is wrong:
`4.3 + 0.3` is 5.0 overs, not 4.6. Every persisted over count is an integer ball
count. Overs are formatted for display only, at the edge.

This single mistake is the most common source of wrong Net Run Rate in amateur
tournament software.

### 1.3 A player's team is per tournament, not a property of the player.

The requested `Player.TeamId` is a design flaw for anything beyond one season.
The same person plays for different clubs in different tournaments, and for two
teams in the same year. Squad membership belongs on a join entity
(`TournamentSquad`), leaving `Player` as a stable identity.

Without this, multi-season leagues, transfers and player drafts — all named as
future features — each require a schema migration.

### 1.4 Rules are rows, not columns.

Forty boolean columns on `Tournament` (`FreeHit`, `Mankad`, `ImpactPlayer`…)
means a migration every time a rule is added, and no way to carry a value with a
rule (*how many* powerplay overs, *what* penalty). `TournamentRule` is one row
per rule with an enabled flag and a small config payload.

### 1.5 Money and identity are never soft-deleted.

Soft delete (`IsDeleted`) is right for tournaments, teams, fixtures. It is wrong
for `Payment` and `AuditLog` — those are append-only. A refunded payment is a new
row, not a mutated one.

---

## 2. Common columns

Every table carries:

| Column | Purpose |
|---|---|
| `Id` | UUID primary key |
| `CreatedDate` / `CreatedBy` | Origin |
| `UpdatedDate` / `UpdatedBy` | Last mutation |
| `IsDeleted` | Soft delete — **except** `Payment`, `AuditLog`, `BallByBall` |
| `RowVersion` | Optimistic concurrency |

`RowVersion` is not decoration. Two scorers on one match, and an admin editing a
fixture while the generator reseeds, are both real. Concurrency control belongs
on `Match`, `Innings`, `PointsTable` and `TournamentTeam` at minimum.

---

## 3. Entities and relationships

### 3.1 Tournament core

```
Tournament ──1:1── TournamentSettings      (format, squad limits, playing XI)
           ──1:1── TournamentRegistration  (dates, fee, caps)
           ──1:N── TournamentRule          (one row per toggleable rule)
           ──1:N── TournamentPointsRule    (points per outcome + tiebreak order)
           ──1:N── TournamentPrize         (placing → amount)
           ──1:N── TournamentSponsor
           ──1:N── TournamentStage         (group stage, super six, knockout…)
           ──1:N── TournamentTeam          (registration)
           ──1:N── Match
           ──1:N── TournamentAward
```

`Tournament` itself stays small: identity, ownership, dates, status, visibility.
The ~90 requested fields are split across `TournamentSettings`,
`TournamentRegistration`, `TournamentRule`, `TournamentPrize` and
`TournamentSponsor` rather than living on one very wide row.

**Why split.** The wide-row version means every rule read loads the banner URL
and the WhatsApp number, every settings write risks clobbering a concurrent
registration edit, and the row is edited by three different roles for three
unrelated reasons.

### 3.2 Venue and ground

```
Venue ──1:N── Ground ──1:N── GroundAvailability
```

A venue is a place; a ground is a playable surface at it. A club with three
pitches is one `Venue` and three `Ground` rows, and fixtures are scheduled
against a **ground**, never a venue — two matches cannot share a pitch.

`GroundAvailability` (ground, date, start, end, status) is what makes automatic
scheduling possible. Without it the generator can only space matches by date and
will happily double-book.

### 3.3 Teams, players, squads

```
Team ──1:N── TournamentTeam ──1:N── TournamentSquad ──N:1── Player
```

- `Team` — the club. Persistent across tournaments.
- `TournamentTeam` — this team's entry in this tournament. Carries registration
  state, seed, group, payment.
- `TournamentSquad` — this player, in this team, for this tournament. Carries
  jersey number, role, captain/vice-captain/keeper flags, and registration status.
- `Player` — the person. No team column. See §1.3.

Captaincy sits on `TournamentSquad`, not `Team` and not `Player`: a club captain
in one tournament may not lead in another.

### 3.4 Match and scoring

```
Match ──1:N── Innings ──1:N── Over ──1:N── BallByBall
      ──1:1── MatchOfficials
      ──1:N── MatchPlayer        (the playing XI + substitutes for this match)
      ──1:N── MatchInterruption   (rain, bad light, DLS revisions)
```

`MatchPlayer` is not the same as `TournamentSquad`. A squad is 16; a playing XI
is 11 plus named substitutes. Impact player and concussion substitute both act on
`MatchPlayer`, and a scorecard that reads the squad instead of the XI shows five
people who never took the field.

`MatchOfficials` is 1:1 and nullable throughout — amateur cricket routinely plays
with one umpire and no referee.

### 3.5 Derived tables

```
PointsTable        (Tournament, Team)   — rebuildable from Match
TeamStatistics     (Tournament, Team)   — rebuildable from BallByBall
PlayerStatistics   (Tournament, Player) — rebuildable from BallByBall
```

Each carries a `LastComputedAt` and the id of the last match folded in, so a
rebuild can be incremental and a staleness check is cheap.

### 3.6 Supporting

```
Registration ──1:N── Payment
Notification
AuditLog
Media           (polymorphic: owner type + owner id + purpose)
```

`Media` as one table with `OwnerType` / `OwnerId` / `Purpose` avoids eight
near-identical image tables (tournament logo, banner, sponsor logo, ground photo,
team logo, player photo, payment receipt, document).

---

## 4. State machines

State is not a free-text column. Each of these is a closed set with defined legal
transitions; anything else is rejected.

### 4.1 Tournament

```
Draft → RegistrationOpen → RegistrationClosed → Published
      → InProgress → Completed
                   ↘ Cancelled  (from any state before Completed)
```

Guards:

- `Draft → RegistrationOpen` — dates set, format chosen, min/max teams valid.
- `RegistrationClosed → Published` — at least `MinimumTeams` **approved** teams,
  and fixtures generated.
- `Published → InProgress` — first match starts.
- `InProgress → Completed` — every non-abandoned fixture is `Completed`, and the
  final has a winner.

`Cancelled` is terminal and must record a reason. It does not delete anything.

### 4.2 Team registration

```
Draft → Submitted → UnderReview → Approved
                                ↘ Rejected  (reason required)
                  ↘ Withdrawn
```

Approval is what admits a team to fixture generation. `Submitted` teams are
**not** counted toward `MinimumTeams`.

### 4.3 Match

```
Scheduled → Toss → InProgress → Completed
          ↘ Delayed → InProgress
          ↘ Abandoned      (no result — points split)
          ↘ Forfeited      (walkover — full points to the other side)
          ↘ Cancelled
```

`Abandoned` and `Forfeited` are different outcomes with different points and
different NRR treatment. See §7.4.

### 4.4 Payment

```
Pending → Submitted → Verified
                    ↘ Rejected → Submitted   (retry allowed)
        ↘ Waived  (admin, reason required)
```

---

## 5. Validation rules

### 5.1 Tournament

| Rule | Detail |
|---|---|
| Dates ordered | `RegistrationStart ≤ RegistrationEnd ≤ StartDate ≤ EndDate` |
| Team bounds | `MinimumTeams ≥ 2`, `MaximumTeams ≥ MinimumTeams` |
| Knockout size | Knockout formats need `MaximumTeams ≥ 2`; brackets pad with byes |
| Squad bounds | `MinPlayers ≥ PlayingXI`, `MaxPlayers ≥ MinPlayers` |
| Playing XI | Typically 11; configurable for 6-, 8- and 9-a-side |
| Overs | `OversPerInnings ≥ 1`; `MaxOversPerBowler ≥ ⌈Overs ÷ 5⌉` or the format is unplayable |
| Powerplay | `PowerplayOvers < OversPerInnings` |
| Entry fee | `≥ 0`, and a currency is required when `> 0` |
| Rules frozen | Once `InProgress`, rule changes are blocked or force a recompute |

That last one matters more than it looks. Changing "points for a win" mid-tournament
silently rewrites the table for matches already played. Either freeze it, or
require an explicit recompute with an audit entry.

### 5.2 Registration

- Registration window is open (`now` within start/end), unless an admin overrides.
- Approved team count `< MaximumTeams`.
- This team is not already registered (unique on `TournamentId + TeamId`).
- Squad size within `[MinPlayers, MaxPlayers]`.
- Payment `Verified` or `Waived`, when a fee applies.

### 5.3 Team and squad

- Team name unique **within the tournament**, not globally.
- Exactly one captain per squad; at most one vice-captain; at most one keeper
  flagged per XI.
- Jersey numbers unique within a squad. Null allowed; duplicates are not.
- A player appears in **at most one squad per tournament**, unless transfers are
  enabled — then at most one *active* squad, with history retained.
- Minimum age / maximum age when an age-group rule is configured.

### 5.4 Fixtures

- A team cannot appear twice in one match.
- A team cannot have two matches whose time windows overlap.
- A ground cannot host two matches whose windows overlap.
- Rest days: minimum gap between a team's consecutive matches, configurable.
- No duplicate pairing within a stage, unless the format is home-and-away — in
  which case exactly two, with reversed home/away.

### 5.5 Match

- Both teams are `Approved` entrants.
- Toss winner is one of the two teams; decision is Bat or Bowl.
- Playing XI size equals `PlayingXI`; every member belongs to that team's squad.
- No player is in both XIs.
- A bowler cannot exceed `MaxOversPerBowler`.
- A bowler cannot bowl consecutive overs.
- Result requires a winner unless the type is Tie, NoResult, Abandoned.

---

## 6. Fixture generation

Input: approved teams, format, ground availability, date window, constraints.
Output: `Match` rows, unsaved, for review before commit.

**Generation is a proposal, not a commitment.** It returns a draft the organiser
can edit before publishing, because ground availability and local knowledge never
fully live in the data.

### 6.1 Round robin

Circle method: fix one team, rotate the rest. `n` teams → `n−1` rounds of `n/2`
matches. Odd `n` → add a bye placeholder; the team drawn against it sits out that
round. Home and away doubles the rounds with the fixture reversed.

### 6.2 Groups

Teams are distributed by seed in snake order (1→A, 2→B, 3→B, 4→A…) so seeding
strength is spread rather than stacked. Round robin runs within each group.

### 6.3 Knockout

Bracket size is the next power of two above the entrant count; the difference is
byes, assigned to the **highest seeds**. Standard seeding pairs 1 v n, 2 v n−1.

Matches are created with **placeholders**, not teams — `Winner of QF1`,
`Loser of Qualifier 1`, `Group A Winner` — and resolve as results land. This is
the only way a bracket can exist before the group stage finishes.

*(This app already does exactly this — see §12.)*

### 6.4 League then knockout

The league runs first. When every group match is `Completed`, the top `k` per
group are seeded into the bracket **by final standings** — which is why standings
must be correct and complete before the bracket resolves, not merely present.

### 6.5 Double elimination

Winners and losers brackets. A team leaves on its second defeat. The final may
require a bracket reset if the losers-bracket team wins — decide once, per
tournament, whether it does.

### 6.6 Swiss

No fixed bracket. Each round pairs teams on equal or near-equal points, avoiding
repeat pairings, for a fixed number of rounds. Requires standings after every
round, so round `r+1` cannot be generated until round `r` is complete.

---

## 7. Points table

### 7.1 Points

Configurable per tournament: win, tie, no result, loss, bonus. Defaults 2 / 1 / 1 / 0.

### 7.2 Net Run Rate

```
NRR = (RunsScored ÷ OversFaced) − (RunsConceded ÷ OversBowled)
```

Where overs are `balls ÷ 6`, computed from ball counts (§1.2).

**The rule that is almost always implemented wrong:** if a team is **all out**
before its full allocation, `OversFaced` is the **full quota**, not the overs
actually faced. A side bowled out for 60 in 12 of 20 overs is charged 20.

Without this, being bowled out cheaply *improves* your run rate, which inverts
the entire point of the measure.

Further:

- Matches with **No Result** are excluded from NRR entirely.
- **DLS-affected** matches use the revised target and revised overs.
- A **conceded/forfeited** match is excluded from NRR but counts for points.

### 7.3 Tie-breaks

Ordered, configurable, applied in sequence:

1. Points
2. Net Run Rate
3. Head-to-head result between the tied teams
4. Wins
5. Boundary count
6. Drawn lots / coin toss

Head-to-head is only meaningful among exactly the tied teams — when three teams
tie, it is the mini-table of matches between those three, not the full table.
Implement it as a sub-table, or it produces nonsense in three-way ties.

### 7.4 Special results

| Result | Points | NRR |
|---|---|---|
| Win / Loss | Win / loss points | Counted |
| Tie | Tie points to both | Counted |
| No result / Abandoned | No-result points to both | **Excluded** |
| Walkover / Forfeit | Full points to the present team | **Excluded** |
| Super over decided | Win/loss points | Main-innings figures only |

### 7.5 Recalculation

Triggered by: match completion, result edit, ball edit on a completed match,
points-rule change, team withdrawal.

Withdrawal needs a stated policy: either all that team's matches are void and
removed from every opponent's record, or completed matches stand and the
remainder are forfeits. **Both are defensible; pick one and record it**, because
the two produce different champions.

---

## 8. Statistics

All derived from `BallByBall`, scoped to one tournament.

### 8.1 Batting

Runs, balls faced, 4s, 6s, dismissals, innings, not-outs, highest score,
fifties, hundreds.

- **Average** = runs ÷ dismissals. Undefined, not infinite, when never dismissed.
- **Strike rate** = runs ÷ balls faced × 100.
- **Balls faced excludes wides.** A wide is not a ball faced; a no-ball is.
- Runs off the bat exclude byes and leg byes — those go to Extras, not the batter.
- Fastest fifty/hundred = fewest balls to reach it, needing a running per-innings tally.

### 8.2 Bowling

Balls bowled, runs conceded, wickets, maidens, dot balls.

- **Legal balls only** advance the over; wides and no-balls do not.
- **Runs conceded** = runs off the bat + wides + no-balls. Byes and leg byes are
  **not** charged to the bowler.
- **Wickets credited to the bowler exclude** run out, retired, obstructing the
  field, handled the ball, and timed out.
- **Economy** = runs conceded ÷ overs bowled, overs from legal balls.
- **Maiden** = a completed over conceding zero *charged* runs.
- **Best bowling** sorts by wickets first, then fewest runs.

### 8.3 Fielding

Catches, run-outs, stumpings.

Each requires the fielder's **identity** on the dismissal. Storing a name string
means two players sharing a name share a tally, and a typo splits one fielder in
two. *(This is a live defect in the current app — see §12.)*

### 8.4 Qualification thresholds

Rate statistics need a floor or they are noise: a 200 strike rate off 3 balls
tops the table. Minimum innings for batting average and strike rate; minimum
overs for economy and bowling average. Configurable, and **shown in the UI** —
a leaderboard that silently excludes people looks broken.

---

## 9. Awards

| Award | Determination |
|---|---|
| Player of the Match | Per match. Manual, or computed impact score. |
| Player of the Tournament | Highest cumulative impact across the tournament. |
| Best Batter | Most runs; ties broken by average, then strike rate. |
| Best Bowler | Most wickets; ties by economy. |
| Best All-rounder | Combined score, needing minimums in **both** disciplines. |
| Best Fielder | Most dismissals (catches + run-outs + stumpings). |
| Emerging Player | Best impact among players under an age cutoff. |
| Fair Play | Fewest penalties/warnings across a team's matches. |

The impact score must be **stored with the award**, not just the winner. Someone
always asks why, and a score you cannot show is a score you cannot defend.

---

## 10. Notifications

| Trigger | Recipients |
|---|---|
| Tournament published | Followers, previous entrants |
| Registration approved / rejected | Team manager, captain |
| Fixtures released | All registered teams |
| Match reminder | Both squads, officials |
| Toss completed | Both squads, followers |
| Match started | Followers |
| Innings break | Followers |
| Match completed | Both squads, followers |
| Tournament completed | All participants |
| Awards announced | All participants |

Delivery is per-channel and per-user opt-in, with the send attempt recorded so a
failure is visible rather than silent.

---

## 11. Audit

Append-only. Every entry: who, when, entity, action, before, after, reason.

Auditable actions: tournament created/published/cancelled, rule changed, fixture
generated/edited/deleted, registration approved/rejected/withdrawn, player
transferred/replaced, match result entered or **changed**, points recomputed,
any manual override.

Result changes and manual overrides matter most — they are the ones that get
disputed, and the audit trail is the only answer.

---

## 12. How this maps to what already exists

The app has a working tournament module. This is the honest gap analysis.

### Already built and sound

| Concern | Where |
|---|---|
| Ball-by-ball scoring | `Ball`, `Over`, `Inning` — the hardest part, done |
| Fixture placeholders | `bracket.js` resolves `Winner Semi-Final M1`, `Group A Winner` |
| Config-driven points + tie-breaks | `standings.js` — one comparator, sport-agnostic |
| Registration approval | `TournamentTeam.status` + join-request endpoints |
| Phases | `TournamentPhase` |
| Awards | `TournamentAward`, keyed by kind |

### Missing entirely

`Venue`, `Ground`, `GroundAvailability`, `TournamentSettings`,
`TournamentRegistration`, `TournamentRule`, `TournamentPrize`,
`TournamentSponsor`, `TournamentSquad`, `MatchOfficials`, `MatchInterruption`,
`Registration`, `Payment`, `PlayerStatistics`, `TeamStatistics`, `AuditLog`,
`Media`.

### Four places the design contradicts the current schema

1. **Standings are denormalised onto `TournamentTeam`** (`points`, `played`,
   `won`, `lost`, `tied`, `nrr`). This design wants a separate, rebuildable
   `PointsTable`. Keeping both invites drift — the columns are writable and
   nothing forces them to agree with the matches.

2. **Venue is free text** on both `Tournament` and `TournamentMatch`. Automatic
   scheduling and double-booking prevention are impossible without `Ground` as an
   entity.

3. **`Player` has a `teamId`.** Per §1.3 this blocks multi-season, transfers and
   drafts — all named as future features. Squad membership needs to move to
   `TournamentSquad`.

4. **Fielding credits are stored as a name string** (`Ball.wicketAssists`), not a
   player id — the picker has the id and discards it. Catch and run-out tallies
   are therefore unreliable wherever two players share a name, which is already
   happening on live data. Storing the id fixes it going forward but does not
   repair existing rows.

### Suggested order

1. `TournamentSettings` + `TournamentRule` — unblocks everything rule-driven
   without touching existing behaviour.
2. `Venue` / `Ground` / `GroundAvailability` — prerequisite for real scheduling.
3. `TournamentSquad` — the schema change with the longest tail; earlier is cheaper.
4. `PointsTable` as derived + rebuild, retiring the denormalised columns.
5. `PlayerStatistics` / `TeamStatistics` projections.
6. `Registration` / `Payment`.
7. `AuditLog`.

Steps 3 and 4 are migrations with real data behind them and want their own
plan — including what happens to fielding stats accumulated under the name-match.
