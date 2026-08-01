import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Fragment, forwardRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { useHideTabBarOnScroll, useTabBarClearance } from "../components/AutoHideTabBar";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Animated, ScrollView, RefreshControl, Image } from 'react-native';
import Reanimated, { useAnimatedRef, useSharedValue, scrollTo, FadeIn, FadeInDown, SlideInRight, SlideInLeft, SlideOutRight, SlideInDown, LinearTransition, useAnimatedStyle, runOnJS, withRepeat, withSequence, withTiming, withDelay, withSpring, interpolateColor } from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useFilterSwipe } from '../utils/useFilterSwipe';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import HexAvatar from '../components/HexAvatar';
import AnimatedPressable from '../components/AnimatedPressable';
import AmbientBackground from '../components/AmbientBackground';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport } from '../utils/selectedSport';
import { getRankingBoards, rankValue } from '../sports/careerStats';
import { useCurrentUser } from '../utils/currentUser';
import { haptic } from '../utils/haptics';


// ── Shimmer Skeleton ────────────────────────────────────────────────────────
function StatSkeleton({ DS }) {
  // Cascading wave of shimmers for the podium + 5 rows (6 total).
  const shimmers = useRef(Array(6).fill(0).map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const anims = shimmers.map((shimmer, i) => 
      Animated.sequence([
        Animated.delay(i * 100),
        Animated.loop(
          Animated.sequence([
            Animated.timing(shimmer, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.timing(shimmer, { toValue: 0, duration: 800, useNativeDriver: true }),
          ])
        )
      ])
    );
    Animated.parallel(anims).start();
  }, [shimmers]);

  const Bar = ({ w, h, r = 6, mt = 0, shimmer }) => {
    const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });
    return (
      <Animated.View style={{ width: w, height: h, borderRadius: r, backgroundColor: DS.surfaceHigh, opacity, marginTop: mt }} />
    );
  };
  // Mirrors what actually resolves: a podium, then compact rows. It used to draw
  // four tall bordered cards with a stat block — the pre-rebuild layout — so the
  // screen visibly jumped shape the moment the data landed. A skeleton is a
  // promise about layout; this one was making the wrong one.
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
      {/* Podium: three plinths, the middle one taller. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingBottom: 14 }}>
        {[{ av: 44, h: 46 }, { av: 54, h: 68 }, { av: 44, h: 34 }].map((p, i) => (
          <View key={i} style={{ flex: i === 1 ? 1.15 : 1, alignItems: 'center', gap: 5 }}>
            <Bar w={p.av} h={p.av} r={p.av / 2} shimmer={shimmers[0]} />
            <Bar w="70%" h={10} mt={2} shimmer={shimmers[0]} />
            <Bar w="45%" h={13} mt={2} shimmer={shimmers[0]} />
            <Bar w="100%" h={p.h} r={8} mt={3} shimmer={shimmers[0]} />
          </View>
        ))}
      </View>
      {/* Rows below, at the height a real one occupies. */}
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 }}>
          <Bar w={26} h={26} r={13} shimmer={shimmers[i + 1]} />
          <Bar w={34} h={34} r={17} shimmer={shimmers[i + 1]} />
          <View style={{ flex: 1, gap: 6 }}>
            <Bar w="52%" h={13} shimmer={shimmers[i + 1]} />
            <Bar w="34%" h={10} shimmer={shimmers[i + 1]} />
          </View>
          <Bar w={44} h={18} r={5} shimmer={shimmers[i + 1]} />
        </View>
      ))}
    </View>
  );
}















const TABS = [
{ id: 'Players', label: 'Players', icon: 'account' },
{ id: 'Teams', label: 'Teams', icon: 'account-group' }];


function initials(name) {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

// ── Boards ───────────────────────────────────────────────────────────────────
// One "Rankings" screen was really a batting board with a generic name: it
// ranked by runs only, so the league's leading wicket-taker sat at #6 and its
// most economical bowler at #79, even though the card shows a WKTS column.
// Each board picks its own metric, and only shows players who actually did that
// thing — a batting list padded with bowlers who never faced a ball is noise.
//
// `qualify` guards the rate boards. Averages and economy are ratios, so a tiny
// sample produces nonsense standings (185 runs off a single dismissal; a 0.00
// economy from a 3-ball spell). The threshold is surfaced in the UI rather than
// hidden, so the table explains itself.
const PLAYER_BOARDS = [
  { id: 'runs',    label: 'Runs',    icon: 'cricket',
    value: (s) => s.runs || 0, better: 'high',
    qualify: (s) => (s.ballsFaced || 0) > 0 },
  { id: 'wickets', label: 'Wickets', icon: 'weather-windy',
    value: (s) => s.wickets || 0, better: 'high',
    qualify: (s) => (s.ballsBowled || 0) > 0 },
  { id: 'average', label: 'Average', icon: 'numeric',
    value: (s) => s.average || 0, better: 'high',
    qualify: (s) => (s.innings || 0) >= 3, note: 'min 3 innings' },
  { id: 'economy', label: 'Economy', icon: 'lightning-bolt',
    value: (s) => s.economy ?? Infinity, better: 'low',
    qualify: (s) => (s.ballsBowled || 0) >= 12, note: 'min 2 overs' },
  // A rate, so it needs a floor like Average does: 200 off 4 balls is not a
  // strike rate, it's one lucky over.
  { id: 'strikeRate', label: 'Strike rate', icon: 'speedometer',
    value: (s) => s.strikeRate || 0, better: 'high',
    qualify: (s) => (s.ballsFaced || 0) >= 30, note: 'min 30 balls' },
  // A count, not a rate, so no threshold beyond having taken one — a board of
  // players on zero is just the squad list.
  { id: 'catches', label: 'Catches', icon: 'hand-back-right-outline',
    value: (s) => s.catches || 0, better: 'high',
    qualify: (s) => (s.catches || 0) > 0 },
];

const TEAM_BOARDS = [
  // Wins before win rate on purpose: rate alone puts a team that won its only
  // game (100%) above one that went 3-2 across a season — a small-sample
  // artefact, not a league table.
  { id: 'wins',    label: 'Wins',    icon: 'trophy',
    value: (s) => s.wins || 0, better: 'high',
    qualify: (s) => (s.matches || 0) > 0 },
  { id: 'winRate', label: 'Win %',   icon: 'percent',
    value: (s) => s.winRate || 0, better: 'high',
    qualify: (s) => (s.matches || 0) >= 3, note: 'min 3 matches' },
  { id: 'runs',    label: 'Runs',    icon: 'cricket',
    value: (s) => s.totalRuns || 0, better: 'high',
    qualify: (s) => (s.matches || 0) > 0 },
];

// Sort by the board's metric, then by volume so a bigger body of work breaks
// ties, then by name so the order is stable between renders.
// Boards come in two shapes and they are NOT interchangeable. The ones defined
// in this file carry `value: (row) => …`; the per-sport ones from careerStats
// carry `key`/`event` and are read with rankValue(). Reading a local board with
// rankValue gives row[undefined] — 0 for every cricket player, on every board.
const boardValue = (row, board) =>
  typeof board.value === 'function' ? board.value(row) : rankValue(row, board);

const sortFor = (board) => (a, b) => {
  const av = board.value(a), bv = board.value(b);
  const diff = board.better === 'low' ? av - bv : bv - av;
  return diff || (b.matches || 0) - (a.matches || 0) || a.name.localeCompare(b.name);
};


function LeaderPulse({ av }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.6);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 1500 }),
        withTiming(1, { duration: 1500 })
      ),
      -1,
      true
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.2, { duration: 1500 }),
        withTiming(0.6, { duration: 1500 })
      ),
      -1,
      true
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    width: av,
    height: av,
    borderRadius: av / 2,
    backgroundColor: '#fef08a',
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  return <Reanimated.View style={style} />;
}

// Continuous pulsing glow for the #1 headline number
function ShimmerText({ children, style }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500 }),
        withTiming(0, { duration: 1500 })
      ),
      -1,
      true
    );
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], ['#0f4c3a', '#10b981']),
  }));
  return (
    <Reanimated.Text 
      style={[
        style, 
        animStyle, 
        { textShadowColor: 'rgba(16, 185, 129, 0.4)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 }
      ]} 
      numberOfLines={1}
    >
      {children}
    </Reanimated.Text>
  );
}

// ── Podium ───────────────────────────────────────────────────────────────────
// Not a standalone component; completely tied to the internal data shape this screen
// has: the leader raised in the middle, second to the left, third to the right,
// on bars whose heights say the same thing the numbers do.
//
// This replaced a medal-and-crown treatment applied to the rows themselves.
// Gold/silver/bronze on a dark UI reads as a trophy cabinet rather than a live
// table, and it cost every top row extra height inside a list built for density.
function ConfettiParticle({ color, index }) {
  const progress = useSharedValue(0);
  
  useEffect(() => {
    progress.value = withDelay(
      (index % 10) * 40, 
      withTiming(1, { duration: 2500 })
    );
  }, []);

  const style = useAnimatedStyle(() => {
    const angle = (index % 15) * 12 - 90;
    const speed = 150 + (index % 5) * 50;
    
    const rad = angle * Math.PI / 180;
    const dx = Math.sin(rad) * speed * progress.value;
    const dy = -Math.cos(rad) * speed * progress.value + 400 * Math.pow(progress.value, 2);

    return {
      position: 'absolute',
      width: 6, height: 12,
      backgroundColor: color,
      opacity: 1 - Math.pow(progress.value, 4),
      transform: [
        { translateX: dx },
        { translateY: dy },
        { rotate: `${progress.value * 720}deg` },
        { rotateX: `${progress.value * 1080}deg` }
      ]
    };
  });

  return <Reanimated.View style={style} />;
}

function ConfettiCannon() {
  const particles = Array.from({ length: 50 }).map((_, i) => i);
  const colors = ['#0f4c3a', '#fed7aa', '#10b981', '#fbbf24', '#f87171', '#38bdf8'];

  return (
    <View style={{ position: 'absolute', top: 50, left: '50%', zIndex: 100, pointerEvents: 'none' }}>
      {particles.map((i) => (
        <ConfettiParticle key={i} color={colors[i % colors.length]} index={i} />
      ))}
    </View>
  );
}

// A podium spends that height once, above the list, and every row below stays
// the same compact shape.
function LevitatingAvatar({ place, children, style }) {
  const floatProgress = useSharedValue(0);
  const dropY = useSharedValue(-600);

  useEffect(() => {
    const dropDelay = place === 1 ? 300 : place === 2 ? 450 : 600;
    setTimeout(() => {
      dropY.value = withSpring(0, { damping: 12, stiffness: 120 });
    }, dropDelay);

    const floatDelay = place === 1 ? 0 : place === 2 ? 1000 : 2000;
    setTimeout(() => {
      floatProgress.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 2500 }),
          withTiming(0, { duration: 2500 })
        ),
        -1,
        true
      );
    }, dropDelay + 600);
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: dropY.value },
      { translateY: floatProgress.value * -6 }
    ]
  }));

  return <Reanimated.View style={[style, animStyle]}>{children}</Reanimated.View>;
}

const DynamicIsland = React.forwardRef((props, ref) => {
  const [msg, setMsg] = useState('');
  const [icon, setIcon] = useState('check-circle');
  const translateY = useSharedValue(-150);
  const scale = useSharedValue(0.5);
  const DS = useTheme().colors;

  React.useImperativeHandle(ref, () => ({
    show: (text, iName = 'check-circle') => {
      setMsg(text);
      setIcon(iName);
      translateY.value = withSpring(10, { damping: 14, stiffness: 120 });
      scale.value = withSpring(1, { damping: 14, stiffness: 120 });
      
      setTimeout(() => {
        translateY.value = withTiming(-150, { duration: 300 });
        scale.value = withTiming(0.5, { duration: 300 });
      }, 2500);
    }
  }));

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }]
  }));

  return (
    <Reanimated.View style={[
      { position: 'absolute', top: 30, alignSelf: 'center', backgroundColor: '#000', borderRadius: 30, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, zIndex: 9999 },
      style
    ]} pointerEvents="none">
      <Icon name={icon} size={20} color={DS.lime} />
      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{msg}</Text>
    </Reanimated.View>
  );
});

function Podium({ rows, board, myId, onPress, styles, DS }) {
  if (rows.length < 3) return null;
  const [first, second, third] = rows;
  // Visual order is 2 · 1 · 3 — the leader belongs in the middle, not the left.
  const order = [
    { p: second, place: 2, h: 46, av: 44, val: 15 },
    { p: first,  place: 1, h: 68, av: 54, val: 19 },
    { p: third,  place: 3, h: 34, av: 44, val: 15 },
  ];
  return (
    <View style={styles.podium}>
      {order.map(({ p, place, h, av, val }) => (
        <Reanimated.View
          key={p.id}
          entering={SlideInDown.springify().damping(15).delay(place === 1 ? 300 : place === 2 ? 0 : 150)}
          style={[styles.podiumCol, place === 1 && styles.podiumColLead]}
        >
          <AnimatedPressable
            style={{ width: '100%', alignItems: 'center' }}
            contentStyle={{ alignItems: 'center', gap: 4 }}
            activeOpacity={0.8}
            scaleTo={0.92}
            onPress={() => onPress(p)}>
            <LevitatingAvatar place={place} style={[styles.avatarGlow, place === 1 && styles.avatarGlowLead]}>
            {place === 1 && <LeaderPulse av={av} />}
            {p.avatarUrl ? (
              <Image source={{ uri: p.avatarUrl }} style={{ width: av, height: av, borderRadius: av / 2, backgroundColor: DS.surfaceHighest }} />
            ) : (
              <HexAvatar round size={av} color={place === 1 ? '#fef08a' : place === 2 ? '#e2e8f0' : '#fed7aa'}>
                <Text style={[styles.avatarText, place === 1 && { color: '#854d0e', fontSize: 15 }]}>
                  {initials(p.name)}
                </Text>
              </HexAvatar>
            )}
          </LevitatingAvatar>
          <Text style={[styles.podiumName, place === 1 && styles.podiumNameLead]} numberOfLines={1}>
            {p.name}{p.id === myId ? ' · You' : ''}
          </Text>
          {place === 1 ? (
            <ShimmerText style={[styles.podiumVal, { fontSize: val }]}>
              {boardValue(p, board)}
            </ShimmerText>
          ) : (
            <Text style={[styles.podiumVal, { fontSize: val }]} numberOfLines={1}>
              {boardValue(p, board)}
            </Text>
          )}
          {/* The bar is the ranking, drawn. Its height is the whole point, so it
              carries the place number rather than a separate badge. */}
          <View style={[styles.podiumBar, { height: h }, styles['podiumBar' + place]]}>
            <Text style={[styles.podiumPlace, styles['podiumPlace' + place]]}>
              {place === 1 ? '1st' : place === 2 ? '2nd' : '3rd'}
            </Text>
          </View>
          </AnimatedPressable>
        </Reanimated.View>
      ))}
    </View>
  );
}

// ── One competitor = one row ─────────────────────────────────────────────────
// Was a tall card carrying a five-column stat block, so three fitted a screen
// and the number the board actually ranks by was one of five equal-weight
// figures. Same fix as the Scout board: identity on the left, the ranked value
// alone on the right, everything else demoted to a meta line.
function RankRow({ item, rank, board, cols, isMe, isTeam, onPress, onDoubleTapStar }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);

  // The figure this board sorts on — the reason the row is where it is.
  const headline = boardValue(item, board);
  // Matches leads: it's the sample size behind every other figure, and it went
  // missing when the tall card's "N matches" subtitle became this row.
  const played = `${item.matches || 0} ${(item.matches || 0) === 1 ? 'match' : 'matches'}`;
  const meta = isTeam
    ? [item.city, played, `${item.wins || 0}W`, `${item.losses || 0}L`].filter(Boolean).join(' · ')
    : [played, ...(cols || [
        { label: 'runs', value: (item.runs || 0).toLocaleString() },
        { label: 'avg', value: item.average },
        { label: 'SR', value: item.strikeRate },
        { label: 'wkts', value: item.wickets },
      ]).map((c) => `${c.value} ${c.label}`)].join(' · ');

  const starScale = useSharedValue(0);
  const starOpacity = useSharedValue(0);
  
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onStart(() => {
      'worklet';
      starScale.value = 0;
      starOpacity.value = 1;
      starScale.value = withSpring(1.5, { damping: 10, stiffness: 200 }, () => {
        starOpacity.value = withTiming(0, { duration: 200 });
      });
      if (onDoubleTapStar) {
        runOnJS(onDoubleTapStar)();
      }
    });

  const starStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    alignSelf: 'center',
    top: '20%',
    zIndex: 100,
    opacity: starOpacity.value,
    transform: [{ scale: starScale.value }],
  }));

  return (
    <GestureDetector gesture={doubleTap}>
      <Animated.View>
        <AnimatedPressable
          activeOpacity={0.75}
          onPress={onPress}
          style={[styles.row, isMe && styles.rowMe]}
          contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Reanimated.View style={starStyle} pointerEvents="none">
            <Icon name="star" size={60} color="#fbbf24" />
          </Reanimated.View>
      <View style={styles.rankBox}>
        <Text style={styles.rankNum}>{rank + 1}</Text>
      </View>

      {item.avatarUrl ? (
        <Image source={{ uri: item.avatarUrl }} style={styles.avatarImg} />
      ) : (
        <HexAvatar round size={34} color={DS.surfaceHighest}>
          <Text style={styles.avatarText}>{initials(item.name)}</Text>
        </HexAvatar>
      )}

      <View style={styles.rowMain}>
        <Text style={styles.rowName} numberOfLines={1}>
          {item.name}{isMe ? '  ·  You' : ''}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>{meta}</Text>
      </View>

      <View style={styles.headlineBox}>
        <Text style={styles.headlineVal} numberOfLines={1}>{headline}</Text>
        <Text style={styles.headlineLbl} numberOfLines={1}>{board.label}</Text>
      </View>

      <Icon name="chevron-right" size={18} color={DS.textMuted} />
    </AnimatedPressable>
      </Animated.View>
    </GestureDetector>
  );
}

export default function StatisticsScreen({ navigation, inline, pagerGesture }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);const hideTabBar = useHideTabBarOnScroll();const tabClear = useTabBarClearance();
  const [tab, setTab] = useState('Players');
  // Cricket keeps its Runs/Wickets/Economy boards; other sports rank on their
  // own event tallies (goals, cards …) so the tab labels match the sport.
  const sportId = getSelectedSport().sport?.id || 'cricket';
  const sportBoards = getRankingBoards(sportId);
  const activeBoards = sportBoards.length ? sportBoards : PLAYER_BOARDS;
  const [boardId, setBoardId] = useState(activeBoards[0].id);
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const islandRef = useRef(null);
  const triggerIsland = () => islandRef.current?.show('Starred player', 'star');
  // ── Board-chip row: self-driven horizontal scroller (same as Scout's filters) ──
  // A dedicated Pan drives an Animated.ScrollView via Reanimated scrollTo and
  // blocks the Pavilion pager, so a horizontal drag scrolls the boards instead of
  // paging tabs. (The row overflows once there are 4+ boards.)
  const boardScroll = useAnimatedRef();
  const boardOffset = useSharedValue(0);
  const boardStart = useSharedValue(0);
  const boardMax = useSharedValue(0);
  const boardViewW = useRef(0);
  const boardContentW = useRef(0);
  const recomputeBoardMax = () => { boardMax.value = Math.max(0, boardContentW.current - boardViewW.current); };
  const boardPan = useMemo(() => {
    const g = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .onBegin(() => { boardStart.value = boardOffset.value; })
      .onUpdate((e) => {
        let next = boardStart.value - e.translationX;
        if (next < 0) next = 0; else if (next > boardMax.value) next = boardMax.value;
        boardOffset.value = next;
        scrollTo(boardScroll, next, 0, false);
      });
    return pagerGesture ? g.blocksExternalGesture(pagerGesture) : g;
  }, [pagerGesture, boardScroll, boardOffset, boardStart, boardMax]);
  const scrollBoardTo = (x) => { boardOffset.value = x; boardScroll.current?.scrollTo?.({ x, animated: true }); };
  // Each chip reports its own x, so scrolling one into view doesn't depend on
  // every chip being the same width (they aren't — "Runs" vs "Strike rate").
  const chipX = useRef({});
  const scrollChipIntoView = (idx) => {
    const x = chipX.current[idx];
    if (x == null) return;
    scrollBoardTo(Math.max(0, x - 40));
  };
  // "Find me" plumbing: scroll to the logged-in player's row on the board.
  const meUser = useCurrentUser();
  const myId = meUser?.id;
  const scrollRef = useRef(null);
  const myRowY = useRef(0);

  useLayoutEffect(() => {
    if (!inline) {
      // Own hero below. The navigator's header also sat above it titled
      // "Statistics" while the hero said "Rankings" — two stacked bars naming
      // the same screen differently.
      navigation?.setOptions({ headerShown: false });
    }
  }, [navigation, inline]);

  const fetchData = useCallback(async () => {
    const _sport = getSelectedSport().sport?.id;   // rankings are per-sport
    // Cricket ranks on its ball-by-ball derived stats; every other sport ranks
    // on SportEvent tallies, which getPlayers() doesn't carry.
    const isCricket = (_sport || 'cricket') === 'cricket';
    const [pr, tr] = await Promise.all([
      isCricket ? legendsApi.getPlayers({ sport: _sport }) : legendsApi.getLeaderboard(_sport),
      legendsApi.getTeams(_sport),
    ]);
    // Default every stat to 0 — a player/team with no stored stats used to crash
    // the card (e.g. `undefined.toLocaleString()`).
    setPlayers((pr?.data || []).map((p) => ({
      id: p.id, name: p.name,
      // From the linked user account; players themselves have no photo column.
      avatarUrl: p.user?.avatarUrl || p.avatarUrl || null,
      // Carried so PlayerInsights can paint its hero immediately. Without these
      // it fell back to a placeholder "Cricketer" with no team, then corrected
      // once two API calls returned — which defeats passing the row at all.
      role: p.role || '', team: p.team?.name || '', sport: p.sport || undefined,
      matches: 0, runs: 0, average: 0, strikeRate: 0, centuries: 0, wickets: 0, catches: 0,
      ...(p.stats || {}),
      // leaderboard rows carry these instead of a stats blob
      ...(p.matches != null ? { matches: p.matches } : {}),
      ...(p.eventTotals ? { eventTotals: p.eventTotals } : {}),
    })));
    setTeams((tr?.data || []).map((t) => ({
      id: t.id, name: t.name,
      // Teams carry a logo; the row and podium already render item.avatarUrl for
      // players, so mapping it across lights both up with no other change. Teams
      // were falling back to initials even where a logo was set.
      avatarUrl: t.logoUrl || null,
      // City disambiguates: two Team rows genuinely share the name "Mumbai
      // Mavericks" on this data, and a leaderboard listing both was unreadable.
      city: t.city || '',
      matches: 0, wins: 0, losses: 0, totalRuns: 0, totalWickets: 0, winRate: 0,
      ...(t.stats || {}),
    })));
  }, []);

  // Reload when Pavilion regains focus, but only if what's on screen has gone
  // stale. Mount-only meant scoring a match and coming back showed the old
  // standings; an unguarded focus reload is the other extreme — this board
  // pulls 500 players and makes the server aggregate every ball behind them,
  // and all three Pavilion tabs would refire together on every return.
  const lastLoadedAt = useRef(0);
  const STALE_MS = 60000;
  const scrollY = useRef(new Animated.Value(0)).current;

  useFocusEffect(useCallback(() => {
    let alive = true;
    const fresh = Date.now() - lastLoadedAt.current < STALE_MS;
    if (fresh) return () => { alive = false; };
    setLoading(true);
    fetchData().finally(() => {
      if (!alive) return;
      lastLoadedAt.current = Date.now();
      setLoading(false);
    });
    return () => { alive = false; };
  }, [fetchData]));

  const onRefresh = useCallback(() => {
    haptic.impact();
    setRefreshing(true);
    fetchData().finally(() => { haptic.success(); lastLoadedAt.current = Date.now(); setRefreshing(false); });
  }, [fetchData]);

  // Qualify → rank → stamp the standing → then filter by search. The standing is
  // fixed before searching, so looking up a name shows that player's real rank
  // rather than renumbering them to #1.
  const boards = tab === 'Players' ? activeBoards : TEAM_BOARDS;
  const board = boards.find((b) => b.id === boardId) || boards[0];
  const rawData = tab === 'Players' ? players : teams;
  const ranked = rawData
    .filter(board.qualify)
    .sort(sortFor(board))
    .map((item, i) => ({ ...item, standing: i }));
  const data = ranked.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
  // The podium is the top three of the BOARD, so it only shows on an unfiltered
  // view — searching returns matches, not standings, and a two-result search has
  // no podium to draw.
  const showPodium = !searchQuery.trim() && data.length >= 3;
  const listRows = showPodium ? data.slice(3) : data;
  // Where the logged-in player sits on the current board (pre-search, so it's the
  // real standing). Powers the "You're #N — find me" banner and row highlight.
  const myStanding = tab === 'Players' && myId ? ranked.find((r) => r.id === myId) : null;
  // Both destinations already exist and take exactly what a row holds, so this
  // hands off rather than duplicating a stats screen inside a sheet. The player
  // object rides along so Insights can paint before its fetch returns.
  const openDetail = (item) => {
    if (tab === 'Players') navigation?.navigate('PlayerInsights', {
      playerId: item.id,
      player: item,
      // Where they sit on the board you tapped from, so the profile can say so
      // instead of losing the context that made you open it.
      standing: item.standing + 1,
      boardLabel: board.label,
    });
    else navigation?.navigate('TeamProfile', { teamId: item.id });
  };

  const renderCard = ({ item }) => (
    <RankRow
      onPress={() => openDetail(item)}
      onDoubleTapStar={triggerIsland}
      item={item}
      rank={item.standing}
      board={board}
      isMe={item.id === myId}
      isTeam={tab !== 'Players'}
      // Non-cricket: one entry per ranking board (Goals, Yellows …) plus
      // matches, instead of cricket's runs/avg/SR/wkts.
      cols={tab === 'Players' && sportBoards.length ? [
        { label: 'matches', value: item.matches ?? 0 },
        ...sportBoards.map((b) => ({ label: b.label.toLowerCase(), value: rankValue(item, b) })),
      ] : null} />
  );

  const scrollToMe = () => scrollRef.current?.scrollTo({ y: Math.max(0, myRowY.current - 12), animated: true });

  const handleTabChange = (newTab) => {
    if (tab === newTab) return;
    haptic.tick();
    const oldIdx = ['Players', 'Teams'].indexOf(tab);
    const newIdx = ['Players', 'Teams'].indexOf(newTab);
    swipeDir.current = newIdx > oldIdx ? 1 : -1;
    setTab(newTab);
    setBoardId((newTab === 'Players' ? activeBoards : TEAM_BOARDS)[0].id);
    scrollBoardTo(0);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleBoardChange = (id) => {
    if (id === boardId) return;
    haptic.tick();
    const idx = boards.findIndex(b => b.id === id);
    const currIdx = boards.findIndex(b => b.id === boardId);
    swipeDir.current = idx > currIdx ? 1 : -1;
    setBoardId(id);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const swipeDir = useRef(1);

  const stepBoard = useCallback((dir) => {
    const idx = boards.findIndex(b => b.id === boardId);
    if (idx === -1) return;
    const next = idx + dir;
    if (next < 0 || next >= boards.length) return;
    swipeDir.current = dir;
    setBoardId(boards[next].id);
    scrollChipIntoView(next);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [boards, boardId, scrollChipIntoView]);

  // Was a PanResponder claiming at 18px and committing at 45, with no velocity
  // path — its own thresholds, unlike the four screens that step a filter with
  // useFilterSwipe. Same hook now, so a swipe feels the same wherever you are.
  const boardIds = useMemo(() => boards.map((b) => b.id), [boards]);
  const swipe = useFilterSwipe(boardIds, boardId, (id) => {
    stepBoard(boardIds.indexOf(id) > boardIds.indexOf(boardId) ? 1 : -1);
  });
  // Dragging the chip row scrolls the chips and nothing else. Without this the
  // same drag also steps the board underneath it — the row would scroll AND the
  // leaderboard would change.
  const boardPanBlocking = useMemo(() => boardPan.blocksExternalGesture(swipe), [boardPan, swipe]);

  return (
    <View style={styles.container}>
      <AmbientBackground />
      {/* Hero */}
      {!inline && (
        <View style={styles.hero}>
          <Animated.View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, transform: [{ translateY: scrollY.interpolate({ inputRange: [-300, 0, 300], outputRange: [-100, 0, 100], extrapolate: 'clamp' }) }] }}>
            {/* No back affordance of its own — it leaned on the navigator's, so
                hiding that without this would strand the standalone route. */}
            <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn} hitSlop={8}>
              <Icon name="arrow-left" size={22} color={DS.textPrimary} />
            </TouchableOpacity>
            <Icon name="chart-bar" size={22} color={DS.lime} />
            <Text style={styles.heroTitle}>Rankings</Text>
          </Animated.View>
        </View>
      )}

      {loading ? (
        <View style={styles.list}>
          {/* Same toggle while loading, so the header doesn't jump when rows land. */}
          <View style={[styles.controlRow, { marginBottom: 12 }]}>
            <View style={styles.segment}>
              {TABS.map((t) => {
                const on = tab === t.id;
                return (
                  <TouchableOpacity key={t.id} style={[styles.segBtn, on && styles.segBtnOn]}
                    onPress={() => handleTabChange(t.id)} activeOpacity={0.85}>
                    <Icon name={t.icon} size={14} color={on ? '#0f4c3a' : '#475569'} />
                    <Text style={[styles.segText, on && styles.segTextOn]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <StatSkeleton DS={DS} />
        </View>
      ) : (
        <GestureDetector gesture={swipe}>
        <View style={{ flex: 1 }}>
          {/* A vertical ScrollView (not a FlatList): a VirtualizedList grabs the
              horizontal drag and blocks the Pavilion pager's swipe; 45 rows don't
              need windowing, and this lets a swipe directional-lock cleanly. */}
          <Animated.ScrollView
            ref={scrollRef}
            scrollEventThrottle={16}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: true, listener: hideTabBar.onScroll }
            )}
            onScrollEndDrag={hideTabBar.onScrollEndDrag}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} colors={[DS.lime]} />}
            contentContainerStyle={[styles.list, { paddingBottom: tabClear }]}>
            {/* Where you stand. "Find me" jumps to your row on a long board —
                but only when there IS a row to jump to: on the podium you're
                already the first thing on screen, and myRowY is set by the list
                row's onLayout, which never fires for someone in the top three.
                Without this the button pointed at y=0 and did nothing. */}
            {myStanding && (() => {
              const onPodium = showPodium && myStanding.standing < 3;
              const Wrap = onPodium ? View : TouchableOpacity;
              return (
                <Wrap style={styles.findMe} {...(onPodium ? {} : { onPress: scrollToMe, activeOpacity: 0.85 })}>
                  <Icon name={onPodium ? 'trophy-variant' : 'crosshairs-gps'} size={16} color={DS.onLime} />
                  <Text style={styles.findMeText}>
                    You're #{myStanding.standing + 1} by {board.label.toLowerCase()}
                  </Text>
                  {!onPodium && <Text style={styles.findMeJump}>Find me</Text>}
                </Wrap>
              );
            })()}
            <View>
              {/* One row for both "what am I ranking" and "find someone in it".
                  These were two stacked full-width controls above a third row of
                  board chips — three bands of chrome over a list whose whole
                  point is now density. Search collapses to its icon until it's
                  wanted, and takes the row when it is. */}
              <Reanimated.View style={styles.controlRow} layout={LinearTransition.springify()}>
                {!searchOpen && (
                  <Reanimated.View style={styles.segment} exiting={SlideOutRight.duration(150)}>
                    {TABS.map((t) => {
                      const on = tab === t.id;
                      return (
                        <TouchableOpacity
                          key={t.id}
                          style={[styles.segBtn, on && styles.segBtnOn]}
                          onPress={() => handleTabChange(t.id)}
                          activeOpacity={0.85}>
                          <Icon name={t.icon} size={14} color={on ? '#0f4c3a' : '#475569'} />
                          <Text style={[styles.segText, on && styles.segTextOn]}>{t.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </Reanimated.View>
                )}

                {searchOpen ? (
                  <Reanimated.View style={styles.searchWrap} entering={SlideInRight.springify()} exiting={SlideOutRight.duration(150)}>
                    <Icon name="magnify" size={18} color={DS.lime} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder={`Search ${tab.toLowerCase()}`}
                      placeholderTextColor={DS.textMuted}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      autoFocus
                      returnKeyType="search"
                    />
                    <TouchableOpacity
                      onPress={() => { setSearchQuery(''); setSearchOpen(false); }}
                      hitSlop={10}>
                      <Icon name="close" size={18} color={DS.textMuted} />
                    </TouchableOpacity>
                  </Reanimated.View>
                ) : (
                  <TouchableOpacity style={styles.searchBtn} onPress={() => setSearchOpen(true)} activeOpacity={0.85}>
                    <Icon name="magnify" size={19} color={DS.textVariant} />
                  </TouchableOpacity>
                )}
              </Reanimated.View>

              {/* Board selector — what this leaderboard is actually ranking. Drag
                  to scroll (self-driven, blocks the pager); tap scrolls into view. */}
              <GestureDetector gesture={boardPanBlocking}>
                <Reanimated.ScrollView horizontal scrollEnabled={false}
                  ref={boardScroll} showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.boardBar}
                  onLayout={(e) => { boardViewW.current = e.nativeEvent.layout.width; recomputeBoardMax(); }}
                  onContentSizeChange={(w) => { boardContentW.current = w; recomputeBoardMax(); }}>
                  {boards.map((b, i) => {
                    const on = b.id === board.id;
                    return (
                      <TouchableOpacity key={b.id} activeOpacity={0.85}
                        style={[styles.boardChip, on && styles.boardChipActive]}
                        // Measured, not a fixed 92px guess: "Runs" and "Strike rate"
                        // are nowhere near the same width, so the selected chip
                        // landed off-centre or clipped.
                        onLayout={(e) => { chipX.current[i] = e.nativeEvent.layout.x; }}
                        onPress={() => { handleBoardChange(b.id); scrollChipIntoView(i); }}>
                        <Icon name={b.icon} size={13} color={on ? '#0f4c3a' : '#475569'} />
                        <Text style={[styles.boardChipText, on && styles.boardChipTextActive]}>{b.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </Reanimated.ScrollView>
              </GestureDetector>
              {/* State the qualification instead of quietly dropping people */}
              {/* The threshold is the part worth stating; a tally isn't, on a
                  board that could hold six figures. */}
              <Text style={styles.boardMeta}>
                Ranked by {board.label.toLowerCase()}
                {board.note ? ` · ${board.note}` : ''}
              </Text>
            </View>
            {/* Only the RESULTS animate on a tab or board change. This whole
                ScrollView used to sit inside one opacity value, so tapping
                Players/Teams or a board chip faded out the control you had just
                pressed along with everything else — 100ms out, a state change in
                the dark, 150ms back. The controls hold still now; keying on
                tab+board remounts just the results, so they fade in while the
                chips stay put and the tap reads as instant. */}
            <Reanimated.View key={`${tab}:${board.id}`} entering={swipeDir.current === 1 ? SlideInRight.duration(200).withInitialValues({ transform: [{ translateX: 50 }] }) : SlideInLeft.duration(200).withInitialValues({ transform: [{ translateX: -50 }] })}>
              {/* Podium only when the board is unsearched and deep enough for one —
                  a filtered result of two isn't a podium, and mid-search the top
                  three of your matches aren't the top three of anything. */}
              {showPodium && (
                <Animated.View style={{ transform: [
                  { translateY: scrollY.interpolate({ inputRange: [-150, 0, 100], outputRange: [60, 0, 45], extrapolate: 'clamp' }) },
                  { scale: scrollY.interpolate({ inputRange: [-150, 0], outputRange: [1.3, 1], extrapolateRight: 'clamp' }) }
                ] }}>
                  {myStanding && myStanding.standing === 0 && <ConfettiCannon />}
                  <Podium rows={data.slice(0, 3)} board={board} myId={myId}
                    onPress={openDetail} styles={styles} DS={DS} />
                </Animated.View>
              )}

              {data.length === 0 ? (
                <View style={styles.empty}>
                  <View style={styles.emptyBox}>
                    <View style={styles.emptyIconWrap}>
                      <Icon name={board.icon || 'chart-bar'} size={32} color={'#0f4c3a'} />
                    </View>
                    <Text style={styles.emptyTitle}>
                      {searchQuery.trim()
                        ? 'No one matches that search'
                        : `No ${tab.toLowerCase()} ranked by ${board.label.toLowerCase()} yet`}
                    </Text>
                    <Text style={styles.emptySub}>
                      {searchQuery.trim()
                        ? 'Try a shorter search, or clear it.'
                        : board.note
                          ? `This board needs ${board.note} — nobody has reached that yet.`
                          : 'Play a match and the board fills in.'}
                    </Text>
                  </View>
                </View>
              ) : (
                listRows.map((item, i) => {
                  const sep = i < listRows.length - 1 ? <View style={styles.sep} /> : null;
                  
                  const rowContent = (
                    <Reanimated.View entering={FadeInDown.duration(300).delay(i < 8 ? i * 35 : 0)}>
                      {renderCard({ item })}
                      {sep}
                    </Reanimated.View>
                  );

                  return item.id === myId ? (
                    <View key={item.id} onLayout={(e) => { myRowY.current = e.nativeEvent.layout.y; }}>
                      {rowContent}
                    </View>
                  ) : (
                    <Fragment key={item.id}>
                      {rowContent}
                    </Fragment>
                  );
                })
              )}
            </Reanimated.View>
          </Animated.ScrollView>
        </View>
        </GestureDetector>
      )}
      <DynamicIsland ref={islandRef} />
    </View>);

}

const makeStyles = (DS) => StyleSheet.create({
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },

  /* ── Podium: the top three, above the list ── */
  podium: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24,
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0', marginBottom: 16,
  },
  podiumCol: { flex: 1, alignItems: 'center', gap: 4, maxWidth: 100 },
  // The leader gets the width as well as the height.
  podiumColLead: { flex: 1.2, maxWidth: 120, zIndex: 10 },
  podiumName: { fontSize: 12, fontWeight: '500', color: '#475569', maxWidth: '100%', textAlign: 'center' },
  podiumNameLead: { fontSize: 14, color: '#191c1d', fontWeight: 'bold' },
  podiumVal: { fontSize: 20, fontWeight: 'bold', color: '#0f4c3a' },
  podiumValLead: { fontSize: 22 },
  avatarGlow: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2, marginBottom: 2 },
  avatarGlowLead: { shadowColor: '#fef08a', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 8, elevation: 4 },
  
  podiumBar: {
    alignSelf: 'stretch', marginTop: 4,
    borderTopLeftRadius: 12, borderTopRightRadius: 12,
    borderTopWidth: 2, borderLeftWidth: 1, borderRightWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  podiumBar1: { backgroundColor: '#fef9c3', borderColor: '#fef08a' },
  podiumPlace1: { color: '#ca8a04', fontSize: 20, fontWeight: '800' },

  podiumBar2: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  podiumPlace2: { color: '#64748b', fontSize: 18, fontWeight: '700' },

  podiumBar3: { backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
  podiumPlace3: { color: '#ea580c', fontSize: 18, fontWeight: '700' },

  /* ── Compact rank rows (replaced the tall stat cards) ── */
  row: { 
    flexDirection: 'row', alignItems: 'center', gap: 16, padding: 12, 
    backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', 
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 
  },
  /* Top three: taller, brighter, and carrying a medal. The board's whole point
     is who's winning, and every row looked identical to every other. */
  // The logged-in player's own row, so "Find me" lands somewhere obvious.
  rowMe: { backgroundColor: '#f0fdf4', borderColor: '#d1fae5' },
  sep: { display: 'none' },
  rankBox: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: '#cbd5e1',
    alignItems: 'center', justifyContent: 'center',
  },
  rankNum: { fontSize: 12, fontWeight: '600', color: '#475569' },
  // Dark ink on gold/silver/bronze — white on these fails contrast badly.
  // Two backgrounds, two inks. onLime is white, which is right on the leader's
  // lime disc (9.3:1) and effectively invisible on the grey one every other
  // avatar uses (1.2:1) — "SK", "HB", "SC" were unreadable on device. The
  // shared PlayerAvatar component already got this right; only this screen's
  // HexAvatar usage hardcoded the white.
  avatarText: { fontSize: 14, fontWeight: '600', color: '#0f4c3a' },
  avatarTextOnLime: { color: '#ffffff' },
  avatarImg: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: DS.surfaceHighest,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { fontSize: 14, fontWeight: '600', color: '#191c1d' },
  rowMeta: { fontSize: 12, color: '#475569' },
  // The one figure this board sorts on, given the weight it earns.
  headlineBox: { alignItems: 'flex-end', minWidth: 56 },
  headlineVal: { fontSize: 18, fontWeight: 'bold', color: '#0f4c3a' },
  headlineLbl: { fontSize: 10, fontWeight: '500', color: '#475569', letterSpacing: 0.5, textTransform: 'uppercase' },

  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 16 },
  emptyBox: { 
    width: '100%', alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24,
    backgroundColor: '#ffffff', borderRadius: 24, borderWidth: 1.5, borderColor: '#e2e8f0', borderStyle: 'dashed' 
  },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#191c1d', marginTop: 12, textAlign: 'center' },
  emptySub: { fontSize: 13.5, color: '#475569', marginTop: 6, textAlign: 'center', lineHeight: 20 },

  container: { flex: 1, backgroundColor: DS.bg },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.85)', paddingTop: 52, paddingBottom: 12, paddingHorizontal: 16
  },
  heroTitle: { fontSize: 24, fontWeight: '900', color: DS.textPrimary, letterSpacing: 0.5 },

  /* One control row: Players/Teams on the left, search on the right. */
  controlRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  segment: {
    flex: 1, flexDirection: 'row', gap: 8,
  },
  segBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 10, borderRadius: 999, backgroundColor: '#f1f5f9',
  },
  segBtnOn: { backgroundColor: '#e6f4ea' },
  segText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  segTextOn: { color: '#0f4c3a', fontWeight: 'bold' },
  searchBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.faint,
  },

  // Board selector
  boardBar: { paddingHorizontal: 16, gap: 24, paddingBottom: 0, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', marginBottom: 16 },
  // L3 filter chips: ghost (transparent + border) when off, bright-green fill when
  // selected — the one place the green accent gets to pop, below the near-black L1/L2.
  boardChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  boardChipActive: { borderBottomColor: '#0f4c3a' },
  boardChipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  boardChipTextActive: { color: '#0f4c3a', fontWeight: 'bold' },
  boardMeta: { fontSize: 14, color: '#475569', marginHorizontal: 16, marginBottom: 16 },

  /* Search */
  // Sits in the control row now (was a standalone full-width band with its own
  // margins), so it has to fill the row rather than impose its own spacing.
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 40,
    backgroundColor: DS.surfaceHigh, borderRadius: 999, paddingHorizontal: 14,
    borderWidth: 1, borderColor: DS.lime,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600', color: DS.textPrimary, padding: 0 },

  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },


  findMe: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.lime, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
  },
  findMeText: { flex: 1, fontSize: 13, fontWeight: '800', color: DS.onLime, letterSpacing: 0.2 },
  findMeJump: { fontSize: 12, fontWeight: '800', color: DS.onLime, textDecorationLine: 'underline' },



});