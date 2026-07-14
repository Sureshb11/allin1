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
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'theme:mode';

// ── DARK (night) — ONE green accent, neutral surfaces, red = semantic only ────
// Single-accent system: green carries every action/highlight, red means only
// wicket/live/danger, blue is gone, and all surfaces are neutral (no green haze
// on borders). Mirrors the light theme so the app is consistent in both.
const dark = {
  mode: 'dark',
  bg: '#0f1214',
  surfaceLow: '#14181b',
  surface: '#181c1f',
  surfaceHigh: '#202529',
  surfaceHighest: '#262c31',
  white: '#ffffff',
  lime: '#3ecf6e',        // THE accent — bright green (8.45:1 on the dark card)
  limeBright: '#3ecf6e',
  lime2: '#3ecf6e',
  onLime: '#06210f',      // dark ink reads on the bright-green accent
  coral: '#ff5b52',       // semantic red — wicket / danger / live
  wicketBg: 'rgba(255,91,82,0.16)',
  wicketText: '#ff5b52',
  blue: '#3ecf6e',        // blue removed → folds into the single green accent
  blueDeep: '#3ecf6e',
  blueSoft: '#3ecf6e',
  onBlue: '#06210f',
  textPrimary: '#eaeced',
  textVariant: '#a3a9ae',
  textSecondary: '#a3a9ae',
  textMuted: '#767c82',
  faint: '#262c31',
  onDark: '#eaeced',
  onDarkDim: '#a3a9ae',
  limeDark: '#17331f',
  live: '#ff5b52',
  danger: '#ff5b52',
  dangerTxt: '#ff5b52',
  warn: '#ff5b52',
  success: '#3ecf6e',
  border: '#2a2f34',
  line: '#2a2f34',
  overlay: 'rgba(0,0,0,0.8)',
  // Arena fallback roles (neutral now)
  navy0: '#0f1214',
  navy1: '#14181b',
  navy2: '#181c1f',
  cell: '#181c1f',
  cellHi: '#202529',
  ink: '#eaeced',
  inkDim: '#767c82',
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
  blue: '#0a5227',        // blue removed → folds into the single green accent
  blueDeep: '#0a5227',
  blueSoft: '#0a5227',
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

export const PALETTES = { dark, light };

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

const ThemeContext = createContext({
  mode: 'light',
  pref: 'system',
  colors: light,
  typography: typographyLight,
  isDark: false,
  setMode: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }) {
  // `pref` is the user's choice: 'system' | 'light' | 'dark'. On a fresh install
  // (nothing saved) we force the light theme by default.
  const [pref, setPref] = useState('light');
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

  const setMode = useCallback((next) => {
    setPref(next);
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

  const value = useMemo(() => ({
    mode,
    pref,
    colors: PALETTES[mode],
    typography: mode === 'dark' ? typographyDark : typographyLight,
    isDark: mode === 'dark',
    setMode,
    toggle,
  }), [mode, pref, setMode, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Build (and memoise) a StyleSheet from the current palette. */
export function useThemedStyles(factory) {
  const { colors, typography } = useContext(ThemeContext);
  return useMemo(() => factory(colors, typography), [factory, colors, typography]);
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
