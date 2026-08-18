// The wagon wheel, as the phone draws it.
//
// ⚠ THIS IS A COPY. The authority is backend/src/lib/ballIntelligence.js — same
// zones, same arcs, same shot list. It is duplicated rather than fetched because
// the scorer has to be able to record a shot on a ground with no signal, and a
// vocabulary you have to download is a vocabulary you don't have when it rains.
//
// The duplication is made safe by where the two copies are USED, not by trust:
// the phone only ever sends an ANGLE, and the server derives the zone name from
// it with its own copy of this table. So if these two files ever drift, the worst
// that happens is a wedge on screen is labelled differently from the name that
// gets stored — annoying, visible, fixable. What cannot happen is a row whose
// angle and zone disagree, because only one machine ever writes both.
//
// If you edit the arcs here, edit them there. If you edit them there, edit them
// here.
//
// ── Angle convention ────────────────────────────────────────────────────────
// Overhead, batter at centre, BOWLER'S END AT THE TOP of the screen. 0° is
// straight past the bowler (up), degrees increase CLOCKWISE. Angles are absolute
// field directions, not "off side" — so a left-hander's wheel is the same circle
// with the labels mirrored, which is exactly what zonesForHand does below.

/** Clockwise from straight, AS A RIGHT-HANDER SEES THEM. Mirrored for lefties. */
export const SHOT_ZONES = [
  { key: 'straight',      label: 'Straight',        from: 350, to: 10 },
  { key: 'longOff',       label: 'Long Off',        from: 10,  to: 27 },
  { key: 'midOff',        label: 'Mid Off',         from: 27,  to: 45 },
  { key: 'extraCover',    label: 'Extra Cover',     from: 45,  to: 60 },
  { key: 'cover',         label: 'Cover',           from: 60,  to: 75 },
  { key: 'coverPoint',    label: 'Cover Point',     from: 75,  to: 86 },
  { key: 'point',         label: 'Point',           from: 86,  to: 100 },
  { key: 'backwardPoint', label: 'Bwd Point',       from: 100, to: 118 },
  { key: 'thirdMan',      label: 'Third Man',       from: 118, to: 150 },
  { key: 'fineThird',     label: 'Fine Third',      from: 150, to: 180 },
  { key: 'fineLeg',       label: 'Fine Leg',        from: 180, to: 212 },
  { key: 'backwardSquare',label: 'Bwd Square',      from: 212, to: 255 },
  { key: 'squareLeg',     label: 'Square Leg',      from: 255, to: 285 },
  { key: 'midWicket',     label: 'Mid Wicket',      from: 285, to: 312 },
  { key: 'midOn',         label: 'Mid On',          from: 312, to: 336 },
  { key: 'longOn',        label: 'Long On',         from: 336, to: 350 },
];

export const wrapAngle = (a) => ((Number(a) % 360) + 360) % 360;

const isLeft = (hand) => String(hand || '').toLowerCase().startsWith('l');

/** Middle of an arc, minding that `straight` wraps through zero. */
const midOf = (z) => {
  const span = z.to > z.from ? z.to - z.from : (360 - z.from) + z.to;
  return wrapAngle(z.from + span / 2);
};

/**
 * The sixteen wedges in ABSOLUTE screen angles for this batter.
 *
 * For a left-hander every arc is reflected about the straight/behind axis, which
 * is the whole of what "left-handed wagon wheel" means: a lefty's cover is the
 * same patch of grass as a righty's mid-wicket, so the wedge stays put and the
 * LABEL moves. Reversing the from/to on reflection keeps every arc walking
 * clockwise, so the drawing code never has to special-case a backwards wedge.
 */
export const zonesForHand = (hand) => SHOT_ZONES.map((z) => {
  const flip = isLeft(hand);
  const from = flip ? wrapAngle(360 - z.to) : z.from;
  const to   = flip ? wrapAngle(360 - z.from) : z.to;
  return { key: z.key, label: z.label, from, to, mid: flip ? wrapAngle(360 - midOf(z)) : midOf(z) };
});

/**
 * Which wedge an absolute angle falls in — for highlighting under the finger.
 *
 * Mirrors the ANGLE into the right-hander frame and reads the unflipped table,
 * rather than reading the flipped arcs from zonesForHand. That is deliberate and
 * it is the same thing the server does, character for character.
 *
 * Reading the flipped arcs looks equivalent and is not: reflecting a half-open
 * arc [from, to) turns it into (from, to], so the inclusive end swaps sides and a
 * tap landing EXACTLY on a boundary — 10.0° for a left-hander — got labelled
 * 'Long On' here while the server stored 'straight'. One angle in 720, silently
 * wrong, in the one direction nobody would ever test by hand. Sharing the
 * algorithm instead of the answer makes that class of drift impossible.
 *
 * zonesForHand keeps the flipped arcs, because DRAWING a wedge does not care
 * which end of a zero-width boundary line it owns.
 */
export const zoneFromAngle = (angle, hand) => {
  const a = wrapAngle(isLeft(hand) ? 360 - wrapAngle(angle) : angle);
  for (const z of SHOT_ZONES) {
    const wraps = z.to <= z.from;                       // only `straight` does
    if (wraps ? (a >= z.from || a < z.to) : (a >= z.from && a < z.to)) return z.key;
  }
  return 'straight';
};

/** Absolute angle at the middle of a named wedge. */
export const angleFromZone = (key, hand) => zonesForHand(hand).find((z) => z.key === key)?.mid ?? null;

/**
 * The shot list, grouped the way the picker shows it.
 *
 * Grouped rather than one flat list of twenty because the scorer is picking this
 * between deliveries: three short rows they can aim at beats one long alphabet
 * they have to read.
 */
export const SHOT_GROUPS = [
  { title: 'Drives',   keys: ['straightDrive', 'coverDrive', 'offDrive', 'onDrive', 'squareDrive', 'insideOut', 'backFootPunch', 'drive'] },
  { title: 'Cut & Pull', keys: ['cut', 'squareCut', 'lateCut', 'upperCut', 'pull', 'hook', 'pickUp'] },
  { title: 'Leg side', keys: ['flick', 'legGlance'] },
  { title: 'Sweeps',   keys: ['sweep', 'slogSweep', 'reverseSweep', 'paddle'] },
  { title: 'Aerial',   keys: ['slog', 'helicopter', 'scoop', 'ramp', 'reverseScoop', 'switchHit'] },
  { title: 'No shot',  keys: ['defensive', 'backFootDefence', 'leave', 'beaten', 'other'] },
];

export const SHOT_LABELS = {
  defensive: 'Defensive', leave: 'Leave', drive: 'Drive', coverDrive: 'Cover Drive',
  straightDrive: 'Straight Drive', onDrive: 'On Drive', squareDrive: 'Square Drive',
  offDrive: 'Off Drive', insideOut: 'Inside-Out', squareCut: 'Square Cut',
  slog: 'Slog', pickUp: 'Pick-Up', backFootPunch: 'Back Foot Punch', backFootDefence: 'Back Foot Defence',
  upperCut: 'Upper Cut', slogSweep: 'Slog Sweep', reverseScoop: 'Reverse Scoop',
  helicopter: 'Helicopter',
  cut: 'Cut', lateCut: 'Late Cut', pull: 'Pull', hook: 'Hook', flick: 'Flick',
  legGlance: 'Leg Glance', sweep: 'Sweep', reverseSweep: 'Reverse Sweep', ramp: 'Ramp',
  scoop: 'Scoop', paddle: 'Paddle', switchHit: 'Switch Hit', lofted: 'Lofted',
  beaten: 'Beaten', other: 'Other',
};

/** What a dot ball usually was. Offered instead of the full list after a dot. */
export const DOT_BALL_TYPES = ['defensive', 'leave', 'beaten', 'other'];

/** How it came off the bat. Entirely optional — most balls will never say. */
export const CONNECTIONS = [
  { key: 'clean', label: 'Clean' }, { key: 'edge', label: 'Edge' },
  { key: 'mistimed', label: 'Mistimed' }, { key: 'missed', label: 'Missed' },
];

/**
 * What to CALL a stroke once loft is known.
 *
 * Display only. The stored value stays `coverDrive` + `lofted:true` — the
 * scorer reads "Lofted Cover Drive", the dataset keeps one cover-drive bucket,
 * and nobody has to choose between natural cricket language and a taxonomy
 * that can actually be counted.
 */
const NO_LOFT_PREFIX = ['lofted', 'slog', 'slogSweep', 'helicopter', 'scoop', 'ramp',
  'reverseScoop', 'switchHit', 'upperCut', 'pickUp', 'leave', 'beaten', 'other'];
export const loftedLabel = (key, lofted) => {
  const base = SHOT_LABELS[key] || key;
  if (lofted !== true || NO_LOFT_PREFIX.includes(key)) return base;
  return `Lofted ${base}`;
};

export const zoneLabel = (key) => SHOT_ZONES.find((z) => z.key === key)?.label || null;

/** Is this batter a left-hander? `battingStyle` is free text the player typed. */
export const handOf = (player) => (/left/i.test(String(player?.battingStyle || '')) ? 'left' : 'right');

export default { loftedLabel, SHOT_ZONES, zonesForHand, zoneFromAngle, angleFromZone, SHOT_GROUPS, SHOT_LABELS, DOT_BALL_TYPES, CONNECTIONS, zoneLabel, handOf, wrapAngle };
