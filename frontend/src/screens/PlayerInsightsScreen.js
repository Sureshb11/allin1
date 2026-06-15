import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
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

function BentoCard({ label, value, color = DS.lime, icon }) {
  return (
    <View style={[styles.bentoCard, { borderTopColor: color }]}>
      {icon && <Icon name={icon} size={16} color={color} style={{ marginBottom: 4 }} />}
      <Text style={styles.bentoVal}>{value ?? '—'}</Text>
      <Text style={styles.bentoLbl}>{label}</Text>
    </View>
  );
}

function Section({ title, icon, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon && <Icon name={icon} size={16} color={DS.lime} />}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const TREND_CONFIG = {
  upward:   { icon: 'trending-up',    color: DS.lime,  label: 'Improving'  },
  downward: { icon: 'trending-down',  color: DS.live,  label: 'Declining'  },
  stable:   { icon: 'trending-neutral', color: DS.coral, label: 'Stable'   },
};

export default function PlayerInsightsScreen({ route, navigation }) {
  const { playerId } = route.params || {};
  const [insights, setInsights] = useState({});
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    legendsApi.getPlayerInsights(playerId)
      .then(res => { if (res.success) setInsights(res.data); })
      .finally(() => setLoading(false));
  }, [playerId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={DS.lime} />
      </View>
    );
  }

  const stats = insights.statistics || {};
  const perf  = insights.performance || {};
  const trend = TREND_CONFIG[perf.trend] || TREND_CONFIG.stable;

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        {navigation && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-left" size={22} color={DS.textPrimary} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Player Insights</Text>
          <Text style={styles.heroSub}>Performance analytics</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.body}>
          {/* Overview strip */}
          <View style={styles.overviewRow}>
            <View style={styles.formChip}>
              <Text style={[styles.formLabel, perf.recentForm === 'Good' ? { color: DS.lime } : { color: DS.live }]}>
                {perf.recentForm || 'N/A'}
              </Text>
              <Text style={styles.formSub}>Recent Form</Text>
            </View>
            <View style={styles.trendChip}>
              <Icon name={trend.icon} size={22} color={trend.color} />
              <Text style={[styles.trendLabel, { color: trend.color }]}>{trend.label}</Text>
              <Text style={styles.formSub}>Trend</Text>
            </View>
            <View style={styles.formChip}>
              <Text style={styles.formLabel}>{stats.matches ?? 0}</Text>
              <Text style={styles.formSub}>Matches</Text>
            </View>
          </View>

          {/* Batting bento grid */}
          <Section title="Batting" icon="cricket">
            <View style={styles.bentoGrid}>
              <BentoCard label="Runs"        value={stats.totalRuns}       color={DS.coral}  icon="cricket" />
              <BentoCard label="Average"     value={stats.battingAverage}  color={DS.lime}   icon="chart-line" />
              <BentoCard label="Strike Rate" value={stats.strikeRate}      color="#c4b5fd"    icon="lightning-bolt" />
              <BentoCard label="4s / 6s"    value={stats.fours != null ? `${stats.fours}/${stats.sixes ?? 0}` : null}
                color={DS.blue} icon="numeric" />
            </View>
          </Section>

          {/* Bowling bento grid */}
          <Section title="Bowling" icon="weather-windy">
            <View style={styles.bentoGrid}>
              <BentoCard label="Wickets"      value={stats.wicketsTaken}   color={DS.lime}   icon="weather-windy" />
              <BentoCard label="Bowling Avg"  value={stats.bowlingAverage} color={DS.coral}   icon="numeric" />
              <BentoCard label="Economy"      value={stats.economy}        color={DS.blue}    icon="speedometer" />
              <BentoCard label="Overs"        value={stats.oversBowled}    color="#7dd3fc"     icon="timer-outline" />
            </View>
          </Section>

          {/* Strengths & Improvements */}
          <Section title="Analysis" icon="chart-donut">
            <View style={styles.analysisRow}>
              <View style={styles.strengthBox}>
                <View style={styles.analysisHeader}>
                  <Icon name="star-circle" size={14} color={DS.lime} />
                  <Text style={[styles.analysisTitle, { color: DS.lime }]}>Strong Points</Text>
                </View>
                {(perf.strongPoints || []).length > 0
                  ? perf.strongPoints.map((p, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <View style={[styles.bullet, { backgroundColor: DS.lime }]} />
                      <Text style={styles.bulletText}>{p}</Text>
                    </View>
                  ))
                  : <Text style={styles.emptyText}>No data yet</Text>}
              </View>
              <View style={styles.improveBox}>
                <View style={styles.analysisHeader}>
                  <Icon name="arrow-up-circle" size={14} color={DS.coral} />
                  <Text style={[styles.analysisTitle, { color: DS.coral }]}>To Improve</Text>
                </View>
                {(perf.improvementAreas || []).length > 0
                  ? perf.improvementAreas.map((a, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <View style={[styles.bullet, { backgroundColor: DS.coral }]} />
                      <Text style={styles.bulletText}>{a}</Text>
                    </View>
                  ))
                  : <Text style={styles.emptyText}>No data yet</Text>}
              </View>
            </View>
          </Section>

          {/* Recommendations */}
          <Section title="Recommendations" icon="lightbulb-outline">
            {(insights.recommendations || []).length > 0
              ? insights.recommendations.map((rec, i) => (
                <View key={i} style={styles.recRow}>
                  <View style={styles.recNum}>
                    <Text style={styles.recNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.recText}>{rec}</Text>
                </View>
              ))
              : (
                <View style={styles.emptyState}>
                  <Icon name="cricket" size={36} color={DS.textMuted} />
                  <Text style={styles.emptyStateText}>Play more matches to get recommendations</Text>
                </View>
              )}
          </Section>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 18, paddingHorizontal: 16,
  },
  backBtn: { padding: 4 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: DS.textPrimary },
  heroSub: { fontSize: 12, color: DS.textMuted, marginTop: 2 },

  body: { padding: 16, gap: 12, paddingBottom: 32 },

  overviewRow: {
    flexDirection: 'row', backgroundColor: DS.surfaceHigh, borderRadius: 16,
  },
  formChip: { flex: 1, alignItems: 'center', paddingVertical: 16, gap: 4 },
  trendChip: { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 2,
    backgroundColor: DS.surfaceHighest, borderRadius: 12, marginVertical: 4 },
  formLabel: { fontSize: 18, fontWeight: '900', color: DS.textPrimary },
  trendLabel: { fontSize: 12, fontWeight: '700' },
  formSub: { fontSize: 10, color: DS.textMuted, fontWeight: '600' },

  section: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16, gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: DS.textPrimary },

  bentoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bentoCard: {
    width: '47%', backgroundColor: DS.surfaceLow, borderRadius: 12,
    borderTopWidth: 3, padding: 12,
  },
  bentoVal: { fontSize: 22, fontWeight: '900', color: DS.textPrimary, marginBottom: 2 },
  bentoLbl: { fontSize: 11, color: DS.textVariant, fontWeight: '600' },

  analysisRow: { flexDirection: 'row', gap: 10 },
  strengthBox: { flex: 1, gap: 6 },
  improveBox: { flex: 1, gap: 6 },
  analysisHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  analysisTitle: { fontSize: 12, fontWeight: '800' },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  bulletText: { flex: 1, fontSize: 12, color: DS.textPrimary, lineHeight: 18 },
  emptyText: { fontSize: 12, color: DS.textMuted, fontStyle: 'italic' },

  recRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  recNum: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  recNumText: { fontSize: 11, fontWeight: '900', color: DS.bg },
  recText: { flex: 1, fontSize: 13, color: DS.textPrimary, lineHeight: 20 },

  emptyState: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyStateText: { fontSize: 13, color: DS.textVariant, textAlign: 'center' },
});
