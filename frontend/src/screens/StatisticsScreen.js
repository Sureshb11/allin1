import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import HexAvatar from '../components/HexAvatar';
import legendsApi from '../services/LegendsApi';

const MEDAL = ['#FFD700', '#C0C0C0', '#CD7F32'];

// ── Shimmer Skeleton ────────────────────────────────────────────────────────
function StatSkeleton({ DS }) {
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
    <Animated.View style={{ width: w, height: h, borderRadius: r, backgroundColor: DS.surfaceHigh, opacity, marginTop: mt }} />
  );
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 24, gap: 14 }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ backgroundColor: DS.surfaceHigh, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: DS.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Bar w={42} h={42} r={21} />
            <View style={{ flex: 1, gap: 8 }}>
              <Bar w="55%" h={14} />
              <Bar w="32%" h={11} />
            </View>
          </View>
          <Bar w="100%" h={40} r={10} mt={14} />
        </View>
      ))}
    </View>
  );
}















const TABS = [
{ id: 'Players', label: 'Players', icon: 'account' },
{ id: 'Teams', label: 'Teams', icon: 'account-group' }];


function initials(name) {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

const AVATAR_RANK = (DS) => [DS.lime, '#434656', DS.blueDeep];
const trendFor = (rank, DS) =>
  rank === 0 ? { icon: 'trending-up', color: DS.success }
  : rank === 2 ? { icon: 'trending-down', color: DS.coral }
  : { icon: 'minus', color: DS.textMuted };

function PlayerCard({ item, rank }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const isTop = rank < 3;
  const rankColor = isTop ? MEDAL[rank] : DS.border;
  const avColor = AVATAR_RANK(DS)[rank] || DS.blue;
  const trend = trendFor(rank, DS);
  return (
    <View style={[styles.card, isTop && { borderColor: rankColor, shadowColor: rankColor, shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }]}>
      <View style={styles.cardHeader}>
        <View style={styles.avatarWrap}>
          <HexAvatar size={52} color={avColor}>
            <Text style={[styles.avatarText, { color: '#fff' }]}>{initials(item.name)}</Text>
          </HexAvatar>
          <View style={styles.rankBadge}>
            <Text style={styles.rankText}>{rank + 1}</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardSub}>{item.matches} matches</Text>
        </View>
        <Icon name={trend.icon} size={22} color={trend.color} />
      </View>
      <View style={styles.statRow}>
        {[
        { label: 'Runs', value: (item.runs || 0).toLocaleString(), icon: 'cricket' },
        { label: 'Avg', value: item.average, icon: 'numeric' },
        { label: 'SR', value: item.strikeRate, icon: 'lightning-bolt' },
        { label: '100s', value: item.centuries, icon: 'star-circle-outline' },
        { label: 'Wkts', value: item.wickets, icon: 'weather-windy' }].
        map((s) =>
        <View key={s.label} style={styles.statItem}>
            <Icon name={s.icon} size={16} color={DS.blue} />
            <Text style={styles.statVal}>{s.value}</Text>
            <Text style={styles.statLbl}>{s.label}</Text>
          </View>
        )}
      </View>
    </View>);

}

function TeamCard({ item, rank }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const pct = item.winRate;
  const isTop = rank < 3;
  const rankColor = isTop ? MEDAL[rank] : DS.border;
  const avColor = AVATAR_RANK(DS)[rank] || DS.blue;
  return (
    <View style={[styles.card, isTop && { borderColor: rankColor, shadowColor: rankColor, shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }]}>
      <View style={styles.cardHeader}>
        <View style={styles.avatarWrap}>
          <HexAvatar size={52} color={avColor}>
            <Text style={[styles.avatarText, { color: '#fff' }]}>{initials(item.name)}</Text>
          </HexAvatar>
          <View style={styles.rankBadge}>
            <Text style={styles.rankText}>{rank + 1}</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardSub}>{item.matches} matches played</Text>
        </View>
        <View style={styles.winRatePill}>
          <Text style={styles.winRatePillText}>{pct}%</Text>
          <Text style={styles.winRatePillSub}>Win</Text>
        </View>
      </View>

      {/* Win/Loss bar */}
      <View style={styles.ratioBar}>
        <View style={[styles.ratioFill, { flex: item.wins || 1, backgroundColor: DS.success }]}>
          <Text style={styles.ratioFillText}>{item.wins}W</Text>
        </View>
        <View style={[styles.ratioFill, { flex: item.losses || 1, backgroundColor: DS.live }]}>
          <Text style={styles.ratioFillText}>{item.losses}L</Text>
        </View>
      </View>

      <View style={styles.statRow}>
        {[
        { label: 'Wins', value: item.wins, color: DS.success },
        { label: 'Losses', value: item.losses, color: DS.live },
        { label: 'Runs', value: (item.totalRuns || 0).toLocaleString(), color: DS.lime },
        { label: 'Wickets', value: item.totalWickets, color: DS.blue }].
        map((s) =>
        <View key={s.label} style={styles.statItem}>
            <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLbl}>{s.label}</Text>
          </View>
        )}
      </View>
    </View>);

}

export default function StatisticsScreen({ navigation, inline }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const [tab, setTab] = useState('Players');
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    if (!inline) {
      navigation?.setOptions({
        headerShown: true,
        headerBackVisible: true,
        headerTitle: 'Statistics',
      });
    }
  }, [navigation, inline]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([legendsApi.getPlayers(), legendsApi.getTeams()]).then(([pr, tr]) => {
      if (!alive) return;
      // Default every stat to 0 — a player/team with no stored stats used to crash
      // the card (e.g. `undefined.toLocaleString()`).
      setPlayers((pr?.data || []).map((p) => ({
        id: p.id, name: p.name,
        matches: 0, runs: 0, average: 0, strikeRate: 0, centuries: 0, wickets: 0,
        ...(p.stats || {}),
      })));
      setTeams((tr?.data || []).map((t) => ({
        id: t.id, name: t.name,
        matches: 0, wins: 0, losses: 0, totalRuns: 0, totalWickets: 0, winRate: 0,
        ...(t.stats || {}),
      })));
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const rawData = tab === 'Players' ? players : teams;
  const data = rawData.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const renderCard = tab === 'Players' ?
  ({ item, index }) => <PlayerCard item={item} rank={index} /> :
  ({ item, index }) => <TeamCard item={item} rank={index} />;

  const listAnim = useRef(new Animated.Value(1)).current;

  const handleTabChange = (newTab) => {
    if (tab === newTab) return;
    Animated.timing(listAnim, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
      setTab(newTab);
      Animated.timing(listAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    });
  };

  return (
    <View style={styles.container}>
      {/* Hero */}
      {!inline && (
        <View style={styles.hero}>
          <Icon name="chart-bar" size={24} color={DS.lime} />
          <Text style={styles.heroTitle}>Rankings</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.list}>
          {/* Tab bar (rendered outside list while loading) */}
          <View style={styles.tabBar}>
            {TABS.map((t) =>
            <TouchableOpacity key={t.id} style={[styles.tabBtn, tab === t.id && styles.tabBtnActive]}
            onPress={() => handleTabChange(t.id)}>
                <Icon name={t.icon} size={15} color={tab === t.id ? DS.bg : DS.textMuted} />
                <Text style={[styles.tabBtnText, tab === t.id && styles.tabBtnTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            )}
          </View>
          <StatSkeleton DS={DS} />
        </View>
      ) : (
        <Animated.View style={{ flex: 1, opacity: listAnim }}>
          <FlatList
            data={data}
            renderItem={renderCard}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View>
                <View style={styles.searchWrap}>
                  <Icon name="magnify" size={18} color={DS.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder={`Search ${tab.toLowerCase()}...`}
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
                <View style={styles.tabBar}>
                {TABS.map((t) =>
                <TouchableOpacity key={t.id} style={[styles.tabBtn, tab === t.id && styles.tabBtnActive]}
                onPress={() => handleTabChange(t.id)}>
                    <Icon name={t.icon} size={15} color={tab === t.id ? DS.bg : DS.textMuted} />
                    <Text style={[styles.tabBtnText, tab === t.id && styles.tabBtnTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                )}
                </View>
              </View>
            }
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingVertical: 48, gap: 8 }}>
                <Icon name="chart-bar" size={44} color={DS.surfaceHighest} />
                <Text style={{ color: DS.textMuted, fontSize: 14 }}>No {tab.toLowerCase()} ranked yet</Text>
              </View>}
            showsVerticalScrollIndicator={false} />
        </Animated.View>
      )}

    </View>);

}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: DS.bg, paddingTop: 52, paddingBottom: 12, paddingHorizontal: 16
  },
  heroTitle: { fontSize: 24, fontWeight: '900', color: DS.textPrimary, letterSpacing: 0.5 },

  tabBar: {
    flexDirection: 'row', backgroundColor: DS.surfaceLow,
    marginHorizontal: 16, marginTop: 4, marginBottom: 12,
    borderRadius: 14, padding: 4,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, backgroundColor: 'transparent',
  },
  tabBtnActive: { backgroundColor: DS.lime, shadowColor: DS.lime, shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  tabBtnText: { fontWeight: '700', fontSize: 13, color: DS.textMuted },
  tabBtnTextActive: { color: DS.bg },

  /* Search */
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.surface, marginHorizontal: 16, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9, marginTop: 14,
    borderWidth: 1, borderColor: DS.faint,
  },
  searchInput: { flex: 1, fontSize: 13, fontWeight: '500', color: DS.textPrimary, padding: 0 },

  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },

  card: { 
    backgroundColor: DS.surface, borderRadius: 16,
    borderWidth: 1, borderColor: DS.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, paddingBottom: 12 },
  avatarWrap: { position: 'relative' },
  rankBadge: {
    position: 'absolute', top: -4, left: -4,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: DS.surfaceHighest,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: DS.surface
  },
  rankText: { fontSize: 11, fontWeight: '900', color: DS.textVariant },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '900' },
  cardName: { fontSize: 16, fontWeight: '800', color: DS.textPrimary },
  cardSub: { fontSize: 12, color: DS.textMuted, marginTop: 2, fontWeight: '500' },

  winRatePill: {
    backgroundColor: DS.success + '26', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center'
  },
  winRatePillText: { fontSize: 16, fontWeight: '900', color: DS.success, fontVariant: ['tabular-nums'] },
  winRatePillSub: { fontSize: 9, color: DS.success, fontWeight: '700' },

  ratioBar: {
    flexDirection: 'row', height: 18, overflow: 'hidden',
    marginHorizontal: 16, marginBottom: 8, borderRadius: 9,
    borderWidth: 1, borderColor: DS.border
  },
  ratioFill: { justifyContent: 'center', alignItems: 'center', minWidth: 24 },
  ratioFillText: { fontSize: 9, fontWeight: '800', color: DS.bg },

  statRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 12,
    backgroundColor: 'transparent', gap: 8,
    borderBottomLeftRadius: 18, borderBottomRightRadius: 18
  },
  statItem: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: DS.surfaceHigh,
    paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: DS.faint
  },
  statVal: { fontSize: 14, fontWeight: '900', color: DS.textPrimary, fontVariant: ['tabular-nums'] },
  statLbl: { fontSize: 9, color: DS.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }
});