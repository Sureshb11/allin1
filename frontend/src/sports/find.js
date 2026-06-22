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
  basketball:  { title: 'Find Basketball Players', roles: ['Guard', 'Forward', 'Center'] },
  kabaddi:     { title: 'Find Kabaddi Players',    roles: ['Raider', 'Defender', 'All-rounder'] },
  hockey:      { title: 'Find Hockey Players',     roles: ['Forward', 'Midfielder', 'Defender', 'Goalkeeper'] },
  volleyball:  { title: 'Find Volleyball Players', roles: ['Setter', 'Spiker', 'Libero', 'Blocker'] },
  handball:    { title: 'Find Handball Players',   roles: ['Goalkeeper', 'Back', 'Wing', 'Pivot'] },
  khokho:      { title: 'Find Kho-Kho Players',    roles: ['Chaser', 'Runner', 'Defender'] },
  boxing:      { title: 'Find Boxers',    roles: ['Lightweight', 'Welterweight', 'Middleweight', 'Heavyweight'] },
  wrestling:   { title: 'Find Wrestlers', roles: ['Freestyle', 'Greco-Roman'] },
  judo:        { title: 'Find Judokas',   roles: ['Lightweight', 'Middleweight', 'Heavyweight'] },
  karate:      { title: 'Find Karatekas', roles: ['Kumite', 'Kata'] },
  skateboard:   { title: 'Find Skaters',    roles: ['Street', 'Park', 'Vert'] },
};

export const getFind = (sport) => FIND_CONFIG[sport] || FIND_CONFIG.cricket;

export default { FIND_CONFIG, getFind };
