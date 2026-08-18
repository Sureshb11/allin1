// Where the ball went, in one place.
//
// This is the canonical definition of the wagon wheel: the angle convention, the
// sixteen zones and their arcs, the shot vocabulary, and the mirroring that makes
// a left-hander's cover drive a cover drive. `deliveries.js` exists because the
// same rule lived in four files and eventually differed in one of them; this file
// is written the same way, for the same reason.
//
// The frontend draws the wheel and therefore needs the same arcs — see
// frontend/src/sports/cricket/wagonWheel.js, which carries a copy. THIS file is
// the authority: the server always re-derives `shotZone` from `shotAngle` on
// write and ignores whatever zone the client sent. If the two tables ever drift,
// the client can mislabel a tap target, but the stored dataset stays internally
// consistent — the angle and the zone always agree, forever, because one process
// computes both.
//
// ── The angle convention ────────────────────────────────────────────────────
// Overhead view, batter at the centre, BOWLER'S END AT THE TOP. Zero degrees is
// straight back down the ground past the bowler; degrees increase CLOCKWISE.
//
//                       0° straight (long on / long off)
//                              │
//        270° ──── square ─────┼───── square ──── 90°
//         (leg, square leg)    │    (off, point)
//                              │
//                            180° straight behind the keeper
//
// Angles are stored ABSOLUTE — the physical direction the ball travelled, not
// "the batter's off side". A right-hander's off side runs 0°→180° clockwise; a
// left-hander's is the mirror. Storing the physical angle means a wagon wheel of
// a whole team, of mixed handedness, plots without needing to know who batted;
// storing "off side at 90" would make every drawing depend on a lookup that can
// go missing.

/**
 * The sixteen zones, in clockwise order from straight, AS A RIGHT-HANDER SEES THEM.
 *
 * Arcs are deliberately unequal. Sixteen tidy 22.5° wedges would put point at 101°
 * and square leg at 259°, and a scorer who taps "square" means SQUARE — so point
 * and square leg straddle 90° and 270° exactly, and the wedges either side give up
 * the degrees to pay for it. Third man and fine leg are wide because that is how
 * much of a real field they cover.
 *
 * `from`/`to` are inclusive-exclusive and walk clockwise; `straight` wraps 350→10
 * through zero, which zoneFromAngle handles explicitly.
 */
export const SHOT_ZONES = [
  // ── Off side for a right-hander: 0° → 180° ──
  { key: 'straight',      label: 'Straight',        from: 350, to: 10,  group: 'straight' },
  { key: 'longOff',       label: 'Long Off',        from: 10,  to: 27,  group: 'off' },
  { key: 'midOff',        label: 'Mid Off',         from: 27,  to: 45,  group: 'off' },
  { key: 'extraCover',    label: 'Extra Cover',     from: 45,  to: 60,  group: 'off' },
  { key: 'cover',         label: 'Cover',           from: 60,  to: 75,  group: 'off' },
  { key: 'coverPoint',    label: 'Cover Point',     from: 75,  to: 86,  group: 'off' },
  { key: 'point',         label: 'Point',           from: 86,  to: 100, group: 'off' },
  { key: 'backwardPoint', label: 'Backward Point',  from: 100, to: 118, group: 'off' },
  { key: 'thirdMan',      label: 'Third Man',       from: 118, to: 150, group: 'off' },
  { key: 'fineThird',     label: 'Fine Third',      from: 150, to: 180, group: 'off' },
  // ── Leg side for a right-hander: 180° → 360° ──
  { key: 'fineLeg',       label: 'Fine Leg',        from: 180, to: 212, group: 'leg' },
  { key: 'backwardSquare',label: 'Backward Square', from: 212, to: 255, group: 'leg' },
  { key: 'squareLeg',     label: 'Square Leg',      from: 255, to: 285, group: 'leg' },
  { key: 'midWicket',     label: 'Mid Wicket',      from: 285, to: 312, group: 'leg' },
  { key: 'midOn',         label: 'Mid On',          from: 312, to: 336, group: 'leg' },
  { key: 'longOn',        label: 'Long On',         from: 336, to: 350, group: 'leg' },
];

const ZONE_BY_KEY = Object.fromEntries(SHOT_ZONES.map((z) => [z.key, z]));

/** Middle of a zone's arc — where a one-tap "cover" lands when no finer angle was given. */
export const zoneMidAngle = (key) => {
  const z = ZONE_BY_KEY[key];
  if (!z) return null;
  // `straight` wraps through zero: 350→10 has its middle at 0, not 180.
  const span = z.to > z.from ? z.to - z.from : (360 - z.from) + z.to;
  return (z.from + span / 2) % 360;
};

/**
 * Mirror an absolute angle for a left-hander.
 *
 * A left-hander's cover is the right-hander's mid-wicket — same shot, opposite
 * side of the ground. Reflecting about the 0°–180° axis maps one onto the other,
 * so ONE zone table serves both and there is no second list to keep in step.
 */
const toRightHandFrame = (angle, hand) =>
  String(hand || '').toLowerCase().startsWith('l') ? (360 - angle) % 360 : angle;

/** Normalise any number to [0, 360). */
export const wrapAngle = (a) => ((Number(a) % 360) + 360) % 360;

/**
 * Which named zone an absolute angle falls in, for this batter's hand.
 *
 * Returns the zone KEY ('cover'), never a label — labels are display text and
 * change; keys are the dataset.
 */
export const zoneFromAngle = (angle, hand) => {
  if (angle == null || Number.isNaN(Number(angle))) return null;
  const a = wrapAngle(toRightHandFrame(wrapAngle(angle), hand));
  for (const z of SHOT_ZONES) {
    const wraps = z.to <= z.from;                       // only `straight` does
    if (wraps ? (a >= z.from || a < z.to) : (a >= z.from && a < z.to)) return z.key;
  }
  return 'straight';                                    // unreachable; arcs tile the circle
};

/**
 * The reverse: the absolute angle a named zone sits at, for this batter's hand.
 *
 * Used when the scorer taps a wedge rather than a point — one tap has to become a
 * storable number, and the middle of the wedge is the honest answer.
 */
export const angleFromZone = (zoneKey, hand) => {
  const mid = zoneMidAngle(zoneKey);
  if (mid == null) return null;
  return wrapAngle(toRightHandFrame(mid, hand));        // reflection is its own inverse
};

/** Coarse groupings the spec asks for, derived rather than stored twice. */
export const zoneGroups = (zoneKey, hand) => {
  const z = ZONE_BY_KEY[zoneKey];
  if (!z) return null;
  const mid = zoneMidAngle(zoneKey);                    // in the right-hander frame
  return {
    side: z.group === 'straight' ? 'straight' : (z.group === 'off' ? 'offSide' : 'legSide'),
    // Square is 90°/270°; in front of it is a drive, behind it is a cut or a glance.
    wicket: (mid < 90 || mid > 270) ? 'frontOfWicket' : 'behindSquare',
    hand: String(hand || '').toLowerCase().startsWith('l') ? 'left' : 'right',
  };
};

/**
 * The shot vocabulary.
 *
 * `category` is what the commentary generator reads to pick a verb, and what the
 * strengths/weaknesses layer will group by — a player who is strong "driving" is
 * a more useful fact than one strong at the on drive specifically, when the
 * sample is forty balls.
 */
export const SHOT_TYPES = [
  { key: 'defensive',    label: 'Defensive',     category: 'defence', verb: 'defends' },
  { key: 'leave',        label: 'Leave',         category: 'defence', verb: 'leaves' },
  { key: 'backFootDefence', label: 'Back Foot Defence', category: 'defence', verb: 'defends' },
  { key: 'drive',        label: 'Drive',         category: 'drive',   verb: 'drives' },
  { key: 'coverDrive',   label: 'Cover Drive',   category: 'drive',   verb: 'drives' },
  { key: 'straightDrive',label: 'Straight Drive',category: 'drive',   verb: 'drives' },
  { key: 'onDrive',      label: 'On Drive',      category: 'drive',   verb: 'drives' },
  { key: 'squareDrive',  label: 'Square Drive',  category: 'drive',   verb: 'drives' },
  // Opening the face to hit a ball from the stumps AGAINST its line, into the
  // off side. Kept as its own stroke and not as a modifier because it is the
  // one entry here that describes intent a location cannot recover: an
  // inside-out six over extra cover and a cover drive for four can share a
  // zone, and only one of them tells you the batter manufactured the angle.
  { key: 'insideOut',    label: 'Inside-Out',    category: 'drive',   verb: 'goes inside-out' },
  { key: 'offDrive',     label: 'Off Drive',     category: 'drive',   verb: 'drives' },
  // Back foot, but still a drive: the weight goes back and the bat stays
  // vertical, which is exactly what separates a punch from a cut.
  { key: 'backFootPunch',label: 'Back Foot Punch',category: 'drive',  verb: 'punches' },
  { key: 'cut',          label: 'Cut',           category: 'cut',     verb: 'cuts' },
  { key: 'lateCut',      label: 'Late Cut',      category: 'cut',     verb: 'cuts' },
  { key: 'upperCut',     label: 'Upper Cut',     category: 'cut',     verb: 'upper-cuts' },
  { key: 'squareCut',    label: 'Square Cut',    category: 'cut',     verb: 'cuts' },
  { key: 'dab',          label: 'Dab',           category: 'cut',     verb: 'dabs' },
  { key: 'pull',         label: 'Pull',          category: 'pull',    verb: 'pulls' },
  { key: 'hook',         label: 'Hook',          category: 'pull',    verb: 'hooks' },
  { key: 'flick',        label: 'Flick',         category: 'glance',  verb: 'flicks' },
  { key: 'legGlance',    label: 'Leg Glance',    category: 'glance',  verb: 'glances' },
  { key: 'sweep',        label: 'Sweep',         category: 'sweep',   verb: 'sweeps' },
  { key: 'reverseSweep', label: 'Reverse Sweep', category: 'sweep',   verb: 'reverse-sweeps' },
  { key: 'slogSweep',    label: 'Slog Sweep',    category: 'sweep',   verb: 'slog-sweeps' },
  { key: 'fineSweep',    label: 'Fine Sweep',    category: 'sweep',   verb: 'sweeps' },
  { key: 'ramp',         label: 'Ramp',          category: 'ramp',    verb: 'ramps' },
  { key: 'scoop',        label: 'Scoop',         category: 'ramp',    verb: 'scoops' },
  { key: 'paddle',       label: 'Paddle',        category: 'sweep',   verb: 'paddles' },
  { key: 'switchHit',    label: 'Switch Hit',    category: 'ramp',    verb: 'switch-hits' },
  // Retired as a TYPE — loft is now the `lofted` attribute on the delivery, so
  // "lofted cover drive" is coverDrive+lofted and cannot split that batter's
  // cover-drive sample in two. Kept in the vocabulary, and only there, so the
  // rows already recorded against it still resolve to a name; `deprecated`
  // keeps it out of the picker without a backfill that would have to guess
  // which stroke each old row actually was.
  { key: 'lofted',       label: 'Lofted',        category: 'loft',    verb: 'lofts', deprecated: true },
  { key: 'reverseScoop', label: 'Reverse Scoop', category: 'ramp',    verb: 'reverse-scoops' },
  { key: 'helicopter',   label: 'Helicopter',    category: 'loft',    verb: 'whips' },
  { key: 'slog',         label: 'Slog',          category: 'loft',    verb: 'slogs' },
  { key: 'pickUp',       label: 'Pick-Up',       category: 'pull',    verb: 'picks up' },
  { key: 'beaten',       label: 'Beaten',        category: 'nothing', verb: 'is beaten by' },
  { key: 'other',        label: 'Other',         category: 'other',   verb: 'plays' },
];

const TYPE_BY_KEY = Object.fromEntries(SHOT_TYPES.map((t) => [t.key, t]));

/** Every stroke still offered to a scorer — i.e. everything but the retired ones. */
export const liveShotTypes = () => SHOT_TYPES.filter((t) => !t.deprecated);

/**
 * Off side, leg side or straight — derived from the zone, never stored.
 *
 * The zones already carry this as their `group`, and the zone is itself derived
 * from the angle. Deriving it a third time rather than adding a column keeps the
 * chain angle -> zone -> side single-valued: there is no way for a delivery to
 * claim it went to cover and also that it went to the leg side. Commentary in
 * particular must not be able to contradict the wagon wheel.
 *
 * Batter-relative, so a left-hander's off side is their off side.
 */
export const sideOfZone = (zone) => ZONE_BY_KEY[zone]?.group || null;

/** The same, straight from an angle, for callers that have not resolved a zone. */
export const sideOfAngle = (angle, hand) => sideOfZone(zoneFromAngle(angle, hand));

/** The short list offered after a dot ball — a dot is rarely a stroke. */
export const DOT_BALL_TYPES = ['defensive', 'leave', 'beaten', 'other'];

/** How the ball came off the bat. Optional; the scorer is under no obligation. */
export const CONNECTIONS = ['clean', 'edge', 'mistimed', 'missed'];

/**
 * Where a shot record came from.
 *
 * Only SCORER is written today. The column exists now so that the day a video or
 * model starts producing these, the old rows are still distinguishable from the
 * new ones without a backfill that has to guess.
 */
export const SOURCES = ['SCORER', 'AI', 'VIDEO', 'IMPORTED', 'INFERRED'];

export const isKnownZone = (k) => Object.prototype.hasOwnProperty.call(ZONE_BY_KEY, k);
export const isKnownShotType = (k) => Object.prototype.hasOwnProperty.call(TYPE_BY_KEY, k);
export const shotLabel = (k) => TYPE_BY_KEY[k]?.label || null;
export const zoneLabel = (k) => ZONE_BY_KEY[k]?.label || null;
export const shotCategory = (k) => TYPE_BY_KEY[k]?.category || null;
export const shotVerb = (k) => TYPE_BY_KEY[k]?.verb || null;

/**
 * Clean one submitted shot into exactly what the table stores, or reject it.
 *
 * Returns `{ ok: true, value }` or `{ ok: false, reason }`. Callers treat a
 * rejection as "drop the analytics", NEVER as "fail the delivery" — a scorer must
 * not lose a ball because a shot arrived malformed.
 */
export const normaliseShot = (input = {}, { hand } = {}) => {
  const out = {};

  // An angle is the one thing a wagon wheel cannot be drawn without. Accept a
  // bare zone too (a one-tap capture) and take the middle of its wedge.
  let angle = input.shotAngle;
  if (angle == null && input.shotZone) angle = angleFromZone(input.shotZone, hand);
  if (angle == null || Number.isNaN(Number(angle))) return { ok: false, reason: 'no angle or zone' };
  out.shotAngle = Math.round(wrapAngle(angle) * 10) / 10;

  // Zone is DERIVED, never trusted: see the file header.
  out.shotZone = zoneFromAngle(out.shotAngle, hand);

  // Distance is percent of the way to the boundary. Absent is fine — a scorer
  // tapping a wedge has said a direction, not a length — so null, not a guess.
  if (input.shotDistance != null && !Number.isNaN(Number(input.shotDistance))) {
    out.shotDistance = Math.min(100, Math.max(0, Math.round(Number(input.shotDistance))));
  }

  // Unknown vocabulary is dropped rather than stored. A misspelt shot type would
  // otherwise sit in the dataset forever and quietly split one shot into two.
  if (input.shotType && isKnownShotType(input.shotType)) out.shotType = input.shotType;
  if (input.connectionType && CONNECTIONS.includes(input.connectionType)) {
    out.connectionType = input.connectionType;
  }

  // Loft is an attribute of the stroke. Only stored when the client actually
  // said something: null is "not recorded", which is a different fact from
  // "along the ground" and must stay distinguishable in the dataset.
  if (typeof input.lofted === 'boolean') out.lofted = input.lofted;

  // Where the chosen shot sat in the ranking the scorer was shown. Bounded
  // because it is the one field a client could otherwise use to write
  // arbitrary integers into the analytics table.
  const rank = Number(input.selectedShotRank);
  if (Number.isFinite(rank) && rank >= 1 && rank <= 99) out.selectedShotRank = Math.round(rank);
  const ver = Number(input.rankingEngineVersion);
  if (Number.isFinite(ver) && ver >= 0 && ver <= 9999) out.rankingEngineVersion = Math.round(ver);

  out.source = SOURCES.includes(input.source) ? input.source : 'SCORER';
  // A human scorer watching the ball is the ground truth this dataset is built
  // on; anything inferred arrives with its own number and must say so.
  const conf = Number(input.confidence);
  out.confidence = Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : (out.source === 'SCORER' ? 1 : 0.5);

  return { ok: true, value: out };
};

/**
 * Outcome of the delivery, from the ball itself.
 *
 * Derived rather than sent by the client so it cannot disagree with the score:
 * the ball row is the truth about runs and wickets, and this is only a label for
 * grouping shots by what they produced.
 */
export const shotOutcome = (ball) => {
  if (!ball) return null;
  if (ball.isWicket) return 'Wicket';
  const r = Number(ball.runs) || 0;
  if (r === 6) return 'Six';
  if (r === 4) return 'Four';
  if (r === 0) return 'Dot';
  return 'Runs';
};

/**
 * Re-derive a player's stored shot zones after their batting hand changes.
 *
 * A zone name is a function of (angle, hand), and the hand is editable long after
 * the shots were played — most players here have no batting style recorded, so
 * they are treated as right-handers until somebody says otherwise. When that
 * finally happens, everything they had already hit is sitting in the table under
 * the mirrored name.
 *
 * Reads re-derive and are always right (see the intelligence GET); this exists so
 * the COLUMN agrees too, because it is what SQL-level analytics will group by.
 * The angle is never touched — it is the physical direction the ball went, and
 * that does not change just because we learned which way the batter stands.
 *
 * `prisma` is passed in rather than imported so this file stays free of database
 * coupling and the geometry above can be tested on its own.
 */
export const resyncShotZones = async (prisma, playerId) => {
  if (!playerId) return 0;
  const player = await prisma.player.findUnique({
    where: { id: playerId }, select: { battingStyle: true },
  });
  const hand = /left/i.test(String(player?.battingStyle || '')) ? 'left' : 'right';
  const rows = await prisma.ballIntelligence.findMany({
    where: { ball: { batterId: playerId } },
    select: { id: true, shotAngle: true, shotZone: true },
  });
  const stale = rows
    .map((r) => ({ id: r.id, zone: zoneFromAngle(r.shotAngle, hand), was: r.shotZone }))
    .filter((r) => r.zone !== r.was);
  // Sequential and unbatched on purpose: this runs when someone edits a profile,
  // not on any hot path, and a player has at most a few hundred shots.
  for (const r of stale) {
    await prisma.ballIntelligence.update({ where: { id: r.id }, data: { shotZone: r.zone } });
  }
  return stale.length;
};

export default {
  SHOT_ZONES, SHOT_TYPES, DOT_BALL_TYPES, CONNECTIONS, SOURCES, sideOfZone, sideOfAngle, liveShotTypes,
  resyncShotZones,
  zoneFromAngle, angleFromZone, zoneMidAngle, zoneGroups, wrapAngle,
  normaliseShot, shotOutcome, isKnownZone, isKnownShotType,
  shotLabel, zoneLabel, shotCategory, shotVerb,
};
