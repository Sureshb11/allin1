// Sport registry — the single entry point for per-sport config.
//
//   import { getSport, listSports } from '../sports';
//   const sport = getSport('cricket');   // SportDefinition (or null if unknown)
//   sport.scoring / sport.formats / sport.dashboard / sport.find / sport.custom
//
// Order below is the canonical Arena-picker order.

import cricket from './cricket';
import football from './football';
import kabaddi from './kabaddi';
import hockey from './hockey';
import badminton from './badminton';
import tennis from './tennis';
import basketball from './basketball';
import volleyball from './volleyball';
import boxing from './boxing';
import wrestling from './wrestling';
import tabletennis from './tabletennis';
import khokho from './khokho';
import handball from './handball';
import squash from './squash';
import pickleball from './pickleball';
import judo from './judo';
import karate from './karate';
import golf from './golf';
import archery from './archery';
import bowling from './bowling';
import skateboard from './skateboard';
import rummy from './rummy';

const SPORTS = [
  cricket, football, kabaddi, hockey, badminton, tennis, basketball, volleyball,
  boxing, wrestling, tabletennis, khokho, handball, squash, pickleball, judo,
  karate, golf, archery, bowling, skateboard, rummy,
];

const BY_ID = Object.fromEntries(SPORTS.map((s) => [s.id, s]));

/** Full SportDefinition for an id, or null if unknown. */
export const getSport = (id) => BY_ID[id] || null;

/** All sports in canonical picker order. */
export const listSports = () => SPORTS;

/** Lightweight meta lookup with a safe fallback (never throws). */
export const sportMeta = (id) => {
  const s = BY_ID[id];
  return s
    ? { id: s.id, name: s.name, icon: s.icon, tag: s.tag, color: s.color, accent: s.accent }
    : { id, name: id, icon: 'trophy-outline', tag: '', color: '#22c55e', accent: '#abd600' };
};

export default { getSport, listSports, sportMeta };
