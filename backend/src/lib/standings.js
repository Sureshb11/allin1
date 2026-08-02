// standings.js — Module 2 points/standings engine.
//
// Generic across all 19 sports: it reads the tournament sport's
// SportConfiguration.rules.standings (win/draw/loss/tie points + an ordered
// `tiebreakers` list) and aggregates every completed TournamentMatch's
// `resultStats` ({ [teamId]: {scored, conceded, oversFaced?, oversBowled?} })
// into a table, then sorts by a single comparator that walks the tiebreakers.
//
// The SAME comparator does Net Run Rate for cricket and Goal Difference for
// football — it just reads a different tiebreakers array from config.

import { prisma } from './prisma.js';

const STAT = {
  // tiebreaker key → value from an aggregated row
  points:          (r) => r.points,
  wins:            (r) => r.won,
  goalDifference:  (r) => r.scored - r.conceded,
  pointDifference: (r) => r.scored - r.conceded,
  setDifference:   (r) => r.scored - r.conceded,
  goalsFor:        (r) => r.scored,
  pointsFor:       (r) => r.scored,
  bestScore:       (r) => r.best,
  nrr:             (r) => {
    const rf = r.oversFaced  > 0 ? r.scored   / r.oversFaced  : 0;
    const ra = r.oversBowled > 0 ? r.conceded / r.oversBowled : 0;
    return +(rf - ra).toFixed(3);
  },
};

// Load the pieces a table is built from, once, so the whole-tournament table
// and the per-stage tables don't each go back to the database for them.
async function loadTable(tournamentId) {
  const tourney = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tourney) throw new Error('Tournament not found');

  const cfg = await prisma.sportConfiguration.findUnique({ where: { id: tourney.sport } });
  const sportRules = cfg?.rules?.standings || { win: 3, draw: 1, loss: 0, tiebreakers: ['points', 'headToHead'] };
  // A tournament's own points system wins over the sport default. The create
  // wizard asks for it — points per outcome, a bonus point, the tie-break order
  // — and the engine was reading straight past it to the sport-wide config, so
  // an organiser who set 3 points a win still got a table computed on 2.
  //
  // The wizard names two tie-breaks differently from the engine, and offers one
  // (boundary count) that nothing records; unknown keys are dropped rather than
  // silently skipping a comparison the organiser thinks is running.
  const TIEBREAK_ALIASES = { h2h: 'headToHead', headToHead: 'headToHead', points: 'points', nrr: 'nrr', wins: 'wins' };
  const own = tourney.pointsRules || {};
  const ownTiebreaks = (own.tieBreak || []).map((k) => TIEBREAK_ALIASES[k]).filter(Boolean);
  const S = {
    ...sportRules,
    ...(own.win      != null && { win: own.win }),
    ...(own.tie      != null && { tie: own.tie, draw: own.tie }),
    ...(own.loss     != null && { loss: own.loss }),
    ...(own.noResult != null && { noResult: own.noResult }),
    ...(ownTiebreaks.length && { tiebreakers: ownTiebreaks }),
  };

  const [entries, matches] = await Promise.all([
    prisma.tournamentTeam.findMany({
      where: { tournamentId, status: 'approved' }, include: { team: true },
    }),
    prisma.tournamentMatch.findMany({
      where: { tournamentId, status: 'completed' },
      include: { phase: { select: { id: true, name: true, type: true, order: true } } },
    }),
  ]);
  return { S, entries, matches };
}

// Aggregate a given set of fixtures over a given set of teams. Pure.
function tabulate(entries, matches, S) {
  const rows = {};
  for (const e of entries) {
    rows[e.teamId] = {
      teamId: e.teamId, team: e.team, group: e.group,
      played: 0, won: 0, lost: 0, tied: 0, points: 0,
      scored: 0, conceded: 0, oversFaced: 0, oversBowled: 0, best: 0,
    };
  }

  const h2h = {};   // "a|b" → { [teamId]: wins } for head-to-head tiebreak

  for (const m of matches) {
    const rs = m.resultStats || {};
    for (const [teamId, s] of Object.entries(rs)) {
      const r = rows[teamId];
      if (!r) continue;
      r.scored      += s.scored      || 0;
      r.conceded    += s.conceded    || 0;
      r.oversFaced  += s.oversFaced  || 0;
      r.oversBowled += s.oversBowled || 0;
      r.best         = Math.max(r.best, s.scored || 0);
    }
    const a = rows[m.team1Id], b = rows[m.team2Id];
    if (a) a.played++; if (b) b.played++;
    if (m.resultKind === 'tie' || m.resultKind === 'draw') {
      if (a) { a.tied++; a.points += (S.tie ?? S.draw ?? 0); }
      if (b) { b.tied++; b.points += (S.tie ?? S.draw ?? 0); }
    } else if (m.resultKind === 'noResult') {
      if (a) a.points += (S.noResult ?? 0);
      if (b) b.points += (S.noResult ?? 0);
    } else if (m.winnerTeamId) {
      const w = rows[m.winnerTeamId];
      const loserId = m.winnerTeamId === m.team1Id ? m.team2Id : m.team1Id;
      const l = rows[loserId];
      if (w) { w.won++;  w.points += (S.win ?? 3); }
      if (l) { l.lost++; l.points += (S.loss ?? 0); }
      const key = [m.team1Id, m.team2Id].sort().join('|');
      h2h[key] = h2h[key] || {};
      h2h[key][m.winnerTeamId] = (h2h[key][m.winnerTeamId] || 0) + 1;
    }
  }

  // sort by the sport's ordered tiebreakers; head-to-head handled specially
  const list = Object.values(rows);
  list.sort((x, y) => {
    for (const key of S.tiebreakers) {
      if (key === 'headToHead') {
        const k = [x.teamId, y.teamId].sort().join('|');
        const rec = h2h[k];
        if (rec) {
          const d = (rec[y.teamId] || 0) - (rec[x.teamId] || 0);
          if (d) return d;
        }
        continue;
      }
      const f = STAT[key];
      if (!f) continue;
      const d = f(y) - f(x);
      if (d) return d;
    }
    return 0;
  });

  // attach the derived tiebreak stats each row exposes (for the UI)
  return list.map((r, i) => ({
    rank: i + 1, teamId: r.teamId, team: r.team, group: r.group,
    played: r.played, won: r.won, lost: r.lost, tied: r.tied, points: r.points,
    stats: {
      nrr: STAT.nrr(r),
      goalDifference: r.scored - r.conceded,
      goalsFor: r.scored, against: r.conceded, best: r.best,
    },
  }));
}

// The whole tournament as one table.
export async function computeStandings(tournamentId) {
  const { S, entries, matches } = await loadTable(tournamentId);
  return tabulate(entries, matches, S);
}

// One table per stage, which is what a multi-stage tournament actually has.
//
// The flat table above sums EVERY completed fixture into one row per team and
// carries the team's first-round group letter alongside it. For a single-group
// league that is the table. For the 2024 T20 World Cup it produced a "Group A"
// containing India with 9 played and 16 points — a table including their Super
// 8 and knockout matches against teams from Groups B, C and D.
//
// A stage is the set of fixtures sharing a `round`: "Group A", "Super 8 Group
// 1". That needs no schema change — the round is already on every fixture, and
// it is the only thing that knows a team can be in Group A in June and Super 8
// Group 1 a fortnight later, which one column on TournamentTeam cannot express.
//
// Knockout stages are excluded: a bracket is not a table.
export async function computeStageStandings(tournamentId) {
  const { S, entries, matches } = await loadTable(tournamentId);
  const byId = Object.fromEntries(entries.map((e) => [e.teamId, e]));

  const stages = [];
  const seen = new Map();
  for (const m of matches) {
    if (m.phase?.type === 'knockout') continue;
    const key = m.round || m.phase?.name || 'Fixtures';
    if (!seen.has(key)) {
      seen.set(key, { key, name: key, order: m.phase?.order ?? 0, matches: [], teamIds: new Set() });
      stages.push(seen.get(key));
    }
    const st = seen.get(key);
    st.matches.push(m);
    if (m.team1Id) st.teamIds.add(m.team1Id);
    if (m.team2Id) st.teamIds.add(m.team2Id);
  }

  stages.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  // How many teams got out of each stage — counted, not assumed. The app was
  // highlighting a hardcoded top 2 as qualifying, which is right for a World Cup
  // group and wrong for a four-team group where one goes through, or an
  // IPL-style top four. Every team that appears in a LATER stage or in a
  // knockout fixture came out of this one, and that is a fact already in the
  // fixture list.
  const laterTeamIds = [];   // index i = teams appearing anywhere after stage i
  const knockoutTeams = new Set(
    matches.filter((m) => m.phase?.type === 'knockout')
      .flatMap((m) => [m.team1Id, m.team2Id]).filter(Boolean));
  for (let i = 0; i < stages.length; i++) {
    const after = new Set(knockoutTeams);
    for (let j = i + 1; j < stages.length; j++) for (const id of stages[j].teamIds) after.add(id);
    laterTeamIds.push(after);
  }

  return stages.map((st, i) => {
    const advanced = [...st.teamIds].filter((id) => laterTeamIds[i].has(id)).length;
    return {
      key: st.key,
      name: st.name,
      // null while nothing after this stage has been drawn yet — the app then
      // highlights nothing rather than guessing.
      advancing: advanced > 0 && advanced < st.teamIds.size ? advanced : null,
      rows: tabulate([...st.teamIds].map((id) => byId[id]).filter(Boolean), st.matches, S),
    };
  });
}

// Persist the aggregated tallies back onto TournamentTeam (points/played/…/nrr
// + generic stats) so the existing points-table endpoint stays correct too.
export async function persistStandings(tournamentId) {
  const table = await computeStandings(tournamentId);
  await Promise.all(table.map((r) =>
    prisma.tournamentTeam.update({
      where: { tournamentId_teamId: { tournamentId, teamId: r.teamId } },
      data: {
        points: r.points, played: r.played, won: r.won, lost: r.lost, tied: r.tied,
        nrr: r.stats.nrr, stats: r.stats,
      },
    })
  ));
  return table;
}
