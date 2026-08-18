// Shot silhouettes — the artwork registry.
//
// Metro resolves `require` for images at build time, so this cannot be a loop
// over a list of keys; every path has to appear literally. That is the whole
// reason this file exists rather than a `require('../assets/shots/' + key)`
// one-liner, which would bundle nothing and fail at runtime.
//
// The art is a solid black silhouette on transparency, which is what lets a
// single file serve every theme: `tintColor` recolours it, so the same asset is
// black on the sunlight console, near-white in dark mode, and the surface
// colour when a tile is selected. See components/BatsmanAvatar.js.
//
// Left-handers are the mirror of these, applied at render time — a left-hander's
// cover drive is the same stroke facing the other way.

const ART = {
  backFootDefence: require('../../assets/shots/backFootDefence.png'),
  backFootPunch:   require('../../assets/shots/backFootPunch.png'),
  coverDrive:      require('../../assets/shots/coverDrive.png'),
  cut:             require('../../assets/shots/cut.png'),
  defensive:       require('../../assets/shots/defensive.png'),
  drive:           require('../../assets/shots/drive.png'),
  flick:           require('../../assets/shots/flick.png'),
  helicopter:      require('../../assets/shots/helicopter.png'),
  hook:            require('../../assets/shots/hook.png'),
  legGlance:       require('../../assets/shots/legGlance.png'),
  offDrive:        require('../../assets/shots/offDrive.png'),
  onDrive:         require('../../assets/shots/onDrive.png'),
  pull:            require('../../assets/shots/pull.png'),
  ramp:            require('../../assets/shots/ramp.png'),
  reverseScoop:    require('../../assets/shots/reverseScoop.png'),
  reverseSweep:    require('../../assets/shots/reverseSweep.png'),
  scoop:           require('../../assets/shots/scoop.png'),
  slogSweep:       require('../../assets/shots/slogSweep.png'),
  straightDrive:   require('../../assets/shots/straightDrive.png'),
  sweep:           require('../../assets/shots/sweep.png'),
};

/**
 * The silhouette for a stroke, or null if there is no art for it yet.
 *
 * Returning null rather than substituting a near-enough shot is deliberate: a
 * square drive drawn with the cover drive's picture teaches the scorer the
 * wrong thing, and they will pick the wrong one at speed. Strokes without art
 * fall back to a neutral mark and their label.
 */
export const shotArt = (key) => ART[key] || null;

/** Which strokes still need artwork. Handy when adding a batch. */
export const missingArt = (keys) => keys.filter((k) => !ART[k]);

export default { shotArt, missingArt };
