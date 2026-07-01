import { useState, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, FlatList,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';

const TABS = ['Overview', 'Points Table', 'Schedule'];

const makeStatusColors = (DS) => ({
  upcoming: { bg: DS.surfaceHighest, text: DS.coral },
  ongoing: { bg: '#1a2e1a', text: '#6ee76e' },
  completed: { bg: DS.surfaceHigh, text: DS.textMuted },
});

export default function TournamentDetailScreen({ route, navigation }) {
  const DS = useTheme().colors;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: 'Tournament',
    });
  }, [navigation]);
  const styles = useThemedStyles(makeStyles);
  const STATUS_COLORS = makeStatusColors(DS);
  const { tournamentId } = route.params || {};
  const [tournament, setTournament] = useState(null);
  const [pointsTable, setPointsTable] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [activeTab, setActiveTab] = useState('Overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [tRes, ptRes, schRes] = await Promise.all([
        legendsApi.getTournament(tournamentId),
        legendsApi.getTournamentPointsTable(tournamentId),
        legendsApi.getTournamentSchedule(tournamentId),
      ]);
      if (tRes.success) setTournament(tRes.data);
      if (ptRes.success) setPointsTable(ptRes.data);
      if (schRes.success) setSchedule(schRes.data);
      setLoading(false);
    };
    load();
  }, [tournamentId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={DS.lime} />
      </View>
    );
  }

  if (!tournament) {
    return (
      <View style={styles.centered}>
        <Icon name="alert-circle-outline" size={48} color={DS.coral} />
        <Text style={styles.errorText}>Tournament not found</Text>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[tournament.status] || STATUS_COLORS.upcoming;

  const renderOverview = () => (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {/* Info Grid */}
      <View style={styles.infoGrid}>
        {[
          { icon: 'trophy-outline', label: 'Format', value: tournament.format },
          { icon: 'account-group-outline', label: 'Teams', value: `${(tournament.teams || []).length} / ${tournament.maxTeams || '—'}` },
          { icon: 'map-marker-outline', label: 'Venue', value: tournament.venue || 'TBD' },
          { icon: 'calendar-start', label: 'Start', value: tournament.startDate ? new Date(tournament.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD' },
          { icon: 'calendar-end', label: 'End', value: tournament.endDate ? new Date(tournament.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD' },
          { icon: 'currency-inr', label: 'Prize Pool', value: tournament.prizePool || 'TBD' },
        ].map(({ icon, label, value }) => (
          <View key={label} style={styles.infoCard}>
            <Icon name={icon} size={20} color={DS.lime} />
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue}>{value || '—'}</Text>
          </View>
        ))}
      </View>

      {!!tournament.description && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.descText}>{tournament.description}</Text>
        </View>
      )}

      {!!tournament.organizer && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Organizer</Text>
          <View style={styles.organizerRow}>
            <Icon name="account-tie" size={18} color={DS.blue} />
            <Text style={styles.organizerText}>{tournament.organizer}</Text>
          </View>
        </View>
      )}

      {/* Registered Teams */}
      {(tournament.teams || []).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Registered Teams</Text>
          {tournament.teams.map(({ team, group }) => (
            <View key={team.id} style={styles.teamRow}>
              <View style={styles.teamAvatar}>
                <Text style={styles.teamAvatarText}>{team.name?.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.teamName}>{team.name}</Text>
              <View style={styles.groupBadge}>
                <Text style={styles.groupText}>Grp {group}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );

  const renderPointsTable = () => (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {/* Table Header */}
      <View style={[styles.ptRow, styles.ptHeader]}>
        <Text style={[styles.ptCell, styles.ptTeamCell, styles.ptHeaderText]}>#  Team</Text>
        <Text style={[styles.ptNum, styles.ptHeaderText]}>P</Text>
        <Text style={[styles.ptNum, styles.ptHeaderText]}>W</Text>
        <Text style={[styles.ptNum, styles.ptHeaderText]}>L</Text>
        <Text style={[styles.ptNum, styles.ptHeaderText]}>Pts</Text>
        <Text style={[styles.ptNum, styles.ptHeaderText]}>NRR</Text>
      </View>
      {pointsTable.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="table-large" size={36} color={DS.textMuted} />
          <Text style={styles.emptyText}>Points table not available</Text>
        </View>
      ) : (
        pointsTable.map((row, idx) => (
          <View key={row.teamId} style={[styles.ptRow, idx % 2 === 0 && styles.ptRowAlt]}>
            <View style={[styles.ptCell, styles.ptTeamCell]}>
              <Text style={[styles.ptNum, { color: DS.textMuted, width: 20 }]}>{idx + 1}</Text>
              <View style={styles.ptAvatar}>
                <Text style={styles.ptAvatarText}>{row.team?.name?.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.ptTeamName} numberOfLines={1}>{row.team?.name}</Text>
            </View>
            <Text style={styles.ptNum}>{row.played}</Text>
            <Text style={styles.ptNum}>{row.won}</Text>
            <Text style={styles.ptNum}>{row.lost}</Text>
            <Text style={[styles.ptNum, styles.ptBold]}>{row.points}</Text>
            <Text style={[styles.ptNum, { color: row.nrr >= 0 ? '#6ee76e' : DS.coral }]}>
              {row.nrr >= 0 ? '+' : ''}{(row.nrr || 0).toFixed(3)}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );

  const renderSchedule = () => (
    <FlatList
      data={schedule}
      keyExtractor={i => i.id}
      contentContainerStyle={styles.tabContent}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Icon name="calendar-blank-outline" size={36} color={DS.textMuted} />
          <Text style={styles.emptyText}>No fixtures scheduled</Text>
        </View>
      }
      renderItem={({ item }) => {
        const STATUS_C = { scheduled: DS.coral, live: '#ff4d4d', completed: '#6ee76e' };
        return (
          <View style={styles.fixtureCard}>
            <View style={styles.fixtureMeta}>
              {!!item.round && <Text style={styles.roundText}>{item.round}</Text>}
              {!!item.scheduledAt && (
                <Text style={styles.dateText}>
                  {new Date(item.scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  {'  '}
                  {new Date(item.scheduledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}
            </View>
            <View style={styles.fixtureTeams}>
              <Text style={styles.fixtureTeamName} numberOfLines={1}>{item.team1?.name || 'TBD'}</Text>
              <View style={[styles.vsChip, { backgroundColor: STATUS_C[item.status] || DS.coral }]}>
                <Text style={styles.vsText}>{item.status === 'live' ? 'LIVE' : 'VS'}</Text>
              </View>
              <Text style={styles.fixtureTeamName} numberOfLines={1}>{item.team2?.name || 'TBD'}</Text>
            </View>
            {!!item.venue && (
              <View style={styles.venueRow}>
                <Icon name="map-marker-outline" size={12} color={DS.textMuted} />
                <Text style={styles.venueText}>{item.venue}</Text>
              </View>
            )}
          </View>
        );
      }}
    />
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={DS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{tournament.name}</Text>
          <View style={[styles.statusChip, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.statusText, { color: statusColor.text }]}>{tournament.status?.toUpperCase()}</Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map(t => (
          <TouchableOpacity key={t} style={[styles.tab, activeTab === t && styles.tabActive]} onPress={() => setActiveTab(t)}>
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'Overview' && renderOverview()}
      {activeTab === 'Points Table' && renderPointsTable()}
      {activeTab === 'Schedule' && renderSchedule()}
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg },
  errorText: { fontSize: 18, fontWeight: '700', color: DS.coral, marginTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surfaceLow, paddingTop: 48, paddingBottom: 14, paddingHorizontal: 16, gap: 8 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: DS.textPrimary },
  statusChip: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginTop: 4 },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  tabs: { flexDirection: 'row', backgroundColor: DS.surfaceLow },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: DS.lime },
  tabText: { fontSize: 13, fontWeight: '600', color: DS.textMuted },
  tabTextActive: { color: DS.lime, fontWeight: '700' },
  tabContent: { padding: 16, gap: 12 },

  // Overview
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  infoCard: { width: '47%', backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 12, alignItems: 'center' },
  infoLabel: { fontSize: 11, color: DS.textMuted, marginTop: 4 },
  infoValue: { fontSize: 13, fontWeight: '700', color: DS.textPrimary, marginTop: 2, textAlign: 'center' },
  section: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: DS.textPrimary, marginBottom: 10 },
  descText: { fontSize: 14, color: DS.textVariant, lineHeight: 20 },
  organizerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  organizerText: { fontSize: 14, fontWeight: '600', color: DS.textPrimary },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  teamAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  teamAvatarText: { fontSize: 13, fontWeight: '700', color: DS.lime },
  teamName: { flex: 1, fontSize: 14, fontWeight: '600', color: DS.textPrimary },
  groupBadge: { backgroundColor: DS.surfaceHighest, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  groupText: { fontSize: 11, color: DS.lime, fontWeight: '700' },

  // Points Table
  ptRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4 },
  ptRowAlt: { backgroundColor: DS.surfaceLow },
  ptHeader: { backgroundColor: DS.surfaceHighest, borderRadius: 8 },
  ptHeaderText: { color: DS.textPrimary, fontWeight: '700' },
  ptCell: { flexDirection: 'row', alignItems: 'center' },
  ptTeamCell: { flex: 1, gap: 6 },
  ptAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  ptAvatarText: { fontSize: 11, color: DS.lime, fontWeight: '700' },
  ptTeamName: { flex: 1, fontSize: 12, color: DS.textPrimary },
  ptNum: { width: 36, textAlign: 'center', fontSize: 12, color: DS.textPrimary },
  ptBold: { fontWeight: '700', color: DS.lime },

  // Schedule
  fixtureCard: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16 },
  fixtureMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  roundText: { fontSize: 11, color: DS.textMuted, fontWeight: '600' },
  dateText: { fontSize: 11, color: DS.textMuted },
  fixtureTeams: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  fixtureTeamName: { flex: 1, fontSize: 13, fontWeight: '700', color: DS.textPrimary, textAlign: 'center' },
  vsChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  vsText: { fontSize: 10, fontWeight: '700', color: DS.bg },
  venueRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  venueText: { fontSize: 11, color: DS.textMuted },

  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 14, fontWeight: '600', color: DS.textMuted, marginTop: 10 },
});
