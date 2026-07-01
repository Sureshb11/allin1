import { useTheme, useThemedStyles } from "../theme/ThemeContext";import { useState, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from
'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';














const TABS = ['Batting', 'Bowling', 'Run Rate', 'Extras'];

function ProgressBar({ value, max, color }) {
  const DS = useTheme().colors;
  const pbStyles = useThemedStyles(makePbStyles);
  const pct = max > 0 ? Math.min(value / max * 100, 100) : 0;
  return (
    <View style={pbStyles.track}>
      <View style={[pbStyles.fill, { width: `${pct}%`, backgroundColor: color || DS.lime }]} />
    </View>);

}
const makePbStyles = (DS) => StyleSheet.create({
  track: { height: 6, backgroundColor: DS.surfaceHighest, borderRadius: 3, overflow: 'hidden', flex: 1 },
  fill: { height: '100%', borderRadius: 3 }
});

export default function MatchInsightsScreen({ route, navigation }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const { matchId } = route.params || {};
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Batting');
  const [activeInning, setActiveInning] = useState(0);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: 'Match Insights',
    });
  }, [navigation]);

  useEffect(() => {
    legendsApi.getMatchInsights(matchId).then((res) => {
      if (res.success) setInsights(res.data);
      setLoading(false);
    });
  }, [matchId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={DS.lime} />
      </View>);

  }

  if (!insights || !insights.innings?.length) {
    return (
      <View style={styles.centered}>
        <Icon name="chart-line-variant" size={48} color={DS.textMuted} />
        <Text style={styles.emptyText}>No insights available yet</Text>
        <Text style={styles.emptySubText}>Insights appear after balls are recorded</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backFab}>
          <Icon name="arrow-left" size={18} color={DS.bg} />
          <Text style={styles.backFabText}>Go Back</Text>
        </TouchableOpacity>
      </View>);

  }

  const inning = insights.innings[activeInning];
  const maxRuns = Math.max(...(inning.batting || []).map((b) => b.runs), 1);
  const maxWkts = Math.max(...(inning.bowling || []).map((b) => b.wickets), 1);

  const renderBatting = () =>
  <View style={styles.section}>
      {(inning.batting || []).map((b, i) =>
    <View key={i} style={styles.statRow}>
          <View style={styles.playerCol}>
            <View style={[styles.rankBadge, i < 3 && { backgroundColor: ['#FFD700', '#C0C0C0', '#CD7F32'][i] }]}>
              <Icon name="cricket" size={10} color={DS.bg} />
            </View>
            <Text style={styles.playerName} numberOfLines={1}>{b.player?.name || 'Unknown'}</Text>
            {b.isOut && <Icon name="close-circle" size={14} color={DS.coral} />}
          </View>
          <View style={styles.barCol}>
            <ProgressBar value={b.runs} max={maxRuns} color={DS.blue} />
          </View>
          <View style={styles.statsCol}>
            <Text style={styles.mainStat}>{b.runs}</Text>
            <Text style={styles.subStat}>{b.balls}b · SR {b.strikeRate}</Text>
          </View>
          <View style={styles.extraStats}>
            {b.fours > 0 && <Text style={styles.extraStatText}>{b.fours}×4</Text>}
            {b.sixes > 0 && <Text style={[styles.extraStatText, { color: DS.lime }]}>{b.sixes}×6</Text>}
          </View>
        </View>
    )}
    </View>;


  const renderBowling = () =>
  <View style={styles.section}>
      {(inning.bowling || []).map((b, i) =>
    <View key={i} style={styles.statRow}>
          <View style={styles.playerCol}>
            <View style={[styles.rankBadge, { backgroundColor: DS.blue }]}>
              <Icon name="weather-windy" size={10} color={DS.bg} />
            </View>
            <Text style={styles.playerName} numberOfLines={1}>{b.player?.name || 'Unknown'}</Text>
          </View>
          <View style={styles.barCol}>
            <ProgressBar value={b.wickets} max={maxWkts} color={DS.lime} />
          </View>
          <View style={styles.statsCol}>
            <Text style={styles.mainStat}>{b.wickets}w</Text>
            <Text style={styles.subStat}>{b.overs}ov · Eco {b.economy}</Text>
          </View>
          <View style={styles.extraStats}>
            {b.wides > 0 && <Text style={styles.extraStatText}>{b.wides}wd</Text>}
            {b.noBalls > 0 && <Text style={[styles.extraStatText, { color: DS.coral }]}>{b.noBalls}nb</Text>}
          </View>
        </View>
    )}
    </View>;


  const renderRunRate = () =>
  <View style={styles.section}>
      {(inning.runRate || []).map((o, i) =>
    <View key={i} style={styles.rrRow}>
          <Text style={styles.rrOver}>Ov {o.over}</Text>
          <View style={{ flex: 1, marginHorizontal: 8 }}>
            <ProgressBar value={o.runs} max={24} color={o.wickets > 0 ? DS.coral : '#6ee76e'} />
          </View>
          <Text style={styles.rrRuns}>{o.runs}</Text>
          {o.wickets > 0 && <Icon name="close-circle" size={14} color={DS.coral} />}
        </View>
    )}
      {(inning.runRate || []).length === 0 &&
    <View style={styles.empty}>
          <Icon name="chart-bar" size={36} color={DS.textMuted} />
          <Text style={styles.emptyText}>No over data yet</Text>
        </View>
    }
    </View>;


  const renderExtras = () => {
    const ex = inning.extras || {};
    const total = (ex.wides || 0) + (ex.noBalls || 0) + (ex.byes || 0) + (ex.legByes || 0);
    const items = [
    { label: 'Wides', value: ex.wides || 0, icon: 'arrow-expand-horizontal', color: DS.coral },
    { label: 'No Balls', value: ex.noBalls || 0, icon: 'close-circle-outline', color: '#ff4d4d' },
    { label: 'Byes', value: ex.byes || 0, icon: 'skip-next-circle-outline', color: DS.blue },
    { label: 'Leg Byes', value: ex.legByes || 0, icon: 'human-male', color: DS.lime }];

    return (
      <View style={styles.section}>
        <Text style={styles.extrasTotal}>Total Extras: {total}</Text>
        {items.map(({ label, value, icon, color }) =>
        <View key={label} style={styles.extrasRow}>
            <View style={styles.extrasLabel}>
              <Icon name={icon} size={16} color={color} />
              <Text style={styles.extrasLabelText}>{label}</Text>
            </View>
            <ProgressBar value={value} max={Math.max(total, 1)} color={color} />
            <Text style={[styles.extrasValue, { color }]}>{value}</Text>
          </View>
        )}
      </View>);

  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={DS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{insights.team1?.name} vs {insights.team2?.name}</Text>
          <Text style={styles.headerSub}>Match Insights</Text>
        </View>
      </View>

      {/* Inning Selector */}
      {insights.innings.length > 1 &&
      <View style={styles.inningSelector}>
          {insights.innings.map((inn, i) =>
        <TouchableOpacity
          key={i}
          style={[styles.inningBtn, activeInning === i && styles.inningBtnActive]}
          onPress={() => setActiveInning(i)}>
          
              <Text style={[styles.inningBtnText, activeInning === i && styles.inningBtnTextActive]}>
                {inn.battingTeam?.name || `Inning ${i + 1}`}
              </Text>
              <Text style={[styles.inningScore, activeInning === i && { color: DS.lime }]}>
                {inn.totalRuns}/{inn.totalWickets}
              </Text>
            </TouchableOpacity>
        )}
        </View>
      }

      {/* Tab Bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent}>
        {TABS.map((t) =>
        <TouchableOpacity key={t} style={[styles.tab, activeTab === t && styles.tabActive]} onPress={() => setActiveTab(t)}>
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Inning Summary */}
        <View style={styles.inningSummary}>
          <Text style={styles.inningSummaryTeam}>{inning.battingTeam?.name}</Text>
          <Text style={styles.inningSummaryScore}>{inning.totalRuns}/{inning.totalWickets}</Text>
          <Text style={styles.inningSummaryVs}>vs {inning.bowlingTeam?.name}</Text>
        </View>

        {activeTab === 'Batting' && renderBatting()}
        {activeTab === 'Bowling' && renderBowling()}
        {activeTab === 'Run Rate' && renderRunRate()}
        {activeTab === 'Extras' && renderExtras()}
      </ScrollView>
    </View>);

}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: DS.bg },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surfaceLow, paddingTop: 48, paddingBottom: 14, paddingHorizontal: 16, gap: 8 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: DS.textPrimary },
  headerSub: { fontSize: 11, color: DS.textMuted },
  inningSelector: { flexDirection: 'row', backgroundColor: DS.surfaceLow },
  inningBtn: { flex: 1, padding: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  inningBtnActive: { backgroundColor: DS.surfaceHigh, borderBottomColor: DS.lime },
  inningBtnText: { fontSize: 11, color: DS.textMuted, fontWeight: '600' },
  inningBtnTextActive: { color: DS.textPrimary },
  inningScore: { fontSize: 13, fontWeight: '700', color: DS.textMuted, marginTop: 2 },
  tabs: { backgroundColor: DS.surfaceLow },
  tabsContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: DS.surfaceHigh },
  tabActive: { backgroundColor: DS.lime },
  tabText: { fontSize: 11, color: DS.textMuted, fontWeight: '700' },
  tabTextActive: { color: DS.bg },
  inningSummary: { backgroundColor: DS.surfaceHighest, borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 12 },
  inningSummaryTeam: { fontSize: 12, color: DS.textMuted },
  inningSummaryScore: { fontSize: 36, fontWeight: '800', color: DS.textPrimary },
  inningSummaryVs: { fontSize: 11, color: DS.textMuted },
  section: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16, gap: 10 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playerCol: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 120 },
  rankBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: DS.textMuted, alignItems: 'center', justifyContent: 'center' },
  playerName: { flex: 1, fontSize: 11, color: DS.textPrimary, fontWeight: '600' },
  barCol: { flex: 1 },
  statsCol: { width: 70, alignItems: 'flex-end' },
  mainStat: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },
  subStat: { fontSize: 11, color: DS.textMuted },
  extraStats: { flexDirection: 'row', gap: 4, width: 55, justifyContent: 'flex-end' },
  extraStatText: { fontSize: 11, color: DS.blue, fontWeight: '700' },
  rrRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  rrOver: { fontSize: 11, color: DS.textMuted, width: 32 },
  rrRuns: { fontSize: 13, fontWeight: '700', color: DS.textPrimary, width: 24, textAlign: 'right' },
  extrasTotal: { fontSize: 16, fontWeight: '700', color: DS.textPrimary, marginBottom: 8 },
  extrasRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  extrasLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 100 },
  extrasLabelText: { fontSize: 12, color: DS.textMuted },
  extrasValue: { fontSize: 13, fontWeight: '700', width: 24, textAlign: 'right' },
  empty: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { fontSize: 18, fontWeight: '700', color: DS.textMuted, marginTop: 10 },
  emptySubText: { fontSize: 12, color: DS.textMuted, marginTop: 4 },
  backFab: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20, backgroundColor: DS.lime, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  backFabText: { fontSize: 14, fontWeight: '600', color: DS.bg }
});