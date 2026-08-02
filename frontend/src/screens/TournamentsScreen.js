import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Animated, Pressable, Image
} from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, Easing, withSequence, withRepeat, runOnJS, SlideInRight, SlideInLeft } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Svg, { Defs, LinearGradient, Stop, Rect, Pattern, Path } from 'react-native-svg';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport } from '../utils/selectedSport';

/* ── Design System ── */
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { makeControls } from '../theme/controls';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useFilterSwipe } from '../utils/useFilterSwipe';
import { useHideTabBarOnScroll, useTabBarClearance } from '../components/AutoHideTabBar';
import BrandLogo from "../components/BrandLogo";
import PressableScale from '../components/PressableScale';
import { joinPolicy } from '../utils/tournamentPolicy';
import FocusedImage from '../components/FocusedImage';

const FILTERS = ['All', 'Open', 'Ongoing', 'Completed'];
// Matches and Teams label their filters with an icon too — same control, same
// anatomy, so the three screens read as one app.
const FILTER_ICONS = { All: 'view-grid-outline', Open: 'door-open', Ongoing: 'circle-slice-8', Completed: 'check-circle-outline' };

// The database stores upcoming | ongoing | completed; the loader capitalises
// the first letter, so this screen sees Upcoming | Ongoing | Completed. Its
// vocabulary, though, is Open | Ongoing | Active | Upcoming | Completed, and it
// compares with ===. Ongoing and Completed line up by luck. "Open" never does —
// nothing is ever stored as "open" — so everything gated on it has never once
// rendered: the Featured rail, the "N slots left" footer, and the JOIN button
// itself. The Open filter chip returned nothing at all.
//
// One normaliser, used everywhere the screen asks what state a tournament is
// in. Anything unrecognised counts as still accepting entries, which is the
// safe end: worst case a card offers JOIN and the server refuses.
const statusKey = (s) => {
  const v = String(s || '').toLowerCase();
  if (v === 'ongoing' || v === 'active' || v === 'live') return 'Ongoing';
  if (v === 'completed' || v === 'finished' || v === 'cancelled') return 'Completed';
  return 'Open';
};

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

const SkeletonShimmer = ({ style, DS }) => {
  const fadeAnim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 0.3, duration: 1000, useNativeDriver: true })
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [fadeAnim]);
  return <Animated.View style={[style, { backgroundColor: DS.surfaceHighest, opacity: fadeAnim }]} />;
};

const TournamentSkeleton = ({ DS }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.card}>
      <SkeletonShimmer DS={DS} style={[styles.heroBanner, { backgroundColor: DS.surfaceHighest }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardBodyLeft}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <SkeletonShimmer DS={DS} style={{ width: 44, height: 44, borderRadius: 22 }} />
            <View style={{ flex: 1, gap: 8 }}>
              <SkeletonShimmer DS={DS} style={{ height: 16, width: '80%', borderRadius: 4 }} />
              <SkeletonShimmer DS={DS} style={{ height: 12, width: '50%', borderRadius: 4 }} />
            </View>
          </View>
          <View style={styles.cardStatsRow}>
             <SkeletonShimmer DS={DS} style={{ height: 16, width: 80, borderRadius: 4 }} />
             <SkeletonShimmer DS={DS} style={{ height: 16, width: 80, borderRadius: 4 }} />
          </View>
        </View>
      </View>
    </View>
  );
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

const ALBUM_PALETTE = ['#1a365d', '#312e81', '#4c1d95', '#701a75', '#831843', '#064e3b', '#0f766e', '#0c4a6e', '#1e3a8a'];
const getAlbumColor = (str) => {
  let hash = 0;
  for (let i = 0; i < (str || '').length; i++) hash = (str || '').charCodeAt(i) + ((hash << 5) - hash);
  return ALBUM_PALETTE[Math.abs(hash) % ALBUM_PALETTE.length];
};

const DynamicFAB = ({ tabClear, onPress, DS }) => {
  return (
    <AnimatedPulse style={{ position: 'absolute', bottom: 24 + tabClear, right: 24, zIndex: 999 }}>
      <TouchableOpacity 
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: DS.lime,
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 8,
          shadowColor: DS.lime,
          shadowOpacity: 0.5,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
        }}
        onPress={() => { ReactNativeHapticFeedback.trigger('impactLight'); onPress(); }}
        activeOpacity={0.9}
      >
        <Icon name="plus" size={24} color="#fff" />
      </TouchableOpacity>
    </AnimatedPulse>
  );
};

const LiveRing = ({ DS }) => {
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0.3, { duration: 800 })
      ),
      -1,
      true
    );
  }, []);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value
  }));
  return (
    <Reanimated.View style={[{
      position: 'absolute', top: -3, left: -3, right: -3, bottom: -3,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: DS.lime,
    }, animatedStyle]} />
  );
};

const TodayTabCard = ({ children, style, onPress }) => {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const handlePress = () => {
    scale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withTiming(1.05, { duration: 150 }),
      withTiming(1, { duration: 150 }, (finished) => {
        if (finished && onPress) runOnJS(onPress)();
      })
    );
  };

  return (
    <Pressable onPress={handlePress}>
      <Reanimated.View style={[style, animatedStyle]}>
        {children}
      </Reanimated.View>
    </Pressable>
  );
};

/* ── Tournament Card ── */
function TournamentCard({ item, onJoin, onPress, onOpen }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const STATUS_COLORS = makeStatusColors(DS);
  const state = statusKey(item.status);
  const statusColor = STATUS_COLORS[state] || DS.textMuted;
  const teamsLeft = (item.maxTeams || 16) - (item.teams || 0);
  const canJoin = joinPolicy(item, item.teams || 0);
  const progress = (item.teams || 0) / (item.maxTeams || 16);

  const isGold = state === 'Ongoing';
  const albumColor = getAlbumColor(item.name);

  return (
    <TodayTabCard
      style={[styles.card, isGold && { borderColor: DS.lime, borderWidth: 2, shadowColor: DS.lime, shadowOpacity: 0.15, shadowRadius: 10, elevation: 4 }]}
      onPress={onPress}>
      
      {/* Hero Banner */}
      <View style={styles.heroBanner}>
        {item.coverPic || item.banner ? (
          // Cropped around the organiser's chosen point, not the centre.
          <FocusedImage
            uri={item.coverPic || item.banner}
            focus={item.media?.bannerFocus}
            style={StyleSheet.absoluteFill} />
        ) : (
          <Svg width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={albumColor} stopOpacity="0.8" />
                <Stop offset="1" stopColor={DS.bg} stopOpacity="1" />
              </LinearGradient>
              <Pattern id="pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                <Path d="M0 40L40 0H20L0 20M40 40V20L20 40" fill={statusColor} fillOpacity="0.05" />
              </Pattern>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#grad)" />
            <Rect width="100%" height="100%" fill="url(#pattern)" />
          </Svg>
        )}
        <View style={[{ position: 'absolute', top: 12, right: 12 }]}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '40', borderColor: statusColor + '80', borderWidth: 1 }]}>
            <Text style={[styles.statusBadgeText, { color: DS.bg }]}>
              {state.toUpperCase()}
            </Text>
          </View>
          {isGold && <LiveRing DS={DS} />}
        </View>
        {!!item.format && (
          <View style={styles.bannerFormat}>
            <Icon name="trophy" size={14} color={DS.lime} />
            <Text style={styles.bannerFormatText}>
              {item.format === 'Custom' && item.overs ? `${item.overs} Overs` : item.format}
            </Text>
          </View>
        )}
      </View>

      {/* Body: info on the left, status + actions stacked top-right */}
      <View style={styles.cardBody}>
        <View style={styles.cardBodyLeft}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {(item.logo || item.logoUrl) ? (
              <Image source={{ uri: item.logo || item.logoUrl }} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: DS.surfaceHighest }} />
            ) : null}
            <Text style={[styles.cardName, { flex: 1 }]} numberOfLines={2}>{item.name}</Text>
          </View>

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

          {/* Stats row — each cell only appears when there's real data behind
              it. The format chip used to be a hardcoded "T20" with a cricket
              bat icon, on every tournament of every sport. */}
          <View style={styles.cardStatsRow}>
            <View style={styles.cardStatItemContainer}>
              <View style={styles.cardStatItem}>
                <Icon name="account-group-outline" size={14} color={DS.textMuted} />
                <Text style={styles.cardStatText}>
                  {item.maxTeams ? `${item.teams}/${item.maxTeams} teams` : `${item.teams} teams`}
                </Text>
              </View>
              {!!item.maxTeams && (
                <View style={{ marginTop: 6, height: 4, backgroundColor: DS.surfaceHighest, borderRadius: 2, overflow: 'hidden', width: '100%' }}>
                  <View style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%`, height: '100%', backgroundColor: progress > 0.8 ? DS.danger : DS.lime }} />
                </View>
              )}
            </View>
            {!!item.prize && (
              <View style={styles.cardStatItem}>
                <Icon name="currency-inr" size={14} color={DS.textMuted} />
                <Text style={styles.cardStatText}>{item.prize}</Text>
              </View>
            )}
          </View>

          {!!item.description && (
            <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
          )}
        </View>

        {/* Right column: stacked actions */}
        <View style={styles.cardHeaderRight}>
          {state !== 'Open' && (
            <View style={styles.headerActions}>
              <PressableScale style={styles.chipBtn} onPress={() => { ReactNativeHapticFeedback.trigger('impactLight'); onOpen('Schedule', { bracket: true }); }}>
                <Text style={styles.chipBtnText}>BRACKET</Text>
              </PressableScale>
              <PressableScale style={styles.chipBtnBlack} onPress={() => { ReactNativeHapticFeedback.trigger('impactLight'); onOpen('Points Table'); }}>
                <Text style={styles.chipBtnTextBlack}>STANDINGS</Text>
              </PressableScale>
            </View>
          )}
        </View>

      </View>

      {/* Footer: only tournaments still taking entries show slots + JOIN. A
          full or invite-only or closed one says which, rather than offering a
          button the server is going to refuse. */}
      {state === 'Open' && (
        <View style={styles.cardFooter}>
          <Text style={styles.slotsLeft}>
            {canJoin.open ? (teamsLeft > 0 ? `${teamsLeft} slots left` : 'Full') : canJoin.reason}
          </Text>
          {canJoin.open && (
            <PressableScale style={styles.joinBtn} onPress={() => { ReactNativeHapticFeedback.trigger('impactLight'); onJoin(item); }}>
              <Text style={styles.joinBtnText}>JOIN</Text>
            </PressableScale>
          )}
        </View>
      )}
    </TodayTabCard>
  );
}

/* ── Main Screen ── */
const TournamentsScreen = ({ navigation, inline }) => {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const C = useThemedStyles(makeControls);
  const hideTabBar = useHideTabBarOnScroll();
  const tabClear = useTabBarClearance();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const swipeDir = useRef(1);
  const handleSetFilter = (f) => {
    const idx = FILTERS.indexOf(f);
    const currIdx = FILTERS.indexOf(filter);
    swipeDir.current = idx > currIdx ? 1 : -1;
    setFilter(f);
  };
  const filterSwipe = useFilterSwipe(FILTERS, filter, handleSetFilter);
  // The featured carousel was removed.
  const scrollY = useRef(new Animated.Value(0)).current;

  // Sync scrollY with AutoHideTabBar
  useEffect(() => {
    const id = scrollY.addListener((state) => {
      if (hideTabBar.onScroll) {
        hideTabBar.onScroll({ nativeEvent: { contentOffset: { y: state.value } } });
      }
    });
    return () => scrollY.removeListener(id);
  }, [scrollY, hideTabBar]);

  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [0, -80],
    extrapolate: 'clamp'
  });
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 60],
    outputRange: [1, 0],
    extrapolate: 'clamp'
  });

  useLayoutEffect(() => {
    if (!inline) {
      navigation.setOptions({
        headerShown: true,
        headerBackVisible: true,
        headerTitle: 'Tournaments',
      });
    }
  }, [navigation, inline]);

  // On focus, not just mount: creating a tournament returns here, and so does
  // backing out of a tournament's detail. Mount-only meant the list you came
  // back to was whatever it held when the screen first opened — a tournament you
  // had just created simply wasn't in it.
  useFocusEffect(useCallback(() => { loadTournaments(); }, []));   // eslint-disable-line react-hooks/exhaustive-deps

  const loadTournaments = async () => {
    try {
      // Scope to the active sport. This screen called request() directly and
      // so bypassed getTournaments() and its filter — which is why the
      // football league still listed every cricket tournament.
      const sport = getSelectedSport().sport?.id;
      const res = await legendsApi.request('/tournaments' + (sport ? `?sport=${encodeURIComponent(sport)}` : ''));
      if (res && res.tournaments) {
        setTournaments((res.tournaments || []).map(t => ({
          id:        t.id,
          name:      t.name,
          // Real values only. These were placeholders from the mock era: every
          // tournament claimed a ₹50,000 prize and 0/16 teams, and the format
          // fell back to the cricket-specific "T20" on non-cricket screens.
          description: t.format ? `${t.format} tournament at ${t.venue || 'TBD'}` : `Tournament at ${t.venue || 'TBD'}`,
          startDate: (t.startDate && !isNaN(new Date(t.startDate).getTime()))
            ? new Date(t.startDate).toISOString().split('T')[0] : 'TBD',
          prize:     t.prizePool || null,
          teams:     Array.isArray(t.teams) ? t.teams.length : 0,
          maxTeams:  t.maxTeams ?? null,
          format:    t.format || null,
          location:  t.venue || 'TBD',
          status:    t.status
            ? t.status.charAt(0).toUpperCase() + t.status.slice(1)
            : 'Upcoming',
          // The card has always drawn a cover and a logo when it has them
          // (`item.banner`, `item.logoUrl`) — this mapper just never handed
          // them over, so every card fell back to its generated gradient and
          // initial. Same omission as the policy fields below.
          logoUrl:      t.logoUrl,
          banner:       t.banner,
          media:        t.media,
          // Carried so the card can tell whether it may offer JOIN. The mapper
          // exists to keep the card's shape small, but dropping these meant
          // every tournament looked equally open.
          flags:        t.flags,
          registration: t.registration,
          regWindow:    t.regWindow,
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
    const f = filter === 'All' || statusKey(t.status) === filter;
    const q = searchQuery.toLowerCase();
    const s = !q || (t.name || '').toLowerCase().includes(q) || (t.location || '').toLowerCase().includes(q);
    return f && s;
  });

  // JOIN opens the tournament with its team picker up. It used to navigate to
  // `TournamentRegistration`, which is a PlaceholderScreen — a dead end that
  // nobody had ever reached, because the button gating it never rendered (see
  // statusKey above). The working flow already exists on the detail screen:
  // pick your team, add a note, request. This just walks you into it.
  const handleJoin = (tournament) =>
    navigation.navigate('TournamentDetail', { tournamentId: tournament.id, join: true });

  // Per-chip totals, counted after the search so a chip never promises rows the
  // search has already removed.
  const searched = tournaments.filter(t => {
    const q = searchQuery.toLowerCase();
    return !q || (t.name || '').toLowerCase().includes(q) || (t.location || '').toLowerCase().includes(q);
  });
  const counts = FILTERS.reduce((acc, f) => {
    acc[f] = f === 'All' ? searched.length : searched.filter(t => statusKey(t.status) === f).length;
    return acc;
  }, {});

  const standard = filtered;

  /* Aggregate stats */
  const activeCount  = tournaments.filter(t => statusKey(t.status) !== 'Completed').length;
  const totalTeams   = tournaments.reduce((s, t) => s + (t.teams || 0), 0);

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

      {/* Parallax Header */}
      <Animated.View style={{
        position: 'absolute',
        top: inline ? 0 : 88, // Below brand header
        left: 0,
        right: 0,
        zIndex: 5,
        backgroundColor: DS.bg + 'F0',
        paddingHorizontal: 0,
        paddingBottom: 8,
        transform: [{ translateY: headerTranslateY }],
        opacity: headerOpacity
      }}>
        {/* Search */}
        <View style={[C.searchField, styles.searchRow]}>
          <Icon name="magnify" size={18} color={DS.textMuted} />
          <TextInput
            style={C.searchFieldInput}
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

        {/* Filters — the same bar as My Matches and My Teams. */}
        <View style={[C.filterBar, { flexDirection: 'row' }]}>
          {FILTERS.map(f => {
            const on = filter === f;
            return (
              <TouchableOpacity
                key={f}
                style={[C.filterChip, on && C.filterChipActive]}
                onPress={() => handleSetFilter(f)}
                activeOpacity={0.8}
              >
                <Icon name={FILTER_ICONS[f]} size={13} color={on ? DS.lime : DS.textMuted} />
                <Text style={[C.filterText, on && C.filterTextActive]}>{f}</Text>
                <View style={[C.filterCount, on && C.filterCountOn]}>
                  <Text style={[C.filterCountText, on && C.filterCountTextOn]}>{counts[f]}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>

      {/* Swipe left/right anywhere on the list steps the filter row. The hook
          was already built here and its GestureDetector never rendered, so the
          gesture has been dead on this screen since it was added. */}
      <GestureDetector gesture={filterSwipe}>
        <Reanimated.View 
          key={filter}
          style={{ flex: 1 }}
          entering={swipeDir.current === 1 ? SlideInRight.duration(200).withInitialValues({ transform: [{ translateX: 50 }] }) : SlideInLeft.duration(200).withInitialValues({ transform: [{ translateX: -50 }] })}
        >
      <Animated.FlatList
        data={loading ? [1, 2, 3] : standard}
        keyExtractor={(item, index) => loading ? `skeleton-${index}` : item.id}
        contentContainerStyle={[styles.list, { paddingBottom: tabClear, paddingTop: 130 }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} />}
        ListHeaderComponent={null}
        renderItem={({ item }) => {
          if (loading) return <TournamentSkeleton DS={DS} />;
          return (
            <TournamentCard
              item={item}
              onJoin={handleJoin}
              onPress={() => navigation.navigate('TournamentDetail', { tournamentId: item.id })}
              onOpen={(tab, extra) => navigation.navigate('TournamentDetail', { tournamentId: item.id, initialTab: tab, ...extra })}
            />
          );
        }}
        ListEmptyComponent={
          !loading && (
            <View style={[styles.empty, { marginTop: 40 }]}>
              <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Icon name="trophy-variant-outline" size={56} color={DS.textMuted} />
              </View>
              <Text style={[styles.emptyTitle, { fontSize: 20, color: DS.textPrimary, fontWeight: '800' }]}>
                {filter === 'All' ? 'No Tournaments Yet' : `No ${filter} Tournaments`}
              </Text>
              <Text style={[styles.emptySub, { textAlign: 'center', marginHorizontal: 40, marginTop: 10, lineHeight: 22 }]}>
                {searchQuery 
                  ? "We couldn't find any tournaments matching your search." 
                  : filter === 'All' 
                    ? "Be the first to host a tournament and bring the community together!"
                    : `There are no ${filter.toLowerCase()} tournaments right now.`}
              </Text>
              {!searchQuery && (
                <PressableScale 
                  style={{ backgroundColor: DS.lime, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, marginTop: 30 }}
                  onPress={() => { ReactNativeHapticFeedback.trigger('impactLight'); navigation.navigate('CreateTournament'); }}
                >
                  <Text style={{ color: DS.bg, fontWeight: '800', fontSize: 14, letterSpacing: 0.5 }}>HOST A TOURNAMENT</Text>
                </PressableScale>
              )}
            </View>
          )
        }
      />
        </Reanimated.View>
      </GestureDetector>
      <DynamicFAB scrollY={scrollY} tabClear={tabClear} DS={DS} onPress={() => navigation.navigate('CreateTournament')} />
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
  /* Tournament Card — see the live `card` further down; this one was
     overridden by it and never rendered. */
  heroBanner: {
    height: 80,
    width: '100%',
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: DS.border,
  },
  bannerFormat: {
    position: 'absolute',
    bottom: -14,
    left: 16,
    backgroundColor: DS.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: DS.border,
    gap: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 1,
  },
  bannerFormatText: {
    color: DS.textPrimary,
    fontSize: 12,
    fontWeight: '800',
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
  // The box itself is C.searchField; this is only where it sits.
  searchRow: { marginHorizontal: 20, marginBottom: 14 },

  /* Filters */

  /* List */
  list: { paddingHorizontal: 16, gap: 10, paddingBottom: 28 },

  /* Card */
  card: {
    backgroundColor: DS.surface, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: DS.faint,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  /* Card body: left info column + right status/actions column */
  cardBody: { flexDirection: "row", alignItems: "flex-start", padding: 12, gap: 10 },
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
    borderWidth: 1.5, borderColor: DS.faint,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  chipBtnText: { fontSize: 11, fontWeight: '800', color: DS.textPrimary, letterSpacing: 0.5 },
  chipBtnBlack: {
    backgroundColor: '#000', borderRadius: 8, alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 7,
  },
  chipBtnTextBlack: { fontSize: 11, fontWeight: '800', color: DS.white, letterSpacing: 0.5 },

  /* Empty */
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: DS.textVariant },
  emptySub: { fontSize: 13, color: DS.textMuted },
});

export default TournamentsScreen;
