import { useState, useEffect, useCallback, useLayoutEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, ScrollView, ActivityIndicator, RefreshControl, Animated, PanResponder, Linking, Alert
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { BottomSheetModal, BottomSheetScrollView, BottomSheetBackdrop, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import Reanimated, { FadeInDown, useAnimatedRef, useSharedValue, scrollTo } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { showToast } from '../components/Toast';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport } from '../utils/selectedSport';
import { useCurrentUser } from '../utils/currentUser';
import { useFocusEffect } from '@react-navigation/native';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { pav } from '../theme/pavilion';
import { useHideTabBarOnScroll, useTabBarClearance } from '../components/AutoHideTabBar';
import BrandLogo from "../components/BrandLogo";
import PlayerAvatar from "../components/PlayerAvatar";

// ── Shimmer Skeleton ────────────────────────────────────────────────────────
function ScoutSkeleton({ DS }) {
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
    <View style={{ padding: 16, gap: 14 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ backgroundColor: DS.surfaceHigh, borderRadius: 16, overflow: 'hidden' }}>
          <Bar w="100%" h={56} r={0} />
          <View style={{ padding: 14, gap: 12 }}>
            <Bar w={80} h={20} r={10} />
            <Bar w="80%" h={16} />
            <Bar w="60%" h={12} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
               <Bar w={70} h={14} />
               <Bar w={70} h={14} />
            </View>
          </View>
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

export default function LookingForScreen({ navigation, route, inline, onRegisterFab, pagerGesture }) {
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
  const hideTabBar = useHideTabBarOnScroll();
  const tabClear = useTabBarClearance();
  // Optional deep-link category (e.g. from the search screen's "Looking for" list).
  const initialType = FILTER_TYPES.includes(route?.params?.initialType) ? route.params.initialType : 'all';
  const meUser = useCurrentUser();
  const myId = meUser?.id;
  const [connections, setConnections] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeType, setActiveType] = useState(initialType);
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
  const stepFilter = useCallback((dir) => {
    const idx = FILTER_TYPES.indexOf(activeTypeRef.current);
    const next = idx + dir;
    if (next < 0 || next >= FILTER_TYPES.length) return;
    selectTypeRef.current?.(FILTER_TYPES[next]);
    scrollChipIntoView(next);
  }, [scrollChipIntoView]);
  const swipe = useRef(PanResponder.create({
    // Only claim clearly-horizontal drags; vertical drags fall through to the list.
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
    onPanResponderRelease: (_, g) => {
      if (g.dx <= -45) stepFilter(1);        // swipe left → next filter
      else if (g.dx >= 45) stepFilter(-1);   // swipe right → previous filter
    },
  })).current;
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [myPhone, setMyPhone] = useState('');
  const [sharePhone, setSharePhone] = useState(true);

  // "Post a listing" now lives in a bottom sheet (draggable, snap point, backdrop)
  // instead of a full-screen Modal. It renders in the app-root provider's portal,
  // so it overlays everything and isn't clipped by the Pavilion pager transform.
  // Tapping a row opens the full listing: everything the poster typed, plus their
  // number when they chose to share it.
  const [detailItem, setDetailItem] = useState(null);
  const detailSheetRef = useRef(null);
  const detailSnapPoints = useMemo(() => ['70%'], []);
  const openDetail = useCallback((item) => {
    setDetailItem(item);
    detailSheetRef.current?.present();
  }, []);
  const closeDetail = useCallback(() => detailSheetRef.current?.dismiss(), []);

  // The create sheet doubles as the edit sheet — same fields, same validation,
  // so the two can't drift. editingId null means "posting a new one".
  const [editingId, setEditingId] = useState(null);

  const createSheetRef = useRef(null);
  const createSnapPoints = useMemo(() => ['92%'], []);
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
  const closeCreate = useCallback(() => createSheetRef.current?.dismiss(), []);
  const renderBackdrop = useCallback(
    (props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />,
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
    const res = await legendsApi.getLookingForPosts({
      sport: getSelectedSport().sport?.id,
      type: typeArg && typeArg !== 'all' ? typeArg : undefined,
      q: (queryArg || '').trim() || undefined,
    });
    if (!res.success || rid !== reqIdRef.current) return;
    setPosts(res.data);
    setCounts(res.counts);
    setTotal(res.total);
    setCursor(res.nextCursor);
  }, []);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    const rid = reqIdRef.current;
    setLoadingMore(true);
    const res = await legendsApi.getLookingForPosts({
      sport: getSelectedSport().sport?.id,
      type: activeTypeRef.current !== 'all' ? activeTypeRef.current : undefined,
      q: query.trim() || undefined,
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
  }, [cursor, loadingMore, query]);

  const loadConnections = useCallback(async () => {
    const res = await legendsApi.getLookingForConnections();
    if (res.success) setConnections(res.data);
  }, []);

  // On focus, not just on mount: posting from elsewhere, or accepting someone
  // and coming back, otherwise left the board showing a stale snapshot.
  useFocusEffect(useCallback(() => {
    let alive = true;
    setLoading(true);
    Promise.all([load(activeType, query), loadConnections()]).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [load, loadConnections, activeType, query]));

  // Connection lookups per listing.
  const myReqFor = (listingId) => connections.find((c) => c.listingId === listingId && c.requesterId === myId);

  const handleConnect = async (postId) => {
    const res = await legendsApi.connectLookingFor(postId);
    if (res.success) loadConnections();
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
    setRefreshing(true);
    await Promise.all([load(activeTypeRef.current, query), loadConnections()]);
    setRefreshing(false);
  };

  const handleCreate = async () => {
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
      // Silently doing nothing left the sheet open with a full form and no clue
      // the post hadn't gone anywhere.
      showToast(res.error || (editingId ? 'Could not save changes' : 'Could not post that listing'), 'error');
      return;
    }
    closeCreate();
    setForm(INITIAL_FORM);
    setEditingId(null);
    load(activeTypeRef.current, query);
    showToast(editingId ? 'Listing updated' : 'Listing posted', 'success');
  };

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
  const visiblePosts = posts;
  const countsByType = counts;

  // Debounce the search so each keystroke isn't a round-trip. The board reloads
  // through the same focus effect that owns activeType.
  const searchTimer = useRef(null);
  const onQueryChange = (text) => {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(activeTypeRef.current, text), 300);
  };

  const selectType = (t) => {
    setActiveType(t);
    activeTypeRef.current = t;
    setPosts([]);
    setCursor(null);
    load(t, query);
  };
  selectTypeRef.current = selectType;

  // Keyed off the connection's own listing fields, not the feed. `posts` is one
  // page of one filter now, so cross-referencing it hid every pending request
  // whose listing happened not to be on screen — which is most of them the
  // moment you tap a filter.
  const inboundPending = connections.filter(
    (c) => c.posterId === myId && c.status === 'pending' && c.listingStatus === 'open'
  );

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
      {/* Brand bar */}
      {!inline && (
        <View style={styles.brandBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-left" size={22} color={DS.textPrimary} />
          </TouchableOpacity>
          <BrandLogo scale={0.75} />
          <TouchableOpacity onPress={openCreate} style={styles.addBtn}>
            <Icon name="plus" size={20} color={DS.bg} />
          </TouchableOpacity>
        </View>
      )}

      {/* Hero section */}
      {!inline && (
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>EXPLORE.</Text>
          <Text style={styles.heroSubtitle}>Find players, teams, coaches & grounds near you</Text>
        </View>
      )}

      {/* Search bar — full width (posting lives on the FAB + CTA card). */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Icon name="magnify" size={20} color={DS.lime} />
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
      <GestureDetector gesture={filterPan}>
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
                <Icon name={TYPE_ICONS[t]} size={15} color={on ? DS.onLime : DS.textMuted} />
                <Text style={[styles.tabText, on && styles.tabTextActive]} numberOfLines={1}>
                  {TYPE_LABELS[t] || t}
                </Text>
                <Text style={[styles.tabCount, on && styles.tabCountActive]}>{n}</Text>
              </TouchableOpacity>
            );
          })}
        </Reanimated.ScrollView>
      </GestureDetector>

      {/* The filter-stepping swipe is only for the standalone route. Inside the
          Pavilion pager the parent Pan gesture owns horizontal drags, so
          attaching this here would fight it (a right-swipe would both step the
          filter back AND page to Rankings). */}
      <View style={{ flex: 1 }} {...(inline ? {} : swipe.panHandlers)}>
      {loading ? (
        <ScoutSkeleton DS={DS} />
      ) : (
        // No footer CTA: with listings on screen the FAB already carries posting,
        // and a card at the end of every scroll only repeated it. The empty state
        // keeps its own prompt — there the invitation is the point, not noise.
        <FlatList
          {...hideTabBar}
          data={visiblePosts}
          extraData={[connections, myId]}
          keyExtractor={i => i.id}
          renderItem={renderPost}
          contentContainerStyle={[styles.list, { paddingBottom: tabClear }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} colors={[DS.lime]} />}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListHeaderComponent={renderInbox()}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore
            ? <ActivityIndicator style={{ marginVertical: 20 }} color={DS.lime} />
            : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon
                name={activeType === 'all' ? 'telescope' : (TYPE_ICONS[activeType] || 'telescope')}
                size={44}
                color={DS.surfaceHighest}
              />
              <Text style={styles.emptyText}>
                {query.trim()
                  ? 'Nothing matches that search'
                  : activeType === 'all'
                    ? 'No listings yet'
                    : `No ${(TYPE_LABELS[activeType] || activeType).toLowerCase()} listings yet`}
              </Text>
              <Text style={styles.emptySubText}>
                {query.trim()
                  ? 'Try a shorter search, or clear it.'
                  : 'Post the first one and let people find you.'}
              </Text>
              {/* An empty category is a prompt, not a dead end — it's where the
                  next listing should come from. */}
              {!query.trim() && (
                <TouchableOpacity style={styles.emptyCta} onPress={openCreate} activeOpacity={0.85}>
                  <Icon name="plus" size={16} color={DS.onLime} />
                  <Text style={styles.emptyCtaText}>
                    {activeType === 'all' ? 'Post a listing' : `Post ${(TYPE_LABELS[activeType] || activeType).toLowerCase()}`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}
      </View>

      {/* ── LISTING DETAIL — everything the poster wrote, plus their number if
          they chose to share it. The row only has space for two lines of notes;
          this is where the rest lives. ── */}
      <BottomSheetModal
        ref={detailSheetRef}
        snapPoints={detailSnapPoints}
        enablePanDownToClose
        onDismiss={() => setDetailItem(null)}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{ backgroundColor: DS.textMuted }}
        backgroundStyle={{ backgroundColor: DS.surfaceLow }}>
        {detailItem && (() => {
          const lines = (detailItem.description || '').split('\n');
          const whenText = lines.find((l) => l.startsWith('When: '))?.slice(6);
          const notes = lines.filter((l) => !l.startsWith('When: ')).join('\n').trim();
          const isMine = detailItem.postedById && detailItem.postedById === myId;
          const phone = (detailItem.contactInfo || '').trim();
          const facts = [
            ['map-marker-outline', 'Where', detailItem.location],
            ['clock-outline', 'When', whenText],
            ['cricket', 'Format', detailItem.format],
            ['human', 'Age group', detailItem.ageGroup],
          ].filter(([, , v]) => !!v);

          return (
            <BottomSheetScrollView contentContainerStyle={styles.detailBody}>
              <View style={styles.detailHead}>
                {detailItem.posterName
                  ? <PlayerAvatar name={detailItem.posterName} avatarUrl={detailItem.posterAvatarUrl} size={44} />
                  : (
                    <View style={styles.rowIconAvatar}>
                      <Icon name={TYPE_ICONS[detailItem.type] || 'help-circle'} size={20} color={DS.lime} />
                    </View>
                  )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.detailPoster} numberOfLines={1}>
                    {isMine ? 'You' : (detailItem.posterName || 'Someone')}
                  </Text>
                  <Text style={styles.detailPosted}>
                    {[timeAgo(detailItem.createdAt), TYPE_LABELS[detailItem.type]].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>

              <Text style={styles.detailAsk}>{askFrom(detailItem)}</Text>

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

              {/* What they actually typed — the row can only show two lines. */}
              {!!notes && (
                <View style={styles.notesBox}>
                  <Text style={styles.notesLabel}>NOTES</Text>
                  <Text style={styles.notesText}>{notes}</Text>
                </View>
              )}

              {/* The number arrives from the server only when you're the poster or
                  they accepted you — so this renders the digits when they exist,
                  a note when they'll exist, and nothing at all when the poster
                  never offered one. */}
              {!phone && detailItem.contactShared && !isMine && (
                <View style={styles.contactLocked}>
                  <Icon name="lock-outline" size={16} color={DS.textMuted} />
                  <Text style={styles.contactLockedText}>Shares their number once they accept you</Text>
                </View>
              )}
              {!!phone && (
                <TouchableOpacity
                  style={styles.contactBox}
                  activeOpacity={0.85}
                  onPress={() => Linking.openURL(`tel:${phone.replace(/\s/g, '')}`).catch(() => showToast('No dialer available', 'error'))}>
                  <Icon name="phone-outline" size={18} color={DS.lime} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.contactLabel}>Shared their number</Text>
                    <Text style={styles.contactValue}>{phone}</Text>
                  </View>
                  <Icon name="chevron-right" size={20} color={DS.textMuted} />
                </TouchableOpacity>
              )}

              <View style={styles.detailAction}>{actionFor(detailItem, true)}</View>

              {isMine && (
                <View style={styles.ownerActions}>
                  <TouchableOpacity style={styles.ownerBtn} onPress={() => openEdit(detailItem)} activeOpacity={0.8}>
                    <Icon name="pencil-outline" size={15} color={DS.lime} />
                    <Text style={styles.editText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.ownerBtn} onPress={() => handleDelete(detailItem)} activeOpacity={0.8}>
                    <Icon name="trash-can-outline" size={15} color={DS.coral} />
                    <Text style={styles.deleteText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
            </BottomSheetScrollView>
          );
        })()}
      </BottomSheetModal>

      {/* Create Modal */}
      <BottomSheetModal
        ref={createSheetRef}
        snapPoints={createSnapPoints}
        enablePanDownToClose
        onDismiss={() => { setForm(INITIAL_FORM); setEditingId(null); }}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: DS.bg }}
        handleIndicatorStyle={{ backgroundColor: DS.faint }}
      >
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={styles.modalHeaderIcon}>
                  <Icon name="telescope" size={20} color={DS.blueDeep} />
                </View>
                <View>
                  <Text style={styles.modalTitle}>{editingId ? 'Edit Listing' : 'Post a Listing'}</Text>
                  <Text style={styles.modalSubtitle}>Let others know what you're looking for</Text>
                </View>
              </View>
              <TouchableOpacity onPress={closeCreate} style={styles.modalClose}>
                <Icon name="close" size={20} color={DS.textVariant} />
              </TouchableOpacity>
            </View>
            <BottomSheetScrollView contentContainerStyle={styles.modalBodyContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>What are you looking for?</Text>
              <View style={styles.typeRow}>
                {TYPES.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, form.type === t && styles.typeChipActive]}
                    onPress={() => setForm(f => ({ ...f, type: t, role: '' }))}
                  >
                    <Icon name={TYPE_ICONS[t]} size={14} color={form.type === t ? DS.onLime : DS.textVariant} />
                    <Text style={[styles.typeChipText, form.type === t && styles.typeChipTextActive]}>
                      {TYPE_LABELS[t] || t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {SUBTYPES[form.type] && (
                <>
                  <Text style={styles.fieldLabel}>{SUBTYPE_LABEL[form.type] || 'Type'}</Text>
                  <View style={styles.typeRow}>
                    {SUBTYPES[form.type].map(o => (
                      <TouchableOpacity key={o} style={[styles.optChip, form.role === o && styles.optChipActive]} onPress={() => setForm(f => ({ ...f, role: f.role === o ? '' : o }))}>
                        <Text style={[styles.optChipText, form.role === o && styles.optChipTextActive]}>{o}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <Text style={styles.fieldLabel}>Format</Text>
              <View style={styles.typeRow}>
                {FORMAT_OPTS.map(o => (
                  <TouchableOpacity key={o} style={[styles.optChip, form.format === o && styles.optChipActive]} onPress={() => setForm(f => ({ ...f, format: o }))}>
                    <Text style={[styles.optChipText, form.format === o && styles.optChipTextActive]}>{o}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Age Group</Text>
              <View style={styles.typeRow}>
                {AGE_OPTS.map(o => (
                  <TouchableOpacity key={o} style={[styles.optChip, form.ageGroup === o && styles.optChipActive]} onPress={() => setForm(f => ({ ...f, ageGroup: o }))}>
                    <Text style={[styles.optChipText, form.ageGroup === o && styles.optChipTextActive]}>{o}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Which days?</Text>
              <View style={styles.typeRow}>
                {DAYS.map(d => {
                  const on = form.days.includes(d);
                  const wknd = WEEKEND.includes(d);
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[styles.optChip, wknd && !on && styles.optChipWeekend, on && styles.optChipActive]}
                      onPress={() => setForm(f => ({ ...f, days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d] }))}
                    >
                      <Text style={[styles.optChipText, wknd && !on && styles.optChipTextWeekend, on && styles.optChipTextActive]}>{d}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Timing</Text>
              <View style={styles.typeRow}>
                {TIME_OPTS.map(o => (
                  <TouchableOpacity key={o} style={[styles.optChip, form.timing === o && styles.optChipActive]} onPress={() => setForm(f => ({ ...f, timing: f.timing === o ? '' : o }))}>
                    <Text style={[styles.optChipText, form.timing === o && styles.optChipTextActive]}>{o}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {form.timing === 'Custom' && (
                <View style={[styles.locWrap, { marginTop: 8 }]}>
                  <Icon name="clock-outline" size={18} color={DS.textMuted} />
                  <BottomSheetTextInput style={styles.locInput} placeholder="e.g. 5:30 PM" placeholderTextColor={DS.textMuted} value={form.customTime} onChangeText={v => setForm(f => ({ ...f, customTime: v }))} />
                </View>
              )}

              <Text style={styles.fieldLabel}>Location</Text>
              <View style={styles.locWrap}>
                <Icon name="map-marker-outline" size={18} color={DS.textMuted} />
                <BottomSheetTextInput style={styles.locInput} placeholder="Start typing your city…" placeholderTextColor={DS.textMuted} value={form.location} onChangeText={onLocationChange} autoCorrect={false} />
                {form.location.length > 0 && (
                  <TouchableOpacity onPress={() => { setForm(f => ({ ...f, location: '' })); setCitySuggest([]); }}>
                    <Icon name="close-circle" size={16} color={DS.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
              {citySuggest.length > 0 && (
                <View style={styles.suggestBox}>
                  {citySuggest.slice(0, 6).map((s, i) => (
                    <TouchableOpacity key={i} style={styles.suggestRow} onPress={() => pickCity(s)}>
                      <Icon name="map-marker-outline" size={16} color={DS.blueDeep} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.suggestCity}>{s.city}</Text>
                        <Text style={styles.suggestMeta}>{s.district}, {s.state} · {s.pincode}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.fieldLabel}>Notes</Text>
              <BottomSheetTextInput style={[styles.input, styles.textarea]} placeholder="Add any details — skills, timing, budget…" placeholderTextColor={DS.textMuted} multiline value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} />

              {!!myPhone && (
                <TouchableOpacity style={styles.contactToggle} onPress={() => setSharePhone(s => !s)} activeOpacity={0.8}>
                  <Icon name={sharePhone ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={sharePhone ? DS.lime : DS.textMuted} />
                  <Text style={styles.contactToggleText}>Share my number ({myPhone}) so people can connect</Text>
                </TouchableOpacity>
              )}

              <View style={styles.previewBox}>
                <Text style={styles.previewLabel}>POSTS AS</Text>
                <Text style={styles.previewTitle}>{buildTitle(form)}</Text>
              </View>

              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: P.control }, submitting && { opacity: 0.5 }]} onPress={handleCreate} disabled={submitting}>
                {submitting ? <ActivityIndicator color={DS.white} /> : (
                  <>
                    <Icon name="send" size={17} color={DS.white} />
                    <Text style={styles.submitText}>{editingId ? 'Save changes' : 'Post Listing'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </BottomSheetScrollView>
      </BottomSheetModal>
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },

  /* Brand bar */
  brandBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surfaceLow, paddingTop: 48, paddingBottom: 14, paddingHorizontal: 16 },
  // 40x40: a 22px icon with 4px padding was a 30px target, well under the 44pt
  // minimum and the easiest thing on the screen to miss.
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  brandText: { flex: 1, fontSize: 13, fontWeight: '800', letterSpacing: 2.5, color: DS.lime },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center' },

  /* Hero */
  hero: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: DS.bg },
  heroTitle: { fontSize: 20, fontWeight: '900', color: DS.textPrimary, letterSpacing: 0.5 },
  heroSubtitle: { fontSize: 12, color: DS.textMuted, marginTop: 2, lineHeight: 18 },

  /* Search — pill-shaped, prominent. */
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: DS.bg },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surfaceHigh, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderWidth: 1, borderColor: DS.border },
  createBtn: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  searchInput: { flex: 1, fontSize: 13, color: DS.textPrimary, padding: 0 },
  searchPlaceholder: { fontSize: 13, color: DS.textMuted },

  /* Filter chips — labelled + counted; the row scrolls under a self-driven Pan. */
  tabs: { backgroundColor: DS.bg, flexGrow: 0, flexShrink: 0 },
  tabsContent: { paddingHorizontal: 14, paddingVertical: 6, gap: 6, alignItems: 'center' },
  // Filter chip, form type chip and form option chip are the same control doing
  // the same job — pick one of a set. They had three different radii (999 vs 20)
  // and three paddings. Same geometry now; only the copy differs.
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, minHeight: 32, borderRadius: 999,
    borderWidth: 1, borderColor: DS.faint, backgroundColor: DS.surfaceHigh,
  },
  tabActive: { backgroundColor: DS.lime, borderColor: DS.lime },
  // Zero listings: still there, still tappable, just visibly quieter.
  tabEmpty: { opacity: 0.45 },
  tabText: { fontSize: 12, color: DS.textVariant, fontWeight: '600', includeFontPadding: false },
  tabTextActive: { color: DS.onLime, fontWeight: '800' },
  tabCount: { fontSize: 11, color: DS.textMuted, fontWeight: '800', includeFontPadding: false },
  tabCountActive: { color: DS.onLime, opacity: 0.75 },

  /* List — bordered rows, not floating cards: ~5 listings a screen instead of 2. */
  list: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 28 },
  sep: { height: 1, backgroundColor: DS.faint, marginLeft: 50 },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 12 },
  rowIconAvatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: DS.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  // The ask, with the "Looking for a…" boilerplate stripped — the one line worth reading.
  rowAsk: { fontSize: 15, fontWeight: '700', color: DS.textPrimary, letterSpacing: -0.2 },
  rowWho: { fontSize: 12, color: DS.textVariant, fontWeight: '500' },
  rowMeta: { fontSize: 11, color: DS.textMuted, fontWeight: '500' },
  rowNote: { fontSize: 12, color: DS.textVariant, marginTop: 3, lineHeight: 16 },

  /* One action per row, right-aligned so they form a single scannable column.
     The three variants below carry IDENTICAL geometry on purpose — a row whose
     state is Connect, Mark filled or Filled must occupy exactly the same box, or
     the right edge ragged-steps down the list and the column stops reading as a
     column. Height is fixed rather than padding-derived because RN counts border
     inside the box, so the 1px-bordered variants would otherwise sit taller. */
  rowCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    minWidth: 96, height: 34, borderRadius: 8, paddingHorizontal: 10, alignSelf: 'center',
    // Near-black primary (pav().control, applied inline — it's theme-derived).
    // The green accent already carries selected chips, avatar initials, ghost
    // buttons and the empty-state CTA; a green Connect on every row turned the
    // list into a green stripe and left the accent meaning nothing.
    borderWidth: 1, borderColor: DS.faint,
  },
  rowCtaText: { fontSize: 11.5, fontWeight: '800' },
  rowGhostBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    minWidth: 96, height: 34, borderRadius: 8, paddingHorizontal: 10, alignSelf: 'center',
    borderWidth: 1.5, borderColor: DS.lime,
  },
  rowGhostText: { fontSize: 11.5, fontWeight: '800', color: DS.lime },
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
  contactValue: { fontSize: 15, fontWeight: '800', color: DS.textPrimary, marginTop: 2 },

  detailAction: { marginTop: 4, alignItems: 'stretch' },
  ownerActions: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  ownerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 16 },
  editText: { fontSize: 13, fontWeight: '800', color: DS.lime },
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
  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 32 },
  emptyText: { fontSize: 16, fontWeight: '700', color: DS.textVariant, marginTop: 12 },
  emptySubText: { fontSize: 13, color: DS.textMuted, marginTop: 4, textAlign: 'center' },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16,
    backgroundColor: DS.lime, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10,
  },
  emptyCtaText: { fontSize: 13, fontWeight: '800', color: DS.onLime },

  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: DS.overlay, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: DS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  grabHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: DS.faint, marginTop: 10, marginBottom: 4 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: DS.faint },
  modalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  modalHeaderIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: DS.blueDeep + '18', alignItems: 'center', justifyContent: 'center' },
  modalSubtitle: { fontSize: 12, color: DS.textMuted, marginTop: 2 },
  modalClose: { width: 34, height: 34, borderRadius: 17, backgroundColor: DS.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: DS.textPrimary },
  modalBody: { paddingHorizontal: 16, paddingTop: 8 },
  modalBodyContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: DS.textMuted, marginBottom: 6, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: DS.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: DS.textPrimary, borderWidth: 1, borderColor: DS.faint },
  textarea: { height: 80, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  typeChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, minHeight: 32, borderRadius: 999, backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.faint },
  typeChipActive: { backgroundColor: DS.lime, borderColor: DS.lime },
  typeChipText: { fontSize: 12, color: DS.textVariant, fontWeight: '700' },
  typeChipTextActive: { color: DS.onLime },
  optChip: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 7, minHeight: 32, borderRadius: 999, backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.faint },
  // DS.white on the accent green was ~2.2:1 — the selected format/age/day chips
  // were near-unreadable. DS.onLime is the dark ink the theme ships for exactly
  // this fill (~8.45:1), and it's what the filter and type chips already use.
  optChipActive: { backgroundColor: DS.lime, borderColor: DS.lime },
  optChipText: { fontSize: 12, color: DS.textVariant, fontWeight: '700' },
  optChipTextActive: { color: DS.onLime, fontWeight: '800' },
  optChipWeekend: { backgroundColor: DS.lime + '18', borderColor: DS.lime },
  optChipTextWeekend: { color: DS.lime2, fontWeight: '800' },
  locWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: DS.surface, borderRadius: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: DS.faint },
  locInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: DS.textPrimary },
  suggestBox: { marginTop: 6, backgroundColor: DS.surface, borderRadius: 12, borderWidth: 1, borderColor: DS.faint, overflow: 'hidden' },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: DS.faint },
  suggestCity: { fontSize: 14, fontWeight: '700', color: DS.textPrimary },
  suggestMeta: { fontSize: 11, color: DS.textMuted, marginTop: 1 },
  contactToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, paddingVertical: 4 },
  contactToggleText: { flex: 1, fontSize: 13, color: DS.textVariant, fontWeight: '600', lineHeight: 18 },
  previewBox: { marginTop: 18, backgroundColor: DS.blueDeep + '10', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: DS.blueDeep + '22' },
  previewLabel: { fontSize: 10, fontWeight: '800', color: DS.blueDeep, letterSpacing: 1 },
  previewTitle: { fontSize: 15, fontWeight: '800', color: DS.textPrimary, marginTop: 4 },
  row: { flexDirection: 'row' },
  // Same role as Connect — the primary commit — so the same near-black
  // treatment (fill applied inline from pav().control). Was DS.blueDeep, which
  // the theme folds to the accent green, and it cast a green shadow to match.
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    margin: 16, borderRadius: 14, paddingVertical: 16,
    borderWidth: 1, borderColor: DS.faint,
  },
  submitText: { fontSize: 15, fontWeight: '800', color: DS.white, letterSpacing: 0.5 },
});
