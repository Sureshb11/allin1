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
const baseRunsPerWicket = (ov) =>
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

export function computeAwards(match) {
  const innings = match.innings || [];
  const overs = match.overs || Math.max(20, ...innings.map((i) => Math.ceil(i.totalOvers || 0)));
  const srPct = srBonusPct(overs);
  const brpw = baseRunsPerWicket(overs);
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
    const balls = overRows.flatMap((o) =>
      (o.balls || []).slice().sort((a, b) => a.ballNumber - b.ballNumber)
        .map((b) => ({ ...b, bowlerId: o.bowlerId, bowlerName: o.bowler?.name })));

    // Batting positions: first-seen order of striker then non-striker.
    const pos = {}; let next = 1;
    for (const b of balls) {
      if (b.batterId && !(b.batterId in pos)) pos[b.batterId] = next++;
      if (b.nonStrikerId && !(b.nonStrikerId in pos)) pos[b.nonStrikerId] = next++;
    }

    // Per-batter tallies + legal-ball count for team SR.
    const bat = {}; let legalBalls = 0;
    for (const b of balls) {
      const legal = b.extraType !== 'wide' && b.extraType !== 'noBall';
      if (legal) legalBalls++;
      const id = b.batterId;
      if (!bat[id]) bat[id] = { name: b.batter?.name, runs: 0, balls: 0 };
      if (legal) bat[id].balls++;
      if (!b.extraType || b.extraType === 'bye' || b.extraType === 'legBye') bat[id].runs += b.runs;
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

    // ── Bowling tallies (per over, for maidens) ──
    const bowl = {};
    for (const o of overRows) {
      const id = o.bowlerId; if (!id) continue;
      if (!bowl[id]) bowl[id] = { name: o.bowler?.name, balls: 0, conceded: 0, wkts: 0, maidens: 0 };
      let overCharged = 0, overLegal = 0;
      for (const b of o.balls || []) {
        const legal = b.extraType !== 'wide' && b.extraType !== 'noBall';
        if (legal) { bowl[id].balls++; overLegal++; }
        let charged = b.runs;
        if (b.extraType === 'wide' || b.extraType === 'noBall') charged += b.extras;
        bowl[id].conceded += charged; overCharged += charged;
        if (b.isWicket && BOWLER_WKT.has(norm(b.wicketType))) bowl[id].wkts++;
      }
      if (overLegal >= 6 && overCharged === 0) bowl[id].maidens++;
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
      // Economy bonus: rewards conceding fewer runs than the innings run-rate.
      // CricHeroes' literal (TeamSR/PlayerSR)·(TeamSR−PlayerSR) term is unbounded
      // (a tight wicketless spell can out-score a 5-for), so we keep the same
      // signal — economy gap vs team SR, scaled by the SR% table — but bound it
      // to overs bowled so wickets stay the dominant factor.
      let srBonus = 0;
      if (playerSR > 0 && teamBowlSR >= playerSR) {
        const gap = (teamBowlSR - playerSR) / teamBowlSR; // 0..1
        srBonus = srPct * (s.balls / 6) * gap;
      }
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

  const out = (p) => (p ? {
    // Squad players key on their Player id (off-squad fielders key on "name:…"),
    // so callers can resolve an award back to the account behind it.
    playerId: p.key && !String(p.key).startsWith('name:') ? p.key : null,
    name: p.name, teamName: p.teamName,
    total: +p.total.toFixed(2), bat: +p.bat.toFixed(2), bowl: +p.bowl.toFixed(2), field: +p.field.toFixed(2),
    batLine: p.batLine, bowlLine: p.bowlLine, fieldCount: p.fieldCount || 0,
  } : null);

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
