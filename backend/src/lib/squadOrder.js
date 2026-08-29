// The order a squad is listed in, everywhere in the app.
//
//   1. Captain
//   2. Vice-captain
//   3. Wicket-keeper(s)
//   4. Batters
//   5. All-rounders
//   6. Bowlers
//
// It is one comparator because it is one rule. A squad appears on the team's
// Squad tab, in match setup, in the toss line-up, in the scorer's batsman and
// bowler pickers and on the scorecard's squad list — and a captain who is third
// in one list and seventh in the next is a list you have to re-read every time.
//
// NOT for batting cards. A scorecard's batting order is the order people
// actually batted, which is a record of what happened, not a way of arranging
// names. Sorting that by role would be a lie.
//
// `role` is free text typed by whoever added the player, and this database
// holds eight spellings of five roles — "Bat", "Batsman", "Bowl", "Bowler",
// "All Rounder", "allrounder", "Wicket Keeper", "Player". So it is matched by
// what it CONTAINS, in an order that resolves the overlaps: a "Wicket Keeper
// Batsman" is a keeper, and a "Batting All-rounder" is an all-rounder.
//
// Mirrored in frontend/src/utils/squadOrder.js — two npm projects, no shared
// package. scripts/check-shared-enums.mjs fails if the two drift apart.

export const ROLE_RANK = { keeper: 2, batter: 3, allrounder: 4, bowler: 5, unknown: 6 };

export function roleRank(role) {
  const r = String(role || '').toLowerCase();
  if (/keep|wicket-?k|\bwk\b/.test(r)) return ROLE_RANK.keeper;
  if (/all.?round/.test(r)) return ROLE_RANK.allrounder;
  if (/bat/.test(r)) return ROLE_RANK.batter;
  if (/bowl/.test(r)) return ROLE_RANK.bowler;
  return ROLE_RANK.unknown;
}

// Captain and vice-captain outrank every role — that is the point of naming
// them. `isWk` is the per-match keeper flag, which beats whatever the player's
// standing role says: they are keeping today.
export function squadRank(p) {
  if (!p) return ROLE_RANK.unknown;
  if (p.isCaptain) return 0;
  if (p.isViceCaptain) return 1;
  if (p.isWk) return ROLE_RANK.keeper;
  return roleRank(p.role);
}

// The canonical name for a role, or null when the string says nothing useful.
//
// Same matching as roleRank — one rule, so a player who SORTS as a keeper also
// READS as one. Cricket's four names are the sports registry's
// (src/sports/find.js), which is what Find Players and the squad manage sheet
// both offer; other sports keep whatever they were given, because this only
// knows how to name cricket roles.
export const CRICKET_ROLES = { keeper: 'Wicketkeeper', batter: 'Batter', allrounder: 'All-rounder', bowler: 'Bowler' };

export function canonicalRole(role, sport = 'cricket') {
  if (sport !== 'cricket') return null;
  const rank = roleRank(role);
  if (rank === ROLE_RANK.keeper) return CRICKET_ROLES.keeper;
  if (rank === ROLE_RANK.allrounder) return CRICKET_ROLES.allrounder;
  if (rank === ROLE_RANK.batter) return CRICKET_ROLES.batter;
  if (rank === ROLE_RANK.bowler) return CRICKET_ROLES.bowler;
  return null;   // "Player", blank, anything unrecognised — a human should say
}

/**
 * What to PRINT for a role, or null when the honest answer is nothing.
 *
 * One rule, because the same role is shown on a scorecard's squad list, a team's
 * members, the toss line-up, the scorer's pickers, match setup and a player's
 * profile — and they had drifted into six slightly different answers for the
 * same string.
 *
 *   · "Player" is dropped. It was the field's default when it was typed, so it
 *     sits under most of the database and describes nobody.
 *   · Cricket gets canonicalRole's four names, and nothing for a word it does
 *     not recognise — a reader is better served by a blank than by free text
 *     that may be a typo.
 *   · Other sports keep the word they were given: "Defender" is right for
 *     football, and this only knows how to name cricket's roles.
 *   · An UNKNOWN sport keeps the word too, and is never assumed to be cricket:
 *     the matching is by what a string contains, so a football "Goalkeeper"
 *     would otherwise come back "Wicketkeeper".
 */
export function roleLabel(role, sport) {
  const raw = String(role || '').trim();
  if (!raw || raw.toLowerCase() === 'player') return null;
  if (!sport) return raw;
  return canonicalRole(raw, sport) || (sport === 'cricket' ? null : raw);
}

/**
 * Comparator. Ties break on shirt number, then name, so the order is stable
 * rather than whatever the database happened to return.
 */
export function bySquadOrder(a, b) {
  const ra = squadRank(a), rb = squadRank(b);
  if (ra !== rb) return ra - rb;
  const ja = a?.jerseyNumber ?? 9999, jb = b?.jerseyNumber ?? 9999;
  if (ja !== jb) return ja - jb;
  return String(a?.name || '').localeCompare(String(b?.name || ''));
}

/** Non-mutating sort — callers usually hold props they must not reorder. */
export const sortSquad = (players) => [...(players || [])].sort(bySquadOrder);

export default sortSquad;
