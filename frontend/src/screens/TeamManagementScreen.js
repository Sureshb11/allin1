import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { makeControls } from '../theme/controls';
import { GestureDetector } from 'react-native-gesture-handler';
import { useFilterSwipe } from '../utils/useFilterSwipe';

import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  Animated,
  Pressable,
  Modal } from
'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, Easing, withSpring, SlideInRight, SlideInLeft } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import HexAvatar from '../components/HexAvatar';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport } from '../utils/selectedSport';
import { showToast } from '../components/Toast';
import BrandLogo from "../components/BrandLogo";
import { useHideTabBarOnScroll, useTabBarClearance } from '../components/AutoHideTabBar';
import Svg, { Polygon, Line, Circle } from 'react-native-svg';

// The category tabs, in the order they're drawn — module scope so the swipe
// gesture isn't rebuilt on every render.
const TEAM_TABS = ['mine', 'opponents', 'followed'];
// One place for the label and icon of each, so the filter bar and the swipe
// order can't drift apart.
const TEAM_FILTERS = [
  { key: 'mine',      label: 'My Teams',  icon: 'shield-account-outline' },
  { key: 'opponents', label: 'Opponents', icon: 'sword-cross' },
  { key: 'followed',  label: 'Followed',  icon: 'heart-outline' },
];

const MiniRadarChart = ({ w, l, d, DS }) => {
  const total = (w + l + d) || 1;
  const nw = Math.max(0.2, w / total);
  const nl = Math.max(0.2, l / total);
  const nd = Math.max(0.2, d / total);
  const cx = 25, cy = 25, r = 20;
  const wx = cx;
  const wy = cy - r * nw;
  const lx = cx + r * nl * Math.cos(Math.PI / 6);
  const ly = cy + r * nl * Math.sin(Math.PI / 6);
  const dx = cx - r * nd * Math.cos(Math.PI / 6);
  const dy = cy + r * nd * Math.sin(Math.PI / 6);
  const points = `${wx},${wy} ${lx},${ly} ${dx},${dy}`;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="50" height="50">
        <Circle cx="25" cy="25" r="20" stroke={DS.border} strokeWidth="1" fill="none" />
        <Circle cx="25" cy="25" r="10" stroke={DS.border} strokeWidth="1" fill="none" />
        <Line x1="25" y1="25" x2="25" y2="5" stroke={DS.border} strokeWidth="1" />
        <Line x1="25" y1="25" x2={25 + 20 * Math.cos(Math.PI / 6)} y2={25 + 20 * Math.sin(Math.PI / 6)} stroke={DS.border} strokeWidth="1" />
        <Line x1="25" y1="25" x2={25 - 20 * Math.cos(Math.PI / 6)} y2={25 + 20 * Math.sin(Math.PI / 6)} stroke={DS.border} strokeWidth="1" />
        <Polygon points={points} fill={DS.lime + '40'} stroke={DS.lime} strokeWidth="1.5" />
      </Svg>
    </View>
  );
};

const AVATAR_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e91e63'];

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

const Pressable3D = ({ children, style, onPress }) => {
  const rotateX = useSharedValue(0);
  const rotateY = useSharedValue(0);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { scale: scale.value },
      { rotateX: `${rotateX.value}deg` },
      { rotateY: `${rotateY.value}deg` }
    ]
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={(e) => {
        const { locationX, locationY } = e.nativeEvent;
        // Map touch coords to tilt angles. Card is approx 350x150.
        const rx = (locationY - 75) / -5; 
        const ry = (locationX - 175) / 10;
        rotateX.value = withTiming(rx, { duration: 150 });
        rotateY.value = withTiming(ry, { duration: 150 });
        scale.value = withTiming(0.95, { duration: 150 });
      }}
      onPressOut={() => {
        rotateX.value = withSpring(0, { damping: 10, stiffness: 100 });
        rotateY.value = withSpring(0, { damping: 10, stiffness: 100 });
        scale.value = withSpring(1, { damping: 10, stiffness: 100 });
      }}
    >
      <Reanimated.View style={[style, animatedStyle]}>
        {children}
      </Reanimated.View>
    </Pressable>
  );
};

const TeamManagementScreen = ({ navigation, inline }) => {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);const C = useThemedStyles(makeControls);
  const hideTabBar = useHideTabBarOnScroll();
  const tabClear = useTabBarClearance();
  const [tab, setTab] = useState('mine');   // mine | opponents | followed
  // Swipe steps My Teams → Opponents → Followed, same as the Matches feed.
  const swipeDir = useRef(1);
  const handleSetTab = (t) => {
    const idx = TEAM_TABS.indexOf(t);
    const currIdx = TEAM_TABS.indexOf(tab);
    swipeDir.current = idx > currIdx ? 1 : -1;
    setTab(t);
  };
  const teamSwipe = useFilterSwipe(TEAM_TABS, tab, handleSetTab);
  const [categorized, setCategorized] = useState({ mine: [], opponents: [], followed: [] });
  const [followedIds, setFollowedIds] = useState(new Set());
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [teamSearchQuery, setTeamSearchQuery] = useState('');

  // Search applies to all three categories at once, so the chip counts describe
  // the list you'd get by tapping — not the whole category. Searching used to
  // filter only the visible tab, which left the counts claiming teams the
  // search had already excluded.
  const searchedTeams = useMemo(() => {
    const q = teamSearchQuery.trim().toLowerCase();
    const match = (t) => !q || (t.name || '').toLowerCase().includes(q);
    return {
      mine: categorized.mine.filter(match),
      opponents: categorized.opponents.filter(match),
      followed: categorized.followed.filter(match),
    };
  }, [categorized, teamSearchQuery]);
  const teamCounts = {
    mine: searchedTeams.mine.length,
    opponents: searchedTeams.opponents.length,
    followed: searchedTeams.followed.length,
  };

  useLayoutEffect(() => {
    if (!inline) {
      navigation.setOptions({
        headerShown: true,
        headerBackVisible: true,
        headerTitle: 'Teams',
      });
    }
  }, [navigation, inline]);

  useEffect(() => {
    loadData();
  }, []);

  const mapTeam = (t) => ({
    id: t.id,
    name: t.name,
    city: t.city || '',
    captain: t.players && t.players[0]?.name || 'TBD',
    players: t.players ? t.players.length : 0,
    playersList: t.players || [],
    ownerId: t.ownerId,
    matches: 0,
    wins: 0,
  });

  const loadData = async () => {
    try {
      // Scope to the active sport — otherwise cricket teams show up in football.
      const catRes = await legendsApi.getTeamsCategorized(getSelectedSport().sport?.id);
      if (catRes.success) {
        const c = catRes.data;
        setCategorized({
          mine: (c.mine || []).map(mapTeam),
          opponents: (c.opponents || []).map(mapTeam),
          followed: (c.followed || []).map(mapTeam),
        });
        setFollowedIds(new Set((c.followed || []).map((t) => t.id)));
      }
    } catch (error) {
      console.log('Error loading team data:', error);
    }
  };

  const getInitials = (name) => {
    return (name || '').
    split(' ').
    map((w) => w[0]).
    slice(0, 2).
    join('').
    toUpperCase();
  };

  // Single-accent: all avatars are the deep green (white initials read on both themes).
  const getAvatarColor = () => '#0a5227';

  const getRoleColor = (role) => {
    switch ((role || '').toLowerCase()) {
      case 'batsman':return '#3498db';
      case 'bowler':return '#e74c3c';
      case 'all-rounder':return DS.lime;
      case 'wicket-keeper':return '#2ecc71';
      default:return DS.textMuted;
    }
  };

  const toggleFollow = async (team) => {
    const isFollowed = followedIds.has(team.id);
    setFollowedIds((prev) => {
      const n = new Set(prev);
      isFollowed ? n.delete(team.id) : n.add(team.id);
      return n;
    });
    const res = isFollowed ? await legendsApi.unfollowTeam(team.id) : await legendsApi.followTeam(team.id);
    if (res.success) loadData();
  };

  const HoneycombPreview = ({ teamIdStr, count }) => {
    const size = 28;
    const teamId = parseInt((teamIdStr || '').replace(/\D/g, '') || '0', 10);
    const numAvatars = Math.min(count, 4);
    if (numAvatars === 0) return null;
    
    const avatars = Array.from({ length: numAvatars }).map((_, i) => {
      const charCode1 = 65 + ((teamId + i * 3) % 26);
      const charCode2 = 65 + ((teamId + i * 7 + 12) % 26);
      const colorIdx = (teamId + i * 5) % AVATAR_COLORS.length;
      return {
        id: i,
        initials: String.fromCharCode(charCode1) + String.fromCharCode(charCode2),
        color: AVATAR_COLORS[colorIdx]
      };
    });

    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {avatars.map((av, i) => (
          <View key={av.id} style={{ marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i }}>
            <HexAvatar size={size} color={av.color} style={{ borderWidth: 1, borderColor: DS.surface }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>{av.initials}</Text>
            </HexAvatar>
          </View>
        ))}
        {count > 4 && (
          <View style={{ marginLeft: 6 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: DS.textMuted }}>+{count - 4}</Text>
          </View>
        )}
      </View>
    );
  };

  // The row's left/right swipe actions are gone, and with them the reason the
  // filter swipe never fired on this screen: Swipeable claims a horizontal drag
  // at ~10px, well before the filter's 24px, so every swipe over a team card
  // opened a row action instead of stepping My Teams → Opponents → Followed.
  //
  // Nothing is lost. "Manage" did exactly what the SQUAD chip on the card does,
  // and that chip now opens the team's own Squad tab. "Leave" never left
  // anything: it called showToast('Left team') and no API, so the toast was the
  // whole feature. Leaving a team for real lives on the team's own profile,
  // which tapping the card opens.

  const renderTeam = ({ item }) => {
    const losses = item.matches - item.wins;
    const draws = 0;
    const isFollowed = followedIds.has(item.id);
    const mineTab = tab === 'mine';
    return (
      <Pressable3D
        style={styles.teamCard}
        // One team screen, whoever is looking. Tapping an opponent used to open
        // TeamInsights — a second, thinner stats screen (win rate, form, top
        // five batters and bowlers) while your own teams opened the full
        // profile. TeamProfile already knows the viewer isn't a member: it
        // shows Follow and Request to Join instead of the admin controls, and
        // its Stats tab is a superset of everything TeamInsights drew.
        onPress={() => navigation.navigate('TeamProfile', { teamId: item.id })}>
        <View style={styles.teamCardTop}>
          <HexAvatar size={40} color={getAvatarColor(item.name)} style={{ marginRight: 10 }}>
            <Text style={styles.teamAvatarText}>{getInitials(item.name)}</Text>
          </HexAvatar>
          <View style={styles.teamInfo}>
            <Text style={styles.teamName}>{item.name}</Text>
            <Text style={styles.teamSubtitle}>
              <Text style={styles.memberCount}>{item.players} members</Text>
            </Text>
            {mineTab && <Text style={styles.roleTag}>CAPTAIN</Text>}
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center' }}>
             <HoneycombPreview teamIdStr={item.id} count={item.players} />
          </View>
        </View>
        <View style={[styles.statsRow, { justifyContent: 'space-between' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={styles.statBlock}>
              <Text style={styles.statNumber}>{item.wins}</Text>
              <Text style={styles.statLabel}>W</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBlock}>
              <Text style={styles.statNumber}>{losses}</Text>
              <Text style={styles.statLabel}>L</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBlock}>
              <Text style={styles.statNumber}>{draws}</Text>
              <Text style={styles.statLabel}>D</Text>
            </View>
          </View>
          <MiniRadarChart w={item.wins} l={losses} d={draws} DS={DS} />
        </View>
        {item.matches > 0 && (
          <View style={styles.winRateBar}>
            <View style={[styles.winRateFill, { width: `${(item.wins / item.matches) * 100}%`, backgroundColor: DS.success }]} />
            <View style={[styles.winRateFill, { width: `${(losses / item.matches) * 100}%`, backgroundColor: '#ef4444' }]} />
            <View style={[styles.winRateFill, { width: `${(draws / item.matches) * 100}%`, backgroundColor: DS.textMuted }]} />
          </View>
        )}
        <View style={styles.actionRow}>
          {mineTab ? (
            <TouchableOpacity style={styles.actionChip}
              onPress={() => navigation.navigate('TeamProfile', { teamId: item.id, initialTab: 'squad' })}>
              <Icon name="account-group" size={14} color={DS.white} />
              <Text style={styles.actionChipText}>SQUAD</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.actionChip, isFollowed && styles.actionChipActive]}
              onPress={() => toggleFollow(item)}>
              <Icon name={isFollowed ? 'heart' : 'heart-outline'} size={14} color={isFollowed ? '#000' : DS.white} />
              <Text style={[styles.actionChipText, isFollowed && { color: '#000' }]}>{isFollowed ? 'FOLLOWING' : 'FOLLOW'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.statsChip}
            onPress={() => navigation.navigate('TeamProfile', { teamId: item.id, initialTab: 'form' })}>
            <Icon name="chart-line" size={14} color={DS.textPrimary} />
            <Text style={styles.statsChipText}>STATS</Text>
          </TouchableOpacity>
        </View>
      </Pressable3D>
    );

  };

  const handleCreateTeam = async () => {
    if (newTeamName.trim()) {
      const result = await legendsApi.createTeam({ name: newTeamName.trim() });
      if (result.success) {
        setNewTeamName('');
        setShowCreateTeamModal(false);
        await loadData();
        showToast('Team created!', 'success');
      } else {
        showToast(result.error || 'Failed to create team', 'error');
      }
    }
  };

  return (
    <View style={styles.container}>
      {!inline && (
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <BrandLogo scale={0.75} />
            <Text style={styles.hubLabel}>ATHLETE HUB</Text>
          </View>
        </View>
      )}

      {/* Tabs moved to ListHeaderComponent */}
      {/* Swipe left/right steps My Teams → Opponents → Followed. The hook was
          built here and its GestureDetector never rendered, so the gesture was
          dead; the rows' own Swipeable actions then claimed the drag first, so
          it stayed dead once wired. Both fixed — see renderTeam. */}
      <GestureDetector gesture={teamSwipe}>
        <Reanimated.View 
          key={tab}
          style={{ flex: 1 }}
          entering={swipeDir.current === 1 ? SlideInRight.duration(200).withInitialValues({ transform: [{ translateX: 50 }] }) : SlideInLeft.duration(200).withInitialValues({ transform: [{ translateX: -50 }] })}
        >
        <FlatList
        data={searchedTeams[tab]}
        renderItem={renderTeam}
        keyExtractor={(item) => item.id}
        {...hideTabBar}
        contentContainerStyle={[styles.teamsList, { paddingBottom: tabClear }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={[C.searchField, styles.teamSearchRow]}>
              <Icon name="magnify" size={18} color={DS.textMuted} />
              <TextInput
                style={C.searchFieldInput}
                placeholder="Search teams..."
                placeholderTextColor={DS.faint}
                value={teamSearchQuery}
                onChangeText={setTeamSearchQuery}
              />
              {teamSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setTeamSearchQuery('')} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                  <Icon name="close-circle" size={18} color={DS.faint} />
                </TouchableOpacity>
              )}
            </View>
            {/* The same filter bar Matches and Tournaments use. This was the
                pale-green segment, which in the control language means a local
                view-mode toggle — but mine / opponents / followed subdivides one
                list, which is what the underline filter is for. Counts stay:
                they're your own teams, not a board over every player in the app. */}
            <View style={[C.filterBar, { flexDirection: 'row' }]}>
              {TEAM_FILTERS.map(({ key, label, icon }) => {
                const on = tab === key;
                return (
                  <TouchableOpacity key={key} style={[C.filterChip, on && C.filterChipActive]}
                                    onPress={() => handleSetTab(key)} activeOpacity={0.8}>
                    <Icon name={icon} size={13} color={on ? DS.lime : DS.textMuted} />
                    <Text style={[C.filterText, on && C.filterTextActive]}>{label}</Text>
                    <View style={[C.filterCount, on && C.filterCountOn]}>
                      <Text style={[C.filterCountText, on && C.filterCountTextOn]}>{teamCounts[key]}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            {tab !== 'mine' && (
              <Text style={styles.tabHint}>
                {tab === 'opponents'
                  ? 'Teams you’ve faced in matches. Follow them to keep track.'
                  : 'Teams you follow.'}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Icon name="account-group-outline" size={44} color={DS.surfaceHighest} />
            <Text style={styles.emptyText}>
              {tab === 'mine'
                ? 'No teams yet. Create one above.'
                : tab === 'opponents'
                ? 'No opponents yet — play a match to see teams here.'
                : 'You’re not following any teams yet.'}
            </Text>
          </View>
        } />
        </Reanimated.View>
      </GestureDetector>

      <Modal
        visible={showCreateTeamModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateTeamModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Create New Team</Text>
            <Text style={styles.modalSubtitle}>Enter a name for your team</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Team name"
              placeholderTextColor={DS.textMuted}
              value={newTeamName}
              onChangeText={setNewTeamName}
              autoFocus />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setNewTeamName('');
                  setShowCreateTeamModal(false);
                }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmButton} onPress={handleCreateTeam}>
                <Text style={styles.modalConfirmText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Clear the floating dock — it covered the + entirely. */}
      {tab === 'mine' && (
        <AnimatedPulse style={[styles.fabWrap, { bottom: 24 + tabClear }]}>
          <TouchableOpacity style={styles.fab} onPress={() => setShowCreateTeamModal(true)}>
            <Icon name="plus" size={28} color={DS.onBlue} />
          </TouchableOpacity>
        </AnimatedPulse>
      )}
    </View>);

};

const makeStyles = (DS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DS.bg
  },
  header: {
    backgroundColor: DS.surfaceLow,
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center'
  },
  hubLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: DS.textMuted,
    letterSpacing: 2,
    marginTop: 2
  },
  // CTA Card
  /* Search */
  // The box itself is C.searchField; this is only where it sits. Named for the
  // team search specifically — `searchRow` is already the add-player field's
  // layout further down, and the duplicate key silently won.
  teamSearchRow: { marginTop: 14, marginBottom: 8 },
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
  // Team list
  teamsList: {
    paddingHorizontal: 16,
    paddingBottom: 16
  },
  teamCard: {
    backgroundColor: DS.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: DS.faint,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  teamCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },
  teamAvatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: DS.white
  },
  teamInfo: {
    flex: 1
  },
  teamName: {
    fontSize: 15,
    fontWeight: '700',
    color: DS.textPrimary,
    marginBottom: 2
  },
  teamSubtitle: {
    fontSize: 13,
    color: DS.textMuted
  },
  memberCount: {
    color: DS.lime,
    fontWeight: '600'
  },
  roleTag: {
    fontSize: 10,
    fontWeight: '800',
    color: DS.blueDeep,
    letterSpacing: 1.5,
    marginTop: 4
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.surfaceHigh,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 14,
    marginBottom: 10
  },
  statBlock: {
    flex: 1,
    alignItems: 'center'
  },
  statNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: DS.textPrimary,
    fontVariant: ['tabular-nums']
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: DS.textMuted,
    marginTop: 2
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: DS.surfaceHigh
  },
  winRateBar: {
    flexDirection: 'row',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 10,
    marginHorizontal: 16,
    backgroundColor: DS.surfaceHighest,
  },
  winRateFill: {
    height: '100%',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10
  },
  actionChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6
  },
  statsChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: DS.faint,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6
  },
  actionChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: DS.white,
    letterSpacing: 0.8
  },
  statsChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: DS.textPrimary,
    letterSpacing: 0.8
  },
  actionChipActive: { backgroundColor: DS.lime, borderColor: DS.lime },

  // Category tabs
  tabHint: { color: DS.textMuted, fontSize: 12.5, marginBottom: 12, lineHeight: 18 },
  emptyBox: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { color: DS.textMuted, fontSize: 13.5, textAlign: 'center', paddingHorizontal: 30 },

  // Footer
  // Detail view
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: DS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  modalContainer: {
    backgroundColor: DS.surfaceHigh,
    borderRadius: 20,
    padding: 24,
    width: '100%'
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: DS.textPrimary,
    marginBottom: 4
  },
  modalSubtitle: {
    fontSize: 14,
    color: DS.textMuted,
    marginBottom: 20
  },
  modalInput: {
    backgroundColor: DS.surfaceLow,
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    fontSize: 15,
    color: DS.textPrimary
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10
  },
  modalCancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: DS.surfaceHighest
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: DS.textMuted
  },
  modalConfirmButton: {
    backgroundColor: DS.lime,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10
  },
  modalConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: DS.bg
  }
});

export default TeamManagementScreen;