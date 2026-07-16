import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { useHideTabBarOnScroll, useTabBarClearance } from "../components/AutoHideTabBar";
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Animated, ScrollView } from 'react-native';
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

// ── Boards ───────────────────────────────────────────────────────────────────
// One "Rankings" screen was really a batting board with a generic name: it
// ranked by runs only, so the league's leading wicket-taker sat at #6 and its
// most economical bowler at #79, even though the card shows a WKTS column.
// Each board picks its own metric, and only shows players who actually did that
// thing — a batting list padded with bowlers who never faced a ball is noise.
//
// `qualify` guards the rate boards. Averages and economy are ratios, so a tiny
// sample produces nonsense standings (185 runs off a single dismissal; a 0.00
// economy from a 3-ball spell). The threshold is surfaced in the UI rather than
// hidden, so the table explains itself.
const PLAYER_BOARDS = [
  { id: 'runs',    label: 'Runs',    icon: 'cricket',
    value: (s) => s.runs || 0, better: 'high',
    qualify: (s) => (s.ballsFaced || 0) > 0 },
  { id: 'wickets', label: 'Wickets', icon: 'weather-windy',
    value: (s) => s.wickets || 0, better: 'high',
    qualify: (s) => (s.ballsBowled || 0) > 0 },
  { id: 'average', label: 'Average', icon: 'numeric',
    value: (s) => s.average || 0, better: 'high',
    qualify: (s) => (s.innings || 0) >= 3, note: 'min 3 innings' },
  { id: 'economy', label: 'Economy', icon: 'lightning-bolt',
    value: (s) => s.economy ?? Infinity, better: 'low',
    qualify: (s) => (s.ballsBowled || 0) >= 12, note: 'min 2 overs' },
];

const TEAM_BOARDS = [
  // Wins before win rate on purpose: rate alone puts a team that won its only
  // game (100%) above one that went 3-2 across a season — a small-sample
  // artefact, not a league table.
  { id: 'wins',    label: 'Wins',    icon: 'trophy',
    value: (s) => s.wins || 0, better: 'high',
    qualify: (s) => (s.matches || 0) > 0 },
  { id: 'winRate', label: 'Win %',   icon: 'percent',
    value: (s) => s.winRate || 0, better: 'high',
    qualify: (s) => (s.matches || 0) >= 3, note: 'min 3 matches' },
  { id: 'runs',    label: 'Runs',    icon: 'cricket',
    value: (s) => s.totalRuns || 0, better: 'high',
    qualify: (s) => (s.matches || 0) > 0 },
];

// Sort by the board's metric, then by volume so a bigger body of work breaks
// ties, then by name so the order is stable between renders.
const sortFor = (board) => (a, b) => {
  const av = board.value(a), bv = board.value(b);
  const diff = board.better === 'low' ? av - bv : bv - av;
  return diff || (b.matches || 0) - (a.matches || 0) || a.name.localeCompare(b.name);
};

function PlayerCard({ item, rank, board }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const isTop = rank < 3;
  const rankColor = isTop ? MEDAL[rank] : DS.border;
  const avColor = AVATAR_RANK(DS)[rank] || DS.blue;
  return (
    <View style={[styles.card, isTop && { borderColor: rankColor, shadowColor: rankColor, shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }]}>
      <View style={styles.cardHeader}>
        <View style={styles.avatarWrap}>
          <HexAvatar size={42} color={avColor}>
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
      </View>
      <View style={styles.statRow}>
        {[
        // "100s" lived here and read 0 for everyone — nothing computed it, and
        // even now that it's real, nobody in the data has passed 86. Highest
        // score carries actual information in the same slot today, and the
        // economy board needs a bowling rate to look at.
        { label: 'Runs', value: (item.runs || 0).toLocaleString(), icon: 'cricket' },
        { label: 'Avg', value: item.average, icon: 'numeric' },
        { label: 'SR', value: item.strikeRate, icon: 'lightning-bolt' },
        board.id === 'wickets' || board.id === 'economy'
          ? { label: 'Econ', value: item.economy ?? '—', icon: 'gauge' }
          : { label: 'HS', value: item.highestScore ?? '—', icon: 'star-circle-outline' },
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
          <HexAvatar size={42} color={avColor}>
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

export default function StatisticsScreen({ navigation, inline }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);const hideTabBar = useHideTabBarOnScroll();const tabClear = useTabBarClearance();
  const [tab, setTab] = useState('Players');
  const [boardId, setBoardId] = useState(PLAYER_BOARDS[0].id);
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const boardBarRef = useRef(null);

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

  // Qualify → rank → stamp the standing → then filter by search. The standing is
  // fixed before searching, so looking up a name shows that player's real rank
  // rather than renumbering them to #1.
  const boards = tab === 'Players' ? PLAYER_BOARDS : TEAM_BOARDS;
  const board = boards.find((b) => b.id === boardId) || boards[0];
  const rawData = tab === 'Players' ? players : teams;
  const ranked = rawData
    .filter(board.qualify)
    .sort(sortFor(board))
    .map((item, i) => ({ ...item, standing: i }));
  const data = ranked.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const renderCard = tab === 'Players' ?
  ({ item }) => <PlayerCard item={item} rank={item.standing} board={board} /> :
  ({ item }) => <TeamCard item={item} rank={item.standing} />;

  const listAnim = useRef(new Animated.Value(1)).current;

  const handleTabChange = (newTab) => {
    if (tab === newTab) return;
    Animated.timing(listAnim, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
      setTab(newTab);
      // Players and Teams have different boards, so a held-over id (e.g.
      // 'economy') would fall back to the first board silently. Reset explicitly,
      // and rewind the chip strip — it keeps its scroll offset across tabs, which
      // left the (now-selected) first chip clipped off the left edge.
      setBoardId((newTab === 'Players' ? PLAYER_BOARDS : TEAM_BOARDS)[0].id);
      boardBarRef.current?.scrollTo({ x: 0, animated: false });
      Animated.timing(listAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    });
  };

  const handleBoardChange = (id) => {
    if (id === boardId) return;
    Animated.timing(listAnim, { toValue: 0, duration: 90, useNativeDriver: true }).start(() => {
      setBoardId(id);
      Animated.timing(listAnim, { toValue: 1, duration: 140, useNativeDriver: true }).start();
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
            {...hideTabBar}
            data={data}
            renderItem={renderCard}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.list, { paddingBottom: tabClear }]}
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
                {/* Board selector — what this leaderboard is actually ranking */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  ref={boardBarRef}
                  contentContainerStyle={styles.boardBar}>
                  {boards.map((b) => {
                    const on = b.id === board.id;
                    return (
                      <TouchableOpacity key={b.id} activeOpacity={0.85}
                        style={[styles.boardChip, on && styles.boardChipActive]}
                        onPress={() => handleBoardChange(b.id)}>
                        <Icon name={b.icon} size={13} color={on ? DS.bg : DS.textMuted} />
                        <Text style={[styles.boardChipText, on && styles.boardChipTextActive]}>{b.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                {/* State the qualification instead of quietly dropping people */}
                <Text style={styles.boardMeta}>
                  {data.length} ranked by {board.label.toLowerCase()}
                  {board.note ? ` · ${board.note}` : ''}
                </Text>
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

  // Board selector
  boardBar: { paddingHorizontal: 16, gap: 8, paddingBottom: 2 },
  boardChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: DS.surfaceLow, borderWidth: 1, borderColor: DS.border,
  },
  boardChipActive: { backgroundColor: DS.lime, borderColor: DS.lime },
  boardChipText: { fontSize: 12, fontWeight: '700', color: DS.textMuted },
  boardChipTextActive: { color: DS.bg },
  boardMeta: { fontSize: 11, color: DS.textMuted, marginHorizontal: 16, marginTop: 8, marginBottom: 10 },

  /* Search */
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.surface, marginHorizontal: 16, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9, marginTop: 14,
    borderWidth: 1, borderColor: DS.faint,
  },
  searchInput: { flex: 1, fontSize: 13, fontWeight: '500', color: DS.textPrimary, padding: 0 },

  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },

  card: { 
    backgroundColor: DS.surface, borderRadius: 16,
    borderWidth: 1, borderColor: DS.border,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, paddingBottom: 8 },
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
  cardName: { fontSize: 15, fontWeight: '800', color: DS.textPrimary },
  cardSub: { fontSize: 12, color: DS.textMuted, marginTop: 2, fontWeight: '500' },

  winRatePill: {
    backgroundColor: DS.success + '26', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center'
  },
  winRatePillText: { fontSize: 16, fontWeight: '900', color: DS.success, fontVariant: ['tabular-nums'] },
  winRatePillSub: { fontSize: 9, color: DS.success, fontWeight: '700' },

  ratioBar: {
    flexDirection: 'row', height: 14, overflow: 'hidden',
    marginHorizontal: 16, marginBottom: 8, borderRadius: 9,
    borderWidth: 1, borderColor: DS.border
  },
  ratioFill: { justifyContent: 'center', alignItems: 'center', minWidth: 24 },
  ratioFillText: { fontSize: 9, fontWeight: '800', color: DS.bg },

  statRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: 'transparent', gap: 8,
    borderBottomLeftRadius: 18, borderBottomRightRadius: 18
  },
  statItem: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: DS.surfaceHigh,
    paddingVertical: 8, borderRadius: 12,
    borderWidth: 1, borderColor: DS.faint
  },
  statVal: { fontSize: 14, fontWeight: '900', color: DS.textPrimary, fontVariant: ['tabular-nums'] },
  statLbl: { fontSize: 9, color: DS.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }
});