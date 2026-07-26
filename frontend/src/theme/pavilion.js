// Pavilion "Charcoal + Lime" control palette.
//
// The redesign uses near-black controls with a bright cricket-green accent. The
// app's own `ink` token is a FOREGROUND colour (it flips to near-white in dark
// mode), so it can't be the pill/button fill — these values are deliberately
// dark in BOTH themes, with a green that stays legible on top either way.
//
//   const P = pav(DS);
//   P.control  → near-black pill / primary button fill (both themes)
//   P.accent   → bright cricket-green, reads on `control` in light AND dark
//   P.track    → the segmented container the pill slides inside
//   P.chipOff  → an unselected L3 chip fill
export const pav = (DS) => {
  const dark = DS.mode === 'dark';
  return {
    control: dark ? '#12161a' : '#15191e',   // charcoal pill / primary button
    controlPress: dark ? '#0a0d10' : '#0c0f12',
    onControl: '#ffffff',                     // primary label on the black control
    accent: '#3ecf6e',                        // bright green — legible on black in both themes
    accentSoft: 'rgba(62,207,110,0.16)',
    track: dark ? '#262c31' : '#e8ebee',      // segmented container (pill contrasts against it)
    chipOff: dark ? '#181c1f' : '#f4f6f7',    // unselected chip fill
    chipBorder: DS.border,
    textOff: DS.textMuted,                    // unselected label
    live: DS.live,                            // keep the semantic live-red for Go Live
  };
};

export default pav;
