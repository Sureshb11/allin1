// Per-sport tournament configuration for TournamentScreen (create / edit).
//
// The create form was written for cricket and said so out loud: "Cricket type"
// (leather / tennis / box), T20 / ODI / Test, "Overs per innings", an ICC bowler
// quota, wides and no-balls, and Net Run Rate as a tie-break. Every one of those
// was shown when creating a football or judo tournament.
//
// Same shape as the other data-table domains in this folder (formats.js,
// start.js, find.js): one table, one getter, screens stay generic. A sport with
// no entry falls through to DEFAULT_TOURNAMENT.
//
// The points and tie-break defaults below are the real governing-body ones, not
// invented, because an organiser who accepts the defaults should end up with the
// table their sport actually uses:
//
//   football     3 / 1 / 0, then goal difference, goals for, head-to-head
//   hockey (FIH) 3 / 1 / 0 with a shoot-out bonus point, then wins, GD, goals
//   volleyball   FIVB 3-2-1-0: 3-0 or 3-1 → 3, 3-2 → 2, 2-3 → 1, 0-3 or 1-3 → 0
//   handball     2 / 1 / 0 (IHF), then goal difference
//   kabaddi      PKL is 2 / 0 today; it used 5 / 3 / 1 through 2023-24
//   basketball   win-loss record, no draws — ties are broken by h2h then margin
//   cricket      2 / 1, then Net Run Rate (unchanged from what it already had)
//
// Sources are listed in docs/, not repeated per sport here.

// Structural shape of the competition — the same for every sport, so it lives
// once rather than in each entry.
export const CATEGORIES = [
  { value: 'League', label: 'League', icon: 'format-list-numbered' },
  { value: 'Knockout', label: 'Knockout', icon: 'tournament' },
  { value: 'League + Knockout', label: 'League + KO', icon: 'sitemap-outline' },
  { value: 'Round Robin', label: 'Round Robin', icon: 'rotate-360' },
  { value: 'Double Elimination', label: 'Double Elim.', icon: 'call-split' },
  { value: 'Custom', label: 'Custom', icon: 'tune-variant' },
];

// Tie-breaks shared by the goal-scoring team sports.
const GOAL_TIEBREAKS = [
  { value: 'points', label: 'Points' },
  { value: 'gd', label: 'Goal Difference' },
  { value: 'gf', label: 'Goals For' },
  { value: 'h2h', label: 'Head-to-Head' },
  { value: 'wins', label: 'Wins' },
];

const SET_TIEBREAKS = [
  { value: 'points', label: 'Points' },
  { value: 'setRatio', label: 'Set Ratio' },
  { value: 'pointRatio', label: 'Point Ratio' },
  { value: 'h2h', label: 'Head-to-Head' },
  { value: 'wins', label: 'Wins' },
];

// Knockout draws don't build a table, so the "points system" step is hidden for
// them and only the bracket questions matter.
const BRACKET_RULES = [
  { key: 'seeding', label: 'Seeding', desc: 'Top entrants are kept apart in the early rounds' },
  { key: 'thirdPlace', label: 'Third-place play-off', desc: 'The losing semi-finalists play for bronze' },
  { key: 'walkover', label: 'Walkovers', desc: 'A no-show concedes the tie' },
];

export const TOURNAMENT_CONFIG = {
  cricket: {
    formats: ['T5', 'T6', 'T8', 'T10', 'T15', 'T20', 'ODI', 'Test', 'Custom'],
    formatDuration: { T5: 5, T6: 6, T8: 8, T10: 10, T15: 15, T20: 20, ODI: 50, Test: 90 },
    duration: { label: 'Overs per innings', max: 200, invalid: 'That is not a cricket match' },
    variant: {
      label: 'Cricket type',
      options: [
        { value: 'Leather', label: 'Leather Ball', icon: 'cricket' },
        { value: 'Tennis', label: 'Tennis Ball', icon: 'tennis-ball' },
        { value: 'Box', label: 'Box Cricket', icon: 'home-variant-outline' },
        { value: 'Soft', label: 'Soft Ball', icon: 'circle-outline' },
      ],
    },
    rules: [
      { key: 'wide', label: 'Wide ball', desc: 'A wide costs a run and is re-bowled' },
      { key: 'noBall', label: 'No ball', desc: 'A no ball costs a run and is re-bowled' },
      { key: 'freeHit', label: 'Free hit', desc: 'Next delivery after a no ball — bowled/caught can’t get you out' },
      { key: 'legBye', label: 'Leg byes', desc: 'Runs off the body count to the team' },
      { key: 'bye', label: 'Byes', desc: 'Runs past the keeper count to the team' },
      { key: 'dls', label: 'DLS', desc: 'Rain-revised targets' },
      { key: 'superOver', label: 'Super over', desc: 'A tie is decided, not shared' },
      { key: 'powerplay', label: 'Powerplay', desc: 'Fielding restrictions for the opening overs' },
      { key: 'penaltyRuns', label: 'Penalty runs', desc: 'Umpires can award 5 for an infraction' },
    ],
    points: { win: 2, tie: 1, noResult: 1, loss: 0 },
    tieBreaks: [
      { value: 'points', label: 'Points' },
      { value: 'nrr', label: 'Net Run Rate' },
      { value: 'h2h', label: 'Head-to-Head' },
      { value: 'wins', label: 'Wins' },
      { value: 'boundaries', label: 'Boundary Count' },
    ],
  },

  football: {
    formats: ['90 min', '60 min', '7-a-side', '5-a-side', 'Futsal', 'Custom'],
    formatDuration: { '90 min': 90, '60 min': 60, '7-a-side': 60, '5-a-side': 40, Futsal: 40 },
    duration: { label: 'Match length (minutes)', max: 200, invalid: 'That is not a football match' },
    rules: [
      { key: 'offside', label: 'Offside', desc: 'Assistant referees call offside' },
      { key: 'var', label: 'VAR', desc: 'Video review for goals, penalties and red cards' },
      { key: 'extraTime', label: 'Extra time', desc: 'Two 15-minute halves if a knockout tie is level' },
      { key: 'penalties', label: 'Penalty shoot-out', desc: 'A level knockout tie is decided from the spot' },
      { key: 'yellowCard', label: 'Yellow cards', desc: 'Cautions are recorded and accumulate' },
      { key: 'redCard', label: 'Red cards', desc: 'A sending-off carries a suspension' },
      { key: 'rollingSubs', label: 'Rolling substitutions', desc: 'Players may come back on' },
    ],
    points: { win: 3, tie: 1, noResult: 1, loss: 0 },
    tieBreaks: GOAL_TIEBREAKS,
  },

  hockey: {
    formats: ['4 × 15 min', '2 × 30 min', '2 × 25 min', 'Custom'],
    formatDuration: { '4 × 15 min': 60, '2 × 30 min': 60, '2 × 25 min': 50 },
    duration: { label: 'Match length (minutes)', max: 200, invalid: 'That is not a hockey match' },
    rules: [
      { key: 'penaltyCorner', label: 'Penalty corner', desc: 'Short corner awarded for an offence in the circle' },
      { key: 'penaltyStroke', label: 'Penalty stroke', desc: 'One-on-one from the spot' },
      { key: 'shootout', label: 'Shoot-out', desc: 'A drawn match goes to a shoot-out for a bonus point' },
      { key: 'greenCard', label: 'Green card', desc: 'Two-minute suspension' },
      { key: 'yellowCard', label: 'Yellow card', desc: 'Five-minute (or longer) suspension' },
      { key: 'rollingSubs', label: 'Rolling substitutions', desc: 'Unlimited interchange' },
    ],
    // FIH: 3 for a win, 1 for a draw, plus a bonus point to the shoot-out winner.
    points: { win: 3, tie: 1, noResult: 1, loss: 0, bonus: true },
    tieBreaks: GOAL_TIEBREAKS,
  },

  handball: {
    formats: ['2 × 30 min', '2 × 25 min', '2 × 20 min', 'Custom'],
    formatDuration: { '2 × 30 min': 60, '2 × 25 min': 50, '2 × 20 min': 40 },
    duration: { label: 'Match length (minutes)', max: 200, invalid: 'That is not a handball match' },
    rules: [
      { key: 'sevenMetre', label: '7-metre throw', desc: 'Penalty throw for a clear-chance foul' },
      { key: 'twoMinute', label: '2-minute suspension', desc: 'A player is sent off temporarily' },
      { key: 'emptyGoal', label: 'Empty-goal attack', desc: 'Seventh court player instead of the keeper' },
      { key: 'passiveplay', label: 'Passive play', desc: 'Warning then turnover for holding the ball' },
    ],
    points: { win: 2, tie: 1, noResult: 1, loss: 0 },
    tieBreaks: GOAL_TIEBREAKS,
  },

  basketball: {
    formats: ['4 × 10 min', '4 × 12 min', '3×3', '21 points', 'Custom'],
    formatDuration: { '4 × 10 min': 40, '4 × 12 min': 48, '3×3': 10, '21 points': 21 },
    duration: { label: 'Match length (minutes)', max: 100, invalid: 'That is not a basketball game' },
    rules: [
      { key: 'shotClock', label: 'Shot clock', desc: '24 seconds to attempt a shot' },
      { key: 'threePoint', label: 'Three-point line', desc: 'Shots from range count three' },
      { key: 'foulOut', label: 'Foul out', desc: 'A player is disqualified on five fouls' },
      { key: 'bonusFreeThrows', label: 'Team-foul bonus', desc: 'Free throws once the team is over the limit' },
      { key: 'overtime', label: 'Overtime', desc: 'Five-minute periods until it is settled' },
    ],
    // Basketball is decided on a win-loss record and can't be drawn — overtime
    // settles it — so "tie" is left at zero rather than pretending it happens.
    points: { win: 2, tie: 0, noResult: 1, loss: 0 },
    tieBreaks: [
      { value: 'points', label: 'Record' },
      { value: 'h2h', label: 'Head-to-Head' },
      { value: 'pd', label: 'Point Differential' },
      { value: 'pf', label: 'Points For' },
      { value: 'wins', label: 'Wins' },
    ],
  },

  volleyball: {
    formats: ['Best of 5', 'Best of 3', 'Beach 2v2', 'Custom'],
    formatDuration: { 'Best of 5': 5, 'Best of 3': 3, 'Beach 2v2': 3 },
    duration: { label: 'Sets in a match', max: 7, invalid: 'A match is at most 7 sets' },
    rules: [
      { key: 'rallyPoint', label: 'Rally scoring', desc: 'Every rally scores, whoever served' },
      { key: 'libero', label: 'Libero', desc: 'Specialist back-row defender' },
      { key: 'letServe', label: 'Let serve', desc: 'A serve off the net stays in play' },
      { key: 'technicalTimeout', label: 'Technical time-outs', desc: 'Automatic breaks at 8 and 16' },
      { key: 'goldenSet', label: 'Deciding set to 15', desc: 'The fifth set is played to 15, not 25' },
    ],
    // FIVB 3-2-1-0. Held in the same win/tie/loss fields the form already has:
    // win = a 3-0 or 3-1, tie = the 3-2, loss = a 2-3 that still earns a point.
    points: { win: 3, tie: 2, noResult: 1, loss: 0 },
    tieBreaks: SET_TIEBREAKS,
  },

  kabaddi: {
    formats: ['2 × 20 min', '2 × 15 min', 'Custom'],
    formatDuration: { '2 × 20 min': 40, '2 × 15 min': 30 },
    duration: { label: 'Match length (minutes)', max: 120, invalid: 'That is not a kabaddi match' },
    rules: [
      { key: 'bonusPoint', label: 'Bonus point', desc: 'Raider crosses the bonus line with six defenders on the mat' },
      { key: 'superRaid', label: 'Super raid', desc: 'Three or more points in a single raid' },
      { key: 'superTackle', label: 'Super tackle', desc: 'Tackle with three or fewer defenders left' },
      { key: 'allOut', label: 'All out', desc: 'Two extra points when the side is wiped out' },
      { key: 'doOrDie', label: 'Do-or-die raid', desc: 'The third empty raid must score' },
      { key: 'raidShootout', label: 'Raid shoot-out', desc: 'A five-raid shoot-out settles a tied match' },
    ],
    // Pro Kabaddi is 2 / 0 today. It used 5 for a win, 3 for a tie and 1 for a
    // narrow loss through 2023-24, which is why the fields stay editable.
    points: { win: 2, tie: 1, noResult: 1, loss: 0 },
    tieBreaks: [
      { value: 'points', label: 'Points' },
      { value: 'scoreDiff', label: 'Score Difference' },
      { value: 'h2h', label: 'Head-to-Head' },
      { value: 'wins', label: 'Wins' },
    ],
  },

  khokho: {
    formats: ['2 × 9 min turns', '4 × 7 min turns', 'Custom'],
    formatDuration: { '2 × 9 min turns': 36, '4 × 7 min turns': 28 },
    duration: { label: 'Match length (minutes)', max: 120, invalid: 'That is not a kho kho match' },
    rules: [
      { key: 'dreamRun', label: 'Dream run', desc: 'A defender surviving a full turn' },
      { key: 'skyDive', label: 'Sky dive', desc: 'Diving touch by the chaser' },
      { key: 'poleDive', label: 'Pole dive', desc: 'Touch made around the pole' },
      { key: 'allOut', label: 'All out', desc: 'The whole batch is out inside a turn' },
    ],
    points: { win: 2, tie: 1, noResult: 1, loss: 0 },
    tieBreaks: [
      { value: 'points', label: 'Points' },
      { value: 'scoreDiff', label: 'Score Difference' },
      { value: 'h2h', label: 'Head-to-Head' },
      { value: 'wins', label: 'Wins' },
    ],
  },

  // ── Racket sports ──────────────────────────────────────────────────────────
  // Draw-based, scored in sets/games. One entry each rather than a shared one,
  // because the set lengths and the rules that matter genuinely differ.
  tennis: {
    formats: ['Best of 3', 'Best of 5', 'Fast4', 'Pro set', 'Custom'],
    formatDuration: { 'Best of 3': 3, 'Best of 5': 5, Fast4: 3, 'Pro set': 1 },
    duration: { label: 'Sets in a match', max: 5, invalid: 'A match is at most 5 sets' },
    rules: [
      { key: 'tieBreak', label: 'Tie-break', desc: 'A set level at 6-6 is decided by a tie-break' },
      { key: 'finalSetTieBreak', label: 'Final-set tie-break', desc: '10-point tie-break instead of a deciding set' },
      { key: 'advantage', label: 'Advantage games', desc: 'Deuce is played out rather than sudden death' },
      { key: 'letServe', label: 'Let serve', desc: 'A serve off the net is replayed' },
      { key: 'shotClock', label: 'Shot clock', desc: '25 seconds between points' },
    ],
    points: { win: 1, tie: 0, noResult: 0, loss: 0 },
    tieBreaks: SET_TIEBREAKS,
  },

  badminton: {
    formats: ['Best of 3 to 21', 'Best of 3 to 15', 'Single game to 21', 'Custom'],
    formatDuration: { 'Best of 3 to 21': 3, 'Best of 3 to 15': 3, 'Single game to 21': 1 },
    duration: { label: 'Games in a match', max: 5, invalid: 'A match is at most 5 games' },
    rules: [
      { key: 'rallyPoint', label: 'Rally scoring', desc: 'Every rally scores, whoever served' },
      { key: 'setting', label: 'Setting at 20-20', desc: 'Two clear points, capped at 30' },
      { key: 'changeEnds', label: 'Change ends', desc: 'Ends change at 11 in the deciding game' },
      { key: 'letServe', label: 'Service let', desc: 'A serve off the net is replayed' },
    ],
    points: { win: 1, tie: 0, noResult: 0, loss: 0 },
    tieBreaks: SET_TIEBREAKS,
  },

  tabletennis: {
    formats: ['Best of 5', 'Best of 7', 'Best of 3', 'Custom'],
    formatDuration: { 'Best of 5': 5, 'Best of 7': 7, 'Best of 3': 3 },
    duration: { label: 'Games in a match', max: 7, invalid: 'A match is at most 7 games' },
    rules: [
      { key: 'twoServe', label: 'Two serves each', desc: 'Service alternates every two points' },
      { key: 'setting', label: 'Deuce at 10-10', desc: 'Two clear points to take the game' },
      { key: 'expedite', label: 'Expedite system', desc: 'Speeds up a game past 10 minutes' },
      { key: 'letServe', label: 'Service let', desc: 'A serve off the net is replayed' },
    ],
    points: { win: 1, tie: 0, noResult: 0, loss: 0 },
    tieBreaks: SET_TIEBREAKS,
  },

  squash: {
    formats: ['Best of 5 to 11', 'Best of 3 to 11', 'Best of 5 to 15', 'Custom'],
    formatDuration: { 'Best of 5 to 11': 5, 'Best of 3 to 11': 3, 'Best of 5 to 15': 5 },
    duration: { label: 'Games in a match', max: 5, invalid: 'A match is at most 5 games' },
    rules: [
      { key: 'pointARally', label: 'Point-a-rally', desc: 'Every rally scores, whoever served' },
      { key: 'letStroke', label: 'Lets and strokes', desc: 'Interference is refereed as a let or a stroke' },
      { key: 'setting', label: 'Setting at 10-10', desc: 'Two clear points to take the game' },
    ],
    points: { win: 1, tie: 0, noResult: 0, loss: 0 },
    tieBreaks: SET_TIEBREAKS,
  },

  pickleball: {
    formats: ['Best of 3 to 11', 'Single game to 15', 'Single game to 21', 'Custom'],
    formatDuration: { 'Best of 3 to 11': 3, 'Single game to 15': 1, 'Single game to 21': 1 },
    duration: { label: 'Games in a match', max: 5, invalid: 'A match is at most 5 games' },
    rules: [
      { key: 'rallyPoint', label: 'Rally scoring', desc: 'Every rally scores, whoever served' },
      { key: 'doubleBounce', label: 'Double-bounce rule', desc: 'Serve and return must both bounce' },
      { key: 'kitchen', label: 'Non-volley zone', desc: 'No volleying inside the kitchen' },
      { key: 'winByTwo', label: 'Win by two', desc: 'A game must be won by two clear points' },
    ],
    points: { win: 1, tie: 0, noResult: 0, loss: 0 },
    tieBreaks: SET_TIEBREAKS,
  },

  // ── Combat sports ──────────────────────────────────────────────────────────
  // Weight-class draws. Judo and wrestling pull the losers to the finalists back
  // in through a repechage, which is why two bronzes are awarded in each class —
  // so that's a real toggle here, not decoration.
  boxing: {
    formats: ['3 × 3 min', '3 × 2 min', '4 × 2 min', 'Custom'],
    formatDuration: { '3 × 3 min': 3, '3 × 2 min': 3, '4 × 2 min': 4 },
    duration: { label: 'Rounds in a bout', max: 12, invalid: 'A bout is at most 12 rounds' },
    rules: [
      ...BRACKET_RULES,
      { key: 'weightClasses', label: 'Weight classes', desc: 'Entrants are drawn within their class' },
      { key: 'countEight', label: 'Standing count', desc: 'The referee counts a hurt boxer' },
      { key: 'rsc', label: 'Referee stops contest', desc: 'The referee may end it early' },
    ],
    points: { win: 1, tie: 0, noResult: 0, loss: 0 },
    tieBreaks: [{ value: 'points', label: 'Points' }, { value: 'h2h', label: 'Head-to-Head' }, { value: 'wins', label: 'Wins' }],
  },

  judo: {
    formats: ['4 min', '5 min', 'Golden score', 'Custom'],
    formatDuration: { '4 min': 4, '5 min': 5, 'Golden score': 4 },
    duration: { label: 'Bout length (minutes)', max: 20, invalid: 'A bout is at most 20 minutes' },
    rules: [
      ...BRACKET_RULES,
      { key: 'weightClasses', label: 'Weight classes', desc: 'Entrants are drawn within their class' },
      { key: 'repechage', label: 'Repechage', desc: 'Quarter-final losers fight back for two bronzes' },
      { key: 'goldenScore', label: 'Golden score', desc: 'A level bout continues until the next score' },
      { key: 'shido', label: 'Shido penalties', desc: 'Three penalties lose the bout' },
    ],
    points: { win: 1, tie: 0, noResult: 0, loss: 0 },
    tieBreaks: [{ value: 'points', label: 'Points' }, { value: 'h2h', label: 'Head-to-Head' }, { value: 'wins', label: 'Wins' }],
  },

  wrestling: {
    formats: ['2 × 3 min', '2 × 2 min', 'Custom'],
    formatDuration: { '2 × 3 min': 6, '2 × 2 min': 4 },
    duration: { label: 'Bout length (minutes)', max: 20, invalid: 'A bout is at most 20 minutes' },
    rules: [
      ...BRACKET_RULES,
      { key: 'weightClasses', label: 'Weight classes', desc: 'Entrants are drawn within their class' },
      { key: 'repechage', label: 'Repechage', desc: 'Those beaten by a finalist fight back for two bronzes' },
      { key: 'technicalSuperiority', label: 'Technical superiority', desc: 'A big lead ends the bout early' },
      { key: 'passivity', label: 'Passivity', desc: 'Inactivity is warned then penalised' },
    ],
    points: { win: 1, tie: 0, noResult: 0, loss: 0 },
    tieBreaks: [{ value: 'points', label: 'Points' }, { value: 'h2h', label: 'Head-to-Head' }, { value: 'wins', label: 'Wins' }],
  },

  karate: {
    formats: ['3 min kumite', '2 min kumite', 'Kata', 'Custom'],
    formatDuration: { '3 min kumite': 3, '2 min kumite': 2, Kata: 1 },
    duration: { label: 'Bout length (minutes)', max: 10, invalid: 'A bout is at most 10 minutes' },
    rules: [
      ...BRACKET_RULES,
      { key: 'weightClasses', label: 'Weight classes', desc: 'Entrants are drawn within their class' },
      { key: 'ippon', label: 'Ippon / waza-ari / yuko', desc: 'Three-tier scoring' },
      { key: 'eightPoint', label: 'Eight-point lead', desc: 'A clear lead ends the bout' },
      { key: 'senshu', label: 'Senshu', desc: 'First unopposed score wins a level bout' },
    ],
    points: { win: 1, tie: 0, noResult: 0, loss: 0 },
    tieBreaks: [{ value: 'points', label: 'Points' }, { value: 'h2h', label: 'Head-to-Head' }, { value: 'wins', label: 'Wins' }],
  },

  skateboard: {
    formats: ['Street', 'Park', 'Jam', 'Custom'],
    formatDuration: { Street: 3, Park: 3, Jam: 1 },
    duration: { label: 'Runs per skater', max: 10, invalid: 'That is a lot of runs' },
    rules: [
      ...BRACKET_RULES,
      { key: 'bestRun', label: 'Best run counts', desc: 'Only the highest-scoring run is kept' },
      { key: 'bestTricks', label: 'Best tricks', desc: 'Top trick scores are added to the run' },
      { key: 'judgesPanel', label: 'Judging panel', desc: 'Scored 0-100 by a panel' },
    ],
    points: { win: 1, tie: 0, noResult: 0, loss: 0 },
    tieBreaks: [{ value: 'points', label: 'Score' }, { value: 'wins', label: 'Best run' }],
  },

  rummy: {
    formats: ['Points rummy', '201 pool', '101 pool', 'Deals rummy', 'Custom'],
    formatDuration: { 'Points rummy': 1, '201 pool': 201, '101 pool': 101, 'Deals rummy': 3 },
    duration: { label: 'Target / deals', max: 501, invalid: 'That target is too high' },
    rules: [
      { key: 'jokers', label: 'Jokers', desc: 'Wild cards are in play' },
      { key: 'pureSequence', label: 'Pure sequence required', desc: 'A declaration needs one without a joker' },
      { key: 'dropPoints', label: 'Drop points', desc: 'Leaving a deal early costs a fixed score' },
      { key: 'middleDrop', label: 'Middle drop', desc: 'A heavier penalty after the first turn' },
    ],
    // Rummy is scored low-is-better, so the table is built on deals won.
    points: { win: 1, tie: 0, noResult: 0, loss: 0 },
    tieBreaks: [{ value: 'points', label: 'Deals won' }, { value: 'scoreDiff', label: 'Lowest score' }, { value: 'h2h', label: 'Head-to-Head' }],
  },
};

// A sport with no entry: a generic league that names nothing sport-specific.
export const DEFAULT_TOURNAMENT = {
  formats: ['Standard', 'Short', 'Extended', 'Custom'],
  formatDuration: { Standard: 60, Short: 30, Extended: 90 },
  duration: { label: 'Match length (minutes)', max: 300, invalid: 'That is too long for one match' },
  rules: [
    ...BRACKET_RULES,
    { key: 'extraTime', label: 'Extra time', desc: 'A level knockout tie is played on' },
  ],
  points: { win: 3, tie: 1, noResult: 1, loss: 0 },
  tieBreaks: GOAL_TIEBREAKS,
};

export const getTournamentConfig = (sport) => TOURNAMENT_CONFIG[sport] || DEFAULT_TOURNAMENT;

export default { TOURNAMENT_CONFIG, DEFAULT_TOURNAMENT, getTournamentConfig, CATEGORIES };
