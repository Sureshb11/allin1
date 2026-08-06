// The board definitions — what leaderboards exist, what each one ranks on, and
// which columns support it.
//
// Its own module because three things read it now (the team Stats tab, the
// shared index, the detail screen) and it used to live inside the team tab, so
// the index importing it from there and that file importing the index back
// formed a cycle. Data has no business living inside a screen.

export const BOARDS = [
  // BATTING
  { category: 'BATTING', key: 'runs', title: 'Most Runs', icon: 'cricket', value: (r) => r.runs, unit: 'runs', cap: 'orange', cols: [['M', 'matches'], ['Inn', 'innings'], ['R', 'runs'], ['SR', 'strikeRate']] },
  { category: 'BATTING', key: 'highest', title: 'Highest Scores', icon: 'trophy-outline', value: (r) => r.highest, unit: '', head: 'HS', cols: [['M', 'matches'], ['Runs', 'runs'], ['SR', 'strikeRate']] },
  { category: 'BATTING', key: 'average', title: 'Best Batting Average', icon: 'calculator', value: (r) => r.average, unit: '', head: 'AVG', cols: [['M', 'matches'], ['Inn', 'innings'], ['Runs', 'runs'], ['Avg', 'average']] },
  { category: 'BATTING', key: 'strikeRate', title: 'Best Batting Strike Rate', icon: 'flash', value: (r) => r.strikeRate, unit: 'sr', qualified: true, cols: [['Inn', 'innings'], ['Runs', 'runs'], ['Balls', 'balls'], ['SR', 'strikeRate']] },
  { category: 'BATTING', key: 'fours', title: 'Most Fours', icon: 'arrow-right-bold', value: (r) => r.fours, unit: '4s', cols: [['M', 'matches'], ['Runs', 'runs'], ['4s', 'fours']] },
  { category: 'BATTING', key: 'sixes', title: 'Most Sixes', icon: 'arrow-up-bold', value: (r) => r.sixes, unit: '6s', cols: [['M', 'matches'], ['Runs', 'runs'], ['6s', 'sixes']] },
  { category: 'BATTING', key: 'fifties', title: 'Most 50s', icon: 'star-half-full', value: (r) => r.fifties, unit: '50s', cols: [['M', 'matches'], ['Runs', 'runs'], ['50s', 'fifties']] },
  { category: 'BATTING', key: 'hundreds', title: 'Most 100s', icon: 'star-circle', value: (r) => r.hundreds, unit: '100s', cols: [['M', 'matches'], ['Runs', 'runs'], ['100s', 'hundreds']] },
  { category: 'BATTING', key: 'notOuts', title: 'Most Not Outs', icon: 'account-cancel-outline', value: (r) => r.notOuts, unit: 'no', cols: [['M', 'matches'], ['Inn', 'innings'], ['NO', 'notOuts']] },
  { category: 'BATTING', key: 'ducks', title: 'Most Ducks', icon: 'duck', value: (r) => r.ducks, unit: 'ducks', cols: [['M', 'matches'], ['Inn', 'innings'], ['0s', 'ducks']] },
  
  // BOWLING
  { category: 'BOWLING', key: 'wickets', title: 'Most Wickets', icon: 'bowling', value: (r) => r.wickets, unit: 'wkts', cap: 'purple', cols: [['M', 'matches'], ['Ov', 'overs'], ['W', 'wickets'], ['Econ', 'economy']] },
  { category: 'BOWLING', key: 'bestBowling', title: 'Best Bowling Figures', icon: 'trophy-outline', value: (r) => r.best, unit: '', head: 'BEST', cols: [['M', 'matches'], ['Ov', 'overs'], ['Best', 'best']] },
  { category: 'BOWLING', key: 'economy', title: 'Best Economy', icon: 'gauge-low', value: (r) => r.economy, unit: 'rpo', qualified: true, cols: [['Ov', 'overs'], ['W', 'wickets'], ['Econ', 'economy']] },
  { category: 'BOWLING', key: 'bowlingAvg', title: 'Best Bowling Average', icon: 'calculator', value: (r) => r.average, unit: '', head: 'AVG', cols: [['Ov', 'overs'], ['W', 'wickets'], ['Avg', 'average']] },
  { category: 'BOWLING', key: 'bowlingSr', title: 'Best Bowling Strike Rate', icon: 'flash', value: (r) => r.strikeRate, unit: 'sr', cols: [['Ov', 'overs'], ['W', 'wickets'], ['SR', 'strikeRate']] },
  { category: 'BOWLING', key: 'maidens', title: 'Most Maidens', icon: 'shield-outline', value: (r) => r.maidens, unit: 'm', cols: [['M', 'matches'], ['Ov', 'overs'], ['M', 'maidens']] },
  { category: 'BOWLING', key: 'dots', title: 'Most Dot Balls', icon: 'circle-small', value: (r) => r.dots, unit: 'dots', cols: [['M', 'matches'], ['Ov', 'overs'], ['Dots', 'dots']] },
  { category: 'BOWLING', key: 'threes', title: 'Most 3-Wicket Hauls', icon: 'hand-front-right', value: (r) => r.threes, unit: '3W', cols: [['M', 'matches'], ['W', 'wickets'], ['3W', 'threes']] },
  { category: 'BOWLING', key: 'fives', title: 'Most 5-Wicket Hauls', icon: 'hand-front-right', value: (r) => r.fives, unit: '5W', cols: [['M', 'matches'], ['W', 'wickets'], ['5W', 'fives']] },
  
  // FIELDING
  // The Green Cap needed something to lead. Fielding had six boards and no
  // answer to "who fields best", so this one scores the lot: see FIELD_POINTS
  // in backend/src/lib/teamStats.js for the weights.
  { category: 'FIELDING', key: 'bestFielder', title: 'Best Fielder', icon: 'hand-back-right',
    value: (r) => r.points, unit: 'pts', head: 'PTS', cap: 'green',
    cols: [['Ct', 'catches'], ['RO', 'runOuts'], ['St', 'stumpings']] },
  { category: 'FIELDING', key: 'catches', title: 'Most Catches', icon: 'hand-back-right-outline', value: (r) => r.catches, unit: 'ct', cols: [['M', 'matches'], ['RO', 'runOuts'], ['St', 'stumpings']] },
  { category: 'FIELDING', key: 'runOuts', title: 'Most Run Outs', icon: 'run-fast', value: (r) => r.runOuts, unit: 'ro', cols: [['M', 'matches'], ['Ct', 'catches'], ['St', 'stumpings']] },
  { category: 'FIELDING', key: 'directHits', title: 'Most Direct Hit Run Outs', icon: 'target', value: (r) => r.directHits, unit: 'dh', cols: [['M', 'matches'], ['RO', 'runOuts'], ['DH', 'directHits']] },
  { category: 'FIELDING', key: 'assistedRunOuts', title: 'Most Assisted Run Outs', icon: 'account-multiple-outline', value: (r) => r.assistedRunOuts, unit: 'aro', cols: [['M', 'matches'], ['RO', 'runOuts'], ['ARO', 'assistedRunOuts']] },
  { category: 'FIELDING', key: 'stumpings', title: 'Most Stumpings', icon: 'hand-back-left', value: (r) => r.stumpings, unit: 'st', cols: [['M', 'matches'], ['Ct', 'catches'], ['RO', 'runOuts']] },
  { category: 'FIELDING', key: 'dismissals', title: 'Most Dismissals', icon: 'account-remove-outline', value: (r) => r.dismissals, unit: 'dis', cols: [['Ct', 'catches'], ['RO', 'runOuts'], ['St', 'stumpings']] },

  // PARTICIPATION
  { category: 'PARTICIPATION', key: 'matches', title: 'Most Matches Played', icon: 'account-group-outline', value: (r) => r.matches, unit: 'mat', cols: [['Inn (B)', 'inningsBat'], ['Ov (B)', 'oversBowl'], ['M', 'matches']] },
  { category: 'PARTICIPATION', key: 'inningsBat', title: 'Most Innings Batted', icon: 'cricket', value: (r) => r.inningsBat, unit: 'inn', cols: [['M', 'matches'], ['Balls', 'ballsFaced'], ['Inn', 'inningsBat']] },
  { category: 'PARTICIPATION', key: 'inningsBowl', title: 'Most Innings Bowled', icon: 'bowling', value: (r) => r.inningsBowl, unit: 'inn', cols: [['M', 'matches'], ['Ov', 'oversBowl'], ['Inn', 'inningsBowl']] },
  { category: 'PARTICIPATION', key: 'oversBowl', title: 'Most Overs Bowled', icon: 'baseball-diamond-outline', value: (r) => r.oversBowl, unit: 'ov', cols: [['M', 'matches'], ['Inn', 'inningsBowl'], ['Ov', 'oversBowl']] },
  { category: 'PARTICIPATION', key: 'ballsFaced', title: 'Most Balls Faced', icon: 'baseball-outline', value: (r) => r.ballsFaced, unit: 'balls', cols: [['M', 'matches'], ['Inn', 'inningsBat'], ['Balls', 'ballsFaced']] },

  // AWARDS & RECORDS
  { category: 'AWARDS & RECORDS', key: 'fastest50', title: 'Fastest Fifty', icon: 'timer-outline', value: (r) => r.fastest50, unit: 'balls', cols: [['M', 'matches'], ['Inn', 'innings'], ['Balls', 'fastest50']] },
  { category: 'AWARDS & RECORDS', key: 'fastest100', title: 'Fastest Century', icon: 'timer-star-outline', value: (r) => r.fastest100, unit: 'balls', cols: [['M', 'matches'], ['Inn', 'innings'], ['Balls', 'fastest100']] },
  { category: 'OTHERS', key: 'motm', title: 'Player of the Match', icon: 'medal-outline', value: (r) => r.count, unit: 'awards', cols: [] },
  { category: 'OTHERS', key: 'captainWins', title: 'Most Wins as Captain', icon: 'crown-outline', value: (r) => r.wins, unit: 'wins', cols: [] },
];
