// A team name gets one line, and shrinks to keep it.
//
// Match cards stack the name under a hex avatar in a flex:1 column, so the two
// sides stay symmetric. "Mumbai Mavericks" was wrapping to a second line there
// (numberOfLines={2}), which pushed the score down and made one side of the
// card taller than the other; where the card allowed only one line it truncated
// to "Mumbai Maveri…" instead. Neither is a name you can read at a glance.
//
// The size is computed from the character count rather than left to
// `adjustsFontSizeToFit`, which does not reliably shrink on Android — it clips
// instead, which is how the Home tab labels lost their last letters earlier.
// Callers still pass adjustsFontSizeToFit as a backstop for iOS and for the
// rare name longer than this floor can absorb.
//
//   <Text numberOfLines={1} style={[s.teamName, teamNameStyle(name)]}>
//
// Real names this has to hold: "CSK" (3), "D-Vigo-S XI" (11),
// "Mumbai Mavericks" (16), "Royal Challengers Bengaluru" (27).
const BASE = 13;   // what a short name gets — unchanged from before
const MIN = 9;     // below this it stops being readable on a card
const FITS = 11;   // characters that fit at BASE in the narrowest column we use

// `fits` is how many characters the caller's column holds at `base`. The default
// is tuned for the narrowest one (a match card); a team profile's header is far
// wider, so it passes its own rather than shrinking "Mumbai Mavericks" that a
// column has plenty of room for.
export const teamNameSize = (name, base = BASE, min = MIN, fits = FITS) => {
  const n = (name || '').trim().length;
  if (n <= fits) return base;
  // Half a point per character over the threshold, floored. 16 chars → 10.5,
  // 27 chars → the floor.
  return Math.max(min, Math.round((base - (n - fits) * 0.5) * 2) / 2);
};

/** The style object to merge onto a team-name Text. */
export const teamNameStyle = (name, base = BASE, min = MIN) => {
  const fontSize = teamNameSize(name, base, min);
  // lineHeight has to come down with it, or a short name and a long one sit at
  // different heights and the two sides of the card stop lining up.
  return { fontSize, lineHeight: fontSize + 3 };
};

/**
 * Both sides of a match card, sized together off the longer name.
 *
 * Sizing each side on its own put "D-Vigo-S XI" at 13 next to "Chennai
 * Chargers" at 10.5 on the same card — one team's name visibly smaller than its
 * opponent's, which reads as a rendering fault rather than a fit. The pair
 * shares the size the longer of the two needs.
 */
export const teamNamePairStyle = (a, b, base = BASE, min = MIN) => {
  const longer = ((a || '').trim().length >= (b || '').trim().length) ? a : b;
  return teamNameStyle(longer, base, min);
};

export default teamNameStyle;
