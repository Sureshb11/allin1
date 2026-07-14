// Live-scoring design tokens — "The Stadium Under Lights".
// Extracted from SportScoringScreen so the per-sport scoring config
// (src/sports/scoring.js) and the screen can share one palette.
//
// `DS` stays the DARK set (used by src/sports/scoring.js for action accent
// colours, which read fine on both themes). The SCREEN uses useScoringColors()
// / useScoringStyles() so its chrome (bg / cards / text) follows light/dark.
import { useMemo } from 'react';
import { useTheme } from './ThemeContext';

// Aligned to the app-wide single-accent system: green primary + tertiary, red
// for secondary/error/live, neutral surfaces. No blue.
export const scoringDark = {
  bg:          '#0f1214',
  cLow:       '#14181b',
  cMid:       '#181c1f',
  cHigh:      '#202529',
  cHighest:   '#262c31',
  bright:     '#2a2f34',
  onSurface:  '#eaeced',
  onVariant:  '#a3a9ae',
  muted:      '#767c82',
  dim:        '#4b5158',
  primary:    '#3ecf6e',
  pContainer: '#17331f',
  secondary:  '#ff5b52',
  sContainer: '#331413',
  tertiary:   '#3ecf6e',
  tContainer: '#17331f',
  error:      '#ff5b52',
  errBg:      '#331413',
  live:       '#ff5b52',
};

export const scoringLight = {
  bg:          '#ffffff',
  cLow:       '#ffffff',
  cMid:       '#ffffff',
  cHigh:      '#ffffff',
  cHighest:   '#e8ebee',
  bright:     '#f0f2f3',
  onSurface:  '#131619',
  onVariant:  '#464c52',
  muted:      '#727880',
  dim:        '#9aa0a6',
  primary:    '#0a5227',
  pContainer: '#e7f4ec',
  secondary:  '#c62828',
  sContainer: '#fbe9e8',
  tertiary:   '#0a5227',
  tContainer: '#e7f4ec',
  error:      '#c62828',
  errBg:      '#fbe9e8',
  live:       '#c62828',
};

export const DS = scoringDark;

/** Active scoring palette (follows the app's light/dark mode). */
export function useScoringColors() {
  const { mode } = useTheme();
  return useMemo(() => (mode === 'light' ? scoringLight : scoringDark), [mode]);
}

/** Build a StyleSheet from the active scoring palette. */
export function useScoringStyles(factory) {
  const c = useScoringColors();
  return useMemo(() => factory(c), [factory, c]);
}

export default DS;
