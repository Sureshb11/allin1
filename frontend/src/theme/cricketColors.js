// One cricket colour language.
//
// Not a new palette — the brand already decided this and wrote it down in
// ThemeContext: "Single-accent system: green carries every action/highlight, red
// means only wicket/live/danger, blue is gone." These are semantic names on top
// of that, so a screen asks for `wicket` rather than picking a red, and two
// screens cannot pick different reds for the same event.
//
// Why this file exists at all — the audit found the same cricket meaning drawn
// three different ways:
//
//   a FOUR   was DS.blueDeep on the scoring button (a colour the brand retired),
//            limeBright on the wagon wheel, and lime in the scorecard commentary
//   a SIX    was a lime tint on the button, lime on the wheel, and a hardcoded
//            '#f59e0b' in commentary
//   a WICKET was wicketText in two places and `live` in a third
//
// And worse: the wheel drew a four in `limeBright` and a six in `lime`, which in
// the LIGHT theme are both #0a5227 — identical. The legend claimed they differed
// and they did not. Same fault as the flip-tile bug: three lime tokens collapse
// to one value in light mode, so any pair of them is invisible against itself.
//
// ── The rule for four vs six ────────────────────────────────────────────────
// A six always has MORE contrast against the page than a four. On dark that
// means brighter; on light it means darker. Stated that way it holds in both
// themes instead of being two arbitrary pairs.
//
// Every value below is measured, not chosen by eye: all clear WCAG AA against
// their own background, and four/six are at least 1.3:1 apart from each other.

const DARK = {
  // ── Deliveries ──
  dot:        '#8B8B8B',   // nothing happened; the quietest thing on the screen
  runs:       '#EAECED',   // 1-3: ordinary, so it reads as text, not as an event
  four:       '#10B981',   // 7.44:1
  six:        '#34D399',   // 9.82:1 — brighter than four on a dark page
  wicket:     '#F87171',   // 6.83:1 — the app's one semantic red
  wicketBg:   'rgba(248,113,113,0.16)',

  // ── Extras ──
  // Wides and no balls cost the bowling side something; byes and leg byes are
  // just information. Warning vs neutral, not two more accents.
  wide:       '#F59E0B',
  noBall:     '#F59E0B',
  bye:        '#94A3B8',
  legBye:     '#94A3B8',
  penalty:    '#F59E0B',

  // ── Match state ──
  live:       '#F87171',   // same red as a wicket: both mean "happening now"
  upcoming:   '#94A3B8',
  completed:  '#8B8B8B',
  paused:     '#F59E0B',
  inningsBreak: '#F59E0B',

  // ── Roles at the crease ──
  striker:    '#10B981',   // the one on strike gets the accent
  nonStriker: '#8B8B8B',   // present, not emphasised
  bowler:     '#10B981',
};

const LIGHT = {
  dot:        '#727880',
  runs:       '#131619',
  four:       '#1B7F4C',   // 5.02:1
  six:        '#0a5227',   // 9.34:1 — DARKER than four on a white page
  wicket:     '#c62828',   // 5.62:1
  wicketBg:   'rgba(198,40,40,0.10)',

  wide:       '#8a5200',   // 6.39:1 — amber fails on white, so this is its dark twin
  noBall:     '#8a5200',
  bye:        '#4b5563',
  legBye:     '#4b5563',
  penalty:    '#8a5200',

  live:       '#c62828',
  upcoming:   '#4b5563',
  completed:  '#727880',
  paused:     '#8a5200',
  inningsBreak: '#8a5200',

  striker:    '#0a5227',
  nonStriker: '#727880',
  bowler:     '#0a5227',
};

// ── SUNLIGHT ────────────────────────────────────────────────────────────────
// For scoring outdoors in direct glare. These are FILL colours — in this mode a
// four and a six are solid blocks with white text, not tinted chips — so what
// had to be measured is white-on-fill, not fill-on-page.
//
// The source design proposed #00FF00 for boundaries. It cannot carry the white
// text its own mockup puts on it: 1.37:1, against a floor of 4.5. Kept the
// intent (a filled, unmissable boundary block) at values that hold their text.
// The six-darker-than-four rule from the other two modes still applies.
const SUNLIGHT = {
  dot:        '#000000',   // no greys anywhere: a dot is black type on white
  runs:       '#000000',
  four:       '#008000',   // white text 5.14:1
  six:        '#004d00',   // white text 10.19:1 — and 1.98:1 apart from four
  wicket:     '#d00000',   // white text 5.70:1
  wicketBg:   '#ffffff',

  // Extras are black-on-white with a black border, not coloured fills. Adding a
  // third and fourth hue to a screen designed around two would undo the point.
  wide:       '#000000',
  noBall:     '#000000',
  bye:        '#000000',
  legBye:     '#000000',
  penalty:    '#000000',

  live:       '#d00000',
  upcoming:   '#000000',
  completed:  '#000000',
  paused:     '#8a5200',
  inningsBreak: '#8a5200',

  striker:    '#000000',   // inversion marks the striker, not a tint
  nonStriker: '#000000',
  bowler:     '#000000',
};

/**
 * The cricket palette for the current theme.
 *
 * Takes the app's own colour object so it follows light/dark exactly as every
 * other component does — `cricketColors(useTheme().colors)`.
 */
export const cricketColors = (DS) =>
  (DS?.mode === 'sunlight' ? SUNLIGHT : DS?.mode === 'dark' ? DARK : LIGHT);

/**
 * The colour for a delivery's outcome, from the delivery itself.
 *
 * One function so a ball chip, a wagon-wheel line and a commentary line cannot
 * disagree about what colour a six is.
 */
export const outcomeColor = (ball, C) => {
  if (!ball) return C.runs;
  if (ball.isWicket) return C.wicket;
  if (ball.extraType && C[ball.extraType]) return C[ball.extraType];
  if (ball.runs === 6) return C.six;
  if (ball.runs === 4) return C.four;
  if (ball.runs === 0) return C.dot;
  return C.runs;
};

/** Match status → colour, so a status pill means the same thing everywhere. */
export const statusColor = (status, C) => ({
  live: C.live, break: C.inningsBreak, scheduled: C.upcoming,
  upcoming: C.upcoming, completed: C.completed, abandoned: C.completed,
}[String(status || '').toLowerCase()] || C.completed);

export default { cricketColors, outcomeColor, statusColor };
