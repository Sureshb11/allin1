import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  RefreshControl, Modal, Share, Dimensions, StatusBar, Animated, Alert,
  FlatList, TextInput, Image
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport, setSelectedSport } from '../utils/selectedSport';
import { SPORTS, getDashboard } from '../sports/dashboard';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { useHideTabBarOnScroll, useTabBarClearance } from '../components/AutoHideTabBar';
import { MatchCard, FILTERS, FILTER_STATUS_MAP } from './MyMatchesScreen';
import TeamManagementScreen from './TeamManagementScreen';
import TournamentsScreen from './TournamentsScreen';
import StatisticsScreen from './StatisticsScreen';
import { useCurrentUser } from '../utils/currentUser';
import BrandLogo, { BRAND_NAME, BRAND_TAGLINE } from '../components/BrandLogo';
import AppHeader from '../components/AppHeader';
import HexAvatar from '../components/HexAvatar';

const { width } = Dimensions.get('window');

// "X need 45 off 30 balls" for a live 2nd-innings chase. Derived purely from
// fields the /circle API already returns (score strings + toss + currentInnings),
// so it needs no extra backend data:
//   • who batted first  = toss winner if they chose bat, else the other team
//   • target            = first team's runs + 1 (from their score string)
//   • need / balls left  = from the chasing team's score string + total overs
// Returns null for non-cricket, 1st innings, finished chases, or missing toss.
const nameOf = (t) => (typeof t === 'object' ? (t?.name || 'Team') : String(t || 'Team'));
const parseScoreStr = (s) => {
  if (!s || typeof s !== 'string') return { runs: null, overs: null };
  const m = s.match(/(\d+)\s*\/?\s*\d*\s*(?:\(([\d.]+)\))?/);
  if (!m) return { runs: null, overs: null };
  return { runs: m[1] != null ? +m[1] : null, overs: m[2] != null ? +m[2] : null };
};
const chaseLine = (m) => {
  if (String(m.status) !== 'live' || (m.currentInnings || 1) < 2) return null;
  if (!m.tossWinnerId || !m.team1Id || !m.team2Id) return null;
  const other = (id) => (id === m.team1Id ? m.team2Id : m.team1Id);
  const firstId = m.tossDecision === 'bat' ? m.tossWinnerId : other(m.tossWinnerId);
  const chaseId = other(firstId);
  const first = parseScoreStr(firstId === m.team1Id ? m.score1 : m.score2);
  const chase = parseScoreStr(chaseId === m.team1Id ? m.score1 : m.score2);
  if (first.runs == null) return null;
  const need = Math.max(0, first.runs + 1 - (chase.runs || 0));
  if (need <= 0) return null;
  // Overs are "O.B" notation (10.3 = 10 overs, 3 balls) → total balls bowled.
  const ov = chase.overs || 0;
  const whole = Math.floor(ov);
  const ballsBowled = whole * 6 + Math.round((ov - whole) * 10);
  const ballsLeft = Math.max(0, (m.overs || 20) * 6 - ballsBowled);
  if (ballsLeft <= 0) return null;
  const chaseName = nameOf(chaseId === m.team1Id ? m.team1 : m.team2);
  return `${chaseName} need ${need} off ${ballsLeft} ball${ballsLeft !== 1 ? 's' : ''}`;
};

const MORE_ITEMS = [
  { label: 'Go Live',        icon: 'broadcast',                  screen: 'StreamingLanding', color: '#EF4444' },
  { label: 'News Feed',      icon: 'newspaper-variant-outline',  screen: 'NewsFeed',         color: '#3B82F6' },
  { label: 'Marketplace',    icon: 'store-outline',              screen: 'MarketPlace',      color: '#10B981' },
  { label: 'Ground Booking', icon: 'map-marker-outline',         screen: 'GroundBooking',    color: '#F59E0B' },
  { label: 'Team Chat',      icon: 'message-outline',            screen: 'Chat',             color: '#8B5CF6' },
  { label: 'Daily Quiz',     icon: 'head-question-outline',      screen: 'Quiz',             color: '#EC4899' },
  { label: 'Video Analysis', icon: 'video-outline',              screen: 'VideoAnalysis',    color: '#06B6D4' },
  { label: 'Premium',        icon: 'star-circle-outline',        screen: 'Premium',          color: 'lime' },
  { label: 'Looking For',    icon: 'telescope',                  screen: 'LookingFor',       color: '#6366F1' },
  { label: 'Coaching',       icon: 'school',                     screen: 'Coaching',         color: '#0EA5E9' },
  { label: 'Umpires',        icon: 'whistle',                    screen: 'Umpires',          color: '#14B8A6' },
];

// Full navigation menu — moved out of the old burger drawer and onto this screen.
// Grouped into Play / Performance / Explore, rendered as icon tiles in the feed.
const MENU_SECTIONS = [
  { title: 'Play', items: [
    { id: 'tournament',  label: 'Tournaments',          icon: 'trophy-outline',       screen: 'Tournaments' },
  ]},
];

function matchStatus(ms, scheduleStr) {
  if (ms === 'live') return 'LIVE NOW';
  if (ms === 'scheduled') return scheduleStr || 'UPCOMING';
  if (ms === 'completed') return 'COMPLETED';
  return 'UNKNOWN';
}

const AnimatedPulse = ({ children }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.02, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim]);
  return <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>{children}</Animated.View>;
};

export default function HomeScreen({ navigation }) {
  const { colors: DS, mode, isDark, typography } = useTheme();
  const styles = useMemo(() => makeStyles(DS, typography), [DS, typography]);
  const lcStyles = useThemedStyles(makeLcStyles);
  const hideTabBar = useHideTabBarOnScroll();
  const tabClear = useTabBarClearance();
  const meUser = useCurrentUser();
  const [liveMatches, setLiveMatches] = useState([]);
  const [players, setPlayers]         = useState([]);
  const [me, setMe]                   = useState(null);   // { user, player } when logged in
  const [refreshing, setRefreshing]   = useState(false);
  const [loading, setLoading]         = useState(true);
  const [moreVisible, setMoreVisible]         = useState(false);
  const [activeNavTab, setActiveNavTab]       = useState(0);
  const [showGuestQR, setShowGuestQR]         = useState(false);
  const [currentSport, setCurrentSport]       = useState(SPORTS[0]);
  const [currentFormat, setCurrentFormat]     = useState(null);
  const [query, setQuery]                     = useState('');
  const [status, setStatus]                   = useState('all');

  // Re-read sport/format from the singleton every time this screen gains focus,
  // so picking a new sport in SportPickerScreen always updates the UI.
  useFocusEffect(useCallback(() => {
    const { sport: sel, format: selFormat } = getSelectedSport();
    if (sel) {
      const matched = SPORTS.find(s => s.id === sel.id) || SPORTS[0];
      setCurrentSport(matched);
      setCurrentFormat(selFormat || null);
    }
  }, []));
  const sportAnim                             = useRef(new Animated.Value(1)).current;
  const contentAnim                           = useRef(new Animated.Value(1)).current;

  const cfg = getDashboard(currentSport.id);

  const load = async () => {
    try {
      const { sport: selSport } = getSelectedSport();
      const sportId = selSport?.id || 'cricket';
      const [lm, pl] = await Promise.all([
        legendsApi.getCircleMatches({ sport: sportId }),
        legendsApi.getPlayers({ sport: sportId }),
      ]);
      if (lm?.success) {
        setLiveMatches((lm.data || []).map(m => ({
          ...m,
          team1: typeof m.team1 === 'object' ? (m.team1?.name || 'Team 1') : String(m.team1 || 'Team 1'),
          team2: typeof m.team2 === 'object' ? (m.team2?.name || 'Team 2') : String(m.team2 || 'Team 2'),
          score1: String(m.score1 || '—'), score2: String(m.score2 || '—'),
          status: String(m.status || 'scheduled'), matchType: String(m.matchType || 'T20'),
          chase: chaseLine(m),
        })));
      }
      if (pl?.success) setPlayers(pl.data || []);
      // Logged-in user + linked player (no-op under dev auth bypass).
      const meRes = await legendsApi.getMe();
      setMe(meRes?.success ? meRes.data : null);
    } catch { setLiveMatches([]); setPlayers([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { 
    load(); 
  }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleNavTab = (i) => {
    const tab = cfg.navTabs[i];
    if (tab.screen === 'more') { setMoreVisible(true); return; }
    if (tab.screen) { navigation.navigate(tab.screen); return; }
    setActiveNavTab(i);
  };

  const startMatch = async (m) => {
    const t1 = typeof m.team1 === 'object' && m.team1 ? m.team1 : { id: m.team1Id, name: m.team1 };
    const t2 = typeof m.team2 === 'object' && m.team2 ? m.team2 : { id: m.team2Id, name: m.team2 };
    let firstInningId;
    const innRes = await legendsApi.getMatchInnings(m.id);
    if (innRes.success && innRes.data?.length) firstInningId = innRes.data[0].id;
    navigation.navigate('TossLineup', {
      matchId: m.id,
      team1: t1.name, team2: t2.name,
      team1Id: t1.id, team2Id: t2.id,
      overs: String(m.overs || 20),
      venue: m.venue || '',
      matchType: m.matchType || 'T20',
      firstInningId,
      sport: m.sport || 'cricket',
    });
  };

  const filteredMatches = useMemo(() => {
    const mappedStatus = FILTER_STATUS_MAP[status];
    return liveMatches
      .filter(m => mappedStatus === 'all' || (m.status || '') === mappedStatus)
      .filter(m => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        const t1 = typeof m.team1 === 'object' ? m.team1?.name : m.team1;
        const t2 = typeof m.team2 === 'object' ? m.team2?.name : m.team2;
        return [t1, t2, m.venue, m.matchType].join(' ').toLowerCase().includes(q);
      });
  }, [liveMatches, status, query]);

  // Per-filter match counts (query-aware) so each filter chip can show its own
  // count as a badge — matching the Teams tab pattern.
  const filterCounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qMatch = (m) => {
      if (!q) return true;
      const t1 = typeof m.team1 === 'object' ? m.team1?.name : m.team1;
      const t2 = typeof m.team2 === 'object' ? m.team2?.name : m.team2;
      return [t1, t2, m.venue, m.matchType].join(' ').toLowerCase().includes(q);
    };
    const counts = {};
    FILTERS.forEach((f) => {
      const mapped = FILTER_STATUS_MAP[f];
      counts[f] = liveMatches.filter(m => qMatch(m) && (mapped === 'all' || (m.status || '') === mapped)).length;
    });
    return counts;
  }, [liveMatches, query]);

  const shareScore = async (match) => {
    const msg = `${match.team1} ${match.score1} vs ${match.team2} ${match.score2} — Live on ${BRAND_NAME}\n${BRAND_TAGLINE}`;
    await Share.share({ message: msg });
  };

  const sportColor = currentSport.color;

  // "My Cricket" summary — prefer the logged-in user; in dev (auth bypassed,
  // no token) fall back to the first real DB player as a stand-in.
  const authedUser = me?.user;          // `me` state holds { user, player } from getMe()
  const authedPlayer = me?.player;       // may be null if no matching player
  const fallbackPlayer = players[0];
  const profilePlayer = authedUser ? authedPlayer : fallbackPlayer;
  const profileName = authedUser
    ? (`${authedUser.firstName || ''} ${authedUser.lastName || ''}`.trim() || 'Your Profile')
    : (fallbackPlayer?.name || 'Your Profile');
  const meInitials = profileName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'ME';
  const meRole = profilePlayer
    ? `${profilePlayer.role || 'Cricketer'}${profilePlayer.team?.name ? ' · ' + profilePlayer.team.name : ''}`
    : 'Set up your profile';
  const meStats = profilePlayer?.stats || {};
  const profileId = profilePlayer?.id;
  const meSports = me?.sports || [];   // [{ sport, isPrimary, … }]
  const meCells = [
    [String(meStats.matches ?? '—'), 'Matches'],
    [meStats.runs != null ? Number(meStats.runs).toLocaleString() : '—', 'Runs'],
    [String(meStats.wickets ?? '—'), 'Wickets'],
    [meStats.battingAverage != null ? String(meStats.battingAverage) : '—', 'Bat Avg'],
  ];

  return (
    <View style={styles.root}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />

      {/* ── TOP GLASS BAR ────────────────────────── */}
      <View style={styles.topGlassBar}>
        {/* Unified App Header */}
        <AppHeader />

        {/* ── NAV TABS ──────────────────────── */}
        <View style={styles.navTabs}>
          {cfg.navTabs.map((tab, i) => (
            <TouchableOpacity
              key={tab.label}
              style={[styles.navTab, activeNavTab === i && styles.navTabActive]}
              onPress={() => handleNavTab(i)}
            >
              <Icon name={tab.icon} size={18} color={activeNavTab === i ? DS.lime : DS.textVariant} />
              <Text
                style={[styles.navTabText, activeNavTab === i && styles.navTabTextActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── CONTENT ──────────────────────────── */}
      <Animated.View style={[{ flex: 1 }, { opacity: contentAnim }]}>
        {activeNavTab === 0 && (
          <FlatList
            style={styles.feed}
            contentContainerStyle={[styles.feedContent, { paddingBottom: 16 + tabClear }]}
            data={filteredMatches}
            keyExtractor={(item, i) => item.id || String(i)}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} />}
            showsVerticalScrollIndicator={false}
            {...hideTabBar}
            ListHeaderComponent={
              <View>
                {/* Start Match CTA */}
                <AnimatedPulse>
                  <View style={{ alignItems: 'stretch' }}>
                    <TouchableOpacity
                      style={styles.startMatchCTA}
                      onPress={() => navigation.navigate('StartMatch', { sport: currentSport })}
                      activeOpacity={0.88}
                    >
                      <View style={styles.startMatchLeft}>
                        <View style={styles.startMatchIconBox}>
                          <Icon name={currentSport.icon} size={26} color={DS.white} />
                        </View>
                        <View>
                          <Text style={styles.startMatchTitle}>
                            {currentSport.id === 'cricket' ? 'Toss & Play' : `Start a ${currentSport.name} Match`}
                          </Text>
                          <Text style={styles.startMatchSub}>{cfg.ctaSubtitle}</Text>
                        </View>
                      </View>
                      <View style={styles.startMatchRight}>
                        <Text style={styles.startMatchGo}>GO</Text>
                        <Icon name="chevron-right" size={20} color={DS.onBlue} />
                      </View>
                    </TouchableOpacity>
                  </View>
                </AnimatedPulse>

                {/* Filter tabs + count on one line (reclaims a full row) */}
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
                        {active && filterCounts[f] > 0 && (
                          <View style={[styles.filterCount, styles.filterCountActive]}>
                            <Text style={[styles.filterCountText, styles.filterCountTextActive]}>{filterCounts[f]}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            }
            renderItem={({ item }) => (
              <MatchCard
                m={item}
                isScorer={!!item.isScorer}
                onPress={() => currentSport.id === 'cricket' 
                  ? navigation.navigate('Scorecard', { matchId: item.id }) 
                  : navigation.navigate('MatchStats', { matchId: item.id, sportName: currentSport.name })}
                onStart={startMatch}
                onResume={(m) => navigation.navigate('Scoring', { resume: true, matchId: m.id })}
              />
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyIconWrap}>
                  <Icon name="cricket" size={48} color={DS.textMuted} />
                </View>
                <Text style={styles.emptyTitle}>No matches yet</Text>
                <Text style={styles.emptySub}>Start scoring your first match</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('StartMatch')} activeOpacity={0.9}>
                  <Icon name="play-circle" size={18} color={DS.white} />
                  <Text style={styles.emptyBtnText}>Start a Match</Text>
                </TouchableOpacity>
              </View>
            }
            ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          />
        )}
        {activeNavTab === 1 && <View style={{ flex: 1 }}><TeamManagementScreen navigation={navigation} inline={true} /></View>}
        {activeNavTab === 2 && <View style={{ flex: 1 }}><TournamentsScreen navigation={navigation} inline={true} /></View>}
        {activeNavTab === 3 && <View style={{ flex: 1 }}><StatisticsScreen navigation={navigation} inline={true} /></View>}
      </Animated.View>

      {/* ── MORE SHEET ─────────────────────── */}
      <Modal visible={moreVisible} transparent animationType="slide" onRequestClose={() => setMoreVisible(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setMoreVisible(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>More Features</Text>
          <View style={styles.moreGrid}>
            {MORE_ITEMS.map(item => {
              const color = item.color === 'lime' ? DS.lime : item.color;
              return (
              <TouchableOpacity
                key={item.label}
                style={styles.moreItem}
                onPress={() => { setMoreVisible(false); navigation.navigate(item.screen); }}
              >
                <View style={[styles.moreIcon, { backgroundColor: color + '22' }]}>
                  <Icon name={item.icon} size={22} color={color} />
                </View>
                <Text style={styles.moreLabel}>{item.label}</Text>
              </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

      {/* ── GUEST QR MODAL ─────────────────── */}
      <Modal visible={showGuestQR} transparent animationType="fade" onRequestClose={() => setShowGuestQR(false)}>
        <View style={styles.qrOverlay}>
          <View style={styles.qrSheet}>
            <View style={styles.qrHeader}>
              <Icon name="qrcode" size={20} color={DS.lime} />
              <Text style={styles.qrTitle}>Guest Scorer Mode</Text>
            </View>
            <Text style={styles.qrSub}>Scan this QR with scorer's phone</Text>
            <View style={styles.qrBox}>
              <View style={styles.qrGrid}>
                {[1,1,1,1,1,1,1,0,1,0,0,0,1,0,1,1,0,1,0,1,0,1,0,1,1,0,0,0,1,0,1,0,0,0,1,0,1,1,1,1,1,1,1,0,1,0,0,1,1,0,0,1,1,0,0,1,1,0,1,1,0,0,1,0,1,1,0,0,0,1,1,0,0,1,1,1,0,0,1,1].map((v, i) => (
                  <View key={i} style={[styles.qrCell, { backgroundColor: v ? DS.textPrimary : DS.surfaceHighest }]} />
                ))}
              </View>
            </View>
            <Text style={styles.qrNote}>No account needed — join instantly</Text>
            <TouchableOpacity style={styles.qrJoinBtn} onPress={() => setShowGuestQR(false)}>
              <Icon name="account-multiple" size={17} color={DS.bg} />
              <Text style={styles.qrJoinText}>Join as Guest Scorer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ── Live Match Card ────────────────────────────────────────────────
function LiveMatchCard({ match, sport, navigation, onShare }) {
  const DS = useTheme().colors;
  const lcStyles = useThemedStyles(makeLcStyles);
  const isLive = match.status === 'live';
  return (
    <View style={lcStyles.card}>
      <View style={lcStyles.cardHeader}>
        <View style={lcStyles.cardHeaderLeft}>
          {isLive && (
            <View style={lcStyles.livePill}>
              <Icon name="access-point" size={10} color={DS.white} />
              <Text style={lcStyles.livePillText}>LIVE</Text>
            </View>
          )}
          {!!match.venue && (
            <View style={lcStyles.venuePill}>
              <Icon name="map-marker" size={12} color={DS.textMuted} />
              <Text style={lcStyles.venueText} numberOfLines={1}>{match.venue}</Text>
            </View>
          )}
        </View>
        <View style={lcStyles.sportBadge}>
          <Icon name={sport.icon} size={12} color={DS.lime} />
          <Text style={lcStyles.sportBadgeText}>{sport.name}</Text>
        </View>
      </View>

      <View style={lcStyles.cardBody}>
        <View style={lcStyles.teamsRow}>
          <View style={lcStyles.teamCol}>
            <HexAvatar size={44} color={DS.surfaceHighest}>
              <Text style={lcStyles.teamInitial}>{match.team1.charAt(0).toUpperCase()}</Text>
            </HexAvatar>
            <Text style={lcStyles.teamName} numberOfLines={1}>{match.team1}</Text>
          </View>
          <View style={lcStyles.scoreCenter}>
            <Text style={lcStyles.scoreMain}>
              {match.score1 !== '—' ? match.score1 : '0'}
            </Text>
            <Text style={lcStyles.vsLabel}>vs</Text>
            <Text style={lcStyles.scoreMain}>
              {match.score2 !== '—' ? match.score2 : '—'}
            </Text>
          </View>
          <View style={[lcStyles.teamCol, { alignItems: 'flex-end' }]}>
            <HexAvatar size={44} color={DS.surfaceHighest}>
              <Text style={lcStyles.teamInitial}>{match.team2.charAt(0).toUpperCase()}</Text>
            </HexAvatar>
            <Text style={lcStyles.teamName} numberOfLines={1}>{match.team2}</Text>
          </View>
        </View>

        {match.chase ? (
          <View style={lcStyles.chaseRow}>
            <Icon name="target" size={12} color={DS.coral} />
            <Text style={lcStyles.chaseLine} numberOfLines={1}>{match.chase}</Text>
          </View>
        ) : null}

        <View style={lcStyles.actions}>
          <TouchableOpacity
            style={lcStyles.actionBtn}
            onPress={() => navigation.navigate('SportScoring', { match: { ...match, sport: sport.id } })}
          >
            <Icon name="crosshairs-gps" size={16} color={DS.bg} />
            <Text style={lcStyles.actionBtnText}>Score Live</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[lcStyles.actionBtn, lcStyles.actionBtnWhatsApp]} onPress={onShare}>
            <Icon name="whatsapp" size={16} color={DS.white} />
            <Text style={lcStyles.actionBtnTextWhatsApp}>WhatsApp</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const makeLcStyles = (DS, typography, radii, shadows) => StyleSheet.create({
  card: { backgroundColor: DS.surface, borderRadius: radii?.lg || 20, marginBottom: 16, borderWidth: 1, borderColor: DS.border, ...(shadows?.sm || {}) },
  cardHeader: { paddingHorizontal: 18, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: DS.surfaceHighest, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: DS.live, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  livePillText: { color: DS.white, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  venuePill: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  venueText: { color: DS.textVariant, fontSize: 13, fontWeight: '600', maxWidth: 140 },
  sportBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sportBadgeText: { color: DS.textMuted, fontSize: 12 },
  cardBody: { padding: 18 },
  teamsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  teamCol: { width: 90, alignItems: 'center', gap: 4 },
  teamAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  teamInitial: { fontSize: 18, fontWeight: '700', color: DS.textPrimary },
  teamName: { fontSize: 12, color: DS.textPrimary, fontWeight: '700', textAlign: 'center' },
  scoreCenter: { flex: 1, alignItems: 'center', gap: 2 },
  scoreMain: { fontSize: 22, fontWeight: '900', color: DS.lime, letterSpacing: -0.5 },
  vsLabel: { fontSize: 12, color: DS.textMuted, fontWeight: '600' },
  chaseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 12 },
  chaseLine: { fontSize: 12, fontWeight: '700', color: DS.textMuted, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, paddingVertical: 14, backgroundColor: DS.lime, shadowColor: DS.lime, shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  actionBtnText: { fontSize: 15, fontWeight: '800', color: DS.onLime },
  actionBtnWhatsApp: { backgroundColor: '#25D366' },
  actionBtnTextWhatsApp: { fontSize: 14, fontWeight: '700', color: DS.white },
});

const makeStyles = (DS, typography, radii, shadows) => StyleSheet.create({
  root: { flex: 1, backgroundColor: DS.bg },

  // Top Bar
  topGlassBar: {
    backgroundColor: DS.surfaceLow,
  },

  // Header
  header: { flexDirection: 'column', paddingTop: 16, paddingBottom: 10, paddingHorizontal: 16, backgroundColor: 'transparent' },
  headerRow1: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  headerBtn: { padding: 6, flexShrink: 0 },
  headerBrand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandText: { fontSize: 20, fontWeight: '800', color: DS.textPrimary, letterSpacing: 1.5 },
  brandBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: DS.lime, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  brandBadgeText: { fontSize: 13, fontWeight: '800', color: DS.bg, letterSpacing: 0.8 },
  headerRight: { flexDirection: 'row', gap: 2, flexShrink: 0 },
  // Sport selector row
  sportSelectorRow: { width: '100%' },
  sportSelector: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: DS.surfaceHigh, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  sportSelectorIconBox: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.surfaceHighest },
  sportSelectorText: { fontSize: 15, fontWeight: '700', color: DS.textPrimary },
  sportFormatBadge:  { fontSize: 10, color: DS.textMuted, fontWeight: '600', marginTop: 1, letterSpacing: 0.3 },
  sportSelectorRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sportSelectorHint: { fontSize: 11, color: DS.textMuted, fontWeight: '500' },

  // Nav tabs
  navTabs: { flexDirection: 'row', paddingTop: 12, paddingBottom: 8, paddingHorizontal: 6, gap: 4, backgroundColor: 'transparent' },
  navTab: { flex: 1, alignItems: 'center', paddingVertical: 6, gap: 2, borderRadius: 14 },
  navTabActive: {
    backgroundColor: DS.surfaceHighest,
    shadowColor: DS.lime, shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    borderWidth: 1, borderColor: DS.border,
    borderRadius: radii?.pill || 14,
  },
  navTabText: { fontSize: 10, fontWeight: '700', color: DS.textVariant, letterSpacing: 0.5 },
  navTabTextActive: { color: DS.lime },

  // Feed
  feed: { flex: 1 },
  feedContent: { paddingHorizontal: 16, paddingBottom: 16 },

  // Start Match CTA
  // My Cricket summary card
  mcCard: { backgroundColor: DS.surface, borderRadius: radii?.lg || 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: DS.border, ...(shadows?.sm || {}) },
  mcHeadRow: { flexDirection: 'row', alignItems: 'center' },
  mcAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center' },
  mcAvatarTxt: { color: DS.bg, fontSize: 17, fontWeight: '900' },
  mcName: { color: DS.textPrimary, fontSize: 16, fontWeight: '800' },
  mcRole: { color: DS.textMuted, fontSize: 12, marginTop: 2 },
  mcProfileBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  mcProfileTxt: { color: DS.lime, fontSize: 13, fontWeight: '700' },
  mcStatsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: DS.border },
  mcSportsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginTop: 13, paddingTop: 13, borderTopWidth: 1, borderTopColor: DS.border },
  mcSportsLbl: { color: DS.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginRight: 2 },
  mcSportChip: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 14, backgroundColor: DS.surfaceHighest },
  mcSportChipPrimary: { backgroundColor: DS.lime },
  mcSportChipTxt: { color: DS.textVariant, fontSize: 12, fontWeight: '700' },
  mcSportChipTxtPrimary: { color: DS.bg },
  mcStat: { flex: 1, alignItems: 'center' },
  mcStatVal: { color: DS.lime, fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  mcStatLbl: { color: DS.textMuted, fontSize: 10.5, fontWeight: '600', marginTop: 2, letterSpacing: 0.3 },

  startMatchCTA: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radii?.lg || 16, paddingVertical: 11, paddingHorizontal: 18, marginBottom: 12, backgroundColor: DS.blueDeep, elevation: 8, shadowColor: DS.blueDeep, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  startMatchLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  startMatchIconBox: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  startMatchTitle: { fontSize: 20, fontWeight: '800', color: DS.onBlue, textTransform: 'uppercase', letterSpacing: 0.5 },
  startMatchSub: { fontSize: 12, fontWeight: '600', color: DS.onBlue, marginTop: 2, letterSpacing: 0.3, opacity: 0.8 },
  startMatchRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  startMatchGo: { fontSize: 14, fontWeight: '800', color: DS.onBlue, letterSpacing: 1 },

  // Filters and Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.surfaceHigh, marginBottom: 8,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11,
  },
  searchInput: { flex: 1, fontSize: 14, color: DS.textPrimary },
  filtersRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 6, paddingTop: 14, paddingBottom: 10,
  },
  filterTab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'transparent',
  },
  filterTabActive: {
    backgroundColor: DS.lime,
  },
  filterTabText: {
    fontSize: 11, fontWeight: '800', color: DS.textVariant, letterSpacing: 0.5,
  },
  filterTabTextActive: { color: DS.bg },
  filterCount: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center',
  },
  filterCountActive: { backgroundColor: 'rgba(0,0,0,0.18)' },
  filterCountText: { fontSize: 10, fontWeight: '900', color: DS.textMuted },
  filterCountTextActive: { color: DS.bg },

  // Live matches rail
  liveCard: { width: 210, backgroundColor: DS.surface, borderRadius: radii?.md || 16, padding: 14, borderWidth: 1, borderColor: DS.border, ...(shadows?.sm || {}) },
  liveCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  liveCardTag: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6, color: DS.lime },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: DS.live },
  liveBadgeTxt: { color: DS.live, fontSize: 10, fontWeight: '800' },
  liveCardWhen: { color: DS.textMuted, fontSize: 11, fontWeight: '700' },
  liveTeamRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 4 },
  liveTeamName: { flex: 1, color: DS.textVariant, fontSize: 13, fontWeight: '600' },
  liveTeamScore: { color: DS.textPrimary, fontSize: 16, fontWeight: '800', marginLeft: 8 },
  liveCardFoot: { color: DS.lime, fontSize: 11, fontWeight: '700', marginTop: 8 },

  // Section headers
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: DS.textMuted, letterSpacing: 1.5, textTransform: 'uppercase' },

  // Sport Features grid
  featuresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  featureCard: { width: (width - 48 - 10) / 2, backgroundColor: DS.surface, borderRadius: radii?.md || 16, padding: 14, gap: 6, borderWidth: 1, borderColor: DS.border, ...(shadows?.sm || {}) },
  featureIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.surfaceHighest },
  featureLabel: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },
  featureDesc: { fontSize: 12, color: DS.textMuted, lineHeight: 16 },

  // Empty / loading states
  loadingCard: { backgroundColor: DS.surface, borderRadius: 20, padding: 40, alignItems: 'center', gap: 8, marginBottom: 16 },
  loadingText: { fontSize: 14, fontWeight: '600', color: DS.textMuted },
  emptyCard: { backgroundColor: DS.surface, borderRadius: 20, padding: 40, alignItems: 'center', gap: 8, marginBottom: 16 },
  emptyIconBox: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4, backgroundColor: DS.surfaceHighest },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: DS.textVariant },
  emptySub: { fontSize: 13, color: DS.textMuted, textAlign: 'center' },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 13, marginTop: 6, backgroundColor: DS.blueDeep },
  emptyBtnText: { fontSize: 14, fontWeight: '800', color: DS.white },

  // Leaderboard
  leaderCard: { backgroundColor: DS.surface, borderRadius: radii?.lg || 20, marginBottom: 20, borderWidth: 1, borderColor: DS.border, overflow: 'hidden', ...(shadows?.sm || {}) },
  leaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 13, gap: 10 },
  leaderRowDivider: { backgroundColor: DS.surfaceHigh },
  leaderRank: { width: 28, height: 28, borderRadius: 8, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  leaderRankGold: { backgroundColor: '#42391a' },
  leaderRankText: { fontSize: 13, fontWeight: '700', color: DS.textMuted },
  leaderAvatar: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  leaderAvatarText: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },
  leaderName: { flex: 1, fontSize: 14, fontWeight: '600', color: DS.textPrimary },
  leaderTeam: { fontSize: 12, color: DS.textMuted, maxWidth: 80 },
  leaderRole: { fontSize: 12, fontWeight: '700', marginLeft: 4, color: DS.lime },

  // Guest scorer card
  guestCard: { backgroundColor: DS.surface, borderRadius: radii?.md || 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, borderWidth: 1, borderColor: DS.border, ...(shadows?.sm || {}) },
  guestLeft: { flex: 1, gap: 4 },
  guestIconRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  guestTitle: { fontSize: 14, fontWeight: '700', color: DS.textPrimary },
  guestSubRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  guestSub: { fontSize: 13, color: DS.textMuted },
  guestBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: DS.lime, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  guestBtnText: { fontSize: 14, fontWeight: '700', color: DS.bg },

  // MORE sheet
  sheetOverlay: { flex: 1, backgroundColor: DS.overlay },
  sheet: { backgroundColor: DS.surface, borderTopLeftRadius: radii?.lg || 24, borderTopRightRadius: radii?.lg || 24, padding: 16, paddingBottom: 36, borderWidth: 1, borderColor: DS.border, ...(shadows?.md || {}) },
  sheetHandle: { width: 40, height: 4, backgroundColor: DS.surfaceHighest, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: DS.textPrimary, marginBottom: 16 },
  moreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  moreItem: { width: (width - 64) / 4, alignItems: 'center', gap: 6 },
  moreIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  moreLabel: { fontSize: 12, color: DS.textVariant, textAlign: 'center', fontWeight: '600' },

  // Guest QR modal
  qrOverlay: { flex: 1, backgroundColor: DS.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 },
  qrSheet: { backgroundColor: DS.surfaceLow, borderRadius: 24, padding: 30, width: '100%', maxWidth: 340, alignItems: 'center' },
  qrHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  qrTitle: { fontSize: 18, fontWeight: '800', color: DS.textPrimary },
  qrSub: { fontSize: 13, color: DS.textMuted, marginBottom: 20 },
  qrBox: { width: 180, height: 180, borderRadius: 16, backgroundColor: DS.surfaceHigh, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  qrGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 2, width: 160 },
  qrCell: { width: 11, height: 11, borderRadius: 1 },
  qrNote: { fontSize: 12, color: DS.textMuted, marginBottom: 20 },
  qrJoinBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', backgroundColor: DS.lime, borderRadius: 14, paddingVertical: 15, justifyContent: 'center' },
  qrJoinText: { fontSize: 14, fontWeight: '700', color: DS.bg },

  // Sport Picker
  sportPickerContainer: { flex: 1, flexDirection: 'column', backgroundColor: DS.overlay },
  sportPickerDismiss: { flex: 1 },
  sportPickerSheet: { height: 420, backgroundColor: DS.surfaceLow, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 12 },
  sportPickerHandle: { width: 40, height: 4, backgroundColor: DS.surfaceHighest, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sportPickerTitle: { fontSize: 16, fontWeight: '700', color: DS.textPrimary, marginBottom: 12 },
  sportPickerItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  sportPickerItemActive: { backgroundColor: DS.surfaceHigh, borderRadius: 12, paddingHorizontal: 8 },
  sportPickerIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sportPickerLabel: { fontSize: 14, fontWeight: '600', color: DS.textPrimary, flex: 1 },
});
