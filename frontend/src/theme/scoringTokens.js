// Live-scoring design tokens — "The Stadium Under Lights".
// Extracted from SportScoringScreen so the per-sport scoring config
// (src/sports/scoring.js) and the screen can share one palette.
//
// `DS` stays the DARK set (used by src/sports/scoring.js for action accent
// colours, which read fine on both themes). The SCREEN uses useScoringColors()
// / useScoringStyles() so its chrome (bg / cards / text) follows light/dark.
import { useMemo } from 'react';
import { useTheme } from './ThemeContext';

export const scoringDark = {
  bg:          '#0f131f',
  cLow:       '#171b28',
  cMid:       '#1b1f2c',
  cHigh:      '#262a37',
  cHighest:   '#313442',
  bright:     '#353946',
  onSurface:  '#dfe2f3',
  onVariant:  '#c3c5d9',
  muted:      '#8d90a2',
  dim:        '#434656',
  primary:    '#b7c4ff',
  pContainer: '#0052ff',
  secondary:  '#ffb59e',
  sContainer: '#ff571a',
  tertiary:   '#abd600',
  tContainer: '#576e00',
  error:      '#ffb4ab',
  errBg:      '#93000a',
  live:       '#ef4444',
};

export const scoringLight = {
  bg:          '#eef1f7',
  cLow:       '#ffffff',
  cMid:       '#f4f6fb',
  cHigh:      '#ffffff',
  cHighest:   '#e9edf5',
  bright:     '#dbe1ec',
  onSurface:  '#12151c',
  onVariant:  '#33394a',
  muted:      '#525a68',
  dim:        '#aab2c0',
  primary:    '#3b5bdb',
  pContainer: '#1e40af',
  secondary:  '#c2533a',
  sContainer: '#ea580c',
  tertiary:   '#5f8a00',
  tContainer: '#dcefb0',
  error:      '#dc2626',
  errBg:      '#fde2e2',
  live:       '#dc2626',
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
