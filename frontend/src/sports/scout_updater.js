const fs = require('fs');

const sports = {
  cricket:   { player: ['Batter', 'Bowler', 'Wicket-keeper', 'All-rounder'] },
  football:  { player: ['Striker', 'Midfielder', 'Defender', 'Goalkeeper'] },
  badminton: { player: ['Singles', 'Doubles'] },
  tennis:      { player: ['Singles', 'Doubles'] },
  tabletennis: { player: ['Singles', 'Doubles'] },
  squash:      { player: ['Singles'] },
  pickleball:  { player: ['Singles', 'Doubles'] },
  basketball:  { player: ['Guard', 'Forward', 'Center'] },
  kabaddi:     { player: ['Raider', 'Defender', 'All-rounder'] },
  hockey:      { player: ['Forward', 'Midfielder', 'Defender', 'Goalkeeper'] },
  volleyball:  { player: ['Setter', 'Spiker', 'Libero', 'Blocker'] },
  handball:    { player: ['Goalkeeper', 'Back', 'Wing', 'Pivot'] },
  khokho:      { player: ['Chaser', 'Runner', 'Defender'] },
  boxing:      { player: ['Lightweight', 'Welterweight', 'Middleweight', 'Heavyweight'] },
  wrestling:   { player: ['Freestyle', 'Greco-Roman'] },
  judo:        { player: ['Lightweight', 'Middleweight', 'Heavyweight'] },
  karate:      { player: ['Kumite', 'Kata'] },
  skateboard:  { player: ['Street', 'Park', 'Vert'] },
};

const defaultSubtypes = {
  team:        ['For a match', 'For a tournament', 'Regular squad'],
  opponent:    ['Friendly', 'Practice match', 'League', 'Tournament'],
  umpire:      ['Referee / Umpire'],
  scorer:      ['Scorer'],
  coach:       ['Coach'],
  tournament:  ['To join', 'Corporate', 'Community', 'Youth'],
  teamtourn:   ['League', 'Knockout', 'Corporate', 'Community'],
  ground:      ['Ground / Court'],
  commentator: ['Commentator'],
};

const defaultFormats = {
  cricket: ['Any', 'T20', 'T10', 'ODI', 'Test', 'The Hundred', 'Box/Turf'],
  football: ['Any', '11-a-side', '7-a-side', '5-a-side', 'Futsal'],
  basketball: ['Any', '5v5', '3x3'],
  hockey: ['Any', '11-a-side', '5-a-side', 'Indoor'],
  volleyball: ['Any', 'Indoor (6v6)', 'Beach (2v2)'],
  handball: ['Any', 'Indoor', 'Beach'],
  kabaddi: ['Any', 'Standard Style', 'Circle Style'],
  khokho: ['Any', 'Standard'],
  badminton: ['Any', 'Singles', 'Doubles', 'Mixed Doubles'],
  tennis: ['Any', 'Singles', 'Doubles', 'Mixed Doubles'],
  tabletennis: ['Any', 'Singles', 'Doubles', 'Mixed Doubles'],
  squash: ['Any', 'Singles', 'Doubles'],
  pickleball: ['Any', 'Singles', 'Doubles', 'Mixed Doubles'],
  boxing: ['Any', 'Amateur', 'Professional'],
  wrestling: ['Any', 'Freestyle', 'Greco-Roman'],
  judo: ['Any', 'Shiai', 'Kata'],
  karate: ['Any', 'Kumite', 'Kata'],
  skateboard: ['Any', 'Street', 'Park', 'Vert'],
};

const cricketSubtypes = {
  player:      ['Batter', 'Bowler', 'Wicket-keeper', 'All-rounder'],
  team:        ['For a match', 'For a tournament', 'Net practice', 'Regular squad'],
  opponent:    ['Friendly', 'Practice match', 'League', 'Tournament'],
  umpire:      ['Club level', 'District level', 'Certified'],
  scorer:      ['Manual', 'Digital / App', 'Live stream'],
  coach:       ['Batting', 'Bowling', 'Fielding', 'Fitness', 'All-round'],
  tournament:  ['To join', 'Corporate', 'Community', 'Youth'],
  teamtourn:   ['League', 'Knockout', 'Corporate', 'Community'],
  ground:      ['Turf', 'Matting', 'Grass', 'Nets'],
  commentator: ['English', 'Regional', 'Live stream'],
};

let output = `// Per-sport Scout / "Looking For" configuration.
// Defines the formats and subtypes (roles) for listings in each sport.

export const SCOUT_CONFIG = {
`;

for (const [sport, info] of Object.entries(sports)) {
  const formats = defaultFormats[sport] || ['Any', 'Friendly', 'Competitive', 'Tournament'];
  const subtypes = sport === 'cricket' ? cricketSubtypes : {
    player: info.player,
    ...defaultSubtypes
  };

  output += `  ${sport}: {
    formats: ${JSON.stringify(formats).replace(/"/g, "'")},
    subtypes: {
`;
  for (const [type, list] of Object.entries(subtypes)) {
    output += `      ${type.padEnd(12)}: ${JSON.stringify(list).replace(/"/g, "'")},\n`;
  }
  output += `    }
  },\n`;
}

output += `};

export const getScout = (sport) => SCOUT_CONFIG[sport] || {
  formats: ['Any', 'Friendly', 'Competitive', 'Tournament'],
  subtypes: {
    player:      ['Player'],
    team:        ['For a match', 'For a tournament', 'Regular squad'],
    opponent:    ['Friendly', 'Practice match', 'League', 'Tournament'],
    umpire:      ['Referee / Umpire'],
    scorer:      ['Scorer'],
    coach:       ['Coach'],
    tournament:  ['To join', 'Corporate', 'Community', 'Youth'],
    teamtourn:   ['League', 'Knockout', 'Corporate', 'Community'],
    ground:      ['Ground / Court'],
    commentator: ['Commentator'],
  }
};

export default { SCOUT_CONFIG, getScout };
`;

fs.writeFileSync('frontend/src/sports/scout.js', output);
