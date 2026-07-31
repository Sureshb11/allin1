import React, { useEffect, useState, useLayoutEffect, useRef, useCallback } from 'react';
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { useHideTabBarOnScroll, useTabBarClearance } from "../components/AutoHideTabBar";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, RefreshControl, Share } from 'react-native';
import Svg, { Polyline, Polygon, Circle, Line, Text as SvgText } from 'react-native-svg';
import ViewShot, { captureRef } from 'react-native-view-shot';
import RNShare from 'react-native-share';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport } from '../utils/selectedSport';
import { getSport } from '../sports';
import { getCareerPanels, readStat } from '../sports/careerStats';
import { useCurrentUser } from '../utils/currentUser';
import { haptic } from '../utils/haptics';

// 1,284 reads faster than 1284 in a table of career totals.
const group = (v) => (typeof v === 'number' && Number.isInteger(v) && Math.abs(v) >= 1000)
  ? String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  : v;

// ── Trend ────────────────────────────────────────────────────────────────────
// Was a 140pt card whose width came from Dimensions at module load (screen − 48)
// while its container is screen − 58 — so the last point and its label were
// clipped off the right edge. Width now comes from the card itself.
//
// The "M1 … Mn" axis labels are gone: they numbered innings, not matches, and
// cost a whole label row to say nothing. In their place the chart earns its
// height — a dashed career mean to read each innings against, and the best one
// called out — which is what a trend is actually for.
function TrendChart({ values, color, width }) {
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

  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
      <Svg width={width} height={H}>
        <Polygon points={`${INSET},${H} ${points} ${x(values.length - 1)},${H}`} fill={color} fillOpacity={0.14} />
        {/* Career mean — the line every innings is judged against. */}
        <Line x1={0} y1={y(mean)} x2={width} y2={y(mean)} stroke={DS.textMuted} strokeWidth={1} strokeDasharray="3 4" opacity={0.7} />
        <Polyline points={points} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {values.map((v, i) => (
          <Circle key={i} cx={x(i)} cy={y(v)} r={i === bestAt ? 4.5 : 3} fill={i === bestAt ? color : DS.surface} stroke={color} strokeWidth={2} />
        ))}
        <SvgText x={x(bestAt)} y={y(best) - 8} fontSize="10" fontWeight="700" fill={color}
          textAnchor={bestAt === 0 ? 'start' : bestAt === values.length - 1 ? 'end' : 'middle'}>
          {best}
        </SvgText>
      </Svg>
    </Animated.View>
  );
}

// Shape-matching placeholder: the career line, then the stat table. The spinner
// it replaces said "something is coming" but not what, so the screen jumped.
function StatsSkeleton({ DS }) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.75, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const Bar = ({ w, h, r = 6, mt = 0 }) => (
    <Animated.View style={{ width: w, height: h, borderRadius: r, marginTop: mt, backgroundColor: DS.surfaceHigh, opacity: pulse }} />
  );
  return (
    <View style={{ gap: 10 }}>
      <View style={{ backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border, padding: 13, gap: 12 }}>
        <Bar w="45%" h={10} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[0, 1, 2, 3, 4].map((i) => <Bar key={i} w={28} h={28} r={14} />)}
        </View>
      </View>
      <View style={{ backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border, padding: 13 }}>
        {[0, 1, 2].map((r) => (
          <View key={r} style={{ flexDirection: 'row', paddingVertical: 9 }}>
            {[0, 1, 2].map((c) => (
              <View key={c} style={{ flex: 1, gap: 6 }}>
                <Bar w="55%" h={16} />
                <Bar w="72%" h={8} />
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

export default function MyPerformanceScreen({ navigation, inline, onRegisterFab }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);const hideTabBar = useHideTabBarOnScroll();const tabClear = useTabBarClearance();
  const meUser = useCurrentUser();
  const [stats, setStats] = useState(null);
  // Panels come from the sport, not from cricket: football shows Attack /
  // Discipline, the racquet sports a single Rally table, and so on.
  const sportId = getSelectedSport().sport?.id || 'cricket';
  const panels = getCareerPanels(sportId);
  const [tab, setTab] = useState(panels[0].id);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chartW, setChartW] = useState(0);
  const shotRef = useRef(null);

  useLayoutEffect(() => {
    if (!inline) {
      // Own hero below, like every other screen in this stack — the navigator's
      // default header stacked a light system bar above it and repeated the
      // title. Fourth instance of this pattern in the codebase.
      navigation.setOptions({ headerShown: false });
    }
  }, [navigation, inline]);

  const fetchStats = useCallback(() =>
    legendsApi.getUserStats(getSelectedSport().sport?.id).then((res) => {
      if (res.success) setStats(res.data);
    }), []);

  useEffect(() => { fetchStats().finally(() => setLoading(false)); }, [fetchStats]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchStats().finally(() => setRefreshing(false));
  }, [fetchStats]);

  // Capture the stat card as an image and share it (falls back to plain text if
  // the capture fails). Registered as the Pavilion "Share Card" FAB action.
  const shareCard = useCallback(async () => {
    const sportName = getSport(sportId)?.name || 'Cricket';
    const caption = `📊 ${meUser?.name || 'My'} ${sportName} stats\nvia Local Legends`;
    try {
      const uri = await captureRef(shotRef, { format: 'png', quality: 0.95, result: 'tmpfile' });
      await RNShare.open({ url: uri, type: 'image/png', message: caption, failOnCancel: false });
    } catch (e) {
      try { await Share.share({ message: caption }); } catch {}
    }
  }, [sportId, meUser]);

  const activePanel = panels.find((p) => p.id === tab) || panels[0];
  const tabStats = stats
    ? activePanel.rows.map((r) => ({ label: r.label, value: readStat(r, stats) }))
    : [];

  // Career line. `matches` and `momCount` sit above the panels because they
  // belong to the whole career, not to batting or bowling — which is also why
  // the panels no longer repeat "Matches" as a table cell.
  const sportName = getSport(sportId)?.name || 'Cricket';
  const matches = stats?.matches ?? 0;
  const momCount = stats?.momCount ?? 0;
  // Last five completed matches, real results. The API has sent these since the
  // profile's form section was built; this screen drew a bar chart of the trend
  // series instead and called it "recent form" — the same numbers the chart
  // below already plotted, minus who they were against or whether you won.
  // Reversed to run oldest → latest, so it reads in the same direction as the
  // chart underneath it.
  const form = [...(stats?.recentForm || [])].reverse();
  // What each match contributed, in the terms of the panel you're looking at.
  // Fielding and the event sports have nothing per-match to say, so the line
  // under the discs is dropped entirely rather than filled with placeholders.
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

  // Is there a career here at all? getUserStats resolves successfully even for a
  // signed-out or unlinked user (it returns `{}`), so `stats` was always truthy
  // and the empty state below — CTA and all — could never render: a brand-new
  // player got a table of dashes instead of the invitation to go and score one.
  const hasCareer = !!stats && (matches > 0 || form.length > 0 || panels.some((p) =>
    p.rows.some((r) => { const v = readStat(r, stats); return v !== '—' && v !== 0; })));

  useEffect(() => {
    // Only offer the share action once there is a card to share — with no
    // career the capture target isn't even mounted.
    if (inline && hasCareer) onRegisterFab?.(shareCard);
  }, [inline, hasCareer, onRegisterFab, shareCard]);

  // Trend line: cricket has real per-match series; other sports don't yet, so
  // the chart is simply omitted rather than showing invented numbers. Two points
  // is the minimum that makes a trend.
  const chartSeries = sportId === 'cricket'
    ? (tab === 'batting' ? stats?.recentScores : tab === 'bowling' ? stats?.recentWickets : stats?.recentCatches)
    : null;
  const chartData = chartSeries && chartSeries.length >= 2 ? chartSeries : [];
  // One accent, plus the app's wicket red where wickets are the subject.
  const chartColor = tab === 'bowling' ? DS.coral : DS.lime;
  const chartTitle = tab === 'batting' ? 'Scores' : tab === 'bowling' ? 'Wickets' : 'Catches & run outs';
  const chartAvg = chartData.length ? (chartData.reduce((t, v) => t + v, 0) / chartData.length).toFixed(1) : null;

  const selectPanel = (id) => { if (id !== tab) { haptic.tick(); setTab(id); } };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false} {...hideTabBar} contentContainerStyle={{ paddingBottom: tabClear }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} colors={[DS.lime]} />}>
      {/* Hero */}
      {!inline && (
        <View style={styles.hero}>
          {/* The hero had no back affordance — it leaned on the navigator's, so
              hiding that without this would strand the standalone route. */}
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
            <Icon name="arrow-left" size={22} color={DS.textPrimary} />
          </TouchableOpacity>
          <Icon name="chart-bar" size={20} color={DS.lime} />
          <Text style={styles.heroTitle}>My Performance</Text>
        </View>
      )}

      <View style={styles.body}>
        {/* Panel segment — a one-panel sport has nothing to switch between, so
            the control doesn't render. Same pill shape and position as Rankings,
            so the two Pavilion tabs read as one screen; it stays put while the
            stats load, and outside the capture below, so a shared card is the
            numbers rather than a screenshot of the app. */}
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

        {loading ?
        <StatsSkeleton DS={DS} /> :
        hasCareer ?
        <ViewShot ref={shotRef} options={{ format: 'png', quality: 0.95 }} style={{ backgroundColor: DS.bg, gap: 10 }}>
            {/* Career line + last five results. Inside the Pavilion nothing on
                this screen used to say which sport it was reporting on. */}
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardLabel}>{sportName.toUpperCase()} CAREER</Text>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardMetaText}>{matches} {matches === 1 ? 'match' : 'matches'}</Text>
                  {momCount > 0 && (
                    <View style={styles.momChip}>
                      <Icon name="star" size={9} color={DS.onLime} />
                      <Text style={styles.momChipText}>{momCount} MOM</Text>
                    </View>
                  )}
                </View>
              </View>
              {form.length > 0 && (
                <View style={styles.formRow}>
                  {form.map((m, i) => {
                    const won = m.result === 'W', lost = m.result === 'L';
                    const latest = i === form.length - 1;
                    return (
                      <TouchableOpacity
                        key={m.matchId || i}
                        style={styles.formCol}
                        activeOpacity={m.matchId ? 0.7 : 1}
                        onPress={() => openMatch(m)}
                        accessibilityLabel={`${won ? 'Won' : lost ? 'Lost' : 'Tied'} vs ${m.opponent || 'unknown'}`}>
                        <View style={[styles.formDisc, {
                          backgroundColor: won ? DS.lime : lost ? DS.coral : DS.surfaceHighest,
                        }]}>
                          <Text style={[styles.formDiscText, {
                            color: won ? DS.onLime : lost ? '#fff' : DS.textMuted,
                          }]}>{m.result || 'T'}</Text>
                          {m.isMOM && (
                            <View style={styles.formStar}>
                              <Icon name="star" size={8} color={DS.onLime} />
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
                  {/* Two matches played shouldn't stretch two discs across the
                      card — the strip always keeps its five-match pitch. */}
                  {Array.from({ length: Math.max(0, 5 - form.length) }, (_, k) => (
                    <View key={`gap${k}`} style={styles.formCol} />
                  ))}
                </View>
              )}
            </View>

            {/* Career table. Six bordered bento tiles at 47.5% wide took three
                screenfuls of scrolling to state six numbers; one surface ruled
                into thirds states nine in less space, and the headline stat of
                the panel carries the accent. */}
            {tabStats.length > 0 && (
              <View style={styles.grid}>
                {/* Titles the table — which the six loose tiles never did, so a
                    shared card was a wall of numbers with no heading. */}
                <View style={styles.gridHead}>
                  <Text style={styles.cardLabel}>{activePanel.label.toUpperCase()}</Text>
                </View>
                {tabStats.map((s, i) => (
                  <View key={s.label} style={[styles.cell, i >= 3 && styles.cellRule, i % 3 !== 0 && styles.cellDivide]}>
                    <Text style={[styles.cellVal, i === 0 && styles.cellValLead]} numberOfLines={1}>{group(s.value)}</Text>
                    <Text style={styles.cellLbl} numberOfLines={1}>{s.label}</Text>
                  </View>
                ))}
                {/* Panels don't all divide by three (fielding has 3, hockey 4).
                    Blank cells finish the last row so its rule spans the card
                    instead of stopping a third of the way across. */}
                {Array.from({ length: (3 - tabStats.length % 3) % 3 }, (_, k) => {
                  const i = tabStats.length + k;
                  return <View key={`pad${k}`} style={[styles.cell, i >= 3 && styles.cellRule, i % 3 !== 0 && styles.cellDivide]} />;
                })}
              </View>
            )}

            {/* Trend — cricket only for now; other sports have no per-match
                series yet, and a chart of invented numbers is worse than none. */}
            {chartData.length > 0 && (
              <View style={styles.chartCard} onLayout={(e) => setChartW(e.nativeEvent.layout.width - 26)}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardLabel}>{chartTitle.toUpperCase()} · LAST {chartData.length}</Text>
                  <Text style={styles.cardMetaText}>avg {chartAvg}</Text>
                </View>
                {chartW > 0 && <TrendChart values={chartData} color={chartColor} width={chartW} />}
              </View>
            )}

            {/* Branding footer — only meaningful once the card is shared out, but
                harmless (and a subtle attribution) in-app. The icon follows the
                sport; it was a cricket bat on a footballer's card. */}
            <View style={styles.shareBrand}>
              <Icon name={getSport(sportId)?.icon || 'cricket'} size={13} color={DS.textMuted} />
              <Text style={styles.shareBrandText}>{meUser?.name ? `${meUser.name} · ` : ''}Local Legends</Text>
            </View>
          </ViewShot> :

        <View style={styles.centered}>
            <Icon name="chart-line" size={48} color={DS.textMuted} />
            <Text style={styles.emptyText}>No stats available yet</Text>
            <Text style={styles.emptySub}>Score or play a match and your career stats show up here.</Text>
            <TouchableOpacity style={styles.emptyCta} onPress={() => navigation.navigate('StreamingLanding')} activeOpacity={0.85}>
              <Icon name="broadcast" size={16} color={DS.live} />
              <Text style={styles.emptyCtaText}>Score a live match</Text>
            </TouchableOpacity>
          </View>
        }
      </View>
    </ScrollView>);
}

const makeStyles = (DS) => StyleSheet.create({
  /* Panel segment — same shape as the Players/Teams toggle on Rankings. */
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  segment: {
    flexDirection: 'row', gap: 4, padding: 3,
    backgroundColor: DS.surfaceHigh, borderRadius: 999, borderWidth: 1, borderColor: DS.faint,
  },
  segBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, borderRadius: 999 },
  segBtnOn: { backgroundColor: DS.lime },
  segText: { fontSize: 13, fontWeight: '700', color: DS.textMuted },
  segTextOn: { color: DS.onLime, fontWeight: '900' },

  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: DS.bg, paddingTop: 52, paddingBottom: 12, paddingHorizontal: 16
  },
  heroTitle: { fontSize: 24, fontWeight: '900', color: DS.textPrimary, letterSpacing: 0.5 },
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28, gap: 10 },

  /* Shared card chrome — one surface, a hairline, a tiny caps label. */
  card: { backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border, paddingHorizontal: 13, paddingVertical: 12, gap: 11 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardLabel: { fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.7 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardMetaText: { fontSize: 11, fontWeight: '700', color: DS.textVariant, fontVariant: ['tabular-nums'] },
  momChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: DS.lime, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  momChipText: { fontSize: 9.5, fontWeight: '900', color: DS.onLime, letterSpacing: 0.3 },

  /* Last five results: won / lost / tied, tappable through to the match. */
  formRow: { flexDirection: 'row', gap: 8 },
  formCol: { flex: 1, alignItems: 'center', gap: 5 },
  formDisc: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  formDiscText: { fontSize: 13, fontWeight: '900' },
  formStar: { position: 'absolute', top: -3, right: -4, width: 13, height: 13, borderRadius: 7, backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: DS.surface },
  formSub: { fontSize: 10.5, fontWeight: '800', color: DS.textMuted, fontVariant: ['tabular-nums'] },
  // The strip runs oldest → latest, like the chart below it; the most recent
  // match is the one lit up, so which end is "now" needs no caption.
  formSubLatest: { color: DS.textPrimary },

  /* Career table: one card ruled into thirds instead of a grid of tiles. */
  grid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border, overflow: 'hidden' },
  gridHead: { width: '100%', paddingHorizontal: 11, paddingTop: 12, paddingBottom: 1 },
  cell: { width: '33.333%', paddingVertical: 12, paddingHorizontal: 11, gap: 3 },
  cellRule: { borderTopWidth: 1, borderTopColor: DS.border },
  cellDivide: { borderLeftWidth: 1, borderLeftColor: DS.border },
  cellVal: { fontSize: 19, fontWeight: '900', color: DS.textPrimary, fontVariant: ['tabular-nums'], letterSpacing: -0.4 },
  cellValLead: { color: DS.lime },
  cellLbl: { fontSize: 9.5, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' },

  chartCard: { backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border, paddingHorizontal: 13, paddingVertical: 12, gap: 8 },
  shareBrand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 4 },
  shareBrandText: { fontSize: 11, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.4 },
  emptyText: { fontSize: 16, color: DS.textVariant, marginTop: 12, fontWeight: '600' },
  emptySub: { fontSize: 13, color: DS.textMuted, marginTop: 6, textAlign: 'center', paddingHorizontal: 32, lineHeight: 19 },
  emptyCta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 24, borderWidth: 1.5, borderColor: DS.live },
  emptyCtaText: { fontSize: 14, fontWeight: '800', color: DS.live, letterSpacing: 0.3 }
});
