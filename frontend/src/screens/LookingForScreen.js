import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, ScrollView, ActivityIndicator, RefreshControl, Animated, PanResponder
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport } from '../utils/selectedSport';
import { useCurrentUser } from '../utils/currentUser';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import BrandLogo from "../components/BrandLogo";

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

const makeTypeChipColors = (DS) => ({
  player: DS.lime,
  team: DS.blue,
  umpire: DS.lime,
  scorer: DS.blue,
  coach: DS.lime,
});

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

// "Days" + "Timing" read as a short human phrase, e.g. "Sat, Sun · 6:00 AM".
const buildWhen = (form) => {
  const parts = [];
  if (form.days?.length) parts.push(form.days.join(', '));
  const t = form.timing === 'Custom' ? (form.customTime || '').trim() : form.timing;
  if (t) parts.push(t);
  return parts.join(' · ');
};

export default function LookingForScreen({ navigation, route, inline }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const TYPE_CHIP_COLORS = makeTypeChipColors(DS);
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
  const filterRowRef = useRef(null);
  const stepFilter = useCallback((dir) => {
    const idx = FILTER_TYPES.indexOf(activeTypeRef.current);
    const next = idx + dir;
    if (next < 0 || next >= FILTER_TYPES.length) return;
    setActiveType(FILTER_TYPES[next]);
    // Keep the active chip visible in the horizontal filter row.
    filterRowRef.current?.scrollTo({ x: Math.max(0, next * 64 - 48), animated: true });
  }, []);
  const swipe = useRef(PanResponder.create({
    // Only claim clearly-horizontal drags; vertical drags fall through to the list.
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
    onPanResponderRelease: (_, g) => {
      if (g.dx <= -45) stepFilter(1);        // swipe left → next filter
      else if (g.dx >= 45) stepFilter(-1);   // swipe right → previous filter
    },
  })).current;
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [myPhone, setMyPhone] = useState('');
  const [sharePhone, setSharePhone] = useState(true);

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

  const load = useCallback(async (type) => {
    const filters = {};
    if (type && type !== 'all') filters.type = type;
    if (sportFilter) filters.sport = sportFilter;
    const res = await legendsApi.getLookingForPosts(filters);
    if (res.success) setPosts(res.data);
  }, [sportFilter]);

  const loadConnections = useCallback(async () => {
    const res = await legendsApi.getLookingForConnections();
    if (res.success) setConnections(res.data);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([load(activeType), loadConnections()]).finally(() => setLoading(false));
  }, [activeType, load, loadConnections]);

  // Connection lookups per listing.
  const myReqFor = (listingId) => connections.find((c) => c.listingId === listingId && c.requesterId === myId);
  const reqsForMyListing = (listingId) => connections.filter((c) => c.listingId === listingId && c.posterId === myId);

  const handleConnect = async (postId) => {
    const res = await legendsApi.connectLookingFor(postId);
    if (res.success) loadConnections();
  };
  const handleRespond = async (connId, action) => {
    const res = await legendsApi.respondLookingForConnection(connId, action);
    if (res.success) loadConnections();
  };
  const openChat = (chatRoomId, name) => {
    if (chatRoomId) navigation.navigate('Chat', { chatId: chatRoomId, chatName: name || 'Chat' });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(activeType), loadConnections()]);
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
    const res = await legendsApi.createLookingFor(payload);
    setSubmitting(false);
    if (res.success) {
      setShowCreate(false);
      setForm(INITIAL_FORM);
      load(activeType);
    }
  };

  const handleClose = async (postId) => {
    await legendsApi.updateLookingFor(postId, 'closed');
    load(activeType);
  };

  // Client-side search across the loaded listings.
  const visiblePosts = posts.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [p.title, p.description, p.location, p.format, p.type].join(' ').toLowerCase().includes(q);
  });

  const renderPost = ({ item }) => {
    const chipColor = TYPE_CHIP_COLORS[item.type] || DS.lime;
    // Pull the "When:" line back out so it can render as its own clock meta.
    const descLines = (item.description || '').split('\n');
    const whenText = descLines.find((l) => l.startsWith('When: '))?.slice(6);
    const bodyDesc = descLines.filter((l) => !l.startsWith('When: ')).join('\n').trim();
    return (
      <View style={styles.card}>
        {/* Rich header area */}
        <View style={[styles.cardImageArea, { backgroundColor: chipColor + '15' }]}>
          <Icon name={TYPE_ICONS[item.type] || 'help-circle-outline'} size={64} color={chipColor + '20'} style={{ position: 'absolute', right: -10, bottom: -15, transform: [{ rotate: '-15deg' }] }} />
          <View style={{ position: 'absolute', top: 12, left: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: chipColor + '30', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={TYPE_ICONS[item.type] || 'help-circle'} size={20} color={chipColor} />
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <View style={[styles.typeBadge, { backgroundColor: chipColor + '22', borderColor: chipColor }]}>
              <Text style={[styles.typeText, { color: chipColor }]}>{item.type?.toUpperCase()}</Text>
            </View>
            {item.status === 'open' ? (
              <TouchableOpacity onPress={() => handleClose(item.id)} style={styles.closeBtn}>
                <Icon name="check-circle-outline" size={16} color={DS.success} />
                <Text style={styles.closeBtnText}>Mark Filled</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.filledBadge}>
                <Icon name="check-circle" size={14} color={DS.textMuted} />
                <Text style={styles.filledBadgeText}>FILLED</Text>
              </View>
            )}
          </View>

          <Text style={styles.cardTitle}>{item.title}</Text>
          {!!bodyDesc && <Text style={styles.cardDesc}>{bodyDesc}</Text>}

          <View style={styles.cardMeta}>
            {!!whenText && (
              <View style={styles.metaItem}>
                <Icon name="clock-outline" size={13} color={DS.blueDeep} />
                <Text style={[styles.metaText, { color: DS.blueDeep, fontWeight: '700' }]}>{whenText}</Text>
              </View>
            )}
            {!!item.location && (
              <View style={styles.metaItem}>
                <Icon name="map-marker" size={13} color={DS.textMuted} />
                <Text style={styles.metaText}>{item.location}</Text>
              </View>
            )}
            {!!item.format && (
              <View style={styles.metaItem}>
                <Icon name="cricket" size={13} color={DS.textMuted} />
                <Text style={styles.metaText}>{item.format}</Text>
              </View>
            )}
            {!!item.ageGroup && (
              <View style={styles.metaItem}>
                <Icon name="human" size={13} color={DS.textMuted} />
                <Text style={styles.metaText}>{item.ageGroup}</Text>
              </View>
            )}
          </View>

          {(() => {
            const isMine = item.postedById && item.postedById === myId;
            if (isMine) {
              const reqs = reqsForMyListing(item.id);
              const isClosed = item.status !== 'open';
              const pending = isClosed ? [] : reqs.filter((r) => r.status === 'pending');
              const accepted = reqs.filter((r) => r.status === 'accepted');
              if (pending.length === 0 && accepted.length === 0) {
                return <Text style={styles.noReq}>{isClosed ? 'Filled — no active connections' : 'No connect requests yet'}</Text>;
              }
              return (
                <View style={{ gap: 8 }}>
                  {pending.map((r) => (
                    <View key={r.id} style={styles.reqRow}>
                      <Icon name="account-clock-outline" size={18} color={DS.blueDeep} />
                      <Text style={styles.reqName} numberOfLines={1}>{r.requesterName} wants to connect</Text>
                      <TouchableOpacity style={styles.acceptBtn} onPress={() => handleRespond(r.id, 'accept')}>
                        <Text style={styles.acceptBtnText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.declineBtn} onPress={() => handleRespond(r.id, 'decline')}>
                        <Icon name="close" size={16} color={DS.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {accepted.map((r) => (
                    <TouchableOpacity key={r.id} style={styles.chatBtn} onPress={() => openChat(r.chatRoomId, r.requesterName)}>
                      <Icon name="chat-outline" size={16} color={DS.white} />
                      <Text style={styles.chatBtnText}>Chat with {r.requesterName}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            }
            if (!item.postedById) return null;
            const myReq = myReqFor(item.id);
            if (myReq?.status === 'accepted') {
              return (
                <TouchableOpacity style={styles.chatBtn} onPress={() => openChat(myReq.chatRoomId, item.posterName || 'Poster')}>
                  <Icon name="chat-outline" size={16} color={DS.white} />
                  <Text style={styles.chatBtnText}>Chat</Text>
                </TouchableOpacity>
              );
            }
            if (myReq?.status === 'pending') {
              return (
                <View style={styles.requestedBtn}>
                  <Icon name="clock-outline" size={15} color={DS.textMuted} />
                  <Text style={styles.requestedText}>Request sent · waiting to accept</Text>
                </View>
              );
            }
            if (myReq?.status === 'declined') {
              return <View style={styles.requestedBtn}><Text style={styles.requestedText}>Request declined</Text></View>;
            }
            return (
              <TouchableOpacity style={styles.connectBtn} onPress={() => handleConnect(item.id)}>
                <Icon name="account-plus-outline" size={16} color={DS.white} />
                <Text style={styles.connectBtnText}>CONNECT</Text>
              </TouchableOpacity>
            );
          })()}
        </View>
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
          <TouchableOpacity onPress={() => setShowCreate(true)} style={styles.addBtn}>
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

      {/* Search bar + create */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Icon name="magnify" size={20} color={DS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search listings..."
            placeholderTextColor={DS.textMuted}
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Icon name="close-circle" size={16} color={DS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(true)} activeOpacity={0.85}>
          <Icon name="plus" size={24} color={DS.white} />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <ScrollView ref={filterRowRef} horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent}>
        {FILTER_TYPES.map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, activeType === t && styles.tabActive]}
            onPress={() => setActiveType(t)}
          >
            {/* X-style: only the selected filter shows its name (green + underline). */}
            <Icon name={TYPE_ICONS[t]} size={16} color={activeType === t ? DS.lime : DS.textMuted} />
            {activeType === t &&
              <Text style={styles.tabTextActive}>{TYPE_LABELS[t] || t}</Text>}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={{ flex: 1 }} {...swipe.panHandlers}>
      {loading ? (
        <ScoutSkeleton DS={DS} />
      ) : (
        <FlatList
          data={visiblePosts}
          extraData={[connections, myId]}
          keyExtractor={i => i.id}
          renderItem={renderPost}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} colors={[DS.lime]} />}
          ListFooterComponent={
            <TouchableOpacity style={styles.ctaCard} onPress={() => setShowCreate(true)} activeOpacity={0.8}>
              <View style={styles.ctaAccent} />
              <View style={styles.ctaContent}>
                <Icon name="plus-circle-outline" size={24} color={DS.lime} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.ctaTitle}>Post your own listing</Text>
                  <Text style={styles.ctaDesc}>Let others know what you're looking for</Text>
                </View>
                <Icon name="chevron-right" size={22} color={DS.textMuted} />
              </View>
            </TouchableOpacity>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="telescope" size={48} color={DS.surfaceHighest} />
              <Text style={styles.emptyText}>No posts yet</Text>
              <Text style={styles.emptySubText}>Be the first to post a listing</Text>
            </View>
          }
        />
      )}
      </View>

      {/* Create Modal */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.grabHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={styles.modalHeaderIcon}>
                  <Icon name="telescope" size={20} color={DS.blueDeep} />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Post a Listing</Text>
                  <Text style={styles.modalSubtitle}>Let others know what you're looking for</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => { setShowCreate(false); setForm(INITIAL_FORM); }} style={styles.modalClose}>
                <Icon name="close" size={20} color={DS.textVariant} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
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
                  <TextInput style={styles.locInput} placeholder="e.g. 5:30 PM" placeholderTextColor={DS.textMuted} value={form.customTime} onChangeText={v => setForm(f => ({ ...f, customTime: v }))} />
                </View>
              )}

              <Text style={styles.fieldLabel}>Location</Text>
              <View style={styles.locWrap}>
                <Icon name="map-marker-outline" size={18} color={DS.textMuted} />
                <TextInput style={styles.locInput} placeholder="Start typing your city…" placeholderTextColor={DS.textMuted} value={form.location} onChangeText={onLocationChange} autoCorrect={false} />
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
              <TextInput style={[styles.input, styles.textarea]} placeholder="Add any details — skills, timing, budget…" placeholderTextColor={DS.textMuted} multiline value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} />

              {!!myPhone && (
                <TouchableOpacity style={styles.contactToggle} onPress={() => setSharePhone(s => !s)} activeOpacity={0.8}>
                  <Icon name={sharePhone ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={sharePhone ? DS.blueDeep : DS.textMuted} />
                  <Text style={styles.contactToggleText}>Share my number ({myPhone}) so people can connect</Text>
                </TouchableOpacity>
              )}

              <View style={styles.previewBox}>
                <Text style={styles.previewLabel}>POSTS AS</Text>
                <Text style={styles.previewTitle}>{buildTitle(form)}</Text>
              </View>
            </ScrollView>
            <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.5 }]} onPress={handleCreate} disabled={submitting}>
              {submitting ? <ActivityIndicator color={DS.white} /> : (
                <>
                  <Icon name="send" size={17} color={DS.white} />
                  <Text style={styles.submitText}>Post Listing</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },

  /* Brand bar */
  brandBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surfaceLow, paddingTop: 48, paddingBottom: 14, paddingHorizontal: 16 },
  backBtn: { padding: 4, marginRight: 10 },
  brandText: { flex: 1, fontSize: 13, fontWeight: '800', letterSpacing: 2.5, color: DS.lime },
  addBtn: { backgroundColor: DS.lime, borderRadius: 20, padding: 6 },

  /* Hero */
  hero: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6, backgroundColor: DS.bg },
  heroTitle: { fontSize: 24, fontWeight: '900', color: DS.textPrimary, letterSpacing: 0.5 },
  heroSubtitle: { fontSize: 13, color: DS.textMuted, marginTop: 4, lineHeight: 20 },

  /* Search */
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: DS.bg },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 8, borderWidth: 1, borderColor: DS.faint },
  createBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: DS.blueDeep, alignItems: 'center', justifyContent: 'center', shadowColor: DS.blueDeep, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  searchInput: { flex: 1, fontSize: 14, color: DS.textPrimary, padding: 0 },
  searchPlaceholder: { fontSize: 14, color: DS.textMuted },

  /* Filter tabs */
  tabs: { backgroundColor: DS.bg, flexGrow: 0, flexShrink: 0 },
  tabsContent: { paddingHorizontal: 12, paddingVertical: 4, gap: 4, alignItems: 'center' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: DS.lime },
  tabTextActive: { fontSize: 12, color: DS.lime, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, includeFontPadding: false },

  /* List */
  list: { padding: 16, gap: 10, paddingBottom: 28 },

  /* Card */
  card: { backgroundColor: DS.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: DS.faint, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  cardImageArea: { height: 40, overflow: "hidden" },
  cardBody: { padding: 12, paddingTop: 10 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  typeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  closeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  closeBtnText: { fontSize: 11, color: DS.success, fontWeight: '700' },
  filledBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: DS.surfaceHigh, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: DS.faint },
  filledBadgeText: { fontSize: 10, color: DS.textMuted, fontWeight: '800', letterSpacing: 0.8 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: DS.textPrimary, marginBottom: 3 },
  cardDesc: { fontSize: 13, color: DS.textVariant, marginBottom: 8, lineHeight: 18 },
  cardMeta: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: DS.textMuted },
  connectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: DS.blueDeep, borderRadius: 10, paddingVertical: 9, marginTop: 2 },
  connectBtnText: { fontSize: 13, fontWeight: '800', color: DS.white, letterSpacing: 1 },
  chatBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: DS.blueDeep, borderRadius: 10, paddingVertical: 12 },
  chatBtnText: { fontSize: 13, fontWeight: '800', color: DS.white, letterSpacing: 0.5 },
  requestedBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: DS.surfaceHigh, borderRadius: 10, paddingVertical: 11, borderWidth: 1, borderColor: DS.faint },
  requestedText: { fontSize: 12, fontWeight: '700', color: DS.textMuted },
  noReq: { fontSize: 12, color: DS.textMuted, fontStyle: 'italic', paddingVertical: 6 },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: DS.surfaceHigh, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: DS.faint },
  reqName: { flex: 1, fontSize: 13, fontWeight: '700', color: DS.textPrimary },
  acceptBtn: { backgroundColor: DS.blueDeep, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  acceptBtnText: { fontSize: 12, fontWeight: '800', color: DS.white },
  declineBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: DS.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: DS.faint },

  /* CTA card */
  ctaCard: { backgroundColor: DS.surface, borderRadius: 16, overflow: 'hidden', marginTop: 6, borderWidth: 1, borderColor: DS.faint },
  ctaAccent: { height: 3, backgroundColor: DS.lime },
  ctaContent: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  ctaTitle: { fontSize: 15, fontWeight: '700', color: DS.textPrimary },
  ctaDesc: { fontSize: 12, color: DS.textMuted, marginTop: 2 },

  /* Empty */
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 18, fontWeight: '700', color: DS.textVariant, marginTop: 12 },
  emptySubText: { fontSize: 13, color: DS.textMuted, marginTop: 4 },

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
  fieldLabel: { fontSize: 12, fontWeight: '700', color: DS.textMuted, marginBottom: 6, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: DS.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: DS.textPrimary, borderWidth: 1, borderColor: DS.faint },
  textarea: { height: 80, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.faint },
  typeChipActive: { backgroundColor: DS.lime, borderColor: DS.lime },
  typeChipText: { fontSize: 12, color: DS.textVariant, fontWeight: '700' },
  typeChipTextActive: { color: DS.onLime },
  optChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.faint },
  optChipActive: { backgroundColor: DS.blueDeep, borderColor: DS.blueDeep },
  optChipText: { fontSize: 12, color: DS.textVariant, fontWeight: '700' },
  optChipTextActive: { color: DS.white },
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
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 16, backgroundColor: DS.blueDeep, borderRadius: 14, paddingVertical: 16, shadowColor: DS.blueDeep, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  submitText: { fontSize: 15, fontWeight: '800', color: DS.white, letterSpacing: 0.5 },
});
