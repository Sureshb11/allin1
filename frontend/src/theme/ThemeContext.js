// App-wide light/dark theme.
//
// Screens read colours from `useTheme().colors` and build their StyleSheet via a
// per-render factory (so a theme change re-styles them):
//
//   import { useTheme, useThemedStyles } from '../theme/ThemeContext';
//   const makeStyles = (c) => StyleSheet.create({ root: { backgroundColor: c.bg }, … });
//   function Screen() {
//     const c = useTheme().colors;
//     const styles = useThemedStyles(makeStyles);
//     …
//   }
//
// The palette is a single superset object so screens using either historic key
// set work unchanged: the Profile-style keys (bg/surfaceLow/surfaceHigh/lime/
// textPrimary/…) and the Arena/Rummy-style keys (navy0/navy1/cell/ink/inkDim/…)
// both resolve from the same theme.

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { getSelectedSport, subscribeSport } from '../utils/selectedSport';
import { sportColor } from '../sports/colors';
import { Appearance, LayoutAnimation, Platform, UIManager } from 'react-native';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'theme:mode';

// ── DARK (night) — ONE green accent, neutral surfaces, red = semantic only ────
// Single-accent system: green carries every action/highlight, red means only
// wicket/live/danger, blue is gone, and all surfaces are neutral (no green haze
// on borders). Mirrors the light theme so the app is consistent in both.
const dark = {
  mode: 'dark',
  bg: '#000000',
  surfaceLow: '#080808',
  surface: '#111111',
  surfaceHigh: '#1A1A1A',
  surfaceHighest: '#242424',
  white: '#ffffff',
  lime: '#10B981',        // Richer emerald/neon green
  limeBright: '#34D399',
  lime2: '#10B981',
  onLime: '#000000',      // True black for contrast
  coral: '#F87171',       // Slightly softer red for better contrast
  wicketBg: 'rgba(248,113,113,0.16)',
  wicketText: '#F87171',
  // Tints. These exist as tokens rather than `DS.lime + '14'` at each call site
  // because sunlight mode has to be able to answer "no tint at all" — an alpha
  // suffix composites to a pale wash no matter what the palette says, so the
  // one mode whose entire premise is "no washes, use a border" could not opt
  // out while the colour was being mixed in the stylesheet. See SUNLIGHT below.
  tintAccent:       'rgba(16,185,129,0.08)',
  tintAccentStrong: 'rgba(16,185,129,0.20)',
  tintDanger:       'rgba(248,113,113,0.10)',
  borderAccent:     'rgba(16,185,129,0.27)',
  borderDanger:     'rgba(248,113,113,0.33)',
  blue: '#3B82F6',
  blueDeep: '#2563EB',
  blueSoft: '#60A5FA',
  onBlue: '#ffffff',
  textPrimary: '#FFFFFF', // Pure white
  textVariant: '#B0B0B0', // Warmer grey for better readability
  textSecondary: '#B0B0B0',
  textMuted: '#8B8B8B',   // Warmer muted for legibility
  faint: '#262626',
  onDark: '#FFFFFF',
  onDarkDim: '#B0B0B0',
  limeDark: '#064E3B',
  live: '#F87171',
  danger: '#EF4444',
  dangerTxt: '#F87171',
  warn: '#F59E0B',
  success: '#10B981',
  border: '#2A2A2A',      // Warmer border for depth
  line: '#2A2A2A',
  overlay: 'rgba(0,0,0,0.8)',
  // Arena fallback roles
  navy0: '#000000',
  navy1: '#080808',
  navy2: '#111111',
  cell: '#111111',
  cellHi: '#1A1A1A',
  ink: '#FFFFFF',
  inkDim: '#8B8B8B',
};

// ── LIGHT (outdoor / day) — ONE deep-green accent, pure white, red = semantic ─
// Tuned for SUNLIGHT: near-black text, pure-white cards separated by a hairline
// + soft shadow (no grey fills, which wash out under glare), deep-green accent at
// 9.35:1 on white (AAA). Blue removed entirely; green is the only accent colour.
const light = {
  mode: 'light',
  bg: '#ffffff',            // pure white page
  surfaceLow: '#ffffff',    // sections / banners
  surface: '#ffffff',       // cards
  surfaceHigh: '#f0f2f3',   // chips / inputs / buttons — faint fill, defined by its border
  surfaceHighest: '#e8ebee',// header bands / recess / avatars
  white: '#ffffff',
  lime: '#0a5227',       // THE accent — deep pitch green, 9.35:1 on white (AAA)
  limeBright: '#0a5227',
  lime2: '#0a5227',
  onLime: '#ffffff',
  coral: '#c62828',       // semantic red — wicket / danger / live
  wicketBg: 'rgba(198,40,40,0.10)',
  wicketText: '#c62828',
  tintAccent:       'rgba(10,82,39,0.08)',
  tintAccentStrong: 'rgba(10,82,39,0.20)',
  tintDanger:       'rgba(198,40,40,0.08)',
  borderAccent:     'rgba(10,82,39,0.27)',
  borderDanger:     'rgba(198,40,40,0.33)',
  blue: '#2563eb',
  blueDeep: '#1d4ed8',
  blueSoft: '#3b82f6',
  onBlue: '#ffffff',
  textPrimary: '#131619', // near-black — survives glare
  textVariant: '#464c52',
  textSecondary: '#464c52',
  textMuted: '#727880',
  faint: '#e8ebee',
  onDark: '#ffffff',
  onDarkDim: '#eef0f2',
  limeDark: '#0a5227',
  live: '#c62828',
  danger: '#c62828',
  dangerTxt: '#c62828',
  warn: '#c62828',
  success: '#0a5227',     // boundary / six → the accent green
  border: '#d7dbdf',
  line: '#d7dbdf',
  overlay: 'rgba(0,0,0,0.4)',
  navy0: '#ffffff',   // arena/rummy surfaces — neutral white now
  navy1: '#ffffff',
  navy2: '#ffffff',
  cell: '#ffffff',
  cellHi: '#f0f2f3',
  ink: '#131619',
  inkDim: '#727880',
};

// ── SUNLIGHT — for scoring outdoors in direct glare ──────────────────────────
//
// A third mode, not a brighter light theme. The light theme is already strong
// (near-black on white, accent at 9.35:1) and is the right default indoors.
// This one trades comfort for legibility at arm's length in full sun:
//
//   · Pure black on pure white — 21:1, the maximum a screen can produce.
//   · NO GREYS. Every mid-tone is the first thing to disappear in glare, so
//     hierarchy comes from borders and inversion instead of tint. Where the
//     light theme uses a faint fill to separate a chip from the page, this uses
//     a solid black outline; where it dims a label, this keeps it black and
//     lets size and weight carry the rank.
//   · Safety hues only, and only where they mean something: green for a
//     boundary, red for a wicket, yellow for "you are here".
//
// Same KEYS as the other two, so every screen in the app inherits it without a
// single per-screen change — the tokens are the whole interface.
const sunlight = {
  mode: 'sunlight',
  bg: '#ffffff',
  surfaceLow: '#ffffff',
  surface: '#ffffff',
  // Not a fill. A chip in this mode is white with a black border; anything that
  // reads as a "slightly different white" is invisible outdoors.
  surfaceHigh: '#ffffff',
  surfaceHighest: '#ffffff',
  white: '#ffffff',
  // Boundary green, dark enough to hold its own text at 8.6:1 on white while
  // still reading as green rather than as black.
  lime: '#006400',
  limeBright: '#008000',
  lime2: '#006400',
  onLime: '#ffffff',
  coral: '#d00000',
  wicketBg: '#ffffff',
  wicketText: '#d00000',
  // The whole point of the mode: no washes. A selected row is white with a
  // 2px black border, exactly as the design's "no grays — use a border rather
  // than a tinted background" rule says. Selection reads as the border, and
  // for the striker/active states it reads as inversion.
  tintAccent:       '#ffffff',
  tintAccentStrong: '#ffffff',
  tintDanger:       '#ffffff',
  borderAccent:     '#006400',
  borderDanger:     '#d00000',
  blue: '#000000',        // the brand retired blue; here it collapses to black
  blueDeep: '#000000',
  blueSoft: '#000000',
  onBlue: '#ffffff',
  textPrimary: '#000000',
  // The "muted" tiers are NOT muted. They stay black and the type scale does
  // the work — a grey caption is unreadable in the exact conditions this mode
  // exists for.
  textVariant: '#000000',
  textSecondary: '#000000',
  textMuted: '#000000',
  faint: '#000000',
  onDark: '#ffffff',
  onDarkDim: '#ffffff',
  limeDark: '#006400',
  live: '#d00000',
  danger: '#d00000',
  dangerTxt: '#d00000',
  warn: '#8a5200',
  success: '#006400',
  // Borders carry every separation this mode has, so they are full black.
  border: '#000000',
  line: '#000000',
  overlay: 'rgba(0,0,0,0.6)',
  navy0: '#ffffff',
  navy1: '#ffffff',
  navy2: '#ffffff',
  cell: '#ffffff',
  cellHi: '#ffffff',
  ink: '#000000',
  inkDim: '#000000',
};

export const PALETTES = { dark, light, sunlight };

// ── Sport accent override ─────────────────────────────────────────────────────
// The whole app reads its accent from these palette tokens (DS.lime, DS.accent,
// DS.blueDeep, DS.success …), which are all the same brand green. Recolour just
// that family from the active sport, and EVERY screen that uses the theme turns
// that sport's colour — no per-screen edits. Semantic colours (red for
// wickets/danger, text, surfaces) are untouched. Cricket resolves to the brand
// green, so the flagship is unchanged.
const ACCENT_TOKENS = ['lime', 'limeBright', 'lime2', 'blue', 'blueDeep', 'blueSoft', 'success', 'live2'];

const relLum = (hex) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};
const mix = (hex, target, t) => {
  const h = hex.replace('#', ''); const to2 = (v) => Math.round(v).toString(16).padStart(2, '0');
  const px = (i) => parseInt(h.slice(i, i + 2), 16);
  const tp = target.replace('#', ''); const tx = (i) => parseInt(tp.slice(i, i + 2), 16);
  return '#' + [0, 2, 4].map((i) => to2(px(i) + (tx(i) - px(i)) * t)).join('');
};

export function applySportAccent(base, accent) {
  if (!accent) return base;
  const out = { ...base };
  for (const k of ACCENT_TOKENS) if (out[k] != null) out[k] = accent;
  // Ink that sits ON the accent (button text, chips): pick black or white by the
  // accent's luminance so it stays legible whatever the sport colour is.
  const onAccent = relLum(accent) > 0.6 ? '#0b1a10' : '#ffffff';
  if (out.onLime != null) out.onLime = onAccent;
  if (out.onBlue != null) out.onBlue = onAccent;
  // Subtle accent-tinted fill (limeDark): the accent pushed most of the way to
  // the surface, so it recolours with the sport too instead of staying green.
  if (out.limeDark != null) out.limeDark = mix(accent, base.surface || base.bg, 0.82);
  return out;
}

// Segoe UI look via Selawik — the app-wide font is injected natively (the RN
// Text/TextInput patch maps `Selawik` → the Android `selawik` res/font family and
// the iOS "Selawik" family). Only the Regular face is bundled/registered now —
// every weight resolves to the same flat weight everywhere; hierarchy comes
// from font SIZE, not boldness, so display/headline/body/label are uniform.
export const typographyDark = {
  display: { fontFamily: 'Selawik', fontWeight: '400' },
  headline: { fontFamily: 'Selawik', fontWeight: '400' },
  body: { fontFamily: 'Selawik', fontWeight: '400' },
  label: { fontFamily: 'Selawik', fontWeight: '400' },
};

export const typographyLight = {
  display: { fontFamily: 'Selawik', fontWeight: '400' },
  headline: { fontFamily: 'Selawik', fontWeight: '400' },
  body: { fontFamily: 'Selawik', fontWeight: '400' },
  label: { fontFamily: 'Selawik', fontWeight: '400' },
};

export const radii = {
  sm: 8,
  md: 16,
  lg: 24,
  pill: 999,
};

export const shadows = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8 },
};

export const ThemeContext = createContext({
  mode: 'light',
  pref: 'system',
  colors: light,
  radii,
  shadows,
  typography: typographyLight,
  isDark: false,
  setMode: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }) {
  // `pref` is the user's choice: 'system' | 'light' | 'dark'.
  // Defaulting to 'dark' per user request for the dark mode aesthetic.
  const [pref, setPref] = useState('dark');
  const [sysScheme, setSysScheme] = useState(() => Appearance.getColorScheme() || 'light');

  // Restore the persisted preference on launch (fresh installs default to light).
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') setPref(saved);
    }).catch(() => {});
  }, []);

  // Track the OS theme so 'system' updates live when the device switches.
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSysScheme(colorScheme || 'light'));
    return () => sub?.remove?.();
  }, []);

  const mode = pref === 'system' ? sysScheme : pref;

  // Track the active sport so the accent follows it. The provider is above the
  // navigator and doesn't remount on a sport switch, so it subscribes rather
  // than reading the singleton once.
  const [sportId, setSportId] = useState(() => getSelectedSport().sport?.id || null);
  useEffect(() => subscribeSport((s) => setSportId(s?.id || null)), []);

  const setMode = useCallback((next) => {
    setPref(next);
    // 'sunlight' is deliberately NOT persisted here. It is borrowed by the
    // scoring console for as long as that screen is focused, and ScoringScreen
    // keeps its own preference under its own key. Writing it to the app theme
    // would mean a crash or a force-quit mid-innings leaves the entire app —
    // feed, profile, everything — in a high-contrast scoring skin the user
    // never asked for and has no obvious way to turn off.
    if (next === 'sunlight') return;
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    setPref((cur) => {
      const resolved = cur === 'system' ? (Appearance.getColorScheme() || 'light') : cur;
      const next = resolved === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  // Cricket → brand green (null accent = palette untouched); other sports →
  // their signature colour, theme-corrected.
  const accent = sportId && sportId !== 'cricket' ? sportColor(sportId, mode === 'dark') : null;
  const colors = useMemo(() => applySportAccent(PALETTES[mode], accent), [mode, accent]);

  const value = useMemo(() => ({
    mode,
    pref,
    colors,
    radii,
    shadows,
    typography: mode === 'dark' ? typographyDark : typographyLight,
    isDark: mode === 'dark',
    sportId,
    setMode,
    toggle,
  }), [mode, pref, colors, sportId, setMode, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function ForcedDarkThemeProvider({ children }) {
  const current = useContext(ThemeContext);
  
  // Only override if the current mode is not dark.
  const value = useMemo(() => {
    if (current.isDark) return current;
    
    // For sport accent overriding in forced dark mode:
    const accent = current.sportId && current.sportId !== 'cricket' ? sportColor(current.sportId, true) : null;
    const darkColors = applySportAccent(PALETTES.dark, accent);
    
    return {
      ...current,
      mode: 'dark',
      isDark: true,
      colors: darkColors,
      typography: typographyDark,
    };
  }, [current]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Build (and memoise) a StyleSheet from the current palette. */
export function useThemedStyles(factory) {
  const { colors, typography, radii, shadows } = useContext(ThemeContext);
  return useMemo(() => factory(colors, typography, radii, shadows), [factory, colors, typography, radii, shadows]);
}

/** Arena/Rummy palette — same theme but with the brighter lime accent. */
export function useArenaColors() {
  const { colors } = useContext(ThemeContext);
  return useMemo(() => ({ ...colors, lime: colors.limeBright }), [colors]);
}

/** Build a StyleSheet from the Arena (bright-lime) palette. */
export function useArenaStyles(factory) {
  const colors = useArenaColors();
  return useMemo(() => factory(colors), [factory, colors]);
}
