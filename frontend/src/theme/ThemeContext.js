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
  lime: '#ccff00',      // Radium Green
  limeBright: '#c3f400',
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
  success: '#ccff00',
  border: 'rgba(204,255,0,0.2)', // Radium Green 20%
  line: 'rgba(204,255,0,0.1)',
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

// ── LIGHT (Premium Sporty 2 - Vivid Match) ──────────────────────────────────
const light = {
  mode: 'light',
  bg: '#f3f5f8',
  surfaceLow: '#f6f8fa',
  surface: '#ffffff',
  surfaceHigh: '#eef1f5',
  surfaceHighest: '#e8ecf1',
  white: '#ffffff',
  lime: '#406900',       // Pitch grass green
  limeBright: '#bdf37b',
  lime2: '#447000',
  onLime: '#ffffff',
  coral: '#e63946',
  wicketBg: 'rgba(230,57,70,0.12)',
  wicketText: '#e63946',
  blue: '#305ce1',
  blueDeep: '#0041c8',
  blueSoft: '#305ce1',
  onBlue: '#ffffff',
  textPrimary: '#191c1e',
  textVariant: '#434656',
  textSecondary: '#434656',
  textMuted: '#5d6070',
  faint: '#d8dadc',
  onDark: '#ffffff',
  onDarkDim: '#e0e3e5',
  limeDark: '#447000',
  live: '#ba1a1a',
  danger: '#ba1a1a',
  dangerTxt: '#ba1a1a',
  warn: '#f59e0b',
  success: '#10b981',
  border: '#c3c5d9',
  line: '#c3c5d9',
  overlay: 'rgba(0,0,0,0.4)',
  navy0: '#ffffff',
  navy1: '#f7f9fb',
  navy2: '#f2f4f6',
  cell: '#ffffff',
  cellHi: '#f7f9fb',
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
