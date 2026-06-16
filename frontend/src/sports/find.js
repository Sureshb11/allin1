// Per-sport "Find players" config (screen title + role chips) for FindCricketersScreen.
// Add a sport here for custom roles; unknown sports fall back to cricket.
export const FIND_CONFIG = {
  cricket:   { title: 'Find Cricketers',  roles: ['Batter', 'Bowler', 'All-rounder', 'Wicketkeeper'] },
  football:  { title: 'Find Footballers', roles: ['Striker', 'Midfielder', 'Defender', 'Goalkeeper'] },
  badminton: { title: 'Find Players',     roles: ['Singles', 'Doubles'] },
  tennis:      { title: 'Find Tennis Players', roles: ['Singles', 'Doubles'] },
  tabletennis: { title: 'Find TT Players',     roles: ['Singles', 'Doubles'] },
  squash:      { title: 'Find Squash Players', roles: ['Singles'] },
  pickleball:  { title: 'Find Pickleball Players', roles: ['Singles', 'Doubles'] },
};

export const getFind = (sport) => FIND_CONFIG[sport] || FIND_CONFIG.cricket;

export default { FIND_CONFIG, getFind };
