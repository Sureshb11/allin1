// Per-sport career-stat panels for MyPerformanceScreen ("My Stats").
//
// That screen used to hardcode cricket: Batting / Bowling / Fielding tabs
// showing Runs, Wickets and 5-wkt Hauls. Inside football it therefore showed a
// cricket career with the numbers zeroed out, which reads as broken.
//
// A sport describes its own panels here instead. Two kinds of row:
//   { key }        → read stats[key]            (cricket's derived numbers)
//   { event }      → read stats.eventTotals[event]  (SportEvent tallies:
//                    goals, cards, … — see /users/me/stats)
//
// Adding a sport = add an entry. Anything not listed draws no table at all —
// matches played is reported in the screen's career line either way, so a new
// sport is never worse than neutral.

// Matches played is a career fact, not a batting or bowling one, so it belongs
// to the header of "My Stats" rather than to every panel's first cell — these
// tables list what the panel is actually about.
//
// Cricket's rows are also no longer a subset of what the API computes: the
// endpoint has been deriving highest score, boundaries and not-outs from the
// ball-by-ball data all along, and nothing displayed them.
const CRICKET = [
  { id: 'batting', label: 'Batting', rows: [
    { label: 'Runs',         key: 'runs' },
    { label: 'Innings',      key: 'innings' },
    { label: 'Balls Faced',  key: 'ballsFaced' },
    { label: 'Average',      key: 'battingAverage', alt: 'average' },
    { label: 'Strike Rate',  key: 'battingStrikeRate', alt: 'strikeRate' },
    { label: 'Highest',      key: 'highestScore' },
    { label: 'Fifties',      key: 'halfCenturies' },
    { label: 'Hundreds',     key: 'centuries' },
    { label: 'Fours',        key: 'fours' },
    { label: 'Sixes',        key: 'sixes' },
    { label: 'Not Outs',     key: 'notOuts' },
    { label: 'Dot Balls',    key: 'battingDotBalls' },
    { label: 'Ducks',        key: 'ducks' },
    // Average and strike rate say how much and how fast; these say how. Two
    // batters on the same average are opposite players if one scores 80% of
    // their runs in boundaries and the other 30%.
    { label: 'Boundary %',   key: 'boundaryPercent', suffix: '%' },
    { label: 'Dot Ball %',   key: 'dotBallPercent',  suffix: '%' },
    { label: 'Balls/Bndry',  key: 'ballsPerBoundary' },
    // When the runs came, not just how fast overall.
    { label: 'Powerplay SR', phase: 'batting.powerplay.strikeRate' },
    { label: 'Middle SR',    phase: 'batting.middle.strikeRate' },
    { label: 'Death SR',     phase: 'batting.death.strikeRate' },
    // The number goes on the face, the partner's name on the back — a name does
    // not fit a cell a third of the screen wide.
    { label: 'Best Stand',   key: 'bestPartnership', detail: 'bestPartnershipWith' },
  ]},
  { id: 'bowling', label: 'Bowling', rows: [
    { label: 'Wickets',      key: 'wickets' },
    { label: 'Overs',        key: 'oversBowled' },
    { label: 'Maidens',      key: 'maidens' },
    { label: 'Runs Given',   key: 'runsConceded' },
    { label: 'Economy',      key: 'economy' },
    { label: 'Bowling Avg',  key: 'bowlingAverage' },
    { label: 'Strike Rate',  key: 'bowlingStrikeRate' },
    { label: 'Best Figures', key: 'bestBowling' },
    { label: '4-wkt Hauls',  key: 'fourWickets' },
    { label: '5-wkt Hauls',  key: 'fiveWickets' },
    // What the spell felt like from the other end: pressure built, and what it
    // cost when it broke.
    { label: 'Dot Balls',    key: 'dotBalls' },
    { label: 'Wides',        key: 'wides' },
    { label: 'No Balls',     key: 'noBalls' },
    { label: 'Fours Given',  key: 'foursConceded' },
    { label: 'Sixes Given',  key: 'sixesConceded' },
    // A career economy of 8 is one bowler at the death and another in the
    // middle. These separate them.
    { label: 'Powerplay Econ', phase: 'bowling.powerplay.economy' },
    { label: 'Middle Econ',    phase: 'bowling.middle.economy' },
    { label: 'Death Econ',     phase: 'bowling.death.economy' },
  ]},
  // Cricket lost its fielding panel when these tables replaced the screen's
  // hardcoded tabs, and the payload had nothing to fill one with — even though
  // the scorer has recorded every catch and run-out since day one.
  // The panel had three rows because the payload carried three numbers. The
  // scorer has been recording the drops and the direct hits all along — the
  // schema calls the drops "half the story" in amateur cricket — and none of it
  // reached the player. A catch rate needs both halves to mean anything.
  { id: 'fielding', label: 'Fielding', rows: [
    { label: 'Catches',     key: 'catches' },
    { label: 'Run Outs',    key: 'runOuts' },
    { label: 'Direct Hits', key: 'directHits' },
    { label: 'Dismissals',  key: 'dismissalsTaken' },
    { label: 'Drops',       key: 'drops' },
    { label: 'Easy Drops',  key: 'dropsEasy' },
    { label: 'Hard Drops',  key: 'dropsDifficult' },
    { label: 'Catch %',     key: 'catchRate', suffix: '%' },
  ]},
  // The scorer has recorded the mode of every dismissal since day one and the
  // career screen only ever counted them. "Out 12 times" and "lbw in a third of
  // them" are different pieces of information, and only one is coachable.
  // Every mode here is one the scorer can actually write.
  { id: 'dismissals', label: 'How You Get Out', rows: [
    { label: 'Bowled',     out: 'bowled' },
    { label: 'Caught',     out: 'caught' },
    { label: 'LBW',        out: 'lbw' },
    { label: 'Run Out',    out: 'runout' },
    { label: 'Stumped',    out: 'stumped' },
    { label: 'Hit Wicket', out: 'hitwicket' },
    { label: 'Retired',    out: 'retiredout' },
    { label: 'Most Out To', key: 'nemesisOuts', detail: 'nemesisName' },
  ]},
  // Last, not first: panels[0] is the accordion that opens by default, and that
  // should stay Batting with its runs chart rather than a reference table.
  // The played/won line every international career page opens with. Matches is
  // in the screen's header too, but a record reads as a record only next to the
  // games it came from.
  { id: 'career', label: 'Career', rows: [
    { label: 'Matches', key: 'matches' },
    { label: 'Won',     key: 'wins' },
    { label: 'Lost',    key: 'losses' },
    { label: 'Win %',   key: 'winPercent', suffix: '%' },
  ]},
];

// Every `event` below is a type the scorer can actually record — see the
// `actions` list for the sport in sports/scoring.js. That constraint was being
// broken: football listed Assists and the rally sports shared one Faults panel,
// but no scorer emits an `assist`, and only tennis emits a `double-fault`. A row
// for an event that is never written reads 0 forever, which looks like a career
// with no assists rather than an app that cannot record one.
const FOOTBALL = [
  { id: 'attack', label: 'Attack', rows: [
    { label: 'Goals',   event: 'goal' },
    { label: 'Corners', event: 'corner' },
  ]},
  { id: 'discipline', label: 'Discipline', rows: [
    { label: 'Yellow Cards', event: 'yellow-card' },
    { label: 'Red Cards',    event: 'red-card' },
    { label: 'Offsides',     event: 'offside' },
  ]},
];

// Court/racquet sports all score points and aces; what they record third
// differs (tennis a double fault, volleyball a block, the rest a fault), so the
// caller passes the row its own scorer emits.
const rally = (third) => [
  { id: 'rally', label: 'Rally', rows: [
    { label: 'Points', event: 'point' },
    { label: 'Aces',   event: 'ace' },
    third,
  ]},
];

const PANELS = {
  cricket:     CRICKET,
  football:    FOOTBALL,
  hockey:      [{ id: 'match', label: 'Match', rows: [
                  { label: 'Goals',        event: 'goal' },
                  { label: 'Pen Corners',  event: 'penalty-corner' },
                  { label: 'Yellow Cards', event: 'yellow-card' },
                  { label: 'Red Cards',    event: 'red-card' }] }],
  basketball:  [{ id: 'scoring', label: 'Scoring', rows: [
                  { label: '2-Pointers', event: '2pt' },
                  { label: '3-Pointers', event: '3pt' },
                  { label: 'Free Throws',event: 'freethrow' },
                  { label: 'Fouls',      event: 'foul' }] }],
  kabaddi:     [{ id: 'raiding', label: 'Raiding', rows: [
                  { label: 'Touch Points', event: 'touch-point' },
                  { label: 'Bonus Points', event: 'bonus-point' },
                  { label: 'Tackles',      event: 'tackle-point' },
                  { label: 'All Outs',     event: 'all-out' }] }],
  tennis:      rally({ label: 'Double Faults', event: 'double-fault' }),
  volleyball:  rally({ label: 'Blocks',        event: 'block' }),
  badminton:   rally({ label: 'Faults',        event: 'fault' }),
  tabletennis: rally({ label: 'Faults',        event: 'fault' }),
  pickleball:  rally({ label: 'Faults',        event: 'fault' }),
  squash:      [{ id: 'rally', label: 'Rally', rows: [
                  { label: 'Points',  event: 'point' },
                  { label: 'Strokes', event: 'stroke' },
                  { label: 'Lets',    event: 'let' }] }],
};

// Neutral fallback: a sport with no event mapping has no career table to draw.
// Matches played is still reported — it's in the screen's career line, above
// the panels — so an empty table here is a missing table, not a missing screen.
const GENERIC = [
  { id: 'overview', label: 'Overview', rows: [] },
];

export const getCareerPanels = (sportId) => PANELS[sportId] || GENERIC;

/** Resolve one row against the stats payload; '—' when there's nothing to show. */
export const readStat = (row, stats = {}) => {
  if (row.event) return stats.eventTotals?.[row.event] ?? 0;
  // A dismissal mode is only worth listing once the player has been out at all;
  // otherwise every mode reads 0 and the panel drops out entirely, which is the
  // honest answer for someone who has never lost their wicket.
  if (row.out) {
    const d = stats.dismissalTypes;
    if (!d || !Object.keys(d).length) return '—';
    return d[row.out] ?? 0;
  }
  // 'bowling.death.economy' — null when the player hasn't bowled enough in that
  // phase for a rate to mean anything, which drops the row.
  if (row.phase) {
    const v = row.phase.split('.').reduce((o, k) => o?.[k], stats.phases);
    return v == null ? '—' : v;
  }
  const v = stats[row.key] ?? (row.alt ? stats[row.alt] : undefined);
  if (v == null) return '—';
  // Percentages read as numbers otherwise: "82" is not "82%".
  return row.suffix ? `${v}${row.suffix}` : v;
};

export default { getCareerPanels, readStat };

// ── Rankings boards ──────────────────────────────────────────────────────────
// The Rankings tab used to be cricket-only (Runs / Wickets / Economy), so other
// sports saw a table of zeros under cricket headings. Non-cricket boards rank
// on SportEvent tallies; cricket keeps its own derived-stat boards.
// Boards match the shape StatisticsScreen expects: value() to rank on,
// qualify() to filter, better to set the direction.
const board = (id, label, event, icon = 'chart-bar') => ({
  id, label, icon, event,
  value: (row) => row?.eventTotals?.[event] ?? 0,
  // Everyone who has played is listed — a striker on 0 goals is a real answer,
  // and hiding them would make an empty board look broken.
  qualify: () => true,
  better: 'high',
});

const RANKING_BOARDS = {
  football:   [board('goal', 'Goals', 'goal', 'soccer'),
               board('yellow-card', 'Yellows', 'yellow-card', 'card')],
  hockey:     [board('goal', 'Goals', 'goal', 'hockey-sticks')],
  basketball: [board('2pt', '2-Pointers', '2pt', 'basketball'),
               board('3pt', '3-Pointers', '3pt', 'basketball')],
  kabaddi:    [board('raid', 'Raid Points', 'raid', 'run-fast')],
};

const GENERIC_BOARDS = [{
  id: 'matches', label: 'Matches', icon: 'calendar-check', key: 'matches',
  value: (row) => row?.matches ?? 0, qualify: () => true, better: 'high',
}];

/** Ranking boards for a sport (empty for cricket — it has its own). */
export const getRankingBoards = (sportId) =>
  sportId === 'cricket' ? [] : (RANKING_BOARDS[sportId] || GENERIC_BOARDS);

/** Value a leaderboard row scores on, for a given board. */
export const rankValue = (row, board) =>
  board.event ? (row.eventTotals?.[board.event] ?? 0) : (row[board.key] ?? 0);
