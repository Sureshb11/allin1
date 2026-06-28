// Per-sport live-scoring rules (periods, actions, extras, scoreLabel).
// Single source of truth for the SportScoringScreen. Add a sport here to
// give it custom scoring; unknown sports fall back to cricket.
import { DS } from '../theme/scoringTokens';

// count / sum events
export const cnt = (events, teamId, type) =>
  events.filter(e => e.teamId === teamId && e.eventType === type).length;
export const pts = (events, teamId, types) =>
  events.filter(e => e.teamId === teamId && types.includes(e.eventType))
        .reduce((s, e) => s + e.value, 0);

export const SPORT_CONFIG = {
  cricket: {
    icon: 'cricket', color: '#22c55e', accent: DS.tertiary,
    periods: ['Inn. 1', 'Inn. 2'], maxPeriods: 2,
    // Cricket uses a special 3x3 grid layout — actions defined inline
    actions: [
      { type: 'dot',     label: '0',       sub: 'DOT',       value: 0, color: DS.onVariant, gridSpecial: false },
      { type: 'run-1',   label: '1',       sub: 'SINGLE',    value: 1, color: DS.onSurface, gridSpecial: false },
      { type: 'run-2',   label: '2',       sub: 'DOUBLE',    value: 2, color: DS.onSurface, gridSpecial: false },
      { type: 'run-3',   label: '3',       sub: 'TRIPLE',    value: 3, color: DS.onSurface, gridSpecial: false },
      { type: 'four',    label: '4',       sub: 'BOUNDARY',  value: 4, color: DS.primary,   gridSpecial: 'boundary' },
      { type: 'six',     label: '6',       sub: 'MAXIMUM',   value: 6, color: DS.tertiary,  gridSpecial: 'maximum' },
      { type: 'wide',    label: 'WD',      sub: 'WIDE',      value: 1, color: DS.secondary, gridSpecial: 'extra' },
      { type: 'no-ball', label: 'NB',      sub: 'NO BALL',   value: 1, color: DS.secondary, gridSpecial: 'extra' },
      { type: 'wicket',  label: '\u2716',  sub: 'WICKET',    value: 0, color: DS.error,     gridSpecial: 'wicket', icon: 'close' },
    ],
    extras: [
      { type: 'bye',     label: 'Bye',     value: 1 },
      { type: 'leg-bye', label: 'Leg Bye', value: 1 },
    ],
    scoreLabel: (events, teamId) => {
      const runTypes = ['run-1', 'run-2', 'run-3', 'four', 'six', 'wide', 'no-ball', 'bye', 'leg-bye'];
      const runs    = pts(events, teamId, runTypes);
      const wickets = cnt(events, teamId, 'wicket');
      return `${runs}/${wickets}`;
    },
    oversLabel: (events, teamId) => {
      const legal = events.filter(e =>
        e.teamId === teamId && !['wide', 'no-ball'].includes(e.eventType)
      ).length;
      return `${Math.floor(legal / 6)}.${legal % 6}`;
    },
  },

  football: {
    icon: 'soccer', color: '#16a34a',
    periods: ['1st Half', '2nd Half', 'Extra Time'], maxPeriods: 3,
    actions: [
      { type: 'goal',        label: 'Goal',     icon: 'soccer',        value: 1, color: '#22c55e' },
      { type: 'corner',      label: 'Corner',   icon: 'flag-triangle', value: 0, color: '#0ea5e9' },
      { type: 'yellow-card', label: 'Yellow',   icon: 'card',          value: 0, color: '#eab308' },
      { type: 'red-card',    label: 'Red Card', icon: 'card',          value: 0, color: '#ef4444' },
      { type: 'offside',     label: 'Offside',  icon: 'flag-outline',  value: 0, color: DS.muted },
    ],
    scoreLabel: (events, teamId) => String(cnt(events, teamId, 'goal')),
  },

  basketball: {
    icon: 'basketball', color: '#ea580c',
    periods: ['Q1', 'Q2', 'Q3', 'Q4', 'OT'], maxPeriods: 5,
    actions: [
      { type: '2pt',       label: '2 Pts',      icon: 'basketball',      value: 2, color: DS.primary },
      { type: '3pt',       label: '3 Pts',      icon: 'basketball',      value: 3, color: '#8b5cf6' },
      { type: 'freethrow', label: 'Free Throw', icon: 'circle-outline',  value: 1, color: '#0ea5e9' },
      { type: 'foul',      label: 'Foul',       icon: 'hand-back-right', value: 0, color: '#f97316' },
      { type: 'timeout',   label: 'Timeout',    icon: 'timer-outline',   value: 0, color: DS.muted },
    ],
    scoreLabel: (events, teamId) => String(pts(events, teamId, ['2pt', '3pt', 'freethrow'])),
  },

  tennis: {
    icon: 'tennis', color: '#65a30d',
    periods: ['Set 1', 'Set 2', 'Set 3', 'Set 4', 'Set 5'], maxPeriods: 5,
    actions: [
      { type: 'point',        label: 'Point',     icon: 'tennis',         value: 1, color: DS.primary },
      { type: 'ace',          label: 'Ace',        icon: 'lightning-bolt', value: 1, color: '#f59e0b' },
      { type: 'game-win',     label: 'Game Won',   icon: 'trophy-outline', value: 1, color: '#22c55e' },
      { type: 'set-win',      label: 'Set Won',    icon: 'star',          value: 1, color: '#f97316' },
      { type: 'double-fault', label: 'Dbl Fault',  icon: 'close-circle',  value: 0, color: DS.error },
    ],
    scoreLabel: (events, teamId) => {
      const sets  = cnt(events, teamId, 'set-win');
      const games = cnt(events, teamId, 'game-win');
      return `${sets}S ${games}G`;
    },
  },

  volleyball: {
    icon: 'volleyball', color: '#2563eb',
    periods: ['Set 1', 'Set 2', 'Set 3', 'Set 4', 'Set 5'], maxPeriods: 5,
    actions: [
      { type: 'rally',   label: 'Point',    icon: 'volleyball',      value: 1, color: DS.primary },
      { type: 'ace',     label: 'Ace',      icon: 'lightning-bolt',  value: 1, color: '#f59e0b' },
      { type: 'block',   label: 'Block',    icon: 'hand-back-right', value: 1, color: '#8b5cf6' },
      { type: 'set-win', label: 'Set Won',  icon: 'star',            value: 1, color: '#22c55e' },
    ],
    scoreLabel: (events, teamId) => {
      const sets = cnt(events, teamId, 'set-win');
      const p   = pts(events, teamId, ['rally', 'ace', 'block']);
      return `${sets}S ${p}pts`;
    },
  },

  badminton: {
    icon: 'badminton', color: '#0d9488',
    periods: ['Game 1', 'Game 2', 'Game 3'], maxPeriods: 3,
    actions: [
      { type: 'point',    label: 'Point',    icon: 'badminton',       value: 1, color: DS.primary },
      { type: 'ace',      label: 'Ace',      icon: 'lightning-bolt',  value: 1, color: '#f59e0b' },
      { type: 'game-win', label: 'Game Won', icon: 'trophy-outline',  value: 1, color: '#22c55e' },
      { type: 'fault',    label: 'Fault',    icon: 'close-circle',    value: 0, color: DS.error },
    ],
    scoreLabel: (events, teamId) => {
      const gw = cnt(events, teamId, 'game-win');
      const p  = pts(events, teamId, ['point', 'ace']);
      return `${gw}G ${p}pts`;
    },
  },

  tabletennis: {
    icon: 'table-tennis', color: '#7c3aed',
    periods: ['Game 1', 'Game 2', 'Game 3', 'Game 4', 'Game 5', 'Game 6', 'Game 7'],
    maxPeriods: 7,
    actions: [
      { type: 'point',    label: 'Point',    icon: 'table-tennis',   value: 1, color: DS.primary },
      { type: 'ace',      label: 'Ace',      icon: 'lightning-bolt', value: 1, color: '#f59e0b' },
      { type: 'game-win', label: 'Game Won', icon: 'trophy-outline', value: 1, color: '#22c55e' },
      { type: 'fault',    label: 'Fault',    icon: 'close-circle',   value: 0, color: DS.error },
    ],
    scoreLabel: (events, teamId) => {
      const gw = cnt(events, teamId, 'game-win');
      const p  = pts(events, teamId, ['point', 'ace']);
      return `${gw}G ${p}pts`;
    },
  },

  hockey: {
    icon: 'hockey-sticks', color: '#0284c7',
    periods: ['Q1', 'Q2', 'Q3', 'Q4'], maxPeriods: 4,
    actions: [
      { type: 'goal',           label: 'Goal',       icon: 'hockey-sticks', value: 1, color: '#22c55e' },
      { type: 'penalty-corner', label: 'Pen Corner', icon: 'flag-triangle', value: 0, color: '#0ea5e9' },
      { type: 'yellow-card',    label: 'Yellow',     icon: 'card',          value: 0, color: '#eab308' },
      { type: 'red-card',       label: 'Red Card',   icon: 'card',          value: 0, color: DS.error },
    ],
    scoreLabel: (events, teamId) => String(cnt(events, teamId, 'goal')),
  },

  kabaddi: {
    icon: 'run-fast', color: '#f97316',
    periods: ['1st Half', '2nd Half'], maxPeriods: 2,
    actions: [
      { type: 'touch-point',  label: 'Touch Pt',  icon: 'run-fast',        value: 1, color: '#22c55e' },
      { type: 'bonus-point',  label: 'Bonus',     icon: 'plus-circle',     value: 1, color: '#f59e0b' },
      { type: 'tackle-point', label: 'Tackle',    icon: 'hand-back-right', value: 1, color: '#8b5cf6' },
      { type: 'all-out',      label: 'All Out',   icon: 'lightning-bolt',  value: 2, color: DS.error },
    ],
    scoreLabel: (events, teamId) => {
      const p  = pts(events, teamId, ['touch-point', 'bonus-point', 'tackle-point']);
      const ao = cnt(events, teamId, 'all-out') * 2;
      return String(p + ao);
    },
  },

  khokho: {
    icon: 'run', color: '#ef4444',
    periods: ['Turn 1', 'Turn 2', 'Turn 3', 'Turn 4'], maxPeriods: 4,
    actions: [
      { type: 'out',   label: 'Out',   icon: 'run',         value: 1, color: DS.primary },
      { type: 'bonus', label: 'Bonus', icon: 'plus-circle', value: 2, color: '#f59e0b' },
    ],
    scoreLabel: (events, teamId) => String(pts(events, teamId, ['out', 'bonus'])),
  },

  boxing: {
    icon: 'boxing-glove', color: '#9f1239',
    periods: ['Rd 1','Rd 2','Rd 3','Rd 4','Rd 5','Rd 6','Rd 7','Rd 8','Rd 9','Rd 10','Rd 11','Rd 12'],
    maxPeriods: 12,
    actions: [
      { type: 'punch-landed', label: 'Punch',     icon: 'boxing-glove',    value: 1, color: DS.primary },
      { type: 'knockdown',    label: 'Knockdown', icon: 'arrow-down-bold', value: 0, color: '#f97316' },
      { type: 'round-win',    label: 'Round Win', icon: 'trophy-outline',  value: 1, color: '#22c55e' },
      { type: 'ko',           label: 'KO',        icon: 'lightning-bolt',  value: 0, color: DS.error },
    ],
    scoreLabel: (events, teamId) => {
      if (cnt(events, teamId, 'ko') > 0) return 'KO';
      return `${cnt(events, teamId, 'round-win')} rds`;
    },
  },

  karate: {
    icon: 'karate', color: '#b91c1c',
    periods: ['Bout'], maxPeriods: 1,
    actions: [
      { type: 'yuko',     label: 'Yuko (1)',      icon: 'karate',       value: 1, color: '#0ea5e9' },
      { type: 'waza-ari', label: 'Waza-ari (2)', icon: 'karate',       value: 2, color: '#f59e0b' },
      { type: 'ippon',    label: 'Ippon (3)',    icon: 'karate',       value: 3, color: '#22c55e' },
      { type: 'penalty',  label: 'Penalty',       icon: 'close-circle', value: 0, color: DS.error },
    ],
    scoreLabel: (events, teamId) => String(pts(events, teamId, ['yuko', 'waza-ari', 'ippon'])),
  },

  judo: {
    icon: 'human-handsup', color: '#1d4ed8',
    periods: ['Bout'], maxPeriods: 1,
    actions: [
      { type: 'yuko',     label: 'Yuko (5)',     icon: 'human-handsup', value: 5,  color: '#0ea5e9' },
      { type: 'waza-ari', label: 'Waza-ari (7)', icon: 'human-handsup', value: 7,  color: '#f59e0b' },
      { type: 'ippon',    label: 'Ippon (10)',   icon: 'lightning-bolt', value: 10, color: '#22c55e' },
      { type: 'penalty',  label: 'Shido',         icon: 'close-circle',  value: 0,  color: DS.error },
    ],
    scoreLabel: (events, teamId) => String(pts(events, teamId, ['yuko', 'waza-ari', 'ippon'])),
  },

  wrestling: {
    icon: 'arm-flex-outline', color: '#dc2626',
    periods: ['Period 1', 'Period 2', 'Period 3'], maxPeriods: 3,
    actions: [
      { type: 'takedown', label: 'Takedown (2)', icon: 'arm-flex-outline', value: 2, color: DS.primary },
      { type: 'escape',   label: 'Escape (1)',   icon: 'run',              value: 1, color: '#0ea5e9' },
      { type: 'reversal', label: 'Reversal (2)', icon: 'refresh',          value: 2, color: '#8b5cf6' },
      { type: 'nearfall', label: 'Nearfall',     icon: 'chevron-down',     value: 2, color: '#f59e0b' },
      { type: 'pin',      label: 'Pin',          icon: 'lightning-bolt',   value: 0, color: DS.error },
    ],
    scoreLabel: (events, teamId) => {
      if (cnt(events, teamId, 'pin') > 0) return 'Pin!';
      return String(pts(events, teamId, ['takedown', 'escape', 'reversal', 'nearfall']));
    },
  },

  handball: {
    icon: 'handball', color: '#d97706',
    periods: ['1st Half', '2nd Half', 'Extra Time'], maxPeriods: 3,
    actions: [
      { type: 'goal',        label: 'Goal',     icon: 'handball',   value: 1, color: '#22c55e' },
      { type: '7m-throw',    label: '7m Goal',  icon: 'handball',   value: 1, color: '#0ea5e9' },
      { type: 'yellow-card', label: 'Yellow',   icon: 'card',       value: 0, color: '#eab308' },
      { type: 'red-card',    label: 'Red Card', icon: 'card',       value: 0, color: DS.error },
    ],
    scoreLabel: (events, teamId) => String(cnt(events, teamId, 'goal') + cnt(events, teamId, '7m-throw')),
  },

  squash: {
    icon: 'racquetball', color: '#9333ea',
    periods: ['Game 1', 'Game 2', 'Game 3', 'Game 4', 'Game 5'], maxPeriods: 5,
    actions: [
      { type: 'point',    label: 'Point',    icon: 'racquetball',    value: 1, color: DS.primary },
      { type: 'game-win', label: 'Game Won', icon: 'trophy-outline', value: 1, color: '#22c55e' },
      { type: 'let',      label: 'Let',      icon: 'refresh',        value: 0, color: DS.muted },
      { type: 'stroke',   label: 'Stroke',   icon: 'lightning-bolt', value: 1, color: '#f59e0b' },
    ],
    scoreLabel: (events, teamId) => {
      const gw = cnt(events, teamId, 'game-win');
      const p  = pts(events, teamId, ['point', 'stroke']);
      return `${gw}G ${p}pts`;
    },
  },

  pickleball: {
    icon: 'tennis', color: '#ca8a04',
    periods: ['Game 1', 'Game 2', 'Game 3'], maxPeriods: 3,
    actions: [
      { type: 'point',    label: 'Point',    icon: 'tennis',         value: 1, color: DS.primary },
      { type: 'ace',      label: 'Ace',      icon: 'lightning-bolt', value: 1, color: '#f59e0b' },
      { type: 'game-win', label: 'Game Won', icon: 'trophy-outline', value: 1, color: '#22c55e' },
      { type: 'fault',    label: 'Fault',    icon: 'close-circle',   value: 0, color: DS.error },
    ],
    scoreLabel: (events, teamId) => {
      const gw = cnt(events, teamId, 'game-win');
      const p  = pts(events, teamId, ['point', 'ace']);
      return `${gw}G ${p}pts`;
    },
  },

  skateboard: {
    icon: 'skateboard', color: '#0369a1',
    periods: ['Run 1', 'Run 2'], maxPeriods: 2,
    actions: [
      { type: 'run-score-90', label: '90+ Score', icon: 'skateboard',    value: 90, color: '#f59e0b' },
      { type: 'run-score-80', label: '80+ Score', icon: 'skateboard',    value: 80, color: DS.primary },
      { type: 'run-score-70', label: '70+ Score', icon: 'skateboard',    value: 70, color: '#0ea5e9' },
      { type: 'crash',        label: 'Bail'        , icon: 'close-circle', value: 0,  color: DS.error },
    ],
    scoreLabel: (events, teamId) => {
      const runs = events.filter(e => e.teamId === teamId && e.eventType.startsWith('run-score'));
      const best = runs.length ? Math.max(...runs.map(e => e.value)) : 0;
      return best > 0 ? `${best} pts` : '–';
    },
  },
};

// Config for a sport id, falling back to cricket for unknowns.
export const getScoringConfig = (sport) => SPORT_CONFIG[sport] || SPORT_CONFIG.cricket;

export default { SPORT_CONFIG, getScoringConfig, cnt, pts };
