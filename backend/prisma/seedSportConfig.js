// seedSportConfig.js — populate SportConfiguration with the declarative rules
// for all sports (mirrors frontend/src/sports/scoring.js, minus the executable
// score functions). `rules.scoreModel.kind` tells the app interpreter how to
// compute a score from the generic SportEvent stream:
//   cricket | count | sum | rally | tennis | best-run | custom
// Colours use token names (primary/error/tertiary/…) the app resolves to its
// theme, or literal hex — so theming stays app-side.
//
//   node prisma/seedSportConfig.js     (idempotent upsert against .env DB)

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CONFIG = [
  { id: 'cricket', name: 'Cricket', icon: 'cricket', color: '#22c55e', accent: '#abd600',
    rules: {
      individual: false, competitorLabel: 'Team',
      periods: ['Inn. 1', 'Inn. 2'], maxPeriods: 2,
      actions: [
        { type: 'dot',     label: '0',  sub: 'DOT',      value: 0, color: 'onVariant' },
        { type: 'run-1',   label: '1',  sub: 'SINGLE',   value: 1, color: 'onSurface' },
        { type: 'run-2',   label: '2',  sub: 'DOUBLE',   value: 2, color: 'onSurface' },
        { type: 'run-3',   label: '3',  sub: 'TRIPLE',   value: 3, color: 'onSurface' },
        { type: 'four',    label: '4',  sub: 'BOUNDARY', value: 4, color: 'primary',   gridSpecial: 'boundary' },
        { type: 'six',     label: '6',  sub: 'MAXIMUM',  value: 6, color: 'tertiary',  gridSpecial: 'maximum' },
        { type: 'wide',    label: 'WD', sub: 'WIDE',     value: 1, color: 'secondary', gridSpecial: 'extra' },
        { type: 'no-ball', label: 'NB', sub: 'NO BALL',  value: 1, color: 'secondary', gridSpecial: 'extra' },
        { type: 'wicket',  label: '✖',  sub: 'WICKET',   value: 0, color: 'error',     gridSpecial: 'wicket', icon: 'close' },
      ],
      extras: [
        { type: 'bye', label: 'Bye', value: 1 },
        { type: 'leg-bye', label: 'Leg Bye', value: 1 },
      ],
      scoreModel: { kind: 'cricket' },
    } },

  { id: 'football', name: 'Football', icon: 'soccer', color: '#16a34a', accent: '#abd600',
    rules: {
      individual: false, competitorLabel: 'Team',
      periods: ['1st Half', '2nd Half', 'Extra Time'], maxPeriods: 3,
      actions: [
        { type: 'goal',        label: 'Goal',     icon: 'soccer',        value: 1, color: '#22c55e' },
        { type: 'corner',      label: 'Corner',   icon: 'flag-triangle', value: 0, color: '#0ea5e9' },
        { type: 'yellow-card', label: 'Yellow',   icon: 'card',          value: 0, color: '#eab308' },
        { type: 'red-card',    label: 'Red Card', icon: 'card',          value: 0, color: '#ef4444' },
        { type: 'offside',     label: 'Offside',  icon: 'flag-outline',  value: 0, color: 'muted' },
      ],
      scoreModel: { kind: 'count', types: ['goal'] },
    } },

  { id: 'basketball', name: 'Basketball', icon: 'basketball', color: '#ea580c', accent: '#abd600',
    rules: {
      individual: false, competitorLabel: 'Team',
      periods: ['Q1', 'Q2', 'Q3', 'Q4', 'OT'], maxPeriods: 5,
      actions: [
        { type: '2pt',       label: '2 PTS', icon: 'basketball',   value: 2, color: 'primary' },
        { type: '3pt',       label: '3 PTS', icon: 'basketball',   value: 3, color: 'tertiary' },
        { type: 'freethrow', label: 'Free',  icon: 'basketball',   value: 1, color: '#0ea5e9' },
        { type: 'foul',      label: 'Foul',  icon: 'close-circle', value: 0, color: 'error' },
      ],
      scoreModel: { kind: 'sum', types: ['2pt', '3pt', 'freethrow'] },
    } },

  { id: 'tennis', name: 'Tennis', icon: 'tennis', color: '#65a30d', accent: '#abd600',
    rules: {
      individual: true, competitorLabel: 'Player',
      periods: ['Set 1', 'Set 2', 'Set 3', 'Set 4', 'Set 5'], maxPeriods: 5,
      actions: [
        { type: 'point',        label: 'Point',     icon: 'tennis',         value: 1, color: 'primary' },
        { type: 'ace',          label: 'Ace',       icon: 'lightning-bolt', value: 1, color: '#f59e0b' },
        { type: 'double-fault', label: 'Dbl Fault', icon: 'close-circle',   value: 0, color: 'error' },
      ],
      scoreModel: { kind: 'tennis', setsToWin: 2 },
    } },

  { id: 'volleyball', name: 'Volleyball', icon: 'volleyball', color: '#2563eb', accent: '#abd600',
    rules: {
      individual: false, competitorLabel: 'Team',
      periods: ['Set 1', 'Set 2', 'Set 3', 'Set 4', 'Set 5'], maxPeriods: 5,
      actions: [
        { type: 'point', label: 'Point', icon: 'volleyball',      value: 1, color: 'primary' },
        { type: 'ace',   label: 'Ace',   icon: 'lightning-bolt',  value: 1, color: '#f59e0b' },
        { type: 'block', label: 'Block', icon: 'hand-back-right', value: 1, color: '#8b5cf6' },
      ],
      scoreModel: { kind: 'rally', unitPts: 25, unitsToWin: 3, maxUnits: 5, finalUnitPts: 15 },
    } },

  { id: 'badminton', name: 'Badminton', icon: 'badminton', color: '#0d9488', accent: '#abd600',
    rules: {
      individual: true, competitorLabel: 'Player',
      periods: ['Game 1', 'Game 2', 'Game 3'], maxPeriods: 3,
      actions: [
        { type: 'point', label: 'Point', icon: 'badminton',      value: 1, color: 'primary' },
        { type: 'ace',   label: 'Ace',   icon: 'lightning-bolt', value: 1, color: '#f59e0b' },
        { type: 'fault', label: 'Fault', icon: 'close-circle',   value: 0, color: 'error' },
      ],
      scoreModel: { kind: 'rally', unitPts: 21, unitsToWin: 2, maxUnits: 3, cap: 30 },
    } },

  { id: 'tabletennis', name: 'Table Tennis', icon: 'table-tennis', color: '#7c3aed', accent: '#abd600',
    rules: {
      individual: true, competitorLabel: 'Player',
      periods: ['Game 1', 'Game 2', 'Game 3', 'Game 4', 'Game 5', 'Game 6', 'Game 7'], maxPeriods: 7,
      actions: [
        { type: 'point', label: 'Point', icon: 'table-tennis',   value: 1, color: 'primary' },
        { type: 'ace',   label: 'Ace',   icon: 'lightning-bolt', value: 1, color: '#f59e0b' },
        { type: 'fault', label: 'Fault', icon: 'close-circle',   value: 0, color: 'error' },
      ],
      scoreModel: { kind: 'rally', unitPts: 11, unitsToWin: 4, maxUnits: 7 },
    } },

  { id: 'squash', name: 'Squash', icon: 'racquetball', color: '#9333ea', accent: '#abd600',
    rules: {
      individual: true, competitorLabel: 'Player',
      periods: ['Game 1', 'Game 2', 'Game 3', 'Game 4', 'Game 5'], maxPeriods: 5,
      actions: [
        { type: 'point',  label: 'Point',  icon: 'racquetball',    value: 1, color: 'primary' },
        { type: 'stroke', label: 'Stroke', icon: 'lightning-bolt', value: 1, color: '#f59e0b' },
        { type: 'let',    label: 'Let',    icon: 'refresh',        value: 0, color: 'muted' },
      ],
      scoreModel: { kind: 'rally', unitPts: 11, unitsToWin: 3, maxUnits: 5 },
    } },

  { id: 'pickleball', name: 'Pickleball', icon: 'tennis', color: '#ca8a04', accent: '#abd600',
    rules: {
      individual: true, competitorLabel: 'Player',
      periods: ['Game 1', 'Game 2', 'Game 3'], maxPeriods: 3,
      actions: [
        { type: 'point', label: 'Point', icon: 'tennis',         value: 1, color: 'primary' },
        { type: 'ace',   label: 'Ace',   icon: 'lightning-bolt', value: 1, color: '#f59e0b' },
        { type: 'fault', label: 'Fault', icon: 'close-circle',   value: 0, color: 'error' },
      ],
      scoreModel: { kind: 'rally', unitPts: 11, unitsToWin: 2, maxUnits: 3 },
    } },

  { id: 'hockey', name: 'Hockey', icon: 'hockey-sticks', color: '#0284c7', accent: '#abd600',
    rules: {
      individual: false, competitorLabel: 'Team',
      periods: ['Q1', 'Q2', 'Q3', 'Q4'], maxPeriods: 4,
      actions: [
        { type: 'goal',           label: 'Goal',       icon: 'hockey-sticks', value: 1, color: '#22c55e' },
        { type: 'penalty-corner', label: 'Pen Corner', icon: 'flag-triangle', value: 0, color: '#0ea5e9' },
        { type: 'yellow-card',    label: 'Yellow',     icon: 'card',          value: 0, color: '#eab308' },
        { type: 'red-card',       label: 'Red Card',   icon: 'card',          value: 0, color: 'error' },
      ],
      scoreModel: { kind: 'count', types: ['goal'] },
    } },

  { id: 'handball', name: 'Handball', icon: 'handball', color: '#d97706', accent: '#abd600',
    rules: {
      individual: false, competitorLabel: 'Team',
      periods: ['1st Half', '2nd Half', 'Extra Time'], maxPeriods: 3,
      actions: [
        { type: 'goal',        label: 'Goal',     icon: 'handball', value: 1, color: '#22c55e' },
        { type: '7m-throw',    label: '7m Goal',  icon: 'handball', value: 1, color: '#0ea5e9' },
        { type: 'yellow-card', label: 'Yellow',   icon: 'card',     value: 0, color: '#eab308' },
        { type: 'red-card',    label: 'Red Card', icon: 'card',     value: 0, color: 'error' },
      ],
      scoreModel: { kind: 'count', types: ['goal', '7m-throw'] },
    } },

  { id: 'kabaddi', name: 'Kabaddi', icon: 'run-fast', color: '#f97316', accent: '#abd600',
    rules: {
      individual: false, competitorLabel: 'Team',
      periods: ['1st Half', '2nd Half'], maxPeriods: 2,
      actions: [
        { type: 'touch-point',  label: 'Touch Pt', icon: 'run-fast',        value: 1, color: '#22c55e' },
        { type: 'bonus-point',  label: 'Bonus',    icon: 'plus-circle',     value: 1, color: '#f59e0b' },
        { type: 'tackle-point', label: 'Tackle',   icon: 'hand-back-right', value: 1, color: '#8b5cf6' },
        { type: 'all-out',      label: 'All Out',  icon: 'lightning-bolt',  value: 2, color: 'error' },
      ],
      scoreModel: { kind: 'sum', types: ['touch-point', 'bonus-point', 'tackle-point', 'all-out'] },
    } },

  { id: 'khokho', name: 'Kho-Kho', icon: 'run', color: '#ef4444', accent: '#abd600',
    rules: {
      individual: false, competitorLabel: 'Team',
      periods: ['Turn 1', 'Turn 2', 'Turn 3', 'Turn 4'], maxPeriods: 4,
      actions: [
        { type: 'out',       label: 'Out',       icon: 'run',             value: 1, color: 'primary' },
        { type: 'pole-dive', label: 'Pole Dive', icon: 'arrow-down-bold', value: 1, color: '#8b5cf6' },
        { type: 'bonus',     label: 'Dream Run', icon: 'star',            value: 2, color: '#f59e0b' },
      ],
      scoreModel: { kind: 'sum', types: ['out', 'pole-dive', 'bonus'] },
    } },

  { id: 'boxing', name: 'Boxing', icon: 'boxing-glove', color: '#9f1239', accent: '#abd600',
    rules: {
      individual: true, competitorLabel: 'Player',
      periods: ['Rd 1','Rd 2','Rd 3','Rd 4','Rd 5','Rd 6','Rd 7','Rd 8','Rd 9','Rd 10','Rd 11','Rd 12'], maxPeriods: 12,
      actions: [
        { type: 'punch-landed', label: 'Punch',     icon: 'boxing-glove',    value: 1, color: 'primary' },
        { type: 'knockdown',    label: 'Knockdown', icon: 'arrow-down-bold', value: 0, color: '#f97316' },
        { type: 'round-win',    label: 'Round Win', icon: 'trophy-outline',  value: 1, color: '#22c55e' },
        { type: 'ko',           label: 'KO',        icon: 'lightning-bolt',  value: 0, color: 'error' },
      ],
      scoreModel: { kind: 'count', types: ['round-win'], instantWin: { type: 'ko', label: 'KO' } },
    } },

  { id: 'karate', name: 'Karate', icon: 'karate', color: '#b91c1c', accent: '#abd600',
    rules: {
      individual: true, competitorLabel: 'Player',
      periods: ['Bout'], maxPeriods: 1,
      actions: [
        { type: 'yuko',     label: 'Yuko (1)',     icon: 'karate',       value: 1, color: '#0ea5e9' },
        { type: 'waza-ari', label: 'Waza-ari (2)', icon: 'karate',       value: 2, color: '#f59e0b' },
        { type: 'ippon',    label: 'Ippon (3)',    icon: 'karate',       value: 3, color: '#22c55e' },
        { type: 'penalty',  label: 'Penalty',      icon: 'close-circle', value: 0, color: 'error' },
      ],
      scoreModel: { kind: 'sum', types: ['yuko', 'waza-ari', 'ippon'] },
    } },

  { id: 'judo', name: 'Judo', icon: 'human-handsup', color: '#1d4ed8', accent: '#abd600',
    rules: {
      individual: true, competitorLabel: 'Player',
      periods: ['Bout'], maxPeriods: 1,
      actions: [
        { type: 'ippon',    label: 'Ippon',    icon: 'lightning-bolt', value: 1, color: '#22c55e' },
        { type: 'waza-ari', label: 'Waza-ari', icon: 'human-handsup',  value: 1, color: '#f59e0b' },
        { type: 'penalty',  label: 'Shido',    icon: 'close-circle',   value: 0, color: 'error' },
      ],
      scoreModel: { kind: 'count', types: ['waza-ari'], instantWin: { type: 'ippon', label: 'Ippon' }, wazaAriToIppon: 2 },
    } },

  { id: 'wrestling', name: 'Wrestling', icon: 'arm-flex-outline', color: '#dc2626', accent: '#abd600',
    rules: {
      individual: true, competitorLabel: 'Player',
      periods: ['Period 1', 'Period 2', 'Period 3'], maxPeriods: 3,
      actions: [
        { type: 'takedown', label: 'Takedown (2)', icon: 'arm-flex-outline', value: 2, color: 'primary' },
        { type: 'escape',   label: 'Escape (1)',   icon: 'run',              value: 1, color: '#0ea5e9' },
        { type: 'reversal', label: 'Reversal (2)', icon: 'refresh',          value: 2, color: '#8b5cf6' },
        { type: 'nearfall', label: 'Nearfall',     icon: 'chevron-down',     value: 2, color: '#f59e0b' },
        { type: 'pin',      label: 'Pin',          icon: 'lightning-bolt',   value: 0, color: 'error' },
      ],
      scoreModel: { kind: 'sum', types: ['takedown', 'escape', 'reversal', 'nearfall'], instantWin: { type: 'pin', label: 'Pin!' } },
    } },

  { id: 'skateboard', name: 'Skateboarding', icon: 'skateboard', color: '#0369a1', accent: '#abd600',
    rules: {
      individual: true, competitorLabel: 'Player',
      periods: ['Run 1', 'Run 2'], maxPeriods: 2,
      actions: [
        { type: 'run-score-90', label: '90+ Score', icon: 'skateboard',   value: 90, color: '#f59e0b' },
        { type: 'run-score-80', label: '80+ Score', icon: 'skateboard',   value: 80, color: 'primary' },
        { type: 'run-score-70', label: '70+ Score', icon: 'skateboard',   value: 70, color: '#0ea5e9' },
        { type: 'crash',        label: 'Bail',      icon: 'close-circle', value: 0,  color: 'error' },
      ],
      scoreModel: { kind: 'best-run', prefix: 'run-score' },
    } },

  { id: 'rummy', name: 'Rummy', icon: 'cards-playing-outline', color: '#7e22ce', accent: '#abd600',
    rules: {
      individual: true, competitorLabel: 'Player',
      periods: ['Deal'], maxPeriods: 1, actions: [],
      scoreModel: { kind: 'custom', note: 'Pool Rummy uses its own RummyGame flow, not SportEvent scoring.' },
    } },
];

async function main() {
  for (const c of CONFIG) {
    await prisma.sportConfiguration.upsert({
      where: { id: c.id },
      create: { id: c.id, name: c.name, icon: c.icon, color: c.color, accent: c.accent, rules: c.rules },
      update: { name: c.name, icon: c.icon, color: c.color, accent: c.accent, rules: c.rules, version: { increment: 1 } },
    });
  }
  console.log(`✓ SportConfiguration seeded/updated: ${CONFIG.length} sports`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
