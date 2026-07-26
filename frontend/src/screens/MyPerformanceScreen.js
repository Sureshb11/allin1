import React, { useEffect, useState, useLayoutEffect, useRef, useCallback } from 'react';
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { useHideTabBarOnScroll, useTabBarClearance } from "../components/AutoHideTabBar";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, Animated, RefreshControl, Share } from 'react-native';
import Svg, { Polyline, Polygon, Circle, Line, Text as SvgText } from 'react-native-svg';
import ViewShot, { captureRef } from 'react-native-view-shot';
import RNShare from 'react-native-share';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport } from '../utils/selectedSport';
import { getSport } from '../sports';
import { getCareerPanels, readStat } from '../sports/careerStats';
import { useCurrentUser } from '../utils/currentUser';
import SegmentedControl from '../components/SegmentedControl';

const W = Dimensions.get('window').width - 48;

function PerformanceChart({ values, color }) {const DS = useTheme().colors;
  const H = 120;
  const max = Math.max(...values, 1);
  const stepX = W / Math.max(values.length - 1, 1);
  
  // Animation state
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();
  }, [values]);

  const points = values.map((v, i) => `${i * stepX},${H - v / max * (H - 16)}`).join(' ');
  const areaPoints = `${0},${H} ` + points + ` ${W},${H}`;
  
  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
      <Svg width={W} height={H + 20}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map((r, i) =>
          <Line key={i} x1={0} y1={H - r * (H - 16)} x2={W} y2={H - r * (H - 16)} stroke={DS.surfaceHighest} strokeWidth={1} />
        )}
        {/* Area fill */}
        <Polygon points={areaPoints} fill={color} fillOpacity={0.15} />
        {/* Line */}
        <Polyline points={points} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* Points */}
        {values.map((v, i) =>
          <Circle key={i} cx={i * stepX} cy={H - v / max * (H - 16)} r={4} fill={DS.surfaceHigh} stroke={color} strokeWidth={2} />
        )}
        {/* Labels */}
        {values.map((_, i) =>
          <SvgText key={i} x={i * stepX} y={H + 16} fontSize="9" fill={DS.textMuted} textAnchor="middle">M{i + 1}</SvgText>
        )}
      </Svg>
    </Animated.View>
  );
}

function StatBento({ label, value, color }) {const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.bentoCard}>
      <View style={styles.bentoTop}>
        <View style={[styles.bentoDot, { backgroundColor: color }]} />
        <Text style={styles.bentoLbl}>{label}</Text>
      </View>
      <Text style={styles.bentoVal}>{value ?? '—'}</Text>
    </View>);
}

const BATTING_STATS = (s, DS) => [
{ label: 'Matches', value: s.matches, color: DS.lime },
{ label: 'Runs', value: s.runs, color: DS.coral },
{ label: 'Average', value: s.battingAverage ?? s.average, color: '#7c3aed' },
{ label: 'Strike Rate', value: s.battingStrikeRate ?? s.strikeRate, color: DS.blue },
{ label: '100s / 50s', value: `${s.centuries ?? 0}/${s.halfCenturies ?? 0}`, color: '#d97706' },
{ label: 'Highest', value: s.highestScore ?? '—', color: '#34d399' }];


const BOWLING_STATS = (s, DS) => [
{ label: 'Matches', value: s.matches, color: DS.lime },
{ label: 'Wickets', value: s.wickets, color: '#34d399' },
{ label: 'Bowling Avg', value: s.bowlingAverage ?? '—', color: DS.blue },
{ label: 'Economy', value: s.economy ?? '—', color: DS.coral },
{ label: 'Best Figures', value: s.bestBowling ?? '—', color: '#7c3aed' },
{ label: '5-wkt Hauls', value: s.fiveWickets ?? 0, color: '#d97706' }];

const FIELDING_STATS = (s, DS) => [
{ label: 'Matches', value: s.matches, color: DS.lime },
{ label: 'Catches', value: s.catches ?? 0, color: '#34d399' },
{ label: 'Run Outs', value: s.runOuts ?? 0, color: DS.blue },
{ label: 'Stumpings', value: s.stumpings ?? 0, color: DS.coral }];


export default function MyPerformanceScreen({ navigation, inline, onRegisterFab }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);const hideTabBar = useHideTabBarOnScroll();const tabClear = useTabBarClearance();
  const meUser = useCurrentUser();
  const [stats, setStats] = useState(null);
  // Panels come from the sport, not from cricket: football shows Attack /
  // Discipline, racquet sports Scoring / Errors, and so on.
  const sportId = getSelectedSport().sport?.id || 'cricket';
  const panels = getCareerPanels(sportId);
  const [tab, setTab] = useState(panels[0].id);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const shotRef = useRef(null);

  useLayoutEffect(() => {
    if (!inline) {
      navigation.setOptions({
        headerShown: true,
        headerBackVisible: true,
        headerTitle: 'My Performance',
      });
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

  useEffect(() => {
    // Only offer the share action once there are stats to share.
    if (inline && stats) onRegisterFab?.(shareCard);
  }, [inline, stats, onRegisterFab, shareCard]);

  const ACCENTS = [DS.lime, DS.coral, '#7c3aed', DS.blue, '#d97706', '#34d399'];
  const activePanel = panels.find((p) => p.id === tab) || panels[0];
  const tabStats = stats
    ? activePanel.rows.map((r, i) => ({ label: r.label, value: readStat(r, stats), color: ACCENTS[i % ACCENTS.length] }))
    : [];
  // Trend line: cricket has real per-match series; other sports don't yet, so
  // the chart is simply omitted rather than showing invented numbers.
  const chartSeries = sportId === 'cricket'
    ? (tab === 'batting' ? stats?.recentScores : tab === 'bowling' ? stats?.recentWickets : stats?.recentCatches)
    : null;
  const chartData = chartSeries || [];
  const chartColor = tab === 'batting' ? DS.lime : tab === 'bowling' ? DS.coral : DS.blue;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false} {...hideTabBar} contentContainerStyle={{ paddingBottom: tabClear }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} colors={[DS.lime]} />}>
      {/* Hero */}
      {!inline && (
        <View style={styles.hero}>
          <Icon name="chart-bar" size={20} color={DS.lime} />
          <Text style={styles.heroTitle}>My Performance</Text>
        </View>
      )}

      {/* View-mode toggle — a capsule segment, deliberately NOT an underline:
          underline = the swipeable Pavilion level, capsule = tap toggle here. */}
      <SegmentedControl
        options={panels.map((p) => ({ id: p.id, label: p.label }))}
        value={tab} onChange={setTab}
        style={{ marginHorizontal: 16, marginTop: 4, marginBottom: 12 }}
      />

      <View style={styles.body}>
        {loading ?
        <View style={styles.centered}>
            <ActivityIndicator size="large" color={DS.lime} />
          </View> :
        stats ?
        <ViewShot ref={shotRef} options={{ format: 'png', quality: 0.95 }} style={{ backgroundColor: DS.bg, gap: 10 }}>
            {/* Bento Grid */}
            <View style={styles.bentoGrid}>
              {tabStats.map((s) =>
            <StatBento key={s.label} label={s.label} value={s.value} color={s.color} />
            )}
            </View>

            {/* Trend — cricket only for now; other sports have no per-match
                series yet, and a chart of invented numbers is worse than none. */}
            {chartData.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>
                  {tab === 'batting' ? 'Recent Scores' : tab === 'bowling' ? 'Recent Wickets' : 'Recent Catches/Runouts'} — Last {chartData.length} Matches
                </Text>
                <PerformanceChart values={chartData} color={chartColor} />
              </View>
            )}

            {/* Branding footer — only meaningful once the card is shared out, but
                harmless (and a subtle attribution) in-app. */}
            <View style={styles.shareBrand}>
              <Icon name="cricket" size={13} color={DS.textMuted} />
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
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: DS.bg, paddingTop: 52, paddingBottom: 12, paddingHorizontal: 16
  },
  heroTitle: { fontSize: 24, fontWeight: '900', color: DS.textPrimary, letterSpacing: 0.5 },
  // (Sub-tab styles moved into the shared SegmentedControl component.)
  body: { paddingHorizontal: 16, paddingBottom: 28, gap: 10 },
  bentoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // Calm, uniform tile: one surface, a thin border, a small accent dot carrying
  // the stat's colour — instead of six full-tinted cards competing for attention.
  bentoCard: { width: "47.5%", backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border, paddingHorizontal: 14, paddingVertical: 13, gap: 10 },
  bentoTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  bentoDot: { width: 8, height: 8, borderRadius: 4 },
  bentoVal: { fontSize: 26, fontWeight: '900', color: DS.textPrimary, fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  bentoLbl: { fontSize: 10.5, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  chartCard: { backgroundColor: DS.surfaceHigh, borderRadius: 14, padding: 13 },
  chartTitle: { fontSize: 13, fontWeight: '700', color: DS.textPrimary, marginBottom: 10 },
  shareBrand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 4 },
  shareBrandText: { fontSize: 11, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.4 },
  emptyText: { fontSize: 16, color: DS.textVariant, marginTop: 12, fontWeight: '600' },
  emptySub: { fontSize: 13, color: DS.textMuted, marginTop: 6, textAlign: 'center', paddingHorizontal: 32, lineHeight: 19 },
  emptyCta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 24, borderWidth: 1.5, borderColor: DS.live },
  emptyCtaText: { fontSize: 14, fontWeight: '800', color: DS.live, letterSpacing: 0.3 }
});