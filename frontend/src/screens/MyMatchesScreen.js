import React, { useEffect, useMemo, useState, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, RefreshControl, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { useCurrentUser } from '../utils/currentUser';

const TEAM_COLORS = ['#6366f1', '#f97316', '#06b6d4', '#ec4899', '#8b5cf6', '#14b8a6'];
const getTeamColor = (name, idx) => TEAM_COLORS[(name || '').charCodeAt(0) % TEAM_COLORS.length] || TEAM_COLORS[idx % TEAM_COLORS.length];

const makeStatusMeta = (DS) => ({
  live:      { color: DS.live,      bg: 'rgba(239,68,68,0.15)',  label: 'LIVE'      },
  completed: { color: DS.lime,      bg: 'rgba(171,214,0,0.12)',  label: 'FINAL'     },
  scheduled: { color: DS.blue,      bg: 'rgba(183,196,255,0.12)', label: 'UPCOMING'  },
});

function MatchCard({ m, onPress, onStart, onResume, isScorer }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const STATUS_META = makeStatusMeta(DS);
  const meta = STATUS_META[m.status] || STATUS_META.scheduled;
  const t1Init = (m.team1 || 'T')[0].toUpperCase();
  const t2Init = (m.team2 || 'T')[0].toUpperCase();
  const t1Color = getTeamColor(m.team1, 0);
  const t2Color = getTeamColor(m.team2, 1);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {/* Status + format row */}
      <View style={styles.cardHeader}>
        <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
          {m.status === 'live' && <View style={styles.liveDot} />}
          <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <View style={styles.formatBadge}>
          <Text style={styles.formatBadgeText}>{m.matchType || 'T20'}</Text>
        </View>
      </View>

      {/* Teams + scores */}
      <View style={styles.teamsRow}>
        <View style={styles.teamSide}>
          <View style={[styles.teamAvatar, { backgroundColor: t1Color }]}>
            <Text style={styles.teamAvatarText}>{t1Init}</Text>
          </View>
          <View style={styles.teamInfo}>
            <Text style={styles.teamName} numberOfLines={1}>{m.team1 || 'TBD'}</Text>
            {m.score1 ? <Text style={styles.teamScore}>{m.score1}</Text> : null}
          </View>
        </View>

        <View style={styles.vsBlock}>
          <Text style={styles.vsText}>VS</Text>
        </View>

        <View style={[styles.teamSide, styles.teamSideRight]}>
          <View style={styles.teamInfoRight}>
            <Text style={[styles.teamName, { textAlign: 'right' }]} numberOfLines={1}>{m.team2 || 'TBD'}</Text>
            {m.score2 ? <Text style={[styles.teamScore, { textAlign: 'right' }]}>{m.score2}</Text> : null}
          </View>
          <View style={[styles.teamAvatar, { backgroundColor: t2Color }]}>
            <Text style={styles.teamAvatarText}>{t2Init}</Text>
          </View>
        </View>
      </View>

      {/* Details row: venue + date */}
      <View style={styles.detailsRow}>
        {m.venue ? (
          <View style={styles.detailChip}>
            <Icon name="map-marker-outline" size={12} color={DS.textMuted} />
            <Text style={styles.detailChipText} numberOfLines={1}>{m.venue}</Text>
          </View>
        ) : null}
        {m.createdAt ? (
          <View style={styles.detailChip}>
            <Icon name="calendar-outline" size={12} color={DS.textMuted} />
            <Text style={styles.detailChipText}>{new Date(m.createdAt).toLocaleDateString()}</Text>
          </View>
        ) : null}
      </View>

      {/* Footer: result + action */}
      <View style={styles.cardFooter}>
        {m.result ? (
          <View style={styles.resultWrap}>
            <Icon name="trophy-outline" size={13} color={DS.lime} />
            <Text style={styles.resultText} numberOfLines={1}>{m.result}</Text>
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {m.status === 'scheduled' ? (
          <TouchableOpacity onPress={() => onStart(m)} style={[styles.scoreBtn, styles.startBtn]}>
            <Icon name="play" size={13} color={DS.onBlue} />
            <Text style={[styles.scoreBtnText, { color: DS.onBlue }]}>START MATCH</Text>
          </TouchableOpacity>
        ) : m.status === 'live' && isScorer ? (
          <TouchableOpacity onPress={() => onResume(m)} style={[styles.scoreBtn, styles.startBtn]}>
            <Icon name="play" size={13} color={DS.onBlue} />
            <Text style={[styles.scoreBtnText, { color: DS.onBlue }]}>SCORE</Text>
          </TouchableOpacity>
        ) : m.status === 'live' ? (
          // Not the assigned scorer — tap the card to watch the live score (like
          // Cricbuzz/Cricinfo), no separate scoring entry point for spectators.
          <TouchableOpacity onPress={onPress} style={[styles.scoreBtn, styles.watchBtn]}>
            <View style={styles.watchLiveDot} />
            <Text style={[styles.scoreBtnText, styles.watchBtnText]}>WATCH LIVE</Text>
            <Icon name="chevron-right" size={14} color={DS.textPrimary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={onPress} style={styles.scoreBtn}>
            <Text style={styles.scoreBtnText}>Scorecard</Text>
            <Icon name="chevron-right" size={14} color={DS.bg} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const FILTERS = ['all', 'live', 'upcoming', 'completed'];
const FILTER_STATUS_MAP = { all: 'all', live: 'live', upcoming: 'scheduled', completed: 'completed' };

export default function MyMatchesScreen({ navigation }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const me = useCurrentUser();
  const [query, setQuery]       = useState('');
  const [status, setStatus]     = useState('all');
  const [matches, setMatches]   = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading]   = useState(true);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: true, headerBackVisible: true, headerTitle: 'My Matches' });
  }, [navigation]);

  const loadMatches = async () => {
    try {
      // "My Matches" = matches involving the user's own teams (owned / played / followed),
      // across every sport — not every match in the database.
      const res = await legendsApi.getCircleMatches();
      if (res.success) setMatches(res.data || []);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { loadMatches(); }, []);

  // Kick off a scheduled match → toss & lineup → ball-by-ball scoring.
  const startMatch = async (m) => {
    const t1 = typeof m.team1 === 'object' && m.team1 ? m.team1 : { id: m.team1Id, name: m.team1 };
    const t2 = typeof m.team2 === 'object' && m.team2 ? m.team2 : { id: m.team2Id, name: m.team2 };
    let firstInningId;
    const innRes = await legendsApi.getMatchInnings(m.id);
    if (innRes.success && innRes.data?.length) firstInningId = innRes.data[0].id;
    navigation.navigate('HomeTab', {
      screen: 'TossLineup',
      params: {
        matchId: m.id,
        team1: t1.name, team2: t2.name,
        team1Id: t1.id, team2Id: t2.id,
        overs: String(m.overs || 20),
        venue: m.venue || '',
        matchType: m.matchType || 'T20',
        firstInningId,
        sport: m.sport || 'cricket',
      },
    });
  };

  const onRefresh = async () => { setRefreshing(true); await loadMatches(); setRefreshing(false); };

  const filtered = useMemo(() => {
    const mappedStatus = FILTER_STATUS_MAP[status];
    return matches
      .filter(m => mappedStatus === 'all' || (m.status || '') === mappedStatus)
      .filter(m => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        const t1 = typeof m.team1 === 'object' ? m.team1?.name : m.team1;
        const t2 = typeof m.team2 === 'object' ? m.team2?.name : m.team2;
        return [t1, t2, m.venue, m.matchType].join(' ').toLowerCase().includes(q);
      })
      .map(m => ({
        ...m,
        team1: typeof m.team1 === 'object' ? m.team1?.name : m.team1,
        team2: typeof m.team2 === 'object' ? m.team2?.name : m.team2,
      }));
  }, [matches, status, query]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={DS.lime} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Brand bar */}
      <View style={styles.brandBar}>
        <View style={styles.brandLeft}>
          <Icon name="cricket" size={18} color={DS.lime} />
          <Text style={styles.brandTitle}>LOCAL LEGENDS</Text>
        </View>
        <View style={styles.profileIcon}>
          <Icon name="account" size={18} color={DS.textPrimary} />
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Icon name="magnify" size={18} color={DS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search teams, venue, type..."
          placeholderTextColor={DS.textMuted}
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Icon name="close-circle" size={16} color={DS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter tabs */}
      <View style={styles.filtersRow}>
        {FILTERS.map(f => {
          const active = status === f;
          return (
            <TouchableOpacity
              key={f}
              style={[styles.filterTab, active && styles.filterTabActive]}
              onPress={() => setStatus(f)}
            >
              <Text style={[styles.filterTabText, active && styles.filterTabTextActive]}>
                {f.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Match count */}
      <View style={styles.countRow}>
        <Text style={styles.countText}>{filtered.length} match{filtered.length !== 1 ? 'es' : ''}</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item, i) => item.id || String(i)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={DS.lime}
            colors={[DS.lime]}
          />
        }
        renderItem={({ item }) => (
          <MatchCard
            m={item}
            isScorer={!!me?.id && item.scorerId === me.id}
            onPress={() => navigation.navigate('HomeTab', { screen: 'Scorecard', params: { matchId: item.id } })}
            onStart={startMatch}
            onResume={(m) => navigation.navigate('HomeTab', { screen: 'Scoring', params: { resume: true, matchId: m.id } })}
          />
        )}
        ListFooterComponent={
          <TouchableOpacity style={styles.promoCard} activeOpacity={0.85}>
            <View style={styles.promoContent}>
              <Icon name="trophy" size={22} color={DS.lime} />
              <View style={styles.promoTextWrap}>
                <Text style={styles.promoTitle}>HOST YOUR OWN TOURNAMENT</Text>
                <Text style={styles.promoSub}>Organize local matches and track every ball</Text>
              </View>
            </View>
            <View style={styles.promoCta}>
              <Text style={styles.promoCtaText}>Get Started</Text>
              <Icon name="arrow-right" size={14} color={DS.onBlue} />
            </View>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Icon name="cricket" size={48} color={DS.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No matches yet</Text>
            <Text style={styles.emptySub}>Start scoring your first match</Text>
            <TouchableOpacity style={styles.emptyCta} onPress={() => navigation.navigate('StartMatch')} activeOpacity={0.9}>
              <Icon name="play-circle" size={18} color={DS.onBlue} />
              <Text style={styles.emptyCtaText}>Start a Match</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg },

  /* Brand bar */
  brandBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: DS.surfaceLow,
  },
  brandLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandTitle: {
    fontSize: 16, fontWeight: '900', color: DS.textPrimary,
    letterSpacing: 2,
  },
  profileIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center',
  },

  /* Search */
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.surfaceHigh, marginHorizontal: 16, marginTop: 12,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: DS.surfaceHighest,
  },
  searchInput: { flex: 1, fontSize: 14, color: DS.textPrimary },

  /* Filter tabs */
  filtersRow: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
  },
  filterTab: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'transparent',
  },
  filterTabActive: {
    backgroundColor: DS.lime,
  },
  filterTabText: {
    fontSize: 12, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.8,
  },
  filterTabTextActive: { color: DS.bg },

  /* Count */
  countRow: { paddingHorizontal: 16, paddingBottom: 6 },
  countText: { fontSize: 12, color: DS.textMuted, fontWeight: '600' },

  /* List */
  list: { padding: 16, paddingTop: 4, gap: 14 },

  /* Card */
  card: {
    backgroundColor: DS.surfaceHigh, borderRadius: 16,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
  },
  liveDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: DS.live,
  },
  statusPillText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  formatBadge: {
    backgroundColor: DS.surfaceHighest, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  formatBadgeText: { fontSize: 10, fontWeight: '800', color: DS.textVariant, letterSpacing: 0.5 },

  /* Teams */
  teamsRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  teamSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  teamSideRight: { justifyContent: 'flex-end' },
  teamAvatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  teamAvatarText: { fontSize: 14, fontWeight: '900', color: '#fff' },
  teamInfo: { flex: 1, gap: 2 },
  teamInfoRight: { flex: 1, gap: 2, alignItems: 'flex-end' },
  teamName: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },
  teamScore: { fontSize: 18, fontWeight: '900', color: '#fff' },
  vsBlock: { paddingHorizontal: 8 },
  vsText: {
    fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 1.5,
  },

  /* Details row */
  detailsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 16, paddingBottom: 10,
  },
  detailChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DS.surfaceHighest, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  detailChipText: { fontSize: 11, color: DS.textMuted },

  /* Footer */
  cardFooter: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 14, gap: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)',
    paddingTop: 10,
  },
  resultWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultText: { flex: 1, fontSize: 12, fontWeight: '600', color: DS.lime },
  scoreBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DS.lime, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  scoreBtnText: { fontSize: 12, fontWeight: '800', color: DS.bg },
  startBtn: { backgroundColor: DS.blueDeep },   // scheduled → solid-blue START
  // Spectator "watch live" action (team member / follower who isn't the scorer).
  watchBtn: { backgroundColor: DS.surfaceHighest, gap: 6 },
  watchBtnText: { color: DS.textPrimary },
  watchLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: DS.live },

  /* Promo card */
  promoCard: {
    backgroundColor: DS.surfaceHigh, borderRadius: 16,
    borderWidth: 1, borderColor: DS.lime + '30',
    marginTop: 8, marginBottom: 24, overflow: 'hidden',
  },
  promoContent: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, paddingBottom: 10,
  },
  promoTextWrap: { flex: 1 },
  promoTitle: {
    fontSize: 13, fontWeight: '900', color: DS.textPrimary,
    letterSpacing: 0.8, marginBottom: 3,
  },
  promoSub: { fontSize: 12, color: DS.textMuted },
  // Primary "Action-Taker" CTA — solid electric blue per the design system.
  promoCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: DS.blueDeep, marginHorizontal: 16, marginBottom: 16,
    borderRadius: 10, paddingVertical: 10,
  },
  promoCtaText: { fontSize: 13, fontWeight: '800', color: DS.onBlue },

  /* Empty */
  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10,
    backgroundColor: DS.blueDeep, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12,
  },
  emptyCtaText: { color: DS.onBlue, fontSize: 14, fontWeight: '800' },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: DS.surfaceHigh, alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: DS.textVariant },
  emptySub: { fontSize: 13, color: DS.textMuted },
});
