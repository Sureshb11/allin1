import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Modal, LayoutAnimation } from 'react-native';
import Reanimated, { ZoomIn, SlideInRight, SlideInLeft, useSharedValue, useAnimatedStyle, useAnimatedRef, scrollTo, withTiming, withSpring, interpolate, LinearTransition } from 'react-native-reanimated';
import Svg, { Polyline, Polygon, Circle, Line, Text as SvgText, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useFilterSwipe } from '../utils/useFilterSwipe';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { getSport } from '../sports';
import { getCareerPanels, readStat } from '../sports/careerStats';
import { haptic } from '../utils/haptics';

// One career, drawn one way.
//
// This is the body of "My Stats", lifted out so that tapping a player in
// Rankings shows the same thing about them. That screen used to draw its own:
// colour-tinted bento tiles in three sections, off a separate endpoint with its
// own cricket maths — so the same career looked different and READ different
// depending on which way you came at it. One component, one payload
// (backend lib/playerCareer.js), one answer.
//
// Feed it the `stats` object from /users/me/stats or /players/:id/career.

// ── The honours cabinet ──────────────────────────────────────────────────────
// The five match awards the scorer's post-match popup has always handed out
// (backend lib/mvp.js) plus the four series ones, in the order they're worth
// bragging about. Icons match the popup, so an award looks the same the day it's
// won and every day after. `major` = a tournament honour: filled, not outlined.
const AWARD_KINDS = [
  { key: 'series',        label: 'Series',       icon: 'trophy-variant',   major: true },
  { key: 'motm',          label: 'MOM',          icon: 'star-four-points' },
  { key: 'fighter',       label: 'Fighter',      icon: 'arm-flex' },
  { key: 'batter',        label: 'Best Bat',     icon: 'cricket' },
  { key: 'bowler',        label: 'Best Bowl',    icon: 'bowling' },
  { key: 'fielder',       label: 'Best Field',   icon: 'hand-back-right' },
  { key: 'seriesBatter',  label: 'Series Bat',   icon: 'cricket',          major: true },
  { key: 'seriesBowler',  label: 'Series Bowl',  icon: 'bowling',          major: true },
  { key: 'seriesFielder', label: 'Series Field', icon: 'hand-back-right',  major: true },
];
const AWARD_ICON = Object.fromEntries(AWARD_KINDS.map((a) => [a.key, a.icon]));
const AWARD_NAME = {
  motm: 'Man of the Match', fighter: 'Fighter of the Match',
  batter: 'Best Batter', bowler: 'Best Bowler', fielder: 'Best Fielder',
};

// The flipped face of a stat tile: deep pitch green, the app's gold on it.
// Deliberately literal rather than themed — the tokens this used to read
// (limeDark for the fill, limeBright for the label) are the SAME colour in the
// light theme, which is how a flipped tile ended up with an invisible label.
// 8.70:1, AAA at this size, and identical in both themes.
const FLIP_BG = '#03301F';
const FLIP_FG = '#FBBF24';

// 1,284 reads faster than 1284 in a table of career totals.
const group = (v) => (typeof v === 'number' && Number.isInteger(v) && Math.abs(v) >= 1000)
  ? String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  : v;

function Particle({ angle, speed, color }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 600 });
  }, []);
  const style = useAnimatedStyle(() => {
    const d = progress.value * speed;
    return {
      position: 'absolute',
      width: 4, height: 4, borderRadius: 2, backgroundColor: color || '#fbbf24',
      top: '50%', left: '50%',
      transform: [
        { translateX: Math.cos(angle) * d },
        { translateY: Math.sin(angle) * d },
        { scale: 1 - progress.value }
      ],
      opacity: 1 - progress.value
    };
  });
  return <Reanimated.View style={style} />;
}

function ParticleBurst({ active, color }) {
  const [particles, setParticles] = useState([]);
  useEffect(() => {
    if (active) {
      setParticles(Array.from({ length: 8 }).map((_, i) => ({
        id: i,
        angle: (i / 8) * Math.PI * 2,
        speed: 25 + Math.random() * 25
      })));
    }
  }, [active]);

  if (!active || particles.length === 0) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
      {particles.map((p) => <Particle key={p.id} {...p} color={color} />)}
    </View>
  );
}

function CountingText({ value, style, burstOnFinish, ...props }) {
  const [display, setDisplay] = useState(0);
  const [finished, setFinished] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const DS = useTheme().colors;

  useEffect(() => {
    if (typeof value !== 'number' || isNaN(value)) {
      setDisplay(value);
      return;
    }
    setFinished(false);
    anim.setValue(0);
    anim.addListener((v) => setDisplay(Math.round(v.value)));
    Animated.timing(anim, { toValue: value, duration: 800, useNativeDriver: false }).start(() => {
      if (burstOnFinish && value > 0) setFinished(true);
    });
    return () => anim.removeAllListeners();
  }, [value, anim]);

  return (
    <View style={{ position: 'relative' }}>
      <Text style={style} {...props}>{group(typeof value === 'number' ? display : value)}</Text>
      <ParticleBurst active={finished} color={DS.lime} />
    </View>
  );
}

// ── Trend ────────────────────────────────────────────────────────────────────
// Width comes from the card, not from Dimensions at module load — the old chart
// was sized screen−48 inside a container of screen−58, so its last point and
// label were clipped off the right edge.
//
// There are no "M1 … Mn" axis labels: they numbered innings, not matches, and
// cost a whole label row to say nothing. In their place the chart earns its
// height — a dashed career mean to read each innings against, and the best one
// called out — which is what a trend is actually for.
function Tooltip({ i, x, y, v, activeIndex, color, H }) {
  const style = useAnimatedStyle(() => ({
    opacity: withTiming(activeIndex.value === i ? 1 : 0, { duration: 100 }),
    position: 'absolute',
    left: x,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    transform: [{ translateX: -4 }]
  }));
  return (
    <Reanimated.View style={style} pointerEvents="none">
      <View style={{ width: 1, height: H, backgroundColor: color, position: 'absolute', opacity: 0.4 }} />
      <View style={{ top: y - 28, backgroundColor: '#0f4c3a', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, zIndex: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4 }}>
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{v}</Text>
      </View>
      <View style={{ top: y - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: color, position: 'absolute', borderWidth: 2, borderColor: '#fff' }} />
    </Reanimated.View>
  );
}

function TrendChart({ values, color, areaColor, width }) {
  const DS = useTheme().colors;
  const H = 86;
  const INSET = 7;                                   // keeps end dots off the edges
  const max = Math.max(...values, 1);
  const mean = values.reduce((t, v) => t + v, 0) / values.length;
  const best = Math.max(...values);
  const bestAt = values.indexOf(best);
  const plotW = Math.max(width - INSET * 2, 1);
  const stepX = plotW / Math.max(values.length - 1, 1);
  const x = (i) => INSET + i * stepX;
  const y = (v) => H - (v / max) * (H - 20);         // 20pt of headroom for the callout

  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }).start();
  }, [values, anim]);

  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');

  const activeIndex = useSharedValue(-1);
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      'worklet';
      activeIndex.value = Math.max(0, Math.min(values.length - 1, Math.round((e.x - INSET) / stepX)));
    })
    .onChange((e) => {
      'worklet';
      activeIndex.value = Math.max(0, Math.min(values.length - 1, Math.round((e.x - INSET) / stepX)));
    })
    .onFinalize(() => {
      'worklet';
      activeIndex.value = -1;
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={{ height: H, overflow: 'hidden' }}>
        <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [H, 0] }) }] }}>
          <Svg width={width} height={H}>
          <Defs>
            <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={areaColor || color} stopOpacity={areaColor ? 0.5 : 0.25} />
              <Stop offset="1" stopColor={areaColor || color} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Polygon points={`${INSET},${H} ${points} ${x(values.length - 1)},${H}`} fill="url(#grad)" />
          {/* Career mean — the line every innings is judged against. */}
          <Line x1={0} y1={y(mean)} x2={width} y2={y(mean)} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="2 2" opacity={1} />
          <Polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          {values.map((v, i) => (
            <Circle key={i} cx={x(i)} cy={y(v)} r={i === bestAt ? 3.5 : 2.5} fill={i === bestAt ? color : '#ffffff'} stroke={color} strokeWidth={1.5} />
          ))}
          <SvgText x={x(bestAt)} y={y(best) - 8} fontSize="11" fontWeight="800" fill="#0f4c3a"
            textAnchor={bestAt === 0 ? 'start' : bestAt === values.length - 1 ? 'end' : 'middle'}>
            {best}
          </SvgText>
        </Svg>
        </Animated.View>
        
        {values.map((v, i) => (
          <Tooltip key={i} i={i} x={x(i)} y={y(v)} v={v} activeIndex={activeIndex} color={color} H={H} />
        ))}
      </View>
    </GestureDetector>
  );
}

function AnimatedChevron({ isOpen, color }) {
  const rot = useSharedValue(isOpen ? 1 : 0);
  useEffect(() => {
    rot.value = withTiming(isOpen ? 1 : 0, { duration: 250 });
  }, [isOpen]);

  const animStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${interpolate(rot.value, [0, 1], [0, 180])}deg` }]
    };
  });

  return (
    <Reanimated.View style={animStyle}>
      <Icon name="chevron-down" size={20} color={color} />
    </Reanimated.View>
  );
}

/**
 * @param stats       the payload from /users/me/stats or /players/:id/career
 * @param sportId     which sport's panels to draw
 * @param navigation  optional — makes the form discs tap through to the match
 * @param captureRef  optional — a ViewShot ref for "share this card". The panel
 *                    segment sits OUTSIDE it, so a shared card is the numbers
 *                    rather than a screenshot of the app.
 * @param children    rendered inside the capture, under the chart (the share
 *                    footer on My Stats).
 */
function StatCell({ s, i, styles }) {
  const DS = useTheme().colors;
  const isPressed = useSharedValue(0);
  const touchX = useSharedValue(0);
  const touchY = useSharedValue(0);
  const isFlipped = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((e) => {
      'worklet';
      touchX.value = e.allTouches[0].x;
      touchY.value = e.allTouches[0].y;
      isPressed.value = withTiming(1, { duration: 150 });
    })
    .onTouchesMove((e) => {
      'worklet';
      touchX.value = e.allTouches[0].x;
      touchY.value = e.allTouches[0].y;
    })
    .onTouchesUp(() => {
      'worklet';
      isPressed.value = withTiming(0, { duration: 300 });
    });

  const tapGesture = Gesture.Tap().onEnd(() => {
    'worklet';
    isFlipped.value = withSpring(isFlipped.value ? 0 : 1, { damping: 14, stiffness: 120 });
  });

  const composedGesture = Gesture.Simultaneous(panGesture, tapGesture);

  const spotlightStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: touchX.value - 60,
    top: touchY.value - 60,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(16, 185, 129, 0.15)', // Lime glow
    opacity: isPressed.value,
    transform: [{ scale: isPressed.value ? 1 : 0.8 }],
  }));

  const frontStyle = useAnimatedStyle(() => {
    const spin = interpolate(isFlipped.value, [0, 1], [0, 180]);
    return {
      transform: [{ perspective: 1000 }, { rotateY: `${spin}deg` }],
      backfaceVisibility: 'hidden',
    };
  });

  const backStyle = useAnimatedStyle(() => {
    const spin = interpolate(isFlipped.value, [0, 1], [180, 360]);
    return {
      transform: [{ perspective: 1000 }, { rotateY: `${spin}deg` }],
      backfaceVisibility: 'hidden',
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      // Fixed, not themed. This face read backgroundColor: DS.limeDark with a
      // DS.limeBright label — and in the LIGHT theme those two tokens are the
      // same value (#0a5227), so the label sat at 1.00:1 against its own
      // background and simply was not there. Flipping a tile showed a number
      // with no idea what it was.
      //
      // The flipped card is one deliberate surface in both themes: deep pitch
      // green with the app's gold on it, 8.70:1 — AAA at this text size.
      backgroundColor: FLIP_BG,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 16,
      borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)'
    };
  });

  return (
    <GestureDetector gesture={composedGesture}>
      <Reanimated.View entering={ZoomIn.delay(i * 75).springify().damping(12)} style={{ width: '31%', aspectRatio: 0.9 }}>
        <Reanimated.View style={[styles.cell, { overflow: 'hidden', width: '100%', height: '100%' }, frontStyle]}>
          <Reanimated.View style={spotlightStyle} pointerEvents="none" />
          <CountingText style={[styles.cellVal, i === 0 && styles.cellValLead]} numberOfLines={1} value={s.value} burstOnFinish={i === 0} />
          <Text style={styles.cellLbl} numberOfLines={1}>{s.label}</Text>
        </Reanimated.View>
        {/* The back carried a fixed "CAREER TOTAL" caption above the number,
            so a flipped tile never said WHICH stat you were looking at — and in
            the light theme that caption was invisible anyway. It shows the
            tile's own label now, and where a stat is about a person — a
            nemesis, a partner — their name underneath. */}
        <Reanimated.View style={[backStyle, { padding: 8, width: '100%', height: '100%' }]}>
          {/* The label always shows now — it is what the number on the front
              was, and a flipped tile without it is just a number. */}
          <Text numberOfLines={2} style={{ color: FLIP_FG, fontSize: 10, fontWeight: '800', textAlign: 'center', letterSpacing: 0.5 }}>
            {s.label.toUpperCase()}
          </Text>
          <Text style={{ color: FLIP_FG, fontSize: 17, fontWeight: '900', marginTop: 4 }}>{s.value}</Text>
          {!!s.detail && (
            <Text
              numberOfLines={2}
              style={{ color: FLIP_FG, fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 3 }}
            >
              {s.detail}
            </Text>
          )}
        </Reanimated.View>
      </Reanimated.View>
    </GestureDetector>
  );
}

export default function CareerBoard({ stats, sportId, ballType, navigation, captureRef, children }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const panels = getCareerPanels(sportId);
  const [tab, setTab] = useState(panels[0].id);
  const [chartW, setChartW] = useState(0);
  const [radarW, setRadarW] = useState(0);

  const activePanel = panels.find((p) => p.id === tab) || panels[0];
  const tabStats = stats
    ? activePanel.rows.map((r) => ({ label: r.label, value: readStat(r, stats) }))
    : [];

  const sportName = getSport(sportId)?.name || 'Cricket';
  const matches = stats?.matches ?? 0;
  // Older payloads only carried momCount, so that still stands in for the Man of
  // the Match count.
  const awardCounts = stats?.awards || { motm: stats?.momCount ?? 0 };
  const honours = AWARD_KINDS
    .map((a) => ({ ...a, n: awardCounts[a.key] || 0 }))
    .filter((a) => a.n > 0);

  // The user wants 'recent to start order' (latest match first).
  // The backend already returns `recentForm` sorted by `startTime: 'desc'`.
  const form = [...(stats?.recentForm || [])];
  // What each match contributed, in the terms of the panel being looked at.
  // Fielding and the event sports have nothing per-match to say, so the line
  // under the discs is dropped rather than filled with placeholders.
  const contribution = (m) =>
    tab === 'bowling' ? (m.wickets != null ? `${m.wickets}w` : null)
      : tab === 'batting' ? (m.runs != null ? `${m.runs}` : null)
      : null;
  const showContribution = form.some((m) => contribution(m) != null);

  // A record only reads as one when there is something in it. Ties and results
  // the backend could not parse are in neither column, so W+L can be short of
  // matches — that is deliberate, not a rounding error.
  const hasRecord = (stats?.wins || 0) + (stats?.losses || 0) > 0;

  // The form strip is a horizontal ScrollView nested inside the Pavilion's own
  // horizontal pager (PavilionScreen wraps every page in <ScrollView horizontal
  // pagingEnabled>). Two scrollables on the same axis: the pager took the drag
  // and the strip never moved, so a career of thirty matches showed the first
  // six and no way to reach the rest.
  //
  // Driven by a pan rather than left to the two ScrollViews to negotiate —
  // the same fix GroundsScreen's filter row uses, and for the same reason.
  // activeOffsetX means a vertical scroll of the page still passes straight
  // through; only a deliberate horizontal drag claims the strip.
  const formScroll = useAnimatedRef();
  const formOffset = useSharedValue(0);
  const formStart = useSharedValue(0);
  const formMax = useSharedValue(0);
  const formViewW = useRef(0);
  const formContentW = useRef(0);
  const recomputeFormMax = () => {
    formMax.value = Math.max(0, formContentW.current - formViewW.current);
  };
  const formPan = useMemo(() => Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onBegin(() => { formStart.value = formOffset.value; })
    .onUpdate((e) => {
      let next = formStart.value - e.translationX;
      if (next < 0) next = 0; else if (next > formMax.value) next = formMax.value;
      formOffset.value = next;
      scrollTo(formScroll, next, 0, false);
    }), [formScroll, formOffset, formStart, formMax]);

  // Same nesting, same fix: nine award kinds can be on show, and the honours
  // row sat in the pager too.
  const honScroll = useAnimatedRef();
  const honOffset = useSharedValue(0);
  const honStart = useSharedValue(0);
  const honMax = useSharedValue(0);
  const honViewW = useRef(0);
  const honContentW = useRef(0);
  const recomputeHonMax = () => {
    honMax.value = Math.max(0, honContentW.current - honViewW.current);
  };
  const honPan = useMemo(() => Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onBegin(() => { honStart.value = honOffset.value; })
    .onUpdate((e) => {
      let next = honStart.value - e.translationX;
      if (next < 0) next = 0; else if (next > honMax.value) next = honMax.value;
      honOffset.value = next;
      scrollTo(honScroll, next, 0, false);
    }), [honScroll, honOffset, honStart, honMax]);
  const openMatch = (m) => {
    if (!navigation || !m.matchId) return;
    if (sportId === 'cricket') navigation.navigate('Scorecard', { matchId: m.matchId });
    else navigation.navigate('MatchStats', { matchId: m.matchId, sportName });
  };

  // Trend: cricket has real per-match series; other sports don't yet, so the
  // chart is omitted rather than showing invented numbers. Two points is the
  // minimum that makes a trend.
  // Named per panel rather than falling through to catches: the chain used to
  // end in an `else`, so any panel that wasn't batting or bowling drew the
  // fielding chart — which "How You Get Out" would have inherited, captioned
  // "Catches & run outs".
  const chartSeries = sportId === 'cricket'
    ? (tab === 'batting' ? stats?.recentScores
      : tab === 'bowling' ? stats?.recentWickets
      : tab === 'fielding' ? stats?.recentCatches
      : null)
    : null;
  const chartData = chartSeries && chartSeries.length >= 2 ? chartSeries : [];
  // One accent, plus the app's wicket red where wickets are the subject.
  const chartColor = tab === 'bowling' ? DS.coral : '#65a38a';
  const chartAreaColor = tab === 'bowling' ? null : '#ecfdf5';
  const chartTitle = tab === 'batting' ? 'Scores' : tab === 'bowling' ? 'Wickets' : 'Catches & run outs';
  const chartAvg = chartData.length ? (chartData.reduce((t, v) => t + v, 0) / chartData.length).toFixed(1) : null;

  const swipeDir = useRef(1);

  const selectPanel = (id) => {
    if (id !== tab) {
      const idx = panels.findIndex(p => p.id === id);
      const currIdx = panels.findIndex(p => p.id === tab);
      swipeDir.current = idx > currIdx ? 1 : -1;
      haptic.tick();
      setTab(id);
    }
  };

  const stepPanel = React.useCallback((dir) => {
    const idx = panels.findIndex(p => p.id === tab);
    if (idx === -1) return;
    const next = idx + dir;
    if (next < 0 || next >= panels.length) return;
    swipeDir.current = dir;
    selectPanel(panels[next].id);
  }, [panels, tab]);

  return (
    <View style={styles.wrap}>
      <ViewShot ref={captureRef} options={{ format: 'png', quality: 0.95 }} style={{ backgroundColor: DS.bg }}>
        <View style={{ gap: 10 }}>
          <View style={[styles.card, { padding: 0, borderWidth: 0, backgroundColor: 'transparent', shadowColor: DS.lime, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 8 }]}>
            <View style={[StyleSheet.absoluteFill, { borderRadius: 16, overflow: 'hidden' }]}>
              <Svg height="100%" width="100%">
                <Defs>
                  <LinearGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <Stop offset="0%" stopColor={DS.lime} stopOpacity="1" />
                    <Stop offset="100%" stopColor="#052E16" stopOpacity="1" />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroGrad)" />
              </Svg>
            </View>
            <View style={[StyleSheet.absoluteFill, { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', pointerEvents: 'none' }]} />

            <View style={{ padding: 16 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: 1, marginBottom: 12 }}>{sportName.toUpperCase()} CAREER</Text>
              
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 42, fontWeight: '900', color: '#ffffff', letterSpacing: -2, lineHeight: 46, textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 }}>{matches}</Text>
                  
                  {form.length > 0 && (
                    <>
                      <Text style={{ fontSize: 28, fontWeight: '300', color: 'rgba(255,255,255,0.4)', marginHorizontal: 12, marginTop: -4 }}>-</Text>
                      <View style={{ flex: 1 }}>
                        <GestureDetector gesture={formPan}>
                        <Reanimated.ScrollView
                          ref={formScroll}
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          onLayout={(e) => { formViewW.current = e.nativeEvent.layout.width; recomputeFormMax(); }}
                          onContentSizeChange={(w) => { formContentW.current = w; recomputeFormMax(); }}
                          contentContainerStyle={{ gap: 8, paddingRight: 4, paddingVertical: 4, alignItems: 'center' }}>
                          {form.map((m, i) => {
                            const won = m.result === 'W', lost = m.result === 'L';
                            const award = m.award || (m.isMOM ? 'motm' : null);
                            return (
                              <TouchableOpacity
                                key={m.matchId || i}
                                activeOpacity={m.matchId && navigation ? 0.7 : 1}
                                onPress={() => openMatch(m)}
                                accessibilityLabel={`${won ? 'Won' : lost ? 'Lost' : 'Tied'} vs ${m.opponent || 'unknown'}`
                                  + (award ? `, ${AWARD_NAME[award] || 'award'}` : '')}
                                style={{
                                  width: 30, height: 30, borderRadius: 15,
                                  alignItems: 'center', justifyContent: 'center',
                                  backgroundColor: won ? DS.success : lost ? DS.coral : 'rgba(255,255,255,0.2)',
                                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
                                  shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 4
                                }}>
                                <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '800' }}>{m.result || 'T'}</Text>
                                {award && (
                                  <View style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
                                    <Icon name={AWARD_ICON[award] || 'star'} size={10} color="#0f4c3a" />
                                  </View>
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </Reanimated.ScrollView>
                        </GestureDetector>
                      </View>
                    </>
                  )}
                </View>
                
                {/* The record moved up here from a "Career" panel at the very
                    bottom, which listed Matches / Won / Lost / Win % — matches
                    was already the big number two lines up, and won/lost was
                    already the row of W and L discs beside it. Only the win
                    rate was new, and it belongs next to the games it counts. */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, paddingLeft: 2 }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.8)', letterSpacing: 1.5 }}>
                    {matches === 1 ? 'MATCH' : 'MATCHES'}
                  </Text>
                  {hasRecord && (
                    <>
                      <Text style={styles.hdrSep}>·</Text>
                      <Text style={styles.hdrRecord}>{stats.wins}W</Text>
                      <Text style={styles.hdrRecordDim}> {stats.losses}L</Text>
                      {stats.winPercent != null && (
                        <>
                          <Text style={styles.hdrSep}>·</Text>
                          <Text style={styles.hdrRecord}>{stats.winPercent}%</Text>
                          <Text style={styles.hdrRecordDim}> WON</Text>
                        </>
                      )}
                    </>
                  )}
                </View>
              </View>

              {honours.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <GestureDetector gesture={honPan}>
                  <Reanimated.ScrollView
                    ref={honScroll}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    onLayout={(e) => { honViewW.current = e.nativeEvent.layout.width; recomputeHonMax(); }}
                    onContentSizeChange={(w) => { honContentW.current = w; recomputeHonMax(); }}
                    contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
                    {honours.map((a) => (
                      <View key={a.key} style={[styles.honour, a.major && styles.honourMajor, { 
                        backgroundColor: a.major ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.1)', 
                        borderWidth: 1, 
                        borderColor: a.major ? 'rgba(255,215,0,0.4)' : 'rgba(255,255,255,0.2)',
                        paddingVertical: 4, paddingHorizontal: 8,
                        margin: 0, gap: 4
                      }]}>
                        <Icon name={a.icon} size={12} color={a.major ? '#ffd700' : '#ffffff'} />
                        <Text style={[styles.honourCount, { color: a.major ? '#ffd700' : '#ffffff', fontSize: 11, fontWeight: '800' }]}>{a.n}</Text>
                        <Text style={[styles.honourLabel, { color: a.major ? '#ffd700' : 'rgba(255,255,255,0.8)', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }]}>{a.label}</Text>
                      </View>
                    ))}
                  </Reanimated.ScrollView>
                  </GestureDetector>
                </View>
              )}
            </View>
          </View>
        {/* Accordion Panels */}
        {panels.length > 0 && (
          <View style={{ gap: 8, marginTop: 4 }}>
            {panels.map((p) => {
              const isOpen = tab === p.id;
              const pStats = p.rows.map((r) => ({
                label: r.label,
                value: readStat(r, stats),
                // Who the number is about — a name, shown on the cell's back.
                detail: r.detail ? (stats?.[r.detail] || null) : null,
              })).filter((s) => s.value !== '—');
              
              if (pStats.length === 0) return null;

              return (
                <Reanimated.View key={p.id} style={styles.accordionWrap} layout={LinearTransition.springify().damping(18).stiffness(150)}>
                  <TouchableOpacity 
                    style={styles.accordionHeader} 
                    activeOpacity={0.8}
                    onPress={() => {
                      haptic.tick();
                      setTab(isOpen ? null : p.id);
                    }}
                  >
                    <Text style={styles.accordionTitle}>{p.label.toUpperCase()}</Text>
                    <AnimatedChevron isOpen={isOpen} color={DS.textMuted} />
                  </TouchableOpacity>
                  {isOpen && (
                    <View style={styles.accordionBody}>
                      <View style={styles.grid}>
                        {pStats.map((s, i) => (
                          <StatCell key={s.label} s={s} i={i} styles={styles} />
                        ))}
                      </View>
                    </View>
                  )}
                </Reanimated.View>
              );
            })}
          </View>
        )}

        {/* The web, moved down here from directly under the hero. It is a shape,
            not a number — a read of the whole game at a glance — and it belongs
            AFTER the figures it summarises rather than in front of them. The
            table answers "how many", this answers "what kind of player", and
            the trend below answers "lately". Read in that order it tells a
            story; the other way round it was an abstract diagram standing
            between you and your runs. */}
        {/* Trend — cricket only for now; other sports have no per-match series
            yet, and a chart of invented numbers is worse than none. */}
        {chartData.length > 0 && (
          <View style={styles.chartCard} onLayout={(e) => setChartW(e.nativeEvent.layout.width - 26)}>
            <View style={styles.cardHead}>
              <Text style={styles.cardLabel}>{chartTitle.toUpperCase()} · LAST {chartData.length}</Text>
              <Text style={styles.cardMetaText}>avg {chartAvg}</Text>
            </View>
            {chartW > 0 && <TrendChart values={chartData} color={chartColor} areaColor={chartAreaColor} width={chartW} />}
          </View>
        )}

        {children}
        </View>
      </ViewShot>
    </View>
  );
}
/**
 * Is there a career here at all? Both callers ask before drawing, because a
 * successful fetch is not the same as a player with something to show —
 * getUserStats resolves with `{}` for a signed-out or unlinked user, so `stats`
 * was always truthy and a brand-new player got a table of dashes instead of the
 * invitation to go and score one.
 */
export function hasCareer(stats, sportId) {
  if (!stats) return false;
  if ((stats.matches ?? 0) > 0 || (stats.recentForm || []).length > 0) return true;
  return getCareerPanels(sportId).some((p) =>
    p.rows.some((r) => { const v = readStat(r, stats); return v !== '—' && v !== 0; }));
}

const makeStyles = (DS) => StyleSheet.create({
  wrap: { gap: 10 },

  /* Panel segment — Level 2 tabs (underline style) */
  segment: {
    flexDirection: 'row', 
    borderBottomWidth: 1, 
    borderColor: DS.faint,
    marginBottom: 6,
  },
  segBtn: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center', 
    paddingVertical: 12, 
    borderBottomWidth: 2, 
    borderBottomColor: 'transparent' 
  },
  segBtnOn: { borderBottomColor: DS.lime },
  segText: { fontSize: 14, fontWeight: '600', color: DS.textMuted },
  segTextOn: { color: DS.lime, fontWeight: 'bold' },

  /* Shared card chrome — one surface, a hairline, a tiny caps label. */
  card: { backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border, paddingHorizontal: 13, paddingVertical: 12, gap: 11 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardLabel: { fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.7 },
  cardMetaText: { fontSize: 11, fontWeight: '700', color: DS.textVariant, fontVariant: ['tabular-nums'] },

  /* Honours: match the slate-50 background and text-slate-600 */
  honours: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  honour: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.border,
  },
  honourMajor: {},
  hdrSep: { color: 'rgba(255,255,255,0.45)', fontSize: 9, fontWeight: '800', marginHorizontal: 6 },
  hdrRecord: { color: '#ffffff', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  hdrRecordDim: { color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  honourCount: { fontSize: 10, fontWeight: '500', color: DS.textMuted, textTransform: 'uppercase' },
  honourLabel: { fontSize: 10, fontWeight: '500', color: DS.textMuted, textTransform: 'uppercase' },
  honourTextMajor: {},

  /* Last five results: won / lost / tied, tappable through to the match. */
  formRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, marginBottom: 8 },
  formCol: { flex: 1, alignItems: 'center', gap: 6 },
  formDisc: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 3
  },
  formDiscText: { fontSize: 14, fontWeight: '700' },
  formStar: { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: DS.surface, alignItems: 'center', justifyContent: 'center' },
  formSub: { fontSize: 12, fontWeight: '500', color: DS.textMuted, fontVariant: ['tabular-nums'], marginTop: 4 },
  formSubLatest: { color: DS.textPrimary },

  /* Bento-box stats layout */
  gridWrap: { marginTop: 12 },
  gridHead: { width: '100%', marginBottom: 8, paddingHorizontal: 4 },
  gridHeadText: { fontSize: 11, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { 
    paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border,
    shadowColor: DS.lime, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 4
  },
  cellValLead: { color: DS.lime, fontSize: 24, fontWeight: '900', letterSpacing: 0.5 },
  cellVal: { fontSize: 21, fontWeight: '800', color: DS.textPrimary, marginBottom: 2, letterSpacing: 0.5 },
  cellLbl: { fontSize: 11, fontWeight: '700', color: DS.textVariant, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1.2 },

  chartCard: { backgroundColor: DS.surfaceHigh, borderRadius: 16, borderWidth: 1, borderColor: DS.border, paddingHorizontal: 16, paddingVertical: 12, gap: 16, marginBottom: 16 },
  
  dropdownWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
  },
  accordionWrap: {
    backgroundColor: DS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: DS.border,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  accordionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: DS.textPrimary,
  },
  accordionBody: {
    paddingHorizontal: 12,
    paddingBottom: 16,
  }
});
