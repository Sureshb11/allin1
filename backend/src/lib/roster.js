// roster.js — Module 2 squad-selection + substitution enforcer.
//
// One code path for all 19 sports; the RULE differs only by the sport's
// SportConfiguration.rules.roster:
//   { squadMax, playingSize, subs: { model: 'fixed'|'limited'|'rolling', max } }
//
//   fixed   → no subs (cricket XI: rigid; individual sports: none)
//   limited → up to `max` subs (football 3–5, volleyball 6)
//   rolling → unlimited subs from the squad (basketball, hockey, handball)

import { prisma } from './prisma.js';

const DEFAULT_ROSTER = { squadMax: 15, playingSize: 11, subs: { model: 'limited', max: 5 } };

async function rosterRules(sport) {
  const cfg = await prisma.sportConfiguration.findUnique({ where: { id: sport } });
  return cfg?.rules?.roster || DEFAULT_ROSTER;
}

// Validate a playing squad at toss/lineup. Cricket-style rigid sizes require an
// exact count; everything else is capped at squadMax.
export async function validateSquad(sport, playerIds) {
  const R = await rosterRules(sport);
  const n = playerIds.length;
  if (R.subs?.model === 'fixed' && R.playingSize && n !== R.playingSize) {
    return { ok: false, error: `${sport} needs exactly ${R.playingSize} players (got ${n}).` };
  }
  if (R.squadMax && n > R.squadMax) {
    return { ok: false, error: `Squad exceeds the ${R.squadMax}-player limit (got ${n}).` };
  }
  return { ok: true, rules: R };
}

// Enforce and record a substitution. Returns {ok, error?, used, remaining}.
export async function applySubstitution({ sport, matchId, teamId, playerOutId, playerInId, period }) {
  const R = await rosterRules(sport);
  const model = R.subs?.model || 'limited';

  if (model === 'fixed') {
    return { ok: false, error: `Substitutions are not allowed in ${sport}.` };
  }

  const used = await prisma.matchSubstitution.count({ where: { matchId, teamId } });
  if (model === 'limited' && R.subs?.max != null && used >= R.subs.max) {
    return { ok: false, error: `Substitution limit reached (${R.subs.max}).`, used, remaining: 0 };
  }

  const sub = await prisma.matchSubstitution.create({
    data: { matchId, teamId, playerOutId, playerInId, period },
  });
  const nowUsed = used + 1;
  const remaining = model === 'rolling' ? null : Math.max(0, (R.subs.max ?? 0) - nowUsed);
  return { ok: true, sub, used: nowUsed, remaining, model };
}
