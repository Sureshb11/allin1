import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';

/* ── Design System ── */
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

const FILTERS = ['All', 'Open', 'Ongoing', 'Completed'];

const makeStatusColors = (DS) => ({
  Open:      DS.lime,
  Ongoing:   DS.lime,
  Active:    DS.lime,
  Upcoming:  DS.blue,
  Completed: DS.textMuted,
});

/* ── Stats Pill ── */
function StatPill({ value, label }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.statPill}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/* ── Tournament Card ── */
function TournamentCard({ item, onJoin, onPress }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const STATUS_COLORS = makeStatusColors(DS);
  const statusColor = STATUS_COLORS[item.status] || DS.textMuted;
  const teamsLeft = (item.maxTeams || 16) - (item.teams || 0);
  const progress = (item.teams || 0) / (item.maxTeams || 16);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '1A' }]}>
          <Text style={[styles.statusBadgeText, { color: statusColor }]}>
            {item.status ? item.status.toUpperCase() : 'UPCOMING'}
          </Text>
        </View>
      </View>

      {/* Date & location */}
      <View style={styles.cardMeta}>
        <View style={styles.metaItem}>
          <Icon name="calendar-range" size={13} color={DS.textMuted} />
          <Text style={styles.metaText}>{item.startDate}</Text>
        </View>
        {!!item.location && (
          <View style={styles.metaItem}>
            <Icon name="map-marker-outline" size={13} color={DS.textMuted} />
            <Text style={styles.metaText} numberOfLines={1}>{item.location}</Text>
          </View>
        )}
      </View>

      {/* Stats row */}
      <View style={styles.cardStatsRow}>
        <View style={styles.cardStatItem}>
          <Icon name="account-group-outline" size={14} color={DS.textMuted} />
          <Text style={styles.cardStatText}>{item.teams}/{item.maxTeams} teams</Text>
        </View>
        <View style={styles.cardStatItem}>
          <Icon name="cricket" size={14} color={DS.textMuted} />
          <Text style={styles.cardStatText}>T20</Text>
        </View>
        <View style={styles.cardStatItem}>
          <Icon name="currency-inr" size={14} color={DS.textMuted} />
          <Text style={styles.cardStatText}>{item.prize}</Text>
        </View>
      </View>

      {!!item.description && (
        <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
      )}

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
      </View>

      {/* Footer */}
      <View style={styles.cardFooter}>
        {item.status === 'Open' ? (
          <>
            <Text style={styles.slotsLeft}>
              {teamsLeft > 0 ? `${teamsLeft} slots left` : 'Full'}
            </Text>
            <TouchableOpacity style={styles.joinBtn} onPress={() => onJoin(item)}>
              <Text style={styles.joinBtnText}>JOIN</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.chipBtn}>
              <Text style={styles.chipBtnText}>BRACKET</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chipBtn}>
              <Text style={styles.chipBtnText}>STANDINGS</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

/* ── Main Screen ── */
const TournamentsScreen = ({ navigation }) => {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('All');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: 'Tournaments',
    });
  }, [navigation]);

  useEffect(() => { loadTournaments(); }, []);

  const loadTournaments = async () => {
    try {
      const res = await legendsApi.request('/tournaments');
      if (res && res.tournaments) {
        setTournaments((res.tournaments || []).map(t => ({
          id:        t.id,
          name:      t.name,
          description: `${t.format || 'T20'} tournament at ${t.venue || 'TBD'}`,
          startDate: (t.startDate && !isNaN(new Date(t.startDate).getTime()))
            ? new Date(t.startDate).toISOString().split('T')[0] : 'TBD',
          prize:     '₹50,000',
          teams:     0,
          maxTeams:  16,
          location:  t.venue || 'TBD',
          status:    t.status
            ? t.status.charAt(0).toUpperCase() + t.status.slice(1)
            : 'Upcoming',
        })));
      }
    } catch {}
    finally { setLoading(false); }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTournaments();
    setRefreshing(false);
  };

  const filtered = tournaments.filter(t => {
    const f = filter === 'All' || t.status === filter;
    const q = searchQuery.toLowerCase();
    const s = !q || (t.name || '').toLowerCase().includes(q) || (t.location || '').toLowerCase().includes(q);
    return f && s;
  });

  const handleJoin = (tournament) => navigation.navigate('TournamentRegistration', { tournament });

  /* Aggregate stats */
  const activeCount  = tournaments.filter(t => t.status === 'Open' || t.status === 'Ongoing').length;
  const totalTeams   = tournaments.reduce((s, t) => s + (t.teams || 0), 0);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={DS.lime} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Brand header */}
      <View style={styles.brandHeader}>
        <View>
          <Text style={styles.brandName}>LOCAL LEGENDS</Text>
          <Text style={styles.brandSub}>ATHLETE HUB</Text>
        </View>
      </View>

      {/* Title + Create */}
      <View style={styles.titleRow}>
        <Text style={styles.pageTitle}>MY TOURNAMENTS</Text>
        <TouchableOpacity style={styles.createBtn} onPress={() => navigation.navigate('CreateTournament')}>
          <Icon name="plus" size={16} color={DS.bg} />
          <Text style={styles.createBtnText}>CREATE TOURNAMENT</Text>
        </TouchableOpacity>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <StatPill value={String(activeCount).padStart(2, '0')} label="Active" />
        <StatPill value={String(tournaments.length).padStart(2, '0')} label="Tournaments" />
        <StatPill value={String(totalTeams)} label="Players" />
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Icon name="magnify" size={18} color={DS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search tournaments..."
          placeholderTextColor={DS.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} />}
        renderItem={({ item }) => (
          <TournamentCard
            item={item}
            onJoin={handleJoin}
            onPress={() => navigation.navigate('TournamentDetail', { tournamentId: item.id })}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="trophy-outline" size={52} color={DS.textMuted} />
            <Text style={styles.emptyTitle}>No tournaments found</Text>
            <Text style={styles.emptySub}>Try changing your search or filter</Text>
          </View>
        }
      />
    </View>
  );
};

/* ── Styles ── */
const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg },

  /* Brand header */
  brandHeader: {
    paddingTop: 56, paddingBottom: 8, paddingHorizontal: 20,
    backgroundColor: DS.bg,
  },
  brandName: {
    fontSize: 13, fontWeight: '900', color: DS.lime, letterSpacing: 3,
  },
  brandSub: {
    fontSize: 10, fontWeight: '700', color: DS.textMuted, letterSpacing: 2, marginTop: 2,
  },

  /* Title row */
  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
  },
  pageTitle: {
    fontSize: 24, fontWeight: '900', color: DS.textPrimary, letterSpacing: 1,
  },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: DS.lime, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  createBtnText: { fontSize: 11, fontWeight: '900', color: DS.bg, letterSpacing: 0.5 },

  /* Stats row */
  statsRow: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 16,
  },
  statPill: {
    flex: 1, backgroundColor: DS.surfaceLow, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '900', color: DS.lime },
  statLabel: { fontSize: 11, fontWeight: '600', color: DS.textMuted, marginTop: 2, letterSpacing: 0.5 },

  /* Search */
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.surfaceLow, marginHorizontal: 20, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 14, color: DS.textPrimary },

  /* Filters */
  filterRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
    backgroundColor: DS.surfaceLow,
  },
  filterChipActive: { backgroundColor: DS.lime },
  filterText: { fontSize: 12, fontWeight: '700', color: DS.textMuted },
  filterTextActive: { color: DS.bg },

  /* List */
  list: { paddingHorizontal: 20, gap: 14, paddingBottom: 32 },

  /* Card */
  card: {
    backgroundColor: DS.surfaceHigh, borderRadius: 14, overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    padding: 16, paddingBottom: 4,
  },
  cardName: { fontSize: 16, fontWeight: '800', color: DS.textPrimary, lineHeight: 22 },
  statusBadge: {
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 10,
  },
  statusBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },

  /* Card meta */
  cardMeta: {
    flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, color: DS.textMuted },

  /* Card stats */
  cardStatsRow: {
    flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingBottom: 10,
  },
  cardStatItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardStatText: { fontSize: 12, color: DS.textVariant },

  cardDesc: {
    fontSize: 13, color: DS.textMuted, lineHeight: 19,
    paddingHorizontal: 16, paddingBottom: 10,
  },

  /* Progress bar */
  progressTrack: {
    height: 3, backgroundColor: DS.surfaceHighest, marginHorizontal: 16, borderRadius: 2,
    marginBottom: 12,
  },
  progressFill: {
    height: 3, backgroundColor: DS.lime, borderRadius: 2,
  },

  /* Card footer */
  cardFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: 8, paddingHorizontal: 16, paddingBottom: 14,
  },
  slotsLeft: { fontSize: 12, color: DS.textMuted, fontWeight: '600', flex: 1 },
  joinBtn: {
    backgroundColor: DS.lime, borderRadius: 8,
    paddingHorizontal: 20, paddingVertical: 9,
  },
  joinBtnText: { fontSize: 12, fontWeight: '900', color: DS.bg },
  chipBtn: {
    backgroundColor: DS.surfaceHighest, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  chipBtnText: { fontSize: 11, fontWeight: '800', color: DS.textVariant, letterSpacing: 0.5 },

  /* Empty */
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: DS.textVariant },
  emptySub: { fontSize: 13, color: DS.textMuted },
});

export default TournamentsScreen;
