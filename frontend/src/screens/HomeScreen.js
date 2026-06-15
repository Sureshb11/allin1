import { useEffect, useState, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  RefreshControl, Modal, Share, Dimensions, StatusBar, Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import SimpleSidebar from '../components/SimpleSidebar';
import { getSelectedSport } from '../utils/selectedSport';

const { width } = Dimensions.get('window');

// ── Design System Constants ──────────────────────────────────────
const DS = {
  bg: '#0f131f',
  surfaceLow: '#171b28',
  surfaceHigh: '#262a37',
  surfaceHighest: '#313442',
  lime: '#abd600',
  coral: '#ffb59e',
  blue: '#b7c4ff',
  textPrimary: '#dfe2f3',
  textVariant: '#c3c5d9',
  textMuted: '#8d90a2',
  live: '#ef4444',
};

// ── Per-sport configuration ────────────────────────────────────────
const SPORTS = [
  { id: 'cricket',      name: 'Cricket',           icon: 'cricket',              color: '#2d7a3a' },
  { id: 'kabaddi',      name: 'Kabaddi',            icon: 'run-fast',             color: '#b45309' },
  { id: 'football',     name: 'Football',           icon: 'soccer',               color: '#1a5fa8' },
  { id: 'badminton',    name: 'Badminton',          icon: 'badminton',            color: '#0d7c8f' },
  { id: 'hockey',       name: 'Hockey',             icon: 'hockey-sticks',        color: '#1a6b8a' },
  { id: 'wrestling',    name: 'Wrestling',          icon: 'arm-flex-outline',     color: '#7f1d1d' },
  { id: 'boxing',       name: 'Boxing',             icon: 'boxing-glove',         color: '#b91c1c' },
  { id: 'tennis',       name: 'Tennis',             icon: 'tennis',               color: '#4d7c0f' },
  { id: 'tabletennis',  name: 'Table Tennis',       icon: 'table-tennis',         color: '#0e7490' },
  { id: 'basketball',   name: 'Basketball',         icon: 'basketball',           color: '#c2490d' },
  { id: 'volleyball',   name: 'Volleyball',         icon: 'volleyball',           color: '#7c3aed' },
  { id: 'khokho',       name: 'Kho-Kho',            icon: 'run',                  color: '#a16207' },
  { id: 'archery',      name: 'Archery & Shooting', icon: 'bow-arrow',            color: '#6b3a2a' },
  { id: 'judo',         name: 'Judo',               icon: 'human-handsup',        color: '#3b2f6e' },
  { id: 'karate',       name: 'Karate',             icon: 'karate',               color: '#7c1d1d' },
  { id: 'squash',       name: 'Squash',             icon: 'racquetball',          color: '#92400e' },
  { id: 'billiards',    name: 'Bowling & Billiards', icon: 'billiards',           color: '#1e4d2b' },
  { id: 'golf',         name: 'Golf',               icon: 'golf',                 color: '#3a6b1a' },
  { id: 'handball',     name: 'Handball',           icon: 'handball',             color: '#b54d9e' },
  { id: 'pickleball',   name: 'Pickleball',         icon: 'tennis',               color: '#0f766e' },
  { id: 'snowboarding', name: 'Snowboarding',       icon: 'snowboard',            color: '#1e40af' },
];

// Generate a default config for any sport
const makeCfg = (sport, matchLabel, ctaSubtitle, features, emptyTitle, emptySub) => ({
  ctaSubtitle,
  navTabs: [
    { label: matchLabel, icon: sport.icon,                          screen: null },
    { label: 'LEAGUES',  icon: 'trophy-outline',                   screen: 'Tournaments' },
    { label: 'TEAMS',    icon: 'account-group-outline',            screen: 'TeamManagement' },
    { label: 'STATS',    icon: 'chart-bar',                        screen: 'Statistics' },
    { label: 'MORE',     icon: 'dots-horizontal-circle-outline',   screen: 'more' },
  ],
  quickAccess: [
    { label: 'My Stats',   icon: 'chart-line',           screen: 'MyPerformance' },
    { label: 'My Matches', icon: sport.icon,             screen: 'MyMatches' },
    { label: 'Live',       icon: 'access-point',         screen: null },
    { label: 'Standings',  icon: 'format-list-numbered', screen: 'Statistics' },
  ],
  features,
  emptyTitle,
  emptySub,
});

// Build sport configs lazily from the SPORTS array so every sport has a config
const _buildConfigs = () => {
  const custom = {
    cricket: {
      ctaSubtitle: 'Ball-by-ball live scoring',
      navTabs: [
        { label: 'MATCHES',     icon: 'cricket',                          screen: null },
        { label: 'TOURNAMENTS', icon: 'trophy-outline',                   screen: 'Tournaments' },
        { label: 'TEAMS',       icon: 'account-group-outline',            screen: 'TeamManagement' },
        { label: 'STATS',       icon: 'chart-bar',                        screen: 'Statistics' },
        { label: 'MORE',        icon: 'dots-horizontal-circle-outline',   screen: 'more' },
      ],
      quickAccess: [
        { label: 'My Performance', icon: 'chart-line',   screen: 'MyPerformance' },
        { label: 'My Matches',     icon: 'cricket',      screen: 'MyMatches' },
        { label: 'Live Scores',    icon: 'access-point', screen: null },
        { label: 'Insights',       icon: 'lightbulb-on', screen: 'Statistics' },
      ],
      features: [
        { label: 'Toss & Lineup', icon: 'format-list-checks', desc: 'Set playing XI & toss' },
        { label: 'DRS Review',    icon: 'eye-outline',         desc: 'Track review usage' },
        { label: 'Over Stats',    icon: 'chart-timeline',      desc: 'Over-by-over breakdown' },
        { label: 'Wagon Wheel',   icon: 'chart-donut',         desc: 'Shot visualization' },
      ],
      emptyTitle: 'No live cricket matches',
      emptySub: 'Start a match and score ball-by-ball',
    },
    football: makeCfg(SPORTS[1], 'MATCHES', 'Track goals, cards & assists live', [
      { label: 'Goal Tracker',   icon: 'soccer',       desc: 'Goals, assists & cards' },
      { label: 'Formations',     icon: 'dots-grid',    desc: 'Tactical lineup view' },
      { label: 'Half Time',      icon: 'clock-outline', desc: 'Period breakdown' },
      { label: 'Player Ratings', icon: 'star-outline', desc: 'Rate your players' },
    ], 'No live football matches', 'Start a match and track goals live'),
    basketball: makeCfg(SPORTS[2], 'GAMES', 'Track points, fouls & rebounds', [
      { label: 'Point Tracker', icon: 'basketball',      desc: '2-pt, 3-pt, free throws' },
      { label: 'Foul Counter',  icon: 'hand-back-left',  desc: 'Personal & technical fouls' },
      { label: 'Quarter Stats', icon: 'chart-timeline',  desc: 'Quarter-by-quarter scores' },
      { label: 'Box Score',     icon: 'table',           desc: 'Full player stats table' },
    ], 'No live basketball games', 'Start a game and track every basket'),
    tennis: makeCfg(SPORTS[3], 'MATCHES', 'Track sets, games & points', [
      { label: 'Set Tracker', icon: 'tennis',           desc: 'Games & points per set' },
      { label: 'Serve Stats', icon: 'arrow-right-bold', desc: 'Aces, faults & %' },
      { label: 'Tiebreak',    icon: 'timer-outline',    desc: 'Auto tiebreak rules' },
      { label: 'Match Stats', icon: 'chart-bar',        desc: 'Winners & unforced errors' },
    ], 'No live tennis matches', 'Start a match and track every point'),
    volleyball: makeCfg(SPORTS[4], 'MATCHES', 'Track sets, rallies & rotations', [
      { label: 'Set Tracker',    icon: 'volleyball',    desc: 'Points per set (best of 5)' },
      { label: 'Serve Rotation', icon: 'rotate-right',  desc: 'Auto rotation tracking' },
      { label: 'Libero Track',   icon: 'account-outline', desc: 'Libero substitution rules' },
      { label: 'Rally Stats',    icon: 'chart-bar',     desc: 'Kills, blocks & errors' },
    ], 'No live volleyball matches', 'Start a match and track every rally'),
    badminton: makeCfg(SPORTS[5], 'MATCHES', 'Track games, sets & rallies', [
      { label: 'Game Tracker', icon: 'badminton',       desc: 'Points per game' },
      { label: 'Serve Track',  icon: 'arrow-right-bold', desc: 'Service faults & aces' },
      { label: 'Set Winner',   icon: 'trophy-outline',  desc: 'Best of 3 or 5 sets' },
      { label: 'Rally Stats',  icon: 'chart-bar',       desc: 'Rally length & winners' },
    ], 'No live badminton matches', 'Start a match and track every rally'),
    tabletennis: makeCfg(SPORTS[6], 'MATCHES', 'Track games & points live', [
      { label: 'Point Tracker', icon: 'table-tennis',   desc: 'Points per game' },
      { label: 'Serve Order',   icon: 'swap-horizontal', desc: 'Alternate serve tracking' },
      { label: 'Game Winner',   icon: 'trophy-outline', desc: 'Best of 5 or 7 games' },
      { label: 'Match Stats',   icon: 'chart-bar',      desc: 'Winners & errors' },
    ], 'No live table tennis matches', 'Start a match and track every point'),
    hockey: makeCfg(SPORTS[7], 'MATCHES', 'Track goals, cards & penalty corners', [
      { label: 'Goal Tracker',  icon: 'hockey-sticks',  desc: 'Goals & assists' },
      { label: 'Card Tracker',  icon: 'card-outline',   desc: 'Yellow & red cards' },
      { label: 'Quarter Stats', icon: 'chart-timeline', desc: 'Quarter-by-quarter' },
      { label: 'Penalty Corner', icon: 'flag-outline',  desc: 'PC attempts & goals' },
    ], 'No live hockey matches', 'Start a match and score every goal'),
    kabaddi: makeCfg(SPORTS[8], 'MATCHES', 'Track raids, tackles & points', [
      { label: 'Raid Tracker',  icon: 'run-fast',       desc: 'Raid points per player' },
      { label: 'Tackle Stats',  icon: 'hand-back-left', desc: 'Tackle points' },
      { label: 'Half Stats',    icon: 'chart-timeline', desc: 'First & second half' },
      { label: 'Team Points',   icon: 'chart-bar',      desc: 'Live score board' },
    ], 'No live kabaddi matches', 'Start a match and track every raid'),
    khokho: makeCfg(SPORTS[9], 'MATCHES', 'Track turns, chasing & points', [
      { label: 'Turn Tracker',  icon: 'run',            desc: 'Chase & defence turns' },
      { label: 'Point Log',     icon: 'chart-bar',      desc: 'Points per turn' },
      { label: 'Time Tracker',  icon: 'timer-outline',  desc: 'Each turn duration' },
      { label: 'Team Stats',    icon: 'account-group-outline', desc: 'Player contributions' },
    ], 'No live Kho-Kho matches', 'Start a match and track every turn'),
    boxing: makeCfg(SPORTS[10], 'BOUTS', 'Track rounds, punches & knockdowns', [
      { label: 'Round Tracker', icon: 'boxing-glove',   desc: 'Score per round' },
      { label: 'Punch Stats',   icon: 'chart-bar',      desc: 'Connect rate & combos' },
      { label: 'Knockdowns',    icon: 'arrow-down-bold', desc: 'KD count per round' },
      { label: 'Judge Cards',   icon: 'card-account-details-outline', desc: 'All 3 judge scores' },
    ], 'No live boxing bouts', 'Start a bout and score every round'),
    karate: makeCfg(SPORTS[11], 'BOUTS', 'Track ippon, waza-ari & penalties', [
      { label: 'Score Tracker', icon: 'karate',         desc: 'Ippon & waza-ari' },
      { label: 'Penalty Log',   icon: 'flag-outline',   desc: 'Hansoku & jogai' },
      { label: 'Round Stats',   icon: 'chart-timeline', desc: 'Per-round breakdown' },
      { label: 'Match Result',  icon: 'trophy-outline', desc: 'Final outcome' },
    ], 'No live karate bouts', 'Start a bout and track every point'),
    judo: makeCfg(SPORTS[12], 'BOUTS', 'Track ippon, waza-ari & shidos', [
      { label: 'Score Tracker', icon: 'human-handsup',  desc: 'Ippon & waza-ari' },
      { label: 'Shido Log',     icon: 'flag-outline',   desc: 'Penalties per bout' },
      { label: 'Golden Score',  icon: 'timer-outline',  desc: 'Overtime tracking' },
      { label: 'Result',        icon: 'trophy-outline', desc: 'Win by ippon or decision' },
    ], 'No live judo bouts', 'Start a bout and track every throw'),
    wrestling: makeCfg(SPORTS[13], 'BOUTS', 'Track takedowns, escapes & points', [
      { label: 'Point Tracker', icon: 'arm-flex-outline', desc: 'Takedowns & reversals' },
      { label: 'Period Stats',  icon: 'chart-timeline',   desc: 'Per-period breakdown' },
      { label: 'Penalty Log',   icon: 'flag-outline',     desc: 'Cautions & warnings' },
      { label: 'Result',        icon: 'trophy-outline',   desc: 'Pin, points or default' },
    ], 'No live wrestling bouts', 'Start a bout and track every move'),
    handball: makeCfg(SPORTS[14], 'MATCHES', 'Track goals, assists & saves', [
      { label: 'Goal Tracker',  icon: 'handball',       desc: 'Goals & assists' },
      { label: 'Save Stats',    icon: 'shield-outline', desc: 'Goalkeeper saves' },
      { label: 'Half Stats',    icon: 'chart-timeline', desc: 'First & second half' },
      { label: 'Card Tracker',  icon: 'card-outline',   desc: 'Yellow & red cards' },
    ], 'No live handball matches', 'Start a match and track every goal'),
    golf: makeCfg(SPORTS[15], 'ROUNDS', 'Track strokes, putts & scores', [
      { label: 'Stroke Tracker', icon: 'golf',          desc: 'Hole-by-hole strokes' },
      { label: 'Putt Counter',   icon: 'circle-outline', desc: 'Putts per hole' },
      { label: 'Score vs Par',   icon: 'chart-bar',     desc: 'Eagle, birdie, bogey' },
      { label: 'Leaderboard',    icon: 'format-list-numbered', desc: 'Live rankings' },
    ], 'No live golf rounds', 'Start a round and track every stroke'),
    archery: makeCfg(SPORTS[16], 'EVENTS', 'Track arrows, scores & rounds', [
      { label: 'Arrow Tracker',  icon: 'bow-arrow',     desc: 'Score per arrow' },
      { label: 'End Score',      icon: 'chart-bar',     desc: 'Total per end' },
      { label: 'Round Stats',    icon: 'chart-timeline', desc: 'Distance breakdown' },
      { label: 'Leaderboard',    icon: 'trophy-outline', desc: 'Competitor rankings' },
    ], 'No live archery events', 'Start an event and track every arrow'),
    squash: makeCfg(SPORTS[17], 'MATCHES', 'Track games, rallies & points', [
      { label: 'Game Tracker',  icon: 'racquetball',    desc: 'Points per game' },
      { label: 'Serve Stats',   icon: 'arrow-right-bold', desc: 'Service winners' },
      { label: 'Set Winner',    icon: 'trophy-outline', desc: 'Best of 5 games' },
      { label: 'Match Stats',   icon: 'chart-bar',      desc: 'Winners & errors' },
    ], 'No live squash matches', 'Start a match and track every point'),
    pickleball: makeCfg(SPORTS[18], 'MATCHES', 'Track rallies, dinks & smashes', [
      { label: 'Point Tracker', icon: 'tennis',         desc: 'Points per game' },
      { label: 'Serve Tracker', icon: 'arrow-right-bold', desc: 'Service faults' },
      { label: 'Game Winner',   icon: 'trophy-outline', desc: 'Best of 3 games' },
      { label: 'Match Stats',   icon: 'chart-bar',      desc: 'Winners & faults' },
    ], 'No live pickleball matches', 'Start a match and track every rally'),
    billiards: makeCfg(SPORTS[19], 'GAMES', 'Track frames, breaks & clearances', [
      { label: 'Frame Tracker', icon: 'billiards',      desc: 'Points per frame' },
      { label: 'Break Log',     icon: 'chart-bar',      desc: 'Century & max breaks' },
      { label: 'Frame Stats',   icon: 'chart-timeline', desc: 'Per-frame breakdown' },
      { label: 'Leaderboard',   icon: 'trophy-outline', desc: 'Match standings' },
    ], 'No live billiards games', 'Start a game and track every frame'),
    snowboarding: makeCfg(SPORTS[20], 'EVENTS', 'Track runs, tricks & scores', [
      { label: 'Run Tracker',   icon: 'snowboard',      desc: 'Score per run' },
      { label: 'Trick Log',     icon: 'star-outline',   desc: 'Tricks & grabs' },
      { label: 'Judge Scores',  icon: 'chart-bar',      desc: 'All judge scores' },
      { label: 'Leaderboard',   icon: 'trophy-outline', desc: 'Live rankings' },
    ], 'No live snowboarding events', 'Start an event and track every run'),
  };
  return custom;
};
const SPORT_CONFIG = _buildConfigs();

const MORE_ITEMS = [
  { label: 'Go Live',        icon: 'broadcast',                  screen: 'StreamingLanding', color: '#EF4444' },
  { label: 'News Feed',      icon: 'newspaper-variant-outline',  screen: 'NewsFeed',         color: '#3B82F6' },
  { label: 'Marketplace',    icon: 'store-outline',              screen: 'MarketPlace',      color: '#10B981' },
  { label: 'Ground Booking', icon: 'map-marker-outline',         screen: 'GroundBooking',    color: '#F59E0B' },
  { label: 'Team Chat',      icon: 'message-outline',            screen: 'Chat',             color: '#8B5CF6' },
  { label: 'Daily Quiz',     icon: 'head-question-outline',      screen: 'Quiz',             color: '#EC4899' },
  { label: 'Video Analysis', icon: 'video-outline',              screen: 'VideoAnalysis',    color: '#06B6D4' },
  { label: 'Premium',        icon: 'star-circle-outline',        screen: 'Premium',          color: DS.lime },
  { label: 'Looking For',    icon: 'telescope',                  screen: 'LookingFor',       color: '#6366F1' },
  { label: 'Coaching',       icon: 'school',                     screen: 'Coaching',         color: '#0EA5E9' },
  { label: 'Umpires',        icon: 'whistle',                    screen: 'Umpires',          color: '#14B8A6' },
];

export default function HomeScreen({ navigation }) {
  const [liveMatches, setLiveMatches] = useState([]);
  const [players, setPlayers]         = useState([]);
  const [me, setMe]                   = useState(null);   // { user, player } when logged in
  const [refreshing, setRefreshing]   = useState(false);
  const [loading, setLoading]         = useState(true);
  const [sidebarVisible, setSidebarVisible]   = useState(false);
  const [moreVisible, setMoreVisible]         = useState(false);
  const [activeNavTab, setActiveNavTab]       = useState(0);
  const [showGuestQR, setShowGuestQR]         = useState(false);
  const [showSportPicker, setShowSportPicker] = useState(false);
  const [currentSport, setCurrentSport]       = useState(SPORTS[0]);
  const [currentFormat, setCurrentFormat]     = useState(null);

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

  const cfg = SPORT_CONFIG[currentSport.id] || SPORT_CONFIG.cricket;

  const selectSport = (sport) => {
    // Animate sport selector button
    Animated.sequence([
      Animated.timing(sportAnim, { toValue: 0.7, duration: 80, useNativeDriver: true }),
      Animated.spring(sportAnim, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
    // Fade out → switch → fade in content
    Animated.timing(contentAnim, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setCurrentSport(sport);
      setCurrentFormat(null); // reset format when sport changes from in-app picker
      setActiveNavTab(0);
      Animated.timing(contentAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
    setShowSportPicker(false);
  };

  const load = async () => {
    try {
      const [lm, pl] = await Promise.all([
        legendsApi.getLiveScores(),
        legendsApi.getPlayers(),
      ]);
      if (lm?.success) {
        setLiveMatches((lm.data || []).map(m => ({
          ...m,
          team1: typeof m.team1 === 'object' ? (m.team1?.name || 'Team 1') : String(m.team1 || 'Team 1'),
          team2: typeof m.team2 === 'object' ? (m.team2?.name || 'Team 2') : String(m.team2 || 'Team 2'),
          score1: String(m.score1 || '—'), score2: String(m.score2 || '—'),
          status: String(m.status || 'scheduled'), matchType: String(m.matchType || 'T20'),
        })));
      }
      if (pl?.success) setPlayers(pl.data || []);
      // Logged-in user + linked player (no-op under dev auth bypass).
      const meRes = await legendsApi.getMe();
      setMe(meRes?.success ? meRes.data : null);
    } catch { setLiveMatches([]); setPlayers([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleNavTab = (i) => {
    const tab = cfg.navTabs[i];
    if (tab.screen === 'more') { setMoreVisible(true); return; }
    if (tab.screen) { navigation.navigate(tab.screen); return; }
    setActiveNavTab(i);
  };

  const shareScore = async (match) => {
    const msg = `${match.team1} ${match.score1} vs ${match.team2} ${match.score2} — Live on Local Legends!`;
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
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />

      {/* ── HEADER ────────────────────────── */}
      <View style={styles.header}>

        {/* Row 1: menu · logo · icons */}
        <View style={styles.headerRow1}>
          <TouchableOpacity onPress={() => setSidebarVisible(true)} style={styles.headerBtn}>
            <Icon name="menu" size={24} color={DS.textPrimary} />
          </TouchableOpacity>

          <View style={styles.headerBrand}>
            <Text style={styles.brandText}>LOCAL</Text>
            <View style={styles.brandBadge}>
              <Icon name="star-four-points" size={10} color={DS.bg} style={{ marginRight: 3 }} />
              <Text style={styles.brandBadgeText}>LEGENDS</Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.navigate('GlobalSearch')}>
              <Icon name="magnify" size={22} color={DS.textVariant} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.navigate('Notification')}>
              <Icon name="bell-outline" size={22} color={DS.textVariant} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Row 2: sport switcher — full-width prominent button */}
        <Animated.View style={[styles.sportSelectorRow, { transform: [{ scale: sportAnim }] }]}>
          <TouchableOpacity
            style={styles.sportSelector}
            activeOpacity={0.8}
            onPress={() => setShowSportPicker(true)}
          >
            <View style={styles.sportSelectorIconBox}>
              <Icon name={currentSport.icon} size={18} color={DS.lime} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sportSelectorText} numberOfLines={1}>{currentSport.name}</Text>
              {currentFormat && (
                <Text style={styles.sportFormatBadge} numberOfLines={1}>{currentFormat.label}</Text>
              )}
            </View>
            <View style={styles.sportSelectorRight}>
              <Text style={styles.sportSelectorHint}>Change sport</Text>
              <Icon name="chevron-down" size={16} color={DS.textMuted} />
            </View>
          </TouchableOpacity>
        </Animated.View>

      </View>

      {/* ── NAV TABS ──────────────────────── */}
      <View style={styles.navTabs}>
        {cfg.navTabs.map((tab, i) => (
          <TouchableOpacity
            key={tab.label}
            style={[styles.navTab, activeNavTab === i && styles.navTabActive]}
            onPress={() => handleNavTab(i)}
          >
            <Icon name={tab.icon} size={18} color={activeNavTab === i ? DS.lime : DS.textMuted} />
            <Text style={[styles.navTabText, activeNavTab === i && styles.navTabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── FEED ──────────────────────────── */}
      <Animated.View style={[{ flex: 1 }, { opacity: contentAnim }]}>
        <ScrollView
          style={styles.feed}
          contentContainerStyle={styles.feedContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} />}
          showsVerticalScrollIndicator={false}
        >
          {/* My Cricket summary */}
          {currentSport.id === 'cricket' && (
            <View style={styles.mcCard}>
              <View style={styles.mcHeadRow}>
                <View style={styles.mcAvatar}><Text style={styles.mcAvatarTxt}>{meInitials}</Text></View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.mcName}>{profileName}</Text>
                  <Text style={styles.mcRole}>{meRole}</Text>
                </View>
                <TouchableOpacity
                  style={styles.mcProfileBtn}
                  onPress={() => navigation.navigate('PlayerInsights', { playerId: profileId })}
                >
                  <Text style={styles.mcProfileTxt}>Profile</Text>
                  <Icon name="chevron-right" size={16} color={DS.lime} />
                </TouchableOpacity>
              </View>
              <View style={styles.mcStatsRow}>
                {meCells.map(([v, l]) => (
                  <View key={l} style={styles.mcStat}>
                    <Text style={styles.mcStatVal}>{v}</Text>
                    <Text style={styles.mcStatLbl}>{l}</Text>
                  </View>
                ))}
              </View>

              {meSports.length > 0 && (
                <View style={styles.mcSportsRow}>
                  <Text style={styles.mcSportsLbl}>MY SPORTS</Text>
                  {meSports.map((sp) => (
                    <View key={sp.sport} style={[styles.mcSportChip, sp.isPrimary && styles.mcSportChipPrimary]}>
                      <Text style={[styles.mcSportChipTxt, sp.isPrimary && styles.mcSportChipTxtPrimary]}>
                        {sp.sport.charAt(0).toUpperCase() + sp.sport.slice(1)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Start Match CTA */}
          <TouchableOpacity
            style={styles.startMatchCTA}
            onPress={() => navigation.navigate('StartMatch', { sport: currentSport })}
            activeOpacity={0.88}
          >
            <View style={styles.startMatchLeft}>
              <View style={styles.startMatchIconBox}>
                <Icon name={currentSport.icon} size={26} color={DS.bg} />
              </View>
              <View>
                <Text style={styles.startMatchTitle}>Start a {currentSport.name} Match</Text>
                <Text style={styles.startMatchSub}>{cfg.ctaSubtitle}</Text>
              </View>
            </View>
            <Icon name="chevron-right" size={22} color={DS.bg} />
          </TouchableOpacity>

          {/* Quick Access Grid */}
          <View style={styles.quickGrid}>
            {cfg.quickAccess.map(q => (
              <TouchableOpacity
                key={q.label}
                style={styles.quickItem}
                onPress={() => q.screen && navigation.navigate(q.screen)}
              >
                <View style={styles.quickIcon}>
                  <Icon name={q.icon} size={20} color={DS.lime} />
                </View>
                <Text style={styles.quickLabel}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Sport Features */}
          <View style={styles.sectionHeader}>
            <Icon name="star-four-points" size={13} color={DS.textMuted} />
            <Text style={styles.sectionLabel}>{currentSport.name.toUpperCase()} FEATURES</Text>
          </View>
          <View style={styles.featuresGrid}>
            {cfg.features.map(f => (
              <View key={f.label} style={styles.featureCard}>
                <View style={styles.featureIcon}>
                  <Icon name={f.icon} size={22} color={DS.lime} />
                </View>
                <Text style={styles.featureLabel}>{f.label}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            ))}
          </View>

          {/* Top Players */}
          {players.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Icon name="trophy" size={13} color={DS.textMuted} />
                <Text style={styles.sectionLabel}>TOP PLAYERS</Text>
              </View>
              <View style={styles.leaderCard}>
                {players.slice(0, 3).map((p, i) => (
                  <View key={p.id || i} style={[styles.leaderRow, i < 2 && styles.leaderRowDivider]}>
                    <View style={[styles.leaderRank, i === 0 && styles.leaderRankGold]}>
                      {i === 0
                        ? <Icon name="medal" size={14} color={DS.lime} />
                        : <Text style={styles.leaderRankText}>{i + 1}</Text>}
                    </View>
                    <View style={[styles.leaderAvatar, { backgroundColor: DS.surfaceHighest }]}>
                      <Text style={styles.leaderAvatarText}>{(p.name || 'P').charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.leaderName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.leaderTeam} numberOfLines={1}>
                      {typeof p.team === 'object' ? p.team?.name : p.team || 'Free Agent'}
                    </Text>
                    <Text style={styles.leaderRole}>{p.role}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Guest Scorer QR */}
          <View style={styles.sectionHeader}>
            <Icon name="qrcode-scan" size={13} color={DS.textMuted} />
            <Text style={styles.sectionLabel}>GUEST SCORER</Text>
          </View>
          <View style={styles.guestCard}>
            <View style={styles.guestLeft}>
              <View style={styles.guestIconRow}>
                <Icon name="qrcode" size={16} color={DS.lime} />
                <Text style={styles.guestTitle}>Join as Guest Scorer</Text>
              </View>
              <View style={styles.guestSubRow}>
                <Icon name="line-scan" size={13} color={DS.textMuted} />
                <Text style={styles.guestSub}>Scan QR from captain's phone</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.guestBtn} onPress={() => setShowGuestQR(true)}>
              <Icon name="camera" size={15} color={DS.bg} />
              <Text style={styles.guestBtnText}>Scan QR</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      </Animated.View>

      {/* ── MORE SHEET ─────────────────────── */}
      <Modal visible={moreVisible} transparent animationType="slide" onRequestClose={() => setMoreVisible(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setMoreVisible(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>More Features</Text>
          <View style={styles.moreGrid}>
            {MORE_ITEMS.map(item => (
              <TouchableOpacity
                key={item.label}
                style={styles.moreItem}
                onPress={() => { setMoreVisible(false); navigation.navigate(item.screen); }}
              >
                <View style={[styles.moreIcon, { backgroundColor: item.color + '22' }]}>
                  <Icon name={item.icon} size={22} color={item.color} />
                </View>
                <Text style={styles.moreLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
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

      <SimpleSidebar visible={sidebarVisible} onClose={() => setSidebarVisible(false)} navigation={navigation} />

      {/* ── Sport Picker Modal ─────────────── */}
      <Modal visible={showSportPicker} transparent animationType="slide" onRequestClose={() => setShowSportPicker(false)}>
        {/* flex column: top area (tap to dismiss) + bottom sheet */}
        <View style={styles.sportPickerContainer}>
          <TouchableOpacity style={styles.sportPickerDismiss} activeOpacity={1} onPress={() => setShowSportPicker(false)} />
          <View style={styles.sportPickerSheet}>
            <View style={styles.sportPickerHandle} />
            <Text style={styles.sportPickerTitle}>Select Sport</Text>
            <ScrollView
              style={{ flex: 1 }}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 32 }}
            >
              {SPORTS.map(sport => {
                const isActive = currentSport.id === sport.id;
                return (
                  <TouchableOpacity
                    key={sport.id}
                    style={[styles.sportPickerItem, isActive && styles.sportPickerItemActive]}
                    onPress={() => selectSport(sport)}
                  >
                    <View style={[styles.sportPickerIcon, { backgroundColor: isActive ? DS.lime : DS.surfaceHighest }]}>
                      <Icon name={sport.icon} size={24} color={isActive ? DS.bg : DS.textMuted} />
                    </View>
                    <Text style={[styles.sportPickerLabel, isActive && { color: DS.lime, fontWeight: '700' }]}>
                      {sport.name}
                    </Text>
                    {isActive && <Icon name="check-circle" size={20} color={DS.lime} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Live Match Card ────────────────────────────────────────────────
function LiveMatchCard({ match, sport, navigation, onShare }) {
  const isLive = match.status === 'live';
  return (
    <View style={lcStyles.card}>
      <View style={lcStyles.cardHeader}>
        <View style={lcStyles.cardHeaderLeft}>
          {isLive && (
            <View style={lcStyles.livePill}>
              <Icon name="access-point" size={10} color="#fff" />
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
            <View style={[lcStyles.teamAvatar, { backgroundColor: DS.surfaceHighest }]}>
              <Text style={lcStyles.teamInitial}>{match.team1.charAt(0).toUpperCase()}</Text>
            </View>
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
            <View style={[lcStyles.teamAvatar, { backgroundColor: DS.surfaceHighest }]}>
              <Text style={lcStyles.teamInitial}>{match.team2.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={lcStyles.teamName} numberOfLines={1}>{match.team2}</Text>
          </View>
        </View>

        <View style={lcStyles.actions}>
          <TouchableOpacity
            style={lcStyles.actionBtn}
            onPress={() => navigation.navigate('SportScoring', { match: { ...match, sport: sport.id } })}
          >
            <Icon name="crosshairs-gps" size={16} color={DS.bg} />
            <Text style={lcStyles.actionBtnText}>Score Live</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[lcStyles.actionBtn, lcStyles.actionBtnWhatsApp]} onPress={onShare}>
            <Icon name="whatsapp" size={16} color="#fff" />
            <Text style={lcStyles.actionBtnTextWhatsApp}>WhatsApp</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const lcStyles = StyleSheet.create({
  card: { backgroundColor: DS.surfaceHigh, borderRadius: 20, marginBottom: 16 },
  cardHeader: { paddingHorizontal: 18, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: DS.surfaceHighest, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: DS.live, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  livePillText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
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
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, paddingVertical: 14, backgroundColor: DS.lime },
  actionBtnText: { fontSize: 14, fontWeight: '700', color: DS.bg },
  actionBtnWhatsApp: { backgroundColor: '#25D366' },
  actionBtnTextWhatsApp: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: DS.bg },

  // Header
  header: { flexDirection: 'column', paddingTop: 48, paddingBottom: 10, paddingHorizontal: 16, backgroundColor: DS.surfaceLow },
  headerRow1: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  headerBtn: { padding: 6, flexShrink: 0 },
  headerBrand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
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
  navTabs: { flexDirection: 'row', paddingBottom: 8, backgroundColor: DS.surfaceLow },
  navTab: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 },
  navTabActive: { backgroundColor: DS.surfaceHigh, borderRadius: 0 },
  navTabText: { fontSize: 9, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.5 },
  navTabTextActive: { color: DS.lime },

  // Feed
  feed: { flex: 1 },
  feedContent: { padding: 16, paddingTop: 16 },

  // Start Match CTA
  // My Cricket summary card
  mcCard: { backgroundColor: DS.surfaceHigh, borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(171,214,0,0.18)' },
  mcHeadRow: { flexDirection: 'row', alignItems: 'center' },
  mcAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center' },
  mcAvatarTxt: { color: DS.bg, fontSize: 17, fontWeight: '900' },
  mcName: { color: DS.textPrimary, fontSize: 16, fontWeight: '800' },
  mcRole: { color: DS.textMuted, fontSize: 12, marginTop: 2 },
  mcProfileBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  mcProfileTxt: { color: DS.lime, fontSize: 13, fontWeight: '700' },
  mcStatsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(150,170,210,0.10)' },
  mcSportsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginTop: 13, paddingTop: 13, borderTopWidth: 1, borderTopColor: 'rgba(150,170,210,0.10)' },
  mcSportsLbl: { color: DS.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginRight: 2 },
  mcSportChip: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 14, backgroundColor: DS.surfaceHighest },
  mcSportChipPrimary: { backgroundColor: DS.lime },
  mcSportChipTxt: { color: DS.textVariant, fontSize: 12, fontWeight: '700' },
  mcSportChipTxtPrimary: { color: DS.bg },
  mcStat: { flex: 1, alignItems: 'center' },
  mcStatVal: { color: DS.lime, fontSize: 18, fontWeight: '900' },
  mcStatLbl: { color: DS.textMuted, fontSize: 10.5, fontWeight: '600', marginTop: 2, letterSpacing: 0.3 },

  startMatchCTA: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 20, padding: 20, marginBottom: 16, backgroundColor: DS.lime },
  startMatchLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  startMatchIconBox: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(15,19,31,0.15)', alignItems: 'center', justifyContent: 'center' },
  startMatchTitle: { fontSize: 16, fontWeight: '700', color: DS.bg },
  startMatchSub: { fontSize: 12, color: 'rgba(15,19,31,0.6)', marginTop: 2 },

  // Quick Access
  quickGrid: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  quickItem: { flex: 1, alignItems: 'center', gap: 6 },
  quickIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.surfaceHigh },
  quickLabel: { fontSize: 12, color: DS.textVariant, fontWeight: '600', textAlign: 'center' },

  // Section headers
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: DS.textMuted, letterSpacing: 1.5, textTransform: 'uppercase' },

  // Sport Features grid
  featuresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  featureCard: { width: (width - 48 - 10) / 2, backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 14, gap: 6 },
  featureIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.surfaceHighest },
  featureLabel: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },
  featureDesc: { fontSize: 12, color: DS.textMuted, lineHeight: 16 },

  // Empty / loading states
  loadingCard: { backgroundColor: DS.surfaceHigh, borderRadius: 20, padding: 40, alignItems: 'center', gap: 8, marginBottom: 16 },
  loadingText: { fontSize: 14, fontWeight: '600', color: DS.textMuted },
  emptyCard: { backgroundColor: DS.surfaceHigh, borderRadius: 20, padding: 40, alignItems: 'center', gap: 8, marginBottom: 16 },
  emptyIconBox: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4, backgroundColor: DS.surfaceHighest },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: DS.textVariant },
  emptySub: { fontSize: 13, color: DS.textMuted, textAlign: 'center' },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 10, marginTop: 6, backgroundColor: DS.lime },
  emptyBtnText: { fontSize: 13, fontWeight: '700', color: DS.bg },

  // Leaderboard
  leaderCard: { backgroundColor: DS.surfaceHigh, borderRadius: 20, marginBottom: 20 },
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
  guestCard: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  guestLeft: { flex: 1, gap: 4 },
  guestIconRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  guestTitle: { fontSize: 14, fontWeight: '700', color: DS.textPrimary },
  guestSubRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  guestSub: { fontSize: 13, color: DS.textMuted },
  guestBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: DS.lime, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  guestBtnText: { fontSize: 14, fontWeight: '700', color: DS.bg },

  // MORE sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: DS.surfaceLow, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 36 },
  sheetHandle: { width: 40, height: 4, backgroundColor: DS.surfaceHighest, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: DS.textPrimary, marginBottom: 16 },
  moreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  moreItem: { width: (width - 64) / 4, alignItems: 'center', gap: 6 },
  moreIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  moreLabel: { fontSize: 12, color: DS.textVariant, textAlign: 'center', fontWeight: '600' },

  // Guest QR modal
  qrOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
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
  sportPickerContainer: { flex: 1, flexDirection: 'column', backgroundColor: 'rgba(0,0,0,0.6)' },
  sportPickerDismiss: { flex: 1 },
  sportPickerSheet: { height: 420, backgroundColor: DS.surfaceLow, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 12 },
  sportPickerHandle: { width: 40, height: 4, backgroundColor: DS.surfaceHighest, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sportPickerTitle: { fontSize: 16, fontWeight: '700', color: DS.textPrimary, marginBottom: 12 },
  sportPickerItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  sportPickerItemActive: { backgroundColor: DS.surfaceHigh, borderRadius: 12, paddingHorizontal: 8 },
  sportPickerIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sportPickerLabel: { fontSize: 14, fontWeight: '600', color: DS.textPrimary, flex: 1 },
});
