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
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'theme:mode';

// ── DARK (the original "Kinetic Athlete" palette) ───────────────────────────
const dark = {
  mode: 'dark',
  // Profile-style roles
  bg: '#0f131f',
  surfaceLow: '#171b28',
  surfaceHigh: '#262a37',
  surfaceHighest: '#313442',
  lime: '#abd600',
  limeBright: '#c4f82a',
  lime2: '#a6e814',
  coral: '#ffb59e',
  blue: '#b7c4ff',
  textPrimary: '#dfe2f3',
  textVariant: '#c3c5d9',
  textSecondary: '#c3c5d9',
  textMuted: '#8d90a2',
  limeDark: '#8ab000',
  live: '#ef4444',
  danger: '#ff5a5a',
  border: 'rgba(150,180,230,0.10)',
  line: 'rgba(150,180,230,0.10)',
  overlay: 'rgba(0,0,0,0.55)',
  // Arena/Rummy-style roles (mapped onto the same surfaces)
  navy0: '#0a0e18',
  navy1: '#0d1320',
  navy2: '#111a2b',
  cell: '#161f30',
  cellHi: '#1d2942',
  ink: '#eaf0fb',
  inkDim: '#8a97b0',
};

// ── LIGHT ───────────────────────────────────────────────────────────────────
const light = {
  mode: 'light',
  bg: '#eef1f7',
  surfaceLow: '#ffffff',
  surfaceHigh: '#ffffff',
  surfaceHighest: '#e9edf5',
  lime: '#5f8a00',
  limeBright: '#6f9e00',
  lime2: '#6f9e00',
  coral: '#c2533a',
  blue: '#3b5bdb',
  textPrimary: '#12151c',
  textVariant: '#3a4150',
  textSecondary: '#3a4150',
  textMuted: '#6b7280',
  limeDark: '#4f7300',
  live: '#dc2626',
  danger: '#dc2626',
  border: 'rgba(20,30,60,0.12)',
  line: 'rgba(20,30,60,0.12)',
  overlay: 'rgba(20,28,48,0.32)',
  navy0: '#e4e9f2',
  navy1: '#eef1f7',
  navy2: '#ffffff',
  cell: '#ffffff',
  cellHi: '#eef1f7',
  ink: '#12151c',
  inkDim: '#6b7280',
};

export const PALETTES = { dark, light };

const ThemeContext = createContext({
  mode: 'dark',
  colors: dark,
  isDark: true,
  setMode: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState('dark');

  // Restore the persisted choice on launch (dark is the default until it loads).
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark') setModeState(saved);
    }).catch(() => {});
  }, []);

  const setMode = useCallback((next) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    setModeState((cur) => {
      const next = cur === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(() => ({
    mode,
    colors: PALETTES[mode],
    isDark: mode === 'dark',
    setMode,
    toggle,
  }), [mode, setMode, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Build (and memoise) a StyleSheet from the current palette. */
export function useThemedStyles(factory) {
  const { colors } = useContext(ThemeContext);
  return useMemo(() => factory(colors), [factory, colors]);
}
