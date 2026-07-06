// Per-sport Home dashboard config (ctaSubtitle, navTabs, quickAccess, features).
// SPORTS = the home sport-switcher list (positional — makeCfg indexes it).
// Add a sport: append to SPORTS and add a custom entry (or it gets makeCfg defaults).

export const SPORTS = [
  { id: 'cricket',      name: 'Cricket',           icon: 'cricket',              color: '#2d7a3a' },
  { id: 'kabaddi',      name: 'Kabaddi',            icon: 'run-fast',             color: '#b45309' },
  { id: 'football',     name: 'Football',           icon: 'soccer',               color: '#1a5fa8' },
  { id: 'badminton',    name: 'Badminton',          icon: 'badminton',            color: '#0d7c8f' },
  { id: 'hockey',       name: 'Hockey',             icon: 'hockey-sticks',        color: '#1a6b8a' },
  { id: 'wrestling',    name: 'Wrestling',          icon: 'arm-flex',             color: '#7f1d1d' },
  { id: 'boxing',       name: 'Boxing',             icon: 'boxing-glove',         color: '#b91c1c' },
  { id: 'tennis',       name: 'Tennis',             icon: 'tennis',               color: '#4d7c0f' },
  { id: 'tabletennis',  name: 'Table Tennis',       icon: 'table-tennis',         color: '#0e7490' },
  { id: 'basketball',   name: 'Basketball',         icon: 'basketball',           color: '#c2490d' },
  { id: 'volleyball',   name: 'Volleyball',         icon: 'volleyball',           color: '#7c3aed' },
  { id: 'khokho',       name: 'Kho-Kho',            icon: 'run',                  color: '#a16207' },
  { id: 'judo',         name: 'Judo',               icon: 'karate',               color: '#3b2f6e' },
  { id: 'karate',       name: 'Karate',             icon: 'karate',               color: '#7c1d1d' },
  { id: 'squash',       name: 'Squash',             icon: 'racquetball',          color: '#92400e' },
  { id: 'handball',     name: 'Handball',           icon: 'handball',             color: '#b54d9e' },
  { id: 'pickleball',   name: 'Pickleball',         icon: 'table-tennis',         color: '#0f766e' },
  { id: 'skateboard',    name: 'Skateboarding',       icon: 'skateboard',            color: '#1e40af' },
];

// Generate a default config for any sport
const makeCfg = (sport, matchLabel, ctaSubtitle, features, emptyTitle, emptySub) => ({
  ctaSubtitle,
  navTabs: [
    { label: matchLabel, icon: sport.icon,                          screen: null },
    { label: 'TEAMS',    icon: 'account-group-outline',            screen: null },
    { label: 'LEAGUES',  icon: 'trophy-outline',                   screen: null },
    { label: 'STATS',    icon: 'chart-bar',                        screen: null },
  ],
  // Every entry navigates somewhere real — no dead (screen: null) tiles.
  // `primary` renders as the solid electric-blue Action-Taker tile.
  quickAccess: [
    { label: 'Start a Match',  icon: 'play-circle',  screen: 'StartMatch', primary: true },
    { label: 'My Performance', icon: 'chart-line',   screen: 'MyPerformance' },
    { label: 'My Matches',     icon: sport.icon,     screen: 'MyMatches' },
  ],
  features,
  emptyTitle,
  emptySub,
});

// Build sport configs lazily from the SPORTS array so every sport has a config.
// Look up by id (order-independent) so reordering/removing sports can't shift configs.
const byId = (id) => SPORTS.find((s) => s.id === id) || SPORTS[0];
const _buildConfigs = () => {
  const custom = {
    cricket: {
      ctaSubtitle: 'Ball-by-ball live scoring',
      navTabs: [
        { label: 'MATCHES',     icon: 'cricket',                          screen: null },
        { label: 'TEAMS',       icon: 'account-group-outline',            screen: null },
        { label: 'TOURNAMENTS', icon: 'trophy-outline',                   screen: null },
        { label: 'STATS',       icon: 'chart-bar',                        screen: null },
      ],
      // Live Scores (dead) + Insights (duplicate of STATS) removed — every tile
      // navigates to a working screen. Start-a-Match is the blue primary tile.
      quickAccess: [
        { label: 'Toss & Play', icon: 'play-circle', screen: 'StartMatch', primary: true },
        { label: 'My Performance',        icon: 'chart-line',  screen: 'MyPerformance' },
        { label: 'My Matches',            icon: 'cricket',     screen: 'MyMatches' },
      ],
      features: [
        { label: 'Toss & Lineup', icon: 'format-list-checks', desc: 'Set playing XI & toss' },
        { label: 'DRS Review',    icon: 'eye-outline',         desc: 'Track review usage' },
        { label: 'Over Stats',    icon: 'chart-timeline',      desc: 'Over-by-over breakdown' },
        { label: 'Wagon Wheel',   icon: 'chart-donut',         desc: 'Shot visualization' },
      ],
      emptyTitle: 'No live cricket matches',
      emptySub: 'Start a match and score ball-by-ball',
    },
    football: makeCfg(byId('football'), 'MATCHES', 'Track goals, cards & assists live', [
      { label: 'Goal Tracker',   icon: 'soccer',       desc: 'Goals, assists & cards' },
      { label: 'Formations',     icon: 'dots-grid',    desc: 'Tactical lineup view' },
      { label: 'Half Time',      icon: 'clock-outline', desc: 'Period breakdown' },
      { label: 'Player Ratings', icon: 'star-outline', desc: 'Rate your players' },
    ], 'No live football matches', 'Start a match and track goals live'),
    basketball: makeCfg(byId('basketball'), 'GAMES', 'Track points, fouls & rebounds', [
      { label: 'Point Tracker', icon: 'basketball',      desc: '2-pt, 3-pt, free throws' },
      { label: 'Foul Counter',  icon: 'hand-back-left',  desc: 'Personal & technical fouls' },
      { label: 'Quarter Stats', icon: 'chart-timeline',  desc: 'Quarter-by-quarter scores' },
      { label: 'Box Score',     icon: 'table',           desc: 'Full player stats table' },
    ], 'No live basketball games', 'Start a game and track every basket'),
    tennis: makeCfg(byId('tennis'), 'MATCHES', 'Track sets, games & points', [
      { label: 'Set Tracker', icon: 'tennis',           desc: 'Games & points per set' },
      { label: 'Serve Stats', icon: 'arrow-right-bold', desc: 'Aces, faults & %' },
      { label: 'Tiebreak',    icon: 'timer-outline',    desc: 'Auto tiebreak rules' },
      { label: 'Match Stats', icon: 'chart-bar',        desc: 'Winners & unforced errors' },
    ], 'No live tennis matches', 'Start a match and track every point'),
    volleyball: makeCfg(byId('volleyball'), 'MATCHES', 'Track sets, rallies & rotations', [
      { label: 'Set Tracker',    icon: 'volleyball',    desc: 'Points per set (best of 5)' },
      { label: 'Serve Rotation', icon: 'rotate-right',  desc: 'Auto rotation tracking' },
      { label: 'Libero Track',   icon: 'account-outline', desc: 'Libero substitution rules' },
      { label: 'Rally Stats',    icon: 'chart-bar',     desc: 'Kills, blocks & errors' },
    ], 'No live volleyball matches', 'Start a match and track every rally'),
    badminton: makeCfg(byId('badminton'), 'MATCHES', 'Track games, sets & rallies', [
      { label: 'Game Tracker', icon: 'badminton',       desc: 'Points per game' },
      { label: 'Serve Track',  icon: 'arrow-right-bold', desc: 'Service faults & aces' },
      { label: 'Set Winner',   icon: 'trophy-outline',  desc: 'Best of 3 or 5 sets' },
      { label: 'Rally Stats',  icon: 'chart-bar',       desc: 'Rally length & winners' },
    ], 'No live badminton matches', 'Start a match and track every rally'),
    tabletennis: makeCfg(byId('tabletennis'), 'MATCHES', 'Track games & points live', [
      { label: 'Point Tracker', icon: 'table-tennis',   desc: 'Points per game' },
      { label: 'Serve Order',   icon: 'swap-horizontal', desc: 'Alternate serve tracking' },
      { label: 'Game Winner',   icon: 'trophy-outline', desc: 'Best of 5 or 7 games' },
      { label: 'Match Stats',   icon: 'chart-bar',      desc: 'Winners & errors' },
    ], 'No live table tennis matches', 'Start a match and track every point'),
    hockey: makeCfg(byId('hockey'), 'MATCHES', 'Track goals, cards & penalty corners', [
      { label: 'Goal Tracker',  icon: 'hockey-sticks',  desc: 'Goals & assists' },
      { label: 'Card Tracker',  icon: 'card-outline',   desc: 'Yellow & red cards' },
      { label: 'Quarter Stats', icon: 'chart-timeline', desc: 'Quarter-by-quarter' },
      { label: 'Penalty Corner', icon: 'flag-outline',  desc: 'PC attempts & goals' },
    ], 'No live hockey matches', 'Start a match and score every goal'),
    kabaddi: makeCfg(byId('kabaddi'), 'MATCHES', 'Track raids, tackles & points', [
      { label: 'Raid Tracker',  icon: 'run-fast',       desc: 'Raid points per player' },
      { label: 'Tackle Stats',  icon: 'hand-back-left', desc: 'Tackle points' },
      { label: 'Half Stats',    icon: 'chart-timeline', desc: 'First & second half' },
      { label: 'Team Points',   icon: 'chart-bar',      desc: 'Live score board' },
    ], 'No live kabaddi matches', 'Start a match and track every raid'),
    khokho: makeCfg(byId('khokho'), 'MATCHES', 'Track turns, chasing & points', [
      { label: 'Turn Tracker',  icon: 'run',            desc: 'Chase & defence turns' },
      { label: 'Point Log',     icon: 'chart-bar',      desc: 'Points per turn' },
      { label: 'Time Tracker',  icon: 'timer-outline',  desc: 'Each turn duration' },
      { label: 'Team Stats',    icon: 'account-group-outline', desc: 'Player contributions' },
    ], 'No live Kho-Kho matches', 'Start a match and track every turn'),
    boxing: makeCfg(byId('boxing'), 'BOUTS', 'Track rounds, punches & knockdowns', [
      { label: 'Round Tracker', icon: 'boxing-glove',   desc: 'Score per round' },
      { label: 'Punch Stats',   icon: 'chart-bar',      desc: 'Connect rate & combos' },
      { label: 'Knockdowns',    icon: 'arrow-down-bold', desc: 'KD count per round' },
      { label: 'Judge Cards',   icon: 'card-account-details-outline', desc: 'All 3 judge scores' },
    ], 'No live boxing bouts', 'Start a bout and score every round'),
    karate: makeCfg(byId('karate'), 'BOUTS', 'Track ippon, waza-ari & penalties', [
      { label: 'Score Tracker', icon: 'karate',         desc: 'Ippon & waza-ari' },
      { label: 'Penalty Log',   icon: 'flag-outline',   desc: 'Hansoku & jogai' },
      { label: 'Round Stats',   icon: 'chart-timeline', desc: 'Per-round breakdown' },
      { label: 'Match Result',  icon: 'trophy-outline', desc: 'Final outcome' },
    ], 'No live karate bouts', 'Start a bout and track every point'),
    judo: makeCfg(byId('judo'), 'BOUTS', 'Track ippon, waza-ari & shidos', [
      { label: 'Score Tracker', icon: 'human-handsup',  desc: 'Ippon & waza-ari' },
      { label: 'Shido Log',     icon: 'flag-outline',   desc: 'Penalties per bout' },
      { label: 'Golden Score',  icon: 'timer-outline',  desc: 'Overtime tracking' },
      { label: 'Result',        icon: 'trophy-outline', desc: 'Win by ippon or decision' },
    ], 'No live judo bouts', 'Start a bout and track every throw'),
    wrestling: makeCfg(byId('wrestling'), 'BOUTS', 'Track takedowns, escapes & points', [
      { label: 'Point Tracker', icon: 'arm-flex-outline', desc: 'Takedowns & reversals' },
      { label: 'Period Stats',  icon: 'chart-timeline',   desc: 'Per-period breakdown' },
      { label: 'Penalty Log',   icon: 'flag-outline',     desc: 'Cautions & warnings' },
      { label: 'Result',        icon: 'trophy-outline',   desc: 'Pin, points or default' },
    ], 'No live wrestling bouts', 'Start a bout and track every move'),
    handball: makeCfg(byId('handball'), 'MATCHES', 'Track goals, assists & saves', [
      { label: 'Goal Tracker',  icon: 'handball',       desc: 'Goals & assists' },
      { label: 'Save Stats',    icon: 'shield-outline', desc: 'Goalkeeper saves' },
      { label: 'Half Stats',    icon: 'chart-timeline', desc: 'First & second half' },
      { label: 'Card Tracker',  icon: 'card-outline',   desc: 'Yellow & red cards' },
    ], 'No live handball matches', 'Start a match and track every goal'),
    squash: makeCfg(byId('squash'), 'MATCHES', 'Track games, rallies & points', [
      { label: 'Game Tracker',  icon: 'racquetball',    desc: 'Points per game' },
      { label: 'Serve Stats',   icon: 'arrow-right-bold', desc: 'Service winners' },
      { label: 'Set Winner',    icon: 'trophy-outline', desc: 'Best of 5 games' },
      { label: 'Match Stats',   icon: 'chart-bar',      desc: 'Winners & errors' },
    ], 'No live squash matches', 'Start a match and track every point'),
    pickleball: makeCfg(byId('pickleball'), 'MATCHES', 'Track rallies, dinks & smashes', [
      { label: 'Point Tracker', icon: 'tennis',         desc: 'Points per game' },
      { label: 'Serve Tracker', icon: 'arrow-right-bold', desc: 'Service faults' },
      { label: 'Game Winner',   icon: 'trophy-outline', desc: 'Best of 3 games' },
      { label: 'Match Stats',   icon: 'chart-bar',      desc: 'Winners & faults' },
    ], 'No live pickleball matches', 'Start a match and track every rally'),
    skateboard: makeCfg(byId('skateboard'), 'EVENTS', 'Track runs, tricks & scores', [
      { label: 'Run Tracker',   icon: 'skateboard',      desc: 'Score per run' },
      { label: 'Trick Log',     icon: 'star-outline',   desc: 'Tricks & grabs' },
      { label: 'Judge Scores',  icon: 'chart-bar',      desc: 'All judge scores' },
      { label: 'Leaderboard',   icon: 'trophy-outline', desc: 'Live rankings' },
    ], 'No live skateboard events', 'Start an event and track every run'),
  };
  return custom;
};

export const DASHBOARD_CONFIG = _buildConfigs();
export const getDashboard = (id) => DASHBOARD_CONFIG[id] || DASHBOARD_CONFIG.cricket;

export default { SPORTS, DASHBOARD_CONFIG, getDashboard };
