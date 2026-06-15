import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';

const DS = {
  bg: '#0f131f',
  surfaceLow: '#171b28',
  surfaceHigh: '#262a37',
  surfaceHighest: '#313442',
  lime: '#abd600',
  textPrimary: '#dfe2f3',
  textVariant: '#c3c5d9',
  textMuted: '#8d90a2',
  live: '#ef4444',
};

function MatchCard({ item, onPress }) {
  const isLive = item.status === 'live';
  const isDone = item.status === 'completed';
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Card header bar */}
      <View style={styles.cardHeader}>
        <View style={styles.typeRow}>
          <Text style={styles.matchType}>{item.matchType}</Text>
          {item.venue ? <Text style={styles.venue} numberOfLines={1}>{item.venue}</Text> : null}
        </View>
        {isLive && (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
        {isDone && <Text style={styles.donePill}>FINAL</Text>}
        {!isLive && !isDone && <Text style={styles.scheduledPill}>SOON</Text>}
      </View>

      {/* Teams & Scores */}
      <View style={styles.teamsBlock}>
        <TeamRow name={item.team1} score={item.score1} />
        <View style={styles.vsDivider}>
          <Text style={styles.vsText}>VS</Text>
        </View>
        <TeamRow name={item.team2} score={item.score2} />
      </View>

      {/* Result or status */}
      {item.result ? (
        <View style={styles.resultBar}>
          <Icon name="trophy-outline" size={12} color={DS.lime} />
          <Text style={styles.resultText} numberOfLines={1}>{item.result}</Text>
        </View>
      ) : isLive ? (
        <View style={styles.resultBar}>
          <Icon name="pulse" size={12} color={DS.live} />
          <Text style={[styles.resultText, { color: DS.live }]}>Match in progress</Text>
        </View>
      ) : null}

      {/* Insights link */}
      <TouchableOpacity style={styles.insightsLink} onPress={onPress}>
        <Text style={styles.insightsLinkText}>View Scorecard</Text>
        <Icon name="chevron-right" size={14} color={DS.lime} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function TeamRow({ name, score }) {
  return (
    <View style={styles.teamRow}>
      <View style={styles.teamAvatar}>
        <Text style={styles.teamAvatarText}>{(name || 'T')[0].toUpperCase()}</Text>
      </View>
      <Text style={styles.teamName} numberOfLines={1}>{name || 'TBD'}</Text>
      <Text style={styles.teamScore}>{score || '—'}</Text>
    </View>
  );
}

export default function LiveScoresScreen({ navigation }) {
  const [matches, setMatches] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | live | completed | scheduled

  const loadMatches = async () => {
    try {
      const res = await legendsApi.getLiveScores();
      if (res.success) {
        setMatches((res.data || []).map(m => ({
          id: m.id,
          team1:     typeof m.team1 === 'object' ? m.team1?.name : String(m.team1 || 'TBD'),
          team2:     typeof m.team2 === 'object' ? m.team2?.name : String(m.team2 || 'TBD'),
          score1:    m.score1 || '',
          score2:    m.score2 || '',
          status:    m.status || 'scheduled',
          matchType: m.matchType || 'T20',
          venue:     m.venue || '',
          result:    m.result || '',
        })));
      }
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { loadMatches(); }, []);

  const onRefresh = async () => { setRefreshing(true); await loadMatches(); setRefreshing(false); };

  const FILTERS = ['all', 'live', 'completed', 'scheduled'];
  const displayed = filter === 'all' ? matches : matches.filter(m => m.status === filter);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={DS.lime} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Icon name="cricket" size={20} color={DS.textMuted} />
        <Text style={styles.headerTitle}>Live Scores</Text>
        <View style={styles.liveIndicator}>
          <View style={styles.liveDotHeader} />
          <Text style={styles.liveCountText}>
            {matches.filter(m => m.status === 'live').length} live
          </Text>
        </View>
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f} style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}>
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={displayed}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} />}
        renderItem={({ item }) => (
          <MatchCard
            item={item}
            onPress={() => navigation.navigate('HomeTab', { screen: 'Scorecard', params: { matchId: item.id } })}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="cricket" size={52} color={DS.textMuted} />
            <Text style={styles.emptyTitle}>No matches found</Text>
            <Text style={styles.emptySub}>Start a match from the Home screen</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16,
  },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: DS.textPrimary },
  liveIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: DS.surfaceHighest, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4,
  },
  liveDotHeader: { width: 6, height: 6, borderRadius: 3, backgroundColor: DS.live },
  liveCountText: { fontSize: 11, fontWeight: '700', color: DS.textVariant },

  filterRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16,
    paddingVertical: 12, backgroundColor: DS.surfaceLow,
  },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
    backgroundColor: DS.surfaceHigh,
  },
  filterChipActive: { backgroundColor: DS.lime },
  filterChipText: { fontSize: 12, fontWeight: '700', color: DS.textMuted },
  filterChipTextActive: { color: DS.bg },

  list: { padding: 16, gap: 12 },

  card: { backgroundColor: DS.surfaceHigh, borderRadius: 14, overflow: 'hidden' },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: DS.surfaceHighest, paddingHorizontal: 14, paddingVertical: 10,
  },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  matchType: { fontSize: 11, fontWeight: '800', color: DS.textVariant, letterSpacing: 0.5 },
  venue: { fontSize: 10, color: DS.textMuted, flex: 1 },

  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DS.live, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' },
  liveText: { fontSize: 10, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  donePill: {
    fontSize: 10, fontWeight: '800', color: DS.lime,
    backgroundColor: 'rgba(171,214,0,0.12)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    overflow: 'hidden',
  },
  scheduledPill: {
    fontSize: 10, fontWeight: '800', color: '#f59e0b',
    backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    overflow: 'hidden',
  },

  teamsBlock: { padding: 14, gap: 4 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  teamAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center',
  },
  teamAvatarText: { fontSize: 12, fontWeight: '900', color: DS.lime },
  teamName: { flex: 1, fontSize: 14, fontWeight: '700', color: DS.textPrimary },
  teamScore: { fontSize: 15, fontWeight: '900', color: '#fff' },
  vsDivider: { alignItems: 'center', paddingVertical: 2 },
  vsText: { fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 1 },

  resultBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingBottom: 8,
  },
  resultText: { fontSize: 12, fontWeight: '600', color: DS.lime, flex: 1 },

  insightsLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2,
    paddingHorizontal: 14, paddingBottom: 12,
  },
  insightsLinkText: { fontSize: 12, fontWeight: '700', color: DS.lime },

  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: DS.textVariant },
  emptySub: { fontSize: 13, color: DS.textMuted },
});
