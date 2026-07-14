import React, { useEffect, useMemo, useState, useLayoutEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Pressable, ScrollView,
  FlatList, RefreshControl, Animated
} from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import BrandLogo from '../components/BrandLogo';
import HexAvatar from '../components/HexAvatar';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

// Single-accent: team avatars are the deep green (white initials read on it),
// matching the hexagons on the home feed.
const getTeamColor = () => '#0a5227';

// Split a score into its runs part and an overs part so the overs can render
// smaller: "217/4 (11.0)" + total 20 → { main: '217/4', ov: '(11.0/20)' }.
export const splitScore = (score, overs) => {
  if (!score || score === '-') return { main: score || '-', ov: '' };
  const m = score.match(/^(.*?)\s*\(([\d.]+)\)\s*$/);
  if (!m) return { main: score, ov: '' };
  return { main: m[1].trim(), ov: `(${overs ? `${m[2]}/${overs}` : m[2]})` };
};

const makeStatusMeta = (DS) => ({
  live:      { color: DS.live,      bg: DS.live + '20',  label: 'LIVE', glow: DS.live },
  completed: { color: DS.success,   bg: DS.success + '1A', label: 'FINAL', glow: DS.success },
  scheduled: { color: DS.blue,      bg: DS.blue + '1A', label: 'UPCOMING', glow: DS.blue },
});

function TopGlow({ color }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg height="300" width="100%">
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="0%" rx="80%" ry="100%" fx="50%" fy="0%">
            <Stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <Stop offset="100%" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#glow)" />
      </Svg>
    </View>
  );
}

// ── Shimmer Skeleton ────────────────────────────────────────────────────────
function MatchSkeleton({ DS }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, [shimmer]);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });
  const Bar = ({ w, h, r = 6, mt = 0 }) => (
    <Animated.View style={{ width: w, height: h, borderRadius: r, backgroundColor: DS.surface, opacity, marginTop: mt }} />
  );
  return (
    <View style={{ padding: 16, paddingTop: 4, gap: 14 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ backgroundColor: DS.surface, borderRadius: 16, padding: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
            <Bar w={50} h={18} r={4} />
            <Bar w={30} h={18} r={4} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Bar w={36} h={36} r={18} />
              <View style={{ gap: 6 }}><Bar w={60} h={12} /><Bar w={40} h={16} /></View>
            </View>
            <Bar w={20} h={12} />
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
              <View style={{ gap: 6, alignItems: 'flex-end' }}><Bar w={60} h={12} /><Bar w={40} h={16} /></View>
              <Bar w={36} h={36} r={18} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
             <Bar w={80} h={20} r={8} />
             <Bar w={80} h={20} r={8} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function MatchCard({ m, onPress, onStart, onResume, isScorer }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const STATUS_META = makeStatusMeta(DS);
  const meta = STATUS_META[m.status] || STATUS_META.scheduled;
  const t1Init = (m.team1 || 'T')[0].toUpperCase();
  const t2Init = (m.team2 || 'T')[0].toUpperCase();
  const t1Color = getTeamColor(m.team1, 0);
  const t2Color = getTeamColor(m.team2, 1);

  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (m.status === 'live') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true })
        ])
      ).start();
    }
  }, [m.status]);

  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <Animated.View style={[styles.card, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.statusPill, { backgroundColor: meta.bg, shadowColor: meta.glow, shadowOpacity: 0.5, shadowRadius: 8, elevation: 4 }]}>
              {m.status === 'live' && <Animated.View style={[styles.liveDot, { opacity: pulse }]} />}
              <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            <View style={styles.formatBadge}>
              <Text style={styles.formatBadgeText}>{m.matchType || 'T20'}</Text>
            </View>
          </View>

          <View style={styles.teamsVerticalRow}>
            <View style={styles.teamSideVertical}>
              <HexAvatar size={36} color={t1Color}>
                <Text style={styles.teamAvatarText}>{t1Init}</Text>
              </HexAvatar>
              <Text style={styles.teamNameVertical} numberOfLines={1}>{m.team1 || 'TBD'}</Text>
              <Text style={styles.teamScoreVertical}>
                {splitScore(m.score1, m.overs).main}
                {splitScore(m.score1, m.overs).ov ? <Text style={styles.teamScoreOvers}> {splitScore(m.score1, m.overs).ov}</Text> : null}
              </Text>
            </View>

            <View style={styles.vsVerticalBlock}>
              <Text style={styles.vsTextVertical}>VS</Text>
            </View>

            <View style={styles.teamSideVertical}>
              <HexAvatar size={36} color={t2Color}>
                <Text style={styles.teamAvatarText}>{t2Init}</Text>
              </HexAvatar>
              <Text style={styles.teamNameVertical} numberOfLines={1}>{m.team2 || 'TBD'}</Text>
              <Text style={styles.teamScoreVertical}>
                {splitScore(m.score2, m.overs).main}
                {splitScore(m.score2, m.overs).ov ? <Text style={styles.teamScoreOvers}> {splitScore(m.score2, m.overs).ov}</Text> : null}
              </Text>
            </View>
          </View>

          {m.result ? (
            <View style={styles.resultBanner}>
              <Text style={styles.resultBannerText} numberOfLines={1}>{m.result}</Text>
            </View>
          ) : null}

          <View style={styles.cardFooter}>
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

            <View style={styles.actionBlock}>
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
              ) : (
                <TouchableOpacity onPress={onPress} style={styles.scoreBtn}>
                  <Icon name="play" size={14} color={DS.white} />
                  <Text style={styles.scoreBtnText}>SCORE</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
}

export const FILTERS = ['all', 'live', 'upcoming', 'completed'];
export const FILTER_STATUS_MAP = { all: 'all', live: 'live', upcoming: 'scheduled', completed: 'completed' };

export default function MyMatchesScreen({ navigation }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
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
    } catch (e) {}
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
      <View style={styles.container}>
        <View style={styles.brandBar}>
          <View style={styles.brandLeft}><BrandLogo scale={0.8} /></View>
          <View style={styles.profileIcon}><Icon name="account" size={18} color={DS.textPrimary} /></View>
        </View>
      {/* Toss & Play Banner */}
      <View style={styles.tossPlayBanner}>
        <View style={styles.tossPlayIconWrap}>
          <Icon name="cricket" size={28} color={DS.white} />
        </View>
        <View style={styles.tossPlayTextWrap}>
          <Text style={styles.tossPlayTitle}>TOSS & PLAY</Text>
          <Text style={styles.tossPlaySub}>Ball-by-ball live scoring</Text>
        </View>
        <TouchableOpacity style={styles.tossPlayBtn} activeOpacity={0.8}>
          <Text style={styles.tossPlayBtnText}>GO</Text>
          <Icon name="chevron-right" size={18} color={DS.white} />
        </TouchableOpacity>
      </View>

        <MatchSkeleton DS={DS} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TopGlow color={DS.blue} />
      {/* Brand bar */}
      <View style={styles.brandBar}>
        <View style={styles.brandLeft}>
          <BrandLogo scale={0.8} />
        </View>
        <View style={styles.profileIcon}>
          <Icon name="account" size={18} color={DS.textPrimary} />
        </View>
      </View>
      {/* Toss & Play Banner */}
      <View style={styles.tossPlayBanner}>
        <View style={styles.tossPlayIconWrap}>
          <Icon name="cricket" size={28} color={DS.white} />
        </View>
        <View style={styles.tossPlayTextWrap}>
          <Text style={styles.tossPlayTitle}>TOSS & PLAY</Text>
          <Text style={styles.tossPlaySub}>Ball-by-ball live scoring</Text>
        </View>
        <TouchableOpacity style={styles.tossPlayBtn} activeOpacity={0.8}>
          <Text style={styles.tossPlayBtnText}>GO</Text>
          <Icon name="chevron-right" size={18} color={DS.white} />
        </TouchableOpacity>
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersContainer}>
          {FILTERS.map((f, i) => {
            const active = status === f;
            const dotColor = f === 'live' ? DS.live : f === 'upcoming' ? DS.blue : null;
            return (
              <TouchableOpacity
                key={f}
                style={[styles.filterTab, active && styles.filterTabActive]}
                onPress={() => setStatus(f)}
                activeOpacity={0.8}
              >
                {dotColor && <View style={[styles.tabDot, { backgroundColor: dotColor }]} />}
                <Text style={[styles.filterTabText, active && styles.filterTabTextActive]}>
                  {f.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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
            isScorer={!!item.isScorer}
            onPress={() => navigation.navigate('HomeTab', { screen: 'Scorecard', params: { matchId: item.id } })}
            onStart={startMatch}
            onResume={(m) => navigation.navigate('HomeTab', { screen: 'Scoring', params: { resume: true, matchId: m.id } })}
          />
        )}
        ListFooterComponent={
          <>
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
              <Icon name="arrow-right" size={14} color={DS.white} />
            </View>
          </TouchableOpacity>
          <View style={styles.bottomStatsRow}>
            <View style={[styles.statCard, { backgroundColor: DS.surfaceLow }]}>
              <Icon name="trending-up" size={24} color={DS.blue} />
              <View style={{ marginTop: 12 }}>
                <Text style={styles.statCardSub}>Top Run Scorer</Text>
                <Text style={styles.statCardTitle}>S. Sharma</Text>
                <Text style={styles.statCardValBlue}>1,240 Runs</Text>
              </View>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#4b5563' }]}>
              <Text style={[styles.statCardSub, { color: '#d1d5db' }]}>Series MVP</Text>
              <Text style={[styles.statCardTitle, { color: '#fff' }]}>J. Root</Text>
              <Text style={styles.statCardValGreen}>24 Wickets</Text>
            </View>
          </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Icon name="cricket" size={48} color={DS.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No matches yet</Text>
            <Text style={styles.emptySub}>Start scoring your first match</Text>
            <TouchableOpacity style={styles.emptyCta} onPress={() => navigation.navigate('StartMatch')} activeOpacity={0.9}>
              <Icon name="play-circle" size={18} color={DS.white} />
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
    paddingTop: 48, paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: 'transparent',
  },
  brandLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandTitle: {
    fontSize: 16, fontWeight: '900', color: DS.textPrimary,
    letterSpacing: 2,
  },
  profileIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: DS.surface, borderWidth: 1, borderColor: DS.faint,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },

  /* Search */
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.surface, marginHorizontal: 16, marginTop: 16,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: DS.faint,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1,
  },
  searchInput: { flex: 1, fontSize: 14, color: DS.textPrimary, fontWeight: '500' },

  /* Filter tabs */
  filtersRow: {
    paddingTop: 16, paddingBottom: 8,
  },
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
  },
  filterTab: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 18, borderRadius: 24,
    backgroundColor: DS.surface,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  filterTabActive: { backgroundColor: DS.lime, shadowColor: DS.lime, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  filterTabText: {
    fontSize: 12, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.8,
  },
  filterTabTextActive: { color: DS.bg, fontWeight: '900' },
  tabDot: { width: 8, height: 8, borderRadius: 4, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },

  /* Count */
  countRow: { paddingHorizontal: 16, paddingBottom: 6 },
  countText: { fontSize: 12, color: DS.textMuted, fontWeight: '600' },

  /* List */
  list: { padding: 16, paddingTop: 4, gap: 10 },

  /* Card */
  card: {
    backgroundColor: DS.surface, borderRadius: 16,
    borderWidth: 1, borderColor: DS.faint,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2,
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
    backgroundColor: DS.surfaceLow, borderRadius: 8,
    borderWidth: 1, borderColor: DS.faint,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  formatBadgeText: { fontSize: 10, fontWeight: '800', color: DS.textVariant, letterSpacing: 0.5 },

  
  /* New layout additions */
  tossPlayBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: DS.blueDeep,
    marginHorizontal: 16, marginTop: 16, borderRadius: 12, padding: 16,
    elevation: 4, shadowColor: DS.blueDeep, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  tossPlayIconWrap: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  tossPlayTextWrap: { flex: 1 },
  tossPlayTitle: { fontSize: 16, fontWeight: '900', color: DS.white, letterSpacing: 0.5 },
  tossPlaySub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  tossPlayBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tossPlayBtnText: { fontSize: 14, fontWeight: '800', color: DS.white },

  teamsVerticalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  teamSideVertical: { alignItems: 'center', flex: 1, gap: 6 },
  teamNameVertical: { fontSize: 13, fontWeight: '700', color: DS.textPrimary, textAlign: 'center', minHeight: 17 },
  teamScoreVertical: { fontSize: 20, fontWeight: '900', color: DS.textPrimary, textAlign: 'center', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  teamScoreOvers: { fontSize: 12, fontWeight: '700', color: DS.textMuted, letterSpacing: 0, fontVariant: ['tabular-nums'] },
  vsVerticalBlock: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  vsTextVertical: { fontSize: 13, fontWeight: '900', color: DS.blueSoft, fontStyle: 'italic' },
  
  resultBanner: {
    backgroundColor: DS.success + '14', paddingVertical: 7, paddingHorizontal: 14,
    alignItems: 'center', marginHorizontal: 16, borderRadius: 8, marginBottom: 12,
  },
  resultBannerText: { fontSize: 13, fontWeight: '800', color: DS.success },

  bottomStatsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard: {
    flex: 1, borderRadius: 12, padding: 16,
    justifyContent: 'space-between', minHeight: 120,
  },
  statCardSub: { fontSize: 11, fontWeight: '700', color: DS.textMuted },
  statCardTitle: { fontSize: 15, fontWeight: '800', color: DS.textPrimary, marginVertical: 4 },
  statCardValBlue: { fontSize: 13, fontWeight: '900', color: DS.blue, fontVariant: ['tabular-nums'] },
  statCardValGreen: { fontSize: 13, fontWeight: '900', color: DS.success, fontVariant: ['tabular-nums'] },
  
  actionBlock: { flexShrink: 0 },

  /* Teams */
  teamsRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  teamSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  teamSideRight: { justifyContent: 'flex-end' },
  teamAvatarContainer: {
    shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
  teamAvatar: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  teamAvatarText: { fontSize: 12, fontWeight: '900', color: DS.white },
  teamInfo: { flex: 1, gap: 2 },
  teamInfoRight: { flex: 1, gap: 2, alignItems: 'flex-end' },
  teamName: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },
  teamScore: { fontSize: 18, fontWeight: '900', color: DS.textPrimary, fontVariant: ['tabular-nums'] },
  vsBlock: { paddingHorizontal: 8 },
  vsText: {
    fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 1.5,
  },

  /* Details row */
  detailsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1,
  },
  detailChip: {
    flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DS.surfaceLow, borderRadius: 8,
    borderWidth: 1, borderColor: DS.faint,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  detailChipText: { fontSize: 11, color: DS.textMuted },

  /* Footer */
  cardFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, paddingBottom: 12, gap: 10,
    borderTopWidth: 1, borderTopColor: DS.faint,
    paddingTop: 10,
  },
  resultWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultText: { flex: 1, fontSize: 12, fontWeight: '600', color: DS.lime },
  scoreBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: DS.blueDeep, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  scoreBtnText: { fontSize: 13, fontWeight: '800', color: DS.white },
  startBtn: { backgroundColor: DS.blueDeep },   // scheduled → solid-blue START

  /* Promo card */
  promoCard: {
    backgroundColor: DS.surfaceHigh, borderRadius: 20,
    shadowColor: DS.lime, shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 5,
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
  // Primary "Action-Taker" CTA — solid blue = commit action per the color rule.
  promoCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: DS.blueDeep, marginHorizontal: 16, marginBottom: 16,
    borderRadius: 12, paddingVertical: 12,
  },
  promoCtaText: { fontSize: 13, fontWeight: '800', color: DS.white },

  /* Empty */
  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10,
    backgroundColor: DS.blueDeep, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 13,
  },
  emptyCtaText: { color: DS.white, fontSize: 14, fontWeight: '800' },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: DS.surfaceLow, borderWidth: 1, borderColor: DS.faint,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: DS.textVariant },
  emptySub: { fontSize: 13, color: DS.textMuted },
});
