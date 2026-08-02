// MVP (Most Valuable Player) points — adapted from CricHeroes' published algorithm
// (https://blog.cricheroes.com/most-valuable-player-mvp-by-cricheroes/).
//
// Base: 10 runs = 1 MVP point. We follow CricHeroes' own documented UPDATEs:
//   • no Par Score bonus (they removed it to keep the calc simpler);
//   • no SR *penalty* — strike-rate only ever adds, never subtracts;
//   • assisted wickets (caught/stumped): bowler gets full points, fielder +20%;
//   • run-out: fielder gets the full wicket value.
//
// Awards derived on top of the per-player MVP totals:
//   Man of the Match  — top MVP in the winning team (else overall leader);
//   Fighter of the Match — best losing-team player in the top 3 (skipped if he
//                          already won MotM, or if the match had no result);
//   Best Batter / Bowler / Fielder — highest batting / bowling / fielding score.

// ── Match-type lookup tables (keyed by the match's overs-per-side) ───────────
// CricHeroes' table, including its Test row — which is 25, NOT the 27 that the
// 51-99 over band gives. Keyed on overs everywhere else, so a Test has to say so
// by name; `isTest` comes from the match's own type.
const baseRunsPerWicket = (ov, isTest) =>
  isTest ? 25 :
  ov <= 7 ? 12 : ov <= 12 ? 14 : ov <= 16 ? 16 : ov <= 20 ? 18 :
  ov <= 26 ? 20 : ov <= 40 ? 22 : ov <= 50 ? 25 : 27;

const maidensPerWicket = (ov) =>
  ov <= 7 ? 1 : ov <= 26 ? 2 : ov <= 50 ? 3 : 6;

const srBonusPct = (ov) =>
  ov <= 20 ? 0.08 : ov <= 35 ? 0.06 : ov <= 50 ? 0.04 : 0.02;

// Batting-order strength: top 4 = 100%, middle order = 80%, tail = 60%.
const posFactor = (pos) => (pos <= 4 ? 1 : pos <= 8 ? 0.8 : 0.6);

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
const BOWLER_WKT = new Set(['bowled', 'caught', 'lbw', 'stumped', 'hitwicket', 'mankaded']);
const ASSIST_WKT = new Set(['caught', 'stumped']);

// ── Ball accounting. These three MUST agree with the scorecard the players are
// looking at (frontend ScorecardScreen: computeBatting / computeBowling) — MVP
// points that disagree with the printed figures read as a bug in the points, and
// the two used to disagree in four places.

// Not one of the over's six. 'deadBall' is a wicket taken without a delivery (the
// non-striker run out backing up, Law 38.3).
const NON_BALL_EXTRAS = ['wide', 'noBall', 'penalty', 'retired', 'deadBall'];
const countsAsBall = (b) => !NON_BALL_EXTRAS.includes(b.extraType);

// A ball FACED by the striker. A no ball is faced (it can be hit, and the striker
// can be run out off it); a wide is not, and neither is anything that wasn't bowled.
const FACED_EXCLUDES = ['wide', 'penalty', 'retired', 'deadBall'];
const ballFaced = (b) => !FACED_EXCLUDES.includes(b.extraType);

// Runs off the bat — the striker's own. Byes and leg byes are the team's; runs off
// a no ball ARE the striker's and were being thrown away here.
const batRunsOf = (b) => (!b.extraType || b.extraType === 'noBall' ? b.runs : 0);

// Runs charged to the bowler: the wide/no-ball penalties and everything run off
// them, plus runs off the bat. Byes and leg byes are not the bowler's fault.
const chargedRuns = (b) =>
  b.extraType === 'wide' ? b.extras
  : b.extraType === 'noBall' ? b.runs + b.extras
  : (b.extraType ? 0 : b.runs);

// ── The bowler's economy bonus ───────────────────────────────────────────────
// CricHeroes publish this as:
//
//     ((Team SR) / (Player SR)) * (Team SR) — (Player SR) * SR Bonus Percentage
//
// and then immediately amend it:
//
//     "UPDATE: We have stopped penalising bowlers for now. So if
//      (Team SR) — (Player SR) >= 0 we consider it as 1 else it's 0 in the
//      formula."
//
// That amendment is the whole thing. (TeamSR − PlayerSR) is a GATE — 1 or 0 —
// not a magnitude. The surviving formula is:
//
//     (TeamSR / PlayerSR) × SR%,  when TeamSR >= PlayerSR;  otherwise 0
//
// It is the same shape as the batting bonus above, which already reads the
// amendment correctly (`sign = playerSR >= teamSR ? 1 : 0`). Bowling did not:
// it multiplied by the raw gap, which is the pre-update penalising form.
//
// What that cost: in an 8-over match Kuldeep Yadav bowled ONE over for 11 and
// took nothing. TeamSR 258.3, his 183.3 — a gap of 75 — so the term paid
// 1.409 × 75 × 0.08 = 8.45 points and he finished first on MVP, ahead of a
// bowler who took 3/18. Read as published it pays 1.409 × 0.08 = 0.11.
//
// No scaling factor of our own. Their own worked example puts this term at
// −3.2 against a bowling total of 1.062, so it is already in points.
//
// A spell of nothing but maidens has PlayerSR 0 and no ratio; CricHeroes say so
// explicitly and pay for it through the maiden bonus instead, so it returns 0
// here. `ratioCap` is ours and guards data, not scoring: it only bites on a
// spell more economical than any real one.
export const ECONOMY = { ratioCap: 20 };

export function economyBonus({ teamSR, playerSR, srPct, ballsBowled }) {
  if (!ballsBowled) return 0;
  if (teamSR - playerSR < 0) return 0;   // went at more than the innings rate
  if (playerSR <= 0) return 0;           // all maidens — the maiden bonus pays
  return Math.min(teamSR / playerSR, ECONOMY.ratioCap) * srPct;
}

export function computeAwards(match) {
  const innings = match.innings || [];
  // Every points table below is keyed by the match's overs-per-side, so this must
  // be a real number: an innings row with no totalOvers made Math.max return NaN,
  // and every `ov <= n` lookup then fell through to the Test-match column.
  const fromInnings = innings.map((i) => Math.ceil(i.totalOvers || 0)).filter(Number.isFinite);
  const overs = Number(match.overs) || Math.max(20, ...fromInnings, 0);
  const srPct = srBonusPct(overs);
  // The Test row of every table differs from the longest overs band, so the
  // match has to declare itself rather than be inferred from an innings length.
  const isTest = /test/i.test(String(match.matchType || ''));
  const brpw = baseRunsPerWicket(overs, isTest);
  const mpw = maidensPerWicket(overs);

  // Player registry, keyed by player id (falls back to name for off-squad fielders).
  const players = {};
  const reg = (id, name, teamId, teamName) => {
    const key = id || (name ? `name:${norm(name)}` : null);
    if (!key) return null;
    if (!players[key]) {
      players[key] = { key, name: name || 'Unknown', teamId, teamName,
        bat: 0, bowl: 0, field: 0, batLine: null, bowlLine: null, fieldCount: 0 };
    }
    const p = players[key];
    if (name && p.name === 'Unknown') p.name = name;
    if (teamId && !p.teamId) { p.teamId = teamId; p.teamName = teamName; }
    return p;
  };

  // Fielder names (stored on the ball) → squad player id, so credit aggregates
  // with that player's batting/bowling.
  const nameToId = {};
  for (const mp of match.squads || []) {
    if (mp.player?.name) nameToId[norm(mp.player.name)] = mp.playerId;
  }
  const fielderRef = (nameOrId, teamId, teamName) => {
    if (!nameOrId) return null;
    const id = nameToId[norm(nameOrId)] || null;
    return reg(id, id ? undefined : nameOrId, teamId, teamName) ||
           reg(null, nameOrId, teamId, teamName);
  };

  for (const inning of innings) {
    const battingTeamId = inning.battingTeamId, battingTeamName = inning.battingTeam?.name;
    const bowlingTeamId = inning.bowlingTeamId, bowlingTeamName = inning.bowlingTeam?.name;

    const overRows = (inning.oversData || []).slice().sort((a, b) => a.overNumber - b.overNumber);
    // Per-DELIVERY bowler — a shared over is simply balls carrying different
    // bowlerIds — falling back to the over's bowler for rows recorded before
    // per-ball bowlers existed. This used to OVERWRITE the ball's own bowlerId
    // with the over's, which handed every wicket and every run in a shared over
    // to whoever happened to start the over.
    const balls = overRows.flatMap((o) =>
      (o.balls || []).slice().sort((a, b) => a.ballNumber - b.ballNumber)
        .map((b) => ({ ...b, bowlerId: b.bowlerId || o.bowlerId, bowlerName: b.bowler?.name || o.bowler?.name })));

    // Batting positions: first-seen order of striker then non-striker.
    const pos = {}; let next = 1;
    for (const b of balls) {
      if (b.batterId && !(b.batterId in pos)) pos[b.batterId] = next++;
      if (b.nonStrikerId && !(b.nonStrikerId in pos)) pos[b.nonStrikerId] = next++;
    }

    // Per-batter tallies + the innings' legal-ball count for team SR.
    const bat = {}; let legalBalls = 0;
    for (const b of balls) {
      if (countsAsBall(b)) legalBalls++;
      const id = b.batterId;
      if (!id) continue;
      if (!bat[id]) bat[id] = { name: b.batter?.name, runs: 0, balls: 0 };
      if (ballFaced(b)) bat[id].balls++;
      bat[id].runs += batRunsOf(b);
    }
    const teamSR = legalBalls > 0 ? (inning.totalRuns / legalBalls) * 100 : 0;

    // ── Batting MVP ──
    for (const [id, s] of Object.entries(bat)) {
      const p = reg(id, s.name, battingTeamId, battingTeamName);
      if (!p) continue;
      const basic = s.runs / 10;
      const playerSR = s.balls > 0 ? (s.runs / s.balls) * 100 : 0;
      const sign = playerSR >= teamSR ? 1 : 0; // bonus only when at/above team SR
      const srBonus = teamSR > 0 ? (playerSR / teamSR) * sign * srPct * basic : 0;
      p.bat += basic + srBonus;
      p.batLine = `${s.runs} (${s.balls})`;
    }

    // ── Bowling tallies (per delivery, grouped by over so maidens can be seen) ──
    const bowl = {};
    const bowlerRow = (id, name) => {
      if (!bowl[id]) bowl[id] = { name, balls: 0, conceded: 0, wkts: 0, maidens: 0 };
      else if (name && !bowl[id].name) bowl[id].name = name;
      return bowl[id];
    };
    for (const o of overRows) {
      let overCharged = 0, overLegal = 0;
      const overBowlers = new Set();
      for (const b of (o.balls || [])) {
        const id = b.bowlerId || o.bowlerId; if (!id) continue;
        const s = bowlerRow(id, b.bowler?.name || o.bowler?.name);
        overBowlers.add(id);
        const charged = chargedRuns(b);
        s.conceded += charged; overCharged += charged;
        if (countsAsBall(b)) { s.balls++; overLegal++; }
        if (b.isWicket && BOWLER_WKT.has(norm(b.wicketType))) s.wkts++;
      }
      // A maiden is a whole over by ONE bowler for no runs — a shared over is a
      // maiden for neither of them.
      if (overLegal >= 6 && overCharged === 0 && overBowlers.size === 1) bowlerRow([...overBowlers][0]).maidens++;
    }

    // ── Per-wicket value → bowler wicket base + fielder credit ──
    const wktBase = {};
    for (const b of balls) {
      if (!b.isWicket) continue;
      const wt = norm(b.wicketType);
      const dpos = pos[b.dismissedPlayerId] || 6;
      const val = (brpw * posFactor(dpos)) / 10;
      if (BOWLER_WKT.has(wt)) {
        wktBase[b.bowlerId] = (wktBase[b.bowlerId] || 0) + val;
        if (ASSIST_WKT.has(wt) && b.wicketAssists) {
          const fp = fielderRef(b.wicketAssists, bowlingTeamId, bowlingTeamName);
          if (fp) { fp.field += 0.2 * val; fp.fieldCount++; }
        }
      } else if (wt === 'runout' && b.wicketAssists) {
        const fp = fielderRef(b.wicketAssists, bowlingTeamId, bowlingTeamName);
        if (fp) { fp.field += val; fp.fieldCount++; }
      }
    }

    // ── Bowling MVP ──
    const teamBowlSR = teamSR; // runs the bowling side conceded per ball = innings SR
    for (const [id, s] of Object.entries(bowl)) {
      const p = reg(id, s.name, bowlingTeamId, bowlingTeamName);
      if (!p) continue;
      const wicketBase = wktBase[id] || 0;
      const milestone = s.wkts >= 10 ? 1.5 : s.wkts >= 5 ? 1.0 : s.wkts >= 3 ? 0.5 : 0;
      const playerSR = s.balls > 0 ? (s.conceded / s.balls) * 100 : 0;
      const srBonus = economyBonus({ teamSR: teamBowlSR, playerSR, srPct, ballsBowled: s.balls });
      const maidenBonus = s.maidens * ((brpw / 10) / mpw);
      p.bowl += wicketBase + milestone + srBonus + maidenBonus;
      p.bowlLine = `${s.wkts}/${s.conceded}`;
    }
  }

  // Seed EVERY squad player (both XIs, incl. 12th man / subs) so the MVP order
  // lists all of them — even those with 0 contribution (didn't bat/bowl/field).
  const teamNameFor = (tid) =>
    tid === match.team1?.id ? match.team1?.name :
    tid === match.team2?.id ? match.team2?.name : undefined;
  for (const mp of match.squads || []) {
    reg(mp.playerId, mp.player?.name, mp.teamId, teamNameFor(mp.teamId));
  }

  // ── Totals, ranking, winner ──
  const list = Object.values(players)
    .map((p) => ({ ...p, total: p.bat + p.bowl + p.field }))
    .sort((a, b) => b.total - a.total);
  const top3 = list.slice(0, 3);

  // Winner: prefer the result string (robust for chases/concedes), where the
  // winning team is named first ("X won by …" / "X won — Y conceded"). Fall back
  // to run totals only if the string is unusable.
  let winnerTeamId = null;
  const r = String(match.result || '').toLowerCase();
  const t1 = match.team1, t2 = match.team2;
  const isNoResult = /\b(tie|tied|draw|drawn|no result|abandon)/.test(r);
  if (r && !isNoResult && t1 && t2) {
    const i1 = r.indexOf(String(t1.name || '').toLowerCase());
    const i2 = r.indexOf(String(t2.name || '').toLowerCase());
    if (i1 >= 0 && (i2 < 0 || i1 < i2)) winnerTeamId = t1.id;
    else if (i2 >= 0) winnerTeamId = t2.id;
  }
  if (!winnerTeamId && !isNoResult) {
    const totals = {};
    for (const inn of innings) totals[inn.battingTeamId] = (totals[inn.battingTeamId] || 0) + inn.totalRuns;
    const tIds = Object.keys(totals);
    if (tIds.length === 2 && totals[tIds[0]] !== totals[tIds[1]]) {
      winnerTeamId = totals[tIds[0]] > totals[tIds[1]] ? tIds[0] : tIds[1];
    }
  }

  const out = (p) => {
    if (!p) return null;
    // The total is the sum of the ROUNDED parts, not the rounded sum. The apps show
    // the points broken down — batting + bowling + fielding = total — and rounding
    // each part independently can leave that arithmetic a hundredth out on screen.
    const bat = +p.bat.toFixed(2), bowl = +p.bowl.toFixed(2), field = +p.field.toFixed(2);
    return {
      // Squad players key on their Player id (off-squad fielders key on "name:…"),
      // so callers can resolve an award back to the account behind it.
      playerId: p.key && !String(p.key).startsWith('name:') ? p.key : null,
      // Which side they were on — the awards ledger stores it, so a career
      // honour can say who you won it for.
      teamId: p.teamId || null,
      name: p.name, teamName: p.teamName,
      total: +(bat + bowl + field).toFixed(2), bat, bowl, field,
      batLine: p.batLine, bowlLine: p.bowlLine, fieldCount: p.fieldCount || 0,
    };
  };

  // Nobody scored anything: no innings, no balls — a non-cricket match (this is
  // a cricket algorithm), or a result typed straight in by an organiser. An MVP
  // calculation with nothing to weigh has no winner. Without this the fallback
  // below ("else the overall leader") handed Man of the Match to whoever sorted
  // first on zero points, and notifyMatchResult pushed them a trophy for it.
  if (!list.some((p) => p.total > 0)) {
    return {
      manOfMatch: null, fighter: null, bestBatter: null, bestBowler: null, bestFielder: null,
      mvp: list.map(out), winnerTeamId,
    };
  }

  // Man of the Match: top-3 winning-team player, else overall leader.
  let motm = null;
  if (winnerTeamId) motm = top3.find((p) => p.teamId === winnerTeamId) || null;
  if (!motm) motm = list[0] || null;

  // Fighter: best losing-team player in top 3 (not the MotM); skip if no result.
  let fighter = null;
  if (winnerTeamId) fighter = top3.find((p) => p.teamId !== winnerTeamId && p !== motm) || null;

  const bestBat = list.filter((p) => p.bat > 0).sort((a, b) => b.bat - a.bat)[0] || null;
  const bestBowl = list.filter((p) => p.bowl > 0).sort((a, b) => b.bowl - a.bowl)[0] || null;
  const bestField = list.filter((p) => p.field > 0).sort((a, b) => b.field - a.field)[0] || null;

  return {
    manOfMatch: out(motm),
    fighter: out(fighter),
    bestBatter: out(bestBat),
    bestBowler: out(bestBowl),
    bestFielder: out(bestField),
    mvp: list.map(out),   // full ranked order — every squad player
    winnerTeamId,
  };
}
