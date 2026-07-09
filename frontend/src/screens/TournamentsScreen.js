import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Animated
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';

/* ── Design System ── */
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import BrandLogo from "../components/BrandLogo";
import PressableScale from '../components/PressableScale';

const FILTERS = ['All', 'Open', 'Ongoing', 'Completed'];

const makeStatusColors = (DS) => ({
  Open:      DS.lime,
  Ongoing:   '#fbbf24', // Gold
  Active:    '#fbbf24', // Gold
  Upcoming:  DS.blue,
  Completed: DS.textMuted,
});

const AnimatedPulse = ({ children, style }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim]);
  return <Animated.View style={[style, { transform: [{ scale: pulseAnim }] }]}>{children}</Animated.View>;
};

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
function TournamentCard({ item, onJoin, onPress, onOpen }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const STATUS_COLORS = makeStatusColors(DS);
  const statusColor = STATUS_COLORS[item.status] || DS.textMuted;
  const teamsLeft = (item.maxTeams || 16) - (item.teams || 0);
  const progress = (item.teams || 0) / (item.maxTeams || 16);

  const isGold = item.status === 'Ongoing' || item.status === 'Active';

  return (
    <PressableScale
      style={[styles.card, isGold && { borderColor: DS.lime, borderWidth: 2, shadowColor: DS.lime, shadowOpacity: 0.15, shadowRadius: 10, elevation: 4 }]}
      onPress={onPress}>
      {/* Body: info on the left, status + actions stacked top-right */}
      <View style={styles.cardBody}>
        <View style={styles.cardBodyLeft}>
          <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>

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
        </View>

        {/* Right column: status badge + stacked actions */}
        <View style={styles.cardHeaderRight}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '1A' }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>
              {item.status ? item.status.toUpperCase() : 'UPCOMING'}
            </Text>
          </View>
          {item.status !== 'Open' && (
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.chipBtn} onPress={() => onOpen('Schedule', { bracket: true })}>
                <Text style={styles.chipBtnText}>BRACKET</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.chipBtn} onPress={() => onOpen('Points Table')}>
                <Text style={styles.chipBtnText}>STANDINGS</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Footer: only Open tournaments show slots + JOIN */}
      {item.status === 'Open' && (
        <View style={styles.cardFooter}>
          <Text style={styles.slotsLeft}>
            {teamsLeft > 0 ? `${teamsLeft} slots left` : 'Full'}
          </Text>
          <TouchableOpacity style={styles.joinBtn} onPress={() => onJoin(item)}>
            <Text style={styles.joinBtnText}>JOIN</Text>
          </TouchableOpacity>
        </View>
      )}
    </PressableScale>
  );
}

/* ── Main Screen ── */
const TournamentsScreen = ({ navigation, inline }) => {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('All');

  useLayoutEffect(() => {
    if (!inline) {
      navigation.setOptions({
        headerShown: true,
        headerBackVisible: true,
        headerTitle: 'Tournaments',
      });
    }
  }, [navigation, inline]);

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
      {!inline && (
        <View style={styles.brandHeader}>
          <View>
            <BrandLogo scale={0.75} />
            <Text style={styles.brandSub}>ATHLETE HUB</Text>
          </View>
        </View>
      )}

      {/* Moved fixed items to ListHeaderComponent */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} />}
        ListHeaderComponent={
          <View>
            {/* Removed CTA Card for floating button */}

            {/* Search */}
            <View style={styles.searchWrap}>
              <Icon name="magnify" size={18} color={DS.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Find a tournament..."
                placeholderTextColor={DS.faint}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                  <Icon name="close-circle" size={18} color={DS.faint} />
                </TouchableOpacity>
              )}
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
          </View>
        }
        renderItem={({ item }) => (
          <TournamentCard
            item={item}
            onJoin={handleJoin}
            onPress={() => navigation.navigate('TournamentDetail', { tournamentId: item.id })}
            onOpen={(tab, extra) => navigation.navigate('TournamentDetail', { tournamentId: item.id, initialTab: tab, ...extra })}
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
      <AnimatedPulse style={styles.fabWrap}>
        <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('CreateTournament')}>
          <Icon name="plus" size={28} color="#fff" />
        </TouchableOpacity>
      </AnimatedPulse>
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
  ctaCard: {
    backgroundColor: DS.surface,
    borderRadius: 16,
    marginBottom: 24,
    marginHorizontal: 20,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 1, borderColor: DS.faint,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  ctaAccent: {
    width: 4,
    backgroundColor: DS.blueDeep
  },
  ctaContent: {
    flex: 1,
    padding: 20
  },
  ctaTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: DS.textPrimary,
    marginBottom: 4
  },
  ctaSubtitle: {
    fontSize: 13,
    color: DS.textMuted,
    marginBottom: 16
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: DS.blueDeep,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
    elevation: 4,
    shadowColor: DS.blueDeep, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }
  },
  ctaButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5
  },
  fabWrap: { position: 'absolute', bottom: 24, right: 24, zIndex: 999 },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: DS.blueDeep,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    zIndex: 999,
    shadowColor: DS.blueDeep,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  pageTitle: {
    fontSize: 24, fontWeight: '900', color: DS.textPrimary, letterSpacing: 1,
  },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: DS.blueDeep, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  createBtnText: { fontSize: 12, fontWeight: '900', color: DS.white, letterSpacing: 0.5 },

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
    backgroundColor: DS.surface, marginHorizontal: 20, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9, marginBottom: 14,
    borderWidth: 1, borderColor: DS.faint,
  },
  searchInput: { flex: 1, fontSize: 13, fontWeight: '500', color: DS.textPrimary, padding: 0 },

  /* Filters */
  filterRow: {
    flexDirection: 'row', backgroundColor: DS.surfaceLow,
    marginHorizontal: 16, marginTop: 4, marginBottom: 14,
    borderRadius: 14, padding: 4,
  },
  filterChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, backgroundColor: 'transparent',
  },
  filterChipActive: { backgroundColor: DS.lime, shadowColor: DS.lime, shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  filterText: { fontSize: 11, fontWeight: '700', color: DS.textMuted },
  filterTextActive: { color: DS.bg },

  /* List */
  list: { paddingHorizontal: 20, gap: 14, paddingBottom: 32 },

  /* Card */
  card: {
    backgroundColor: DS.surface, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: DS.faint,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  /* Card body: left info column + right status/actions column */
  cardBody: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 16, gap: 12,
  },
  cardBodyLeft: { flex: 1 },
  cardHeaderRight: { alignItems: 'flex-end', gap: 8 },
  headerActions: { alignItems: 'stretch', gap: 6 },

  cardName: { fontSize: 16, fontWeight: '800', color: DS.textPrimary, lineHeight: 22 },
  statusBadge: {
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4,
  },
  statusBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },

  /* Card meta */
  cardMeta: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 8, paddingBottom: 8,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, color: DS.textMuted },

  /* Card stats */
  cardStatsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
  },
  cardStatItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardStatText: { fontSize: 12, color: DS.textVariant },

  cardDesc: {
    fontSize: 13, color: DS.textMuted, lineHeight: 19, paddingTop: 8,
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
    backgroundColor: DS.blueDeep, borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  joinBtnText: { fontSize: 13, fontWeight: '900', color: DS.white },
  chipBtn: {
    backgroundColor: 'transparent', borderRadius: 8, alignItems: 'center',
    borderWidth: 1.5, borderColor: DS.textPrimary,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  chipBtnText: { fontSize: 11, fontWeight: '800', color: DS.textPrimary, letterSpacing: 0.5 },

  /* Empty */
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: DS.textVariant },
  emptySub: { fontSize: 13, color: DS.textMuted },
});

export default TournamentsScreen;
