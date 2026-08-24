import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { makeControls } from '../theme/controls';
import { GestureDetector } from 'react-native-gesture-handler';
import { useFilterSwipe } from '../utils/useFilterSwipe';

import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
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
  Image,
  Modal } from
'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, Easing, withSpring, SlideInRight, SlideInLeft } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import HexAvatar from '../components/HexAvatar';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport } from '../utils/selectedSport';
import { getSport } from '../sports';
import { useFocusEffect } from '@react-navigation/native';
import { BottomSheetModal, BottomSheetScrollView, BottomSheetBackdrop, BottomSheetFooter } from '@gorhom/bottom-sheet';
import { pickAndUploadImage } from '../utils/imageUpload';
import { getCurrentUser } from '../utils/currentUser';
import {
  DrawerHeader, SectionCard, TextField, TextArea, Toggle, ImagePickerField,
  PrimaryButton, StickyFooter, ValidationMessage, useCreateStyles, useDiscardGuard, SPACE,
  useDrawerSheet, DRAWER_BACKDROP, DrawerScroll,
} from '../components/create';
import { showToast } from '../components/Toast';
import BrandLogo from "../components/BrandLogo";
import { useHideTabBarOnScroll, useTabBarClearance, useDockLock } from '../components/AutoHideTabBar';
import Svg, { Polygon, Line, Circle } from 'react-native-svg';

const TEAM_TABS = ['mine', 'opponents', 'followed'];
// Note: TEAM_FILTERS is now moved inside the component to depend on sport.individual

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

const TeamManagementScreen = ({ navigation, inline, onFilterOverflow, entryEdge }) => {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);const C = useThemedStyles(makeControls);
  const sportDef = getSport(getSelectedSport().sport?.id);
  const indiv = !!sportDef?.individual;
  const COMP = sportDef?.competitorLabel || 'Team';

  const TEAM_FILTERS = useMemo(() => [
    { key: 'mine',      label: indiv ? 'My Profiles' : 'My Teams',  icon: indiv ? 'account-outline' : 'shield-account-outline' },
    { key: 'opponents', label: 'Opponents', icon: 'sword-cross' },
    { key: 'followed',  label: 'Followed',  icon: 'heart-outline' },
  ], [indiv]);

  const hideTabBar = useHideTabBarOnScroll();
  const tabClear = useTabBarClearance();
  // Placed from the edge the section was entered from, so the filter row reads
  // as a continuation of the one you just swiped off. Read once: the pane is
  // conditionally rendered, so it remounts on every section change.
  const [tab, setTab] = useState(entryEdge === 'last' ? TEAM_TABS[TEAM_TABS.length - 1] : TEAM_TABS[0]);
  // Swipe steps My Teams → Opponents → Followed, same as the Matches feed.
  const swipeDir = useRef(1);
  const handleSetTab = (t) => {
    const idx = TEAM_TABS.indexOf(t);
    const currIdx = TEAM_TABS.indexOf(tab);
    swipeDir.current = idx > currIdx ? 1 : -1;
    setTab(t);
  };
  const teamSwipe = useFilterSwipe(TEAM_TABS, tab, handleSetTab, onFilterOverflow);
  const [categorized, setCategorized] = useState({ mine: [], opponents: [], followed: [] });
  const [followedIds, setFollowedIds] = useState(new Set());
  // ── Create Team ──
  const cs = useCreateStyles();
  const drawerSheet = useDrawerSheet();
  const createTeamSheet = useRef(null);
  const EMPTY_TEAM = {
    name: '', shortName: '', city: '', homeGround: '', website: '', bio: '',
    logoUrl: '', coverUrl: '', withCaptain: false, captainName: '', addMe: true,
  };
  const [teamForm, setTeamForm] = useState(EMPTY_TEAM);
  const [teamErrors, setTeamErrors] = useState({});
  const [teamFormError, setTeamFormError] = useState('');
  const [teamBusy, setTeamBusy] = useState(null);      // which image is uploading
  const [creating, setCreating] = useState(false);
  const [createdOk, setCreatedOk] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const openCreateTeam = useCallback(() => { setSheetOpen(true); createTeamSheet.current?.present(); }, []);
  // Anything typed, and the X asks first. It used to dismiss straight to
  // nothing, taking a half-filled team with it.
  const teamDirty = !!(teamForm.name || teamForm.shortName || teamForm.city || teamForm.homeGround
    || teamForm.website || teamForm.bio || teamForm.logoUrl || teamForm.coverUrl || teamForm.captainName);
  const closeCreateTeam = useDiscardGuard(
    teamDirty,
    useCallback(() => createTeamSheet.current?.dismiss(), []),
    { title: 'Discard this team?' },
  );
  const resetCreateTeam = useCallback(() => {
    setSheetOpen(false);
    setTeamForm(EMPTY_TEAM); setTeamErrors({}); setTeamFormError(''); setCreatedOk(false);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // The dock stands down while the drawer is up, like every other create flow.
  const lockDock = useDockLock();
  useFocusEffect(useCallback(() => {
    lockDock(sheetOpen);
    return () => lockDock(false);
  }, [sheetOpen, lockDock]));

  const pickTeamImage = useCallback(async (field) => {
    setTeamBusy(field);
    const r = await pickAndUploadImage('teams');
    setTeamBusy(null);
    if (r?.url) setTeamForm((f) => ({ ...f, [field]: r.url }));
    else if (r?.error) setTeamFormError(r.error);
  }, []);
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
        headerTitle: indiv ? 'Players' : 'Teams',
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
    facepile: t.facepile || [],
    squadSize: t.squadSize ?? (t.players ? t.players.length : 0),
    ownerId: t.ownerId,
    matches: 0,
    wins: 0,
  });

  const loadData = async () => {
    try {
      const sport = getSelectedSport().sport?.id;
      if (indiv) {
        // Individual sports: Just fetch this user's player profile
        const res = await legendsApi.getPlayers({ sport, userId: getCurrentUser()?.id });
        if (res.success) {
          const players = (res.data || []).map(p => ({
            id: p.id,
            name: p.name || p.username || 'Unknown Player',
            city: p.city || '',
            captain: 'N/A',
            players: 1,
            playersList: [p],
            facepile: [],
            squadSize: 1,
            ownerId: p.userId,
            matches: p.matches || 0,
            wins: 0,
          }));
          setCategorized({ mine: players, opponents: [], followed: [] });
          setFollowedIds(new Set());
        }
      } else {
        // Scope to the active sport — otherwise cricket teams show up in football.
        const catRes = await legendsApi.getTeamsCategorized(sport);
        if (catRes.success) {
          const c = catRes.data;
          setCategorized({
            mine: (c.mine || []).map(mapTeam),
            opponents: (c.opponents || []).map(mapTeam),
            followed: (c.followed || []).map(mapTeam),
          });
          setFollowedIds(new Set((c.followed || []).map((t) => t.id)));
        }
      }
    } catch (error) {
      console.log('Error loading data:', error);
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

  // The squad, as four overlapping hexagons and a count of the rest.
  //
  // It used to invent them: two letters derived from the team's id
  // (`65 + ((teamId + i * 3) % 26)`) in a colour derived the same way, so every
  // card showed four confident-looking initials belonging to nobody. These are
  // the real squad — captain, vice-captain, keeper and the next player, chosen
  // server-side so the rule lives once (see teamFacepile in routes/teams.js).
  //
  // Nothing sets a team captain today, so C/VC tags will be rare until someone
  // does; the pile falls back to filling with whoever is in the squad.
  // A render FUNCTION, not a component. Declared as a component inside this
  // render body it was a new type on every render, so React remounted its
  // whole subtree instead of updating it. Hoisting would mean threading the
  // half-dozen values it closes over through props; calling it inlines the
  // markup into this render instead, where there is no component identity to
  // churn and nothing to thread.
  const honeycombPreview = ({ facepile = [], squadSize = 0 }) => {
    const size = 28;
    if (!facepile.length) return null;
    const rest = Math.max(0, squadSize - facepile.length);
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {facepile.map((p, i) => (
          <View key={p.id} style={{ marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i }}>
            <HexAvatar size={size} color={getAvatarColor(p.name)} style={{ borderWidth: 1, borderColor: DS.surface }}>
              {p.avatarUrl
                ? <Image source={{ uri: p.avatarUrl }} style={{ width: size, height: size }} />
                : <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>{getInitials(p.name)}</Text>}
            </HexAvatar>
            {!!p.tag && (
              <View style={styles.pileTag}>
                <Text style={styles.pileTagText}>{p.tag}</Text>
              </View>
            )}
          </View>
        ))}
        {rest > 0 && (
          <View style={[styles.pileMore, { marginLeft: -10 }]}>
            <Text style={styles.pileMoreText}>+{rest}</Text>
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
             {honeycombPreview({ facepile: item.facepile, squadSize: item.squadSize })}
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
          {mineTab && !indiv ? (
            <TouchableOpacity style={styles.actionChip}
              onPress={() => navigation.navigate('TeamProfile', { teamId: item.id, initialTab: 'squad' })}>
              <Icon name="account-group" size={14} color={DS.white} />
              <Text style={styles.actionChipText}>SQUAD</Text>
            </TouchableOpacity>
          ) : !mineTab ? (
            <TouchableOpacity
              style={[styles.actionChip, isFollowed && styles.actionChipActive]}
              onPress={() => toggleFollow(item)}>
              <Icon name={isFollowed ? 'heart' : 'heart-outline'} size={14} color={isFollowed ? '#000' : DS.white} />
              <Text style={[styles.actionChipText, isFollowed && { color: '#000' }]}>{isFollowed ? 'FOLLOWING' : 'FOLLOW'}</Text>
            </TouchableOpacity>
          ) : null}
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
    const problems = {};
    if (!teamForm.name.trim()) problems.name = 'A team needs a name';
    if (!teamForm.city.trim()) problems.city = 'Which town or city do you play in?';
    if (teamForm.withCaptain && !teamForm.captainName.trim()) {
      problems.captainName = "Who's captaining?";
    }
    setTeamErrors(problems);
    if (Object.keys(problems).length) return;

    setTeamFormError('');
    setCreating(true);
    const sport = getSelectedSport().sport?.id || 'cricket';
    const res = await legendsApi.createTeam({
      name: teamForm.name.trim(),
      shortName: teamForm.shortName.trim() || undefined,
      website: teamForm.website.trim() || undefined,
      city: teamForm.city.trim(),
      homeGround: teamForm.homeGround.trim() || undefined,
      bio: teamForm.bio.trim() || undefined,
      logoUrl: teamForm.logoUrl || undefined,
      coverUrl: teamForm.coverUrl || undefined,
      sport,
    });
    if (!res.success) {
      setCreating(false);
      setTeamFormError(res.error || 'Could not create that team');
      return;
    }

    // The squad, in the same breath. Creating a team and then having to go and
    // add yourself to it is two jobs for one intention — and a team with no
    // players cannot start a match, which is where people got stuck.
    const teamId = res.data?.id;
    const me = getCurrentUser();
    const jobs = [];
    if (teamId && teamForm.withCaptain && teamForm.captainName.trim()) {
      jobs.push(legendsApi.createPlayer({
        name: teamForm.captainName.trim(), role: 'Player', teamId, sport,
      }).then((r) => (r.success && r.data?.id
        ? legendsApi.updatePlayer(r.data.id, { isCaptain: true })
        : null)));
    }
    if (teamId && teamForm.addMe && me?.name) {
      jobs.push(legendsApi.createPlayer({
        name: me.name, role: 'Player', teamId, sport, userId: me.id,
      }));
    }
    // Neither is worth failing the team over — it exists, and both can be done
    // from the squad tab.
    await Promise.allSettled(jobs);

    setCreating(false);
    setCreatedOk(true);
    setTimeout(() => {
      createTeamSheet.current?.dismiss();
      loadData();
      showToast(`${teamForm.name.trim()} created`, 'success');
    }, 550);
  };

  const renderTeamBackdrop = useCallback(
    (props) => <BottomSheetBackdrop {...props} {...DRAWER_BACKDROP} />,
    [],
  );

  const renderTeamFooter = useCallback((props) => (
    <BottomSheetFooter {...props} bottomInset={0}>
      <StickyFooter>
        <ValidationMessage message={teamFormError} />
        <PrimaryButton label="Create Team" icon="shield-plus-outline"
          loading={creating} done={createdOk} onPress={handleCreateTeam} />
      </StickyFooter>
    </BottomSheetFooter>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [teamFormError, creating, createdOk, teamForm]);

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
            {/* The same filter bar Matches and Tournaments use. */}
            {!indiv && (
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
            )}
            {!indiv && tab !== 'mine' && (
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
            <Icon name={indiv ? "account-outline" : "account-group-outline"} size={44} color={DS.surfaceHighest} />
            <Text style={styles.emptyText}>
              {tab === 'mine'
                ? (indiv ? 'No profile found. Play a match to get ranked!' : 'No teams yet. Create one above.')
                : tab === 'opponents'
                ? `No opponents yet — play a match to see ${indiv ? 'players' : 'teams'} here.`
                : `You’re not following any ${indiv ? 'players' : 'teams'} yet.`}
            </Text>
          </View>
        } />
        </Reanimated.View>
      </GestureDetector>

      {/* ── Create Team ──────────────────────────────────────────────────
          A drawer on the creation system, not the one-field dialog it was:
          that asked for a name and nothing else, so every team started
          anonymous and had to be filled in afterwards from the team page — if
          anyone remembered.

          The fields are the ones this database can actually keep. Two from the
          reference designs are deliberately absent rather than drawn as boxes
          that go nowhere: a short code and a website have no column on Team,
          and a form that collects what nothing stores is the failure this app
          keeps repeating. Both are one migration away.
      ─────────────────────────────────────────────────────────────────── */}
      <BottomSheetModal
        {...drawerSheet}
        ref={createTeamSheet}
        onDismiss={resetCreateTeam}
        backdropComponent={renderTeamBackdrop}
        footerComponent={renderTeamFooter}>
        <DrawerHeader
          icon="shield-plus-outline"
          title="Create Team"
          subtitle="Give your side a name, a badge and a home"
          onClose={closeCreateTeam}
        />
        <DrawerScroll>

          <SectionCard title="Badge & cover" icon="image-outline">
            <ImagePickerField
              label="Cover"
              mode="banner"
              images={teamForm.coverUrl ? [teamForm.coverUrl] : []}
              onAdd={() => pickTeamImage('coverUrl')}
              busy={teamBusy === 'coverUrl'}
              helper="Wide photo across the top of the team page"
            />
            <ImagePickerField
              label="Logo"
              images={teamForm.logoUrl ? [teamForm.logoUrl] : []}
              onAdd={() => pickTeamImage('logoUrl')}
              onRemove={() => setTeamForm((f) => ({ ...f, logoUrl: '' }))}
              busy={teamBusy === 'logoUrl'}
              max={1}
              helper="Shown beside every score this team appears in"
              last
            />
          </SectionCard>

          <SectionCard title="The team" icon="shield-outline">
            <TextField label="Team name" required value={teamForm.name}
              error={teamErrors.name} onChangeText={(v) => setTeamForm((f) => ({ ...f, name: v }))}
              placeholder="e.g. Mumbai Warriors" />
            <TextField label="Short name" value={teamForm.shortName}
              onChangeText={(v) => setTeamForm((f) => ({ ...f, shortName: v.toUpperCase().slice(0, 8) }))}
              placeholder="e.g. DVX" autoCapitalize="characters" maxLength={8}
              helper="Used where the full name will not fit — scorecards, fixture lists" />
            <TextField label="City or town" required value={teamForm.city}
              error={teamErrors.city} onChangeText={(v) => setTeamForm((f) => ({ ...f, city: v }))}
              placeholder="e.g. Porur" />
            <TextField label="Home ground" value={teamForm.homeGround}
              onChangeText={(v) => setTeamForm((f) => ({ ...f, homeGround: v }))}
              placeholder="Where you usually play" />
            <TextField label="Website" value={teamForm.website}
              onChangeText={(v) => setTeamForm((f) => ({ ...f, website: v }))}
              placeholder="https://" autoCapitalize="none" keyboardType="url" />
            <TextArea label="About" value={teamForm.bio}
              onChangeText={(v) => setTeamForm((f) => ({ ...f, bio: v }))}
              placeholder="Tell people about your team" last />
          </SectionCard>

          <SectionCard title="Captain" icon="crown-outline">
            <Toggle
              title="Assign a captain"
              hint="Adds them to the squad and marks them captain"
              value={teamForm.withCaptain}
              onChange={(v) => setTeamForm((f) => ({ ...f, withCaptain: v }))}
            />
            {teamForm.withCaptain && (
              <View style={{ marginTop: SPACE.md }}>
                <TextField label="Captain's name" required value={teamForm.captainName}
                  error={teamErrors.captainName}
                  onChangeText={(v) => setTeamForm((f) => ({ ...f, captainName: v }))}
                  placeholder="e.g. Karthick" last />
              </View>
            )}
          </SectionCard>

          <SectionCard title="You" icon="account-outline">
            <Toggle
              title="Add me to the squad"
              hint="Puts you in as a player straight away"
              value={teamForm.addMe}
              onChange={(v) => setTeamForm((f) => ({ ...f, addMe: v }))}
            />
          </SectionCard>
        </DrawerScroll>
      </BottomSheetModal>

      {/* Clear the floating dock — it covered the + entirely. */}
      {!indiv && tab === 'mine' && (
        <AnimatedPulse style={[styles.fabWrap, { bottom: 24 + tabClear }]}>
          <TouchableOpacity style={styles.fab} onPress={openCreateTeam}>
            <Icon name="plus" size={28} color={DS.white} />
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
    backgroundColor: DS.lime,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    zIndex: 999,
    shadowColor: DS.lime,
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
  // The C / VC / WK badge on a face, and the "+N" that closes the pile.
  pileTag: {
    position: 'absolute', bottom: -3, alignSelf: 'center',
    paddingHorizontal: 3, borderRadius: 4,
    backgroundColor: DS.lime,
  },
  pileTagText: { fontSize: 7, fontWeight: '900', color: DS.onLime, letterSpacing: 0.2 },
  pileMore: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  pileMoreText: { fontSize: 10, fontWeight: '800', color: DS.textVariant },
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
});

export default TeamManagementScreen;