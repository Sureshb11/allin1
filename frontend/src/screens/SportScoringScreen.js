import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, StatusBar, Animated, Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, Radius } from '../theme';
import legendsApi from '../services/LegendsApi';

const { width: W } = Dimensions.get('window');

/* ═══════════════════════════════════════════════════════════════
   Design System Constants — "The Stadium Under Lights"
   ═══════════════════════════════════════════════════════════════ */
const DS = {
  bg:          '#0f131f',
  cLow:       '#171b28',
  cMid:       '#1b1f2c',
  cHigh:      '#262a37',
  cHighest:   '#313442',
  bright:     '#353946',
  onSurface:  '#dfe2f3',
  onVariant:  '#c3c5d9',
  muted:      '#8d90a2',
  dim:        '#434656',
  primary:    '#b7c4ff',
  pContainer: '#0052ff',
  secondary:  '#ffb59e',
  sContainer: '#ff571a',
  tertiary:   '#abd600',
  tContainer: '#576e00',
  error:      '#ffb4ab',
  errBg:      '#93000a',
  live:       '#ef4444',
};

/* ═══════════════════════════════════════════════════════════════
   Helper: count / sum events
   ═══════════════════════════════════════════════════════════════ */
const cnt = (events, teamId, type) =>
  events.filter(e => e.teamId === teamId && e.eventType === type).length;
const pts = (events, teamId, types) =>
  events.filter(e => e.teamId === teamId && types.includes(e.eventType))
        .reduce((s, e) => s + e.value, 0);

/* ═══════════════════════════════════════════════════════════════
   SPORT_CONFIG — all 21 sports
   ═══════════════════════════════════════════════════════════════ */
const SPORT_CONFIG = {
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
    periods: ['1st Half', '2nd Half', 'Extra Time'], maxPeriods: 2,
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
    periods: ['Q1', 'Q2', 'Q3', 'Q4', 'OT'], maxPeriods: 4,
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
    periods: ['Set 1', 'Set 2', 'Set 3', 'Set 4', 'Set 5'], maxPeriods: 3,
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

  baseball: {
    icon: 'baseball', color: '#dc2626',
    periods: ['Inn.1','Inn.2','Inn.3','Inn.4','Inn.5','Inn.6','Inn.7','Inn.8','Inn.9'],
    maxPeriods: 9,
    actions: [
      { type: 'run',    label: 'Run',    icon: 'run',            value: 1, color: DS.primary },
      { type: 'out',    label: 'Out',    icon: 'close-circle',   value: 0, color: DS.error },
      { type: 'hit',    label: 'Hit',    icon: 'baseball-bat',   value: 0, color: '#f59e0b' },
      { type: 'strike', label: 'Strike', icon: 'lightning-bolt', value: 0, color: '#8b5cf6' },
    ],
    scoreLabel: (events, teamId) => {
      const runs = cnt(events, teamId, 'run');
      const outs = cnt(events, teamId, 'out');
      return `${runs}R ${outs}O`;
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
    periods: ['1st Half', '2nd Half', 'Extra Time'], maxPeriods: 2,
    actions: [
      { type: 'goal',        label: 'Goal',     icon: 'handball',   value: 1, color: '#22c55e' },
      { type: '7m-throw',    label: '7m Goal',  icon: 'handball',   value: 1, color: '#0ea5e9' },
      { type: 'yellow-card', label: 'Yellow',   icon: 'card',       value: 0, color: '#eab308' },
      { type: 'red-card',    label: 'Red Card', icon: 'card',       value: 0, color: DS.error },
    ],
    scoreLabel: (events, teamId) => String(cnt(events, teamId, 'goal') + cnt(events, teamId, '7m-throw')),
  },

  golf: {
    icon: 'golf', color: '#16a34a',
    periods: ['Front 9', 'Back 9'], maxPeriods: 2,
    actions: [
      { type: 'stroke',      label: 'Stroke',    icon: 'golf',  value: 1, color: DS.primary },
      { type: 'birdie',      label: 'Birdie',    icon: 'bird',  value: 0, color: '#22c55e' },
      { type: 'hole-in-one', label: 'Hole In 1', icon: 'star',  value: 0, color: '#f59e0b' },
      { type: 'bogey',       label: 'Bogey',     icon: 'plus',  value: 0, color: DS.error },
    ],
    scoreLabel: (events, teamId) => `${pts(events, teamId, ['stroke'])} strokes`,
  },

  archery: {
    icon: 'bow-arrow', color: '#15803d',
    periods: ['End 1', 'End 2', 'End 3', 'End 4', 'End 5', 'End 6'], maxPeriods: 6,
    actions: [
      { type: 'arrow-10', label: '10 (X)', icon: 'bow-arrow',    value: 10, color: '#f59e0b' },
      { type: 'arrow-9',  label: '9',      icon: 'bow-arrow',    value: 9,  color: DS.primary },
      { type: 'arrow-8',  label: '8',      icon: 'bow-arrow',    value: 8,  color: '#0ea5e9' },
      { type: 'arrow-7',  label: '7',      icon: 'bow-arrow',    value: 7,  color: '#22c55e' },
      { type: 'arrow-0',  label: 'Miss',   icon: 'close-circle', value: 0,  color: DS.error },
    ],
    scoreLabel: (events, teamId) =>
      String(pts(events, teamId, ['arrow-10','arrow-9','arrow-8','arrow-7','arrow-0'])),
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

  billiards: {
    icon: 'billiards', color: '#166534',
    periods: ['Frame 1','Frame 2','Frame 3','Frame 4','Frame 5','Frame 6','Frame 7','Frame 8','Frame 9'],
    maxPeriods: 9,
    actions: [
      { type: 'frame-won', label: 'Frame Won', icon: 'billiards',    value: 1, color: '#22c55e' },
      { type: 'pot',       label: 'Pot Ball',  icon: 'circle',       value: 1, color: DS.primary },
      { type: 'foul',      label: 'Foul',      icon: 'close-circle', value: 0, color: DS.error },
    ],
    scoreLabel: (events, teamId) => `${cnt(events, teamId, 'frame-won')} frames`,
  },

  snowboarding: {
    icon: 'snowboard', color: '#0369a1',
    periods: ['Run 1', 'Run 2'], maxPeriods: 2,
    actions: [
      { type: 'run-score-90', label: '90+ Score', icon: 'snowboard',    value: 90, color: '#f59e0b' },
      { type: 'run-score-80', label: '80+ Score', icon: 'snowboard',    value: 80, color: DS.primary },
      { type: 'run-score-70', label: '70+ Score', icon: 'snowboard',    value: 70, color: '#0ea5e9' },
      { type: 'crash',        label: 'Crash/DNF', icon: 'close-circle', value: 0,  color: DS.error },
    ],
    scoreLabel: (events, teamId) => {
      const runs = events.filter(e => e.teamId === teamId && e.eventType.startsWith('run-score'));
      const best = runs.length ? Math.max(...runs.map(e => e.value)) : 0;
      return best > 0 ? `${best} pts` : '–';
    },
  },
};

/* ═══════════════════════════════════════════════════════════════
   Animated event ball (current over / period log)
   ═══════════════════════════════════════════════════════════════ */
function EventBall({ label, color, size = 32 }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  }, [anim]);
  return (
    <Animated.View style={[s.ballWrap, {
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color + '20', borderColor: color + '55',
      transform: [{ scale: anim }],
    }]}>
      <Text style={[s.ballText, { color, fontSize: size * 0.38 }]}>{label}</Text>
    </Animated.View>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CRICKET SCORER — Special 3x3 grid layout
   Matches the "Advanced Cricket Scorer" screenshot
   ═══════════════════════════════════════════════════════════════ */
function CricketScorer({ match, cfg, events, period, onAdd, onUndo, saving, matchOver }) {
  const battingTeamId = period === 1 ? match?.team1Id : match?.team2Id;
  const bowlingTeamId = period === 1 ? match?.team2Id : match?.team1Id;
  const battingTeam   = period === 1 ? match?.team1 : match?.team2;
  const bowlingTeam   = period === 1 ? match?.team2 : match?.team1;

  const battingEvents = useMemo(() =>
    events.filter(e => e.periodNum === period && e.teamId === battingTeamId),
  [events, period, battingTeamId]);

  // Compute score, overs, wickets
  const runTypes = ['run-1', 'run-2', 'run-3', 'four', 'six', 'wide', 'no-ball', 'bye', 'leg-bye'];
  const totalRuns    = pts(battingEvents, battingTeamId, runTypes);
  const totalWickets = cnt(battingEvents, battingTeamId, 'wicket');
  const legalBalls   = battingEvents.filter(e => !['wide', 'no-ball'].includes(e.eventType)).length;
  const oversStr     = `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;

  // Current over balls
  const completedOvers = Math.floor(legalBalls / 6);
  const currentOverEvents = useMemo(() => {
    let legal = 0;
    let overStart = 0;
    for (let i = 0; i < battingEvents.length; i++) {
      if (!['wide', 'no-ball'].includes(battingEvents[i].eventType)) legal++;
      if (legal > completedOvers * 6) { overStart = i; break; }
      if (i === battingEvents.length - 1 && legal <= completedOvers * 6) overStart = battingEvents.length;
    }
    return battingEvents.slice(overStart);
  }, [battingEvents, completedOvers]);

  // Ball display for current over (6 slots)
  const overBalls = useMemo(() => {
    const balls = [];
    let legalCount = 0;
    for (const e of currentOverEvents) {
      const isExtra = ['wide', 'no-ball'].includes(e.eventType);
      balls.push({ type: e.eventType, value: e.value, isExtra });
      if (!isExtra) legalCount++;
    }
    // Fill remaining slots
    while (legalCount < 6) {
      balls.push(null);
      legalCount++;
    }
    return balls.slice(0, Math.max(balls.length, 6));
  }, [currentOverEvents]);

  // Second innings target
  const isChasing = period === 2;
  let targetInfo = null;
  if (isChasing) {
    const inn1Events = events.filter(e => e.periodNum === 1);
    const inn1Team   = match?.team1Id;
    const inn1Runs   = pts(inn1Events, inn1Team, runTypes);
    const target     = inn1Runs + 1;
    const needed     = target - totalRuns;
    const totalBallsInMatch = 120; // Default 20 overs
    const ballsLeft  = Math.max(0, totalBallsInMatch - legalBalls);
    targetInfo = { target, needed, ballsLeft };
  }

  const addBattingEvent = (action) => {
    onAdd(battingTeamId, action);
  };

  const getBallLabel = (ball) => {
    if (!ball) return null;
    if (ball.type === 'wide') return 'WD';
    if (ball.type === 'no-ball') return 'NB';
    if (ball.type === 'wicket') return 'W';
    if (ball.type === 'four') return '4';
    if (ball.type === 'six') return '6';
    if (ball.type === 'dot') return '0';
    if (ball.type === 'bye' || ball.type === 'leg-bye') return 'B';
    return String(ball.value);
  };

  const getBallColor = (ball) => {
    if (!ball) return DS.dim;
    if (ball.type === 'wicket') return DS.error;
    if (ball.type === 'four') return DS.pContainer;
    if (ball.type === 'six') return DS.tertiary;
    if (ball.type === 'wide' || ball.type === 'no-ball') return DS.secondary;
    if (ball.type === 'dot') return DS.muted;
    return DS.onSurface;
  };

  return (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* ── Jumbotron Score Bar ──────────────────────── */}
      <View style={s.jumbotron}>
        <View style={s.jumbotronGlow} />
        <View style={s.jumbotronInner}>
          <View style={{ flex: 1 }}>
            <Text style={s.jumbotronLabel}>CURRENT SCORE</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={s.jumbotronScore}>{totalRuns}/{totalWickets}</Text>
              <Text style={s.jumbotronOvers}> ({oversStr})</Text>
            </View>
          </View>
          {isChasing && targetInfo ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.jumbotronTargetLabel}>TARGET: {targetInfo.target}</Text>
              <Text style={s.jumbotronNeed}>
                Need {Math.max(0, targetInfo.needed)} from {targetInfo.ballsLeft} balls
              </Text>
            </View>
          ) : (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.jumbotronTargetLabel}>{battingTeam?.toUpperCase()}</Text>
              <Text style={s.jumbotronNeed}>{cfg.periods[period - 1]}</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Striker & Bowler Cards ───────────────────── */}
      <View style={s.playerRow}>
        <View style={[s.playerCard, { borderLeftWidth: 3, borderLeftColor: DS.tertiary }]}>
          <Text style={[s.playerCardLabel, { color: DS.tertiary }]}>STRIKER</Text>
          <Text style={s.playerCardName} numberOfLines={1}>{battingTeam || 'Batting'}</Text>
          <Text style={s.playerCardSub}>
            {totalRuns} ({legalBalls}) {'\u2022'} {cnt(battingEvents, battingTeamId, 'four')}x4, {cnt(battingEvents, battingTeamId, 'six')}x6
          </Text>
        </View>
        <View style={[s.playerCard, { borderRightWidth: 3, borderRightColor: DS.primary }]}>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.playerCardLabel, { color: DS.primary }]}>BOWLING</Text>
          </View>
          <Text style={[s.playerCardName, { textAlign: 'right' }]} numberOfLines={1}>{bowlingTeam || 'Bowling'}</Text>
          <Text style={[s.playerCardSub, { textAlign: 'right' }]}>
            {oversStr} - {cnt(battingEvents, battingTeamId, 'wicket')}W
          </Text>
        </View>
      </View>

      {/* ── Undo + Extras Bar ───────────────────────── */}
      <View style={s.extrasBar}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={s.extrasBtn} onPress={onUndo}>
            <Icon name="undo" size={14} color={DS.onVariant} />
            <Text style={s.extrasBtnText}>UNDO</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(cfg.extras || []).map(ex => (
            <TouchableOpacity
              key={ex.type}
              style={s.extrasBtn}
              onPress={() => addBattingEvent(ex)}
              disabled={saving || matchOver}
            >
              <Text style={s.extrasBtnText}>{ex.label.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── 3x3 Scoring Grid ────────────────────────── */}
      <View style={s.scoringGrid}>
        {cfg.actions.map((action) => {
          let btnStyle = [s.gridBtn];
          let numStyle = [s.gridBtnNum];
          let subStyle = [s.gridBtnSub];

          if (action.gridSpecial === 'boundary') {
            btnStyle.push({ backgroundColor: DS.pContainer + '30', borderBottomColor: DS.primary, borderBottomWidth: 3 });
            numStyle.push({ color: DS.primary });
            subStyle.push({ color: DS.primary });
          } else if (action.gridSpecial === 'maximum') {
            btnStyle.push({ backgroundColor: DS.tertiary + '15', borderBottomColor: DS.tertiary, borderBottomWidth: 3 });
            numStyle.push({ color: DS.tertiary });
            subStyle.push({ color: DS.tertiary });
          } else if (action.gridSpecial === 'extra') {
            btnStyle.push({ borderBottomColor: DS.secondary + '60', borderBottomWidth: 3 });
            numStyle.push({ color: DS.secondary });
          } else if (action.gridSpecial === 'wicket') {
            btnStyle.push({ backgroundColor: DS.errBg + '40', borderBottomColor: DS.error, borderBottomWidth: 3 });
            numStyle.push({ color: DS.error });
            subStyle.push({ color: DS.error });
          }

          return (
            <TouchableOpacity
              key={action.type}
              style={btnStyle}
              onPress={() => addBattingEvent(action)}
              disabled={saving || matchOver}
              activeOpacity={0.7}
            >
              {action.icon ? (
                <Icon name={action.icon} size={32} color={action.color} />
              ) : (
                <Text style={numStyle}>{action.label}</Text>
              )}
              <Text style={subStyle}>{action.sub}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Current Over Log ────────────────────────── */}
      <View style={s.overLog}>
        <View style={s.overLogHeader}>
          <Text style={s.overLogTitle}>CURRENT OVER</Text>
          <View style={s.overBalls}>
            {overBalls.slice(0, 8).map((ball, i) => {
              const label = ball ? getBallLabel(ball) : null;
              const color = getBallColor(ball);
              return (
                <View key={i} style={[s.overBallSlot, ball && {
                  backgroundColor: color + '20',
                  borderColor: color + '40',
                }]}>
                  {label ? (
                    <Text style={[s.overBallText, { color }]}>{label}</Text>
                  ) : (
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: DS.dim }} />
                  )}
                </View>
              );
            })}
          </View>
        </View>
        {/* Momentum meter */}
        <View style={s.momentumTrack}>
          <View style={[s.momentumFill, {
            width: `${Math.min(100, Math.max(10, totalRuns / Math.max(1, totalRuns + totalWickets * 10) * 100))}%`,
            backgroundColor: DS.tertiary,
          }]} />
          <View style={{ flex: 1, backgroundColor: DS.secondary + '80' }} />
        </View>
        <View style={s.momentumLabels}>
          <Text style={[s.momentumLabel, { color: DS.tertiary }]}>BATTING POWER</Text>
          <Text style={[s.momentumLabel, { color: DS.secondary }]}>BOWLING PRESSURE</Text>
        </View>
      </View>
    </ScrollView>
  );
}

/* ═══════════════════════════════════════════════════════════════
   GENERIC SCORER — For all non-cricket sports
   Dark design, action grid with team sections
   ═══════════════════════════════════════════════════════════════ */
function GenericScorer({ match, cfg, events, period, onAdd, onUndo, saving, matchOver }) {
  const score1 = cfg.scoreLabel(events, match?.team1Id);
  const score2 = cfg.scoreLabel(events, match?.team2Id);
  const periodEvents = events.filter(e => e.periodNum === period);

  const ActionButton = ({ action, teamId }) => (
    <TouchableOpacity
      style={s.genActionBtn}
      onPress={() => onAdd(teamId, action)}
      disabled={saving || matchOver}
      activeOpacity={0.7}
    >
      <View style={[s.genActionIcon, { backgroundColor: action.color + '20' }]}>
        <Icon name={action.icon} size={20} color={action.color} />
      </View>
      <Text style={s.genActionLabel}>{action.label}</Text>
      {action.value > 0 && (
        <View style={[s.genActionBadge, { backgroundColor: action.color }]}>
          <Text style={s.genActionBadgeText}>+{action.value}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* ── Score Display ────────────────────────────── */}
      <View style={s.genScoreSection}>
        <View style={s.genScoreTeam}>
          <View style={[s.genAvatar, { backgroundColor: cfg.color + '40' }]}>
            <Text style={[s.genAvatarText, { color: cfg.color }]}>
              {(match?.team1 || 'T1').charAt(0)}
            </Text>
          </View>
          <Text style={s.genTeamName} numberOfLines={1}>{match?.team1 || 'Team 1'}</Text>
          <Text style={s.genScoreVal}>{score1}</Text>
        </View>

        <View style={s.genSep}>
          <Text style={s.genVs}>VS</Text>
          <Text style={s.genPeriodText}>{cfg.periods[period - 1]}</Text>
        </View>

        <View style={s.genScoreTeam}>
          <View style={[s.genAvatar, { backgroundColor: DS.secondary + '30' }]}>
            <Text style={[s.genAvatarText, { color: DS.secondary }]}>
              {(match?.team2 || 'T2').charAt(0)}
            </Text>
          </View>
          <Text style={s.genTeamName} numberOfLines={1}>{match?.team2 || 'Team 2'}</Text>
          <Text style={s.genScoreVal}>{score2}</Text>
        </View>
      </View>

      {/* ── Team 1 Actions ───────────────────────────── */}
      <View style={s.genTeamSection}>
        <Text style={s.genSectionTitle}>{match?.team1 || 'Team 1'}</Text>
        <View style={s.genActionGrid}>
          {cfg.actions.map(action => (
            <ActionButton key={action.type} action={action} teamId={match?.team1Id} />
          ))}
        </View>
      </View>

      {/* ── Team 2 Actions ───────────────────────────── */}
      <View style={s.genTeamSection}>
        <Text style={s.genSectionTitle}>{match?.team2 || 'Team 2'}</Text>
        <View style={s.genActionGrid}>
          {cfg.actions.map(action => (
            <ActionButton key={action.type} action={action} teamId={match?.team2Id} />
          ))}
        </View>
      </View>

      {/* ── Period Event Log ─────────────────────────── */}
      {periodEvents.length > 0 && (
        <View style={s.genEventLog}>
          <Text style={s.genSectionTitle}>THIS PERIOD</Text>
          <View style={s.genEventBalls}>
            {periodEvents.slice(-20).map(e => {
              const action = cfg.actions.find(a => a.type === e.eventType);
              const color  = action?.color || DS.primary;
              const isT1   = e.teamId === match?.team1Id;
              return (
                <View key={e.id} style={{ alignItems: 'center', gap: 2 }}>
                  <EventBall label={e.eventType.slice(0, 3).toUpperCase()} color={color} size={30} />
                  <Text style={{ fontSize: 8, color: DS.muted, fontWeight: '600' }}>
                    {isT1 ? (match?.team1 || 'T1').slice(0, 5) : (match?.team2 || 'T2').slice(0, 5)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Score by Period ───────────────────────────── */}
      <View style={s.genTotalsCard}>
        <Text style={s.genSectionTitle}>SCORE BY PERIOD</Text>
        {cfg.periods.slice(0, cfg.maxPeriods).map((p, i) => {
          const pEvents = events.filter(e => e.periodNum === i + 1);
          const t1 = cfg.scoreLabel(pEvents, match?.team1Id);
          const t2 = cfg.scoreLabel(pEvents, match?.team2Id);
          return (
            <View key={p} style={s.genTotalsRow}>
              <Text style={s.genTotalsLabel}>{p}</Text>
              <Text style={[s.genTotalsScore, { color: cfg.color }]}>{t1}</Text>
              <Text style={s.genTotalsSep}>—</Text>
              <Text style={[s.genTotalsScore, { color: DS.secondary }]}>{t2}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN SCREEN
   ═══════════════════════════════════════════════════════════════ */
export default function SportScoringScreen({ route, navigation }) {
  const { match }  = route.params || {};
  const sport      = match?.sport || 'football';
  const cfg        = SPORT_CONFIG[sport] || SPORT_CONFIG[Object.keys(SPORT_CONFIG)[0]];
  const isCricket  = sport === 'cricket';

  const [events, setEvents]     = useState([]);
  const [period, setPeriod]     = useState(1);
  const [saving, setSaving]     = useState(false);
  const [matchOver, setMatchOver] = useState(false);

  const score1 = cfg.scoreLabel(events, match?.team1Id);
  const score2 = cfg.scoreLabel(events, match?.team2Id);

  const addEvent = useCallback(async (teamId, action) => {
    if (matchOver) return;
    setSaving(true);
    const eventData = {
      sport, teamId,
      eventType: action.type,
      value:     action.value,
      period:    cfg.periods[period - 1],
      periodNum: period,
    };
    const tempEvent = { ...eventData, id: Date.now().toString(), createdAt: new Date().toISOString() };
    setEvents(prev => [...prev, tempEvent]);

    const res = await legendsApi.addSportEvent(match?.id, eventData);
    if (res.success) {
      setEvents(prev => prev.map(e => e.id === tempEvent.id ? { ...tempEvent, id: res.data?.id || tempEvent.id } : e));
    } else {
      setEvents(prev => prev.filter(e => e.id !== tempEvent.id));
      Alert.alert('Error', 'Failed to record event');
    }
    setSaving(false);
  }, [matchOver, sport, cfg, period, match]);

  const undoLast = useCallback(async () => {
    const last = events[events.length - 1];
    if (!last) return;
    setEvents(prev => prev.slice(0, -1));
    if (match?.id && last.id) {
      await legendsApi.deleteSportEvent(match.id, last.id);
    }
  }, [events, match]);

  const endMatch = useCallback(() => {
    Alert.alert('End Match', 'Are you sure you want to end this match?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Match', style: 'destructive',
        onPress: async () => {
          if (match?.id) {
            await legendsApi.updateMatch(match.id, {
              status: 'completed', score1, score2,
              result: `${score1} - ${score2}`,
            });
          }
          setMatchOver(true);
          Alert.alert('Match Complete', `Final: ${match?.team1} ${score1} — ${match?.team2} ${score2}`, [
            { text: 'OK', onPress: () => navigation.navigate('Home') },
          ]);
        },
      },
    ]);
  }, [match, score1, score2, navigation]);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />

      {/* ── Top App Bar ─────────────────────────────── */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.topBarBtn}>
          <Icon name="arrow-left" size={22} color={DS.onSurface} />
        </TouchableOpacity>
        <View style={s.topBarCenter}>
          <View style={s.topBarLogo}>
            <Icon name="star-four-points" size={14} color={DS.bg} />
          </View>
          <Text style={s.topBarTitle}>LOCAL</Text>
          <View style={s.topBarBadge}>
            <Text style={s.topBarBadgeText}>LEGENDS</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={s.topBarBtn} onPress={undoLast}>
            <Icon name="undo" size={18} color={DS.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity style={s.topBarBtn} onPress={endMatch}>
            <Icon name="flag-checkered" size={18} color={DS.error} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Sport + Live Pill ───────────────────────── */}
      <View style={s.sportRow}>
        <View style={[s.sportPill, { backgroundColor: cfg.color + '25' }]}>
          <Icon name={cfg.icon} size={14} color={cfg.color} />
          <Text style={[s.sportPillText, { color: cfg.color }]}>{sport.toUpperCase()}</Text>
        </View>
        <View style={s.livePill}>
          <View style={s.liveDot} />
          <Text style={s.liveText}>LIVE</Text>
        </View>
      </View>

      {/* ── Period Selector ─────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.periodBar}
        style={{ flexGrow: 0 }}
      >
        {cfg.periods.slice(0, cfg.maxPeriods).map((p, i) => (
          <TouchableOpacity
            key={p}
            style={[s.periodChip, period === i + 1 && [s.periodChipActive, { backgroundColor: cfg.color }]]}
            onPress={() => setPeriod(i + 1)}
          >
            <Text style={[s.periodChipText, period === i + 1 && s.periodChipTextActive]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Main Content ────────────────────────────── */}
      {isCricket ? (
        <CricketScorer
          match={match} cfg={cfg} events={events}
          period={period} onAdd={addEvent} onUndo={undoLast}
          saving={saving} matchOver={matchOver}
        />
      ) : (
        <GenericScorer
          match={match} cfg={cfg} events={events}
          period={period} onAdd={addEvent} onUndo={undoLast}
          saving={saving} matchOver={matchOver}
        />
      )}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STYLES — "Kinetic Athlete" Dark Design
   ═══════════════════════════════════════════════════════════════ */
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DS.bg },

  /* ── Top Bar ──────────────────────────────────────── */
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 50, paddingBottom: 10,
    backgroundColor: DS.cLow + 'B0',
  },
  topBarBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: DS.cHigh, alignItems: 'center', justifyContent: 'center',
  },
  topBarCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topBarLogo: {
    width: 26, height: 26, borderRadius: 7,
    backgroundColor: DS.tertiary, alignItems: 'center', justifyContent: 'center',
  },
  topBarTitle: { fontSize: 16, fontWeight: '900', color: DS.onSurface, letterSpacing: 2 },
  topBarBadge: {
    backgroundColor: DS.tertiary, borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  topBarBadgeText: { fontSize: 10, fontWeight: '900', color: DS.bg, letterSpacing: 1 },

  /* ── Sport Row ────────────────────────────────────── */
  sportRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 8,
  },
  sportPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999,
  },
  sportPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: DS.live },
  liveText: { fontSize: 10, fontWeight: '800', color: DS.live, letterSpacing: 1 },

  /* ── Period Bar ───────────────────────────────────── */
  periodBar: { paddingHorizontal: 16, gap: 8, paddingBottom: 10 },
  periodChip: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999,
    backgroundColor: DS.cHigh,
  },
  periodChipActive: {},
  periodChipText: { fontSize: 12, fontWeight: '700', color: DS.muted },
  periodChipTextActive: { color: '#fff' },

  /* ══ CRICKET STYLES ══════════════════════════════════ */

  /* ── Jumbotron ────────────────────────────────────── */
  jumbotron: {
    marginHorizontal: 14, marginTop: 4, marginBottom: 12,
    borderRadius: 999, overflow: 'hidden',
    backgroundColor: DS.cLow,
  },
  jumbotronGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.25,
  },
  jumbotronInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 22, paddingVertical: 16,
    backgroundColor: DS.cHigh, borderRadius: 999,
    margin: 3,
  },
  jumbotronLabel: {
    fontSize: 9, fontWeight: '800', color: DS.tertiary,
    letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 2,
  },
  jumbotronScore: { fontSize: 42, fontWeight: '900', color: DS.onSurface, letterSpacing: -1 },
  jumbotronOvers: { fontSize: 16, fontWeight: '700', color: DS.onVariant },
  jumbotronTargetLabel: {
    fontSize: 9, fontWeight: '800', color: DS.secondary,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  jumbotronNeed: { fontSize: 12, fontWeight: '600', color: DS.onVariant, fontStyle: 'italic', marginTop: 2 },

  /* ── Player Cards ─────────────────────────────────── */
  playerRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, marginBottom: 10 },
  playerCard: {
    flex: 1, backgroundColor: DS.cHigh, borderRadius: 14, padding: 14,
  },
  playerCardLabel: {
    fontSize: 9, fontWeight: '800', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 6,
  },
  playerCardName: { fontSize: 16, fontWeight: '800', color: DS.onSurface, marginBottom: 2 },
  playerCardSub: { fontSize: 11, color: DS.onVariant },

  /* ── Extras Bar ───────────────────────────────────── */
  extrasBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginHorizontal: 14, marginBottom: 12,
    backgroundColor: DS.cLow, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
  },
  extrasBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: DS.cHigh, borderRadius: 12,
  },
  extrasBtnText: {
    fontSize: 9, fontWeight: '800', color: DS.onVariant, letterSpacing: 1.5,
  },

  /* ── 3x3 Scoring Grid ────────────────────────────── */
  scoringGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    paddingHorizontal: 14, marginBottom: 14,
  },
  gridBtn: {
    width: (W - 28 - 20) / 3, aspectRatio: 1,
    backgroundColor: DS.cHigh, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  gridBtnNum: { fontSize: 36, fontWeight: '900', color: DS.onSurface },
  gridBtnSub: {
    fontSize: 8, fontWeight: '800', color: DS.onVariant,
    letterSpacing: 1.5, textTransform: 'uppercase',
  },

  /* ── Over Log ─────────────────────────────────────── */
  overLog: {
    marginHorizontal: 14, marginBottom: 14,
    backgroundColor: DS.cLow, borderRadius: 18, padding: 16,
  },
  overLogHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  overLogTitle: {
    fontSize: 10, fontWeight: '800', color: DS.onVariant,
    letterSpacing: 2.5, textTransform: 'uppercase',
  },
  overBalls: { flexDirection: 'row', gap: 4 },
  overBallSlot: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: DS.cHighest, borderWidth: 1, borderColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  overBallText: { fontSize: 12, fontWeight: '800' },

  /* ── Momentum Meter ───────────────────────────────── */
  momentumTrack: {
    height: 5, width: '100%', borderRadius: 3, overflow: 'hidden',
    flexDirection: 'row', backgroundColor: DS.cHighest,
  },
  momentumFill: { height: '100%' },
  momentumLabels: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 6,
  },
  momentumLabel: {
    fontSize: 8, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase',
  },

  /* ══ GENERIC STYLES ══════════════════════════════════ */

  /* ── Score Section ────────────────────────────────── */
  genScoreSection: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 20,
    marginHorizontal: 14, marginTop: 4, marginBottom: 12,
    backgroundColor: DS.cHigh, borderRadius: 20,
  },
  genScoreTeam: { flex: 1, alignItems: 'center', gap: 6 },
  genAvatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  genAvatarText: { fontSize: 20, fontWeight: '900' },
  genTeamName: { fontSize: 12, fontWeight: '700', color: DS.onVariant, textAlign: 'center' },
  genScoreVal: { fontSize: 30, fontWeight: '900', color: DS.onSurface },
  genSep: { alignItems: 'center', paddingHorizontal: 10 },
  genVs: { fontSize: 12, fontWeight: '800', color: DS.dim },
  genPeriodText: { fontSize: 10, color: DS.muted, fontWeight: '600', marginTop: 4 },

  /* ── Team Sections ────────────────────────────────── */
  genTeamSection: { paddingHorizontal: 14, marginBottom: 14 },
  genSectionTitle: {
    fontSize: 10, fontWeight: '800', color: DS.onVariant,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10,
  },
  genActionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.cHigh, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  genActionIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  genActionLabel: { fontSize: 13, fontWeight: '700', color: DS.onSurface },
  genActionBadge: {
    borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 'auto',
  },
  genActionBadgeText: { fontSize: 10, fontWeight: '900', color: '#fff' },

  /* ── Event Log ────────────────────────────────────── */
  genEventLog: { paddingHorizontal: 14, marginBottom: 14 },
  genEventBalls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  /* ── Totals Card ──────────────────────────────────── */
  genTotalsCard: {
    marginHorizontal: 14, backgroundColor: DS.cHigh,
    borderRadius: 18, padding: 16, marginBottom: 14,
  },
  genTotalsRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: DS.dim + '20', gap: 8,
  },
  genTotalsLabel: { flex: 1, fontSize: 13, color: DS.onVariant, fontWeight: '600' },
  genTotalsScore: { fontSize: 15, fontWeight: '800', minWidth: 50, textAlign: 'center' },
  genTotalsSep: { fontSize: 13, color: DS.dim },

  /* ── Shared ───────────────────────────────────────── */
  ballWrap: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  ballText: { fontWeight: '900' },
});
