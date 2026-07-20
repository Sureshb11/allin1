import React, { useEffect, useState, useLayoutEffect, useRef } from 'react';
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { useHideTabBarOnScroll, useTabBarClearance } from "../components/AutoHideTabBar";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, Animated } from 'react-native';
import Svg, { Polyline, Polygon, Circle, Line, Text as SvgText } from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport } from '../utils/selectedSport';

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

function StatBento({ label, value, color }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.bentoCard, { backgroundColor: color + '15', borderColor: color + '30', borderWidth: 1 }]}>
      <View style={{ width: '100%', height: 3, backgroundColor: color, borderRadius: 2, marginBottom: 10, opacity: 0.8 }} />
      <Text style={[styles.bentoVal, { color: color }]}>{value ?? '—'}</Text>
      <Text style={styles.bentoLbl}>{label}</Text>
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


export default function MyPerformanceScreen({ navigation, inline }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);const hideTabBar = useHideTabBarOnScroll();const tabClear = useTabBarClearance();
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState('batting');
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    if (!inline) {
      navigation.setOptions({
        headerShown: true,
        headerBackVisible: true,
        headerTitle: 'My Performance',
      });
    }
  }, [navigation, inline]);

  useEffect(() => {
    legendsApi.getUserStats(getSelectedSport().sport?.id).then((res) => {
      if (res.success) setStats(res.data);
      setLoading(false);
    });
  }, []);

  const tabStats = stats ? tab === 'batting' ? BATTING_STATS(stats, DS) : tab === 'bowling' ? BOWLING_STATS(stats, DS) : FIELDING_STATS(stats, DS) : [];
  const chartData = tab === 'batting' ?
  stats?.recentScores || [45, 60, 32, 78, 25, 90, 40, 65, 55, 72] :
  tab === 'bowling' ? stats?.recentWickets || [2, 4, 1, 3, 5, 2, 1, 4, 3, 2] :
  stats?.recentCatches || [0, 1, 0, 2, 1, 0, 0, 1, 0, 2];
  const chartColor = tab === 'batting' ? DS.lime : tab === 'bowling' ? DS.coral : DS.blue;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false} {...hideTabBar} contentContainerStyle={{ paddingBottom: tabClear }}>
      {/* Hero */}
      {!inline && (
        <View style={styles.hero}>
          <Icon name="chart-bar" size={20} color={DS.lime} />
          <Text style={styles.heroTitle}>My Performance</Text>
        </View>
      )}

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {['batting', 'bowling', 'fielding'].map((t) =>
        <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
        onPress={() => setTab(t)}>
            <Icon name={t === 'batting' ? 'cricket' : t === 'bowling' ? 'weather-windy' : 'shield-account'} size={14}
          color={tab === t ? DS.bg : DS.textMuted} />
            <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.body}>
        {loading ?
        <View style={styles.centered}>
            <ActivityIndicator size="large" color={DS.lime} />
          </View> :
        stats ?
        <>
            {/* Bento Grid */}
            <View style={styles.bentoGrid}>
              {tabStats.map((s) =>
            <StatBento key={s.label} label={s.label} value={s.value} color={s.color} />
            )}
            </View>

            {/* Chart */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>
                {tab === 'batting' ? 'Recent Scores' : tab === 'bowling' ? 'Recent Wickets' : 'Recent Catches/Runouts'} — Last {chartData.length} Matches
              </Text>
              <PerformanceChart values={chartData} color={chartColor} />
            </View>
          </> :

        <View style={styles.centered}>
            <Icon name="chart-line" size={48} color={DS.textMuted} />
            <Text style={styles.emptyText}>No stats available yet</Text>
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
  tabBar: {
    flexDirection: 'row', backgroundColor: DS.surfaceLow,
    marginHorizontal: 16, marginTop: 4, marginBottom: 12,
    borderRadius: 14, padding: 4,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, backgroundColor: 'transparent',
  },
  tabBtnActive: { backgroundColor: DS.lime, shadowColor: DS.lime, shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  tabBtnText: { fontWeight: '700', fontSize: 13, color: DS.textMuted },
  tabBtnTextActive: { color: DS.bg },
  body: { paddingHorizontal: 16, paddingBottom: 28, gap: 10 },
  bentoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bentoCard: { width: "47%", borderRadius: 14, padding: 11 },
  bentoVal: { fontSize: 22, fontWeight: '900', color: DS.textPrimary, marginBottom: 4 },
  bentoLbl: { fontSize: 11, fontWeight: '600', color: DS.textMuted },
  chartCard: { backgroundColor: DS.surfaceHigh, borderRadius: 14, padding: 13 },
  chartTitle: { fontSize: 13, fontWeight: '700', color: DS.textPrimary, marginBottom: 10 },
  emptyText: { fontSize: 16, color: DS.textVariant, marginTop: 12, fontWeight: '600' }
});