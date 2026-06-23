import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

function StatCard({ icon, label, value, color }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.statCard}>
      <Icon name={icon} size={24} color={color || DS.lime} />
      <Text style={styles.statValue}>{value ?? '—'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ProgressBar({ value, max, color }) {
  const DS = useTheme().colors;
  const pbStyles = useThemedStyles(makePbStyles);
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <View style={pbStyles.track}>
      <View style={[pbStyles.fill, { width: `${pct}%`, backgroundColor: color || DS.lime }]} />
    </View>
  );
}
const makePbStyles = (DS) => StyleSheet.create({
  track: { height: 6, backgroundColor: DS.surfaceHighest, borderRadius: 3, flex: 1, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});

const makeFormColors = (DS) => ({ W: DS.success, L: DS.live, T: '#f59e0b' });

export default function TeamInsightsScreen({ route, navigation }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const FORM_COLORS = makeFormColors(DS);
  const { teamId } = route.params || {};
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    legendsApi.getTeamInsights(teamId).then(res => {
      if (res.success) setData(res.data);
      setLoading(false);
    });
  }, [teamId]);

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={DS.lime} /></View>;
  }

  if (!data) {
    return (
      <View style={styles.centered}>
        <Icon name="alert-circle-outline" size={48} color={DS.live} />
        <Text style={styles.emptyText}>Could not load team insights</Text>
      </View>
    );
  }

  const { team, stats, form, topBatters, topBowlers } = data;
  const maxBatterRuns = Math.max(...(topBatters || []).map(b => b.runs), 1);
  const maxBowlerWkts = Math.max(...(topBowlers || []).map(b => b.wickets), 1);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={DS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{team?.name}</Text>
          <Text style={styles.headerSub}>Team Insights</Text>
        </View>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerAvatarText}>{team?.name?.charAt(0).toUpperCase()}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statsRow}>
          <StatCard icon="trophy" label="Wins" value={stats?.won} color={DS.success} />
          <StatCard icon="close-circle-outline" label="Losses" value={stats?.lost} color={DS.live} />
          <StatCard icon="percent" label="Win Rate" value={stats?.winRate != null ? `${stats.winRate}%` : '—'} color={DS.blue} />
          <StatCard icon="cricket" label="Played" value={stats?.played} color={DS.textMuted} />
        </View>

        {stats?.played > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Win / Loss Ratio</Text>
            <View style={styles.ratioRow}>
              <View style={[styles.ratioFill, { flex: stats.won, backgroundColor: DS.success }]}>
                {stats.won > 0 && <Text style={styles.ratioText}>{stats.won}W</Text>}
              </View>
              <View style={[styles.ratioFill, { flex: stats.lost, backgroundColor: DS.live }]}>
                {stats.lost > 0 && <Text style={styles.ratioText}>{stats.lost}L</Text>}
              </View>
            </View>
          </View>
        )}

        {(form || []).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Form (Last {form.length})</Text>
            <View style={styles.formRow}>
              {form.map((f, i) => (
                <View key={i} style={[styles.formChip, { backgroundColor: FORM_COLORS[f.result] || DS.textMuted }]}>
                  <Text style={styles.formChipText}>{f.result}</Text>
                </View>
              ))}
            </View>
            {form.map((f, i) => (
              <View key={i} style={styles.matchRow}>
                <View style={[styles.resultDot, { backgroundColor: FORM_COLORS[f.result] }]} />
                <Text style={styles.matchOpponent} numberOfLines={1}>vs {f.opponent?.name || 'Unknown'}</Text>
                <Text style={styles.matchResult}>{f.result === 'W' ? 'Won' : 'Lost'}</Text>
              </View>
            ))}
          </View>
        )}

        {(topBatters || []).length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="cricket" size={18} color={DS.lime} />
              <Text style={styles.sectionTitle}>Top Batters</Text>
            </View>
            {topBatters.map((b, i) => (
              <View key={i} style={styles.performerRow}>
                <View style={styles.performerLeft}>
                  <View style={[styles.rankNum, i < 3 && { backgroundColor: ['#FFD700', '#C0C0C0', '#CD7F32'][i] }]}>
                    <Text style={styles.rankNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.performerName} numberOfLines={1}>{b.player?.name || 'Unknown'}</Text>
                </View>
                <ProgressBar value={b.runs} max={maxBatterRuns} color={DS.lime} />
                <View style={styles.performerRight}>
                  <Text style={styles.performerMain}>{b.runs}</Text>
                  <Text style={styles.performerSub}>avg {b.average}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {(topBowlers || []).length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="weather-windy" size={18} color={DS.blue} />
              <Text style={styles.sectionTitle}>Top Bowlers</Text>
            </View>
            {topBowlers.map((b, i) => (
              <View key={i} style={styles.performerRow}>
                <View style={styles.performerLeft}>
                  <View style={[styles.rankNum, i < 3 && { backgroundColor: ['#FFD700', '#C0C0C0', '#CD7F32'][i] }]}>
                    <Text style={styles.rankNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.performerName} numberOfLines={1}>{b.player?.name || 'Unknown'}</Text>
                </View>
                <ProgressBar value={b.wickets} max={maxBowlerWkts} color={DS.blue} />
                <View style={styles.performerRight}>
                  <Text style={styles.performerMain}>{b.wickets}w</Text>
                  <Text style={styles.performerSub}>eco {b.economy}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {team && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Team Details</Text>
            {[
              { icon: 'map-marker-outline', label: 'City', value: team.city },
              { icon: 'shield-outline', label: 'Home Ground', value: team.homeGround },
              { icon: 'palette-outline', label: 'Colors', value: team.colors },
              { icon: 'calendar', label: 'Founded', value: team.foundedYear },
            ].filter(d => d.value).map(({ icon, label, value }) => (
              <View key={label} style={styles.detailRow}>
                <Icon name={icon} size={16} color={DS.textMuted} />
                <Text style={styles.detailLabel}>{label}</Text>
                <Text style={styles.detailValue}>{value}</Text>
              </View>
            ))}
            {!!team.bio && <Text style={styles.bioText}>{team.bio}</Text>}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surfaceLow, paddingTop: 48, paddingBottom: 14, paddingHorizontal: 16, gap: 8 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: DS.textPrimary },
  headerSub: { fontSize: 12, color: DS.textMuted },
  headerAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center' },
  headerAvatarText: { fontSize: 18, fontWeight: '800', color: DS.bg },
  content: { padding: 16, gap: 12 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 12, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 18, fontWeight: '800', color: DS.textPrimary },
  statLabel: { fontSize: 11, color: DS.textMuted, textAlign: 'center' },
  section: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16, gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: DS.textPrimary },
  ratioRow: { flexDirection: 'row', height: 28, borderRadius: 8, overflow: 'hidden' },
  ratioFill: { justifyContent: 'center', alignItems: 'center', minWidth: 4 },
  ratioText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  formRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  formChip: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  formChipText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  resultDot: { width: 8, height: 8, borderRadius: 4 },
  matchOpponent: { flex: 1, fontSize: 13, color: DS.textPrimary },
  matchResult: { fontSize: 12, color: DS.textMuted },
  performerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  performerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 130 },
  rankNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  rankNumText: { fontSize: 11, color: '#fff', fontWeight: '800' },
  performerName: { flex: 1, fontSize: 12, color: DS.textPrimary, fontWeight: '600' },
  performerRight: { width: 60, alignItems: 'flex-end' },
  performerMain: { fontSize: 14, fontWeight: '700', color: DS.textPrimary },
  performerSub: { fontSize: 11, color: DS.textMuted },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  detailLabel: { fontSize: 13, color: DS.textMuted, width: 80 },
  detailValue: { flex: 1, fontSize: 13, fontWeight: '500', color: DS.textPrimary },
  bioText: { fontSize: 13, color: DS.textVariant, lineHeight: 20, paddingTop: 8, marginTop: 4 },
  emptyText: { fontSize: 18, fontWeight: '700', color: DS.textVariant, marginTop: 12 },
});
