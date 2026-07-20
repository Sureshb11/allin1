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
// Adding a sport = add an entry. Anything not listed falls back to a generic
// "Matches + events" panel, so a new sport is never worse than neutral.

const CRICKET = [
  { id: 'batting', label: 'Batting', rows: [
    { label: 'Matches',      key: 'matches' },
    { label: 'Runs',         key: 'runs' },
    { label: 'Average',      key: 'battingAverage', alt: 'average' },
    { label: 'Strike Rate',  key: 'battingStrikeRate', alt: 'strikeRate' },
    { label: 'Fifties',      key: 'halfCenturies' },
    { label: 'Hundreds',     key: 'centuries' },
  ]},
  { id: 'bowling', label: 'Bowling', rows: [
    { label: 'Wickets',      key: 'wickets' },
    { label: 'Bowling Avg',  key: 'bowlingAverage' },
    { label: 'Economy',      key: 'economy' },
    { label: 'Best Figures', key: 'bestBowling' },
    { label: '5-wkt Hauls',  key: 'fiveWickets' },
  ]},
];

const FOOTBALL = [
  { id: 'attack', label: 'Attack', rows: [
    { label: 'Matches',   key: 'matches' },
    { label: 'Goals',     event: 'goal' },
    { label: 'Assists',   event: 'assist' },
  ]},
  { id: 'discipline', label: 'Discipline', rows: [
    { label: 'Yellow Cards', event: 'yellow-card' },
    { label: 'Red Cards',    event: 'red-card' },
    { label: 'Offsides',     event: 'offside' },
  ]},
];

// Court/racquet sports share a points-and-faults shape.
const RALLY = [
  { id: 'scoring', label: 'Scoring', rows: [
    { label: 'Matches', key: 'matches' },
    { label: 'Points',  event: 'point' },
    { label: 'Aces',    event: 'ace' },
  ]},
  { id: 'errors', label: 'Errors', rows: [
    { label: 'Double Faults', event: 'double-fault' },
    { label: 'Faults',        event: 'fault' },
  ]},
];

const PANELS = {
  cricket:     CRICKET,
  football:    FOOTBALL,
  hockey:      [{ id: 'attack', label: 'Attack', rows: [
                  { label: 'Matches', key: 'matches' },
                  { label: 'Goals',   event: 'goal' }] }],
  basketball:  [{ id: 'scoring', label: 'Scoring', rows: [
                  { label: 'Matches',    key: 'matches' },
                  { label: '2-Pointers', event: '2pt' },
                  { label: '3-Pointers', event: '3pt' },
                  { label: 'Free Throws',event: 'freethrow' }] }],
  tennis:      RALLY,
  badminton:   RALLY,
  tabletennis: RALLY,
  volleyball:  RALLY,
  squash:      RALLY,
  pickleball:  RALLY,
};

// Neutral fallback: matches played, and nothing invented.
const GENERIC = [
  { id: 'overview', label: 'Overview', rows: [{ label: 'Matches', key: 'matches' }] },
];

export const getCareerPanels = (sportId) => PANELS[sportId] || GENERIC;

/** Resolve one row against the stats payload; '—' when there's nothing to show. */
export const readStat = (row, stats = {}) => {
  if (row.event) return stats.eventTotals?.[row.event] ?? 0;
  const v = stats[row.key] ?? (row.alt ? stats[row.alt] : undefined);
  return v ?? '—';
};

export default { getCareerPanels, readStat };
