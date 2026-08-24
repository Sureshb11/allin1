// The 18 canonical sports supported by the application.
// This serves as the authoritative backend registry for sport configurations.

const INDIVIDUAL_SPORTS = new Set([
  'badminton',
  'boxing',
  'judo',
  'karate',
  'pickleball',
  'skateboard',
  'squash',
  'tabletennis',
  'tennis',
  'wrestling'
]);

const TEAM_SPORTS = new Set([
  'basketball',
  'cricket',
  'football',
  'handball',
  'hockey',
  'kabaddi',
  'khokho',
  'volleyball'
]);

/**
 * Returns the expected participant type ('PLAYER' or 'TEAM') for a given sport ID.
 * Returns null if the sport is unrecognized.
 */
function getSportParticipantType(sportId) {
  if (INDIVIDUAL_SPORTS.has(sportId)) {
    return 'PLAYER';
  }
  if (TEAM_SPORTS.has(sportId)) {
    return 'TEAM';
  }
  return null;
}

// ESM: the backend is "type": "module", so `module.exports` here was never
// defined at runtime — importing this file threw, and every caller that reached
// it 500'd or fell into a generic 400.
export { INDIVIDUAL_SPORTS, TEAM_SPORTS, getSportParticipantType };
