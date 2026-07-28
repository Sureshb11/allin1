import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { useHideTabBarOnScroll, useTabBarClearance } from "../components/AutoHideTabBar";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Animated, ScrollView, RefreshControl, Image } from 'react-native';
import Reanimated, {
  useAnimatedRef, useSharedValue, scrollTo,
  useAnimatedStyle, withRepeat, withTiming,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import HexAvatar from '../components/HexAvatar';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport } from '../utils/selectedSport';
import { getRankingBoards, rankValue } from '../sports/careerStats';
import { useCurrentUser } from '../utils/currentUser';

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
  // A rate, so it needs a floor like Average does: 200 off 4 balls is not a
  // strike rate, it's one lucky over.
  { id: 'strikeRate', label: 'Strike rate', icon: 'speedometer',
    value: (s) => s.strikeRate || 0, better: 'high',
    qualify: (s) => (s.ballsFaced || 0) >= 30, note: 'min 30 balls' },
  // A count, not a rate, so no threshold beyond having taken one — a board of
  // players on zero is just the squad list.
  { id: 'catches', label: 'Catches', icon: 'hand-back-right-outline',
    value: (s) => s.catches || 0, better: 'high',
    qualify: (s) => (s.catches || 0) > 0 },
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
// Boards come in two shapes and they are NOT interchangeable. The ones defined
// in this file carry `value: (row) => …`; the per-sport ones from careerStats
// carry `key`/`event` and are read with rankValue(). Reading a local board with
// rankValue gives row[undefined] — 0 for every cricket player, on every board.
const boardValue = (row, board) =>
  typeof board.value === 'function' ? board.value(row) : rankValue(row, board);

const sortFor = (board) => (a, b) => {
  const av = board.value(a), bv = board.value(b);
  const diff = board.better === 'low' ? av - bv : bv - av;
  return diff || (b.matches || 0) - (a.matches || 0) || a.name.localeCompare(b.name);
};


// A slow breathing halo behind the leader's row. Its own component so the
// animation is mounted once, for one row, instead of a repeating timer running
// behind all forty of them.
function ChampionGlow({ color }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1900 }), -1, true);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: 0.07 + pulse.value * 0.11 }));
  return (
    <Reanimated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14, backgroundColor: color }, style]} />
  );
}

// ── One competitor = one row ─────────────────────────────────────────────────
// Was a tall card carrying a five-column stat block, so three fitted a screen
// and the number the board actually ranks by was one of five equal-weight
// figures. Same fix as the Scout board: identity on the left, the ranked value
// alone on the right, everything else demoted to a meta line.
function RankRow({ item, rank, board, cols, isMe, isTeam, onPress }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const medal = rank < 3 ? MEDAL[rank] : null;

  // The figure this board sorts on — the reason the row is where it is.
  const headline = boardValue(item, board);
  // Matches leads: it's the sample size behind every other figure, and it went
  // missing when the tall card's "N matches" subtitle became this row.
  const played = `${item.matches || 0} ${(item.matches || 0) === 1 ? 'match' : 'matches'}`;
  const meta = isTeam
    ? [played, `${item.wins || 0}W`, `${item.losses || 0}L`].join(' · ')
    : [played, ...(cols || [
        { label: 'runs', value: (item.runs || 0).toLocaleString() },
        { label: 'avg', value: item.average },
        { label: 'SR', value: item.strikeRate },
        { label: 'wkts', value: item.wickets },
      ]).map((c) => `${c.value} ${c.label}`)].join(' · ');

  const top = rank < 3;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[styles.row, top && styles.rowTop, top && { borderColor: medal }, isMe && !top && styles.rowMe]}>
      {rank === 0 && <ChampionGlow color={medal} />}

      {/* Medal bar down the leading edge — a separate view, not a border, so the
          row can stay rounded. */}
      {top && <View style={[styles.medalBar, { backgroundColor: medal }]} />}

      <View style={[styles.rankBox, top && styles.rankBoxTop, top && { backgroundColor: medal, borderColor: medal }]}>
        <Text style={[styles.rankNum, top && styles.rankNumTop]}>{rank + 1}</Text>
      </View>

      <View>
        {item.avatarUrl ? (
          <Image
            source={{ uri: item.avatarUrl }}
            style={[styles.avatarImg, top && styles.avatarImgTop, medal && { borderColor: medal }]} />
        ) : (
          <HexAvatar round size={top ? 48 : 34} color={medal || DS.surfaceHighest}>
            <Text style={[styles.avatarText, top && styles.avatarTextTop]}>{initials(item.name)}</Text>
          </HexAvatar>
        )}
        {/* Only the leader gets the crown; three crowns is no crown. */}
        {rank === 0 && (
          <View style={[styles.crown, { backgroundColor: medal }]}>
            <Icon name="crown" size={11} color="#3b2c00" />
          </View>
        )}
      </View>

      <View style={styles.rowMain}>
        <Text style={[styles.rowName, top && styles.rowNameTop]} numberOfLines={1}>
          {item.name}{isMe ? '  ·  You' : ''}
        </Text>
        <Text style={[styles.rowMeta, top && styles.rowMetaTop]} numberOfLines={1}>{meta}</Text>
      </View>

      <View style={styles.headlineBox}>
        <Text style={[styles.headlineVal, top && styles.headlineValTop, top && { color: medal }]} numberOfLines={1}>
          {headline}
        </Text>
        <Text style={styles.headlineLbl} numberOfLines={1}>{board.label}</Text>
      </View>

      <Icon name="chevron-right" size={18} color={DS.textMuted} />
    </TouchableOpacity>
  );
}

export default function StatisticsScreen({ navigation, inline, pagerGesture }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);const hideTabBar = useHideTabBarOnScroll();const tabClear = useTabBarClearance();
  const [tab, setTab] = useState('Players');
  // Cricket keeps its Runs/Wickets/Economy boards; other sports rank on their
  // own event tallies (goals, cards …) so the tab labels match the sport.
  const sportId = getSelectedSport().sport?.id || 'cricket';
  const sportBoards = getRankingBoards(sportId);
  const activeBoards = sportBoards.length ? sportBoards : PLAYER_BOARDS;
  const [boardId, setBoardId] = useState(activeBoards[0].id);
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // ── Board-chip row: self-driven horizontal scroller (same as Scout's filters) ──
  // A dedicated Pan drives an Animated.ScrollView via Reanimated scrollTo and
  // blocks the Pavilion pager, so a horizontal drag scrolls the boards instead of
  // paging tabs. (The row overflows once there are 4+ boards.)
  const boardScroll = useAnimatedRef();
  const boardOffset = useSharedValue(0);
  const boardStart = useSharedValue(0);
  const boardMax = useSharedValue(0);
  const boardViewW = useRef(0);
  const boardContentW = useRef(0);
  const recomputeBoardMax = () => { boardMax.value = Math.max(0, boardContentW.current - boardViewW.current); };
  const boardPan = useMemo(() => {
    const g = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .onBegin(() => { boardStart.value = boardOffset.value; })
      .onUpdate((e) => {
        let next = boardStart.value - e.translationX;
        if (next < 0) next = 0; else if (next > boardMax.value) next = boardMax.value;
        boardOffset.value = next;
        scrollTo(boardScroll, next, 0, false);
      });
    return pagerGesture ? g.blocksExternalGesture(pagerGesture) : g;
  }, [pagerGesture, boardScroll, boardOffset, boardStart, boardMax]);
  const scrollBoardTo = (x) => { boardOffset.value = x; boardScroll.current?.scrollTo?.({ x, animated: true }); };
  // Each chip reports its own x, so scrolling one into view doesn't depend on
  // every chip being the same width (they aren't — "Runs" vs "Strike rate").
  const chipX = useRef({});
  const scrollChipIntoView = (idx) => {
    const x = chipX.current[idx];
    if (x == null) return;
    scrollBoardTo(Math.max(0, x - 40));
  };
  // "Find me" plumbing: scroll to the logged-in player's row on the board.
  const meUser = useCurrentUser();
  const myId = meUser?.id;
  const scrollRef = useRef(null);
  const myRowY = useRef(0);

  useLayoutEffect(() => {
    if (!inline) {
      navigation?.setOptions({
        headerShown: true,
        headerBackVisible: true,
        headerTitle: 'Statistics',
      });
    }
  }, [navigation, inline]);

  const fetchData = useCallback(async () => {
    const _sport = getSelectedSport().sport?.id;   // rankings are per-sport
    // Cricket ranks on its ball-by-ball derived stats; every other sport ranks
    // on SportEvent tallies, which getPlayers() doesn't carry.
    const isCricket = (_sport || 'cricket') === 'cricket';
    const [pr, tr] = await Promise.all([
      isCricket ? legendsApi.getPlayers({ sport: _sport }) : legendsApi.getLeaderboard(_sport),
      legendsApi.getTeams(_sport),
    ]);
    // Default every stat to 0 — a player/team with no stored stats used to crash
    // the card (e.g. `undefined.toLocaleString()`).
    setPlayers((pr?.data || []).map((p) => ({
      id: p.id, name: p.name,
      // From the linked user account; players themselves have no photo column.
      avatarUrl: p.user?.avatarUrl || p.avatarUrl || null,
      matches: 0, runs: 0, average: 0, strikeRate: 0, centuries: 0, wickets: 0, catches: 0,
      ...(p.stats || {}),
      // leaderboard rows carry these instead of a stats blob
      ...(p.matches != null ? { matches: p.matches } : {}),
      ...(p.eventTotals ? { eventTotals: p.eventTotals } : {}),
    })));
    setTeams((tr?.data || []).map((t) => ({
      id: t.id, name: t.name,
      matches: 0, wins: 0, losses: 0, totalRuns: 0, totalWickets: 0, winRate: 0,
      ...(t.stats || {}),
    })));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchData().finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData().finally(() => setRefreshing(false));
  }, [fetchData]);

  // Qualify → rank → stamp the standing → then filter by search. The standing is
  // fixed before searching, so looking up a name shows that player's real rank
  // rather than renumbering them to #1.
  const boards = tab === 'Players' ? activeBoards : TEAM_BOARDS;
  const board = boards.find((b) => b.id === boardId) || boards[0];
  const rawData = tab === 'Players' ? players : teams;
  const ranked = rawData
    .filter(board.qualify)
    .sort(sortFor(board))
    .map((item, i) => ({ ...item, standing: i }));
  const data = ranked.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
  // Where the logged-in player sits on the current board (pre-search, so it's the
  // real standing). Powers the "You're #N — find me" banner and row highlight.
  const myStanding = tab === 'Players' && myId ? ranked.find((r) => r.id === myId) : null;
  // Both destinations already exist and take exactly what a row holds, so this
  // hands off rather than duplicating a stats screen inside a sheet. The player
  // object rides along so Insights can paint before its fetch returns.
  const openDetail = (item) => {
    if (tab === 'Players') navigation?.navigate('PlayerInsights', {
      playerId: item.id,
      player: item,
      // Where they sit on the board you tapped from, so the profile can say so
      // instead of losing the context that made you open it.
      standing: item.standing + 1,
      boardLabel: board.label,
    });
    else navigation?.navigate('TeamProfile', { teamId: item.id });
  };

  const renderCard = ({ item }) => (
    <RankRow
      onPress={() => openDetail(item)}
      item={item}
      rank={item.standing}
      board={board}
      isMe={item.id === myId}
      isTeam={tab !== 'Players'}
      // Non-cricket: one entry per ranking board (Goals, Yellows …) plus
      // matches, instead of cricket's runs/avg/SR/wkts.
      cols={tab === 'Players' && sportBoards.length ? [
        { label: 'matches', value: item.matches ?? 0 },
        ...sportBoards.map((b) => ({ label: b.label.toLowerCase(), value: rankValue(item, b) })),
      ] : null} />
  );

  const scrollToMe = () => scrollRef.current?.scrollTo({ y: Math.max(0, myRowY.current - 12), animated: true });

  const listAnim = useRef(new Animated.Value(1)).current;

  const handleTabChange = (newTab) => {
    if (tab === newTab) return;
    Animated.timing(listAnim, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
      setTab(newTab);
      // Players and Teams have different boards, so a held-over id (e.g.
      // 'economy') would fall back to the first board silently. Reset explicitly,
      // and rewind the chip strip — it keeps its scroll offset across tabs, which
      // left the (now-selected) first chip clipped off the left edge.
      setBoardId((newTab === 'Players' ? activeBoards : TEAM_BOARDS)[0].id);
      scrollBoardTo(0);
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
          {/* Same toggle while loading, so the header doesn't jump when rows land. */}
          <View style={[styles.controlRow, { marginBottom: 12 }]}>
            <View style={styles.segment}>
              {TABS.map((t) => {
                const on = tab === t.id;
                return (
                  <TouchableOpacity key={t.id} style={[styles.segBtn, on && styles.segBtnOn]}
                    onPress={() => handleTabChange(t.id)} activeOpacity={0.85}>
                    <Icon name={t.icon} size={14} color={on ? DS.onLime : DS.textMuted} />
                    <Text style={[styles.segText, on && styles.segTextOn]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <StatSkeleton DS={DS} />
        </View>
      ) : (
        <Animated.View style={{ flex: 1, opacity: listAnim }}>
          {/* A vertical ScrollView (not a FlatList): a VirtualizedList grabs the
              horizontal drag and blocks the Pavilion pager's swipe; 45 rows don't
              need windowing, and this lets a swipe directional-lock cleanly. */}
          <ScrollView
            ref={scrollRef}
            {...hideTabBar}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} colors={[DS.lime]} />}
            contentContainerStyle={[styles.list, { paddingBottom: tabClear }]}>
            {/* "Find me" — jump straight to the logged-in player's row on a long
                board instead of scrolling to hunt for it. */}
            {myStanding && (
              <TouchableOpacity style={styles.findMe} onPress={scrollToMe} activeOpacity={0.85}>
                <Icon name="crosshairs-gps" size={16} color={DS.onLime} />
                <Text style={styles.findMeText}>You're #{myStanding.standing + 1} by {board.label.toLowerCase()}</Text>
                <Text style={styles.findMeJump}>Find me</Text>
              </TouchableOpacity>
            )}
            <View>
              {/* One row for both "what am I ranking" and "find someone in it".
                  These were two stacked full-width controls above a third row of
                  board chips — three bands of chrome over a list whose whole
                  point is now density. Search collapses to its icon until it's
                  wanted, and takes the row when it is. */}
              <View style={styles.controlRow}>
                {!searchOpen && (
                  <View style={styles.segment}>
                    {TABS.map((t) => {
                      const on = tab === t.id;
                      return (
                        <TouchableOpacity
                          key={t.id}
                          style={[styles.segBtn, on && styles.segBtnOn]}
                          onPress={() => handleTabChange(t.id)}
                          activeOpacity={0.85}>
                          <Icon name={t.icon} size={14} color={on ? DS.onLime : DS.textMuted} />
                          <Text style={[styles.segText, on && styles.segTextOn]}>{t.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {searchOpen ? (
                  <View style={styles.searchWrap}>
                    <Icon name="magnify" size={18} color={DS.lime} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder={`Search ${tab.toLowerCase()}`}
                      placeholderTextColor={DS.textMuted}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      autoFocus
                      returnKeyType="search"
                    />
                    <TouchableOpacity
                      onPress={() => { setSearchQuery(''); setSearchOpen(false); }}
                      hitSlop={10}>
                      <Icon name="close" size={18} color={DS.textMuted} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.searchBtn} onPress={() => setSearchOpen(true)} activeOpacity={0.85}>
                    <Icon name="magnify" size={19} color={DS.textVariant} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Board selector — what this leaderboard is actually ranking. Drag
                  to scroll (self-driven, blocks the pager); tap scrolls into view. */}
              <GestureDetector gesture={boardPan}>
                <Reanimated.ScrollView horizontal scrollEnabled={false}
                  ref={boardScroll} showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.boardBar}
                  onLayout={(e) => { boardViewW.current = e.nativeEvent.layout.width; recomputeBoardMax(); }}
                  onContentSizeChange={(w) => { boardContentW.current = w; recomputeBoardMax(); }}>
                  {boards.map((b, i) => {
                    const on = b.id === board.id;
                    return (
                      <TouchableOpacity key={b.id} activeOpacity={0.85}
                        style={[styles.boardChip, on && styles.boardChipActive]}
                        // Measured, not a fixed 92px guess: "Runs" and "Strike rate"
                        // are nowhere near the same width, so the selected chip
                        // landed off-centre or clipped.
                        onLayout={(e) => { chipX.current[i] = e.nativeEvent.layout.x; }}
                        onPress={() => { handleBoardChange(b.id); scrollChipIntoView(i); }}>
                        <Icon name={b.icon} size={13} color={on ? DS.onLime : DS.textMuted} />
                        <Text style={[styles.boardChipText, on && styles.boardChipTextActive]}>{b.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </Reanimated.ScrollView>
              </GestureDetector>
              {/* State the qualification instead of quietly dropping people */}
              {/* The threshold is the part worth stating; a tally isn't, on a
                  board that could hold six figures. */}
              <Text style={styles.boardMeta}>
                Ranked by {board.label.toLowerCase()}
                {board.note ? ` · ${board.note}` : ''}
              </Text>
            </View>
            {data.length === 0 ? (
              <View style={styles.empty}>
                <Icon name={board.icon || 'chart-bar'} size={44} color={DS.surfaceHighest} />
                <Text style={styles.emptyTitle}>
                  {searchQuery.trim()
                    ? 'No one matches that search'
                    : `No ${tab.toLowerCase()} ranked by ${board.label.toLowerCase()} yet`}
                </Text>
                <Text style={styles.emptySub}>
                  {searchQuery.trim()
                    ? 'Try a shorter search, or clear it.'
                    : board.note
                      ? `This board needs ${board.note} — nobody has reached that yet.`
                      : 'Play a match and the board fills in.'}
                </Text>
              </View>
            ) : (
              data.map((item, i) => {
                // The podium rows are bordered cards with their own margins — a
                // hairline under them would cut across the medal frame. Only the
                // plain rows get separated, and never the last one.
                const sep = item.standing >= 3 && i < data.length - 1
                  ? <View style={styles.sep} /> : null;
                return item.id === myId ? (
                  <View key={item.id} onLayout={(e) => { myRowY.current = e.nativeEvent.layout.y; }}>
                    {renderCard({ item })}
                    {sep}
                  </View>
                ) : (
                  <Fragment key={item.id}>
                    {renderCard({ item })}
                    {sep}
                  </Fragment>
                );
              })
            )}
          </ScrollView>
        </Animated.View>
      )}

    </View>);

}

const makeStyles = (DS) => StyleSheet.create({
  /* ── Compact rank rows (replaced the tall stat cards) ── */
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  /* Top three: taller, brighter, and carrying a medal. The board's whole point
     is who's winning, and every row looked identical to every other. */
  rowTop: {
    paddingVertical: 15, paddingLeft: 16, paddingRight: 12, marginVertical: 3,
    borderRadius: 14, borderWidth: 1.5, overflow: 'hidden',
  },
  medalBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  // The logged-in player's own row, so "Find me" lands somewhere obvious.
  rowMe: { backgroundColor: DS.lime + '12', borderRadius: 10, paddingHorizontal: 8, marginHorizontal: -8 },
  sep: { height: 1, backgroundColor: DS.faint, marginLeft: 74 },
  rankBox: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: DS.faint,
    alignItems: 'center', justifyContent: 'center',
  },
  rankNum: { fontSize: 12, fontWeight: '900', color: DS.textVariant },
  rankBoxTop: { width: 30, height: 30, borderRadius: 15 },
  // Dark ink on gold/silver/bronze — white on these fails contrast badly.
  rankNumTop: { fontSize: 14, color: '#2b2100' },
  avatarText: { fontSize: 12, fontWeight: '900', color: DS.onLime },
  avatarTextTop: { fontSize: 16 },
  crown: {
    position: 'absolute', top: -5, right: -3,
    width: 19, height: 19, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: DS.surfaceHighest,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  avatarImgTop: { width: 48, height: 48, borderRadius: 24, borderWidth: 2.5 },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { fontSize: 15, fontWeight: '700', color: DS.textPrimary, letterSpacing: -0.2 },
  rowNameTop: { fontSize: 17, fontWeight: '900', letterSpacing: -0.4 },
  rowMeta: { fontSize: 11.5, color: DS.textMuted, fontWeight: '500' },
  rowMetaTop: { fontSize: 12.5, color: DS.textVariant },
  // The one figure this board sorts on, given the weight it earns.
  headlineBox: { alignItems: 'flex-end', minWidth: 56 },
  headlineVal: { fontSize: 18, fontWeight: '900', color: DS.lime, letterSpacing: -0.4 },
  headlineValTop: { fontSize: 25, letterSpacing: -0.8 },
  headlineLbl: { fontSize: 9.5, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },

  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 32, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: DS.textVariant, marginTop: 10, textAlign: 'center' },
  emptySub: { fontSize: 12.5, color: DS.textMuted, textAlign: 'center', lineHeight: 18 },

  container: { flex: 1, backgroundColor: DS.bg },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: DS.bg, paddingTop: 52, paddingBottom: 12, paddingHorizontal: 16
  },
  heroTitle: { fontSize: 24, fontWeight: '900', color: DS.textPrimary, letterSpacing: 0.5 },

  /* One control row: Players/Teams on the left, search on the right. */
  controlRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  segment: {
    flex: 1, flexDirection: 'row', gap: 4, padding: 3,
    backgroundColor: DS.surfaceHigh, borderRadius: 999, borderWidth: 1, borderColor: DS.faint,
  },
  segBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 7, borderRadius: 999,
  },
  segBtnOn: { backgroundColor: DS.lime },
  segText: { fontSize: 13, fontWeight: '700', color: DS.textMuted },
  segTextOn: { color: DS.onLime, fontWeight: '900' },
  searchBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.faint,
  },

  // Board selector
  boardBar: { paddingHorizontal: 16, gap: 8, paddingBottom: 2 },
  // L3 filter chips: ghost (transparent + border) when off, bright-green fill when
  // selected — the one place the green accent gets to pop, below the near-black L1/L2.
  boardChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999,
    backgroundColor: 'transparent', borderWidth: 1.5, borderColor: DS.border,
  },
  boardChipActive: { backgroundColor: DS.lime, borderColor: DS.lime },
  boardChipText: { fontSize: 12, fontWeight: '800', color: DS.textMuted },
  boardChipTextActive: { color: DS.onLime },
  boardMeta: { fontSize: 11, color: DS.textMuted, marginHorizontal: 16, marginTop: 8, marginBottom: 10 },

  /* Search */
  // Sits in the control row now (was a standalone full-width band with its own
  // margins), so it has to fill the row rather than impose its own spacing.
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 40,
    backgroundColor: DS.surfaceHigh, borderRadius: 999, paddingHorizontal: 14,
    borderWidth: 1, borderColor: DS.lime,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600', color: DS.textPrimary, padding: 0 },

  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },


  findMe: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.lime, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
  },
  findMeText: { flex: 1, fontSize: 13, fontWeight: '800', color: DS.onLime, letterSpacing: 0.2 },
  findMeJump: { fontSize: 12, fontWeight: '800', color: DS.onLime, textDecorationLine: 'underline' },



});