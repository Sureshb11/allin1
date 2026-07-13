import { useTheme, useThemedStyles } from "../theme/ThemeContext";import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Share, Image, RefreshControl, Dimensions, Animated } from
'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import RNShare from 'react-native-share';
import legendsApi from '../services/LegendsApi';
import { haptic } from '../utils/haptics';
import BrandLogo from "../components/BrandLogo";
import PlayerAvatar from "../components/PlayerAvatar";
import HexAvatar from "../components/HexAvatar";

// Latest COMPLETED over of the current (last) innings — used to pop an
// auto-dismissing banner the moment a live watcher's poll picks up a newly
// finished over. Forward-declared call to computeOverEndSummaries below is
// safe: function declarations are hoisted.
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
  const inns = m.innings || [];
  for (const inn of inns) for (const o of (inn.oversData || [])) balls += (o.balls || []).length;
  return `${m.status}|${m.result}|${m.score1}|${m.score2}|${m.currentInnings}|${inns.length}|${balls}`;
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
        else if (!b.extraType && b.runs === 6) kind = 'six';
        else if (!b.extraType && b.runs === 4) kind = 'four';
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

// Cricket dismissal notation: "b Bowler", "c Fielder b Bowler", "c & b Bowler",
// "lbw b Bowler", "st Keeper b Bowler", "run out (Fielder)", "hit wicket b Bowler".
function formatDismissal(wicketType, catcher, bowler) {
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
    case 'runout': return `run out${catcher ? ` (${catcher})` : ''}`;
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
        if (et !== 'wide' && et !== 'penalty' && et !== 'retired') fig[id].balls += 1;   // faced
        if (!et || et === 'noBall') {                                        // runs off the bat
          fig[id].runs += ball.runs;
          if (ball.runs === 4) fig[id].fours += 1;
          if (ball.runs === 6) fig[id].sixes += 1;
        }
      }
      if (ball.isWicket && ball.dismissedPlayerId) {
        dis[ball.dismissedPlayerId] = formatDismissal(ball.wicketType, ball.wicketAssists, over.bowler?.name);
      }
    });
  });
  // Prefer the actual XI order; fall back to whoever appears in the ball log.
  const xi = (battingXI && battingXI.length)
    ? battingXI
    : [...new Set([...Object.keys(fig), ...Object.keys(dis)])].map((id) => ({ id, name: nameFromBall[id] || 'Unknown' }));
  const batted = [];
  const yetToBat = [];
  xi.forEach((p) => {
    const f = fig[p.id];
    const out = dis[p.id];
    if (f || out) {
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
  (innings.oversData || []).forEach((over) => {
    const id = over.bowlerId;
    if (!map[id]) { map[id] = { id, name: over.bowler?.name || 'Unknown', legalBalls: 0, runs: 0, wickets: 0, maidens: 0 }; order.push(id); }
    let overRuns = 0, overLegal = 0;
    (over.balls || []).forEach((b) => {
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
        const wt = String(b.wicketType || '').toLowerCase().replace(/\s/g, '');
        if (wt !== 'runout' && wt !== 'retired') map[id].wickets += 1;
      }
    });
    if (overLegal >= 6 && overRuns === 0) map[id].maidens += 1;
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
    if (!['wide', 'noBall', 'penalty', 'retired'].includes(b.extraType)) legal += 1;
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
    if (!['wide', 'noBall', 'penalty', 'retired'].includes(b.extraType)) legal += 1;
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
    if (!['wide', 'noBall', 'penalty', 'retired'].includes(b.extraType)) legalBalls += 1;
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
      const legal = !['wide', 'noBall', 'penalty', 'retired'].includes(et);
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
function computeChase(innings, totalOvers) {
  if (!innings || !innings.targetScore || innings.inningNumber !== 2) return null;
  const target = innings.targetScore;
  const need = Math.max(0, target - innings.totalRuns);
  let legal = 0;
  (innings.oversData || []).forEach((over) => (over.balls || []).forEach((b) => {
    if (!['wide', 'noBall', 'penalty', 'retired'].includes(b.extraType)) legal += 1;
  }));
  const ballsBowled = legal;
  const ballsLeft = Math.max(0, (totalOvers || 20) * 6 - ballsBowled);
  const crr = ballsBowled > 0 ? (innings.totalRuns / (ballsBowled / 6)) : 0;
  const rrr = ballsLeft > 0 ? (need / (ballsLeft / 6)) : (need > 0 ? Infinity : 0);
  const wktsLeft = 10 - innings.totalWickets;
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

// Short label for a ball in the over-by-over timeline.
function ballLabel(b) {
  if (b.extraType === 'wide') return `${b.extras > 1 ? b.extras : ''}wd`;
  if (b.extraType === 'noBall') return `${b.runs > 0 ? b.runs : ''}nb`;
  if (b.extraType === 'bye') return `${b.extras}b`;
  if (b.extraType === 'legBye') return `${b.extras}lb`;
  if (b.extraType === 'penalty') return 'P5';
  if (b.extraType === 'retired') return 'R';
  if (b.isWicket) return 'W';
  return b.runs === 0 ? '•' : `${b.runs}`;
}

// One text commentary line for a single ball — plain, factual, Cricbuzz-style
// ("Bowler to Batter, N runs"), built entirely from data we already have.
function ballCommentary(ball, bowlerName) {
  const batter = ball.batter?.name || 'Batter';
  const et = ball.extraType;
  if (et === 'wide') return `${bowlerName} to ${batter}, wide`;
  if (et === 'noBall') return `${bowlerName} to ${batter}, no ball${ball.runs ? `, ${ball.runs} run${ball.runs > 1 ? 's' : ''}` : ''}`;
  if (et === 'bye') return `${bowlerName} to ${batter}, ${ball.extras} bye${ball.extras > 1 ? 's' : ''}`;
  if (et === 'legBye') return `${bowlerName} to ${batter}, ${ball.extras} leg bye${ball.extras > 1 ? 's' : ''}`;
  if (et === 'penalty') return 'Penalty awarded, 5 runs';
  if (et === 'retired') return `${batter} retires ${String(ball.wicketType).toLowerCase() === 'retiredhurt' ? 'hurt' : 'out'}`;
  if (ball.isWicket) return `${bowlerName} to ${batter}, OUT! ${formatDismissal(ball.wicketType, ball.wicketAssists, bowlerName)}`;
  if (ball.runs === 0) return `${bowlerName} to ${batter}, no run`;
  if (ball.runs === 4) return `${bowlerName} to ${batter}, FOUR!`;
  if (ball.runs === 6) return `${bowlerName} to ${batter}, SIX!`;
  return `${bowlerName} to ${batter}, ${ball.runs} run${ball.runs > 1 ? 's' : ''}`;
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
    const bowlerName = over.bowler?.name || 'Bowler';
    let legalInOver = 0;
    (over.balls || []).forEach((ball, idx) => {
      const isLegal = !['wide', 'noBall', 'penalty', 'retired'].includes(ball.extraType);
      if (isLegal) legalInOver += 1;
      lines.push({
        type: 'ball',
        key: `${over.id}-${idx}`,
        label: `${over.overNumber - 1}.${legalInOver}`,
        text: ballCommentary(ball, bowlerName),
        isWicket: !!ball.isWicket,
        isBoundary: !ball.extraType && (ball.runs === 4 || ball.runs === 6),
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
      const bowlerName = over.bowler?.name || 'Bowler';
      let legalInOver = 0;
      (over.balls || []).forEach((ball) => {
        const et = ball.extraType;
        const isLegal = !['wide', 'noBall', 'penalty', 'retired'].includes(et);
        if (isLegal) legalInOver += 1;
        const label = `${over.overNumber - 1}.${legalInOver}`;
        const batterName = ball.batter?.name || 'Batter';
        const offBat = !et || et === 'noBall';   // runs credited to the bat

        // Boundaries — a four or six off the bat.
        if (ball.batterId && offBat && !ball.isWicket) {
          if (ball.runs === 6) items.push({ key: `${ball.id}-6`, inningsLabel, label, icon: 'fire', kind: 'six', text: `SIX! ${batterName} clears the rope` });
          else if (ball.runs === 4) items.push({ key: `${ball.id}-4`, inningsLabel, label, icon: 'cricket', kind: 'four', text: `FOUR! ${batterName} finds the boundary` });
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
          items.push({ key: `${over.id}-${ball.batterId}-w`, inningsLabel, label, icon: 'alert-octagon', kind: 'wicket', text: `WICKET! ${batterName} ${formatDismissal(ball.wicketType, ball.wicketAssists, bowlerName)}` });
          const wt = String(ball.wicketType || '').toLowerCase().replace(/\s/g, '');
          const bowlerCredited = wt !== 'runout' && wt !== 'retired' && wt !== 'retiredout' && wt !== 'retiredhurt';
          if (bowlerCredited) {
            streakCount = streakBowlerId === over.bowlerId ? streakCount + 1 : 1;
            streakBowlerId = over.bowlerId;
            bowlerWkts[over.bowlerId] = (bowlerWkts[over.bowlerId] || 0) + 1;
            if (streakCount === 3) items.push({ key: `${over.id}-${over.bowlerId}-hat`, inningsLabel, label, icon: 'cricket', kind: 'milestone', text: `HAT-TRICK! ${bowlerName} takes three wickets in a row` });
            if (bowlerWkts[over.bowlerId] === 5) items.push({ key: `${over.id}-${over.bowlerId}-5w`, inningsLabel, label, icon: 'cricket', kind: 'milestone', text: `FIVE-WICKET HAUL! ${bowlerName} completes a five-for` });
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
function InningsScorecard({ innings, index, squads, totalOvers, expanded = true, collapsible = false, onToggle }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
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
          <View key={i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
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
            </View>
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
          <View key={i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
              <View style={[styles.cell, styles.nameCol, styles.nameCell]}>
                <PlayerAvatar name={b.name} avatarUrl={avatarById[b.id]} size={20} style={styles.rowAvatar} />
                <Text style={[styles.bowlerName, { flex: 1 }]} numberOfLines={2}>{b.name}</Text>
              </View>
              <Text style={[styles.cell, styles.numCol]}>{b.overs}</Text>
              <Text style={[styles.cell, styles.numCol]}>{b.maidens}</Text>
              <Text style={[styles.cell, styles.numCol]}>{b.runs}</Text>
              <Text style={[styles.cell, styles.numCol, b.wickets >= 3 && styles.highlight]}>{b.wickets}</Text>
              <Text style={[styles.cell, styles.numCol]}>{b.economy}</Text>
            </View>
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
  return (
    <View style={styles.inningsCard}>
      {overs.map((ov) => (
        <View key={ov.id} style={styles.overLine}>
          <Text style={styles.overLineNum}>Ov {ov.overNumber}</Text>
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
          <Text style={styles.overLineRuns}>{ov.runs + ov.extras}</Text>
        </View>
      ))}
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
function SummaryTab({ matchId, match }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const [loading, setLoading] = useState(true);
  const [awards, setAwards] = useState(null);

  useEffect(() => {
    let alive = true;
    legendsApi.getMatchAwards(matchId).then((res) => {
      if (alive && res.success) setAwards(res.data?.awards || null);
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [matchId]);

  // Player photo lookup by name — awards carry names only, so match them against
  // the squad records (which include each player's avatar).
  const avatarFor = React.useMemo(() => {
    const map = {};
    (match?.squads || []).forEach((s) => { if (s.player?.name) map[s.player.name] = s.player.user?.avatarUrl || null; });
    return (name) => map[name] || null;
  }, [match]);

  if (loading) return <ActivityIndicator color={DS.lime} style={{ marginTop: 40 }} />;
  if (!awards) return <Text style={styles.emptyTabText}>Awards not available for this match.</Text>;

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
    return <Text style={styles.emptyTabText}>No award data for this match.</Text>;
  }

  return (
    <View style={{ gap: 12 }}>
      {/* Match summary — both teams' scores/overs + result. */}
      <View style={styles.summaryMatchCard}>
        <View style={styles.summaryTeamLine}>
          <HexAvatar size={30} color={DS.lime}><Text style={styles.summaryTeamInit}>{t1[0]}</Text></HexAvatar>
          <Text style={styles.summaryTeamNm} numberOfLines={1}>{t1}</Text>
          <Text style={styles.summaryTeamSc}>{match?.score1 || '—'}</Text>
        </View>
        <View style={styles.summaryTeamLine}>
          <HexAvatar size={30} color={DS.blue}><Text style={styles.summaryTeamInit}>{t2[0]}</Text></HexAvatar>
          <Text style={styles.summaryTeamNm} numberOfLines={1}>{t2}</Text>
          <Text style={[styles.summaryTeamSc, { color: DS.blue }]}>{match?.score2 || '—'}</Text>
        </View>
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
          <View style={styles.summaryHeroRow}>
            {/* Big profile pic */}
            <HexAvatar size={72} color={DS.lime} uri={avatarFor(motm.name)}><Text style={styles.summaryHeroInit}>{summaryInitials(motm.name)}</Text></HexAvatar>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.summaryHeroName} numberOfLines={1}>{motm.name}</Text>
              <Text style={styles.summaryHeroTeam} numberOfLines={1}>{motm.teamName}</Text>
              {!!summaryStatLine(motm) && <Text style={styles.summaryHeroStat} numberOfLines={1}>{summaryStatLine(motm)}</Text>}
            </View>
            <View style={styles.summaryMvpPill}>
              <Text style={styles.summaryMvpVal}>{motm.total}</Text>
              <Text style={styles.summaryMvpLbl}>MVP</Text>
            </View>
          </View>
        </View>
      }

      {/* Fighter + Best Batter/Bowler/Fielder — smaller profile pic than the MotM */}
      {awardRows.map(({ key, label, icon, color, p }) => (
        <View key={key} style={[styles.summaryAwardRow, key === 'fighter' && { borderColor: color + '55' }]}>
          <HexAvatar size={46} color={color} uri={avatarFor(p.name)}><Text style={styles.summaryAwardInit}>{summaryInitials(p.name)}</Text></HexAvatar>
          <View style={{ flex: 1 }}>
            <View style={styles.summaryAwardLabelRow}>
              <Icon name={icon} size={12} color={color} />
              <Text style={styles.summaryAwardLabel}>{label.toUpperCase()}</Text>
            </View>
            <Text style={styles.summaryAwardName} numberOfLines={1}>{p.name} <Text style={styles.summaryAwardTeam}>· {p.teamName}</Text></Text>
            {!!summaryStatLine(p) && <Text style={styles.summaryAwardStat} numberOfLines={1}>{summaryStatLine(p)}</Text>}
          </View>
          <Text style={styles.summaryAwardMvp}>{p.total}</Text>
        </View>
      ))}

      {mvpOrder.length > 0 &&
        <View style={styles.inningsCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderLeft}>
              <View style={styles.inningsIndicator} />
              <Text style={styles.sectionHeaderText}>MVP</Text>
            </View>
          </View>
          {mvpOrder.map((p, i) => (
            <View key={i} style={[styles.mvpRankRow, i === 0 && { borderTopWidth: 0 }]}>
              <Text style={styles.mvpRank}>{i + 1}</Text>
              <HexAvatar size={30} color={DS.surfaceHighest} uri={avatarFor(p.name)}><Text style={styles.mvpRankInit}>{summaryInitials(p.name)}</Text></HexAvatar>
              <View style={{ flex: 1 }}>
                <Text style={styles.mvpRankName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.mvpRankTeam} numberOfLines={1}>{p.teamName}</Text>
              </View>
              <Text style={styles.mvpRankVal}>{p.total}</Text>
            </View>
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
    : kind === 'four' ? DS.blue : DS.lime;
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
function computeOverEndSummaries(innings) {
  const overs = [...(innings?.oversData || [])].sort((a, b) => a.overNumber - b.overNumber);
  const legalIn = (over) => (over.balls || []).filter((b) => !['wide', 'noBall', 'penalty', 'retired'].includes(b.extraType)).length;
  const batRuns = {}, batBalls = {}, batName = {};
  const bowl = {};   // bowlerId -> cumulative { name, balls, runs, wkts, maidens }
  let runningRuns = 0, runningWkts = 0;
  const out = [];
  for (const over of overs) {
    const bId = over.bowlerId;
    if (!bowl[bId]) bowl[bId] = { name: over.bowler?.name || 'Bowler', balls: 0, runs: 0, wkts: 0, maidens: 0 };
    // Team total from the stored per-over aggregates (authoritative).
    runningRuns += (over.runs || 0) + (over.extras || 0);
    runningWkts += (over.wickets || 0);
    let lastStriker = null, lastNon = null, overCharged = 0, overLegal = 0;
    for (const b of (over.balls || [])) {
      const et = b.extraType;
      if (b.batterId) {
        batName[b.batterId] = b.batter?.name || 'Batter';
        if (et !== 'wide' && et !== 'penalty' && et !== 'retired') batBalls[b.batterId] = (batBalls[b.batterId] || 0) + 1;
        if (!et || et === 'noBall') batRuns[b.batterId] = (batRuns[b.batterId] || 0) + b.runs;
      }
      if (b.nonStrikerId) batName[b.nonStrikerId] = b.nonStriker?.name || batName[b.nonStrikerId] || 'Batter';
      // Bowler figures — charged runs (byes/leg-byes excluded), legal balls, wickets.
      let charged = 0, legal = false;
      if (et === 'wide') charged = b.extras;
      else if (et === 'noBall') charged = b.runs + b.extras;
      else if (et === 'bye' || et === 'legBye') legal = true;
      else if (et === 'penalty' || et === 'retired') charged = 0;
      else { charged = b.runs; legal = true; }
      bowl[bId].runs += charged; overCharged += charged;
      if (legal) { bowl[bId].balls += 1; overLegal += 1; }
      if (b.isWicket) {
        const wt = String(b.wicketType || '').toLowerCase().replace(/\s/g, '');
        if (wt !== 'runout' && wt !== 'retired') bowl[bId].wkts += 1;
      }
      lastStriker = b.batterId; lastNon = b.nonStrikerId;
    }
    if (overLegal >= 6 && overCharged === 0) bowl[bId].maidens += 1;
    if (legalIn(over) >= 6) {   // completed over only
      const bw = bowl[bId];
      out.push({
        over: over.overNumber,
        total: `${runningRuns}/${runningWkts}`,
        bat: [lastStriker, lastNon].filter(Boolean).map((id) => ({ name: batName[id] || 'Batter', runs: batRuns[id] || 0, balls: batBalls[id] || 0 })),
        // Standard O-M-R-W bowling figures, matching the format used across the app.
        bowler: { name: bw.name, fig: `${Math.floor(bw.balls / 6)}.${bw.balls % 6}-${bw.maidens}-${bw.runs}-${bw.wkts}` },
      });
    }
  }
  return out.reverse();
}

// ── LIVE tab: current-over box + reverse-chronological ball commentary ───────
function LiveTab({ innings, squads, totalOvers }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  if (!innings) return <Text style={styles.emptyTabText}>Play hasn't started yet.</Text>;

  const battingXI = (squads || [])
    .filter((s) => s.teamId === innings.battingTeamId)
    .map((s) => ({ id: s.playerId, name: s.player?.name || 'Unknown' }));
  const { batted } = computeBatting(innings, battingXI);
  const bowlers = computeBowling(innings);
  const overs = [...(innings.oversData || [])].sort((a, b) => a.overNumber - b.overNumber);
  const lastOver = overs[overs.length - 1];
  const notOut = batted.filter((b) => !b.out).slice(-2);
  const currentBowler = lastOver ? bowlers.find((b) => b.id === lastOver.bowlerId) : null;
  const commentary = buildCommentary(innings);
  const lastOverRuns = lastOver ? lastOver.runs + lastOver.extras : 0;
  const partnership = computePartnership(innings);

  return (
    <View style={{ gap: 12 }}>
      {/* Team scores + chase + win probability now live in the combined card above
          (rendered by ScorecardScreen on the LIVE tab), so LiveTab starts with the
          current-over box and commentary. */}
      {lastOver &&
        <View style={styles.liveBox}>
          <View style={styles.liveBoxHead}>
            <Text style={styles.liveBoxOver}>Over {lastOver.overNumber}</Text>
            <Text style={styles.liveBoxScore}>{innings.totalRuns}-{innings.totalWickets}</Text>
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
                  {b.name}{b.id === innings.strikerId ? <Text style={styles.strikerStar}> ★</Text> : ''}  <Text style={styles.liveFigNum}>{b.runs}({b.balls})</Text>
                </Text>
              ))}
            </View>
            {currentBowler &&
              <Text style={styles.liveFigText} numberOfLines={1}>{currentBowler.name}  <Text style={styles.liveFigNum}>{currentBowler.wickets}-{currentBowler.runs} ({currentBowler.overs})</Text></Text>
            }
          </View>
          <Text style={styles.partnershipText}>
            Partnership: <Text style={styles.liveFigNum}>{partnership.runs}({partnership.balls})</Text>
          </Text>
        </View>
      }

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
                  {line.data.bat.map((b) => `${b.name} ${b.runs}(${b.balls})`).join('   ')}
                </Text>
              </View>
              <View style={styles.overEndLine}>
                <Icon name="bowling" size={12} color={DS.coral} />
                <Text style={styles.overEndSub} numberOfLines={1}>{line.data.bowler.name} {line.data.bowler.fig}</Text>
              </View>
            </View>
          ) : (
            <View key={line.key} style={styles.commentaryRow}>
              <Text style={[styles.commentaryLabel, line.isWicket && { color: DS.live }]}>{line.label}</Text>
              <Text style={[styles.commentaryText, line.isWicket && { fontWeight: '800', color: DS.textPrimary }, line.isBoundary && { color: DS.lime, fontWeight: '700' }]}>
                {line.text}
              </Text>
            </View>
          )
        ))}
      </View>
    </View>
  );
}

// ── SQUADS tab: playing XI (avatar + name + role) per team, plus bench ───────
function PlayerRow({ name, role, avatarUrl }) {const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.squadRow}>
      <PlayerAvatar name={name} avatarUrl={avatarUrl} size={30} />
      <View style={{ flex: 1 }}>
        <Text style={styles.squadName} numberOfLines={1}>{name}</Text>
        {!!role && <Text style={styles.squadRole}>{role}</Text>}
      </View>
    </View>
  );
}

function SquadsTab({ match }) {const styles = useThemedStyles(makeStyles);
  const teams = [match.team1, match.team2];
  return (
    <View style={styles.squadsGrid}>
      {teams.map((team, ti) => {
        const squad = (match.squads || []).filter((s) => s.teamId === team?.id);
        const squadIds = new Set(squad.map((s) => s.playerId));
        const bench = (team?.players || []).filter((p) => !squadIds.has(p.id));
        return (
          <View key={team?.id || ti} style={styles.squadCol}>
            <Text style={styles.squadTeamName} numberOfLines={1}>{team?.name || `Team ${ti + 1}`}</Text>
            <Text style={styles.squadSectionLabel}>PLAYING XI</Text>
            {squad.map((s) => (
              <PlayerRow key={s.playerId} name={s.player?.name} role={s.player?.role} avatarUrl={s.player?.user?.avatarUrl} />
            ))}
            {squad.length === 0 && <Text style={styles.emptyTabText}>Not announced yet.</Text>}
            {bench.length > 0 &&
              <>
                <Text style={[styles.squadSectionLabel, { marginTop: 10 }]}>BENCH</Text>
                {bench.map((p) => (
                  <PlayerRow key={p.id} name={p.name} role={p.role} avatarUrl={null} />
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

export default function ScorecardScreen({ route, navigation }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const { matchId } = route.params || {};
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inningsTab, setInningsTab] = useState(0);   // which innings' overs to show (OVERS tab)
  const [expandedInnings, setExpandedInnings] = useState(null); // which team's card is open (SCORECARD tab); null = default
  const [tab, setTab] = useState(null);              // active top tab; null until match first loads
  const shotRef = useRef(null);                      // capture target for "share as image"
  const pagerRef = useRef(null);                     // horizontal swipeable tab content
  const [celebration, setCelebration] = useState(null); // {kind,id} FOUR/SIX/WICKET flourish
  const lastBallRef = useRef(null);                  // last delivery id seen (celebration baseline)
  const [overEndBanner, setOverEndBanner] = useState(null); // end-of-over summary popup
  const lastOverEndRef = useRef(null);                // last completed-over number seen

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
      if (lb.kind && match.status === 'live') {
        setCelebration({ kind: lb.kind, id: lb.id });
        if (lb.kind === 'wicket') haptic.warn(); else haptic.success();
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
      if (match.status === 'live') { setOverEndBanner(oe); haptic.tick(); }
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

  // Watch a live match like Cricbuzz/Cricinfo: auto-refresh every few seconds while
  // this screen is focused, so the score/overs/wickets update without a manual pull.
  // Anyone can land here — team members and followers included — this is the
  // read-only "watch" experience (only the assigned scorer can actually score).
  useFocusEffect(
    useCallback(() => {
      loadScorecard(true);
      const poll = setInterval(() => {
        setMatch((cur) => {
          // Stop polling entirely once the match is no longer live — no point
          // hitting the server every 6s for a finished game.
          if (cur && cur.status !== 'live') { clearInterval(poll); return cur; }
          loadScorecard(false);
          return cur;
        });
      }, 6000);
      return () => clearInterval(poll);
    }, [loadScorecard])
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
  const isLive = match?.status === 'live';
  const isCompleted = match?.status === 'completed';
  // Default tab: LIVE while live, SUMMARY right when a match completes (so the
  // awards are the first thing a viewer sees), SCORECARD otherwise — but once
  // the viewer taps a tab themselves, `tab` takes over and stays put across polls.
  const activeTab = tab || (isLive ? 'live' : isCompleted ? 'summary' : 'scorecard');
  const TABS = [
    { key: 'info', label: 'INFO' },
    ...(isLive ? [{ key: 'live', label: 'LIVE' }] : []),
    ...(isCompleted ? [{ key: 'summary', label: 'SUMMARY' }] : []),
    { key: 'scorecard', label: 'SCORECARD' },
    { key: 'squads', label: 'SQUADS' },
    { key: 'overs', label: 'OVERS' },
    { key: 'highlights', label: 'HIGHLIGHTS' },
  ];
  const activeIndex = Math.max(0, TABS.findIndex((t) => t.key === activeTab));
  const inningsList = match?.innings || [];
  const selectedInnings = inningsList[inningsTab] || inningsList[0];
  const liveInnings = inningsList[inningsList.length - 1];   // currently-batting innings
  // Accordion: default open = the most recent (currently-batting or last-completed) innings.
  const effectiveExpanded = expandedInnings === null ? inningsList.length - 1 : expandedInnings;
  // "NEED X off Y balls" for the 2nd innings — shown across every tab; the toss
  // (a fixed, non-changing fact) stays confined to the INFO tab only.
  const chase = computeChase(liveInnings, match?.overs);
  // Split the win probability onto the two team columns (chasing team = chaseWin).
  const t1Win = chase ? (chase.teamName === t1 ? chase.chaseWin : 100 - chase.chaseWin) : 50;
  const t2Win = 100 - t1Win;

  // Keep the swipeable pager in sync with the active tab — covers the initial
  // default tab, a tab-bar tap, and (as a harmless no-op re-scroll) a swipe
  // gesture, which updates `tab` directly via onMomentumScrollEnd below.
  useEffect(() => {
    const idx = TABS.findIndex((t) => t.key === activeTab);
    if (idx >= 0) pagerRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, y: 0, animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isLive]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={DS.lime} />
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
          <Text style={styles.matchHeaderTitle} numberOfLines={1}>{t1} <Text style={styles.matchHeaderVs}>v</Text> {t2}</Text>
          {isLive
            ? <View style={styles.liveBadge}><View style={styles.liveBadgeDot} /><Text style={styles.liveBadgeText}>LIVE</Text></View>
            : <View style={{ width: 26 }} />}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.matchTabBar}
          contentContainerStyle={styles.matchTabBarContent}>
          {TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <TouchableOpacity key={t.key} style={[styles.matchTab, active && styles.matchTabActive]} onPress={() => setTab(t.key)}>
                <Text style={[styles.matchTabText, active && styles.matchTabTextActive]} numberOfLines={1}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
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
          onMomentumScrollEnd={(e) => {
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
              contentContainerStyle={{ paddingTop: 12, paddingBottom: 12 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} colors={[DS.lime]} />}>
              {near && <>
              <View style={styles.body}>
                {t.key === 'info' && <InfoTab match={match} />}

                {t.key === 'live' && <LiveTab innings={liveInnings} squads={match.squads} totalOvers={match.overs} />}

                {t.key === 'overs' && inningsList.length > 1 &&
                  <View style={styles.inningsTabs}>
                    {inningsList.map((inn, i) => {
                      const active = inningsTab === i;
                      return (
                        <TouchableOpacity key={inn.id || i} style={[styles.inningsTab, active && styles.inningsTabActive]}
                          onPress={() => setInningsTab(i)}>
                          <Text style={[styles.inningsTabText, active && styles.inningsTabTextActive]} numberOfLines={1}>
                            {(inn.battingTeam?.name || `Innings ${i + 1}`).toUpperCase()}
                          </Text>
                          <Text style={[styles.inningsTabSub, active && { color: DS.bg }]}>{i === 0 ? '1st' : '2nd'} inns</Text>
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
                        />
                      ))}
                      <WormChart innings1={inningsList[0]} innings2={inningsList[1]} totalOvers={match.overs} />
                    </View>
                    : <Text style={styles.emptyTabText}>No play yet.</Text>)}

                {t.key === 'overs' &&
                  (selectedInnings ? <InningsOvers innings={selectedInnings} /> : <Text style={styles.emptyTabText}>No overs yet.</Text>)}

                {t.key === 'summary' && <SummaryTab matchId={matchId} match={match} />}

                {t.key === 'squads' && <SquadsTab match={match} />}

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
    </View>);

}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg },
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

  // Match-center tab bar (INFO / LIVE / SCORECARD / SQUADS / OVERS)
  matchTabBar: { backgroundColor: DS.surface },
  matchTabBarContent: { flexDirection: 'row' },
  matchTab: {
    alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  matchTabActive: { borderBottomColor: DS.lime },
  matchTabText: { fontSize: 11, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.5 },
  matchTabTextActive: { color: DS.lime },

  // Score summary
  scoreSummary: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: DS.surface, marginHorizontal: 16,
    borderRadius: 14, padding: 16
  },
  scoreTeam: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreTeamRight: { justifyContent: 'flex-end' },
  scoreAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  scoreAvatarText: { fontSize: 14, fontWeight: '900', color: '#ffffff' },
  scoreTeamName: { fontSize: 11, color: DS.textMuted, fontWeight: '700' },
  scoreValue: { fontSize: 19, fontWeight: '900', color: DS.lime, letterSpacing: -0.3 },
  scoreValueRight: { textAlign: 'right', color: DS.blue },
  scoreVs: { paddingHorizontal: 8 },
  scoreVsText: { fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 1 },
  chaseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 12 },
  tossSummaryLine: { fontSize: 11.5, fontWeight: '600', color: DS.textMuted, textAlign: 'center' },

  // Result
  resultBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: DS.lime + '14', marginHorizontal: 16, marginTop: 12,
    borderRadius: 10, paddingVertical: 10,
    borderLeftWidth: 4, borderLeftColor: DS.lime
  },
  resultBannerText: { fontSize: 14, fontWeight: '700', color: DS.textPrimary },
  resultCard: {
    alignItems: 'center', gap: 6, marginHorizontal: 16, marginTop: 12,
    backgroundColor: DS.lime + '14', borderRadius: 14, paddingVertical: 18, paddingHorizontal: 16,
    borderWidth: 1, borderColor: DS.lime + '33',
  },
  resultCardLabel: { fontSize: 10, fontWeight: '900', color: DS.lime, letterSpacing: 2 },
  resultCardText: { fontSize: 16, fontWeight: '800', color: DS.textPrimary, textAlign: 'center' },

  body: { paddingHorizontal: 16, gap: 16, marginTop: 8 },
  emptyTabText: { fontSize: 13, color: DS.textMuted, textAlign: 'center', paddingVertical: 24 },

  // Team / innings tabs
  inningsTabs: { flexDirection: 'row', gap: 8 },
  inningsTab: {
    flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8,
    alignItems: 'center', gap: 2,
  },
  inningsTabActive: { backgroundColor: DS.lime },
  inningsTabText: { fontSize: 12, fontWeight: '900', color: DS.textMuted, letterSpacing: 0.4 },
  inningsTabTextActive: { color: DS.bg },
  inningsTabSub: { fontSize: 10, fontWeight: '700', color: DS.textMuted },

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
  overLine: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, gap: 8, borderTopWidth: 1, borderTopColor: DS.line },
  overLineNum: { fontSize: 11, fontWeight: '800', color: DS.textMuted, width: 40 },
  overLineBalls: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  overLineRuns: { fontSize: 13, fontWeight: '900', color: DS.textPrimary, width: 26, textAlign: 'right' },
  ballChip: { minWidth: 22, paddingHorizontal: 5, paddingVertical: 3, borderRadius: 6, backgroundColor: DS.surfaceHigh, alignItems: 'center' },
  ballChipW: { backgroundColor: DS.live },
  ballChipBoundary: { backgroundColor: DS.lime },
  ballChipExtra: { backgroundColor: 'rgba(255,181,158,0.18)' },
  ballChipText: { fontSize: 11, fontWeight: '800', color: DS.textPrimary },

  // LIVE tab: current-over box
  // Chase strip (2nd-innings LIVE tab)
  chaseBox: { backgroundColor: DS.surface, borderRadius: 14, padding: 14, gap: 10, borderLeftWidth: 4, borderLeftColor: DS.lime },
  chaseHeadline: { fontSize: 15, fontWeight: '700', color: DS.textPrimary },
  chaseNeed: { fontWeight: '900', color: DS.lime },
  chaseRatesRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  chaseRate: { fontSize: 12, color: DS.textMuted, fontWeight: '600' },
  chaseRateNum: { fontWeight: '900', color: DS.textPrimary },
  winBarTrack: { height: 8, borderRadius: 4, backgroundColor: DS.coral + '55', overflow: 'hidden' },
  winBarFill: { height: 8, borderRadius: 4, backgroundColor: DS.lime },
  winLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  winLabel: { fontSize: 12, fontWeight: '800', color: DS.textPrimary },
  winLabelMuted: { fontSize: 10, color: DS.textMuted, fontWeight: '600' },

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
  liveBoxLinks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  liveLinkText: { fontSize: 12, fontWeight: '700', color: DS.blue },
  liveSummaryText: { fontSize: 12, color: DS.textMuted, lineHeight: 18 },

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
  squadAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  squadAvatarImg: { width: 30, height: 30, borderRadius: 15 },
  squadAvatarText: { fontSize: 12, fontWeight: '900', color: DS.lime },
  squadName: { fontSize: 12, fontWeight: '700', color: DS.textPrimary },
  squadRole: { fontSize: 10, color: DS.textMuted, marginTop: 1 },

  // HIGHLIGHTS tab
  highlightRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: DS.line },
  highlightIconWrap: { width: 30, height: 30, borderRadius: 15, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  highlightText: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },
  highlightMeta: { fontSize: 10, color: DS.textMuted, marginTop: 2, fontWeight: '600' },

  // SUMMARY tab (completed matches): match summary + Player of the Match hero + awards + MVP
  summaryMatchCard: { backgroundColor: DS.surface, borderRadius: 16, padding: 14, gap: 10 },
  summaryTeamLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryTeamInit: { fontSize: 13, fontWeight: '900', color: '#ffffff' },
  summaryTeamNm: { flex: 1, fontSize: 14, fontWeight: '800', color: DS.textPrimary },
  summaryTeamSc: { fontSize: 16, fontWeight: '900', color: DS.lime, fontVariant: ['tabular-nums'] },
  summaryResultBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderTopWidth: 1, borderTopColor: DS.line, paddingTop: 10 },
  summaryResultTxt: { fontSize: 13, fontWeight: '800', color: DS.textPrimary, flexShrink: 1, textAlign: 'center' },
  summaryHero: { backgroundColor: DS.lime + '18', borderRadius: 16, borderWidth: 1, borderColor: DS.lime + '40', padding: 14, gap: 10 },
  summaryHeroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: DS.lime, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  summaryHeroBadgeTxt: { fontSize: 10, fontWeight: '900', color: DS.onLime, letterSpacing: 0.6 },
  summaryHeroRow: { flexDirection: 'row', alignItems: 'center' },
  summaryHeroInit: { fontSize: 18, fontWeight: '900', color: '#ffffff' },
  summaryHeroName: { fontSize: 17, fontWeight: '900', color: DS.textPrimary },
  summaryHeroTeam: { fontSize: 12, fontWeight: '700', color: DS.textMuted, marginTop: 1 },
  summaryHeroStat: { fontSize: 12, fontWeight: '600', color: DS.textVariant, marginTop: 3 },
  summaryMvpPill: { alignItems: 'center', backgroundColor: DS.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  summaryMvpVal: { fontSize: 17, fontWeight: '900', color: DS.lime },
  summaryMvpLbl: { fontSize: 9, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.5 },

  summaryAwardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: DS.surface, borderRadius: 14, borderWidth: 1, borderColor: DS.line, padding: 12 },
  summaryAwardInit: { fontSize: 14, fontWeight: '900', color: '#ffffff' },
  summaryAwardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  summaryAwardLabel: { fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.5 },
  summaryAwardName: { fontSize: 13.5, fontWeight: '800', color: DS.textPrimary, marginTop: 1 },
  summaryAwardTeam: { fontSize: 12, fontWeight: '600', color: DS.textMuted },
  summaryAwardStat: { fontSize: 11.5, fontWeight: '600', color: DS.textVariant, marginTop: 2 },
  summaryAwardMvp: { fontSize: 15, fontWeight: '900', color: DS.lime },

  mvpRankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 1, borderTopColor: DS.line },
  mvpRank: { width: 18, fontSize: 13, fontWeight: '900', color: DS.textMuted, textAlign: 'center' },
  mvpRankInit: { fontSize: 11, fontWeight: '900', color: DS.textPrimary },
  mvpRankName: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },
  mvpRankTeam: { fontSize: 11, fontWeight: '600', color: DS.textMuted },
  mvpRankVal: { fontSize: 14, fontWeight: '900', color: DS.lime },

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
  watermark: { textAlign: 'center', fontSize: 11, fontWeight: '900', color: DS.lime, letterSpacing: 2, marginTop: 10, opacity: 0.8 },
});
