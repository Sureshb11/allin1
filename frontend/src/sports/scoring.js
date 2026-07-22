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

// ── Auto game/set engine ────────────────────────────────────────────────────
// Replays point events in order so the score auto-advances point→game/set per
// the sport's rules — no manual "Game Won"/"Set Won" tapping. Shared verbatim
// with the backend (matches.js) so the live + match-detail scores agree.
export const RALLY_RULES = {
  volleyball:  { unitPts: 25, unitsToWin: 3, maxUnits: 5, finalUnitPts: 15 },
  badminton:   { unitPts: 21, unitsToWin: 2, maxUnits: 3, cap: 30 },
  tabletennis: { unitPts: 11, unitsToWin: 4, maxUnits: 7 },
  squash:      { unitPts: 11, unitsToWin: 3, maxUnits: 5 },
  pickleball:  { unitPts: 11, unitsToWin: 2, maxUnits: 3 },
};
// Rally-winning event types that advance a game/set by one point.
const POINT_TYPES = new Set(['point', 'rally', 'ace', 'stroke', 'block']);
const isPoint = (e) => POINT_TYPES.has(e.eventType);

// → { team1:{units,points}, team2:{units,points} } for first-arg = team1.
export function deriveRally(events, t1, t2, rules) {
  const u = { [t1]: 0, [t2]: 0 }, p = { [t1]: 0, [t2]: 0 };
  for (const e of events) {
    if (!isPoint(e) || (e.teamId !== t1 && e.teamId !== t2)) continue;
    const tid = e.teamId, opp = tid === t1 ? t2 : t1;
    if (u[tid] >= rules.unitsToWin || u[opp] >= rules.unitsToWin) continue;
    p[tid] += 1;
    const played = u[t1] + u[t2];
    const target = (rules.finalUnitPts && played === rules.maxUnits - 1) ? rules.finalUnitPts : rules.unitPts;
    const win = (p[tid] >= target && p[tid] - p[opp] >= 2) || (rules.cap && p[tid] >= rules.cap);
    if (win) { u[tid] += 1; p[t1] = 0; p[t2] = 0; }
  }
  return { team1: { units: u[t1], points: p[t1] }, team2: { units: u[t2], points: p[t2] } };
}

const TENNIS = { setsToWin: 2 };
const PT_LABEL = ['0', '15', '30', '40'];
// Tennis: points 0/15/30/40/deuce/ad → games (to 6, win by 2; tiebreak at 6-6) → sets.
export function deriveTennis(events, t1, t2) {
  const sets = { [t1]: 0, [t2]: 0 }, games = { [t1]: 0, [t2]: 0 }, pts2 = { [t1]: 0, [t2]: 0 };
  const disp = { [t1]: '0', [t2]: '0' };
  for (const e of events) {
    if (!isPoint(e) || (e.teamId !== t1 && e.teamId !== t2)) continue;
    const tid = e.teamId, opp = tid === t1 ? t2 : t1;
    if (sets[tid] >= TENNIS.setsToWin || sets[opp] >= TENNIS.setsToWin) continue;
    const tiebreak = games[t1] === 6 && games[t2] === 6;
    pts2[tid] += 1;
    let gameWon = false;
    if (tiebreak) {
      gameWon = pts2[tid] >= 7 && pts2[tid] - pts2[opp] >= 2;
      disp[tid] = String(pts2[tid]); disp[opp] = String(pts2[opp]);
    } else if (pts2[tid] >= 4 && pts2[tid] - pts2[opp] >= 2) {
      gameWon = true;
    } else if (pts2[tid] >= 3 && pts2[opp] >= 3) {
      if (pts2[tid] === pts2[opp]) { disp[tid] = '40'; disp[opp] = '40'; }
      else if (pts2[tid] > pts2[opp]) { disp[tid] = 'Ad'; disp[opp] = '40'; }
      else { disp[tid] = '40'; disp[opp] = 'Ad'; }
    } else {
      disp[tid] = PT_LABEL[Math.min(pts2[tid], 3)]; disp[opp] = PT_LABEL[Math.min(pts2[opp], 3)];
    }
    if (gameWon) {
      games[tid] += 1; pts2[t1] = 0; pts2[t2] = 0; disp[t1] = '0'; disp[t2] = '0';
      const setWon = (games[tid] >= 6 && games[tid] - games[opp] >= 2) || games[tid] === 7;
      if (setWon) { sets[tid] += 1; games[t1] = 0; games[t2] = 0; }
    }
  }
  return {
    team1: { sets: sets[t1], games: games[t1], points: disp[t1] },
    team2: { sets: sets[t2], games: games[t2], points: disp[t2] },
  };
}

// Display helpers used by the per-team scoreLabel (teamId = "my" side).
const rallyLabel = (sport) => (events, teamId, oppId) => {
  const d = deriveRally(events, teamId, oppId || '∅', RALLY_RULES[sport]);
  return `${d.team1.units} (${d.team1.points})`;
};
const tennisLabel = (events, teamId, oppId) => {
  const d = deriveTennis(events, teamId, oppId || '∅');
  return `${d.team1.sets}-${d.team1.games} ${d.team1.points}`;
};

// ── Winner detection ────────────────────────────────────────────────────────
// Instant finishes (the event ends the match) + a numeric rank fallback.
const INSTANT = {
  boxing:    (ev, t) => cnt(ev, t, 'ko') > 0 && 'KO',
  wrestling: (ev, t) => cnt(ev, t, 'pin') > 0 && 'Pin',
  judo:      (ev, t) => (cnt(ev, t, 'ippon') > 0 || cnt(ev, t, 'waza-ari') >= 2) && 'Ippon',
};
const setUnits = (sport, ev, t, o) =>
  sport === 'tennis' ? deriveTennis(ev, t, o).team1.sets : deriveRally(ev, t, o, RALLY_RULES[sport]).team1.units;
const RANK = {
  football:   (ev, t) => cnt(ev, t, 'goal'),
  hockey:     (ev, t) => cnt(ev, t, 'goal'),
  handball:   (ev, t) => cnt(ev, t, 'goal') + cnt(ev, t, '7m-throw'),
  basketball: (ev, t) => pts(ev, t, ['2pt', '3pt', 'freethrow']),
  kabaddi:    (ev, t) => pts(ev, t, ['touch-point', 'bonus-point', 'tackle-point']) + cnt(ev, t, 'all-out') * 2,
  khokho:     (ev, t) => pts(ev, t, ['out', 'pole-dive', 'bonus']),
  karate:     (ev, t) => pts(ev, t, ['yuko', 'waza-ari', 'ippon']),
  boxing:     (ev, t) => cnt(ev, t, 'round-win'),
  wrestling:  (ev, t) => pts(ev, t, ['takedown', 'escape', 'reversal', 'nearfall']),
  judo:       (ev, t) => cnt(ev, t, 'waza-ari'),
};

/** Decide a winner: { side:'team1'|'team2'|null, reason, instant }. */
export function decideWinner(sport, events, t1, t2) {
  const inst = INSTANT[sport];
  if (inst) {
    if (inst(events, t1)) return { side: 'team1', reason: inst(events, t1), instant: true };
    if (inst(events, t2)) return { side: 'team2', reason: inst(events, t2), instant: true };
  }
  let r1, r2;
  if (RALLY_RULES[sport] || sport === 'tennis') {
    r1 = setUnits(sport, events, t1, t2); r2 = setUnits(sport, events, t2, t1);
    const need = sport === 'tennis' ? TENNIS.setsToWin : RALLY_RULES[sport].unitsToWin;
    if (r1 >= need) return { side: 'team1', reason: null, instant: true };
    if (r2 >= need) return { side: 'team2', reason: null, instant: true };
  } else {
    const rank = RANK[sport] || ((ev, t) => pts(ev, t, [...new Set(ev.map(e => e.eventType))]));
    r1 = rank(events, t1); r2 = rank(events, t2);
  }
  if (r1 === r2) return { side: null, reason: 'Draw', instant: false };
  return { side: r1 > r2 ? 'team1' : 'team2', reason: null, instant: false };
}

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
      { type: 'double-fault', label: 'Dbl Fault',  icon: 'close-circle',  value: 0, color: DS.error },
    ],
    scoreLabel: tennisLabel,   // auto sets-games points (deuce/tiebreak handled)
  },

  volleyball: {
    icon: 'volleyball', color: '#2563eb',
    periods: ['Set 1', 'Set 2', 'Set 3', 'Set 4', 'Set 5'], maxPeriods: 5,
    actions: [
      { type: 'point',   label: 'Point',    icon: 'volleyball',      value: 1, color: DS.primary },
      { type: 'ace',     label: 'Ace',      icon: 'lightning-bolt',  value: 1, color: '#f59e0b' },
      { type: 'block',   label: 'Block',    icon: 'hand-back-right', value: 1, color: '#8b5cf6' },
    ],
    scoreLabel: rallyLabel('volleyball'),   // auto sets (to 25, final to 15)
  },

  badminton: {
    icon: 'badminton', color: '#0d9488',
    periods: ['Game 1', 'Game 2', 'Game 3'], maxPeriods: 3,
    actions: [
      { type: 'point',    label: 'Point',    icon: 'badminton',       value: 1, color: DS.primary },
      { type: 'ace',      label: 'Ace',      icon: 'lightning-bolt',  value: 1, color: '#f59e0b' },
      { type: 'fault',    label: 'Fault',    icon: 'close-circle',    value: 0, color: DS.error },
    ],
    scoreLabel: rallyLabel('badminton'),   // auto games (to 21, cap 30)
  },

  tabletennis: {
    icon: 'table-tennis', color: '#7c3aed',
    periods: ['Game 1', 'Game 2', 'Game 3', 'Game 4', 'Game 5', 'Game 6', 'Game 7'],
    maxPeriods: 7,
    actions: [
      { type: 'point',    label: 'Point',    icon: 'table-tennis',   value: 1, color: DS.primary },
      { type: 'ace',      label: 'Ace',      icon: 'lightning-bolt', value: 1, color: '#f59e0b' },
      { type: 'fault',    label: 'Fault',    icon: 'close-circle',   value: 0, color: DS.error },
    ],
    scoreLabel: rallyLabel('tabletennis'),   // auto games (to 11, best of 7)
  },

  squash: {
    icon: 'racquetball', color: '#2f26ff',
    periods: ['Game 1', 'Game 2', 'Game 3', 'Game 4', 'Game 5'], maxPeriods: 5,
    actions: [
      { type: 'point',  label: 'Point',  icon: 'racquetball',   value: 1, color: DS.primary },
      { type: 'stroke', label: 'Stroke', icon: 'whistle',       value: 1, color: '#f59e0b' },
      { type: 'fault',  label: 'Fault',  icon: 'close-circle',  value: 0, color: DS.error },
    ],
    scoreLabel: rallyLabel('squash'),   // auto games (to 11, best of 5)
  },

  pickleball: {
    icon: 'table-tennis', color: '#ff9a14',
    periods: ['Game 1', 'Game 2', 'Game 3'], maxPeriods: 3,
    actions: [
      { type: 'point',  label: 'Point',  icon: 'table-tennis',   value: 1, color: DS.primary },
      { type: 'ace',    label: 'Ace',    icon: 'lightning-bolt', value: 1, color: '#f59e0b' },
      { type: 'fault',  label: 'Fault',  icon: 'close-circle',   value: 0, color: DS.error },
    ],
    scoreLabel: rallyLabel('pickleball'),   // auto games (to 11, best of 3)
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
      { type: 'out',       label: 'Out',       icon: 'run',             value: 1, color: DS.primary },
      { type: 'pole-dive', label: 'Pole Dive', icon: 'arrow-down-bold', value: 1, color: '#8b5cf6' },
      { type: 'bonus',     label: 'Dream Run', icon: 'star',            value: 2, color: '#f59e0b' },
    ],
    scoreLabel: (events, teamId) => String(pts(events, teamId, ['out', 'pole-dive', 'bonus'])),
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
    // Modern judo (post-2017): only waza-ari & ippon. Two waza-ari = ippon = win.
    icon: 'human-handsup', color: '#1d4ed8',
    periods: ['Bout'], maxPeriods: 1,
    actions: [
      { type: 'ippon',    label: 'Ippon',    icon: 'lightning-bolt', value: 1, color: '#22c55e' },
      { type: 'waza-ari', label: 'Waza-ari', icon: 'human-handsup',  value: 1, color: '#f59e0b' },
      { type: 'penalty',  label: 'Shido',    icon: 'close-circle',   value: 0, color: DS.error },
    ],
    scoreLabel: (events, teamId) => {
      if (cnt(events, teamId, 'ippon') > 0 || cnt(events, teamId, 'waza-ari') >= 2) return 'Ippon';
      return `${cnt(events, teamId, 'waza-ari')} wa`;
    },
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
      { type: 'stroke',   label: 'Stroke',   icon: 'lightning-bolt', value: 1, color: '#f59e0b' },
      { type: 'let',      label: 'Let',      icon: 'refresh',        value: 0, color: DS.muted },
    ],
    scoreLabel: rallyLabel('squash'),   // auto games (to 11, best of 5)
  },

  pickleball: {
    icon: 'tennis', color: '#ca8a04',
    periods: ['Game 1', 'Game 2', 'Game 3'], maxPeriods: 3,
    actions: [
      { type: 'point',    label: 'Point',    icon: 'tennis',         value: 1, color: DS.primary },
      { type: 'ace',      label: 'Ace',      icon: 'lightning-bolt', value: 1, color: '#f59e0b' },
      { type: 'fault',    label: 'Fault',    icon: 'close-circle',   value: 0, color: DS.error },
    ],
    scoreLabel: rallyLabel('pickleball'),   // auto games (to 11, best of 3)
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

// ── Server-driven config (SportConfiguration table) ─────────────────────────
// The declarative rules (periods, actions, extras) can be served from the
// backend so a sport's scoring UI is editable from the DB with no app release.
// We merge those over the bundled config but KEEP the bundled score functions
// (scoreLabel/oversLabel) and the derive engine — score COMPUTATION stays in
// the app; only the declarative shape comes from data. Until hydrated (or if
// the fetch fails / backend is old), everything falls back to bundled, so
// behaviour is identical to before.
const _server = {};
const resolveColor = (c) =>
  (typeof c === 'string' && !c.startsWith('#') && DS[c] != null) ? DS[c] : c;

export function applyServerConfigs(configs) {
  if (!Array.isArray(configs)) return;
  for (const cfg of configs) {
    const r = cfg?.rules;
    if (!r || !Array.isArray(r.actions)) continue;
    _server[cfg.id] = {
      periods: r.periods,
      maxPeriods: r.maxPeriods,
      extras: r.extras,
      actions: r.actions.map((a) => ({ ...a, color: resolveColor(a.color) })),
    };
  }
}

const mergeActions = (base = [], srv = []) =>
  srv.map((sa) => ({ ...(base.find((b) => b.type === sa.type) || {}), ...sa }));

// Config for a sport id, falling back to cricket for unknowns. Server override
// (if hydrated) replaces the declarative fields; bundled functions are kept.
export const getScoringConfig = (sport) => {
  const base = SPORT_CONFIG[sport] || SPORT_CONFIG.cricket;
  const o = _server[sport];
  if (!o) return base;
  return {
    ...base,
    ...(o.periods ? { periods: o.periods } : {}),
    ...(o.maxPeriods ? { maxPeriods: o.maxPeriods } : {}),
    ...(o.extras ? { extras: o.extras } : {}),
    ...(o.actions ? { actions: mergeActions(base.actions, o.actions) } : {}),
  };
};

export default { SPORT_CONFIG, getScoringConfig, applyServerConfigs, cnt, pts };
