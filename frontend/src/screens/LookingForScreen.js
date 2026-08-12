import React, { useState, useEffect, useCallback, useLayoutEffect, useRef, useMemo, forwardRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, ScrollView, ActivityIndicator, RefreshControl, Animated, Linking, Alert, LayoutAnimation
} from 'react-native';

import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useFilterSwipe } from '../utils/useFilterSwipe';
import { BottomSheetModal, BottomSheetScrollView, BottomSheetBackdrop, BottomSheetTextInput, BottomSheetFooter } from '@gorhom/bottom-sheet';
import Reanimated, { FadeIn, SlideInRight, SlideInLeft, FadeInDown, useAnimatedRef, useSharedValue, scrollTo, LinearTransition, useAnimatedStyle, runOnJS, withSpring, withTiming, withRepeat, Easing } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AnimatedPressable from '../components/AnimatedPressable';
import AmbientBackground from '../components/AmbientBackground';
import { showToast } from '../components/Toast';
import AsyncStorage from '@react-native-async-storage/async-storage';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport } from '../utils/selectedSport';
import { useCurrentUser } from '../utils/currentUser';
import { useFocusEffect } from '@react-navigation/native';
import { haptic } from '../utils/haptics';

import {
  DrawerHeader, SectionCard, TextField, TextArea, ChipGroup, Toggle,
  PrimaryButton, StickyFooter, ValidationMessage, useCreateStyles, useDiscardGuard,
  useDrawerSheet, DRAWER_BACKDROP, DrawerScroll,
} from '../components/create';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { pav } from '../theme/pavilion';
import { useHideTabBarOnScroll, useTabBarClearance } from '../components/AutoHideTabBar';
import BrandLogo from "../components/BrandLogo";
import PlayerAvatar from "../components/PlayerAvatar";

import { useWindowDimensions } from 'react-native';

function MagneticFAB({ onPress, DS }) {
  const { width: windowWidth } = useWindowDimensions();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = offsetX.value + e.translationX;
      translateY.value = offsetY.value + e.translationY;
    })
    .onEnd((e) => {
      const finalX = offsetX.value + e.translationX;
      const finalY = offsetY.value + e.translationY;
      const snapX = finalX < -windowWidth / 2 + 50 ? -windowWidth + 76 : 0;
      translateX.value = withSpring(snapX, { damping: 14, stiffness: 120 });
      translateY.value = withSpring(finalY, { damping: 14, stiffness: 120 });
      offsetX.value = snapX;
      offsetY.value = finalY;
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }]
  }));

  return (
    <GestureDetector gesture={pan}>
      <Reanimated.View style={[
        style, 
        { position: 'absolute', bottom: 40, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: DS.lime, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, elevation: 6, zIndex: 999 }
      ]}>
        <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plus" size={30} color={DS.bg} />
        </TouchableOpacity>
      </Reanimated.View>
    </GestureDetector>
  );
}

import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DynamicIsland = React.forwardRef((props, ref) => {
  const [msg, setMsg] = useState('');
  const [icon, setIcon] = useState('check-circle');
  const translateY = useSharedValue(-150);
  const scale = useSharedValue(0.5);
  const DS = useTheme().colors;

  React.useImperativeHandle(ref, () => ({
    show: (text, iName = 'check-circle') => {
      setMsg(text);
      setIcon(iName);
      translateY.value = withSpring(10, { damping: 14, stiffness: 120 });
      scale.value = withSpring(1, { damping: 14, stiffness: 120 });
      
      setTimeout(() => {
        translateY.value = withTiming(-150, { duration: 300 });
        scale.value = withTiming(0.5, { duration: 300 });
      }, 2500);
    }
  }));

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }]
  }));

  return (
    <Reanimated.View style={[
      { position: 'absolute', top: 30, alignSelf: 'center', backgroundColor: '#000', borderRadius: 30, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, zIndex: 9999 },
      style
    ]} pointerEvents="none">
      <Icon name={icon} size={20} color={DS.lime} />
      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{msg}</Text>
    </Reanimated.View>
  );
});

// ── The List ─────────────────────────────────────────────────────────────────
// ── Shimmer Skeleton ────────────────────────────────────────────────────────
function ScoutSkeleton({ DS }) {
  // Three distinct animated values to create a cascading wave down the screen.
  const shimmers = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  
  useEffect(() => {
    const anims = shimmers.map((shimmer, i) => 
      Animated.sequence([
        Animated.delay(i * 150),
        Animated.loop(Animated.timing(shimmer, { toValue: 1, duration: 1200, useNativeDriver: true }))
      ])
    );
    Animated.parallel(anims).start();
  }, [shimmers]);

  const Bar = ({ w, h, r = 6, mt = 0, shimmer }) => {
    const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-100, 400] });
    return (
      <View style={{ width: w, height: h, borderRadius: r, backgroundColor: DS.surfaceHigh, marginTop: mt, overflow: 'hidden' }}>
        <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, width: 100, backgroundColor: 'rgba(255,255,255,0.4)', transform: [{ translateX }] }} />
      </View>
    );
  };

  return (
    <View style={{ padding: 16, gap: 14 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, gap: 12, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Bar w={34} h={34} r={17} shimmer={shimmers[i]} />
            <View style={{ gap: 6 }}>
              <Bar w={120} h={14} r={7} shimmer={shimmers[i]} />
              <Bar w={80} h={10} r={5} shimmer={shimmers[i]} />
            </View>
          </View>
          <Bar w="100%" h={14} r={7} shimmer={shimmers[i]} />
          <Bar w="60%" h={14} r={7} shimmer={shimmers[i]} />
        </View>
      ))}
    </View>
  );
}

// Real post types used by the create-post form — every "looking for" category.
const TYPES = ['player', 'team', 'opponent', 'umpire', 'scorer', 'coach', 'tournament', 'teamtourn', 'ground', 'commentator'];

// Tap-to-select options so posting needs almost no typing (only the notes field).
const FORMAT_OPTS = ['Any', 'T20', 'T10', 'ODI', 'Test', 'The Hundred', 'Box/Turf'];
const AGE_OPTS = ['Any', 'Open', 'U-13', 'U-16', 'U-19', 'U-23', 'Veterans'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKEND = ['Sat', 'Sun'];
const TIME_OPTS = ['6:00 AM', '10:00 AM', '2:00 PM', 'Custom'];

// Second-level sub-category shown once a type is picked (e.g. Player → Batter…).
const SUBTYPES = {
  player:      ['Batter', 'Bowler', 'Wicket-keeper', 'All-rounder'],
  team:        ['For a match', 'For a tournament', 'Net practice', 'Regular squad'],
  opponent:    ['Friendly', 'Practice match', 'League', 'Tournament'],
  umpire:      ['Club level', 'District level', 'Certified'],
  scorer:      ['Manual', 'Digital / App', 'Live stream'],
  coach:       ['Batting', 'Bowling', 'Fielding', 'Fitness', 'All-round'],
  tournament:  ['To join', 'Corporate', 'Community', 'Youth'],
  teamtourn:   ['League', 'Knockout', 'Corporate', 'Community'],
  ground:      ['Turf', 'Matting', 'Grass', 'Nets'],
  commentator: ['English', 'Regional', 'Live stream'],
};
const SUBTYPE_LABEL = {
  player: 'Role', team: 'Purpose', opponent: 'Match type', umpire: 'Level', scorer: 'Method',
  coach: 'Speciality', tournament: 'Kind', teamtourn: 'Kind', ground: 'Surface', commentator: 'Language',
};

// Full filter list shown as chips — mirrors the search page's "Looking for" section.
// Match-focused filters first; the officiating/support roles (umpire, scorer,
// coach, commentator) sit at the end.
const FILTER_TYPES = ['all', 'player', 'team', 'opponent', 'ground', 'teamtourn', 'tournament', 'umpire', 'scorer', 'coach', 'commentator'];

const TYPE_LABELS = {
  all: 'All', player: 'Player', team: 'Team', umpire: 'Umpire', scorer: 'Scorer', coach: 'Coach',
  opponent: 'Opponent', teamtourn: 'Teams for tournament', tournament: 'Tournaments', ground: 'Ground', commentator: 'Commentator',
};

const TYPE_ICONS = {
  all: 'format-list-bulleted',        // every listing
  player: 'account-outline',          // a person
  team: 'account-group-outline',      // a group of players
  umpire: 'whistle',                  // umpire's whistle
  scorer: 'clipboard-text-outline',   // keeps the scorebook
  coach: 'account-tie-outline',       // coach / mentor
  opponent: 'sword-cross',            // a fixture / rival to play
  teamtourn: 'account-multiple-plus-outline', // teams joining a tournament
  tournament: 'trophy-outline',       // the tournament itself
  ground: 'stadium',                  // a venue to play at
  commentator: 'microphone-outline',  // speaks / commentates
};

const HIDDEN_KEY = '@ll_scout_hidden';

const INITIAL_FORM = { type: 'player', role: '', description: '', location: '', format: 'Any', ageGroup: 'Any', days: [], timing: '', customTime: '' };

// Auto-build a readable title from the tap selections so the user never types one.
const buildTitle = (form) => {
  const label = TYPE_LABELS[form.type] || form.type;
  const article = /^[aeiou]/i.test(label) ? 'an' : 'a';
  let t = `Looking for ${article} ${label}`;
  const extras = [];
  if (form.role) extras.push(form.role);
  if (form.format && form.format !== 'Any') extras.push(form.format);
  return extras.length ? `${t} · ${extras.join(' · ')}` : t;
};

// How long ago a listing went up. A board with no recency makes a three-week-dead
// ask look exactly like one from an hour ago.
const timeAgo = (iso) => {
  if (!iso) return '';
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  if (secs < 90) return 'just now';
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  const days = Math.floor(secs / 86400);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 35) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
};

// The real ask, without the boilerplate. buildTitle() writes every title as
// "Looking for a Player · Batter · T20", so the biggest text on every row used to
// be the part they all share. Strip the prefix, then drop the type word too — it's
// already the badge — leaving "Batter · T20".
const askFrom = (item) => {
  const raw = (item.title || '').trim();
  const stripped = raw.replace(/^looking for (?:an?|the)\s+/i, '');
  const parts = stripped.split('·').map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1) return parts.slice(1).join(' · ');
  return parts[0] || TYPE_LABELS[item.type] || 'Listing';
};

// "Days" + "Timing" read as a short human phrase, e.g. "Sat, Sun · 6:00 AM".
const buildWhen = (form) => {
  const parts = [];
  if (form.days?.length) parts.push(form.days.join(', '));
  const t = form.timing === 'Custom' ? (form.customTime || '').trim() : form.timing;
  if (t) parts.push(t);
  return parts.join(' · ');
};

export default function LookingForScreen({ navigation, route, inline, onRegisterFab, pagerGesture, role }) {
  const DS = useTheme().colors;
  const P = pav(DS);
  const styles = useThemedStyles(makeStyles);
  // ── Filter chip row: a self-driven horizontal scroller ──
  // Rather than fight the Pavilion pager for the native ScrollView gesture (which
  // froze the row), we drive the scroll ourselves: a dedicated Pan on the row
  // moves an Animated.ScrollView via Reanimated `scrollTo` on the UI thread, and
  // BLOCKS the pager while active — so a drag here scrolls chips, never pages tabs.
  const filterScroll = useAnimatedRef();
  const filterOffset = useSharedValue(0);   // current x
  const filterStart = useSharedValue(0);    // x at drag start
  const filterMax = useSharedValue(0);      // contentWidth - viewportWidth
  const filterViewW = useRef(0);
  const filterContentW = useRef(0);
  const recomputeMax = () => { filterMax.value = Math.max(0, filterContentW.current - filterViewW.current); };
  const filterPan = useMemo(() => {
    const g = Gesture.Pan()
      .activeOffsetX([-8, 8])   // horizontal only — taps and vertical drags pass through
      .onBegin(() => { filterStart.value = filterOffset.value; })
      .onUpdate((e) => {
        let next = filterStart.value - e.translationX;
        if (next < 0) next = 0; else if (next > filterMax.value) next = filterMax.value;
        filterOffset.value = next;
        scrollTo(filterScroll, next, 0, false);
      });
    return pagerGesture ? g.blocksExternalGesture(pagerGesture) : g;
  }, [pagerGesture, filterScroll, filterOffset, filterStart, filterMax]);

  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const islandRef = useRef(null);
  
  const scrollY = useRef(new Animated.Value(0)).current;
  const hideTabBar = useHideTabBarOnScroll();
  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true, listener: hideTabBar.onScroll }
  );
  const tabClear = useTabBarClearance();
  // Optional deep-link category (e.g. from the search screen's "Looking for" list).
  const initialType = role || (FILTER_TYPES.includes(route?.params?.initialType) ? route.params.initialType : 'all');
  const meUser = useCurrentUser();
  const myId = meUser?.id;
  // Listings you've chosen not to see. Local and device-only: this is "not for
  // me", not a report — there's no moderation backend to send anything to.
  const [hidden, setHidden] = useState([]);
  useEffect(() => {
    AsyncStorage.getItem(HIDDEN_KEY)
      .then((raw) => { if (raw) setHidden(JSON.parse(raw)); })
      .catch(() => {});
  }, []);
  const hideListing = async (item) => {
    const next = [...new Set([...hidden, item.id])];
    setHidden(next);
    closeDetail();
    await AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(next)).catch(() => {});
    showToast('Hidden from your board', 'info');
  };
  const unhideAll = async () => {
    setHidden([]);
    await AsyncStorage.removeItem(HIDDEN_KEY).catch(() => {});
    showToast('Hidden listings restored', 'success');
  };

  const [connections, setConnections] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [activeType, setActiveType] = useState(initialType);
  
  useEffect(() => {
    if (role && role !== activeType) {
      selectType(role);
    }
  }, [role]);
  // Swipe the listings left/right to step through the filter tabs. A ref mirrors
  // the current filter so the (once-created) responder never reads a stale value,
  // and the filter row auto-scrolls the newly-active chip into view.
  const activeTypeRef = useRef(activeType);
  activeTypeRef.current = activeType;
  // Where each chip actually sits, captured from its own onLayout. The two call
  // sites used to guess a fixed width — 62px in one, 96px in the other — and
  // neither can be right now that chips carry a label and a count: "All 24" and
  // "Teams for tournament 6" are nowhere near the same width.
  const chipX = useRef({});
  const scrollChipIntoView = useCallback((idx) => {
    const x = chipX.current[idx];
    if (x == null) return;
    const target = Math.max(0, x - 48);
    filterOffset.value = target;
    filterScroll.current?.scrollTo?.({ x: target, animated: true });
  }, [filterOffset, filterScroll]);

  const selectTypeRef = useRef(null);
  const swipeDir = useRef(1);

  const stepFilter = useCallback((dir) => {
    const idx = FILTER_TYPES.indexOf(activeTypeRef.current);
    const next = idx + dir;
    if (next < 0 || next >= FILTER_TYPES.length) return;
    swipeDir.current = dir;
    selectTypeRef.current?.(FILTER_TYPES[next]);
    scrollChipIntoView(next);
  }, [scrollChipIntoView]);
  // Was a PanResponder with its own thresholds — 18px to claim, 45 to commit,
  // no velocity path. The shared hook now, so a swipe here commits at the same
  // distance and ticks the same way as one on Matches, Teams or Rankings.
  const swipe = useFilterSwipe(FILTER_TYPES, activeType, (t) => {
    stepFilter(FILTER_TYPES.indexOf(t) > FILTER_TYPES.indexOf(activeType) ? 1 : -1);
  });
  // Dragging the chip row scrolls the chips and nothing else — otherwise the
  // same drag scrolls the row AND steps the filter under it.
  const filterPanBlocking = useMemo(() => filterPan.blocksExternalGesture(swipe), [filterPan, swipe]);

  // Mirrors `query` for callbacks that must not be rebuilt on every keystroke —
  // same reason activeTypeRef exists. The focus effect holds stable deps, so it
  // captured `query` from the first render and re-searched for "" on every
  // return to the screen: your text stayed in the box, the results silently
  // reset to the whole board.
  const queryRef = useRef('');
  queryRef.current = query;

  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [myPhone, setMyPhone] = useState('');
  const [sharePhone, setSharePhone] = useState(true);

  // "Post a listing" now lives in a bottom sheet (draggable, snap point, backdrop)
  // instead of a full-screen Modal. It renders in the app-root provider's portal,
  // so it overlays everything and isn't clipped by the Pavilion pager transform.
  // Tapping a row opens the full listing: everything the poster typed, plus their
  // number when they chose to share it.
  const [expandedId, setExpandedId] = useState(null);
  const openDetail = useCallback((item) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === item.id ? null : item.id));
  }, []);
  const closeDetail = useCallback(() => setExpandedId(null), []);

  // The create sheet doubles as the edit sheet — same fields, same validation,
  // so the two can't drift. editingId null means "posting a new one".
  const [editingId, setEditingId] = useState(null);

  const [formError, setFormError] = useState('');
  const [posted, setPosted] = useState(false);
  const cs = useCreateStyles();
  const drawerSheet = useDrawerSheet();
  const createSheetRef = useRef(null);
  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(INITIAL_FORM);
    createSheetRef.current?.present();
  }, []);

  // Reassemble the tap-selections from a stored listing. The title and the
  // "When:" line were generated from them on the way in, so they parse back out.
  const openEdit = useCallback((item) => {
    const lines = (item.description || '').split('\n');
    const when = lines.find((l) => l.startsWith('When: '))?.slice(6) || '';
    const notes = lines.filter((l) => !l.startsWith('When: ')).join('\n').trim();
    const [daysPart, timePart] = when.split(' · ');
    const days = (daysPart || '').split(',').map((d) => d.trim()).filter((d) => DAYS.includes(d));
    const timing = TIME_OPTS.includes(timePart) ? timePart : (timePart ? 'Custom' : '');
    // The role sits between the type word and the format in the generated title.
    const titleParts = (item.title || '').replace(/^looking for (?:an?|the)\s+/i, '').split('·').map((x) => x.trim());
    const role = (SUBTYPES[item.type] || []).find((r) => titleParts.includes(r)) || '';

    setEditingId(item.id);
    setForm({
      type: item.type || 'player',
      role,
      description: notes,
      location: item.location || '',
      format: item.format || 'Any',
      ageGroup: item.ageGroup || 'Any',
      days,
      timing,
      customTime: timing === 'Custom' ? (timePart || '') : '',
    });
    setSharePhone(!!(item.contactInfo || '').trim());
    closeDetail();
    createSheetRef.current?.present();
  }, []);
  const dismissCreate = useCallback(() => createSheetRef.current?.dismiss(), []);
  // Typed anything, and the X asks. It dismissed straight to nothing before.
  const listingDirty = !!(form.location || form.description || form.role
    || (form.days || []).length || form.timing || form.customTime);
  const closeCreate = useDiscardGuard(listingDirty, dismissCreate, { title: 'Discard this listing?' });
  const renderBackdrop = useCallback(
    (props) => <BottomSheetBackdrop {...props} {...DRAWER_BACKDROP} />,
    []
  );

  // When embedded in Pavilion, hand the "post a listing" action up to the
  // shared FAB so the Scout tab's primary action lives in the same place as the
  // other tabs' (Share Card / Go Live) instead of only the small header +.
  useEffect(() => {
    if (inline) onRegisterFab?.(openCreate);
  }, [inline, onRegisterFab, openCreate]);

  // Pull the logged-in user's phone once so "Contact" needs no typing.
  useEffect(() => {
    legendsApi.getUserProfile?.().then((res) => {
      if (res?.success && res.data?.phone) setMyPhone(res.data.phone);
    }).catch(() => {});
  }, []);

  // Location auto-populate — same Indian pincode directory used in Edit Profile.
  const [citySuggest, setCitySuggest] = useState([]);
  const cityTimer = useRef(null);
  const onLocationChange = (text) => {
    setForm(f => ({ ...f, location: text }));
    if (cityTimer.current) clearTimeout(cityTimer.current);
    if (text.trim().length < 2) { setCitySuggest([]); return; }
    cityTimer.current = setTimeout(async () => {
      const res = await legendsApi.searchPincodes(text.trim());
      setCitySuggest(res.data || []);
    }, 250);
  };
  const pickCity = (s) => {
    setForm(f => ({ ...f, location: s.state ? `${s.city}, ${s.state}` : s.city }));
    setCitySuggest([]);
  };

  // Scope Explore to the active sport (deep-linked sport, else current selection).
  const sportFilter = route?.params?.sport || getSelectedSport().sport?.id || null;

  useLayoutEffect(() => {
    if (!inline) {
      navigation.setOptions({
        headerShown: true,
        headerBackVisible: true,
        headerTitle: 'Looking For',
      });
    }
  }, [navigation, inline]);

  // One page at a time, filtered server-side. The board used to arrive whole
  // (take: 200) and get filtered in JS, which was fine at ten listings and
  // silently wrong past two hundred.
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Guards a page request against the filter changing underneath it — a slow
  // page for "player" must not append into a board now showing "ground".
  const reqIdRef = useRef(0);

  const load = useCallback(async (typeArg, queryArg) => {
    const rid = ++reqIdRef.current;
    setIsFetching(true);
    const res = await legendsApi.getLookingForPosts({
      sport: getSelectedSport().sport?.id,
      type: typeArg && typeArg !== 'all' ? typeArg : undefined,
      q: (queryArg || '').trim() || undefined,
    });
    if (rid === reqIdRef.current) {
      setIsFetching(false);
      if (res.success) {
        setPosts(res.data);
        setCounts(res.counts);
        setTotal(res.total);
        setCursor(res.nextCursor);
      }
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    const rid = reqIdRef.current;
    setLoadingMore(true);
    const res = await legendsApi.getLookingForPosts({
      sport: getSelectedSport().sport?.id,
      type: activeTypeRef.current !== 'all' ? activeTypeRef.current : undefined,
      q: queryRef.current.trim() || undefined,
      cursor,
    });
    // Drop the page if the filter or search moved on while it was in flight.
    if (res.success && rid === reqIdRef.current) {
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...res.data.filter((p) => !seen.has(p.id))];
      });
      setCursor(res.nextCursor);
    }
    setLoadingMore(false);
  }, [cursor, loadingMore]);

  const loadConnections = useCallback(async () => {
    const res = await legendsApi.getLookingForConnections();
    if (res.success) setConnections(res.data);
  }, []);

  // On focus, not just on mount: posting from elsewhere, or accepting someone
  // and coming back, otherwise left the board showing a stale snapshot.
  // Deliberately NOT keyed on activeType/query — selectType and onQueryChange
  // each fetch on their own. Listing them here made every keystroke re-run the
  // whole effect: a second request racing the debounced one, and a full-screen
  // spinner flashing between letters.
  useFocusEffect(useCallback(() => {
    let alive = true;
    setLoading(true);
    Promise.all([load(activeTypeRef.current, queryRef.current), loadConnections()])
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [load, loadConnections]));   // eslint-disable-line react-hooks/exhaustive-deps

  // Connection lookups per listing.
  const myReqFor = (listingId) => connections.find((c) => c.listingId === listingId && c.requesterId === myId);

  const handleConnect = async (postId) => {
    if (!myId) return;
    haptic.tick();
    const res = await legendsApi.connectLookingFor(postId);
    if (!res.success) {
      showToast(res.error || 'Could not send that request', 'error');
      return;
    }
    loadConnections();
  };
  const handleRespond = async (connId, name, action) => {
    const res = await legendsApi.respondLookingForConnection(connId, action);
    if (!res.success) {
      showToast(res.error || 'Could not respond', 'error');
      return;
    }
    // Accepting removes them from this screen — the conversation now lives in
    // Chats, under Scout. Say so once, here, or the chat you just unlocked is
    // something the user has to go looking for.
    if (action === 'accept') {
      showToast(`Connected with ${name || 'them'} — chat is in Chats`, 'success', 3000);
    }
    loadConnections();
  };
  // A missing chatRoomId used to make this a dead tap. The room is created
  // server-side on demand, so fall through to that rather than doing nothing.
  const openChat = (chatRoomId, name, connId) => {
    if (chatRoomId) navigation.navigate('Chat', { chatId: chatRoomId, chatName: name || 'Chat', chatType: 'scout' });
    else if (connId) openRequestChat(connId, name);
  };

  // Open the conversation for a request that hasn't been answered yet. The room
  // is created server-side on first use, so this works before an accept — which
  // is exactly when there's something to ask.
  const openRequestChat = async (connId, name) => {
    const res = await legendsApi.openLookingForChat(connId);
    if (res.success && res.data?.chatRoomId) {
      navigation.navigate('Chat', { chatId: res.data.chatRoomId, chatName: res.data.name || name || 'Chat', chatType: 'scout' });
      loadConnections();   // pick up the chatRoomId now the room exists
    } else {
      showToast(res.error || 'Could not open the chat', 'error');
    }
  };

  const onRefresh = async () => {
    haptic.impact();
    setRefreshing(true);
    await Promise.all([load(activeTypeRef.current, query), loadConnections()]);
    haptic.success();
    setRefreshing(false);
  };

  const handleCreate = async () => {
    // Validated before the round trip, and said in the form rather than as a
    // toast that has gone by the time you look for the field it meant.
    if (!form.location.trim()) {
      setFormError('Add a location so people know where you are');
      return;
    }
    setFormError('');
    setSubmitting(true);
    const whenPhrase = buildWhen(form);
    const payload = {
      type: form.type,
      title: buildTitle(form),
      description: [whenPhrase ? `When: ${whenPhrase}` : '', form.description].filter(Boolean).join('\n'),
      location: form.location,
      format: form.format === 'Any' ? '' : form.format,
      ageGroup: form.ageGroup === 'Any' ? '' : form.ageGroup,
      contactInfo: sharePhone ? myPhone : '',
      sport: sportFilter || 'cricket',
    };
    const res = editingId
      ? await legendsApi.updateLookingFor(editingId, payload)
      : await legendsApi.createLookingFor(payload);
    setSubmitting(false);
    if (!res.success) {
      // In the form, above the button, where the thing that failed is.
      setFormError(res.error || (editingId ? 'Could not save changes' : 'Could not post that listing'));
      return;
    }
    // The button holds a tick for a beat before the drawer goes, so the flow
    // confirms rather than just vanishing.
    setPosted(true);
    setTimeout(() => {
      setPosted(false);
      dismissCreate();
      setForm(INITIAL_FORM);
      setEditingId(null);
      load(activeTypeRef.current, query);
      showToast(editingId ? 'Listing updated' : 'Listing posted', 'success');
    }, 550);
  };

  // The sheet pins this itself, so the action is never scrolled away from and
  // it rides above the keyboard instead of being covered by it.
  const renderFooter = useCallback((props) => (
    <BottomSheetFooter {...props} bottomInset={0}>
      <StickyFooter>
        <ValidationMessage message={formError} />
        <PrimaryButton
          label={editingId ? 'Save changes' : 'Post Listing'}
          icon="send"
          loading={submitting}
          done={posted}
          onPress={handleCreate}
        />
      </StickyFooter>
    </BottomSheetFooter>
  ), [formError, editingId, submitting, posted, handleCreate]);

  // Remove a listing outright. Marking filled keeps it as a record and closes
  // its requests; this is for the ones that shouldn't exist — a typo, a
  // duplicate. The endpoint and the client method both existed already with no
  // way to reach them.
  const handleDelete = (item) => {
    Alert.alert(
      'Delete listing?',
      'This removes it for good, along with any requests on it. To keep the connections you\'ve already made, mark it filled instead.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          const res = await legendsApi.deleteLookingFor(item.id);
          if (!res.success) { showToast(res.error || 'Could not delete', 'error'); return; }
          closeDetail();
          load(activeTypeRef.current, query);
          showToast('Listing deleted', 'success');
        } },
      ],
    );
  };

  const handleClose = async (postId) => {
    const res = await legendsApi.updateLookingFor(postId, 'closed');
    if (res && res.success === false) {
      showToast(res.error || 'Could not mark that as filled', 'error');
      return;
    }
    // Filling a listing bulk-declines its pending requests server-side, so the
    // connection list is stale the moment this returns — refetch both or the
    // pinned blocks keep showing requests that no longer exist.
    await Promise.all([load(activeTypeRef.current, query), loadConnections()]);
  };

  // Rows arrive already filtered and searched; counts describe the whole board.
  const visiblePosts = posts.filter((p) => !hidden.includes(p.id));
  const hiddenOnPage = posts.length - visiblePosts.length;
  // Hiding everything on a page is not the same as there being nothing here, and
  // the empty state said the latter — offering to post a listing when the board
  // was full of ones you'd chosen not to see.
  const allHiddenHere = !visiblePosts.length && posts.length > 0;
  const countsByType = counts;

  // Debounce the search so each keystroke isn't a round-trip.
  const searchTimer = useRef(null);
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);
  const onQueryChange = (text) => {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(activeTypeRef.current, text), 300);
  };

  const selectType = useCallback((type) => {
    if (type === activeTypeRef.current) return;
    haptic.tick();
    const idx = FILTER_TYPES.indexOf(type);
    const currIdx = FILTER_TYPES.indexOf(activeTypeRef.current);
    swipeDir.current = idx > currIdx ? 1 : -1;
    activeTypeRef.current = type;
    setActiveType(type);
    setPosts([]);
    setCursor(null);
    load(type, query);
  }, [load, query]);
  selectTypeRef.current = selectType;

  // Keyed off the connection's own listing fields, not the feed. `posts` is one
  // page of one filter now, so cross-referencing it hid every pending request
  // whose listing happened not to be on screen — which is most of them the
  // moment you tap a filter.
  const inboundPending = connections.filter(
    (c) => c.posterId === myId && c.status === 'pending' && c.listingStatus === 'open'
  );

  // The one action a listing offers right now, shared by the row and the detail
  // sheet so the two can never show different next steps for the same listing.
  const actionFor = (item, big = false) => {
    // Until the profile resolves we can't tell whose listing this is, and every
    // action below hinges on that. Offering Connect on a guess is how your own
    // posting ended up with a Connect button — and the server rejects it, so
    // the tap did nothing.
    if (!myId) return null;
    const isMine = item.postedById === myId;
    const myReq = myReqFor(item.id);
    const ctaStyle = big ? [styles.rowCta, styles.ctaWide, { backgroundColor: P.control }] : [styles.rowCta, { backgroundColor: P.control }];
    const ghostStyle = big ? [styles.rowGhostBtn, styles.ctaWide] : styles.rowGhostBtn;
    const flagStyle = big ? [styles.rowFlag, styles.ctaWide] : styles.rowFlag;

    if (isMine) {
      // The board is open listings only, so a row is never already filled —
      // marking it removes it on the next fetch.
      return (
        <TouchableOpacity style={ghostStyle} onPress={() => { closeDetail(); handleClose(item.id); }} activeOpacity={0.8}>
          <Text style={styles.rowGhostText}>Mark filled</Text>
        </TouchableOpacity>
      );
    }
    if (!item.postedById) return null;
    if (myReq?.status === 'accepted') {
      return (
        <TouchableOpacity style={ghostStyle} onPress={() => openChat(myReq.chatRoomId, item.posterName || 'Poster', myReq.id)} activeOpacity={0.85}>
          <Icon name="chat-outline" size={14} color={DS.lime} />
          <Text style={styles.rowGhostText}>Chat</Text>
        </TouchableOpacity>
      );
    }
    if (myReq?.status === 'pending') {
      // Was a dead end — you could only wait. Tapping asks a question instead.
      return (
        <TouchableOpacity style={flagStyle} onPress={() => openRequestChat(myReq.id, item.posterName || 'Poster')} activeOpacity={0.85}>
          <Icon name="clock-outline" size={13} color={DS.textMuted} />
          <Text style={styles.rowFlagText}>Sent</Text>
        </TouchableOpacity>
      );
    }
    if (myReq?.status === 'declined') {
      return <View style={flagStyle}><Text style={styles.rowFlagText}>Declined</Text></View>;
    }
    return (
      <TouchableOpacity style={ctaStyle} onPress={() => handleConnect(item.id)} activeOpacity={0.85}>
        <Text style={[styles.rowCtaText, { color: P.onControl }]}>Connect</Text>
      </TouchableOpacity>
    );
  };

  // ── One listing = one row ──────────────────────────────────────────────────
  // Three lines, fixed shape: the ask, then who/where/when, then age + category.
  // The action sits on the right so the eye can run down a single column of
  // buttons instead of hunting for one at the bottom of each card.
  const renderPost = ({ item, index }) => {
    const descLines = (item.description || '').split('\n');
    const whenText = descLines.find((l) => l.startsWith('When: '))?.slice(6);
    const bodyDesc = descLines.filter((l) => !l.startsWith('When: ')).join('\n').trim();
    const isMine = !!myId && item.postedById === myId;
    const myReq = myReqFor(item.id);

    // Line 2 — who posted it, then where and when. Just the name: 84e503b had it
    // read "Suresh Balakrishnan · You" on your own listings, which is the third
    // ownership cue on one row. The avatar is yours and the action column says
    // "Mark filled" where everyone else's says "Connect" — that column is fixed
    // width and scans down the page, so it marks your listings better than a
    // word buried mid-sentence.
    const who = item.posterName || (isMine ? 'You' : '');
    const whoLine = [who, item.location, whenText].filter(Boolean).join(' · ');
    // Line 3 — age, then the qualifiers. The category is no longer repeated here:
    // the full title above already names it.
    const metaLine = [timeAgo(item.createdAt), item.format, item.ageGroup]
      .filter(Boolean).join(' · ');

    const action = actionFor(item);
    const isExpanded = expandedId === item.id;
    const notes = bodyDesc;
    const phone = (item.contactInfo || '').trim();
    const facts = [
      ['map-marker-outline', 'Where', item.location],
      ['clock-outline', 'When', whenText],
      ['cricket', 'Format', item.format],
      ['human', 'Age group', item.ageGroup],
    ].filter(([, , v]) => !!v);

    return (
      <Reanimated.View
        entering={FadeInDown.duration(300).delay(index < 8 ? index * 35 : 0)}
        style={styles.rowWrapper}
        layout={LinearTransition.springify()}
      >

          <View style={styles.row}>
            <AnimatedPressable 
              style={styles.rowTap} 
              contentStyle={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}
              activeOpacity={0.7} 
              onPress={() => openDetail(item)}
            >
            <View style={{ position: 'relative' }}>

              {item.posterName
                ? <PlayerAvatar name={item.posterName} avatarUrl={item.posterAvatarUrl} size={34} />
                : (
                  <View style={styles.rowIconAvatar}>
                     <Icon name={TYPE_ICONS[item.type] || 'help-circle'} size={17} color={DS.lime} />
                  </View>
                )}
            </View>

            <View style={styles.rowMain}>
              <Text style={styles.rowAsk} numberOfLines={2}>{item.title || askFrom(item)}</Text>
              {!!whoLine && <Text style={styles.rowWho} numberOfLines={1}>{whoLine}</Text>}
              <Text style={styles.rowMeta} numberOfLines={1}>{metaLine}</Text>
              {!isExpanded && !!bodyDesc && <Text style={styles.rowNote} numberOfLines={2}>{bodyDesc}</Text>}
            </View>
            </AnimatedPressable>

            {action}
          </View>
          
          {isExpanded && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 }}>
              {facts.length > 0 && (
                <View style={styles.factList}>
                  {facts.map(([icon, label, value]) => (
                    <View key={label} style={styles.factRow}>
                      <Icon name={icon} size={16} color={DS.textMuted} />
                      <Text style={styles.factLabel}>{label}</Text>
                      <Text style={styles.factValue} numberOfLines={2}>{value}</Text>
                    </View>
                  ))}
                </View>
              )}
              {!!notes && (
                <View style={[styles.notesBox, { marginTop: 12 }]}>
                  <Text style={styles.notesLabel}>NOTES</Text>
                  <Text style={styles.notesText}>{notes}</Text>
                </View>
              )}
              {!phone && item.contactShared && !isMine && (
                <View style={[styles.contactLocked, { marginTop: 12 }]}>
                  <Icon name="lock-outline" size={16} color={DS.textMuted} />
                  <Text style={styles.contactLockedText}>Shares their number once they accept you</Text>
                </View>
              )}
              {!!phone && (
                <TouchableOpacity
                  style={[styles.contactBox, { marginTop: 12 }]}
                  activeOpacity={0.85}
                  onPress={() => Linking.openURL(`tel:${phone.replace(/\s/g, '')}`).catch(() => showToast('No dialer available', 'error'))}>
                  <Icon name="phone" size={18} color={DS.lime} />
                  <Text style={styles.contactPhone}>{phone}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

      </Reanimated.View>
    );
  };

  // Requests waiting on you, lifted out of the feed and pinned above it.
  const renderInbox = () => {
    if (!inboundPending.length) return null;
    return (
      <View style={styles.inbox}>
        <View style={styles.inboxHead}>
          <Icon name="account-clock-outline" size={15} color={DS.coral} />
          <Text style={styles.inboxTitle}>Needs your reply · {inboundPending.length}</Text>
        </View>
        {inboundPending.map((r) => (
            <View key={r.id} style={styles.inboxRow}>
              <Text style={styles.inboxName} numberOfLines={2}>
                {r.requesterName}
                <Text style={styles.inboxFor}>
                  {r.listingTitle ? `  ·  ${askFrom({ title: r.listingTitle, type: r.listingType })}` : ''}
                </Text>
              </Text>
              <View style={styles.inboxActions}>
                <TouchableOpacity style={styles.rowGhostBtn} onPress={() => openRequestChat(r.id, r.requesterName)} activeOpacity={0.85}>
                  <Icon name="message-text-outline" size={14} color={DS.lime} />
                  <Text style={styles.rowGhostText}>Ask</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.rowCta, { backgroundColor: P.control }]} onPress={() => handleRespond(r.id, r.requesterName, 'accept')} activeOpacity={0.85}>
                  <Text style={[styles.rowCtaText, { color: P.onControl }]}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.inboxDecline} onPress={() => handleRespond(r.id, r.requesterName, 'decline')} activeOpacity={0.85}>
                  <Icon name="close" size={15} color={DS.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <AmbientBackground />
      {/* Brand bar */}
      {!inline && (
        <View style={styles.brandBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-left" size={22} color={DS.textPrimary} />
          </TouchableOpacity>
          <BrandLogo scale={0.75} />
        </View>
      )}

      {/* Hero section */}
      {!inline && (
        <View style={styles.hero}>
          <Animated.View style={{ transform: [{ translateY: hideTabBar.scrollY.interpolate({ inputRange: [-300, 0, 300], outputRange: [-100, 0, 100], extrapolate: 'clamp' }) }] }}>
            <Text style={styles.heroTitle}>EXPLORE.</Text>
            <Text style={styles.heroSubtitle}>Find players, teams, coaches & grounds near you</Text>
          </Animated.View>
        </View>
      )}

      {/* Search bar — full width (posting lives on the FAB + CTA card). */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Icon name="magnify" size={20} color={DS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search listings..."
            placeholderTextColor={DS.textMuted}
            value={query}
            onChangeText={onQueryChange}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => onQueryChange('')}>
              <Icon name="close-circle" size={16} color={DS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      {!role && (
        <Animated.View style={{ zIndex: 10, transform: [
          { translateY: scrollY.interpolate({ inputRange: [-100, 0, 100], outputRange: [0, 0, -25], extrapolate: 'clamp' }) },
          { scale: scrollY.interpolate({ inputRange: [-100, 0], outputRange: [1.1, 1], extrapolateRight: 'clamp' }) }
        ] }}>
          <GestureDetector gesture={filterPanBlocking}>
            <Reanimated.ScrollView
              ref={filterScroll}
              horizontal
              scrollEnabled={false}
              showsHorizontalScrollIndicator={false}
              style={styles.tabs}
              contentContainerStyle={styles.tabsContent}
              onLayout={(e) => { filterViewW.current = e.nativeEvent.layout.width; recomputeMax(); }}
              onContentSizeChange={(w) => { filterContentW.current = w; recomputeMax(); }}
            >
              {FILTER_TYPES.map((t, idx) => {
                const on = activeType === t;
                const n = t === 'all' ? total : (countsByType[t] || 0);
                const empty = n === 0 && !on;
                return (
                  <TouchableOpacity
                    key={t}
                    activeOpacity={0.7}
                    style={[styles.tab, on && styles.tabActive, empty && styles.tabEmpty]}
                    onLayout={(e) => { chipX.current[idx] = e.nativeEvent.layout.x; }}
                    onPress={() => {
                      selectType(t);
                      // Bring the tapped chip into view so the selection is never clipped.
                      scrollChipIntoView(idx);
                    }}
                  >
                    {/* Every chip carries its name now. Icon-only pills meant ten of
                        these eleven categories were a guess. */}
                    {t === 'all' && <Icon name={TYPE_ICONS[t]} size={16} color={on ? P.control : DS.textVariant} />}
                    <Text style={[styles.tabText, on && styles.tabTextActive]} numberOfLines={1}>
                      {TYPE_LABELS[t] || t}
                    </Text>
                    <View style={[styles.tabCountWrap, on && styles.tabCountWrapActive]}>
                      <Text style={[styles.tabCount, on && styles.tabCountActive]}>{n}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </Reanimated.ScrollView>
          </GestureDetector>
        </Animated.View>
      )}

      <GestureDetector gesture={swipe}>
      <View style={{ flex: 1 }}>
      {loading ? (
        <ScoutSkeleton DS={DS} />
      ) : (
        // No footer CTA: with listings on screen the FAB already carries posting,
        // and a card at the end of every scroll only repeated it. The empty state
        // keeps its own prompt — there the invitation is the point, not noise.
        <Reanimated.View 
          key={activeType}
          style={{ flex: 1 }}
          entering={swipeDir.current === 1 ? SlideInRight.duration(200).withInitialValues({ transform: [{ translateX: 50 }] }) : SlideInLeft.duration(200).withInitialValues({ transform: [{ translateX: -50 }] })}
        >
          <Animated.FlatList
            onScroll={onScroll}
          onScrollEndDrag={hideTabBar.onScrollEndDrag}
          scrollEventThrottle={16}
          data={visiblePosts}
          extraData={[connections, myId]}
          keyExtractor={i => i.id}
          renderItem={renderPost}
          contentContainerStyle={[styles.list, { paddingBottom: tabClear }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} colors={[DS.lime]} />}
          ListHeaderComponent={renderInbox()}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ marginVertical: 20 }} color={DS.lime} />
            : hidden.length ? (
              // Hiding shouldn't be a one-way door you forget you walked through.
              <View style={styles.hiddenNote}>
                <Text style={styles.hiddenNoteText}>
                  {hidden.length} hidden{hiddenOnPage ? ` · ${hiddenOnPage} here` : ''}
                </Text>
                <TouchableOpacity onPress={unhideAll} hitSlop={8}>
                  <Text style={styles.hiddenUndo}>Show all</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          ListEmptyComponent={
            isFetching ? <View style={{ paddingTop: 60 }}><ActivityIndicator color={DS.lime} /></View> :
            <View style={styles.empty}>
              <View style={styles.emptyBox}>
                <View style={styles.emptyIconWrap}>
                  <Icon
                    name={activeType === 'all' ? 'telescope' : (TYPE_ICONS[activeType] || 'telescope')}
                    size={32}
                    color={DS.limeDark}
                  />
                </View>
              <Text style={styles.emptyText}>
                {allHiddenHere
                  ? 'Everything here is hidden'
                  : query.trim()
                    ? 'Nothing matches that search'
                    : activeType === 'all'
                      ? 'No listings yet'
                      : `No ${(TYPE_LABELS[activeType] || activeType).toLowerCase()} listings yet`}
              </Text>
              <Text style={styles.emptySubText}>
                {allHiddenHere
                  ? 'You hid every listing on this page.'
                  : query.trim()
                    ? 'Try a shorter search, or clear it.'
                    : 'Post the first one and let people find you.'}
              </Text>
              {/* An empty category is a prompt, not a dead end — it's where the
                  next listing should come from. */}
              {allHiddenHere && (
                <TouchableOpacity style={styles.emptyCta} onPress={unhideAll} activeOpacity={0.85}>
                  <Icon name="eye-outline" size={16} color={DS.onLime} />
                  <Text style={styles.emptyCtaText}>Show hidden listings</Text>
                </TouchableOpacity>
              )}
              {!allHiddenHere && !query.trim() && (
                <TouchableOpacity style={styles.emptyCta} onPress={openCreate} activeOpacity={0.85}>
                  <Icon name="plus" size={16} color={DS.onLime} />
                  <Text style={styles.emptyCtaText}>
                    {activeType === 'all' ? 'Post a listing' : `Post ${(TYPE_LABELS[activeType] || activeType).toLowerCase()}`}
                  </Text>
                </TouchableOpacity>
              )}
              </View>
            </View>
          }
        />
        </Reanimated.View>
      )}
      </View>
      </GestureDetector>

      {/* Create Modal */}
      <BottomSheetModal
        {...drawerSheet}
        ref={createSheetRef}
        onDismiss={() => { setForm(INITIAL_FORM); setEditingId(null); setFormError(''); setPosted(false); }}
        backdropComponent={renderBackdrop}
        footerComponent={renderFooter}
      >
            <DrawerHeader
              icon="telescope"
              title={editingId ? 'Edit Listing' : 'Post a Listing'}
              subtitle="Let others know what you're looking for"
              onClose={closeCreate}
            />
            <DrawerScroll>
              {/* Grouped into cards rather than run as one column of labels.
                  Nine questions in a row is a wall; three cards is a form you
                  can see the shape of before you start filling it in. */}
              <SectionCard title="What you're after" icon="target">
                <ChipGroup
                  label="Looking for"
                  required
                  options={TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] || t, icon: TYPE_ICONS[t] }))}
                  value={form.type}
                  onChange={(v) => v && setForm((f) => ({ ...f, type: v, role: '' }))}
                />
                {SUBTYPES[form.type] && (
                  <ChipGroup
                    label={SUBTYPE_LABEL[form.type] || 'Type'}
                    options={SUBTYPES[form.type]}
                    value={form.role}
                    onChange={(v) => setForm((f) => ({ ...f, role: v || '' }))}
                  />
                )}
                <ChipGroup label="Format" options={FORMAT_OPTS} value={form.format}
                  onChange={(v) => v && setForm((f) => ({ ...f, format: v }))} />
                <ChipGroup label="Age group" options={AGE_OPTS} value={form.ageGroup} last
                  onChange={(v) => v && setForm((f) => ({ ...f, ageGroup: v }))} />
              </SectionCard>

              <SectionCard title="When" icon="calendar-clock">
                <ChipGroup
                  label="Which days"
                  multi
                  options={DAYS}
                  value={form.days}
                  onChange={(v) => setForm((f) => ({ ...f, days: v }))}
                  helper="Pick as many as suit you"
                />
                <ChipGroup label="Timing" options={TIME_OPTS} value={form.timing}
                  last={form.timing !== 'Custom'}
                  onChange={(v) => setForm((f) => ({ ...f, timing: v || '' }))} />
                {form.timing === 'Custom' && (
                  <TextField
                    label="What time"
                    last
                    value={form.customTime}
                    onChangeText={(v) => setForm((f) => ({ ...f, customTime: v }))}
                    placeholder="e.g. 5:30 PM"
                  />
                )}
              </SectionCard>

              <SectionCard title="Where & details" icon="map-marker-outline">
                <TextField
                  label="Location"
                  required
                  value={form.location}
                  onChangeText={onLocationChange}
                  placeholder="Start typing your city…"
                  autoCorrect={false}
                  helper={citySuggest.length ? undefined : 'City, town or area'}
                />
                {citySuggest.length > 0 && (
                  <View style={styles.suggestBox}>
                    {citySuggest.slice(0, 6).map((sg, i) => (
                      <TouchableOpacity key={i} style={styles.suggestRow} onPress={() => pickCity(sg)}>
                        <Icon name="map-marker-outline" size={16} color={DS.lime} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.suggestCity}>{sg.city}</Text>
                          <Text style={styles.suggestMeta}>{sg.district}, {sg.state} · {sg.pincode}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <TextArea
                  label="Notes"
                  value={form.description}
                  onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                  placeholder="Skills, timing, budget — anything that helps"
                  last={!myPhone}
                />

                {!!myPhone && (
                  <Toggle
                    title="Share my number"
                    hint={`${myPhone} — so people can connect`}
                    value={sharePhone}
                    onChange={setSharePhone}
                  />
                )}
              </SectionCard>

              <View style={styles.previewBox}>
                <Text style={styles.previewLabel}>POSTS AS</Text>
                <Text style={styles.previewTitle}>{buildTitle(form)}</Text>
              </View>
            </DrawerScroll>

      </BottomSheetModal>
      <DynamicIsland ref={islandRef} />
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },

  /* Brand bar */
  brandBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(248, 250, 252, 0.85)', paddingTop: 48, paddingBottom: 14, paddingHorizontal: 16 },
  // 40x40: a 22px icon with 4px padding was a 30px target, well under the 44pt
  // minimum and the easiest thing on the screen to miss.
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center' },

  /* Hero */
  hero: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: DS.bg },
  heroTitle: { fontSize: 20, fontWeight: '900', color: DS.textPrimary, letterSpacing: 0.5 },
  heroSubtitle: { fontSize: 12, color: DS.textMuted, marginTop: 2, lineHeight: 18 },

  /* Search — pill-shaped, prominent. */
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: DS.bg },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surfaceHigh, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderWidth: 0 },
  searchInput: { flex: 1, fontSize: 15, color: DS.textPrimary, padding: 0 },

  /* Filter chips — labelled + counted; the row scrolls under a self-driven Pan. */
  tabs: { backgroundColor: DS.bg, flexGrow: 0, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: DS.faint },
  tabsContent: { paddingHorizontal: 16, paddingVertical: 0, gap: 16, alignItems: 'center' },
  // Filter chip, form type chip and form option chip are the same control doing
  // the same job — pick one of a set. They had three different radii (999 vs 20)
  // and three paddings. Same geometry now; only the copy differs.
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: DS.lime },
  // Zero listings: still there, still tappable, just visibly quieter.
  tabEmpty: { opacity: 0.45 },
  tabText: { fontSize: 14, color: DS.textVariant, fontWeight: '600', includeFontPadding: false },
  tabTextActive: { color: DS.lime, fontWeight: 'bold' },
  tabCountWrap: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: DS.surfaceHigh },
  tabCountWrapActive: { backgroundColor: DS.lime + '15' },
  tabCount: { fontSize: 11, color: DS.textMuted, fontWeight: '600', includeFontPadding: false },
  tabCountActive: { color: DS.lime, fontWeight: '800', opacity: 1 },

  /* List — bordered rows, not floating cards: ~5 listings a screen instead of 2. */
  list: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 28 },
  sep: { display: 'none' },

  rowWrapper: { marginBottom: 12 },

  row: { 
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14,
    backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border, 
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 
  },
  rowIconAvatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: DS.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  // The ask, with the "Looking for a…" boilerplate stripped — the one line worth reading.
  // 14.5 rather than 15: the full title is longer than the stripped ask it
  // replaced, and this keeps the common case on one line inside the ~190px the
  // fixed-width action column leaves.
  rowAsk: { fontSize: 14, fontWeight: '600', color: DS.textPrimary, letterSpacing: -0.2, lineHeight: 18 },
  rowWho: { fontSize: 12, color: DS.textVariant, fontWeight: '500' },
  rowMeta: { fontSize: 12, color: DS.textMuted },
  rowNote: { fontSize: 11, color: DS.textVariant, marginTop: 3, lineHeight: 15 },

  /* One action per row, right-aligned so they form a single scannable column.
     The three variants below carry IDENTICAL geometry on purpose — a row whose
     state is Connect, Mark filled or Filled must occupy exactly the same box, or
     the right edge ragged-steps down the list and the column stops reading as a
     column. Height is fixed rather than padding-derived because RN counts border
     inside the box, so the 1px-bordered variants would otherwise sit taller. */
  rowCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    minWidth: 72, height: 32, borderRadius: 8, paddingHorizontal: 10, marginTop: 2,
    // Near-black primary (pav().control, applied inline — it's theme-derived).
    // The green accent already carries selected chips, avatar initials, ghost
    // buttons and the empty-state CTA; a green Connect on every row turned the
    // list into a green stripe and left the accent meaning nothing.
    borderWidth: 1, borderColor: DS.faint,
  },
  rowCtaText: { fontSize: 11, fontWeight: '800' },
  rowGhostBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    minWidth: 72, height: 32, borderRadius: 8, paddingHorizontal: 10, marginTop: 2,
    borderWidth: 1.5, borderColor: DS.lime,
  },
  rowGhostText: { fontSize: 11, fontWeight: '800', color: DS.lime },
  rowFlag: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    minWidth: 96, height: 34, borderRadius: 8, paddingHorizontal: 10, alignSelf: 'center',
    backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.faint,
  },
  rowFlagText: { fontSize: 11.5, fontWeight: '700', color: DS.textMuted },

  /* Row body is one tap target; the action button beside it is its own. */
  rowTap: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },

  /* ── Listing detail sheet ── */
  detailBody: { padding: 18, paddingBottom: 32, gap: 14 },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailPoster: { fontSize: 15, fontWeight: '800', color: DS.textPrimary },
  detailPosted: { fontSize: 12, color: DS.textMuted, marginTop: 1 },
  detailAsk: { fontSize: 21, fontWeight: '900', color: DS.textPrimary, letterSpacing: -0.4, lineHeight: 27 },

  factList: { backgroundColor: DS.surfaceHigh, borderRadius: 12, padding: 12, gap: 10 },
  factRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  factLabel: { width: 76, fontSize: 12, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.3 },
  factValue: { flex: 1, fontSize: 13, fontWeight: '600', color: DS.textPrimary },

  notesBox: { gap: 6 },
  notesLabel: { fontSize: 10, fontWeight: '900', color: DS.textMuted, letterSpacing: 1 },
  notesText: { fontSize: 14, color: DS.textVariant, lineHeight: 21 },

  // Shown only when the poster opted in; taps through to the dialer.
  contactBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: DS.surfaceHigh, borderRadius: 12, padding: 13,
    borderWidth: 1, borderColor: DS.lime,
  },
  contactLocked: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: DS.surfaceHigh, borderRadius: 12, padding: 13,
  },
  contactLockedText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: DS.textMuted },
  contactLabel: { fontSize: 10, fontWeight: '900', color: DS.textMuted, letterSpacing: 0.8 },
  contactPhone: { flex: 1, fontSize: 15, fontWeight: '800', color: DS.lime, letterSpacing: 0.4 },
  contactValue: { fontSize: 15, fontWeight: '800', color: DS.textPrimary, marginTop: 2 },

  detailAction: { marginTop: 4, alignItems: 'stretch' },
  ownerActions: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  ownerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 16 },
  editText: { fontSize: 13, fontWeight: '800', color: DS.lime },
  hideText: { fontSize: 13, fontWeight: '700', color: DS.textMuted },
  hiddenNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  hiddenNoteText: { fontSize: 12, color: DS.textMuted },
  hiddenUndo: { fontSize: 12, fontWeight: '800', color: DS.lime },
  deleteText: { fontSize: 13, fontWeight: '800', color: DS.coral },
  // Full-width variant of the row buttons for the sheet's single primary action.
  ctaWide: { alignSelf: 'stretch', height: 46, minWidth: 0 },

  /* "Needs your reply" — pulled out of the feed and pinned on top. */
  inbox: {
    backgroundColor: DS.surface, borderRadius: 14, borderWidth: 1, borderColor: DS.coral,
    padding: 12, gap: 10, marginBottom: 14,
  },
  inboxHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inboxTitle: { fontSize: 12, fontWeight: '800', color: DS.coral, letterSpacing: 0.3 },
  inboxRow: { gap: 8 },
  inboxName: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },
  inboxFor: { fontSize: 12, fontWeight: '500', color: DS.textMuted },
  inboxActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inboxDecline: {
    // 34 to match the Ask/Accept buttons beside it — a 32 here left the row
    // baseline half a pixel off and read as a misalignment.
    width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.faint,
  },

  /* Empty */
  empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 16 },
  emptyBox: { 
    width: '100%', alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24,
    backgroundColor: DS.surface, borderRadius: 24, borderWidth: 1.5, borderColor: DS.faint, borderStyle: 'dashed' 
  },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: DS.lime + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyText: { fontSize: 17, fontWeight: '800', color: DS.textPrimary, marginTop: 12, textAlign: 'center' },
  emptySubText: { fontSize: 13.5, color: DS.textMuted, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 24,
    backgroundColor: DS.lime, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12,
  },
  emptyCtaText: { fontSize: 14, fontWeight: '800', color: DS.onLime },

  /* Modal */
  // DS.white on the accent green was ~2.2:1 — the selected format/age/day chips
  // were near-unreadable. DS.onLime is the dark ink the theme ships for exactly
  // this fill (~8.45:1), and it's what the filter and type chips already use.
  suggestBox: { marginTop: 6, backgroundColor: DS.surface, borderRadius: 12, borderWidth: 1, borderColor: DS.faint, overflow: 'hidden' },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: DS.faint },
  suggestCity: { fontSize: 14, fontWeight: '700', color: DS.textPrimary },
  suggestMeta: { fontSize: 11, color: DS.textMuted, marginTop: 1 },
  previewBox: { marginTop: 18, backgroundColor: DS.blueDeep + '10', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: DS.blueDeep + '22' },
  previewLabel: { fontSize: 10, fontWeight: '800', color: DS.blueDeep, letterSpacing: 1 },
  previewTitle: { fontSize: 15, fontWeight: '800', color: DS.textPrimary, marginTop: 4 },
  // Same role as Connect — the primary commit — so the same near-black
  // treatment (fill applied inline from pav().control). Was DS.blueDeep, which
  // the theme folds to the accent green, and it cast a green shadow to match.
});
