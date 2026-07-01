import { useTheme, useThemedStyles } from "../theme/ThemeContext"; // CricketFeedScreen — the cricket landing page.
// An Instagram-style feed of posts shared by players on the app (like /
// comment / share), preceded by a horizontally-scrolled "From Your Circle"
// rail: recent matches of teams the user played for, or friends' teams.
//
// Dark "Kinetic Athlete" palette, consistent with the rest of MainApp.
// Data is mock — wire posts/matches to real sources when available.

import { useState, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList,
  StatusBar, Dimensions, Animated, Modal, TextInput, Share, RefreshControl,
  KeyboardAvoidingView, Platform, ActivityIndicator } from
'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import MomentumMeter from '../components/MomentumMeter';
import { haptic } from '../utils/haptics';

const { width: SW } = Dimensions.get('window');

// ── helpers (map real API data → the feed's render shapes) ──────────────────
const sideName = (t) => (typeof t === 'object' ? (t?.name || 'Team') : String(t || 'Team'));
const initials = (n) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const AV_COLORS = ['#2d7a3a', '#1a5fa8', '#7c3aed', '#b45309', '#b91c1c', '#0d7c8f', '#c2490d'];
const colorFor = (s) => AV_COLORS[((s || '?').charCodeAt(0) || 0) % AV_COLORS.length];
const timeAgo = (iso) => {
  if (!iso) return '';
  const sec = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  for (const [label, s] of [['y', 31536000], ['mo', 2592000], ['d', 86400], ['h', 3600], ['m', 60]])
    if (sec >= s) return `${Math.floor(sec / s)}${label} ago`;
  return 'just now';
};
















// ── Small building blocks ───────────────────────────────────────────────────
function Avatar({ initial, color, size = 40, ring = false }) {const DS = useTheme().colors;
  return (
    <View style={[
    { width: size, height: size, borderRadius: size / 2, backgroundColor: color,
      alignItems: 'center', justifyContent: 'center' },
    ring && { borderWidth: 2, borderColor: DS.lime }]
    }>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.4 }}>{initial}</Text>
    </View>);

}

function CircleMatchCard({ match, onPress }) {const DS = useTheme().colors;const c = useThemedStyles(makeC);
  const tagColor = match.tag === 'You played' ? DS.lime : DS.blue;
  return (
    <TouchableOpacity activeOpacity={0.85} style={c.card} onPress={onPress}>
      <View style={c.cardTop}>
        <View style={[c.tagPill, { backgroundColor: tagColor + '22', borderColor: tagColor + '55' }]}>
          <Text style={[c.tagTxt, { color: tagColor }]}>{match.tag.toUpperCase()}</Text>
        </View>
        {match.live ?
        <View style={c.liveRow}>
            <View style={c.liveDot} />
            <Text style={c.liveTxt}>LIVE</Text>
          </View> :

        <Text style={c.whenTxt}>{match.when}</Text>
        }
      </View>

      {[match.a, match.b].map((t, i) =>
      <View key={i} style={c.teamRow}>
          <View style={[c.teamBadge, { backgroundColor: t.color }]}>
            <Text style={c.teamBadgeTxt}>{t.short}</Text>
          </View>
          <Text style={c.teamName} numberOfLines={1}>{t.name}</Text>
          <Text style={c.teamScore}>{t.score}{t.overs ? `  (${t.overs})` : ''}</Text>
        </View>
      )}

      {match.live && (
        <View style={{ marginTop: 10 }}>
          <MomentumMeter
            a={Number(String(match.a.score).replace(/[^\d.]/g, '')) || 0}
            b={Number(String(match.b.score).replace(/[^\d.]/g, '')) || 0}
            leftLabel={match.a.short}
            rightLabel={match.b.short}
            height={6}
            showLabels={false}
          />
        </View>
      )}

      <View style={c.cardDivider} />
      <Text style={c.resultTxt} numberOfLines={1}>{match.result}</Text>
    </TouchableOpacity>);

}

function PostMedia({ kind, media }) {const DS = useTheme().colors;const c = useThemedStyles(makeC);const m = useThemedStyles(makeM);
  if (!media) return null;   // real text posts carry no rich media
  if (kind === 'milestone') {
    return (
      <View style={[m.wrap, { backgroundColor: '#13351f' }]}>
        <View style={m.glow} />
        <Text style={[m.smallLabel, { color: DS.onDarkDim }]}>{media.sub}</Text>
        <View style={m.bigRow}>
          <Text style={[m.bigNum, { color: DS.onDark }]}>{media.value}</Text>
          <Text style={m.bigBalls}>({media.balls})</Text>
        </View>
        <View style={m.metaRow}>
          <Icon name={media.icon} size={14} color={DS.lime} />
          <Text style={[m.metaTxt, { color: DS.onDarkDim }]}>{media.meta}</Text>
        </View>
      </View>);

  }
  if (kind === 'result') {
    return (
      <View style={[m.wrap, { backgroundColor: DS.surfaceHigh }]}>
        <Text style={[m.smallLabel, { color: DS.lime }]}>{media.title}</Text>
        <View style={m.resultTeams}>
          {[media.a, media.b].map((t, i) =>
          <View key={i} style={m.resultTeam}>
              <View style={[c.teamBadge, { backgroundColor: t.color, width: 40, height: 40, borderRadius: 12 }]}>
                <Text style={[c.teamBadgeTxt, { fontSize: 14 }]}>{t.short}</Text>
              </View>
              <Text style={m.resultScore}>{t.score}</Text>
              <Text style={m.resultName}>{t.name}</Text>
            </View>
          )}
          <Text style={m.vs}>VS</Text>
        </View>
        <Text style={m.metaTxt}>{media.meta}</Text>
      </View>);

  }
  // photo / generic highlight
  return (
    <View style={[m.wrap, { backgroundColor: (media.tint || DS.surfaceHigh) + '26', alignItems: 'center' }]}>
      <View style={[m.photoIcon, { backgroundColor: (media.tint || DS.lime) + '33' }]}>
        <Icon name={media.icon} size={40} color={media.tint || DS.lime} />
      </View>
      <Text style={[m.smallLabel, { marginTop: 12 }]}>{media.label}</Text>
      <Text style={m.metaTxt}>{media.sub}</Text>
    </View>);

}

function PostCard({ post, onLike, onShare, onComment }) {const DS = useTheme().colors;const p = useThemedStyles(makeP);
  const popRef = useRef(new Animated.Value(1)).current;

  const handleLike = () => {
    onLike(post.id);
    if (!post.liked) {
      popRef.setValue(0.6);
      Animated.spring(popRef, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }).start();
    }
  };

  return (
    <View style={p.card}>
      {/* header */}
      <View style={p.header}>
        <Avatar initial={post.author.initial} color={post.author.color} size={42} ring />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={p.nameRow}>
            <Text style={p.name}>{post.author.name}</Text>
            {post.author.verified && <Icon name="check-decagram" size={14} color={DS.lime} style={{ marginLeft: 4 }} />}
          </View>
          <Text style={p.sub}>{post.author.team}</Text>
        </View>
        <TouchableOpacity hitSlop={8}>
          <Icon name="dots-horizontal" size={22} color={DS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* media */}
      <PostMedia kind={post.kind} media={post.media} />

      {/* actions */}
      <View style={p.actions}>
        <TouchableOpacity onPress={handleLike} hitSlop={8} style={p.actionBtn} activeOpacity={0.7}>
          <Animated.View style={{ transform: [{ scale: popRef }] }}>
            <Icon name={post.liked ? 'heart' : 'heart-outline'} size={26} color={post.liked ? DS.live : DS.textPrimary} />
          </Animated.View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onComment(post)} hitSlop={8} style={p.actionBtn} activeOpacity={0.7}>
          <Icon name="comment-outline" size={24} color={DS.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onShare(post)} hitSlop={8} style={p.actionBtn} activeOpacity={0.7}>
          <Icon name="share-outline" size={25} color={DS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity hitSlop={8} activeOpacity={0.7}>
          <Icon name="bookmark-outline" size={24} color={DS.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* likes */}
      {post.likes > 0 &&
        <Text style={p.likes}>
          {post.likedBy
            ? <>Liked by <Text style={p.bold}>{post.likedBy}</Text> and <Text style={p.bold}>{(post.likes - 1).toLocaleString()} others</Text></>
            : <Text style={p.bold}>{post.likes.toLocaleString()} {post.likes === 1 ? 'like' : 'likes'}</Text>}
        </Text>
      }

      {/* caption */}
      <Text style={p.caption}>
        <Text style={p.bold}>{post.author.handle.replace('@', '')} </Text>
        {post.caption}
      </Text>

      {/* comments preview */}
      {(post.commentCount || post.comments.length) > 0 &&
      <TouchableOpacity onPress={() => onComment(post)} activeOpacity={0.7}>
          <Text style={p.viewComments}>View all {post.commentCount || post.comments.length} comments</Text>
        </TouchableOpacity>
      }

      <Text style={p.time}>{post.time}</Text>
    </View>);

}

// ── Comments bottom sheet ───────────────────────────────────────────────────
function CommentsSheet({ post, onClose, onAdd }) {const DS = useTheme().colors;const cm = useThemedStyles(makeCm);
  const [text, setText] = useState('');
  if (!post) return null;
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onAdd(post.id, t);
    setText('');
  };
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={cm.backdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={cm.sheet}>
            <View style={cm.grab} />
            <Text style={cm.title}>Comments</Text>
            <FlatList
              data={post.comments}
              keyExtractor={(it) => it.id}
              style={{ maxHeight: 320 }}
              ListEmptyComponent={<Text style={cm.empty}>No comments yet. Be the first.</Text>}
              renderItem={({ item }) =>
              <View style={cm.commentRow}>
                  <Avatar initial={item.user[0].toUpperCase()} color={item.color || DS.surfaceHighest} size={34} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={cm.commentUser}>{item.user}</Text>
                    <Text style={cm.commentTxt}>{item.text}</Text>
                  </View>
                  <Icon name="heart-outline" size={16} color={DS.textMuted} />
                </View>
              } />
            
            <View style={cm.inputRow}>
              <TextInput
                style={cm.input}
                placeholder="Add a comment…"
                placeholderTextColor={DS.textMuted}
                value={text}
                onChangeText={setText}
                onSubmitEditing={submit}
                returnKeyType="send" />
              
              <TouchableOpacity onPress={submit} disabled={!text.trim()}>
                <Text style={[cm.post, { opacity: text.trim() ? 1 : 0.4 }]}>Post</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>);

}

// ── Screen ──────────────────────────────────────────────────────────────────
export default function CricketFeedScreen({ navigation }) {const { colors: DS, isDark } = useTheme();const s = useThemedStyles(makeS);
  const [posts, setPosts] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activePost, setActivePost] = useState(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [posting, setPosting] = useState(false);
  const likedRef = useRef({});   // one like per session per post

  const mapPost = useCallback((po) => ({
    id: po.id,
    author: {
      name: po.authorName || 'Player',
      handle: '@' + (po.authorName || 'player').toLowerCase().replace(/\s+/g, '_'),
      team: po.team || '',
      color: colorFor(po.authorName),
      initial: (po.authorName || 'P').charAt(0).toUpperCase(),
      verified: false,
    },
    time: timeAgo(po.createdAt),
    kind: 'text', media: null,
    caption: po.text || '',
    likedBy: null,
    likes: po.likes || 0,
    liked: false,
    comments: [],
    commentCount: po.commentCount || 0,
  }), []);

  const mapMatch = useCallback((m) => ({
    id: m.id,
    tag: m.status === 'live' ? 'Live' : 'Match',
    live: m.status === 'live',
    when: m.status === 'live' ? '' : timeAgo(m.createdAt),
    a: { name: sideName(m.team1), short: initials(sideName(m.team1)), color: colorFor(sideName(m.team1)), score: m.score1 ?? '—', overs: '' },
    b: { name: sideName(m.team2), short: initials(sideName(m.team2)), color: colorFor(sideName(m.team2) + 'x'), score: m.score2 ?? '—', overs: '' },
    result: m.result || (m.status === 'completed' ? 'Completed' : m.status === 'live' ? 'In progress' : 'Scheduled'),
  }), []);

  const fetchFeed = useCallback(() => Promise.all([
    legendsApi.getCircleMatches({ sport: 'cricket' }),
    legendsApi.getPosts({ sport: 'cricket' }),
  ]).then(([mr, pr]) => {
    setMatches((mr?.data || []).map(mapMatch));
    setPosts((pr?.data || []).map(mapPost));
  }), [mapMatch, mapPost]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchFeed().finally(() => setLoading(false));
  }, [fetchFeed]));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFeed().finally(() => setRefreshing(false));
  }, [fetchFeed]);

  const toggleLike = useCallback((id) => {
    haptic.tick();
    setPosts((prev) => prev.map((po) =>
      po.id === id ? { ...po, liked: !po.liked, likes: Math.max(0, po.likes + (po.liked ? -1 : 1)) } : po));
    if (!likedRef.current[id]) { likedRef.current[id] = true; legendsApi.likePost(id); }
  }, []);

  const openComments = useCallback(async (post) => {
    setActivePost(post);
    const res = await legendsApi.getComments(post.id);
    if (res.success) {
      const mapped = (res.data || []).map((c) => ({ id: c.id, user: c.authorName || 'Player', text: c.text, color: colorFor(c.authorName) }));
      setPosts((prev) => prev.map((po) => (po.id === post.id ? { ...po, comments: mapped, commentCount: mapped.length } : po)));
    }
  }, []);

  const addComment = useCallback(async (id, text) => {
    const res = await legendsApi.addComment(id, text);
    if (res.success) {
      setPosts((prev) => prev.map((po) => (po.id === id
        ? { ...po, comments: [...po.comments, { id: res.data?.id || 'c' + Date.now(), user: 'You', text, color: DS.lime }], commentCount: (po.commentCount || 0) + 1 }
        : po)));
    }
  }, [DS.lime]);

  const sharePost = useCallback(async (post) => {
    try {
      await Share.share({ message: `${post.author.name} on Local Legends:\n\n"${post.caption}"` });
    } catch (e) {/* user dismissed */}
  }, []);

  const submitPost = useCallback(async () => {
    const text = composeText.trim();
    if (!text) return;
    setPosting(true);
    try {
      const res = await legendsApi.createPost({ sport: 'cricket', text });
      if (res.success) {
        setPosts((prev) => [mapPost(res.data), ...prev]);
        setComposeText('');
        setComposeOpen(false);
      }
    } finally {
      setPosting(false);
    }
  }, [composeText, mapPost]);

  // keep the open sheet in sync with the latest comments
  const sheetPost = activePost ? posts.find((po) => po.id === activePost.id) : null;

  const renderHeader =
  <View>
      {/* From Your Circle rail */}
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>From Your Circle</Text>
        <TouchableOpacity><Text style={s.seeAll}>See all</Text></TouchableOpacity>
      </View>
      <Text style={s.sectionSub}>Teams you’ve played for · friends’ recent matches</Text>
      <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.railContent}>
      
        {matches.length > 0
        ? matches.map((mt) => <CircleMatchCard key={mt.id} match={mt} onPress={() => {}} />)
        : <View style={s.railEmpty}><Text style={s.railEmptyTxt}>No recent matches yet</Text></View>}
      </ScrollView>

      {/* Feed title */}
      <View style={[s.sectionHead, { marginTop: 18 }]}>
        <Text style={s.sectionTitle}>Latest from Players</Text>
      </View>
    </View>;


  return (
    <View style={s.root}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />

      {/* top bar */}
      <View style={s.topBar}>
        <View style={s.brand}>
          <Icon name="cricket" size={22} color={DS.lime} />
          <Text style={s.brandTxt}>LOCAL LEGENDS</Text>
        </View>
        <View style={s.topActions}>
          <TouchableOpacity hitSlop={8} onPress={() => setComposeOpen(true)}>
            <Icon name="plus-box-outline" size={24} color={DS.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('GlobalSearch')}>
            <Icon name="magnify" size={23} color={DS.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('Notification')}>
            <Icon name="heart-outline" size={22} color={DS.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(it) => it.id}
        ListHeaderComponent={renderHeader}
        renderItem={({ item }) =>
        <PostCard post={item} onLike={toggleLike} onShare={sharePost} onComment={openComments} />
        }
        ListEmptyComponent={!loading &&
          <View style={s.feedEmpty}>
            <Icon name="cricket" size={40} color={DS.surfaceHighest} />
            <Text style={s.feedEmptyTxt}>No posts yet</Text>
            <Text style={s.feedEmptySub}>Be the first to share a cricket moment.</Text>
          </View>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }} />


      <CommentsSheet post={sheetPost} onClose={() => setActivePost(null)} onAdd={addComment} />

      {/* Create-post FAB */}
      <TouchableOpacity style={s.fab} activeOpacity={0.9} onPress={() => setComposeOpen(true)}>
        <Icon name="plus" size={28} color={DS.bg} />
      </TouchableOpacity>

      {/* Compose sheet */}
      <Modal visible={composeOpen} animationType="slide" transparent onRequestClose={() => setComposeOpen(false)}>
        <View style={s.composeBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.composeSheet}>
              <View style={s.composeHead}>
                <TouchableOpacity onPress={() => setComposeOpen(false)} hitSlop={8}>
                  <Text style={s.composeCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={s.composeTitle}>New Post</Text>
                <TouchableOpacity
                  onPress={submitPost}
                  disabled={posting || !composeText.trim()}
                  hitSlop={8}>
                  {posting
                    ? <ActivityIndicator color={DS.lime} />
                    : <Text style={[s.composePost, !composeText.trim() && s.composePostOff]}>Post</Text>}
                </TouchableOpacity>
              </View>
              <TextInput
                style={s.composeInput}
                placeholder="Share a cricket moment…"
                placeholderTextColor={DS.textMuted}
                value={composeText}
                onChangeText={setComposeText}
                multiline
                autoFocus
                maxLength={500}
                editable={!posting} />
              <Text style={s.composeCount}>{composeText.length}/500</Text>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>);

}

// ── styles ──────────────────────────────────────────────────────────────────
const makeS = (DS) => StyleSheet.create({
  root: { flex: 1, backgroundColor: DS.bg },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingBottom: 10, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: DS.line
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandTxt: { color: DS.textPrimary, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 18 },

  sectionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16
  },
  sectionTitle: { color: DS.textPrimary, fontSize: 18, fontWeight: '800', letterSpacing: 0.2 },
  seeAll: { color: DS.lime, fontSize: 13, fontWeight: '700' },
  sectionSub: { color: DS.textMuted, fontSize: 12, paddingHorizontal: 16, marginTop: 2 },

  railContent: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },

  railEmpty: { width: SW - 32, paddingVertical: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.surfaceLow, borderRadius: 16, borderWidth: 1, borderColor: DS.line },
  railEmptyTxt: { color: DS.textMuted, fontSize: 13 },
  feedEmpty: { alignItems: 'center', paddingVertical: 40, gap: 6 },
  feedEmptyTxt: { color: DS.textPrimary, fontSize: 15, fontWeight: '700', marginTop: 4 },
  feedEmptySub: { color: DS.textMuted, fontSize: 13 },

  fab: {
    position: 'absolute', right: 18, bottom: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  composeBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  composeSheet: { backgroundColor: DS.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 28 },
  composeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  composeTitle: { color: DS.textPrimary, fontSize: 16, fontWeight: '800' },
  composeCancel: { color: DS.textMuted, fontSize: 15, fontWeight: '600' },
  composePost: { color: DS.lime, fontSize: 15, fontWeight: '800' },
  composePostOff: { opacity: 0.4 },
  composeInput: { color: DS.textPrimary, fontSize: 16, lineHeight: 22, minHeight: 120, maxHeight: 240, textAlignVertical: 'top', backgroundColor: DS.surfaceLow, borderRadius: 14, borderWidth: 1, borderColor: DS.line, padding: 14 },
  composeCount: { color: DS.textMuted, fontSize: 12, alignSelf: 'flex-end', marginTop: 8 }
});

const makeC = (DS) => StyleSheet.create({
  card: {
    width: 248, backgroundColor: DS.surfaceLow, borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: DS.line
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  tagPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  tagTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: DS.live },
  liveTxt: { color: DS.live, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  whenTxt: { color: DS.textMuted, fontSize: 11, fontWeight: '600' },

  teamRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  teamBadge: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  teamBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  teamName: { flex: 1, color: DS.textVariant, fontSize: 13, fontWeight: '600', marginLeft: 9 },
  teamScore: { color: DS.textPrimary, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },

  cardDivider: { height: 1, backgroundColor: DS.line, marginTop: 10, marginBottom: 8 },
  resultTxt: { color: DS.lime, fontSize: 11.5, fontWeight: '700' }
});

const makeM = (DS) => StyleSheet.create({
  wrap: { marginHorizontal: 0, paddingVertical: 22, paddingHorizontal: 16, overflow: 'hidden' },
  glow: {
    position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(171,214,0,0.10)'
  },
  smallLabel: { color: DS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  bigRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 6, gap: 8 },
  bigNum: { color: DS.textPrimary, fontSize: 56, fontWeight: '900', letterSpacing: -1, lineHeight: 58 },
  bigBalls: { color: DS.lime, fontSize: 20, fontWeight: '800', marginBottom: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  metaTxt: { color: DS.textVariant, fontSize: 12.5, fontWeight: '600' },

  resultTeams: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginVertical: 14, position: 'relative' },
  resultTeam: { alignItems: 'center', gap: 4, flex: 1 },
  resultScore: { color: DS.textPrimary, fontSize: 18, fontWeight: '900', marginTop: 6 },
  resultName: { color: DS.textMuted, fontSize: 11, fontWeight: '600' },
  vs: { position: 'absolute', color: DS.textMuted, fontSize: 12, fontWeight: '800', alignSelf: 'center' },

  photoIcon: { width: 84, height: 84, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 8 }
});

const makeP = (DS) => StyleSheet.create({
  card: { backgroundColor: DS.surfaceLow, marginTop: 12, paddingBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { color: DS.textPrimary, fontSize: 14, fontWeight: '800' },
  sub: { color: DS.textMuted, fontSize: 12, marginTop: 1 },

  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, gap: 16 },
  actionBtn: {},

  likes: { color: DS.textPrimary, fontSize: 13, fontWeight: '600', paddingHorizontal: 14, paddingTop: 10 },
  bold: { fontWeight: '800', color: DS.textPrimary },
  caption: { color: DS.textVariant, fontSize: 13.5, lineHeight: 19, paddingHorizontal: 14, paddingTop: 5 },
  viewComments: { color: DS.textMuted, fontSize: 13, paddingHorizontal: 14, paddingTop: 6 },
  time: { color: DS.textMuted, fontSize: 10.5, letterSpacing: 0.5, paddingHorizontal: 14, paddingTop: 8 }
});

const makeCm = (DS) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: DS.surfaceLow, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: DS.surfaceHighest, alignSelf: 'center', marginBottom: 10 },
  title: { color: DS.textPrimary, fontSize: 16, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  empty: { color: DS.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 24 },
  commentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  commentUser: { color: DS.textPrimary, fontSize: 13, fontWeight: '800' },
  commentTxt: { color: DS.textVariant, fontSize: 13.5, marginTop: 1 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 12,
    borderTopWidth: 1, borderTopColor: DS.line, paddingTop: 12
  },
  input: { flex: 1, color: DS.textPrimary, fontSize: 14, paddingVertical: 6 },
  post: { color: DS.lime, fontSize: 14, fontWeight: '800' }
});