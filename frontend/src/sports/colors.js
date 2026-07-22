// Sport signature colours — ONE source of truth.
//
// This used to live in three places that disagreed: the Arena picker had its own
// SPORT_COLORS map, each sport's index.js had an `accent`, and scoring.js had a
// `color`. Football was blue in the picker and green everywhere else, so the
// sport you chose in the Arena bore no relation to the sport you landed in.
//
// The palette below is the picker's (19 neons spaced ~19° apart on the hue
// wheel, interleaved so no two sports read alike). It is tuned for the picker's
// DARK stage, so anything drawing on a light surface must go through
// sportColor(id, isDark) — the raw neon is unreadable on white.

// Cricket is the app's flagship and keeps the BRAND green everywhere — button,
// ARENA title, disc ring, stage glow. It is deliberately not part of the neon
// rotation: the other 18 sports are identified by colour, cricket by being the
// house colour. These two values are the theme's own green (dark / light).
const CRICKET = { dark: '#3ecf6e', light: '#0a5227' };

const SIGNATURE = {
  football: '#2662ff',
  basketball: '#fc8019',   // sunset orange (the ball's own colour) — was purple
  tennis: '#3cff14',
  kabaddi: '#ff5014',
  hockey: '#14ffcb',
  badminton: '#ff14b7',
  volleyball: '#ffe414',
  boxing: '#149fff',
  wrestling: '#ff1423',
  tabletennis: '#14ff81',
  khokho: '#fd14ff',
  handball: '#86ff14',
  squash: '#2f26ff',
  pickleball: '#ff9a14',
  judo: '#14e9ff',
  karate: '#ff146d',
  skateboard: '#14ff37',
  rummy: '#b826ff',
};

const FALLBACK = '#22c55e';

/** Raw signature colour, as designed for the dark Arena stage. */
export const rawSportColor = (id) => (id === 'cricket' ? CRICKET.dark : (SIGNATURE[id] || FALLBACK));

// Scale a colour down to a target luminance, keeping its hue. The neons are
// bright by design; on a white surface they'd be illegible as text or as a
// button fill behind white text.
function darken(hex, target = 0.34) {
  const h = hex.replace('#', '');
  let r = parseInt(h.slice(0, 2), 16);
  let g = parseInt(h.slice(2, 4), 16);
  let b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum > target) {
    const f = target / lum;
    r = Math.round(r * f); g = Math.round(g * f); b = Math.round(b * f);
  }
  const to2 = (v) => v.toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/**
 * The sport's colour for the CURRENT theme: the neon on dark, a darkened
 * same-hue ink on light. Safe as a fill behind white text in both.
 */
// Signatures already mid-toned enough to read on white — darkening them only
// muddies the hue (a dark orange is just brown), so they keep their true colour
// in light mode too. Basketball wears the ball's own sunset orange (#fc8019),
// used with white text the way Swiggy does.
const LIGHT_KEEP = new Set(['basketball']);

export const sportColor = (id, isDark = true) => {
  // Cricket's greens are already theme-tuned, so they skip the darken pass.
  if (id === 'cricket') return isDark ? CRICKET.dark : CRICKET.light;
  const c = rawSportColor(id);
  if (!isDark && LIGHT_KEEP.has(id)) return c;   // keep vibrant, don't brown it out
  return isDark ? c : darken(c);
};

export default { rawSportColor, sportColor };
