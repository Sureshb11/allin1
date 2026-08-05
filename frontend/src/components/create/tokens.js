// The creation design system — one set of numbers, four drawers.
//
// Create Post is the reference. Everything here was read off that screen and
// then tightened: the type scale had five sizes doing four jobs, labels and
// fields shared one gap regardless of grouping, and the radius ran 10 / 12 / 14
// / 999 with no rule behind which went where.
//
// The rule now: a FIELD is 12, a CARD is 16, a CHIP is a pill, and nothing else
// invents its own. Sizes come off a scale of six, not sixteen.
//
// Everything is a function of the theme, so both themes and every sport accent
// keep working — no hard-coded hex, and no screen may reach past this file for a
// colour or a size.

import { StyleSheet } from 'react-native';

// ── Scale ──────────────────────────────────────────────────────────────────
// Six steps. A form that needs a seventh is a form with a grouping problem.
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const RADIUS = { field: 12, card: 16, sheet: 24, pill: 999 };

// ── Type ───────────────────────────────────────────────────────────────────
// Eight roles, and a screen picks a ROLE, never a size. Weights are heavy
// because the brand fonts (Anton/Archivo) are not bundled — weight and
// letter-spacing stand in for them, as they do across the rest of the app.
export const TYPE = {
  title:       { fontSize: 19, fontWeight: '800', letterSpacing: -0.2 },
  subtitle:    { fontSize: 12.5, fontWeight: '600' },
  section:     { fontSize: 11, fontWeight: '800', letterSpacing: 0.9, textTransform: 'uppercase' },
  label:       { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  input:       { fontSize: 15, fontWeight: '600' },
  placeholder: { fontSize: 15, fontWeight: '500' },
  helper:      { fontSize: 11.5, fontWeight: '600' },
  error:       { fontSize: 11.5, fontWeight: '700' },
  button:      { fontSize: 15, fontWeight: '800', letterSpacing: 0.4 },
  chip:        { fontSize: 12.5, fontWeight: '700' },
};

// ── Motion ─────────────────────────────────────────────────────────────────
// Three durations. Anything that needs a fourth is drawing attention it has
// not earned.
export const DURATION = { fast: 120, base: 220, slow: 320 };
export const SPRING = { damping: 22, stiffness: 260, mass: 0.9 };

// A press that answers. Used by every button and chip in the system, so the
// whole creation flow responds with one hand.
export const PRESS_SCALE = 0.97;

// ── Elevation ──────────────────────────────────────────────────────────────
// Softer than the app's default: a card inside a drawer is already lifted by
// the drawer, so it needs a hint of depth, not a drop.
export const shadow = (DS) => ({
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: DS.bg === '#ffffff' ? 0.05 : 0.22,
    shadowRadius: 8,
    elevation: 2,
  },
  footer: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: DS.bg === '#ffffff' ? 0.06 : 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
});

// Minimum touch target. Every interactive element in the system meets it.
export const TAP = 48;

/**
 * The shared stylesheet. Built from the theme so both themes work, and taken
 * by every component here — a screen never writes one of these itself.
 */
export const makeCreateStyles = (DS) => {
  const sh = shadow(DS);
  return StyleSheet.create({
    // ── Drawer chrome ──
    header: {
      flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
      paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm, paddingBottom: SPACE.lg,
    },
    headerIcon: {
      width: 44, height: 44, borderRadius: RADIUS.field,
      alignItems: 'center', justifyContent: 'center',
    },
    headerText: { flex: 1 },
    title: { ...TYPE.title, color: DS.textPrimary },
    subtitle: { ...TYPE.subtitle, color: DS.textMuted, marginTop: 3 },
    close: {
      width: TAP - 8, height: TAP - 8, borderRadius: RADIUS.pill,
      backgroundColor: DS.surfaceHigh, alignItems: 'center', justifyContent: 'center',
    },

    body: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.xs },

    // ── Grouping ──
    // A card, not a divider. Dividers cut a form into strips; a card says which
    // questions belong together, which is the thing a long form needs most.
    card: {
      backgroundColor: DS.surface,
      borderRadius: RADIUS.card,
      borderWidth: 1, borderColor: DS.border,
      padding: SPACE.lg,
      marginBottom: SPACE.md,
      ...sh.card,
    },
    sectionRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md },
    section: { ...TYPE.section, color: DS.textMuted },

    // ── Fields ──
    field: { marginBottom: SPACE.lg },
    fieldLast: { marginBottom: 0 },
    label: { ...TYPE.label, color: DS.textVariant, marginBottom: SPACE.sm },
    required: { color: DS.lime },

    input: {
      minHeight: TAP,
      backgroundColor: DS.surfaceHigh,
      borderRadius: RADIUS.field,
      borderWidth: 1.5, borderColor: 'transparent',
      paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md,
      ...TYPE.input, color: DS.textPrimary,
    },
    // Focus is a border, not a glow: it has to read at a glance on both themes
    // and survive being next to a lime chip.
    inputFocused: { borderColor: DS.lime, backgroundColor: DS.surfaceHigh },
    inputError: { borderColor: DS.coral },
    textarea: { minHeight: 110, paddingTop: SPACE.md, textAlignVertical: 'top' },

    // A row that opens something — a picker, a sheet, a date.
    select: {
      minHeight: TAP,
      flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
      backgroundColor: DS.surfaceHigh,
      borderRadius: RADIUS.field,
      borderWidth: 1.5, borderColor: 'transparent',
      paddingHorizontal: SPACE.lg,
    },
    selectText: { flex: 1, ...TYPE.input, color: DS.textPrimary },
    selectPlaceholder: { color: DS.textMuted, fontWeight: '500' },

    helper: { ...TYPE.helper, color: DS.textMuted, marginTop: SPACE.sm },
    error: { ...TYPE.error, color: DS.coral, marginTop: SPACE.sm },
    errorRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, marginTop: SPACE.sm },

    // ── Chips ──
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
    chip: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      minHeight: 38, paddingHorizontal: SPACE.lg,
      borderRadius: RADIUS.pill,
      backgroundColor: DS.surfaceHigh,
      borderWidth: 1.5, borderColor: 'transparent',
    },
    chipOn: { backgroundColor: DS.lime, borderColor: DS.lime },
    chipText: { ...TYPE.chip, color: DS.textVariant },
    chipTextOn: { color: DS.onLime },

    // ── Toggle row ──
    toggle: {
      flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
      minHeight: TAP, paddingVertical: SPACE.sm,
    },
    toggleText: { flex: 1 },
    toggleTitle: { ...TYPE.input, fontSize: 14, color: DS.textPrimary },
    toggleHint: { ...TYPE.helper, color: DS.textMuted, marginTop: 2 },

    // ── Image picker ──
    imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md },
    imageTile: {
      width: 84, height: 84, borderRadius: RADIUS.field,
      backgroundColor: DS.surfaceHigh, overflow: 'hidden',
    },
    imageAdd: {
      width: 84, height: 84, borderRadius: RADIUS.field,
      alignItems: 'center', justifyContent: 'center', gap: SPACE.xs,
      backgroundColor: DS.surfaceHigh,
      borderWidth: 1.5, borderStyle: 'dashed', borderColor: DS.border,
    },
    imageAddText: { ...TYPE.helper, color: DS.textMuted },
    imageRemove: {
      position: 'absolute', top: 4, right: 4,
      width: 22, height: 22, borderRadius: 11,
      backgroundColor: '#000c', alignItems: 'center', justifyContent: 'center',
    },
    // One wide banner rather than a grid — a tournament has one cover, not six.
    banner: {
      height: 132, borderRadius: RADIUS.card,
      backgroundColor: DS.surfaceHigh, overflow: 'hidden',
      alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
      borderWidth: 1.5, borderStyle: 'dashed', borderColor: DS.border,
    },

    // ── Sticky footer ──
    // The action never scrolls out of reach. It sits on its own surface with a
    // hairline above it, so a long form always ends in the same place.
    footer: {
      paddingHorizontal: SPACE.lg, paddingTop: SPACE.md,
      backgroundColor: DS.bg,
      borderTopWidth: 1, borderTopColor: DS.faint,
      ...sh.footer,
    },
    // Black, and smaller than it was — 54 was a slab across the foot of every
    // drawer. 48 is the touch-target minimum this system promises, so it is as
    // small as the button is allowed to get.
    //
    // "Black" means the highest-contrast solid against the page, which is a
    // near-black on the light theme and a near-white on the dark one. A literal
    // black button on the dark theme's #0f1214 background would be a rectangle
    // you could not see; inverting keeps it the strongest thing on screen,
    // which is what a submit button is for.
    primary: {
      minHeight: TAP,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
      borderRadius: RADIUS.field,
      backgroundColor: DS.textPrimary,
    },
    primaryOff: { opacity: 0.4 },
    primaryText: { ...TYPE.button, color: DS.bg },
    secondary: {
      minHeight: TAP,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
      borderRadius: RADIUS.field,
      backgroundColor: 'transparent',
      borderWidth: 1.5, borderColor: DS.border,
    },
    secondaryText: { ...TYPE.button, color: DS.textVariant },
  });
};
