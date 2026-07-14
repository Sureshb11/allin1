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

// Build the sorted table for a tournament. Pure aggregation → no side effects
// unless you call persistStandings().
export async function computeStandings(tournamentId) {
  const tourney = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tourney) throw new Error('Tournament not found');

  const cfg = await prisma.sportConfiguration.findUnique({ where: { id: tourney.sport } });
  const S = cfg?.rules?.standings || { win: 3, draw: 1, loss: 0, tiebreakers: ['points', 'headToHead'] };

  const entries = await prisma.tournamentTeam.findMany({
    where: { tournamentId, status: 'approved' }, include: { team: true },
  });
  const rows = {};
  for (const e of entries) {
    rows[e.teamId] = {
      teamId: e.teamId, team: e.team, group: e.group,
      played: 0, won: 0, lost: 0, tied: 0, points: 0,
      scored: 0, conceded: 0, oversFaced: 0, oversBowled: 0, best: 0,
    };
  }

  const matches = await prisma.tournamentMatch.findMany({
    where: { tournamentId, status: 'completed' },
  });
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
