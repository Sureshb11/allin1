import { useTheme, useThemedStyles } from "../theme/ThemeContext";import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { makeControls } from '../theme/controls';
import { sortSquad, roleLabel, roleRank, ROLE_RANK } from '../utils/squadOrder';
// Moved out of this file so the Live match screen can show the same cards —
// see utils/overSummary.js for why it is not simply copied there.
import { computeOverEndSummaries } from '../utils/overSummary';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Share, Image, RefreshControl, Dimensions, Animated } from
'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
import Reanimated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence,
} from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import RNShare from 'react-native-share';
import legendsApi from '../services/LegendsApi';
import { onForegroundMessage } from '../services/push';
import { haptic } from '../utils/haptics';
import BrandLogo from "../components/BrandLogo";
import PlayerAvatar from "../components/PlayerAvatar";
import HexAvatar from "../components/HexAvatar";
import ShotBoard from "../components/ShotBoard";
import { isBallFaced, offTheBat, isBoundary, isSix, isBowlerWicket, NON_BALL_EXTRAS } from "../utils/cricketRules";
import { cricketColors } from "../theme/cricketColors";
import LiveBall from "../components/CricketBall/LiveBall";
import EventSound from "../components/CricketBall/EventSound";
import { useDockLock, useHideTabBarOnScroll, useTabBarClearance } from "../components/AutoHideTabBar";
import Skeleton from "../components/Skeleton";

// Latest COMPLETED over of the current (last) innings — used to pop an
// auto-dismissing banner the moment a live watcher's poll picks up a newly
// finished over.
function latestOverEnd(match) {
  const inns = match?.innings || [];
  const innings = inns[inns.length - 1];
  if (!innings) return null;
  return computeOverEndSummaries(innings)[0] || null;   // newest first
}

// Slide-down banner for a just-completed over: total + both batsmen + bowler
// figures. Springs in, holds a few seconds, fades out, then calls onDone.
function OverEndBanner({ data, onDone, DS }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!data) return;
    anim.setValue(0);
    Animated.sequence([
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8, tension: 80 }),
      Animated.delay(3200),
      Animated.timing(anim, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onDone(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  if (!data) return null;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] });
  return (
    <Animated.View pointerEvents="none" style={[overEndBannerStyles.wrap, { opacity: anim, transform: [{ translateY }] }]}>
      <View style={[overEndBannerStyles.card, { backgroundColor: DS.surface, borderLeftColor: DS.lime }]}>
        <Text style={[overEndBannerStyles.title, { color: DS.textPrimary }]} numberOfLines={1}>
          END OF OVER {data.over}  ·  <Text style={{ color: DS.lime }}>{data.total}</Text>
        </Text>
        <Text style={[overEndBannerStyles.sub, { color: DS.textVariant }]} numberOfLines={1}>
          {data.bat.map((b) => `${b.name} ${b.runs}(${b.balls})`).join('   ')}
        </Text>
        <Text style={[overEndBannerStyles.sub, { color: DS.coral }]} numberOfLines={1}>{data.bowler.name} {data.bowler.fig}</Text>
      </View>
    </Animated.View>
  );
}

const overEndBannerStyles = StyleSheet.create({
  wrap: { position: 'absolute', top: 148, left: 16, right: 16, zIndex: 60, alignItems: 'center' },
  card: {
    width: '100%', borderRadius: 14, borderLeftWidth: 4, padding: 12, gap: 3,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },
  title: { fontSize: 13.5, fontWeight: '900' },
  sub: { fontSize: 12, fontWeight: '700' },
});

// Cheap display-signature of a match — everything the screen actually renders
// off. Two snapshots with the same signature are visually identical, so we can
// skip re-rendering when a poll returns unchanged data.
function matchSig(m) {
  if (!m) return '';
  let balls = 0;
  let crease = '';
  const inns = m.innings || [];
  for (const inn of inns) {
    for (const o of (inn.oversData || [])) balls += (o.balls || []).length;
    // Include the crease pair so seating a new batter (a wicket replacement who
    // hasn't faced a ball yet — no change to score or ball count) still counts as
    // a change and re-renders the batting card. Without this the new batter only
    // appears after their first delivery.
    crease += `|${inn.strikerId || ''}/${inn.nonStrikerId || ''}`;
  }
  return `${m.status}|${m.result}|${m.score1}|${m.score2}|${m.currentInnings}|${inns.length}|${balls}${crease}`;
}

// The most-recent delivery across the whole match (last innings → last over →
// last ball) + its "big moment" kind, so a live watcher can be shown a FOUR!/
// SIX!/WICKET! flourish when a new one lands between polls.
function latestBall(match) {
  const inns = match?.innings || [];
  for (let i = inns.length - 1; i >= 0; i--) {
    const overs = inns[i].oversData || [];
    for (let o = overs.length - 1; o >= 0; o--) {
      const balls = overs[o].balls || [];
      if (balls.length) {
        const b = balls[balls.length - 1];
        let kind = null;
        if (b.isWicket) kind = 'wicket';
        else if (isSix(b)) kind = 'six';
        else if (offTheBat(b) && b.runs === 4) kind = 'four';
        return { id: b.id, kind };
      }
    }
  }
  return null;
}

const AnimatedIcon = Animated.createAnimatedComponent(Icon);

// Per-kind celebration config: wording + the badge icon (colour comes from the
// theme at render time).
const CELEB_CFG = {
  wicket: { label: 'WICKET!', sub: 'OUT', icon: 'alert-octagon' },
  six:    { label: 'SIX!',    sub: 'MAXIMUM',  icon: 'fire' },
  four:   { label: 'FOUR!',   sub: 'BOUNDARY', icon: 'cricket' },
};

// A single confetti sparkle flung from centre — climbs + drifts + spins + fades,
// all on the native driver so it stays buttery even if JS is briefly busy.
function Confetti({ drive, seed, color }) {
  const translateY = drive.interpolate({ inputRange: [0, 1], outputRange: [0, -seed.rise] });
  const translateX = drive.interpolate({ inputRange: [0, 1], outputRange: [0, seed.drift] });
  const rotate = drive.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${seed.spin}deg`] });
  const scale = drive.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.2, 1, 0.8] });
  const opacity = drive.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] });
  return (
    <AnimatedIcon name="star-four-points" size={seed.size} color={color}
      style={{ position: 'absolute', opacity, transform: [{ translateX }, { translateY }, { rotate }, { scale }] }} />
  );
}

// Full-screen FOUR!/SIX!/WICKET! flourish for live watchers: a colour wash, a
// burst of confetti, and a bold badge that springs + wobbles in, holds, then
// fades — after which onDone clears it.
function CelebrationOverlay({ celebration, onDone, DS }) {
  const drive = useRef(new Animated.Value(0)).current;    // 0 in · 1 hold · 2 out
  const burst = useRef(new Animated.Value(0)).current;    // 0→1 confetti flight
  // Stable per-mount random confetti trajectories.
  const seeds = useRef(Array.from({ length: 14 }, () => ({
    drift: (Math.random() * 2 - 1) * 150,
    rise: 150 + Math.random() * 200,
    spin: (Math.random() * 2 - 1) * 90,
    size: 22 + Math.random() * 18,
    lane: Math.random(),
  }))).current;

  useEffect(() => {
    if (!celebration) return;
    drive.setValue(0); burst.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.spring(drive, { toValue: 1, useNativeDriver: true, friction: 5, tension: 90 }),
        Animated.delay(1200),
        Animated.timing(drive, { toValue: 2, duration: 360, useNativeDriver: true }),
      ]),
      Animated.timing(burst, { toValue: 1, duration: 1600, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onDone(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebration]);

  if (!celebration) return null;
  const color = celebration.kind === 'wicket' ? DS.wicketText
    : celebration.kind === 'six' ? (DS.success || DS.lime) : DS.blue;
  const cfg = CELEB_CFG[celebration.kind] || CELEB_CFG.four;
  const scale = drive.interpolate({ inputRange: [0, 1, 2], outputRange: [0.2, 1, 1.25] });
  const rotate = drive.interpolate({ inputRange: [0, 1, 2], outputRange: ['-10deg', '0deg', '5deg'] });
  const opacity = drive.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] });
  const washOpacity = drive.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0.16, 0] });

  return (
    <Animated.View pointerEvents="none" style={[celebStyles.overlay, { opacity }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity: washOpacity }]} />
      {seeds.map((seed, i) => (
        <Confetti key={i} drive={burst} seed={seed} color={color} />
      ))}
      <Animated.View style={[celebStyles.badge, { backgroundColor: color, transform: [{ scale }, { rotate }] }]}>
        {celebration.kind === 'wicket'
          ? <Image source={require('../assets/icons/out.png')} style={celebStyles.badgeUmpire} />
          : <Icon name={cfg.icon} size={44} color="#ffffff" style={{ marginBottom: 4 }} />}
        <Text style={celebStyles.badgeLabel}>{cfg.label}</Text>
        <Text style={celebStyles.badgeSub}>{cfg.sub}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const celebStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  badge: {
    paddingHorizontal: 48, paddingVertical: 28, borderRadius: 30, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 14,
  },
  badgeLabel: { fontSize: 48, fontWeight: '900', letterSpacing: -1, color: '#ffffff' },
  badgeSub: { fontSize: 13, fontWeight: '800', letterSpacing: 3, marginTop: 2, color: '#ffffff', opacity: 0.9 },
  badgeUmpire: { width: 44, height: 44, marginBottom: 4, tintColor: '#ffffff', resizeMode: 'contain' },
});

// Deliveries that are NOT one of the over's six balls. Must match the server's own
// list (backend/src/routes/matches.js) or the scorecard's overs disagree with the
// live score. 'deadBall' is a wicket taken without a ball being bowled — the
// non-striker run out backing up (Law 38.3).

// Cricket dismissal notation: "b Bowler", "c Fielder b Bowler", "c & b Bowler",
// "lbw b Bowler", "st Keeper b Bowler", "run out (Fielder)", "hit wicket b Bowler".
// `directHit` is only ever passed for a run out — it is what the scorer said
// happened, and until now it was recorded, scored by MVP, and never once shown
// to the person reading the card.
function formatDismissal(wicketType, catcher, bowler, directHit) {
  const t = String(wicketType || '').toLowerCase().replace(/[\s&]/g, '');
  const b = bowler || '';
  switch (t) {
    case 'bowled': return `b ${b}`;
    case 'lbw': return `lbw b ${b}`;
    case 'caught':
      if (catcher && bowler && catcher === bowler) return `c & b ${b}`;
      return `c ${catcher || 'fielder'} b ${b}`;
    case 'caughtbowled': case 'candb': return `c & b ${b}`;
    case 'stumped': return `st ${catcher || 'keeper'} b ${b}`;
    case 'runout': return `run out${catcher ? ` (${catcher}${directHit ? ', direct hit' : ''})` : ''}`;
    case 'hitwicket': return `hit wicket b ${b}`;
    case 'retiredout': return 'retired out';
    case 'retiredhurt': return 'retired hurt';
    default: return wicketType || 'out';
  }
}

// Full batting card built from the batting XI (in order) so EVERY batter shows —
// including run-out non-strikers who never faced a ball, and yet-to-bat players.
function computeBatting(innings, battingXI) {
  const fig = {};   // playerId -> figures (runs/balls off the bat)
  const dis = {};   // dismissedPlayerId -> howOut (covers non-facing run-outs too)
  const nameFromBall = {};
  (innings.oversData || []).forEach((over) => {
    (over.balls || []).forEach((ball) => {
      const id = ball.batterId;
      if (id) {
        if (ball.batter?.name) nameFromBall[id] = ball.batter.name;
        if (!fig[id]) fig[id] = { runs: 0, balls: 0, fours: 0, sixes: 0 };
        const et = ball.extraType;
        if (isBallFaced(ball)) fig[id].balls += 1;
        if (offTheBat(ball)) {
          fig[id].runs += ball.runs;
          if (ball.runs === 4) fig[id].fours += 1;
          if (ball.runs === 6) fig[id].sixes += 1;
        }
      }
      if (ball.isWicket && ball.dismissedPlayerId) {
        dis[ball.dismissedPlayerId] = formatDismissal(ball.wicketType, ball.wicketAssists, ball.bowler?.name || over.bowler?.name, ball.directHit);
      }
    });
  });
  // The pair currently at the crease, so a new batter shows the moment they're sent
  // in — not only after facing their first ball (they have no ball log yet, so
  // without this they'd sit under "Yet to bat" until ball one).
  const atCrease = (id) => id && (id === innings.strikerId || id === innings.nonStrikerId);
  // Prefer the actual XI order; fall back to whoever appears in the ball log — plus
  // the current crease, so the not-yet-faced incoming batter isn't dropped here too.
  const xi = (battingXI && battingXI.length)
    ? battingXI
    : [...new Set([...Object.keys(fig), ...Object.keys(dis), innings.strikerId, innings.nonStrikerId].filter(Boolean))]
        .map((id) => ({ id, name: nameFromBall[id] || 'Unknown' }));
  const batted = [];
  const yetToBat = [];
  xi.forEach((p) => {
    const f = fig[p.id];
    const out = dis[p.id];
    if (f || out || atCrease(p.id)) {
      batted.push({
        id: p.id, name: p.name, runs: f?.runs || 0, balls: f?.balls || 0,
        fours: f?.fours || 0, sixes: f?.sixes || 0, out: !!out, howOut: out || '',
      });
    } else {
      yetToBat.push(p.name);
    }
  });
  return { batted, yetToBat };
}

// Bowling card from the ball log: overs from legal balls, runs actually charged to
// the bowler (byes/leg-byes excluded), wickets (run-outs not credited), maidens.
function computeBowling(innings) {
  const map = {};
  const order = [];
  // Per-DELIVERY bowler so a shared over splits correctly. Falls back to the over's
  // bowler for legacy balls recorded before per-ball bowlers existed.
  (innings.oversData || []).forEach((over) => {
    let overRuns = 0, overLegal = 0;
    const overBowlers = new Set();
    (over.balls || []).forEach((b) => {
      const id = b.bowlerId || over.bowlerId;
      if (!id) return;
      if (!map[id]) { map[id] = { id, name: b.bowler?.name || over.bowler?.name || 'Unknown', legalBalls: 0, runs: 0, wickets: 0, maidens: 0 }; order.push(id); }
      overBowlers.add(id);
      const et = b.extraType;
      let charged = 0, legal = false;
      if (et === 'wide') charged = b.extras;
      else if (et === 'noBall') charged = b.runs + b.extras;
      else if (et === 'bye' || et === 'legBye') legal = true;      // not charged
      else if (et === 'penalty' || et === 'retired') charged = 0;  // not a delivery
      else { charged = b.runs; legal = true; }
      map[id].runs += charged; overRuns += charged;
      if (legal) { map[id].legalBalls += 1; overLegal += 1; }
      if (b.isWicket) {
        // Shared rule — this list was two items where the server's is nine.
        if (isBowlerWicket(b.wicketType)) map[id].wickets += 1;
      }
    });
    // A maiden requires one bowler to bowl the whole 6-legal over for 0 runs.
    if (overLegal >= 6 && overRuns === 0 && overBowlers.size === 1) map[[...overBowlers][0]].maidens += 1;
  });
  return order.map((id) => {
    const b = map[id];
    const oversFloat = b.legalBalls / 6;
    return { ...b, overs: `${Math.floor(b.legalBalls / 6)}.${b.legalBalls % 6}`, economy: oversFloat > 0 ? (b.runs / oversFloat).toFixed(1) : '0.0' };
  });
}

// Total overs bowled in the innings (from legal balls) → "X.Y".
function inningsOvers(innings) {
  let legal = 0;
  (innings.oversData || []).forEach((over) => (over.balls || []).forEach((b) => {
    if (!NON_BALL_EXTRAS.includes(b.extraType)) legal += 1;
  }));
  return `${Math.floor(legal / 6)}.${legal % 6}`;
}

// Extras breakdown: byes / leg-byes / wides / no-balls / penalty + total.
function computeExtras(innings) {
  const e = { byes: 0, legByes: 0, wides: 0, noBalls: 0, penalty: 0, total: 0 };
  (innings.oversData || []).forEach((over) => (over.balls || []).forEach((b) => {
    if (b.extraType === 'bye') e.byes += b.extras;
    else if (b.extraType === 'legBye') e.legByes += b.extras;
    else if (b.extraType === 'wide') e.wides += b.extras;
    else if (b.extraType === 'noBall') e.noBalls += b.extras;
    else if (b.extraType === 'penalty') e.penalty += b.extras;
    e.total += (['bye', 'legBye', 'wide', 'noBall', 'penalty'].includes(b.extraType) ? b.extras : 0);
  }));
  return e;
}

// Fall of Wickets: "score-wicket (Batter, over.ball)" in the order they fell.
function computeFOW(innings, nameById) {
  const fow = [];
  let running = 0, wkts = 0, legal = 0;
  (innings.oversData || []).forEach((over) => (over.balls || []).forEach((b) => {
    running += b.runs + b.extras;
    if (!NON_BALL_EXTRAS.includes(b.extraType)) legal += 1;
    if (b.isWicket) {
      wkts += 1;
      fow.push({ wkt: wkts, score: running, name: nameById[b.dismissedPlayerId] || 'batter', over: `${Math.floor(legal / 6)}.${legal % 6}` });
    }
  }));
  return fow;
}

// Current partnership: runs added (bat + extras conceded) and legal balls faced by
// the team since the last wicket fell (or since the innings began, if none yet).
function computePartnership(innings) {
  const balls = [];
  (innings.oversData || []).forEach((over) => (over.balls || []).forEach((b) => balls.push(b)));
  let lastWicketIdx = -1;
  balls.forEach((b, i) => { if (b.isWicket) lastWicketIdx = i; });
  let runs = 0, legalBalls = 0;
  for (let i = lastWicketIdx + 1; i < balls.length; i++) {
    const b = balls[i];
    runs += (b.runs || 0) + (b.extras || 0);
    if (!NON_BALL_EXTRAS.includes(b.extraType)) legalBalls += 1;
  }
  return { runs, balls: legalBalls };
}

// Powerplay: runs + wickets in the mandatory opening overs (T20 → 6, ODI → 10,
// short formats → ~30%). Returns null until at least one ball of it is bowled.
function computePowerplay(innings, totalOvers) {
  const t = totalOvers || 20;
  const ppOvers = t >= 40 ? 10 : t >= 20 ? 6 : Math.max(1, Math.ceil(t * 0.3));
  let runs = 0, wkts = 0, seen = false;
  (innings.oversData || []).forEach((over) => {
    if (over.overNumber <= ppOvers) {
      seen = true;
      runs += (over.runs || 0) + (over.extras || 0);
      wkts += (over.wickets || 0);
    }
  });
  return seen ? { label: 'Mandatory', overs: `0.1 - ${ppOvers}.0`, runs, wkts } : null;
}

// Every partnership of the innings, in order: the two batters + each one's runs
// (balls) contribution, and the stand's total runs (balls). Partnership runs
// INCLUDE extras conceded while the pair was together; balls = legal balls faced.
function computePartnerships(innings, nameById) {
  const parts = [];
  const fresh = () => ({ ids: [], names: {}, bat: {}, runs: 0, balls: 0 });
  let cur = fresh();
  const register = (id, name) => {
    if (!id || cur.ids.includes(id)) return;
    cur.ids.push(id);
    cur.names[id] = name || nameById[id] || 'batter';
    cur.bat[id] = { runs: 0, balls: 0 };
  };
  (innings.oversData || []).forEach((over) => {
    (over.balls || []).forEach((b) => {
      register(b.batterId, b.batter?.name);
      register(b.nonStrikerId, b.nonStriker?.name);
      const et = b.extraType;
      const legal = !NON_BALL_EXTRAS.includes(et);
      cur.runs += (b.runs || 0) + (b.extras || 0);
      if (legal) cur.balls += 1;
      if (b.batterId && cur.bat[b.batterId]) {
        if (!et || et === 'noBall') cur.bat[b.batterId].runs += b.runs;   // runs off the bat
        if (et !== 'wide' && et !== 'penalty' && et !== 'retired') cur.bat[b.batterId].balls += 1;
      }
      if (b.isWicket) { if (cur.ids.length) parts.push(cur); cur = fresh(); }
    });
  });
  if (cur.ids.length && (cur.runs > 0 || cur.balls > 0)) parts.push(cur);   // unbroken stand
  return parts;
}

// 2nd-innings chase math: runs still needed, balls left, required run rate, current
// run rate, and a naive win-read for the chasing side. Only meaningful once a target
// is set (innings 2). Returns null otherwise.
function computeChase(innings, totalOvers, squadSize = 11) {
  if (!innings || !innings.targetScore || innings.inningNumber !== 2) return null;
  const target = innings.targetScore;
  const need = Math.max(0, target - innings.totalRuns);
  let legal = 0;
  (innings.oversData || []).forEach((over) => (over.balls || []).forEach((b) => {
    if (!NON_BALL_EXTRAS.includes(b.extraType)) legal += 1;
  }));
  const ballsBowled = legal;
  const ballsLeft = Math.max(0, (totalOvers || 20) * 6 - ballsBowled);
  const crr = ballsBowled > 0 ? (innings.totalRuns / (ballsBowled / 6)) : 0;
  const rrr = ballsLeft > 0 ? (need / (ballsLeft / 6)) : (need > 0 ? Infinity : 0);
  // One short of the XI, not ten. This app's squads run from 1 to 15 and local
  // cricket plays eight a side, where "6 wkts" left with 2 down is a lie that
  // also feeds the win bar.
  const wktsLeft = Math.max(0, Math.max(1, squadSize - 1) - innings.totalWickets);
  // Simple, honest win-read (not a model): pace + wickets in hand. Chasers' share.
  let chaseWin;
  if (need <= 0) chaseWin = 100;
  else if (ballsLeft === 0 || wktsLeft <= 0) chaseWin = 0;
  else {
    const paceGap = crr - rrr;                    // +ve → ahead of the rate
    const wktFactor = Math.min(1, wktsLeft / 7);  // full confidence with 7+ in hand
    chaseWin = Math.round(Math.max(2, Math.min(98, 50 + paceGap * 7 * wktFactor)));
  }
  return { target, need, ballsLeft, rrr, crr, wktsLeft, chaseWin, teamName: innings.battingTeam?.name || 'Chasing' };
}

// Short label for a ball in the over-by-over timeline. A wicket is written onto the
// delivery that took it ('wd+W', '2nb+W') — a run out can fall on any delivery, and
// the timeline has to show both halves.
function ballLabel(b) {
  const w = b.isWicket ? '+W' : '';
  if (b.extraType === 'wide') return `${b.extras > 1 ? b.extras : ''}wd${w}`;
  if (b.extraType === 'noBall') return `${b.runs > 0 ? b.runs : ''}nb${w}`;
  if (b.extraType === 'bye') return `${b.extras}b${w}`;
  if (b.extraType === 'legBye') return `${b.extras}lb${w}`;
  if (b.extraType === 'penalty') return 'P5';
  if (b.extraType === 'retired') return 'R';
  if (b.extraType === 'deadBall') return 'W';   // run out before the ball was bowled
  if (b.isWicket) return b.runs > 0 ? `${b.runs}+W` : 'W';
  return b.runs === 0 ? '•' : `${b.runs}`;
}

// One text commentary line for a single ball — this IS Live Commentary, not a
// second, private version of it. Until this fix, ScorecardScreen's own LIVE
// tab computed its own generic line locally ("Bowler to Batter, FOUR!") from
// raw runs and extraType, with no idea a shot had ever been recorded — the
// exact bug LiveMatchScreen had, just never migrated here when that one was
// fixed. The two screens read the SAME /scorecard response; one used the
// server's shot-aware `b.commentary`, the other quietly kept generating its
// own next to it. A cover drive to Cover read "Beautiful cover drive through
// the covers for four." on one screen and "Bowler to Kannan K, FOUR!" on the
// other, for the identical delivery.
//
// `ball.commentary` already covers dismissal detail (with the fielder's name)
// and dropped catches — see shotCommentary.js's wicket and `dropped` handling
// — so nothing here needs to rebuild that. The one line of local wording lost
// is the specific "runs out ... backing up" phrasing for a dead-ball run-out;
// that ball still carries isWicket+wicketType and reads as a normal run-out,
// which is a real dismissal correctly described, just without that one extra
// clause — an acceptable trade for not maintaining a second engine.
function ballCommentary(ball) {
  return ball.commentary || `${ball.runs} run${ball.runs === 1 ? '' : 's'}.`;
}

// Ball-by-ball commentary for a whole innings, newest ball first.
function buildCommentary(innings) {
  // An "End of over N" summary is threaded into the feed right after that over's
  // last ball, so each completed over's total/batsmen/bowler shows inline in the
  // ball-by-ball — no separate list needed.
  const overEndByNum = {};
  computeOverEndSummaries(innings).forEach((o) => { overEndByNum[o.over] = o; });
  const lines = [];
  (innings.oversData || []).forEach((over) => {
    let legalInOver = 0;
    (over.balls || []).forEach((ball, idx) => {
      const isLegal = !NON_BALL_EXTRAS.includes(ball.extraType);
      if (isLegal) legalInOver += 1;
      lines.push({
        type: 'ball',
        key: `${over.id}-${idx}`,
        label: `${over.overNumber - 1}.${legalInOver}`,
        text: ballCommentary(ball),
        isWicket: !!ball.isWicket,
        // Shared rule, not `!extraType`: a four off a no ball is the batter's
        // four, and the batting table above this already counted it as one.
        isBoundary: isBoundary(ball),
        isSix: isSix(ball),          // a six gets its own accent — it's the moment
      });
    });
    const oe = overEndByNum[over.overNumber];
    if (oe) lines.push({ type: 'overend', key: `oe-${over.overNumber}`, data: oe });
  });
  return lines.reverse();
}

// Highlights: wickets, fifties/hundreds, 5-wicket hauls and hat-tricks, across the
// whole match — newest first. Hat-trick/5-for logic mirrors the live toast detector
// in ScoringScreen: only a bowler-credited wicket (not run-out/retired) extends a
// bowler's streak; any other legal, non-wicket ball resets it; wides/no-balls and
// non-credited wickets leave the streak untouched.
// Notable moments grouped BY INNINGS. Each group is the innings' events
// (boundaries, milestones, wickets, hat-tricks, five-fors) newest-first.
function computeHighlights(match) {
  const groups = [];
  (match.innings || []).forEach((innings, inningIdx) => {
    const inningsLabel = inningIdx === 0 ? '1st Innings' : '2nd Innings';
    const teamName = innings.battingTeam?.name || '';
    const items = [];
    const batterRuns = {};
    const bowlerWkts = {};
    let streakBowlerId = null, streakCount = 0;
    (innings.oversData || []).forEach((over) => {
      let legalInOver = 0;
      (over.balls || []).forEach((ball) => {
        const bowlerId = ball.bowlerId || over.bowlerId;   // per-delivery bowler
        const bowlerName = ball.bowler?.name || over.bowler?.name || 'Bowler';
        const et = ball.extraType;
        const isLegal = !NON_BALL_EXTRAS.includes(et);
        if (isLegal) legalInOver += 1;
        const label = `${over.overNumber - 1}.${legalInOver}`;
        const batterName = ball.batter?.name || 'Batter';
        const offBat = !et || et === 'noBall';   // runs credited to the bat

        // Boundaries — a four or six off the bat. The sentence is the same
        // ball.commentary every other tab reads; only the list entry (icon,
        // key, "this is a highlight") is this tab's own. Used to build its own
        // "SIX! <batter> clears the rope" here — shot-blind, and a second
        // wording of exactly what commentaryFor() already says for this ball.
        if (ball.batterId && offBat && !ball.isWicket) {
          if (ball.runs === 6) items.push({ key: `${ball.id}-6`, inningsLabel, label, icon: 'fire', kind: 'six', text: ball.commentary || `${batterName} hits six.` });
          else if (ball.runs === 4) items.push({ key: `${ball.id}-4`, inningsLabel, label, icon: 'cricket', kind: 'four', text: ball.commentary || `${batterName} hits four.` });
        }

        // A chance put down. It reaches the ball-by-ball commentary already, but
        // Highlights is the tab a spectator actually scans — and a drop is a
        // highlight in the truest sense: it is the moment a match turned, told
        // by what did NOT happen. Rare enough not to crowd the list (four in
        // this database's 1,892 balls).
        //
        // commentaryFor() already appends the drop as a clause on the ball's
        // own sentence ("... for four. Put down by X — a tough chance."), so
        // reusing it here means this list stops maintaining its own separate
        // "DROPPED! X puts down..." wording for the same fact.
        if (ball.droppedBy) {
          items.push({
            key: `${ball.id}-drop`, inningsLabel, label, icon: 'hand-back-right-off-outline', kind: 'drop',
            text: ball.commentary || `Dropped by ${ball.droppedBy}.`,
          });
        }

        // Batter milestone — runs off the bat only, same rule as computeBatting.
        if (ball.batterId && offBat) {
          const before = batterRuns[ball.batterId] || 0;
          const after = before + ball.runs;
          batterRuns[ball.batterId] = after;
          if (before < 100 && after >= 100) {
            items.push({ key: `${over.id}-${ball.batterId}-100`, inningsLabel, label, icon: 'trophy', kind: 'milestone', text: `HUNDRED! ${batterName} brings up the century` });
          } else if (before < 50 && after >= 50) {
            items.push({ key: `${over.id}-${ball.batterId}-50`, inningsLabel, label, icon: 'star', kind: 'milestone', text: `FIFTY! ${batterName} reaches 50` });
          }
        }

        if (ball.isWicket) {
          // Was its own formatDismissal() call, independently wording the same
          // dismissal commentaryFor() already describes (with the same fielder
          // detail) for the ball-by-ball feed. The WICKET! shout is redundant
          // on top of it too — every commentaryFor() wicket line already
          // announces itself ("Bowled him!", "Given!", "Run out!"...), and the
          // icon carries the at-a-glance signal a text prefix doesn't need to.
          items.push({ key: `${over.id}-${ball.batterId}-w`, inningsLabel, label, icon: 'alert-octagon', kind: 'wicket', text: ball.commentary || `${batterName} is out.` });
          const bowlerCredited = isBowlerWicket(ball.wicketType);
          if (bowlerCredited) {
            streakCount = streakBowlerId === bowlerId ? streakCount + 1 : 1;
            streakBowlerId = bowlerId;
            bowlerWkts[bowlerId] = (bowlerWkts[bowlerId] || 0) + 1;
            if (streakCount === 3) items.push({ key: `${over.id}-${bowlerId}-hat`, inningsLabel, label, icon: 'cricket', kind: 'milestone', text: `HAT-TRICK! ${bowlerName} takes three wickets in a row` });
            if (bowlerWkts[bowlerId] === 5) items.push({ key: `${over.id}-${bowlerId}-5w`, inningsLabel, label, icon: 'cricket', kind: 'milestone', text: `FIVE-WICKET HAUL! ${bowlerName} completes a five-for` });
          }
        } else if (isLegal) {
          streakCount = 0; streakBowlerId = null;   // a non-wicket legal ball breaks the streak
        }
      });
    });
    if (items.length) groups.push({ label: inningsLabel, teamName, items: items.reverse() });
  });
  return groups;
}

// Cumulative team score at each over boundary — the points a worm/Manhattan
// graph plots. Starts at (0, 0) so the line always begins at the origin.
function cumulativePoints(innings) {
  const points = [{ over: 0, runs: 0 }];
  let cum = 0;
  [...(innings.oversData || [])].sort((a, b) => a.overNumber - b.overNumber).forEach((over) => {
    cum += (over.runs || 0) + (over.extras || 0);
    points.push({ over: over.overNumber, runs: cum });
  });
  return points;
}

// Run-rate "worm" graph — cumulative score per over, both innings overlaid so you
// can see at a glance who was ahead of the required pace at any point.
function WormChart({ innings1, innings2, totalOvers }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const p1 = innings1 ? cumulativePoints(innings1) : [];
  const p2 = innings2 ? cumulativePoints(innings2) : [];
  if (p1.length < 2 && p2.length < 2) return null;   // nothing bowled yet

  const W = 320, H = 130, PAD = 14;
  const maxOver = Math.max(totalOvers || 0, p1[p1.length - 1]?.over || 0, p2[p2.length - 1]?.over || 0, 1);
  const maxRuns = Math.max(p1[p1.length - 1]?.runs || 0, p2[p2.length - 1]?.runs || 0, 10);
  const X = (o) => PAD + (o / maxOver) * (W - PAD * 2);
  const Y = (r) => H - PAD - (r / maxRuns) * (H - PAD * 2);
  const pathFor = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${X(p.over).toFixed(1)} ${Y(p.runs).toFixed(1)}`).join(' ');

  return (
    <View style={styles.wormCard}>
      <Text style={styles.wormTitle}>RUN RATE</Text>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke={DS.line} strokeWidth={1} />
        {p1.length > 1 && <Path d={pathFor(p1)} stroke={DS.lime} strokeWidth={2.5} fill="none" />}
        {p2.length > 1 && <Path d={pathFor(p2)} stroke={DS.coral} strokeWidth={2.5} fill="none" />}
        {p1.length > 0 && <Circle cx={X(p1[p1.length - 1].over)} cy={Y(p1[p1.length - 1].runs)} r={3.5} fill={DS.lime} />}
        {p2.length > 0 && <Circle cx={X(p2[p2.length - 1].over)} cy={Y(p2[p2.length - 1].runs)} r={3.5} fill={DS.coral} />}
      </Svg>
      <View style={styles.wormLegendRow}>
        {innings1 &&
          <View style={styles.wormLegendItem}>
            <View style={[styles.wormDot, { backgroundColor: DS.lime }]} />
            <Text style={styles.wormLegendText} numberOfLines={1}>{innings1.battingTeam?.name || 'Team 1'} · {innings1.totalRuns}/{innings1.totalWickets}</Text>
          </View>
        }
        {innings2 &&
          <View style={styles.wormLegendItem}>
            <View style={[styles.wormDot, { backgroundColor: DS.coral }]} />
            <Text style={styles.wormLegendText} numberOfLines={1}>{innings2.battingTeam?.name || 'Team 2'} · {innings2.totalRuns}/{innings2.totalWickets}</Text>
          </View>
        }
      </View>
    </View>
  );
}

function TableHeader({ cols }) {const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.tableHeader}>
      {cols.map((c, i) =>
      <Text key={i} style={[styles.cell, i === 0 ? styles.nameCol : styles.numCol, styles.headerCell]}>{c}</Text>
      )}
    </View>);

}

// ── SCORECARD tab: batting + bowling tables, extras, fall of wickets ──────────
function InningsScorecard({ innings, index, squads, totalOvers, expanded = true, collapsible = false, onToggle, onPlayer }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const battingXI = (squads || [])
    .filter((s) => s.teamId === innings.battingTeamId)
    .map((s) => ({ id: s.playerId, name: s.player?.name || 'Unknown' }));
  const nameById = Object.fromEntries((squads || []).map((s) => [s.playerId, s.player?.name || 'batter']));
  const avatarById = Object.fromEntries((squads || []).map((s) => [s.playerId, s.player?.user?.avatarUrl || null]));
  const { batted, yetToBat } = computeBatting(innings, battingXI);
  const bowlers = computeBowling(innings);
  const extras = computeExtras(innings);
  const fow = computeFOW(innings, nameById);
  const powerplay = computePowerplay(innings, totalOvers);
  const partnerships = computePartnerships(innings, nameById);
  const label = index === 0 ? '1st' : '2nd';

  const Header = collapsible ? TouchableOpacity : View;

  return (
    <View style={styles.inningsCard}>
      {/* Team header — the whole banner toggles when there's more than one innings to compare */}
      <Header activeOpacity={0.7} onPress={collapsible ? onToggle : undefined}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderLeft}>
            <View style={styles.inningsIndicator} />
            <Text style={styles.sectionHeaderText}>
              {(innings.battingTeam?.name || 'TEAM').toUpperCase()}
            </Text>
          </View>
          <Text style={styles.inningsLabel}>{label} Innings</Text>
        </View>

        <View style={styles.inningsScoreBanner}>
          <Text style={styles.inningsScore}>{innings.totalRuns}/{innings.totalWickets}</Text>
          <Text style={styles.inningsOvers}>({inningsOvers(innings)} ov)</Text>
          {collapsible &&
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={DS.textMuted} style={{ marginLeft: 'auto' }} />
          }
        </View>
      </Header>

      {expanded &&
        <>
          <TableHeader cols={['BATTER', 'R', 'B', '4s', '6s', 'SR']} />
          {batted.map((b, i) =>
          // Tapping a name opens that player's profile — the same board Rankings
          // opens. A scorecard is mostly a list of people, and every one of them
          // was previously a dead end.
          <TouchableOpacity
            key={i}
            style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}
            onPress={() => b.id && onPlayer?.({ id: b.id, name: b.name })}
            disabled={!b.id || !onPlayer}
            activeOpacity={0.7}>
              <View style={[styles.cell, styles.nameCol, styles.nameCell]}>
                <PlayerAvatar name={b.name} avatarUrl={avatarById[b.id]} size={20} style={styles.rowAvatar} />
                <View style={{ flex: 1 }}>
                  <View style={styles.batterNameRow}>
                    <Text style={[styles.batterName, { flexShrink: 1 }]} numberOfLines={2}>{b.name}</Text>
                    {!b.out && b.id === innings.strikerId &&
                      <Icon name="star" size={11} color={DS.lime} style={{ marginLeft: 3 }} />}
                  </View>
                  <Text style={b.out ? styles.howOut : styles.notOut} numberOfLines={2}>{b.out ? b.howOut : 'not out'}</Text>
                </View>
              </View>
              <Text style={[styles.cell, styles.numCol, b.runs >= 50 && styles.highlight]}>{b.runs}</Text>
              <Text style={[styles.cell, styles.numCol]}>{b.balls}</Text>
              <Text style={[styles.cell, styles.numCol]}>{b.fours}</Text>
              <Text style={[styles.cell, styles.numCol]}>{b.sixes}</Text>
              <Text style={[styles.cell, styles.numCol]}>
                {b.balls > 0 ? (b.runs / b.balls * 100).toFixed(0) : '0'}
              </Text>
            </TouchableOpacity>
          )}
          {/* Extras + Total */}
          <View style={styles.extrasRow}>
            <Text style={styles.extrasLabel}>Extras</Text>
            <Text style={styles.extrasDetail}>
              (b {extras.byes}, lb {extras.legByes}, w {extras.wides}, nb {extras.noBalls}{extras.penalty ? `, p ${extras.penalty}` : ''})
            </Text>
            <Text style={styles.extrasVal}>{extras.total}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={styles.totalDetail}>({inningsOvers(innings)} ov)</Text>
            <Text style={styles.totalVal}>{innings.totalRuns}/{innings.totalWickets}</Text>
          </View>

          {yetToBat.length > 0 &&
            <View style={styles.yetToBatRow}>
              <Text style={styles.yetToBatLabel}>Yet to bat: </Text>
              <Text style={styles.yetToBatNames}>{yetToBat.join(', ')}</Text>
            </View>
          }

          {fow.length > 0 &&
            <View style={styles.fowBox}>
              <Text style={styles.fowTitle}>FALL OF WICKETS</Text>
              <Text style={styles.fowText}>
                {fow.map((f) => `${f.score}-${f.wkt} (${f.name}, ${f.over})`).join('   ')}
              </Text>
            </View>
          }

          {/* Bowling section */}
          <View style={[styles.sectionHeaderRow, { marginTop: 18 }]}>
            <View style={styles.sectionHeaderLeft}>
              <View style={[styles.inningsIndicator, { backgroundColor: DS.coral }]} />
              <Text style={styles.sectionHeaderText}>
                {(innings.bowlingTeam?.name || 'TEAM').toUpperCase()} BOWLING
              </Text>
            </View>
          </View>

          <TableHeader cols={['BOWLER', 'O', 'M', 'R', 'W', 'ECON']} />
          {bowlers.map((b, i) =>
          <TouchableOpacity
            key={i}
            style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}
            onPress={() => b.id && onPlayer?.({ id: b.id, name: b.name })}
            disabled={!b.id || !onPlayer}
            activeOpacity={0.7}>
              <View style={[styles.cell, styles.nameCol, styles.nameCell]}>
                <PlayerAvatar name={b.name} avatarUrl={avatarById[b.id]} size={20} style={styles.rowAvatar} />
                <Text style={[styles.bowlerName, { flex: 1 }]} numberOfLines={2}>{b.name}</Text>
              </View>
              <Text style={[styles.cell, styles.numCol]}>{b.overs}</Text>
              <Text style={[styles.cell, styles.numCol]}>{b.maidens}</Text>
              <Text style={[styles.cell, styles.numCol]}>{b.runs}</Text>
              <Text style={[styles.cell, styles.numCol, b.wickets >= 3 && styles.highlight]}>{b.wickets}</Text>
              <Text style={[styles.cell, styles.numCol]}>{b.economy}</Text>
            </TouchableOpacity>
          )}

          {/* Powerplay */}
          {powerplay &&
            <>
              <View style={styles.subHeaderRow}>
                <Text style={styles.subHeaderText}>POWERPLAY</Text>
                <View style={styles.subHeaderCols}>
                  <Text style={styles.ppColLabel}>Overs</Text>
                  <Text style={styles.ppColLabel}>Runs</Text>
                </View>
              </View>
              <View style={styles.ppRow}>
                <Text style={styles.ppLabel}>{powerplay.label}</Text>
                <View style={styles.subHeaderCols}>
                  <Text style={styles.ppOvers}>{powerplay.overs}</Text>
                  <Text style={styles.ppRuns}>{powerplay.runs}{powerplay.wkts ? `/${powerplay.wkts}` : ''}</Text>
                </View>
              </View>
            </>
          }

          {/* Partnerships */}
          {partnerships.length > 0 &&
            <>
              <View style={styles.subHeaderRow}>
                <Text style={styles.subHeaderText}>PARTNERSHIPS</Text>
              </View>
              {partnerships.map((p, i) => {
                const a = p.ids[0], b = p.ids[1];
                const fig = (id) => id ? `${p.bat[id].runs}(${p.bat[id].balls})` : '';
                return (
                  <View key={i} style={[styles.pnrRow, i % 2 === 0 && styles.tableRowAlt]}>
                    <View style={styles.pnrSide}>
                      <Text style={styles.pnrName} numberOfLines={1}>{a ? p.names[a] : '—'}</Text>
                      <Text style={styles.pnrFig}>{fig(a)}</Text>
                    </View>
                    <View style={styles.pnrMid}>
                      <Text style={styles.pnrTotal}>{p.runs}({p.balls})</Text>
                    </View>
                    <View style={[styles.pnrSide, { justifyContent: 'flex-end' }]}>
                      <Text style={styles.pnrFig}>{fig(b)}</Text>
                      <Text style={[styles.pnrName, { textAlign: 'right' }]} numberOfLines={1}>{b ? p.names[b] : 'not out'}</Text>
                    </View>
                  </View>
                );
              })}
            </>
          }

        </>
      }
    </View>);

}

// ── OVERS tab: every over as a row of colour-coded ball chips ─────────────────
function InningsOvers({ innings }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const overs = [...(innings.oversData || [])].sort((a, b) => a.overNumber - b.overNumber);
  if (!overs.length) {
    return <Text style={styles.emptyTabText}>No overs bowled yet.</Text>;
  }
  // Bowlers who bowled this over, in order, with their delivery counts — so a
  // shared over lists both (e.g. "Bumrah – 2 balls · Siraj – 4 balls").
  const overBowlers = (ov) => {
    const seq = [], idx = {};
    (ov.balls || []).forEach((b) => {
      const id = b.bowlerId || ov.bowlerId;
      if (id == null) return;
      if (!(id in idx)) { idx[id] = seq.length; seq.push({ id, name: b.bowler?.name || ov.bowler?.name || 'Bowler', balls: 0 }); }
      seq[idx[id]].balls += 1;
    });
    return seq;
  };
  return (
    <View style={styles.inningsCard}>
      {overs.map((ov) => {
        const bwl = overBowlers(ov);
        const shared = bwl.length > 1;
        return (
        <View key={ov.id} style={styles.overBlock}>
          <View style={styles.overBlockHead}>
            <Text style={styles.overLineNum}>Over {ov.overNumber}</Text>
            {!shared && bwl[0] && <Text style={styles.overBowlerSingle} numberOfLines={1}>{bwl[0].name}</Text>}
            <Text style={styles.overBlockRuns}>{ov.runs + ov.extras} run{(ov.runs + ov.extras) !== 1 ? 's' : ''}</Text>
          </View>
          {shared &&
            <View style={styles.overShared}>
              {bwl.map((x) => (
                <Text key={x.id} style={styles.overSharedItem}>• {x.name} – {x.balls} ball{x.balls !== 1 ? 's' : ''}</Text>
              ))}
            </View>
          }
          <View style={styles.overLineBalls}>
            {(ov.balls || []).map((b, i) => {
              const lbl = ballLabel(b);
              const isW = b.isWicket, isBoundary = !b.extraType && (b.runs === 4 || b.runs === 6), isExtra = ['wide', 'noBall', 'bye', 'legBye', 'penalty'].includes(b.extraType);
              return (
                <View key={i} style={[styles.ballChip, isW && styles.ballChipW, isBoundary && styles.ballChipBoundary, isExtra && styles.ballChipExtra]}>
                  <Text style={[styles.ballChipText, isW && { color: DS.white }, isBoundary && { color: DS.bg }]}>{lbl}</Text>
                </View>
              );
            })}
          </View>
        </View>
        );
      })}
    </View>
  );
}

const summaryInitials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

// A player's one-line stat summary from their MVP breakdown (bat/bowl/field lines).
function summaryStatLine(p) {
  const bits = [];
  if (p.batLine) bits.push(p.batLine);
  if (p.bowlLine) bits.push(p.bowlLine);
  if (p.fieldCount) bits.push(`${p.fieldCount} ${p.fieldCount === 1 ? 'catch/RO' : 'catches/ROs'}`);
  return bits.join('  ·  ');
}

// ── SUMMARY tab (completed matches only): Player of the Match, Fighter, Best
// Batter/Bowler/Fielder, and the full MVP-ranked order — computed server-side
// from the same MVP algorithm the scorer's post-match awards popup uses.
function SummaryTab({ matchId, match, onPlayer, onTeam }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const [loading, setLoading] = useState(true);
  const [awards, setAwards] = useState(null);
  const [intel, setIntel] = useState(null);

  useEffect(() => {
    let alive = true;
    legendsApi.getMatchAwards(matchId).then((res) => {
      if (alive && res.success) setAwards(res.data?.awards || null);
    }).finally(() => { if (alive) setLoading(false); });
    // Where the runs went, for matches that recorded it. Its own request rather
    // than part of the awards call, and its own failure: a match with no shots
    // must still show its awards, and a shot fetch that fails must not take the
    // overview down with it.
    legendsApi.getMatchIntelligence(matchId).then((res) => {
      if (alive && res.success && res.shots?.length) setIntel(res);
    }).catch(() => {});
    return () => { alive = false; };
  }, [matchId]);

  // Awards arrive from the MVP algorithm as NAMES — no ids — so everything this
  // tab wants to know about a player (their photo, and whether their profile can
  // be opened) has to be looked up against the squad records, which are the only
  // place a name and an id sit together.
  const squadByName = React.useMemo(() => {
    const map = {};
    (match?.squads || []).forEach((s) => { if (s.player?.name && !map[s.player.name]) map[s.player.name] = s.player; });
    return map;
  }, [match]);
  const avatarFor = (name) => squadByName[name]?.user?.avatarUrl || null;

  // Touch props for an award/MVP row. The award itself carries `playerId` for
  // anyone who was in a squad; the name lookup is the fallback. Off-squad
  // fielders have neither — the MVP algorithm keys them on "name:…" precisely
  // because there is no account behind them — so their row stays inert instead
  // of pushing a profile screen with an undefined id and spinning forever.
  const playerTap = (award) => {
    const pl = squadByName[award?.name];
    const id = award?.playerId || pl?.id;
    if (!id) return { disabled: true, activeOpacity: 1 };
    return {
      activeOpacity: 0.85,
      onPress: () => onPlayer?.({
        id,
        name: award?.name || pl?.name,
        team: award?.teamName || null,
        avatarUrl: pl?.user?.avatarUrl || null,
      }),
    };
  };
  const teamTap = (team) => (team?.id
    ? { activeOpacity: 0.85, onPress: () => onTeam?.(team) }
    : { disabled: true, activeOpacity: 1 });

  if (loading) return <ActivityIndicator color={DS.lime} style={{ marginTop: 40 }} />;

  // Built once and threaded through EVERY return below, including the two
  // "no awards" ones. A match can be fully tracked and still have no award data
  // — awards need a completed match the MVP algorithm could read — and dropping
  // the wagon wheel out of those branches would hide the whole feature behind
  // an unrelated failure.
  // ONE BOARD PER INNINGS, not one for the match. A single wheel carrying both
  // innings is two teams' batting drawn on top of each other, and its "scoring
  // areas" belong to neither of them. Falls back to a combined board only if the
  // per-innings breakdown is missing (an older API build).
  const shotSection = intel ? (
    (intel.byInnings?.length ? intel.byInnings : [null]).map((inn, i) => (
      <ShotBoard
        key={inn?.id || `all-${i}`}
        shots={inn ? intel.shots.filter((s) => s.inningId === inn.id) : intel.shots}
        summary={inn ? inn.summary : intel.summary}
        title="BALL INTELLIGENCE"
        subtitle={inn ? `${inn.battingTeam || `Innings ${inn.number}`} — where the runs went` : 'Where the runs went'}
      />
    ))
  ) : null;

  if (!awards) {
    return (
      <View style={{ gap: 12 }}>
        {shotSection}
        <Text style={styles.emptyTabText}>Awards not available for this match.</Text>
      </View>
    );
  }

  const motm = awards.manOfMatch;
  const fighter = awards.fighter;
  const awardRows = [
    fighter && { key: 'fighter', label: 'Fighter of the Match', icon: 'arm-flex', color: DS.warn || DS.coral, p: fighter },
    awards.bestBatter && { key: 'bat', label: 'Best Batter', icon: 'cricket', color: DS.blue, p: awards.bestBatter },
    awards.bestBowler && { key: 'bowl', label: 'Best Bowler', icon: 'bowling', color: DS.success || DS.lime, p: awards.bestBowler },
    awards.bestFielder && { key: 'field', label: 'Best Fielder', icon: 'hand-back-right', color: DS.lime, p: awards.bestFielder },
  ].filter(Boolean);
  const mvpOrder = awards.mvp || [];
  const t1 = match?.team1?.name || 'Team 1';
  const t2 = match?.team2?.name || 'Team 2';

  if (!motm && awardRows.length === 0) {
    return (
      <View style={{ gap: 12 }}>
        {shotSection}
        <Text style={styles.emptyTabText}>No award data for this match.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {/* Match summary — both teams' scores/overs + result. */}
      <View style={styles.summaryMatchCard}>
        <TouchableOpacity style={styles.summaryTeamLine} {...teamTap(match?.team1)}>
          <HexAvatar size={30} color={DS.lime}><Text style={styles.summaryTeamInit}>{t1[0]}</Text></HexAvatar>
          <Text style={styles.summaryTeamNm} numberOfLines={1}>{t1}</Text>
          <Text style={styles.summaryTeamSc}>{match?.score1 || '—'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.summaryTeamLine} {...teamTap(match?.team2)}>
          <HexAvatar size={30} color={DS.blue}><Text style={styles.summaryTeamInit}>{t2[0]}</Text></HexAvatar>
          <Text style={styles.summaryTeamNm} numberOfLines={1}>{t2}</Text>
          <Text style={[styles.summaryTeamSc, { color: DS.blue }]}>{match?.score2 || '—'}</Text>
        </TouchableOpacity>
        {!!match?.result &&
          <View style={styles.summaryResultBanner}>
            <Icon name="trophy-variant" size={15} color={DS.lime} />
            <Text style={styles.summaryResultTxt} numberOfLines={2}>{match.result}</Text>
          </View>
        }
      </View>

      {motm &&
        <View style={styles.summaryHero}>
          <View style={styles.summaryHeroBadge}>
            <Icon name="trophy-variant" size={13} color={DS.onLime} />
            <Text style={styles.summaryHeroBadgeTxt}>PLAYER OF THE MATCH</Text>
          </View>
          <TouchableOpacity style={styles.summaryHeroRow} {...playerTap(motm)}>
            {/* Big profile pic */}
            <HexAvatar round size={72} color={DS.lime} uri={avatarFor(motm.name)}><Text style={styles.summaryHeroInit}>{summaryInitials(motm.name)}</Text></HexAvatar>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.summaryHeroName} numberOfLines={1}>{motm.name}</Text>
              <Text style={styles.summaryHeroTeam} numberOfLines={1}>{motm.teamName}</Text>
              {!!summaryStatLine(motm) && <Text style={styles.summaryHeroStat} numberOfLines={1}>{summaryStatLine(motm)}</Text>}
            </View>
            <View style={styles.summaryMvpPill}>
              <Text style={styles.summaryMvpVal}>{motm.total}</Text>
              <Text style={styles.summaryMvpLbl}>MVP</Text>
            </View>
          </TouchableOpacity>
        </View>
      }

      {/* Fighter + Best Batter/Bowler/Fielder — smaller profile pic than the MotM */}
      {awardRows.map(({ key, label, icon, color, p }) => (
        <TouchableOpacity key={key} style={[styles.summaryAwardRow, key === 'fighter' && { borderColor: color + '55' }]} {...playerTap(p)}>
          <HexAvatar round size={46} color={color} uri={avatarFor(p.name)}><Text style={styles.summaryAwardInit}>{summaryInitials(p.name)}</Text></HexAvatar>
          <View style={{ flex: 1 }}>
            <View style={styles.summaryAwardLabelRow}>
              <Icon name={icon} size={12} color={color} />
              <Text style={styles.summaryAwardLabel}>{label.toUpperCase()}</Text>
            </View>
            <Text style={styles.summaryAwardName} numberOfLines={1}>{p.name} <Text style={styles.summaryAwardTeam}>· {p.teamName}</Text></Text>
            {!!summaryStatLine(p) && <Text style={styles.summaryAwardStat} numberOfLines={1}>{summaryStatLine(p)}</Text>}
          </View>
          <Text style={styles.summaryAwardMvp}>{p.total}</Text>
        </TouchableOpacity>
      ))}

      {mvpOrder.length > 0 &&
        <View style={styles.inningsCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderLeft}>
              <View style={styles.inningsIndicator} />
              <Text style={styles.sectionHeaderText}>MVP</Text>
            </View>
          </View>
          {/* Batting + bowling + fielding, then the total they add up to. Without
              the split a player's number is unaccountable — you can't see whether
              20 points came off the bat, with the ball, or in the field. Written on
              one line rather than as columns: four numeric columns leave nothing
              for a name on a phone. */}
          {mvpOrder.map((p, i) => (
            <TouchableOpacity key={i} style={[styles.mvpRankRow, i === 0 && { borderTopWidth: 0 }]} {...playerTap(p)}>
              <Text style={styles.mvpRank}>{i + 1}</Text>
              <HexAvatar round size={30} color={DS.surfaceHighest} uri={avatarFor(p.name)}><Text style={styles.mvpRankInit}>{summaryInitials(p.name)}</Text></HexAvatar>
              <View style={{ flex: 1 }}>
                <Text style={styles.mvpRankName} numberOfLines={1}>
                  {p.name} <Text style={styles.mvpRankTeam}>· {p.teamName}</Text>
                </Text>
                <Text style={styles.mvpSplit} numberOfLines={1}>
                  <Text style={[styles.mvpSplitLbl, { color: DS.blue }]}>BAT </Text>{p.bat ?? 0}
                  <Text style={styles.mvpSplitSep}>{'   '}</Text>
                  <Text style={[styles.mvpSplitLbl, { color: DS.success || DS.lime }]}>BOWL </Text>{p.bowl ?? 0}
                  <Text style={styles.mvpSplitSep}>{'   '}</Text>
                  <Text style={[styles.mvpSplitLbl, { color: DS.lime }]}>FLD </Text>{p.field ?? 0}
                </Text>
              </View>
              <Text style={styles.mvpRankVal}>{p.total}</Text>
            </TouchableOpacity>
          ))}
        </View>
      }
    </View>
  );
}

// ── HIGHLIGHTS tab: wickets, fifties/hundreds, 5-for and hat-tricks, whole match ─
function HighlightsTab({ match }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const groups = computeHighlights(match);
  // Which innings groups are collapsed (by label). Default: all expanded.
  const [collapsed, setCollapsed] = useState({});
  if (!groups.length) return <Text style={styles.emptyTabText}>No notable moments yet.</Text>;
  const toggle = (label) => setCollapsed((c) => ({ ...c, [label]: !c[label] }));
  // Per-kind accent: wicket = red, six = boundary-green, four = blue, else lime.
  const iconColor = (kind) => kind === 'wicket' ? DS.live
    : kind === 'six' ? (DS.success || DS.lime)
    : kind === 'four' ? DS.blue
    // A drop is a near-miss, not a triumph — the warning tone, not the lime.
    : kind === 'drop' ? DS.coral : DS.lime;
  return (
    <View style={{ gap: 12 }}>
      {groups.map((g) => {
        const open = !collapsed[g.label];
        return (
        <View key={g.label} style={styles.inningsCard}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => toggle(g.label)} style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderLeft}>
              <View style={styles.inningsIndicator} />
              <Text style={styles.sectionHeaderText}>{g.teamName ? g.teamName.toUpperCase() : g.label.toUpperCase()}</Text>
            </View>
            <Text style={styles.inningsLabel}>{g.label}</Text>
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} color={DS.textMuted} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
          {open && g.items.map((h, i) => (
            <View key={h.key} style={[styles.highlightRow, i === 0 && { borderTopWidth: 0 }]}>
              <View style={styles.highlightIconWrap}>
                <Icon name={h.icon} size={16} color={iconColor(h.kind)} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.highlightText}>{h.text}</Text>
                <Text style={styles.highlightMeta}>Ov {h.label}</Text>
              </View>
            </View>
          ))}
        </View>
        );
      })}
    </View>
  );
}

// End-of-over summary for every COMPLETED over: the team total at that point +
// the two batsmen at the crease (runs/balls) + the over's bowler figures.
// Newest over first. The in-progress current over is skipped (it isn't "ended").
// ── LIVE tab: current-over box + reverse-chronological ball commentary ───────
function LiveTab({ innings, squads, totalOvers }) {const DS = useTheme().colors;
  const CK = cricketColors(DS);const styles = useThemedStyles(makeStyles);
  if (!innings) return <Text style={styles.emptyTabText}>Play hasn't started yet.</Text>;

  const battingXI = (squads || [])
    .filter((s) => s.teamId === innings.battingTeamId)
    .map((s) => ({ id: s.playerId, name: s.player?.name || 'Unknown' }));
  const { batted } = computeBatting(innings, battingXI);
  const bowlers = computeBowling(innings);
  const overs = [...(innings.oversData || [])].sort((a, b) => a.overNumber - b.overNumber);
  const lastOver = overs[overs.length - 1];
  const notOut = batted.filter((b) => !b.out).slice(-2);
  // Current bowler = whoever bowled the LAST delivery (shared overs), not the over's.
  const lastBall = lastOver?.balls?.length ? lastOver.balls[lastOver.balls.length - 1] : null;
  const currentBowlerId = (lastBall && lastBall.bowlerId) || lastOver?.bowlerId;
  const currentBowler = currentBowlerId ? bowlers.find((b) => b.id === currentBowlerId) : null;
  const commentary = buildCommentary(innings);
  const lastOverRuns = lastOver ? lastOver.runs + lastOver.extras : 0;
  const partnership = computePartnership(innings);

  return (
    <View style={{ gap: 12 }}>
      {/* Team scores + chase + win probability now live in the combined card above
          (rendered by ScorecardScreen on the LIVE tab), so LiveTab starts with the
          current-over box and commentary. */}
      {lastOver ? (
        <View style={styles.liveBox}>
          <View style={styles.liveBoxHead}>
            <Text style={styles.liveBoxOver}>Over {lastOver.overNumber}</Text>
            <Text style={styles.liveBoxScore}>{innings.totalRuns || 0}-{innings.totalWickets || 0}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.liveBallRow}>
            {lastOver.balls.map((b, i) => {
              const lbl = ballLabel(b);
              const isW = b.isWicket, isBoundary = !b.extraType && (b.runs === 4 || b.runs === 6);
              return (
                <View key={i} style={[styles.ballChip, isW && styles.ballChipW, isBoundary && styles.ballChipBoundary]}>
                  <Text style={[styles.ballChipText, isW && { color: DS.white }, isBoundary && { color: DS.bg }]}>{lbl}</Text>
                </View>
              );
            })}
            <Text style={styles.liveOverRuns}>({lastOverRuns} run{lastOverRuns !== 1 ? 's' : ''})</Text>
          </ScrollView>
          <View style={styles.liveFigRow}>
            <View style={{ flex: 1 }}>
              {notOut.map((b) => (
                <Text key={b.id} style={styles.liveFigText} numberOfLines={1}>
                  {b.name}
                  {b.id === innings.strikerId ? <Text style={styles.strikerStar}> ★</Text> : null}
                  {'  '}
                  <Text style={styles.liveFigNum}>{b.runs}({b.balls})</Text>
                </Text>
              ))}
            </View>
            {currentBowler ? (
              <Text style={styles.liveFigText} numberOfLines={1}>
                {currentBowler.name}
                {'  '}
                <Text style={styles.liveFigNum}>{currentBowler.wickets}-{currentBowler.runs} ({currentBowler.overs})</Text>
              </Text>
            ) : null}
          </View>
          <Text style={styles.partnershipText}>
            Partnership: <Text style={styles.liveFigNum}>{partnership.runs}({partnership.balls})</Text>
          </Text>
        </View>
      ) : null}

      <View style={styles.commentaryBox}>
        {commentary.slice(0, 60).map((line) => (
          line.type === 'overend' ? (
            <View key={line.key} style={styles.commentaryOverEnd}>
              <View style={styles.overEndHead}>
                <Text style={styles.overEndTitle}>End of over {line.data.over}</Text>
                <Text style={styles.overEndTotal}>{line.data.total}</Text>
              </View>
              <View style={styles.overEndLine}>
                <Icon name="cricket" size={12} color={DS.lime} />
                <Text style={styles.overEndSub} numberOfLines={1}>
                  {(line.data.bat || []).map((b) => `${b.name} ${b.runs}(${b.balls})`).join('   ')}
                </Text>
              </View>
              <View style={styles.overEndLine}>
                <Icon name="bowling" size={12} color={DS.coral} />
                <Text style={styles.overEndSub} numberOfLines={1}>
                  {line.data.bowler?.name || ''} {line.data.bowler?.fig || ''}
                </Text>
              </View>
            </View>
          ) : (
            <View key={line.key} style={styles.commentaryRow}>
              <Text style={[styles.commentaryLabel, line.isWicket && { color: DS.live }]}>{line.label || ''}</Text>
              {/* Six gets its own amber — the single-green accent theme folds
                  blue/success back to green, so a four and a six looked identical.
                  Amber (#f59e0b) is the app's "special" colour (aces/bonuses). */}
              <Text style={[styles.commentaryText,
                line.isWicket && { fontWeight: '800', color: DS.textPrimary },
                line.isBoundary && !line.isSix && { color: CK.four, fontWeight: '700' },
                line.isSix && { color: CK.six, fontWeight: '800' }]}>
                {line.text || ''}
              </Text>
            </View>
          )
        ))}
      </View>
    </View>
  );
}

// ── SQUADS tab: playing XI (avatar + name + role) per team, plus bench ───────

// Who leads and who keeps, resolved once for both the squad and the bench.
//
// MatchPlayer carries isCaptain / isViceCaptain / isWk — who does the job
// TODAY — and Player carries the club's standing captain and vice. The match
// row wins when it says something, and falls back to the club otherwise:
// nothing in the app writes the per-match flags yet (no screen asks who is
// captaining this particular game), so without the fallback every squad in
// every match would read as though nobody were captain.
//
// It used to be `{ ...s, ...s.player }`, which spread the PLAYER over the
// match row — so the per-match designation was discarded outright, and the
// only reason captains sorted first at all was that accident.
function resolveSquadPlayer(s) {
  const p = s.player || s;
  return {
    ...p,
    ...s,
    isCaptain:     !!(s.isCaptain     || p.isCaptain),
    isViceCaptain: !!(s.isViceCaptain || p.isViceCaptain),
    isWk:          !!s.isWk,
  };
}

function PlayerRow({ name, role, avatarUrl, jerseyNumber, isCaptain, isViceCaptain, isKeeper, sport, onPress }) {
  const styles = useThemedStyles(makeStyles);
  // "Bat", "Batsman", "allrounder", "Wicket Keeper" all live in this column —
  // the role is free text typed by whoever added the player — so a squad would
  // otherwise read "Bat, Batsman, Bowl, Bowler" down one side. roleLabel is the
  // fold, and it is deliberately shared with every other list that prints a
  // role; its own comment carries the rules.
  const shown = roleLabel(role, sport);
  // A row with no id behind it stays a plain View: TouchableOpacity would give
  // it press feedback and then do nothing, which reads as a broken tap.
  const Row = onPress ? TouchableOpacity : View;
  return (
    <Row style={styles.squadRow} {...(onPress ? { onPress, activeOpacity: 0.85 } : null)}>
      <PlayerAvatar name={name} avatarUrl={avatarUrl} size={30} />
      <View style={{ flex: 1 }}>
        <View style={styles.squadNameRow}>
          {/* The shirt number, where a scorecard has always put it. It was
              collected on the team page and read by exactly one screen, which
              is a good reason for nobody to have set one on any of 288
              players. Only drawn when there is one. */}
          {jerseyNumber != null && <Text style={styles.squadJersey}>{jerseyNumber}</Text>}
          <Text style={styles.squadName} numberOfLines={1}>{name}</Text>
          {/* The same notation the team's own squad list uses, so the two
              agree. Without it the ordering is a rule nobody can see: the
              captain is listed first and nothing says why. */}
          {isCaptain && <View style={styles.capBadge}><Text style={styles.capTxt}>C</Text></View>}
          {!isCaptain && isViceCaptain && <View style={styles.viceBadge}><Text style={styles.viceTxt}>VC</Text></View>}
          {isKeeper && <View style={styles.viceBadge}><Text style={styles.viceTxt}>WK</Text></View>}
        </View>
        {!!shown && <Text style={styles.squadRole}>{shown}</Text>}
      </View>
    </Row>
  );
}

function SquadsTab({ match, onPlayer, onTeam }) {const styles = useThemedStyles(makeStyles);
  const teams = [match.team1, match.team2];
  const sport = match.sport || 'cricket';
  // A keeper is whoever is keeping today, or — since nothing sets that yet —
  // whoever the role says keeps. Same test the squad comparator sorts on, so
  // the badge and the position in the list can never disagree.
  const keeps = (p) => !!p.isWk || roleRank(p.role) === ROLE_RANK.keeper;
  return (
    <View style={styles.squadsGrid}>
      {teams.map((team, ti) => {
        // Captain, vice, keepers, batters, all-rounders, bowlers — the same
        // order this squad appears in on the team page and in the scorer's
        // pickers. The BATTING card above is untouched: that is the order they
        // actually batted, which is a record, not an arrangement.
        const squad = sortSquad(
          (match.squads || []).filter((s) => s.teamId === team?.id).map(resolveSquadPlayer));
        const squadIds = new Set(squad.map((s) => s.playerId));
        const bench = sortSquad((team?.players || []).filter((p) => !squadIds.has(p.id)));
        return (
          <View key={team?.id || ti} style={styles.squadCol}>
            <TouchableOpacity disabled={!team?.id} activeOpacity={0.85} onPress={() => onTeam?.(team)}>
              <Text style={styles.squadTeamName} numberOfLines={1}>{team?.name || `Team ${ti + 1}`}</Text>
            </TouchableOpacity>
            <Text style={styles.squadSectionLabel}>PLAYING XI</Text>
            {squad.map((s) => (
              <PlayerRow key={s.playerId} name={s.name} role={s.role} sport={sport}
                avatarUrl={s.user?.avatarUrl} jerseyNumber={s.jerseyNumber}
                isCaptain={s.isCaptain} isViceCaptain={s.isViceCaptain} isKeeper={keeps(s)}
                onPress={s.playerId ? () => onPlayer?.({ id: s.playerId, name: s.name, role: s.role, team: team?.name, avatarUrl: s.user?.avatarUrl || null }) : undefined} />
            ))}
            {squad.length === 0 && <Text style={styles.emptyTabText}>Not announced yet.</Text>}
            {bench.length > 0 &&
              <>
                <Text style={[styles.squadSectionLabel, { marginTop: 10 }]}>BENCH</Text>
                {bench.map((p) => (
                  <PlayerRow key={p.id} name={p.name} role={p.role} sport={sport}
                    avatarUrl={p.user?.avatarUrl} jerseyNumber={p.jerseyNumber}
                    isCaptain={p.isCaptain} isViceCaptain={p.isViceCaptain} isKeeper={keeps(p)}
                    onPress={p.id ? () => onPlayer?.({ id: p.id, name: p.name, role: p.role, team: team?.name, avatarUrl: p.user?.avatarUrl || null }) : undefined} />
                ))}
              </>
            }
          </View>
        );
      })}
    </View>
  );
}

// ── INFO tab: the match facts we actually track (no fabricated umpires/TV data) ─
function InfoRow({ label, value }) {const styles = useThemedStyles(makeStyles);
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function InfoTab({ match }) {const styles = useThemedStyles(makeStyles);
  const tossTeamName = match.tossWinnerId === match.team1?.id ? match.team1?.name
    : match.tossWinnerId === match.team2?.id ? match.team2?.name : null;
  const toss = tossTeamName ? `${tossTeamName} opt to ${match.tossDecision === 'bowl' ? 'bowl' : 'bat'}` : null;
  const when = match.startTime || match.createdAt;
  return (
    <View style={styles.inningsCard}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderLeft}>
          <View style={styles.inningsIndicator} />
          <Text style={styles.sectionHeaderText}>MATCH INFO</Text>
        </View>
      </View>
      <View style={{ padding: 4 }}>
        <InfoRow label="Format" value={match.matchType} />
        <InfoRow label="Overs" value={match.overs ? `${match.overs} per side` : null} />
        <InfoRow label="Ball" value={match.ballType} />
        <InfoRow label="Venue" value={match.venue} />
        <InfoRow label="Toss" value={toss} />
        <InfoRow label="Date" value={when ? new Date(when).toLocaleString() : null} />
        <InfoRow label="Status" value={match.status ? match.status.charAt(0).toUpperCase() + match.status.slice(1) : null} />
      </View>
    </View>
  );
}

// The house spring (PavilionScreen uses the same numbers) — a quick, barely
// overshooting settle, so every animated selection in the app feels like one
// material.
const TAB_SPRING = { damping: 22, stiffness: 260, mass: 0.9 };

// One tab in the match-centre strip.
//
// A real component at module scope, not an arrow function inside the parent's
// render: a component defined in the render body is a NEW type every time the
// parent renders, so React unmounts and remounts it — and this screen re-renders
// on every 2s poll of a live match, which would restart the animation
// mid-flight, forever.
//
// There is no hover on a phone, so the motion belongs to SELECTION: the glyph
// fills in, the tint crosses to lime, and the icon pops once as it lands.
function MatchTab({ tab, active, onPress, onLayout, styles, DS }) {
  const scale = useSharedValue(1);
  const seen = useRef(false);
  useEffect(() => {
    // Not on first paint — arriving on a match with SCORECARD already selected
    // should look settled, not like something just happened.
    if (!seen.current) { seen.current = true; return; }
    if (active) {
      scale.value = withSequence(withTiming(1.25, { duration: 110 }), withSpring(1, TAB_SPRING));
    }
  }, [active, scale]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <TouchableOpacity style={styles.matchTab} onPress={onPress} onLayout={onLayout}
      accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={tab.label}>
      <Reanimated.View style={pop}>
        {/* Filled when selected, outline when not — the same language the
            bottom dock already speaks (home / home-outline). Tabs whose glyph
            has no outline twin (the live access-point, the bat) just keep it. */}
        <Icon name={active ? tab.icon : (tab.iconIdle || tab.icon)} size={18}
          color={active ? DS.lime : DS.textMuted} />
      </Reanimated.View>
      <Text style={[styles.matchTabText, active && styles.matchTabTextActive]} numberOfLines={1}>
        {tab.label}
      </Text>
    </TouchableOpacity>
  );
}

export default function ScorecardScreen({ route, navigation }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);const C = useThemedStyles(makeControls);
  // `initialTab` lets a caller open this screen on a specific tab. Without it a
  // live match always lands on LIVE (see activeTab's fallback below), so the
  // Live screen's Scorecard tab — which now opens this screen instead of drawing
  // its own cut-down copy — would have dropped you on commentary.
  const { matchId, initialTab } = route.params || {};
  const [match, setMatch] = useState(null);
  const matchRef = useRef(null);   // latest match, so the live poll can read status without a state churn
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inningsTab, setInningsTab] = useState(0);   // which innings' overs to show (OVERS tab)
  const [expandedInnings, setExpandedInnings] = useState(null); // which team's card is open (SCORECARD tab); null = default
  const [tab, setTab] = useState(initialTab || null); // active top tab; null falls back per match status
  const shotRef = useRef(null);                      // capture target for "share as image"
  const pagerRef = useRef(null);                     // horizontal swipeable tab content
  const swipingRef = useRef(false);                  // true while a finger swipe drives the pager
  const [celebration, setCelebration] = useState(null); // {kind,id} FOUR/SIX/WICKET flourish
  const lastBallRef = useRef(null);                  // last delivery id seen (celebration baseline)
  const [overEndBanner, setOverEndBanner] = useState(null); // end-of-over summary popup
  const lastOverEndRef = useRef(null);                // last completed-over number seen
  const [ballEvent, setBallEvent] = useState(null);  // spectator LiveBall reaction {type,id}
  const [linger, setLinger] = useState(false);       // keep the ball up for the finish ceremony
  const prevStatusRef = useRef(null);                // live→completed transition detector
  const prevInnsRef = useRef(null);                  // innings-count change detector

  // The dock stands down for the whole match centre, not just a live one.
  // This screen is a header, seven tabs of its own and a swipeable pager under
  // them — the same shape as a team profile — and the app's bottom navigation
  // floating over it is one bar of chrome too many whether the match finished
  // an hour ago or is being scored right now.
  //
  // It used to lock only while live, and scroll-hide otherwise; a completed
  // scorecard therefore kept bouncing the dock in and out as you read it.
  const lockDock = useDockLock();
  useFocusEffect(useCallback(() => {
    lockDock(true);
    return () => lockDock(false);
  }, [lockDock]));

  // Kept even though the lock above makes it a no-op today: the lock ignores
  // any reveal while it is held, so this costs nothing and is what would carry
  // the behaviour if the dock is ever let back onto this screen.
  const hideTabBar = useHideTabBarOnScroll();
  const tabClear = useTabBarClearance();   // so the floating dock/ball doesn't cover the last rows

  // Ceremony moments (poster spec): innings break → one fast spin + big ring;
  // match finished → golden trophy ripple, ball lingers a beat, dock returns.
  useEffect(() => {
    if (!match) return;
    const inns = match.innings?.length || 0;
    if (prevInnsRef.current !== null && inns > prevInnsRef.current && match.status === 'live') {
      setBallEvent({ type: 'innings', id: `innings-${inns}` });
    }
    prevInnsRef.current = inns;
    const wasLive = prevStatusRef.current === 'live';
    prevStatusRef.current = match.status;
    if (wasLive && match.status === 'completed') {
      setBallEvent({ type: 'finished', id: 'match-finished' });
      setLinger(true);
      const t = setTimeout(() => setLinger(false), 2600);
      return () => clearTimeout(t);
    }
  }, [match]);

  // Detect a new boundary/wicket between polls and pop the celebration overlay.
  // The first observation only sets the baseline — we never replay the ball that
  // had already happened when the watcher opened the screen.
  useEffect(() => {
    if (!match) return;
    const lb = latestBall(match);
    if (!lb) return;
    if (lastBallRef.current === null) { lastBallRef.current = lb.id; return; }
    if (lb.id !== lastBallRef.current) {
      lastBallRef.current = lb.id;
      if (match.status === 'live') {
        // every delivery nudges the LiveBall
        setBallEvent({ type: lb.kind || 'run', id: lb.id });
        if (lb.kind === 'wicket') {
          // WICKET/FOUR/SIX: the spectator ball itself plays the matching keyed
          // clip in place (LiveBall handles the event) — no full-screen overlay.
          haptic.warn();
        } else if (lb.kind) {
          haptic.success();
        }
      }
    }
  }, [match]);

  // Detect a newly-completed over between polls and pop the end-of-over banner
  // (total + both batsmen + bowler figures) automatically, instead of the
  // watcher having to open the LIVE tab and scroll to find it. Same
  // first-observation-is-just-a-baseline rule as the ball detector above.
  useEffect(() => {
    if (!match) return;
    const oe = latestOverEnd(match);
    if (!oe) return;
    if (lastOverEndRef.current === null) { lastOverEndRef.current = oe.over; return; }
    if (oe.over !== lastOverEndRef.current) {
      lastOverEndRef.current = oe.over;
      if (match.status === 'live') {
        setOverEndBanner(oe); haptic.tick();
        // When the over's final delivery is a boundary/wicket, both this effect
        // and the ball-detector fire on the same poll — and we run last, so a
        // plain 'over' bounce would clobber the four/six/wicket clip the ball
        // detector just queued. Let the big-moment clip win; only bounce when
        // the over ended on an ordinary delivery.
        const lb = latestBall(match);
        const bigMoment = lb && (lb.kind === 'four' || lb.kind === 'six' || lb.kind === 'wicket');
        if (!bigMoment) {
          setBallEvent({ type: 'over', id: `over-${oe.over}` });   // LiveBall bounce
        }
      }
    }
  }, [match]);

  useLayoutEffect(() => {
    // Hide the stack header — the branded bar below is the single header, giving the
    // scorecard the full screen (no duplicate "Scorecard" bar eating vertical space).
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const loadScorecard = useCallback((showSpinner = false) => {
    if (showSpinner) setLoading(true);
    return legendsApi.getScorecard(matchId)
      .then((res) => {
        // Skip the state update (and the whole re-render of every mounted tab)
        // when the polled data is unchanged. Most 6s polls return an identical
        // snapshot — swapping in a fresh object each time forced a heavy full
        // re-render on every tick and was freezing the live-watch screen.
        if (res.success) setMatch((prev) => (matchSig(prev) === matchSig(res.data) ? prev : res.data));
      })
      .finally(() => setLoading(false));
  }, [matchId]);

  // Keep the ref pointed at the latest match so the live poll can read status
  // (live vs completed) without threading state through the interval closure.
  useEffect(() => { matchRef.current = match; }, [match]);

  // Watch a live match like Cricbuzz/Cricinfo: auto-refresh every few seconds while
  // this screen is focused, so the score/overs/wickets update without a manual pull.
  // Anyone can land here — team members and followers included — this is the
  // read-only "watch" experience (only the assigned scorer can actually score).
  useFocusEffect(
    useCallback(() => {
      loadScorecard(true);

      // POLLING is the reliable transport (the API is on Vercel serverless — it
      // can't hold a socket, and FCM data pushes are best-effort/throttled and
      // only reach the two teams' members, not general spectators). So every
      // watcher polls the live scorecard on a short cadence; the FCM push below is
      // just a bonus that pulls an update in a touch sooner when it does arrive.
      // (A too-slow 30s poll is what made the score look frozen until a refresh.)
      const LIVE_POLL_MS = 6000;
      const stopPush = onForegroundMessage((msg) => {
        if (msg?.data?.type === 'score' && msg.data.matchId === matchId) {
          loadScorecard(false);
        }
      });

      const poll = setInterval(() => {
        // Read the latest status without mutating state; stop once it's not live.
        if (matchRef.current && matchRef.current.status !== 'live') {
          clearInterval(poll);
          return;
        }
        loadScorecard(false);
      }, LIVE_POLL_MS);

      return () => { clearInterval(poll); stopPush?.(); };
    }, [loadScorecard, matchId])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadScorecard(false).finally(() => setRefreshing(false));
  }, [loadScorecard]);

  const shareScorecard = async () => {
    if (!match) return;
    const t1 = match.team1?.name || 'Team 1';
    const t2 = match.team2?.name || 'Team 2';
    const caption = `🏏 ${t1} vs ${t2}\n${match.score1 || '—'} | ${match.score2 || '—'}\n${match.result || ''}\nvia Local Legends`;
    // Capture the scorecard as an image and share it; fall back to plain text.
    try {
      const uri = await captureRef(shotRef, { format: 'png', quality: 0.95, result: 'tmpfile' });
      await RNShare.open({ url: uri, type: 'image/png', message: caption, failOnCancel: false });
    } catch (e) {
      try { await Share.share({ message: caption }); } catch {}
    }
  };

  const t1 = match?.team1?.name || 'Team 1';
  const t2 = match?.team2?.name || 'Team 2';
  // The match-centre title is one line at 15px carrying two team names and a
  // "v". "D-Vigo-S XI v Chennai Chargers" does not fit and truncates mid-word,
  // which is exactly what a short code is for. Full names everywhere else —
  // the score rows and the squad lists have the room.
  const t1Short = match?.team1?.shortName || t1;
  const t2Short = match?.team2?.shortName || t2;
  const isLive = match?.status === 'live';
  const isCompleted = match?.status === 'completed';
  // Default tab: LIVE while live, SUMMARY right when a match completes (so the
  // awards are the first thing a viewer sees), SCORECARD otherwise — but once
  // the viewer taps a tab themselves, `tab` takes over and stays put across polls.
  // Any player named on this screen opens their profile. `player` is passed
  // through so the profile can paint the name before its fetch returns, the same
  // contract Rankings uses.
  const openPlayer = useCallback((p) => {
    if (!p?.id) return;
    // Carry the sport: the profile hero folds a free-text role into the squad
    // vocabulary, and it can only do that safely once it knows which sport's
    // vocabulary to use.
    navigation?.navigate('PlayerProfile', { playerId: p.id, player: { sport: match?.sport, ...p } });
  }, [navigation, match?.sport]);

  const openTeam = useCallback((t) => {
    if (!t?.id) return;
    navigation?.navigate('TeamProfile', { teamId: t.id });
  }, [navigation]);

  const activeTab = tab || (isLive ? 'live' : isCompleted ? 'summary' : 'scorecard');
  // `icon` is the selected (filled) glyph, `iconIdle` the unselected outline —
  // every one verified present in the MaterialCommunityIcons glyphmap. LIVE and
  // OVERS have no outline twin, so they simply don't change shape.
  const TABS = [
    { key: 'info', label: 'INFO', icon: 'information', iconIdle: 'information-outline' },
    ...(isLive ? [{ key: 'live', label: 'LIVE', icon: 'access-point' }] : []),
    // A finished match keeps its ball-by-ball. The 'live' tab is where the
    // commentary feed lives (LiveTab), and gating it on isLive meant a completed
    // match had no way to read the deliveries at all — the old Live screen always
    // offered them, so consolidating onto this screen would have lost them.
    // Labelled for what it is once the match is over.
    ...(isCompleted ? [
      { key: 'summary', label: 'OVERVIEW', icon: 'view-dashboard', iconIdle: 'view-dashboard-outline' },
      { key: 'live', label: 'COMMENTARY', icon: 'message-text', iconIdle: 'message-text-outline' },
    ] : []),
    { key: 'scorecard', label: 'SCORECARD', icon: 'clipboard-text', iconIdle: 'clipboard-text-outline' },
    { key: 'squads', label: 'SQUADS', icon: 'account-group', iconIdle: 'account-group-outline' },
    { key: 'overs', label: 'OVERS', icon: 'cricket' },
    { key: 'highlights', label: 'HIGHLIGHTS', icon: 'star', iconIdle: 'star-outline' },
  ];
  const activeIndex = Math.max(0, TABS.findIndex((t) => t.key === activeTab));

  // Keep the selected tab on screen. With every tab carrying its name the strip
  // is about twice the width of a phone, and the selection is not always made
  // by tapping it: the default lands on OVERVIEW the moment a match completes,
  // the pager changes it on swipe, and the radial menu jumps to any tab. Any of
  // those could otherwise underline something scrolled out of sight.
  const tabBarRef = useRef(null);
  const tabLayouts = useRef({});

  // ...and one underline that travels to it, rather than a border switching on
  // under a different tab. Both read the same measurements.
  const barX = useSharedValue(0);
  const barW = useSharedValue(0);
  const placed = useRef(false);

  const settleTabs = useCallback((key) => {
    const l = tabLayouts.current[key];
    if (!l) return;
    tabBarRef.current?.scrollTo({ x: Math.max(0, l.x + l.width / 2 - SCREEN_WIDTH / 2), animated: true });
    // The first placement is a jump, not a slide — an underline gliding in from
    // the left edge on open would announce a selection nobody made.
    if (placed.current) {
      barX.value = withSpring(l.x, TAB_SPRING);
      barW.value = withSpring(l.width, TAB_SPRING);
    } else {
      placed.current = true;
      barX.value = l.x;
      barW.value = l.width;
    }
  }, [barX, barW]);

  useEffect(() => { settleTabs(activeTab); }, [activeTab, settleTabs]);
  const barStyle = useAnimatedStyle(() => ({ transform: [{ translateX: barX.value }], width: barW.value }));
  const inningsList = match?.innings || [];
  const selectedInnings = inningsList[inningsTab] || inningsList[0];
  const liveInnings = inningsList[inningsList.length - 1];   // currently-batting innings
  // Accordion: default open = the most recent (currently-batting or last-completed) innings.
  const effectiveExpanded = expandedInnings === null ? inningsList.length - 1 : expandedInnings;
  // "NEED X off Y balls" for the 2nd innings — shown across every tab; the toss
  // (a fixed, non-changing fact) stays confined to the INFO tab only.
  // The chasing side's own squad size — the two teams needn't be the same size.
  const chasingSquad = (match?.squads || []).filter((s) => s.teamId === liveInnings?.battingTeamId).length;
  const chase = computeChase(liveInnings, match?.overs, chasingSquad || 11);
  // Split the win probability onto the two team columns (chasing team = chaseWin).
  const t1Win = chase ? (chase.teamName === t1 ? chase.chaseWin : 100 - chase.chaseWin) : 50;
  const t2Win = 100 - t1Win;

  // Keep the swipeable pager in sync with the active tab for the initial default
  // and tab-bar taps. Skip it while a finger swipe is driving the pager — issuing
  // an animated scrollTo mid-gesture fights the native paging and causes a stutter
  // (the swipe already lands on the right page and updates `tab` on its own).
  useEffect(() => {
    if (swipingRef.current) return;
    const idx = TABS.findIndex((t) => t.key === activeTab);
    if (idx >= 0) pagerRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, y: 0, animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isLive]);

  if (loading) {
    // Skeleton of the score header + a few commentary rows — reads as "the
    // scorecard is coming" instead of a lone spinner on a blank screen.
    const sk = [DS.surfaceHigh, DS.surfaceHighest];
    return (
      <View style={styles.scLoad}>
        <Skeleton width={210} height={20} radius={6} colors={sk} style={{ marginBottom: 26 }} />
        <View style={styles.scLoadTeams}>
          <View style={styles.scLoadTeam}><Skeleton width={44} height={44} radius={12} colors={sk} /><Skeleton width={72} height={12} radius={4} colors={sk} /></View>
          <Skeleton width={92} height={30} radius={6} colors={sk} />
          <View style={styles.scLoadTeam}><Skeleton width={44} height={44} radius={12} colors={sk} /><Skeleton width={72} height={12} radius={4} colors={sk} /></View>
        </View>
        <View style={styles.scLoadChips}>
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} width={30} height={30} radius={8} colors={sk} />)}
        </View>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={styles.scLoadRow}>
            <Skeleton width={30} height={12} radius={4} colors={sk} />
            <Skeleton width={i % 2 ? 210 : 160} height={12} radius={4} colors={sk} />
          </View>
        ))}
      </View>);
  }

  if (!match) {
    return (
      <View style={styles.centered}>
        <Icon name="alert-circle-outline" size={48} color={DS.coral} />
        <Text style={styles.errorText}>Scorecard not available</Text>
      </View>);

  }

  return (
    <View style={styles.container}>
      <CelebrationOverlay celebration={celebration} onDone={() => setCelebration(null)} DS={DS} />
      <OverEndBanner data={overEndBanner} onDone={() => setOverEndBanner(null)} DS={DS} />
      {/* Match-center header: back + match title + live badge, tabs directly below — one bar */}
      <View style={styles.matchHeader}>
        <View style={styles.matchHeaderTop}>
          {navigation &&
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Icon name="arrow-left" size={22} color={DS.textPrimary} />
            </TouchableOpacity>
          }
          <Text style={styles.matchHeaderTitle} numberOfLines={1}>{t1Short} <Text style={styles.matchHeaderVs}>v</Text> {t2Short}</Text>
          {isLive
            ? <View style={styles.liveBadge}><View style={styles.liveBadgeDot} /><Text style={styles.liveBadgeText}>LIVE</Text></View>
            : <View style={{ width: 26 }} />}
        </View>

        {/* Every tab names itself. It used to hide the label on all but the
            selected one, which meant six of the seven tabs were an icon and
            nothing else — and a clipboard, a card of people and a bat don't say
            "SCORECARD", "SQUADS" and "OVERS" to anyone who hasn't already
            learnt them. The strip is wider than the screen now, so it scrolls,
            and the active tab is scrolled into view (see below) because it
            changes on its own: a completed match opens on OVERVIEW and the
            radial menu jumps straight to any of them. */}
        <ScrollView ref={tabBarRef} horizontal showsHorizontalScrollIndicator={false}
          style={styles.matchTabBar} contentContainerStyle={styles.matchTabBarContent}>
          {TABS.map((t) => (
            <MatchTab key={t.key} tab={t} active={activeTab === t.key} styles={styles} DS={DS}
              onPress={() => { haptic.tick(); setTab(t.key); }}
              onLayout={(e) => {
                tabLayouts.current[t.key] = e.nativeEvent.layout;
                // The first measurement arrives after the first paint, so the
                // underline is placed from here too — otherwise it would have
                // nothing to sit under until the tab was changed.
                if (t.key === activeTab) settleTabs(t.key);
              }} />
          ))}
          <Reanimated.View style={[styles.tabIndicator, barStyle]} pointerEvents="none" />
        </ScrollView>
      </View>

      <View ref={shotRef} collapsable={false} style={{ flex: 1, backgroundColor: DS.bg }}>
        {/* Chase line ("NEED X off Y balls") — non-live tabs only; on the LIVE tab
            it lives inside the combined score/win card below. The toss (a fixed
            fact) stays confined to the INFO tab. */}
        {chase && chase.need > 0 && activeTab !== 'live' &&
          <View style={styles.chaseRow}>
            <Icon name="target" size={13} color={DS.coral} />
            <Text style={styles.tossSummaryLine} numberOfLines={1}>
              {chase.teamName} need {chase.need} off {chase.ballsLeft} ball{chase.ballsLeft !== 1 ? 's' : ''}
            </Text>
          </View>
        }

        {/* LIVE tab — one compact card: both team scores + chase + win probability. */}
        {activeTab === 'live' &&
          <View style={styles.liveTopCard}>
            <View style={styles.liveScoreRow}>
              <View style={styles.scoreTeam}>
                <HexAvatar size={34} color={DS.lime}><Text style={styles.scoreAvatarText}>{t1[0]}</Text></HexAvatar>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scoreTeamName} numberOfLines={1}>{t1}</Text>
                  <Text style={styles.scoreValue} numberOfLines={1}>{match.score1 || '—'}</Text>
                </View>
              </View>
              <View style={styles.scoreVs}><Text style={styles.scoreVsText}>VS</Text></View>
              <View style={[styles.scoreTeam, styles.scoreTeamRight]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.scoreTeamName, { textAlign: 'right' }]} numberOfLines={1}>{t2}</Text>
                  <Text style={[styles.scoreValue, styles.scoreValueRight]} numberOfLines={1}>{match.score2 || '—'}</Text>
                </View>
                <HexAvatar size={34} color={DS.blue}><Text style={styles.scoreAvatarText}>{t2[0]}</Text></HexAvatar>
              </View>
            </View>

            {chase && chase.need > 0 && !match.result &&
              <View style={styles.liveChaseWrap}>
                <Text style={styles.liveChaseHeadline} numberOfLines={1}>
                  {chase.teamName} need <Text style={styles.chaseNeed}>{chase.need}</Text> off <Text style={styles.chaseNeed}>{chase.ballsLeft}</Text> ball{chase.ballsLeft !== 1 ? 's' : ''}
                </Text>
                <View style={styles.winBarSplit}>
                  <View style={{ width: `${t1Win}%`, backgroundColor: DS.lime }} />
                  <View style={{ width: `${t2Win}%`, backgroundColor: DS.blue }} />
                </View>
                <View style={styles.winLabelRow}>
                  <Text style={[styles.winPct, { color: DS.lime }]}>{t1Win}%</Text>
                  <Text style={styles.liveRates} numberOfLines={1}>
                    CRR <Text style={styles.chaseRateNum}>{chase.crr.toFixed(2)}</Text>   RRR <Text style={styles.chaseRateNum}>{chase.rrr === Infinity ? '—' : chase.rrr.toFixed(2)}</Text>   {chase.wktsLeft} wkt{chase.wktsLeft !== 1 ? 's' : ''}
                  </Text>
                  <Text style={[styles.winPct, { color: DS.blue }]}>{t2Win}%</Text>
                </View>
              </View>
            }

            {match.result &&
              <View style={styles.liveResultPill}>
                <Icon name={match.status === 'completed' ? 'trophy-variant' : 'trophy'} size={15} color={DS.lime} />
                <Text style={styles.liveResultText} numberOfLines={2}>{match.result}</Text>
              </View>
            }
          </View>
        }

        {/* Swipeable tab content — one page per tab, in sync with the tab bar above:
            a tap scrolls the pager (see the useEffect on `activeTab`), and a swipe
            here updates `tab` on scroll-end so the tab bar highlight follows along. */}
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
          // Render already scrolled to the active page from the very first frame —
          // without this, the ScrollView paints at x=0 (the INFO page) for a beat
          // before the sync effect's animated scrollTo catches up, so a first-time
          // viewer briefly sees INFO's content under the LIVE tab's highlight.
          contentOffset={{ x: activeIndex * SCREEN_WIDTH, y: 0 }}
          onScrollBeginDrag={() => { swipingRef.current = true; }}
          // As the finger drags past a page's centre, move the active tab so the
          // bar's highlight + label track the swipe in real time (feels connected),
          // not just at the end. The effect above is guarded so this doesn't
          // trigger a competing programmatic scroll.
          scrollEventThrottle={16}
          onScroll={(e) => {
            if (!swipingRef.current) return;
            const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
            const key = TABS[idx]?.key;
            if (key && key !== activeTab) setTab(key);
          }}
          onScrollEndDrag={() => { swipingRef.current = false; }}
          onMomentumScrollEnd={(e) => {
            swipingRef.current = false;
            const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
            const key = TABS[idx]?.key;
            if (key && key !== activeTab) setTab(key);
          }}
        >
          {TABS.map((t, ti) => {
            // Windowing: only the active tab and its immediate neighbours build
            // their (heavy) content. Off-screen tabs render an empty page of the
            // right width so the pager geometry is intact but a poll doesn't
            // re-render every tab's tables/charts at once. Swiping to a neighbour
            // shows content instantly; a far tap fills in when it becomes active.
            const near = Math.abs(ti - activeIndex) <= 1;
            return (
            <ScrollView key={t.key} style={{ width: SCREEN_WIDTH }} showsVerticalScrollIndicator={false}
              {...hideTabBar}
              // Clearance only while the LiveBall is down there. The dock is
              // locked away for this whole screen now, so reserving its height
              // on a finished scorecard was ~90pt of empty space at the end of
              // every tab, kept clear for something that is not there.
              contentContainerStyle={{ paddingTop: 12, paddingBottom: (isLive ? tabClear : 0) + 12 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} colors={[DS.lime]} />}>
              {near && <>
              <View style={styles.body}>
                {t.key === 'info' && <InfoTab match={match} />}

                {t.key === 'live' && <LiveTab innings={liveInnings} squads={match.squads} totalOvers={match.overs} />}

                {/* Two innings, one at a time — a local view toggle, which is
                    what the shared segment is for. Was a private lime-filled
                    pill: the last tab row in the app still doing that. */}
                {t.key === 'overs' && inningsList.length > 1 &&
                  <View style={[C.segment, { marginBottom: 4 }]}>
                    {inningsList.map((inn, i) => {
                      const active = inningsTab === i;
                      return (
                        <TouchableOpacity key={inn.id || i} style={[C.segBtn, active && C.segBtnOn, { flexDirection: 'column', gap: 1 }]}
                          onPress={() => setInningsTab(i)}>
                          <Text style={[C.segText, active && C.segTextOn, { fontSize: 12, fontWeight: '900' }]} numberOfLines={1}>
                            {(inn.battingTeam?.name || `Innings ${i + 1}`).toUpperCase()}
                          </Text>
                          <Text style={[C.segText, active && C.segTextOn, { fontSize: 10 }]}>{i === 0 ? '1st' : '2nd'} inns</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                }

                {t.key === 'scorecard' &&
                  (inningsList.length > 0 ?
                    <View style={{ gap: 12 }}>
                      {inningsList.map((inn, i) => (
                        <InningsScorecard
                          key={inn.id || i}
                          innings={inn}
                          index={i}
                          squads={match.squads}
                          totalOvers={match.overs}
                          expanded={inningsList.length === 1 || effectiveExpanded === i}
                          collapsible={inningsList.length > 1}
                          onToggle={() => setExpandedInnings(effectiveExpanded === i ? -1 : i)}
                          onPlayer={openPlayer}
                        />
                      ))}
                      <WormChart innings1={inningsList[0]} innings2={inningsList[1]} totalOvers={match.overs} />
                    </View>
                    : <Text style={styles.emptyTabText}>No play yet.</Text>)}

                {t.key === 'overs' &&
                  (selectedInnings ? <InningsOvers innings={selectedInnings} /> : <Text style={styles.emptyTabText}>No overs yet.</Text>)}

                {t.key === 'summary' && <SummaryTab matchId={matchId} match={match} onPlayer={openPlayer} onTeam={openTeam} />}

                {t.key === 'squads' && <SquadsTab match={match} onPlayer={openPlayer} onTeam={openTeam} />}

                {t.key === 'highlights' && <HighlightsTab match={match} />}
              </View>
              <BrandLogo scale={0.75} />

              {/* WhatsApp Share */}
              <TouchableOpacity style={styles.shareBtn} onPress={shareScorecard}>
                <Icon name="whatsapp" size={20} color={DS.white} />
                <Text style={styles.shareBtnText}>Share Scorecard</Text>
              </TouchableOpacity>

              <View style={{ height: 32 }} />
              </>}
            </ScrollView>
          );
          })}
        </ScrollView>
      </View>

      {/* FOUR / SIX / WICKET stinger — plays off the same event as the ball. */}
      {(match?.status === 'live' || linger) && <EventSound event={ballEvent} />}

      {/* Phase 4 — live spectator companion: dock is locked away, the ball
          persists bottom-centre, reacts to every delivery and opens the
          radial quick menu (jumps between the tabs above). */}
      {(match?.status === 'live' || linger) && (
        <LiveBall
          event={ballEvent}
          size={80}
          menuItems={TABS.filter((t) => ['live', 'scorecard', 'overs', 'highlights', 'info'].includes(t.key))
            .map((t) => ({ key: t.key, icon: t.icon, label: t.label, onPress: () => setTab(t.key) }))}
        />
      )}
    </View>);

}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg },
  scLoad: { flex: 1, backgroundColor: DS.bg, paddingTop: 64, paddingHorizontal: 16 },
  scLoadTeams: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  scLoadTeam: { alignItems: 'center', gap: 8 },
  scLoadChips: { flexDirection: 'row', gap: 8, marginBottom: 26 },
  scLoadRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  errorText: { fontSize: 16, color: DS.textMuted, marginTop: 12, fontWeight: '600' },

  // Match-center header — one bar: back/title/live row, tabs row directly under it
  matchHeader: {
    backgroundColor: DS.surfaceLow,
    paddingTop: 52,
    borderBottomWidth: 1, borderBottomColor: DS.line,
  },
  matchHeaderTop: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingBottom: 12, paddingHorizontal: 16,
  },
  matchHeaderTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: DS.textPrimary },
  matchHeaderVs: { color: DS.textMuted, fontWeight: '700' },
  backBtn: { padding: 4 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 10,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  liveBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: DS.live },
  liveBadgeText: { fontSize: 10, fontWeight: '900', color: DS.live, letterSpacing: 0.6 },

  // Match-center tab bar — icon + name on every tab.
  matchTabBar: { backgroundColor: DS.surface },
  matchTabBarContent: { flexDirection: 'row', flexGrow: 1, justifyContent: 'space-around', alignItems: 'center' },
  matchTab: {
    // Tighter than when only one tab carried text — seven labels have to fit
    // without the strip becoming a marathon, and the touch target is still 44pt.
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 12, paddingHorizontal: 11,
    // Reserves the row the travelling underline draws in, so nothing shifts.
    marginBottom: 2,
  },
  tabIndicator: { position: 'absolute', left: 0, bottom: 0, height: 2, borderRadius: 1, backgroundColor: DS.lime },
  matchTabText: { fontSize: 11, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.5 },
  matchTabTextActive: { color: DS.lime },

  // Score summary
  scoreTeam: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreTeamRight: { justifyContent: 'flex-end' },
  scoreAvatarText: { fontSize: 14, fontWeight: '900', color: '#ffffff' },
  scoreTeamName: { fontSize: 11, color: DS.textMuted, fontWeight: '700' },
  scoreValue: { fontSize: 19, fontWeight: '900', color: DS.lime, letterSpacing: -0.3 },
  scoreValueRight: { textAlign: 'right', color: DS.blue },
  scoreVs: { paddingHorizontal: 8 },
  scoreVsText: { fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 1 },
  chaseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 12 },
  tossSummaryLine: { fontSize: 11.5, fontWeight: '600', color: DS.textMuted, textAlign: 'center' },

  // Result

  body: { paddingHorizontal: 16, gap: 16, marginTop: 8 },
  emptyTabText: { fontSize: 13, color: DS.textMuted, textAlign: 'center', paddingVertical: 24 },

  // Team / innings tabs

  // Innings card
  inningsCard: {
    backgroundColor: DS.surface, borderRadius: 14, overflow: 'hidden',
    paddingBottom: 8
  },

  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: DS.surfaceHighest
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inningsIndicator: {
    width: 4, height: 18, borderRadius: 2, backgroundColor: DS.lime
  },
  sectionHeaderText: {
    fontSize: 12, fontWeight: '800', color: DS.textPrimary, letterSpacing: 0.8
  },
  inningsLabel: { fontSize: 11, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.5 },
  inningsScoreBanner: {
    flexDirection: 'row', alignItems: 'baseline', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8
  },
  inningsScore: { fontSize: 26, fontWeight: '900', color: DS.textPrimary },
  inningsOvers: { fontSize: 12, color: DS.textMuted },

  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: DS.surfaceHighest,
    paddingVertical: 6, paddingHorizontal: 10
  },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 10 },
  tableRowAlt: { backgroundColor: DS.surfaceHighest },
  headerCell: { fontSize: 9.5, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.4 },
  cell: { fontSize: 12, color: DS.textVariant },
  // Name column takes ALL remaining width; the stat columns are fixed-narrow
  // (they only ever hold 1–4 chars) so full player names fit without truncation.
  nameCol: { flex: 1, minWidth: 0 },
  nameCell: { flexDirection: 'row', alignItems: 'center' },
  rowAvatar: { marginRight: 6 },
  numCol: { width: 32, textAlign: 'center' },
  batterName: { fontSize: 12.5, fontWeight: '700', color: DS.textPrimary },
  batterNameRow: { flexDirection: 'row', alignItems: 'center' },
  strikerStar: { color: DS.lime, fontWeight: '900' },
  bowlerName: { fontSize: 12.5, fontWeight: '700', color: DS.textPrimary },
  howOut: { fontSize: 9.5, color: DS.coral, marginTop: 1 },
  notOut: { fontSize: 9.5, color: DS.lime, marginTop: 1 },
  highlight: { color: DS.lime, fontWeight: '800' },
  yetToBatRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingTop: 8 },
  yetToBatLabel: { fontSize: 11, fontWeight: '700', color: DS.textMuted },
  yetToBatNames: { fontSize: 11, color: DS.textVariant, flex: 1 },

  extrasRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: DS.line, marginTop: 4 },
  extrasLabel: { fontSize: 12, fontWeight: '700', color: DS.textMuted, width: 52 },
  extrasDetail: { fontSize: 11, color: DS.textMuted, flex: 1 },
  extrasVal: { fontSize: 13, fontWeight: '800', color: DS.textPrimary },
  totalRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: DS.surfaceHigh, borderRadius: 8 },
  totalLabel: { fontSize: 13, fontWeight: '900', color: DS.textPrimary, width: 52, letterSpacing: 0.5 },
  totalDetail: { fontSize: 12, color: DS.textMuted, flex: 1 },
  totalVal: { fontSize: 16, fontWeight: '900', color: DS.lime },
  fowBox: { paddingHorizontal: 12, paddingTop: 10 },
  fowTitle: { fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 1, marginBottom: 4 },
  fowText: { fontSize: 11, color: DS.coral, lineHeight: 18 },

  // Powerplay + Partnerships (SCORECARD tab)
  subHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: DS.surfaceHighest, paddingHorizontal: 14, paddingVertical: 9, marginTop: 12,
  },
  subHeaderText: { fontSize: 12, fontWeight: '800', color: DS.textPrimary, letterSpacing: 0.6 },
  subHeaderCols: { flexDirection: 'row', gap: 18 },
  ppColLabel: { fontSize: 10, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.4, minWidth: 44, textAlign: 'right' },
  ppRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  ppLabel: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },
  ppOvers: { fontSize: 12.5, color: DS.textVariant, minWidth: 44, textAlign: 'right' },
  ppRuns: { fontSize: 12.5, fontWeight: '800', color: DS.textPrimary, minWidth: 44, textAlign: 'right' },
  pnrRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  pnrSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pnrName: { fontSize: 12, fontWeight: '700', color: DS.textPrimary, flexShrink: 1 },
  pnrFig: { fontSize: 11, fontWeight: '700', color: DS.textMuted },
  pnrMid: { paddingHorizontal: 8 },
  pnrTotal: { fontSize: 12, fontWeight: '900', color: DS.lime, minWidth: 52, textAlign: 'center' },

  // Over-by-over timeline (OVERS tab)
  overLineNum: { fontSize: 12, fontWeight: '800', color: DS.textPrimary },
  overLineBalls: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  // OVERS tab — one block per over (header + optional shared-bowler list + chips)
  overBlock: { paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: DS.line, gap: 7 },
  overBlockHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  overBowlerSingle: { flex: 1, fontSize: 12, fontWeight: '600', color: DS.textVariant },
  overBlockRuns: { marginLeft: 'auto', fontSize: 12.5, fontWeight: '800', color: DS.lime },
  overShared: { gap: 2, paddingLeft: 2 },
  overSharedItem: { fontSize: 12, fontWeight: '600', color: DS.textVariant },
  ballChip: { minWidth: 22, paddingHorizontal: 5, paddingVertical: 3, borderRadius: 6, backgroundColor: DS.surfaceHigh, alignItems: 'center' },
  ballChipW: { backgroundColor: DS.live },
  ballChipBoundary: { backgroundColor: DS.lime },
  ballChipExtra: { backgroundColor: 'rgba(255,181,158,0.18)' },
  ballChipText: { fontSize: 11, fontWeight: '800', color: DS.textPrimary },

  // LIVE tab: current-over box
  // Chase strip (2nd-innings LIVE tab)
  chaseNeed: { fontWeight: '900', color: DS.lime },
  chaseRateNum: { fontWeight: '900', color: DS.textPrimary },
  winLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // Combined LIVE-tab card: scores + chase + win probability, minimal + enhanced.
  liveTopCard: { backgroundColor: DS.surface, borderRadius: 16, marginHorizontal: 16, marginTop: 10, padding: 12, gap: 10 },
  liveScoreRow: { flexDirection: 'row', alignItems: 'center' },
  liveChaseWrap: { gap: 6, borderTopWidth: 1, borderTopColor: DS.line, paddingTop: 10 },
  liveChaseHeadline: { fontSize: 13, fontWeight: '700', color: DS.textPrimary, textAlign: 'center' },
  winBarSplit: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: DS.surfaceHighest },
  winPct: { fontSize: 12, fontWeight: '900' },
  liveRates: { flex: 1, fontSize: 11, color: DS.textMuted, fontWeight: '600', textAlign: 'center' },
  liveResultPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderTopWidth: 1, borderTopColor: DS.line, paddingTop: 12 },
  liveResultText: { fontSize: 13, fontWeight: '800', color: DS.textPrimary, flexShrink: 1, textAlign: 'center' },

  liveBox: { backgroundColor: DS.surface, borderRadius: 14, padding: 14, gap: 10 },
  liveBoxHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveBoxOver: { fontSize: 14, fontWeight: '900', color: DS.textPrimary },
  liveBoxScore: { fontSize: 16, fontWeight: '900', color: DS.lime },
  liveBallRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveOverRuns: { fontSize: 11, color: DS.textMuted, marginLeft: 4 },
  liveFigRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 10,
    borderTopWidth: 1, borderTopColor: DS.line, paddingTop: 10,
  },
  liveFigText: { fontSize: 12, color: DS.textVariant, fontWeight: '600' },
  liveFigNum: { fontWeight: '900', color: DS.textPrimary },
  partnershipText: { fontSize: 11, color: DS.textMuted, fontWeight: '600', marginTop: -2 },

  // LIVE tab: end-of-over summaries
  // End-of-over summary block, threaded inline into the ball-by-ball feed — a
  // tinted band so it reads as a divider between overs.
  commentaryOverEnd: { backgroundColor: DS.surfaceHighest, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: DS.line, gap: 4 },
  overEndHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  overEndTitle: { fontSize: 12.5, fontWeight: '800', color: DS.textPrimary },
  overEndTotal: { fontSize: 13, fontWeight: '900', color: DS.lime },
  overEndLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  overEndSub: { flex: 1, fontSize: 11.5, color: DS.textVariant, fontWeight: '600' },

  // LIVE tab: ball-by-ball commentary
  commentaryBox: { backgroundColor: DS.surface, borderRadius: 14, paddingVertical: 4 },
  commentaryRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: DS.line },
  commentaryLabel: { fontSize: 12, fontWeight: '800', color: DS.textMuted, width: 34 },
  commentaryText: { flex: 1, fontSize: 13, color: DS.textVariant, lineHeight: 19 },

  // SQUADS tab
  squadsGrid: { flexDirection: 'row', gap: 14 },
  squadCol: { flex: 1, backgroundColor: DS.surface, borderRadius: 14, padding: 12, gap: 2 },
  squadTeamName: { fontSize: 13, fontWeight: '900', color: DS.textPrimary, marginBottom: 6 },
  squadSectionLabel: { fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.8, marginBottom: 4 },
  squadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  squadName: { flexShrink: 1, fontSize: 12, fontWeight: '700', color: DS.textPrimary },
  squadNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  squadJersey: { fontSize: 10, fontWeight: '900', color: DS.textMuted, minWidth: 14 },
  capBadge: { width: 17, height: 17, borderRadius: 9, backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center' },
  capTxt: { fontSize: 9.5, fontWeight: '900', color: DS.bg },
  viceBadge: { paddingHorizontal: 5, height: 17, borderRadius: 9, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  viceTxt: { fontSize: 9, fontWeight: '900', color: DS.lime },
  squadRole: { fontSize: 10, color: DS.textMuted, marginTop: 1 },

  // HIGHLIGHTS tab
  highlightRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: DS.line },
  highlightIconWrap: { width: 30, height: 30, borderRadius: 15, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  highlightText: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },
  highlightMeta: { fontSize: 10, color: DS.textMuted, marginTop: 2, fontWeight: '600' },

  // SUMMARY tab (completed matches): match summary + Player of the Match hero + awards + MVP
  // SUMMARY tab — light/thin Inter aesthetic: big display text in Light (300),
  // body in Regular (400), small labels/initials just legible (600).
  summaryMatchCard: { backgroundColor: DS.surface, borderRadius: 16, padding: 14, gap: 10 },
  summaryTeamLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryTeamInit: { fontSize: 13, fontWeight: '600', color: '#ffffff' },
  summaryTeamNm: { flex: 1, fontSize: 14, fontWeight: '400', color: DS.textPrimary },
  summaryTeamSc: { fontSize: 18, fontWeight: '300', color: DS.lime, fontVariant: ['tabular-nums'] },
  summaryResultBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderTopWidth: 1, borderTopColor: DS.line, paddingTop: 10 },
  summaryResultTxt: { fontSize: 13, fontWeight: '400', color: DS.textPrimary, flexShrink: 1, textAlign: 'center' },
  summaryHero: { backgroundColor: DS.lime + '18', borderRadius: 16, borderWidth: 1, borderColor: DS.lime + '40', padding: 14, gap: 10 },
  summaryHeroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: DS.lime, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  summaryHeroBadgeTxt: { fontSize: 10, fontWeight: '600', color: DS.onLime, letterSpacing: 0.6 },
  summaryHeroRow: { flexDirection: 'row', alignItems: 'center' },
  summaryHeroInit: { fontSize: 18, fontWeight: '600', color: '#ffffff' },
  summaryHeroName: { fontSize: 19, fontWeight: '300', color: DS.textPrimary },
  summaryHeroTeam: { fontSize: 12, fontWeight: '400', color: DS.textMuted, marginTop: 1 },
  summaryHeroStat: { fontSize: 12, fontWeight: '400', color: DS.textVariant, marginTop: 3 },
  summaryMvpPill: { alignItems: 'center', backgroundColor: DS.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  summaryMvpVal: { fontSize: 19, fontWeight: '300', color: DS.lime },
  summaryMvpLbl: { fontSize: 9, fontWeight: '600', color: DS.textMuted, letterSpacing: 0.5 },

  summaryAwardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: DS.surface, borderRadius: 14, borderWidth: 1, borderColor: DS.line, padding: 12 },
  summaryAwardInit: { fontSize: 14, fontWeight: '600', color: '#ffffff' },
  summaryAwardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  summaryAwardLabel: { fontSize: 10, fontWeight: '600', color: DS.textMuted, letterSpacing: 0.5 },
  summaryAwardName: { fontSize: 14, fontWeight: '400', color: DS.textPrimary, marginTop: 1 },
  summaryAwardTeam: { fontSize: 12, fontWeight: '400', color: DS.textMuted },
  summaryAwardStat: { fontSize: 11.5, fontWeight: '400', color: DS.textVariant, marginTop: 2 },
  summaryAwardMvp: { fontSize: 16, fontWeight: '300', color: DS.lime },

  mvpRankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 1, borderTopColor: DS.line },
  mvpRank: { width: 18, fontSize: 13, fontWeight: '400', color: DS.textMuted, textAlign: 'center' },
  mvpRankInit: { fontSize: 11, fontWeight: '600', color: DS.textPrimary },
  mvpRankName: { fontSize: 13, fontWeight: '400', color: DS.textPrimary },
  mvpRankTeam: { fontSize: 11, fontWeight: '400', color: DS.textMuted },
  mvpRankVal: { fontSize: 15, fontWeight: '300', color: DS.lime },
  // Points split under the name — tabular figures so the numbers still line up
  // down the list without paying for fixed columns.
  mvpSplit: { fontSize: 11, fontWeight: '400', color: DS.textVariant, marginTop: 2, fontVariant: ['tabular-nums'] },
  mvpSplitLbl: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  mvpSplitSep: { color: DS.line },

  // Run-rate worm graph (SCORECARD tab)
  wormCard: { backgroundColor: DS.surface, borderRadius: 14, padding: 14, gap: 8 },
  wormTitle: { fontSize: 11, fontWeight: '800', color: DS.textMuted, letterSpacing: 1 },
  wormLegendRow: { flexDirection: 'row', gap: 16 },
  wormLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  wormDot: { width: 8, height: 8, borderRadius: 4 },
  wormLegendText: { fontSize: 11, color: DS.textVariant, fontWeight: '600', flexShrink: 1 },

  // INFO tab
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: DS.line },
  infoLabel: { fontSize: 12, color: DS.textMuted, fontWeight: '600' },
  infoValue: { fontSize: 12, color: DS.textPrimary, fontWeight: '700', flexShrink: 1, textAlign: 'right', marginLeft: 12 },

  // Share button
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#25D366', borderRadius: 14,
    paddingVertical: 14, marginHorizontal: 16, marginTop: 16
  },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: DS.white },
});
