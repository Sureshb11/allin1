// AllIn1 Cricket — Design System
// Colors derived from local-legends.jsx cricket sport palette

export const Colors = {
  // ── Primary — Cricket Green (from local-legends: sportColor = "#2d7a3a") ──
  primary:      '#2d7a3a',
  primaryDark:  '#1e5a29',
  primaryLight: '#4a9a57',

  // ── Secondary / Navy — headers, sidebar ──────────────────────────────────
  secondary:      '#16213E',
  secondaryMid:   '#1A2744',
  secondaryLight: '#243B6E',

  // ── Sport Light — card tints (local-legends: colorLight = "#eaf5ec") ─────
  sportLight: '#eaf5ec',

  // ── Accent — gold badges, premium ────────────────────────────────────────
  accent:      '#E6B800',
  accentLight: '#FFF3B0',

  // ── Status ───────────────────────────────────────────────────────────────
  success:   '#10B981',
  successBg: '#D1FAE5',
  warning:   '#F59E0B',
  warningBg: '#FEF3C7',
  error:     '#EF4444',
  errorBg:   '#FEE2E2',
  live:      '#EF4444',

  // ── Neutrals (local-legends bg: #f7f8f3) ─────────────────────────────────
  background: '#f7f8f3',
  surface:    '#FFFFFF',
  surfaceAlt: '#eaf5ec',    // cricket light green tint

  // ── Text ─────────────────────────────────────────────────────────────────
  textPrimary:   '#111111',
  textSecondary: '#555555',
  textTertiary:  '#888888',
  textInverse:   '#FFFFFF',
  textMuted:     '#BBBBBB',

  // ── Border ───────────────────────────────────────────────────────────────
  border:      '#E8EBE0',
  borderLight: '#F0F2EC',

  // ── Overlay ──────────────────────────────────────────────────────────────
  overlay:      'rgba(0,0,0,0.50)',
  overlayLight: 'rgba(0,0,0,0.15)',
};

export const Typography = {
  display:     { fontSize: 34, fontWeight: '900', letterSpacing: -0.8 },
  h1:          { fontSize: 28, fontWeight: '800', letterSpacing: -0.4 },
  h2:          { fontSize: 22, fontWeight: '700' },
  h3:          { fontSize: 18, fontWeight: '600' },
  h4:          { fontSize: 16, fontWeight: '600' },
  body:        { fontSize: 16, fontWeight: '400', lineHeight: 24 },
  bodyMed:     { fontSize: 16, fontWeight: '500' },
  bodyBold:    { fontSize: 16, fontWeight: '700' },
  small:       { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  smallMed:    { fontSize: 14, fontWeight: '500' },
  smallBold:   { fontSize: 14, fontWeight: '700' },
  caption:     { fontSize: 12, fontWeight: '400' },
  captionBold: { fontSize: 12, fontWeight: '600' },
  label:       { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
};

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

export const Radius = {
  sm:   6,
  md:   10,
  lg:   16,
  xl:   24,
  full: 999,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.13,
    shadowRadius: 14,
    elevation: 7,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
};
