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

// ── DARK (Premium Sporty 1) ─────────────────────────────────────────────────
const dark = {
  mode: 'dark',
  bg: '#131313',
  surfaceLow: '#1c1b1b',
  surface: '#201f1f',
  surfaceHigh: '#2a2a2a',
  surfaceHighest: '#353534',
  white: '#ffffff',
  lime: '#c8e93c',      // Radium Green, softened for dark-mode readability (was #ccff00 — pure neon haloed against the near-black bg when used as text)
  limeBright: '#cdf23c',  // Arena/Rummy accent — softened from pure #c3f400 but kept punchier than `lime`
  lime2: '#abd600',
  onLime: '#161e00',
  coral: '#ffb4ab',
  wicketBg: 'rgba(255,180,171,0.16)',
  wicketText: '#ffb4ab',
  blue: '#b6c4ff',
  blueDeep: '#0055ff',  
  blueSoft: '#b6c4ff',
  onBlue: '#ffffff',
  textPrimary: '#e5e2e1',
  textVariant: '#c4c9ac',
  textSecondary: '#c4c9ac',
  textMuted: '#8e9379',
  faint: '#353534',
  onDark: '#e5e2e1',
  onDarkDim: '#c4c9ac',
  limeDark: '#3c4d00',
  live: '#ffb4ab',
  danger: '#ffb4ab',
  dangerTxt: '#ffb4ab',
  warn: '#ffb24a',
  success: '#c8e93c',
  border: 'rgba(200,233,60,0.2)', // Radium Green (softened) 20%
  line: 'rgba(200,233,60,0.1)',
  overlay: 'rgba(0,0,0,0.8)',
  // Arena fallback roles
  navy0: '#0e0e0e',
  navy1: '#131313',
  navy2: '#1c1b1b',
  cell: '#201f1f',
  cellHi: '#2a2a2a',
  ink: '#e5e2e1',
  inkDim: '#8e9379',
};

// ── LIGHT (Material 3 — navy/red scoreboard palette) ────────────────────────
// Ported from the live-scoring HTML mockup (Material 3 tonal palette:
// primary navy #002f65, secondary red #b71422, boundary-green #009270 for
// sixes). `limeBright`/`navy0-2`/`cell*`/`ink*` are left untouched so the
// Arena honeycomb picker (useArenaColors) keeps its distinct lime-bright look.
const light = {
  mode: 'light',
  bg: '#fcfcfd',            // background — barely off-white, not the grey f8f9fa
  surfaceLow: '#fafbfc',    // surface-container-low — sections / banners
  surface: '#ffffff',       // surface-container-lowest — cards
  surfaceHigh: '#f5f6f7',   // surface-container — chips / inputs / buttons
  surfaceHighest: '#eef0f1',// surface-container-highest / surface-variant — avatars / recess
  white: '#ffffff',
  lime: '#406900',       // Pitch grass green (reverted — navy accent undone)
  limeBright: '#bdf37b',
  lime2: '#447000',
  onLime: '#ffffff',
  coral: '#b71422',       // secondary
  wicketBg: 'rgba(183,20,34,0.12)',
  wicketText: '#b71422',
  blue: '#305ce1',        // reverted — navy accent undone
  blueDeep: '#0041c8',    // reverted — navy accent undone
  blueSoft: '#305ce1',    // reverted — navy accent undone
  onBlue: '#ffffff',
  textPrimary: '#191c1d', // on-surface
  textVariant: '#434750', // on-surface-variant
  textSecondary: '#434750',
  textMuted: '#737781',   // outline
  faint: '#e1e3e4',
  onDark: '#ffffff',
  onDarkDim: '#f0f1f2',
  limeDark: '#447000',    // reverted — navy accent undone
  live: '#e02020',        // live-red
  danger: '#ba1a1a',      // error
  dangerTxt: '#93000a',   // on-error-container
  warn: '#ff4b2b',        // wicket-orange
  success: '#009270',     // boundary-green — SIX
  border: '#c3c6d1',      // outline-variant
  line: '#c3c6d1',
  overlay: 'rgba(0,0,0,0.4)',
  navy0: '#f8fafc',   // arena/rummy page bg — off-white to match the app (was pure #ffffff)
  navy1: '#fdfdff',
  navy2: '#f6f8fb',
  cell: '#ffffff',    // arena cards / discs stay pure white so they pop
  cellHi: '#fdfdff',
  ink: '#191c1e',
  inkDim: '#434656',
};

export const PALETTES = { dark, light };

export const typographyDark = {
  display: { fontFamily: 'Anybody', fontWeight: '800' },
  headline: { fontFamily: 'Anybody', fontWeight: '700' },
  body: { fontFamily: 'Lexend', fontWeight: '400' },
  label: { fontFamily: 'Lexend', fontWeight: '600' },
};

export const typographyLight = {
  display: { fontFamily: 'Hanken Grotesk', fontWeight: '800' },
  headline: { fontFamily: 'Hanken Grotesk', fontWeight: '700' },
  body: { fontFamily: 'Inter', fontWeight: '400' },
  label: { fontFamily: 'Hanken Grotesk', fontWeight: '600' },
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
