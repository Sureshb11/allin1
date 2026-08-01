import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Reanimated, { SlideInRight, SlideInLeft, useSharedValue, useAnimatedStyle, withTiming, withSpring, interpolate } from 'react-native-reanimated';
import Svg, { Polyline, Polygon, Circle, Line, Text as SvgText } from 'react-native-svg';
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
          <Polygon points={`${INSET},${H} ${points} ${x(values.length - 1)},${H}`} fill={areaColor || color} fillOpacity={areaColor ? 0.5 : 0.14} />
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
      backgroundColor: '#0f4c3a',
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 16,
      borderWidth: 1, borderColor: '#e2e8f0'
    };
  });

  return (
    <GestureDetector gesture={composedGesture}>
      <View style={{ width: '31%', aspectRatio: 0.9 }}>
        <Reanimated.View style={[styles.cell, { overflow: 'hidden', width: '100%', height: '100%' }, frontStyle]}>
          <Reanimated.View style={spotlightStyle} pointerEvents="none" />
          <CountingText style={[styles.cellVal, i === 0 && styles.cellValLead]} numberOfLines={1} value={s.value} burstOnFinish={i === 0} />
          <Text style={styles.cellLbl} numberOfLines={1}>{s.label}</Text>
        </Reanimated.View>
        <Reanimated.View style={[backStyle, { padding: 8, width: '100%', height: '100%' }]}>
          <Text style={{ color: '#fed7aa', fontSize: 10, fontWeight: '800', textAlign: 'center' }}>CAREER TOTAL</Text>
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900', marginTop: 4 }}>{s.value}</Text>
        </Reanimated.View>
      </View>
    </GestureDetector>
  );
}

export default function CareerBoard({ stats, sportId, navigation, captureRef, children }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
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

  // Last five completed matches, real results, reversed to run oldest → latest
  // so it reads in the same direction as the chart underneath it.
  const form = [...(stats?.recentForm || [])].reverse();
  // What each match contributed, in the terms of the panel being looked at.
  // Fielding and the event sports have nothing per-match to say, so the line
  // under the discs is dropped rather than filled with placeholders.
  const contribution = (m) =>
    tab === 'bowling' ? (m.wickets != null ? `${m.wickets}w` : null)
      : tab === 'batting' ? (m.runs != null ? `${m.runs}` : null)
      : null;
  const showContribution = form.some((m) => contribution(m) != null);
  const openMatch = (m) => {
    if (!navigation || !m.matchId) return;
    if (sportId === 'cricket') navigation.navigate('Scorecard', { matchId: m.matchId });
    else navigation.navigate('MatchStats', { matchId: m.matchId, sportName });
  };

  // Trend: cricket has real per-match series; other sports don't yet, so the
  // chart is omitted rather than showing invented numbers. Two points is the
  // minimum that makes a trend.
  const chartSeries = sportId === 'cricket'
    ? (tab === 'batting' ? stats?.recentScores : tab === 'bowling' ? stats?.recentWickets : stats?.recentCatches)
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

  // Was a PanResponder with its own 18/45 thresholds. The shared hook now, so
  // stepping Batting → Bowling → Fielding on My Stats commits at the same
  // distance as stepping a filter anywhere else in the app.
  const panelIds = React.useMemo(() => panels.map((p) => p.id), [panels]);
  const swipe = useFilterSwipe(panelIds, tab, (id) => {
    stepPanel(panelIds.indexOf(id) > panelIds.indexOf(tab) ? 1 : -1);
  });

  return (
    <GestureDetector gesture={swipe}>
    <View style={styles.wrap}>
      {/* Panel segment — a one-panel sport has nothing to switch between, so the
          control doesn't render. Same pill shape and position as Rankings. */}
      {panels.length > 1 && (
        <View style={styles.segment}>
          {panels.map((p) => {
            const on = tab === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.segBtn, on && styles.segBtnOn]}
                onPress={() => selectPanel(p.id)}
                activeOpacity={0.85}>
                <Text style={[styles.segText, on && styles.segTextOn]}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <ViewShot ref={captureRef} options={{ format: 'png', quality: 0.95 }} style={{ backgroundColor: DS.bg }}>
        <Reanimated.View key={tab} entering={swipeDir.current === 1 ? SlideInRight.duration(200).withInitialValues({ transform: [{ translateX: 50 }] }) : SlideInLeft.duration(200).withInitialValues({ transform: [{ translateX: -50 }] })} style={{ gap: 10 }}>
          {/* Career line + last five results. */}
          <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardLabel}>{sportName.toUpperCase()} CAREER</Text>
            <Text style={styles.cardMetaText}>{matches} {matches === 1 ? 'match' : 'matches'}</Text>
          </View>

          {form.length > 0 && (
            <View style={styles.formRow}>
              {form.map((m, i) => {
                const won = m.result === 'W', lost = m.result === 'L';
                const latest = i === form.length - 1;
                // What was taken home from that match, if anything. `isMOM` is
                // the older field and only ever meant Man of the Match.
                const award = m.award || (m.isMOM ? 'motm' : null);
                return (
                  <TouchableOpacity
                    key={m.matchId || i}
                    style={styles.formCol}
                    activeOpacity={m.matchId && navigation ? 0.7 : 1}
                    onPress={() => openMatch(m)}
                    accessibilityLabel={`${won ? 'Won' : lost ? 'Lost' : 'Tied'} vs ${m.opponent || 'unknown'}`
                      + (award ? `, ${AWARD_NAME[award] || 'award'}` : '')}>
                    <View style={[styles.formDisc, {
                      backgroundColor: won ? '#0f4c3a' : lost ? '#dc2626' : '#94a3b8',
                    }]}>
                      <Text style={[styles.formDiscText, {
                        color: '#ffffff',
                      }]}>{m.result || 'T'}</Text>
                      {award && (
                        <View style={styles.formStar}>
                          <Icon name={AWARD_ICON[award] || 'star'} size={10} color="#0f4c3a" />
                        </View>
                      )}
                    </View>
                    {showContribution && (
                      <Text style={[styles.formSub, latest && styles.formSubLatest]} numberOfLines={1}>
                        {contribution(m) || '·'}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
              {/* Two matches played shouldn't stretch two discs across the card
                  — the strip always keeps its five-match pitch. */}
              {Array.from({ length: Math.max(0, 5 - form.length) }, (_, k) => (
                <View key={`gap${k}`} style={styles.formCol} />
              ))}
            </View>
          )}

          {/* Honours. Nothing renders for a career without any — an empty trophy
              shelf is worse than no shelf. */}
          {honours.length > 0 && (
            <View style={styles.honours}>
              {honours.map((a) => (
                <View key={a.key} style={[styles.honour, a.major && styles.honourMajor]}>
                  <Icon name={a.icon} size={12} color={a.major ? '#0f4c3a' : '#0f4c3a'} />
                  <Text style={[styles.honourCount, a.major && styles.honourTextMajor]}>{a.n}</Text>
                  <Text style={[styles.honourLabel, a.major && styles.honourTextMajor]}>{a.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {sportId === 'cricket' && (
          <View style={{ width: '100%', alignItems: 'center' }} onLayout={(e) => setRadarW(e.nativeEvent.layout.width)}>
            {radarW > 0 && <CricketRadarChart stats={stats} width={radarW} />}
          </View>
        )}

        {/* Career table: one surface ruled into thirds, not a grid of tiles. */}
        {tabStats.length > 0 && (
          <View style={styles.gridWrap}>
            <View style={styles.gridHead}>
              <Text style={styles.gridHeadText}>{activePanel.label.toUpperCase()}</Text>
            </View>
            <View style={styles.grid}>
              {tabStats.map((s, i) => (
                <StatCell key={s.label} s={s} i={i} styles={styles} />
              ))}
            </View>
          </View>
        )}

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
        </Reanimated.View>
      </ViewShot>
    </View>
    </GestureDetector>
  );
}

function CricketRadarChart({ stats, width }) {
  const DS = useTheme().colors;
  const H = 240;
  const cx = width / 2;
  const cy = H / 2;
  const radius = Math.min(cx, cy) - 25;
  const axes = [
    { label: 'Runs', val: stats?.runs || 0, max: 500 },
    { label: 'Average', val: stats?.battingAverage || 0, max: 50 },
    { label: 'Strike Rate', val: stats?.battingStrikeRate || 0, max: 200 },
    { label: 'Highest', val: stats?.highestScore || 0, max: 100 },
    { label: 'Boundaries', val: (stats?.fours || 0) + (stats?.sixes || 0), max: 50 }
  ];

  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 50, friction: 7 }).start();
  }, [stats]);

  const angleStep = (Math.PI * 2) / axes.length;
  const getPoint = (val, max, i, r) => {
    const norm = Math.max(0, Math.min(val / (max || 1), 1));
    const angle = i * angleStep - Math.PI / 2;
    return {
      x: cx + r * norm * Math.cos(angle),
      y: cy + r * norm * Math.sin(angle)
    };
  };

  const bgPoints = [0.2, 0.4, 0.6, 0.8, 1].map(scale => {
    return axes.map((_, i) => {
      const angle = i * angleStep - Math.PI / 2;
      return `${cx + radius * scale * Math.cos(angle)},${cy + radius * scale * Math.sin(angle)}`;
    }).join(' ');
  });

  const dataPoints = axes.map((axis, i) => {
    const pt = getPoint(axis.val, axis.max, i, radius);
    return `${pt.x},${pt.y}`;
  }).join(' ');

  return (
    <View style={{ width, height: H, alignItems: 'center', justifyContent: 'center', marginVertical: 16 }}>
      <Svg width={width} height={H}>
        {bgPoints.map((pts, i) => (
          <Polygon key={i} points={pts} fill="none" stroke={DS.border} strokeWidth={1} />
        ))}
        {axes.map((_, i) => {
          const angle = i * angleStep - Math.PI / 2;
          return <Line key={i} x1={cx} y1={cy} x2={cx + radius * Math.cos(angle)} y2={cy + radius * Math.sin(angle)} stroke={DS.border} strokeWidth={1} />
        })}
        {axes.map((axis, i) => {
          const angle = i * angleStep - Math.PI / 2;
          const x = cx + (radius + 15) * Math.cos(angle);
          const y = cy + (radius + 15) * Math.sin(angle);
          return (
            <SvgText key={i} x={x} y={y + 4} fontSize="9" fontWeight="800" fill={DS.textMuted} textAnchor="middle">
              {axis.label.toUpperCase()}
            </SvgText>
          );
        })}
      </Svg>
      <Animated.View style={{ position: 'absolute', opacity: anim, transform: [{ scale: anim }] }}>
        <Svg width={width} height={H}>
          <Polygon points={dataPoints} fill="#10b981" fillOpacity={0.3} stroke="#0f4c3a" strokeWidth={2} strokeLinejoin="round" />
          {axes.map((axis, i) => {
            const pt = getPoint(axis.val, axis.max, i, radius);
            return <Circle key={i} cx={pt.x} cy={pt.y} r={3} fill="#0f4c3a" />
          })}
        </Svg>
      </Animated.View>
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
    borderColor: '#e2e8f0',
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
  segBtnOn: { borderBottomColor: '#0f4c3a' },
  segText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  segTextOn: { color: '#0f4c3a', fontWeight: 'bold' },

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
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0',
  },
  honourMajor: {},
  honourCount: { fontSize: 10, fontWeight: '500', color: '#475569', textTransform: 'uppercase' },
  honourLabel: { fontSize: 10, fontWeight: '500', color: '#475569', textTransform: 'uppercase' },
  honourTextMajor: {},

  /* Last five results: won / lost / tied, tappable through to the match. */
  formRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, marginBottom: 8 },
  formCol: { alignItems: 'center' },
  formDisc: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  formDiscText: { fontSize: 14, fontWeight: '700' },
  formStar: { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  formSub: { fontSize: 12, fontWeight: '500', color: '#64748b', fontVariant: ['tabular-nums'], marginTop: 4 },
  formSubLatest: { color: '#475569' },

  /* Bento-box stats layout */
  gridWrap: { marginTop: 12 },
  gridHead: { width: '100%', marginBottom: 8, paddingHorizontal: 4 },
  gridHeadText: { fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 0.8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { 
    paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1
  },
  cellValLead: { color: '#0f4c3a', fontSize: 19, fontWeight: '800' },
  cellVal: { fontSize: 17, fontWeight: '700', color: '#1e293b', marginBottom: 2 },
  cellLbl: { fontSize: 11, fontWeight: '600', color: '#64748b', textAlign: 'center', textTransform: 'uppercase' },

  chartCard: { backgroundColor: '#ecfdf5', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 16, paddingVertical: 12, gap: 16, marginBottom: 16 },
});
