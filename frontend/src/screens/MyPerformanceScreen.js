import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';

const DS = {
  bg: '#0f131f',
  surfaceLow: '#171b28',
  surfaceHigh: '#262a37',
  surfaceHighest: '#313442',
  lime: '#abd600',
  coral: '#ffb59e',
  blue: '#b7c4ff',
  textPrimary: '#dfe2f3',
  textVariant: '#c3c5d9',
  textMuted: '#8d90a2',
  live: '#ef4444',
};

const W = Dimensions.get('window').width - 48;

function PerformanceChart({ values, color }) {
  const H = 120;
  const max = Math.max(...values, 1);
  const stepX = W / Math.max(values.length - 1, 1);
  const points = values.map((v, i) => `${i * stepX},${H - (v / max) * (H - 16)}`).join(' ');
  return (
    <Svg width={W} height={H + 20}>
      {[0.25, 0.5, 0.75, 1].map((r, i) => (
        <Line key={i} x1={0} y1={H - r * (H - 16)} x2={W} y2={H - r * (H - 16)}
          stroke={DS.surfaceHighest} strokeWidth={1} />
      ))}
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2.5}
        strokeLinecap="round" strokeLinejoin="round" />
      {values.map((v, i) => (
        <Circle key={i} cx={i * stepX} cy={H - (v / max) * (H - 16)} r={4}
          fill={color} />
      ))}
      {values.map((_, i) => (
        <SvgText key={i} x={i * stepX} y={H + 16} fontSize="9"
          fill={DS.textMuted} textAnchor="middle">M{i + 1}</SvgText>
      ))}
    </Svg>
  );
}

function StatBento({ label, value, color }) {
  return (
    <View style={[styles.bentoCard, { backgroundColor: DS.surfaceHigh }]}>
      <View style={{ width: '100%', height: 3, backgroundColor: color, borderRadius: 2, marginBottom: 10 }} />
      <Text style={styles.bentoVal}>{value ?? '—'}</Text>
      <Text style={styles.bentoLbl}>{label}</Text>
    </View>
  );
}

const BATTING_STATS = (s) => [
  { label: 'Matches',     value: s.matches,                                   color: DS.lime },
  { label: 'Runs',        value: s.runs,                                       color: DS.coral },
  { label: 'Average',     value: s.battingAverage ?? s.average,               color: '#7c3aed' },
  { label: 'Strike Rate', value: s.battingStrikeRate ?? s.strikeRate,          color: DS.blue },
  { label: '100s / 50s',  value: `${s.centuries ?? 0}/${s.halfCenturies ?? 0}`, color: '#d97706' },
  { label: 'Highest',     value: s.highestScore ?? '—',                       color: '#34d399' },
];

const BOWLING_STATS = (s) => [
  { label: 'Matches',      value: s.matches,               color: DS.lime },
  { label: 'Wickets',      value: s.wickets,               color: '#34d399' },
  { label: 'Bowling Avg',  value: s.bowlingAverage ?? '—', color: DS.blue },
  { label: 'Economy',      value: s.economy ?? '—',        color: DS.coral },
  { label: 'Best Figures', value: s.bestBowling ?? '—',   color: '#7c3aed' },
  { label: '5-wkt Hauls',  value: s.fiveWickets ?? 0,     color: '#d97706' },
];

export default function MyPerformanceScreen() {
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState('batting');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    legendsApi.getUserStats().then(res => {
      if (res.success) setStats(res.data);
      setLoading(false);
    });
  }, []);

  const tabStats  = stats ? (tab === 'batting' ? BATTING_STATS(stats) : BOWLING_STATS(stats)) : [];
  const chartData = tab === 'batting'
    ? (stats?.recentScores  || [45, 60, 32, 78, 25, 90, 40, 65, 55, 72])
    : (stats?.recentWickets || [2, 4, 1, 3, 5, 2, 1, 4, 3, 2]);
  const chartColor = tab === 'batting' ? DS.lime : DS.coral;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Hero */}
      <View style={styles.hero}>
        <Icon name="chart-bar" size={20} color={DS.lime} />
        <Text style={styles.heroTitle}>My Performance</Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {['batting', 'bowling'].map(t => (
          <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}>
            <Icon name={t === 'batting' ? 'cricket' : 'weather-windy'} size={14}
              color={tab === t ? DS.bg : DS.textMuted} />
            <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.body}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={DS.lime} />
          </View>
        ) : stats ? (
          <>
            {/* Bento Grid */}
            <View style={styles.bentoGrid}>
              {tabStats.map(s => (
                <StatBento key={s.label} label={s.label} value={s.value} color={s.color} />
              ))}
            </View>

            {/* Chart */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>
                {tab === 'batting' ? 'Recent Scores' : 'Recent Wickets'} — Last {chartData.length} Matches
              </Text>
              <PerformanceChart values={chartData} color={chartColor} />
            </View>
          </>
        ) : (
          <View style={styles.centered}>
            <Icon name="chart-line" size={48} color={DS.textMuted} />
            <Text style={styles.emptyText}>No stats available yet</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 18, paddingHorizontal: 16,
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: DS.textPrimary },
  tabBar: {
    flexDirection: 'row', backgroundColor: DS.surfaceHigh,
    margin: 16, borderRadius: 16, padding: 4,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 12,
  },
  tabBtnActive: { backgroundColor: DS.lime },
  tabBtnText: { fontWeight: '700', fontSize: 13, color: DS.textMuted },
  tabBtnTextActive: { color: DS.bg },
  body: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  bentoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bentoCard: {
    width: '47%', borderRadius: 16,
    padding: 14,
  },
  bentoVal: { fontSize: 26, fontWeight: '900', color: DS.textPrimary, marginBottom: 4 },
  bentoLbl: { fontSize: 11, fontWeight: '600', color: DS.textMuted },
  chartCard: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16 },
  chartTitle: { fontSize: 13, fontWeight: '700', color: DS.textPrimary, marginBottom: 12 },
  emptyText: { fontSize: 16, color: DS.textVariant, marginTop: 12, fontWeight: '600' },
});
