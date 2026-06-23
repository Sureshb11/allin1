import { useTheme, useThemedStyles } from "../theme/ThemeContext"; // CricketFeedScreen — the cricket landing page.
// An Instagram-style feed of posts shared by players on the app (like /
// comment / share), preceded by a horizontally-scrolled "From Your Circle"
// rail: recent matches of teams the user played for, or friends' teams.
//
// Dark "Kinetic Athlete" palette, consistent with the rest of MainApp.
// Data is mock — wire posts/matches to real sources when available.

import { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList,
  StatusBar, Dimensions, Animated, Modal, TextInput, Share,
  KeyboardAvoidingView, Platform } from
'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const { width: SW } = Dimensions.get('window');
















// ── Mock data ───────────────────────────────────────────────────────────────
const CIRCLE_MATCHES = [
{
  id: 'm1', tag: 'You played', live: true, when: 'Live · 14.2 ov',
  a: { name: 'Sunday Strikers', short: 'SS', color: '#2d7a3a', score: '128/4', overs: '14.2' },
  b: { name: 'Park Avenue XI', short: 'PA', color: '#1a5fa8', score: '—', overs: '' },
  result: 'Strikers batting · need 47 off 34'
},
{
  id: 'm2', tag: "Aman's team", when: '2h ago',
  a: { name: 'Galaxy Gladiators', short: 'GG', color: '#7c3aed', score: '156/7', overs: '20' },
  b: { name: 'North Riders', short: 'NR', color: '#b45309', score: '149/9', overs: '20' },
  result: 'Gladiators won by 7 runs'
},
{
  id: 'm3', tag: 'You played', when: 'Yesterday',
  a: { name: 'Sunday Strikers', short: 'SS', color: '#2d7a3a', score: '174/5', overs: '20' },
  b: { name: 'City Cobras', short: 'CC', color: '#b91c1c', score: '170/8', overs: '20' },
  result: 'Strikers won by 4 runs'
},
{
  id: 'm4', tag: "Priya's team", when: '2d ago',
  a: { name: 'Royal Challengers', short: 'RC', color: '#c2490d', score: '98', overs: '17.3' },
  b: { name: 'Metro Mavericks', short: 'MM', color: '#0d7c8f', score: '99/2', overs: '12.1' },
  result: 'Mavericks won by 8 wkts'
}];


const INITIAL_POSTS = [
{
  id: 'p1',
  author: { name: 'Rohan Mehta', handle: '@rohan_mm', team: 'Sunday Strikers', color: '#2d7a3a', initial: 'R', verified: true },
  time: '2 HOURS AGO',
  kind: 'milestone',
  media: { value: '78', balls: '42', sub: 'PLAYER OF THE MATCH', meta: 'vs City Cobras · SR 185.7', icon: 'cricket' },
  caption: 'Chased it down with 2 overs to spare 🔥 What a night under lights with the boys!',
  likedBy: 'kabir_07', likes: 243, liked: false, shares: 12,
  comments: [
  { id: 'c1', user: 'kabir_07', text: 'Captain knock! 👏', color: '#1a5fa8' },
  { id: 'c2', user: 'the_priya', text: 'Those cover drives though 😍', color: '#7c3aed' }]

},
{
  id: 'p2',
  author: { name: 'Galaxy Gladiators', handle: '@galaxy_gg', team: 'Club · 312 members', color: '#7c3aed', initial: 'G', verified: true },
  time: '5 HOURS AGO',
  kind: 'result',
  media: {
    title: 'MATCH WON · 7 RUNS',
    a: { short: 'GG', name: 'Gladiators', score: '156/7', color: '#7c3aed' },
    b: { short: 'NR', name: 'Riders', score: '149/9', color: '#b45309' },
    meta: 'Sunday League · Group B'
  },
  caption: 'Defended 156 like champions. Bowlers stood up when it mattered. Onto the semis! 🏆',
  likedBy: 'aman.fielding', likes: 489, liked: true, shares: 34,
  comments: [
  { id: 'c1', user: 'north_riders', text: 'Well played, rematch soon 🤝', color: '#b45309' }]

},
{
  id: 'p3',
  author: { name: 'Aman Verma', handle: '@aman.fielding', team: 'Galaxy Gladiators', color: '#b45309', initial: 'A' },
  time: 'YESTERDAY',
  kind: 'photo',
  media: { icon: 'trophy-variant', label: 'TEAM OF THE WEEK', sub: 'Selected by Local Legends', tint: '#b45309' },
  caption: 'Grateful to make the Team of the Week 🙏 Couldn’t have done it without my teammates.',
  likedBy: 'rohan_mm', likes: 156, liked: false, shares: 5,
  comments: []
}];


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

      <View style={c.cardDivider} />
      <Text style={c.resultTxt} numberOfLines={1}>{match.result}</Text>
    </TouchableOpacity>);

}

function PostMedia({ kind, media }) {const DS = useTheme().colors;const c = useThemedStyles(makeC);const m = useThemedStyles(makeM);
  if (kind === 'milestone') {
    return (
      <View style={[m.wrap, { backgroundColor: '#13351f' }]}>
        <View style={m.glow} />
        <Text style={m.smallLabel}>{media.sub}</Text>
        <View style={m.bigRow}>
          <Text style={m.bigNum}>{media.value}</Text>
          <Text style={m.bigBalls}>({media.balls})</Text>
        </View>
        <View style={m.metaRow}>
          <Icon name={media.icon} size={14} color={DS.lime} />
          <Text style={m.metaTxt}>{media.meta}</Text>
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
      <Text style={p.likes}>
        Liked by <Text style={p.bold}>{post.likedBy}</Text> and{' '}
        <Text style={p.bold}>{post.likes.toLocaleString()} others</Text>
      </Text>

      {/* caption */}
      <Text style={p.caption}>
        <Text style={p.bold}>{post.author.handle.replace('@', '')} </Text>
        {post.caption}
      </Text>

      {/* comments preview */}
      {post.comments.length > 0 &&
      <TouchableOpacity onPress={() => onComment(post)} activeOpacity={0.7}>
          <Text style={p.viewComments}>View all {post.comments.length} comments</Text>
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
export default function CricketFeedScreen({ navigation }) {const DS = useTheme().colors;const s = useThemedStyles(makeS);
  const [posts, setPosts] = useState(INITIAL_POSTS);
  const [activePost, setActivePost] = useState(null);

  const toggleLike = useCallback((id) => {
    setPosts((prev) => prev.map((po) =>
    po.id === id ? { ...po, liked: !po.liked, likes: po.likes + (po.liked ? -1 : 1) } : po
    ));
  }, []);

  const addComment = useCallback((id, text) => {
    setPosts((prev) => prev.map((po) =>
    po.id === id ?
    { ...po, comments: [...po.comments, { id: 'c' + Date.now(), user: 'you', text, color: DS.lime }] } :
    po
    ));
  }, []);

  const sharePost = useCallback(async (post) => {
    try {
      await Share.share({ message: `${post.author.name} on Local Legends:\n\n"${post.caption}"` });
    } catch (e) {/* user dismissed */}
  }, []);

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
      
        {CIRCLE_MATCHES.map((mt) =>
      <CircleMatchCard key={mt.id} match={mt} onPress={() => {}} />
      )}
      </ScrollView>

      {/* Feed title */}
      <View style={[s.sectionHead, { marginTop: 18 }]}>
        <Text style={s.sectionTitle}>Latest from Players</Text>
      </View>
    </View>;


  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />

      {/* top bar */}
      <View style={s.topBar}>
        <View style={s.brand}>
          <Icon name="cricket" size={22} color={DS.lime} />
          <Text style={s.brandTxt}>LOCAL LEGENDS</Text>
        </View>
        <View style={s.topActions}>
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
        <PostCard post={item} onLike={toggleLike} onShare={sharePost} onComment={setActivePost} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }} />
      

      <CommentsSheet post={sheetPost} onClose={() => setActivePost(null)} onAdd={addComment} />
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

  railContent: { paddingHorizontal: 16, paddingTop: 12, gap: 12 }
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