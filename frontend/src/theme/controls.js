import { StyleSheet } from 'react-native';

// The Pavilion control language, in one place.
//
// Pavilion (My Stats / Rankings / Scout) is the finished design: a deep-green
// pill for the level-1 tabs, a pale-green segment for a local view-mode toggle,
// an underline for a filter, and a hairline-bordered white card. Home and its
// tabs each had their OWN version of those four things — Home's nav was an
// icon-over-label tile with a lime glow, Teams' tab bar was a lime fill with
// `DS.bg` text, Tournaments' filters were lime chips — so the same control did
// the same job at three different sizes, weights and colours.
//
// These are the Pavilion values, lifted exactly. Anything that wants a tab, a
// toggle, a filter or a card reads them from here, so the next change to the
// language happens once instead of four times.
//
//   const C = useThemedStyles(makeControls);
//
// The light values are the literal Pavilion hexes, unchanged — those screens are
// signed off and this file is not the place to redecorate them. What's new is
// that they no longer apply in the dark theme, where slate-on-charcoal was
// unreadable and a #f1f5f9 fill was a white slab. Dark maps each role onto the
// palette that already flips.
const LIGHT = {
  green:     '#0f4c3a',   // active pill fill / underline / selected label
  greenSoft: '#e6f4ea',   // selected segment fill
  onGreen:   '#ffffff',   // label on the deep-green fill
  grey:      '#f1f5f9',   // inactive pill / segment fill
  slate:     '#475569',   // inactive label
  hairline:  '#e2e8f0',   // rule under a filter bar
};

export const controlColors = (DS) => (DS.mode === 'dark' ? {
  green:     DS.lime,
  greenSoft: DS.lime + '26',
  onGreen:   DS.onLime,
  grey:      DS.surfaceHigh,
  slate:     DS.textVariant,
  hairline:  DS.border,
} : LIGHT);

export const makeControls = (DS) => {
  const CONTROL = controlColors(DS);
  return StyleSheet.create({
  /* ── L1: top-level tabs (Pavilion's My Stats / Rankings / Scout) ───────────
     A row of separate pills. Active is the deep green with its icon; inactive
     is the grey fill, label only. */
  navRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  navPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999,
  },
  navPillActive: { backgroundColor: CONTROL.green },
  navPillInactive: { backgroundColor: CONTROL.grey },
  navPillText: { fontSize: 15, fontWeight: '900', letterSpacing: 0.2 },
  // Equal-width variant, for a row that has to fit the longest label a sport
  // uses rather than sizing to its content. Three pills on a 411dp screen:
  // 118dp each, less 12 padding, 14 icon and 5 gap, leaves 87dp. "TOURNAMENTS"
  // measures ~90dp at 12 and ~82 at 11 — measured off a screenshot, because the
  // arithmetic estimate said 82 at 12 and it clipped anyway. At four tabs the
  // budget was ~46dp and it clipped to "TOURNAMEN".
  //
  // adjustsFontSizeToFit is on the label as a backstop but does NOT rescue this
  // on Android, so the size has to be right on its own.
  //
  // Every pill carries its icon, not just the selected one as Pavilion does.
  // With icon-on-active the label budget SHRINKS by 19dp the moment you tap a
  // tab, so a label can fit while inactive and clip while active — which is
  // exactly how this broke before. A constant budget can't do that.
  navPillTight: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingHorizontal: 6, paddingVertical: 10, borderRadius: 999,
  },
  navPillTextTight: { fontSize: 11, fontWeight: '900', letterSpacing: 0, flexShrink: 1 },

  /* ── L2: local view-mode toggle (Rankings' Players / Teams) ────────────────
     Equal-width buttons on their own fill; the selected one goes pale green
     with a deep-green label. */
  segment: { flex: 1, flexDirection: 'row', gap: 8 },
  segBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 10, borderRadius: 999, backgroundColor: CONTROL.grey,
  },
  segBtnOn: { backgroundColor: CONTROL.greenSoft },
  segText: { fontSize: 14, fontWeight: '600', color: CONTROL.slate },
  segTextOn: { color: CONTROL.green, fontWeight: 'bold' },
  // The count bubble Teams carries on each tab.
  segCount: { minWidth: 20, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 999, backgroundColor: '#ffffff', alignItems: 'center' },
  segCountOn: { backgroundColor: CONTROL.green },
  segCountText: { fontSize: 10.5, fontWeight: '800', color: CONTROL.slate },
  segCountTextOn: { color: CONTROL.onGreen },

  /* ── L3: filters (Rankings' boards) ────────────────────────────────────────
     Not a pill — an underline. A filter row sits under the control it filters,
     so it reads as a subdivision rather than a second set of tabs. */
  filterBar: {
    paddingHorizontal: 16, gap: 24, paddingBottom: 0,
    borderBottomWidth: 1, borderBottomColor: CONTROL.hairline, marginBottom: 16,
  },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  filterChipActive: { borderBottomColor: CONTROL.green },
  filterText: { fontSize: 12, fontWeight: '600', color: CONTROL.slate },
  filterTextActive: { color: CONTROL.green, fontWeight: 'bold' },
  // How many rows sit behind this filter. The number belongs on the chip, not
  // in a separate "N matches" line under the bar — one control, one place to
  // look. Only for lists scoped to one person; a board over every player in the
  // app can't count itself and shouldn't try.
  filterCount: {
    minWidth: 17, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 999,
    backgroundColor: CONTROL.grey, alignItems: 'center',
  },
  filterCountOn: { backgroundColor: CONTROL.green },
  filterCountText: { fontSize: 10, fontWeight: '800', color: CONTROL.slate, fontVariant: ['tabular-nums'] },
  filterCountTextOn: { color: CONTROL.onGreen },

  /* ── Search ────────────────────────────────────────────────────────────────
     Collapsed to its icon until wanted, taking the row when it is. */
  searchBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.faint,
  },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 40,
    backgroundColor: DS.surfaceHigh, borderRadius: 999, paddingHorizontal: 14,
    borderWidth: 1, borderColor: DS.lime,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600', color: DS.textPrimary, padding: 0 },
  // Always-on variant: a search box that lives above a filter bar rather than
  // collapsing into an icon. Matches, Teams and Tournaments each had their own —
  // same three declarations at 8/10/10 radius, 13/13/14pt, one with a shadow.
  searchField: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: DS.faint,
  },
  searchFieldInput: { flex: 1, fontSize: 13, fontWeight: '500', color: DS.textPrimary, padding: 0 },

  /* ── Cards ─────────────────────────────────────────────────────────────────
     One surface, a hairline, a tiny caps label — the career board's chrome. */
  card: {
    backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border,
    paddingHorizontal: 13, paddingVertical: 12, gap: 11,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardLabel: { fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.7 },
  cardMetaText: { fontSize: 11, fontWeight: '700', color: DS.textVariant, fontVariant: ['tabular-nums'] },

  /* ── Buttons ───────────────────────────────────────────────────────────────
     Primary is the same deep green as an active tab, so "the green thing" means
     one thing throughout. */
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, backgroundColor: CONTROL.green,
  },
  btnPrimaryText: { fontSize: 14, fontWeight: '800', color: CONTROL.onGreen, letterSpacing: 0.2 },
  btnGhost: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999,
    backgroundColor: 'transparent', borderWidth: 1.5, borderColor: CONTROL.green,
  },
  btnGhostText: { fontSize: 14, fontWeight: '800', color: CONTROL.green, letterSpacing: 0.2 },

  /* ── FAB ───────────────────────────────────────────────────────────────────
     A rounded rectangle, not a circle — it carries a label. */
  fab: {
    position: 'absolute', right: 20,
    flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingVertical: 15, paddingHorizontal: 22, borderRadius: 18,
    backgroundColor: CONTROL.green,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 14,
    elevation: 8,
  },
  fabText: { fontSize: 14, fontWeight: '800', color: CONTROL.onGreen, letterSpacing: 0.5 },
  });
};

export default makeControls;
