// bracket.js — resolves auto-schedule placeholder slots into real teams.
//
// Auto-scheduled fixtures reference not-yet-known opponents by a free-text
// `placeholder1/2` label produced by the generator, e.g.:
//   "Winner Semi-Final M1", "Loser Qualifier 1", "Winner Eliminator",
//   "Group A Winner" / "Group A Runner-up", "1st Group A" / "2nd Group A".
//
// resolveBracket() derives, from every completed match + finished group, a
// label → teamId map using the SAME templates the generator uses, then fills
// team1Id/team2Id on any still-placeholder fixture whose label is now known.
// It is idempotent and safe to call after every recorded result.

import { prisma } from './prisma.js';
import { computeStandings } from './standings.js';

const groupOf = (round) =>
  round && round.startsWith('Group ') ? round.slice('Group '.length).trim() : null;

export async function resolveBracket(tournamentId) {
  const all = await prisma.tournamentMatch.findMany({
    where: { tournamentId },
    orderBy: { scheduledAt: 'asc' },
  });

  const label2team = {}; // resolved label → teamId

  // 1) Group-stage outcomes → "Group X Winner/Runner-up" + "1st/2nd Group X".
  //    Only once every match in that group is completed (final standings known).
  const byGroup = {};
  for (const m of all) {
    const g = groupOf(m.round);
    if (g) (byGroup[g] ||= []).push(m);
  }
  const groupNames = Object.keys(byGroup);
  if (groupNames.length) {
    // computeStandings ranks all teams (with tiebreakers); filtering by group
    // preserves that order, giving per-group placings.
    const standings = await computeStandings(tournamentId);
    for (const g of groupNames) {
      const ms = byGroup[g];
      if (!ms.length || !ms.every((m) => m.status === 'completed')) continue;
      const rows = standings.filter((r) => r.group === g);
      if (rows[0]) {
        label2team[`Group ${g} Winner`] = rows[0].teamId;
        label2team[`1st Group ${g}`] = rows[0].teamId;
      }
      if (rows[1]) {
        label2team[`Group ${g} Runner-up`] = rows[1].teamId;
        label2team[`2nd Group ${g}`] = rows[1].teamId;
      }
    }
  }

  // 2) Knockout / qualifier outcomes → "Winner/Loser <round> M<k>" (and the
  //    index-less "Winner/Loser <round>" form when a round has a single match).
  const roundGroups = {};
  for (const m of all) {
    if (groupOf(m.round)) continue;
    (roundGroups[m.round] ||= []).push(m);
  }
  for (const [round, ms] of Object.entries(roundGroups)) {
    ms.forEach((m, idx) => {
      if (m.status !== 'completed' || !m.winnerTeamId) return;
      const loserId = m.winnerTeamId === m.team1Id ? m.team2Id : m.team1Id;
      const k = idx + 1;
      label2team[`Winner ${round} M${k}`] = m.winnerTeamId;
      if (loserId) label2team[`Loser ${round} M${k}`] = loserId;
      if (ms.length === 1) {
        label2team[`Winner ${round}`] = m.winnerTeamId;
        if (loserId) label2team[`Loser ${round}`] = loserId;
      }
    });
  }

  // 3) Fill any still-placeholder scheduled fixture whose label is now known.
  const updates = [];
  for (const m of all) {
    if (m.status !== 'scheduled') continue;
    const t1 = !m.team1Id && m.placeholder1 ? label2team[m.placeholder1] : undefined;
    const t2 = !m.team2Id && m.placeholder2 ? label2team[m.placeholder2] : undefined;
    const data = {};
    if (t1) data.team1Id = t1;
    if (t2) data.team2Id = t2;
    if (Object.keys(data).length) {
      updates.push(prisma.tournamentMatch.update({ where: { id: m.id }, data }));
    }
  }
  if (updates.length) await Promise.all(updates);
  return { resolved: updates.length, labels: label2team };
}
