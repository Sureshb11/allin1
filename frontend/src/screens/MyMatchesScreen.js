import React, { useEffect, useMemo, useState, useLayoutEffect, useRef } from 'react';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Pressable,
  FlatList, RefreshControl, Animated, LayoutAnimation, UIManager, Platform
} from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import HexAvatar from '../components/HexAvatar';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport } from '../utils/selectedSport';
import BrandLogo from '../components/BrandLogo';
import { teamNamePairStyle } from '../utils/teamNameSize';
import { useHideTabBarOnScroll, useTabBarClearance } from '../components/AutoHideTabBar';
import { makeControls } from '../theme/controls';
import { GestureDetector } from 'react-native-gesture-handler';
import { useFilterSwipe } from '../utils/useFilterSwipe';

// Single-accent: team avatars are the deep green (white initials read on it),
// matching the hexagons on the home feed.
const getTeamColor = () => '#0a5227';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
// ── Animated Pulse ────────────────────────────────────────────────────────
const AnimatedPulse = ({ children, style }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim]);
  return <Animated.View style={[{ transform: [{ scale: pulseAnim }] }, style]}>{children}</Animated.View>;
};

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

const MomentumBar = ({ m }) => {
  const DS = useTheme().colors;
  const momentum = useSharedValue(0.5);
  
  useEffect(() => {
    const t1len = (m.team1 || 'A').length;
    const t2len = (m.team2 || 'B').length;
    const base = t1len / (t1len + t2len);
    const target = Math.max(0.2, Math.min(0.8, base));
    momentum.value = target;

    momentum.value = withRepeat(
      withTiming(target + (Math.random() > 0.5 ? 0.15 : -0.15), { duration: 3500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const t1Style = useAnimatedStyle(() => ({
    width: `${momentum.value * 100}%`
  }));
  const t2Style = useAnimatedStyle(() => ({
    width: `${(1 - momentum.value) * 100}%`
  }));

  const t1Color = getTeamColor(m.team1, 0);
  const t2Color = getTeamColor(m.team2, 1);

  return (
    <View style={{ marginTop: 16, marginHorizontal: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontSize: 9, fontWeight: '800', color: DS.textMuted, letterSpacing: 1 }}>WIN PREDICTOR</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, flexDirection: 'row', overflow: 'hidden', backgroundColor: DS.surfaceLow }}>
        <Reanimated.View style={[t1Style, { backgroundColor: t1Color }]} />
        <Reanimated.View style={[t2Style, { backgroundColor: t2Color }]} />
      </View>
    </View>
  );
};

export function MatchCard({ m, onPress, onStart, onResume, isScorer }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const STATUS_META = makeStatusMeta(DS);
  const meta = STATUS_META[m.status] || STATUS_META.scheduled;
  const nameFit = teamNamePairStyle(m.team1, m.team2);
  const t1Init = (m.team1 || 'T')[0].toUpperCase();
  const t2Init = (m.team2 || 'T')[0].toUpperCase();
  const t1Color = getTeamColor(m.team1, 0);
  const t2Color = getTeamColor(m.team2, 1);

  const [expanded, setExpanded] = useState(false);

  const pulse = useRef(new Animated.Value(1)).current;
  const breathing = useSharedValue(0.2);
  useEffect(() => {
    if (m.status === 'live') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true })
        ])
      ).start();
      breathing.value = withRepeat(
        withTiming(0.8, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    }
  }, [m.status]);

  const breathingStyle = useAnimatedStyle(() => {
    if (m.status !== 'live') return {};
    return {
      borderColor: DS.live,
      borderWidth: 2,
      shadowColor: DS.live,
      shadowOpacity: breathing.value,
      shadowRadius: 15,
      elevation: 6
    };
  });

  const triggerHaptic = () => {
    const options = {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false
    };
    ReactNativeHapticFeedback.trigger("impactLight", options);
  };

  const toggleExpand = () => {
    triggerHaptic();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  const handleCardPress = () => {
    if (m.status === 'live') toggleExpand();
    else onPress(m);
  };

  return (
    <Pressable onPress={handleCardPress}>
      {({ pressed }) => (
        <Reanimated.View style={[styles.card, m.status === 'live' ? breathingStyle : {}, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {m.status === 'live' && <Animated.View style={[styles.liveDot, { opacity: pulse }]} />}
              <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              {m.createdAt ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Icon name="calendar-outline" size={10} color={DS.textMuted} />
                  <Text style={{ fontSize: 9, color: DS.textMuted }} numberOfLines={1}>
                    {new Date(m.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
              ) : null}
              {m.venue ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Icon name="map-marker-outline" size={10} color={DS.textMuted} />
                  <Text style={{ fontSize: 9, color: DS.textMuted, maxWidth: 60 }} numberOfLines={1}>{m.venue}</Text>
                </View>
              ) : null}
              <Text style={styles.formatText}>{m.matchType || 'T20'}</Text>
            </View>
          </View>

          <View style={[styles.broadcastLayout, { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, paddingHorizontal: 10 }]}>
            <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <HexAvatar size={28} color={t1Color}><Text style={[styles.teamAvatarText, { fontSize: 10 }]}>{t1Init}</Text></HexAvatar>
              <Text style={{ fontSize: 11, fontWeight: '700', color: DS.textPrimary, textAlign: 'center' }} numberOfLines={2}>{m.team1 || 'TBD'}</Text>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '900', color: DS.textPrimary }}>{splitScore(m.score1, m.overs).main || '-'}</Text>
                {splitScore(m.score1, m.overs).ov ? <Text style={{ fontSize: 10, fontWeight: '700', color: DS.textMuted }}>{splitScore(m.score1, m.overs).ov}</Text> : null}
              </View>
            </View>
            
            <View style={{ paddingHorizontal: 8, paddingTop: 12 }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: DS.textMuted, fontStyle: 'italic' }}>VS</Text>
            </View>

            <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <HexAvatar size={28} color={t2Color}><Text style={[styles.teamAvatarText, { fontSize: 10 }]}>{t2Init}</Text></HexAvatar>
              <Text style={{ fontSize: 11, fontWeight: '700', color: DS.textPrimary, textAlign: 'center' }} numberOfLines={2}>{m.team2 || 'TBD'}</Text>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '900', color: DS.textPrimary }}>{splitScore(m.score2, m.overs).main || '-'}</Text>
                {splitScore(m.score2, m.overs).ov ? <Text style={{ fontSize: 10, fontWeight: '700', color: DS.textMuted }}>{splitScore(m.score2, m.overs).ov}</Text> : null}
              </View>
            </View>
          </View>

          {m.result ? (
            <View style={styles.resultBanner}>
              <Text style={styles.resultBannerText} numberOfLines={1}>{m.result}</Text>
            </View>
          ) : null}

          {m.status === 'live' && <MomentumBar m={m} />}

          {expanded && m.status === 'live' && (
            <View style={styles.liveDrawer}>
              <View style={styles.liveDrawerHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.liveDrawerTitle}>Current Over</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                    {['1', '4', '0', 'W', '6', '1'].map((ball, i) => (
                      <View key={i} style={[styles.ballCircle, ball === 'W' ? { backgroundColor: '#ef4444' } : ball === '6' || ball === '4' ? { backgroundColor: DS.success } : null]}>
                        <Text style={[styles.ballCircleText, (ball === 'W' || ball === '6' || ball === '4') && { color: '#fff' }]}>{ball}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.liveDrawerTitle}>In the Middle</Text>
                  <View style={{ marginTop: 6, gap: 2 }}>
                    <Text style={styles.livePlayerText}>🏏 S. Sharma <Text style={{ fontWeight: '400' }}>(34*)</Text></Text>
                    <Text style={styles.livePlayerText}>🎾 A. Patel <Text style={{ fontWeight: '400' }}>(2/14)</Text></Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity style={styles.liveDrawerBtn} onPress={() => onPress(m)}>
                <Text style={styles.liveDrawerBtnText}>FULL SCORECARD</Text>
                <Icon name="arrow-right" size={16} color={DS.lime} />
              </TouchableOpacity>
            </View>
          )}

          {isScorer && (m.status === 'scheduled' || m.status === 'live') && (
            <View style={{ borderTopWidth: 1, borderTopColor: DS.faint }}>
              <TouchableOpacity 
                onPress={() => m.status === 'live' ? onResume(m) : onStart(m)} 
                style={{ paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: DS.surfaceHigh }}
              >
                <Icon name="play-circle" size={16} color={DS.textPrimary} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: DS.textPrimary, letterSpacing: 0.5 }}>
                  {m.status === 'live' ? 'RESUME SCORING' : 'START MATCH'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Reanimated.View>
      )}
    </Pressable>
  );
}

export const FILTERS = ['all', 'live', 'upcoming', 'completed'];
const FILTER_ICONS = { all: 'view-grid', live: 'circle-slice-8', upcoming: 'calendar-clock', completed: 'check-circle' };
export const FILTER_STATUS_MAP = { all: 'all', live: 'live', upcoming: 'scheduled', completed: 'completed' };

function LiveScoreTicker({ matches }) {
  // Every hook runs before any early return — bailing out first made useTheme
  // conditional, so the hook order changed the moment a match went live.
  const DS = useTheme().colors;
  const liveMatches = matches.filter(m => m.status === 'live');
  if (!liveMatches.length) return null;

  return (
    <View style={{ backgroundColor: '#111', borderBottomWidth: 2, borderBottomColor: DS.live }}>
      <FlatList
        data={liveMatches}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={m => m.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 16 }}
        renderItem={({ item: m }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#222', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: DS.live, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, gap: 4 }}>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#fff' }} />
              <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff', letterSpacing: 0.5 }}>LIVE</Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff', fontVariant: ['tabular-nums'] }}>
              {m.team1 || 'TBA'} <Text style={{ color: DS.live }}>{splitScore(m.score1, m.overs).main || '-'}</Text>
              <Text style={{ color: '#666', fontWeight: '500' }}>   VS   </Text>
              {m.team2 || 'TBA'} <Text style={{ color: DS.live }}>{splitScore(m.score2, m.overs).main || '-'}</Text>
            </Text>
          </View>
        )}
      />
    </View>
  );
}

export default function MyMatchesScreen({ navigation }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  // Search + filters come from the shared control language, so this screen,
  // My Teams and Tournaments switch their lists with the same control instead
  // of three that each look like a different app (theme/controls.js).
  const C = useThemedStyles(makeControls);
  const hideTabBar = useHideTabBarOnScroll();
  const tabClear = useTabBarClearance();
  const [query, setQuery]       = useState('');
  const [status, setStatus]     = useState('all');
  // Swipe steps All → Live → Upcoming → Completed. The live ticker's own
  // horizontal rail sits above the list, outside this gesture, so the two don't
  // compete.
  const filterSwipe = useFilterSwipe(FILTERS, status, setStatus);
  const [matches, setMatches]   = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading]   = useState(true);

  useLayoutEffect(() => {
    // Hide the native stack header — this screen has its own branded top bar
    // (logo + Toss & Play + search). Showing both stacked a duplicate "My Matches"
    // header above it. Back lives in the brand bar instead.
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const loadMatches = async () => {
    try {
      // "My Matches" = matches involving the user's own teams (owned / played / followed),
      // across every sport — not every match in the database.
      // Scope to the active sport — cricket matches must not list under football.
      const res = await legendsApi.getCircleMatches({ sport: getSelectedSport().sport?.id });
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

  // What each chip would show if you tapped it — counted after the search, so
  // the numbers describe the list you'd actually get rather than the whole
  // collection. These are one player's own matches, so counting them is cheap.
  const counts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const searched = matches.filter((m) => {
      if (!q) return true;
      const t1 = typeof m.team1 === 'object' ? m.team1?.name : m.team1;
      const t2 = typeof m.team2 === 'object' ? m.team2?.name : m.team2;
      return [t1, t2, m.venue, m.matchType].join(' ').toLowerCase().includes(q);
    });
    return FILTERS.reduce((acc, f) => {
      const want = FILTER_STATUS_MAP[f];
      acc[f] = want === 'all' ? searched.length : searched.filter((m) => (m.status || '') === want).length;
      return acc;
    }, {});
  }, [matches, query]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.brandBar}>
          <View style={styles.brandLeft}>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="arrow-left" size={22} color={DS.textPrimary} />
            </TouchableOpacity>
            <BrandLogo scale={0.8} />
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
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={22} color={DS.textPrimary} />
          </TouchableOpacity>
          <BrandLogo scale={0.8} />
        </View>
      </View>
      
      <LiveScoreTicker matches={matches} />

      {/* Search */}
      <View style={[C.searchField, styles.searchRow]}>
        <Icon name="magnify" size={18} color={DS.textMuted} />
        <TextInput
          style={C.searchFieldInput}
          placeholder="Search teams, venue, type..."
          placeholderTextColor={DS.textMuted}
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="close-circle" size={18} color={DS.faint} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters. Was a row of solid pills that inverted to a black fill — a
          third control doing the job My Teams did with a green segment and
          Tournaments did with this underline. The count moved onto the chip;
          the separate "N matches" line under the bar said the same thing a
          second time. */}
      <View style={[C.filterBar, { flexDirection: 'row' }]}>
        {FILTERS.map((f) => {
          const on = status === f;
          const n = counts[f];
          return (
            <TouchableOpacity
              key={f}
              style={[C.filterChip, on && C.filterChipActive]}
              onPress={() => setStatus(f)}
              activeOpacity={0.8}
            >
              <Icon name={FILTER_ICONS[f]} size={13} color={on ? DS.lime : DS.textMuted} />
              <Text style={[C.filterText, on && C.filterTextActive]}>{f[0].toUpperCase() + f.slice(1)}</Text>
              <View style={[C.filterCount, on && C.filterCountOn]}>
                <Text style={[C.filterCountText, on && C.filterCountTextOn]}>{n}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Swipe left/right anywhere on the list steps the filter row, the same
          as Home, My Teams and Tournaments. */}
      <GestureDetector gesture={filterSwipe}>
      <FlatList
        {...hideTabBar}
        data={filtered}
        keyExtractor={(item, i) => item.id || String(i)}
        contentContainerStyle={[styles.list, { paddingBottom: tabClear }]}
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
          filtered.length > 0 ? (
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
          ) : null
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
      </GestureDetector>

      {/* Floating Action Button for Quick Match */}
      <AnimatedPulse style={[styles.fabContainer, { bottom: tabClear + 16 }]}>
        <TouchableOpacity 
          style={styles.fab} 
          activeOpacity={0.9}
          onPress={() => navigation.navigate('StartMatch')}
        >
          <Icon name="plus" size={30} color="#000" />
        </TouchableOpacity>
      </AnimatedPulse>
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

  /* Search — the box itself is C.searchField; this is only where it sits. */
  searchRow: { marginHorizontal: 16, marginTop: 8 },

  /* List */
  list: { padding: 12, paddingTop: 4, gap: 8 },

  /* Card */
  card: {
    backgroundColor: DS.surface, borderRadius: 16,
    borderWidth: 1, borderColor: DS.faint,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2,
  },
  statusText: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  liveDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: DS.live,
  },
  formatText: { fontSize: 11, fontWeight: '800', color: DS.textMuted, letterSpacing: 1 },

  
  /* Live Drawer */
  liveDrawer: {
    backgroundColor: '#111827',
    padding: 16,
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  liveDrawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  liveDrawerTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  livePlayerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f9fafb',
  },
  ballCircle: {
    width: 22, height: 22,
    borderRadius: 11,
    backgroundColor: '#374151',
    alignItems: 'center', justifyContent: 'center',
  },
  ballCircleText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#d1d5db',
  },
  liveDrawerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DS.lime + '11',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  liveDrawerBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: DS.lime,
    letterSpacing: 1,
  },

  /* New layout additions */
  tossPlayBanner: {},
  
  // FAB
  fabContainer: {
    position: 'absolute',
    right: 16,
    zIndex: 100,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DS.lime,
    shadowColor: DS.lime,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },

  broadcastLayout: { paddingHorizontal: 16, paddingVertical: 12, gap: 16 },
  teamRowBroadcast: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  teamLeftBroadcast: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  teamNameBroadcast: { fontSize: 18, fontWeight: '700', color: DS.textPrimary, flex: 1 },
  scoreRightBroadcast: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  scoreMainBroadcast: { fontSize: 24, fontWeight: '900', color: DS.textPrimary, fontVariant: ['tabular-nums'] },
  oversBroadcast: { fontSize: 13, fontWeight: '700', color: DS.textMuted },
  teamSideVertical: { alignItems: 'center', flex: 1, gap: 6 },
  teamNameVertical: { fontSize: 13, fontWeight: '700', color: DS.textPrimary, textAlign: 'center', minHeight: 17 },
  teamScoreVertical: { fontSize: 20, fontWeight: '900', color: DS.textPrimary, textAlign: 'center', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  teamScoreOvers: { fontSize: 12, fontWeight: '700', color: DS.textMuted, letterSpacing: 0, fontVariant: ['tabular-nums'] },
  vsVerticalBlock: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  vsTextVertical: { fontSize: 13, fontWeight: '900', color: DS.blueSoft, fontStyle: 'italic' },
  
  resultBanner: {
    backgroundColor: DS.success + '14', paddingVertical: 4, paddingHorizontal: 10,
    alignItems: 'center', marginHorizontal: 12, borderRadius: 6, marginBottom: 8,
  },
  resultBannerText: { fontSize: 13, fontWeight: '800', color: DS.success },

  bottomStatsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard: {
    flex: 1, borderRadius: 12, padding: 16,
    justifyContent: 'space-between', minHeight: 120,
  },
  statCardSub: { fontSize: 11, fontWeight: '700', color: DS.textMuted },
  statCardTitle: { fontSize: 16, fontWeight: '900', color: DS.textPrimary, marginTop: 2, marginBottom: 2 },
  statCardValBlue: { fontSize: 14, fontWeight: '800', color: DS.blue },
  statCardValGreen: { fontSize: 14, fontWeight: '800', color: DS.lime },

  scoreBtnBlack: {
    backgroundColor: '#000', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 8
  },
  
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
    flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1,
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, gap: 10,
    borderTopWidth: 1, borderTopColor: DS.faint,
    paddingTop: 12,
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
