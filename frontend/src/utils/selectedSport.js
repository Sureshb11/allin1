/**
 * Simple module-level singleton to share the sport/format selection
 * from SportSetupScreen to HomeScreen without relying on React Navigation
 * initialParams chains (which break when navigators reuse cached state).
 */

let _sport  = null;
let _format = null;

export const setSelectedSport = (sport, format) => {
  _sport  = sport  || null;
  _format = format || null;
};

export const getSelectedSport = () => ({ sport: _sport, format: _format });
