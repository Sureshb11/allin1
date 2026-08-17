// Comparing a club player against a licensed benchmark.
//
// Two rules govern this whole file.
//
// FIRST: nothing here fetches anybody's statistics. There is no scraper and no
// provider client. Rows arrive in ExternalPlayerShotStat from a source somebody
// has the right to use, and this file only ever reads them. If you are here to
// add an importer, add it as a source row and a mapping onto our own shot
// vocabulary (lib/ballIntelligence.js) so the comparison is like for like.
//
// SECOND: a benchmark is enrichment. A player's profile has to render for the
// overwhelming majority of players who will never be matched to one, and it has
// to render if these tables do not exist yet. Every read below is guarded and
// returns null rather than throwing — the same reasoning that keeps shot capture
// out of the delivery write path.

import { shotLabel, zoneLabel } from './ballIntelligence.js';
import { MIN_BALLS_FOR_CLAIM, confidenceFor } from './shotAnalytics.js';

/**
 * A benchmark row needs a real sample too.
 *
 * Higher than our own bar on purpose: the point of a benchmark is that it is
 * steadier than the thing being measured against it, and "this professional
 * played eleven cover drives" is not a standard.
 */
const MIN_BENCHMARK_BALLS = 50;

const pct = (mine, theirs) => {
  if (!theirs) return null;
  return Math.round(((mine - theirs) / theirs) * 1000) / 10;   // one decimal
};

/**
 * Line up this player's shot splits against a benchmark's.
 *
 * `mine`      — rows from aggregateShots (byShot / byZone), each { key, strikeRate, balls }
 * `benchmark` — ExternalPlayerShotStat rows, each { shotType, shotZone, strikeRate, balls }
 *
 * Only pairs where BOTH sides clear their sample floor are returned. A comparison
 * against a number nobody should trust is worse than no comparison, because it
 * looks like one.
 */
export const compareToBenchmark = (mine = [], benchmark = [], kind = 'shot') => {
  if (!mine.length || !benchmark.length) return [];
  const field = kind === 'shot' ? 'shotType' : 'shotZone';
  const labeller = kind === 'shot' ? shotLabel : zoneLabel;

  const theirs = {};
  for (const b of benchmark) {
    const key = b[field];
    if (!key) continue;
    const balls = Number(b.balls) || 0;
    if (balls < MIN_BENCHMARK_BALLS) continue;
    // A provider may or may not have done the division for us.
    const sr = b.strikeRate != null ? Number(b.strikeRate)
      : (balls ? Math.round((Number(b.runs) || 0) / balls * 100) : null);
    if (sr == null) continue;
    theirs[key] = { strikeRate: sr, balls };
  }

  return mine
    .filter((m) => m.balls >= MIN_BALLS_FOR_CLAIM && m.strikeRate != null && theirs[m.key])
    .map((m) => {
      const t = theirs[m.key];
      return {
        key: m.key,
        label: labeller(m.key) || m.key,
        player:    { strikeRate: m.strikeRate, balls: m.balls, confidence: confidenceFor(m.balls) },
        benchmark: { strikeRate: t.strikeRate, balls: t.balls },
        differencePercent: pct(m.strikeRate, t.strikeRate),
      };
    })
    .sort((a, b) => Math.abs(b.differencePercent || 0) - Math.abs(a.differencePercent || 0));
};

/**
 * Load and compare, or return null.
 *
 * Null means "no comparison available", and the three ways to get there —
 * nobody linked this player, no source has shot data, or the tables have not
 * been migrated yet — are deliberately indistinguishable to the caller. All
 * three render the same way: the section simply is not there.
 *
 * The try/catch around a missing table is not laziness. This migration may sit
 * unapplied for a long time while nobody has a licensed feed, and a player
 * profile must not 500 in the meantime.
 */
export const benchmarkForPlayer = async (prisma, playerId, analytics, { level = 'international' } = {}) => {
  if (!playerId || !analytics) return null;
  try {
    const rows = await prisma.externalPlayerShotStat.findMany({
      where: { playerId, level, source: { isActive: true } },
    });
    if (!rows.length) return null;

    const byShot = compareToBenchmark(analytics.byShot, rows, 'shot');
    const byZone = compareToBenchmark(analytics.byZone, rows, 'zone');
    if (!byShot.length && !byZone.length) return null;

    return { level, byShot, byZone };
  } catch {
    return null;
  }
};

export default { compareToBenchmark, benchmarkForPlayer, MIN_BENCHMARK_BALLS };
