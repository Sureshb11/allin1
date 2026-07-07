import { useTheme, useThemedStyles } from "../theme/ThemeContext"; // CricketFeedScreen — the cricket landing page.
// An Instagram-style feed of posts shared by players on the app (like /
// comment / share), preceded by a horizontally-scrolled "From Your Circle"
// rail: recent matches of teams the user played for, or friends' teams.
//
// Dark "Kinetic Athlete" palette, consistent with the rest of MainApp.
// Data is mock — wire posts/matches to real sources when available.

import { useState, useRef, useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList,
  StatusBar, Dimensions, Animated, Modal, TextInput, Share, RefreshControl,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image } from
'react-native';
import { Alert } from 'react-native';
import { pickAndUploadImage } from '../utils/imageUpload';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import MomentumMeter from '../components/MomentumMeter';
import { haptic } from '../utils/haptics';
import { showToast } from '../components/Toast';
import { useCurrentUser } from '../utils/currentUser';
import BrandLogo from '../components/BrandLogo';

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













// ── Shimmer Skeleton ────────────────────────────────────────────────────────
function FeedSkeleton({ DS }) {
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
    <View style={{ paddingHorizontal: 14, paddingTop: 16, gap: 20 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ backgroundColor: DS.surfaceLow, borderRadius: 16, padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Animated.View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: DS.surfaceHigh, opacity }} />
            <View style={{ flex: 1, gap: 6 }}>
              <Bar w={120} h={12} />
              <Bar w={80} h={10} />
            </View>
          </View>
          <Bar w="100%" h={200} r={12} mt={4} />
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
            <Bar w={26} h={26} r={13} />
            <Bar w={26} h={26} r={13} />
            <Bar w={26} h={26} r={13} />
          </View>
          <Bar w={140} h={12} mt={2} />
          <Bar w="90%" h={12} />
        </View>
      ))}
    </View>
  );
}

// ── Small building blocks ───────────────────────────────────────────────────
function Avatar({ initial, color, size = 40, ring = false, uri = null }) {const DS = useTheme().colors;
  const base = { width: size, height: size, borderRadius: size / 2 };
  const ringStyle = ring && { borderWidth: 2, borderColor: DS.lime };
  if (uri) return <Image source={{ uri }} style={[base, ringStyle]} />;
  return (
    <View style={[base, { backgroundColor: color, alignItems: 'center', justifyContent: 'center' }, ringStyle]}>
      <Text style={{ color: DS.white, fontWeight: '800', fontSize: size * 0.4 }}>{initial}</Text>
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

      {/* Not the scorer? The LIVE pill above is enough — the whole card already
          taps through to the live scorecard, no extra row needed. */}
      {match.live && match.isScorer ? (
        <>
          <View style={c.cardDivider} />
          <View style={c.resumeRow}>
            <Icon name="play-circle" size={16} color={DS.onBlue} />
            <Text style={c.resumeTxt}>SCORE</Text>
          </View>
        </>
      ) : !match.live ? (
        <>
          <View style={c.cardDivider} />
          <Text style={c.resultTxt} numberOfLines={1}>{match.result}</Text>
        </>
      ) : null}
    </TouchableOpacity>);

}

// Highlight card — renders an ActivityFeed item (milestone or match result)
// from its JSONB payload, with the idempotent like toggle.
function HighlightCard({ item, onLike, onOpen }) {const DS = useTheme().colors;const h = useThemedStyles(makeH);
  const pl = item.payload || {};
  const isMilestone = item.type === 'milestone';
  return (
    <TouchableOpacity activeOpacity={0.85} style={h.card} onPress={onOpen}>
      <View style={[h.badge, { backgroundColor: (isMilestone ? DS.lime : DS.blue) + '22' }]}>
        <Icon name={isMilestone ? 'trophy-variant' : 'scoreboard-outline'} size={16} color={isMilestone ? DS.lime : DS.blue} />
        <Text style={[h.badgeTxt, { color: isMilestone ? DS.lime : DS.blue }]}>
          {isMilestone ? 'MILESTONE' : 'RESULT'}
        </Text>
      </View>
      {isMilestone ? (
        <>
          <Text style={h.title} numberOfLines={2}>{pl.title}</Text>
          <Text style={h.sub} numberOfLines={1}>{pl.player?.name} · {pl.stat}</Text>
        </>
      ) : (
        <>
          <Text style={h.title} numberOfLines={1}>{(pl.teams || []).join('  v  ')}</Text>
          <Text style={h.score} numberOfLines={1}>{pl.score1} — {pl.score2}</Text>
          <Text style={h.sub} numberOfLines={1}>{pl.result}</Text>
        </>
      )}
      <TouchableOpacity style={h.likeRow} hitSlop={8} onPress={() => onLike(item.id)} activeOpacity={0.7}>
        <Icon name={item.liked ? 'heart' : 'heart-outline'} size={16} color={item.liked ? DS.live : DS.textMuted} />
        <Text style={h.likeTxt}>{item.likes || 0}</Text>
      </TouchableOpacity>
    </TouchableOpacity>);

}

// Feed photo — computes the real aspect ratio so the FULL image shows (no crop),
// width-locked to the card, height capped so a tall portrait doesn't take over the feed.
function FeedPhoto({ uri, styles: m }) {
  const [ratio, setRatio] = useState(1);
  useEffect(() => {
    let live = true;
    Image.getSize(uri, (w, h) => { if (live && w && h) setRatio(w / h); }, () => {});
    return () => { live = false; };
  }, [uri]);
  const cardW = SW;                                          // full-bleed card width
  const height = Math.min(cardW / ratio, cardW * 1.25);       // cap extreme portraits
  return <Image source={{ uri }} style={[m.photo, { height }]} resizeMode="cover" />;
}

function PostMedia({ kind, media }) {const DS = useTheme().colors;const c = useThemedStyles(makeC);const m = useThemedStyles(makeM);
  if (!media) return null;   // real text posts carry no rich media
  // Real uploaded photo (blob URL string) — size to the image's real aspect ratio
  // so it's shown in FULL (no top/bottom crop), capped so a very tall photo doesn't
  // dominate the feed.
  if (kind === 'photo' && typeof media === 'string') {
    return <FeedPhoto uri={media} styles={m} />;
  }
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
  const heartOverlay = useRef(new Animated.Value(0)).current;
  const [saved, setSaved] = useState(false);
  const lastTap = useRef(0);

  const handleLike = () => {
    onLike(post.id);
    if (!post.liked) {
      popRef.setValue(0.6);
      Animated.spring(popRef, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }).start();
    }
  };

  // Instagram-style double-tap heart
  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!post.liked) onLike(post.id);
      haptic.impact();
      heartOverlay.setValue(0);
      Animated.sequence([
        Animated.spring(heartOverlay, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
        Animated.delay(600),
        Animated.timing(heartOverlay, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
    lastTap.current = now;
  };

  const toggleSave = () => {
    haptic.tick();
    setSaved((v) => !v);
    showToast(saved ? 'Removed from saved' : 'Saved', 'success', 1400);
  };

  const openMenu = () => {
    Alert.alert(post.author.handle, undefined, [
      { text: 'Share post', onPress: () => onShare(post) },
      { text: 'Report post', style: 'destructive', onPress: () => showToast('Thanks — we\'ll review this post.', 'success') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={p.card}>
      {/* header */}
      <View style={p.header}>
        <Avatar initial={post.author.initial} color={post.author.color} size={42} ring uri={post.author.avatar} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={p.nameRow}>
            <Text style={p.name}>{post.author.name}</Text>
            {post.author.verified && <Icon name="check-decagram" size={14} color={DS.lime} style={{ marginLeft: 4 }} />}
          </View>
          <Text style={p.sub}>{post.author.team} · {post.time}</Text>
        </View>
        <TouchableOpacity hitSlop={8} onPress={openMenu}>
          <Icon name="dots-horizontal" size={22} color={DS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* media with double-tap heart overlay */}
      <TouchableOpacity activeOpacity={1} onPress={handleDoubleTap}>
        <PostMedia kind={post.kind} media={post.media} />
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          alignItems: 'center', justifyContent: 'center',
          opacity: heartOverlay,
          transform: [{ scale: heartOverlay.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
        }}>
          <Icon name="heart" size={80} color={DS.white} style={{ textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: {width: 0, height: 2}, textShadowRadius: 10 }} />
        </Animated.View>
      </TouchableOpacity>

      {/* actions */}
      <View style={p.actions}>
        <TouchableOpacity onPress={handleLike} hitSlop={8} style={p.actionBtn} activeOpacity={0.7}>
          <Animated.View style={{ transform: [{ scale: popRef }] }}>
            <Icon name={post.liked ? 'heart' : 'heart-outline'} size={26} color={post.liked ? DS.live : DS.textPrimary} />
          </Animated.View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onComment(post)} hitSlop={8} style={p.actionBtn} activeOpacity={0.7}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Icon name="comment-outline" size={24} color={DS.textPrimary} />
            {(post.commentCount || 0) > 0 && <Text style={{ color: DS.textMuted, fontSize: 12, fontWeight: '700' }}>{post.commentCount}</Text>}
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onShare(post)} hitSlop={8} style={p.actionBtn} activeOpacity={0.7}>
          <Icon name="share-outline" size={25} color={DS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity hitSlop={8} activeOpacity={0.7} onPress={toggleSave}>
          <Icon name={saved ? 'bookmark' : 'bookmark-outline'} size={24} color={saved ? DS.lime : DS.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* likes */}
      {post.likes > 0 &&
        <View style={p.likesRow}>
          <Icon name="heart" size={13} color={DS.live} style={{ marginRight: 5 }} />
          <Text style={p.likes}>
            {post.likedBy
              ? <>Liked by <Text style={p.bold}>{post.likedBy}</Text> and <Text style={p.bold}>{(post.likes - 1).toLocaleString()} others</Text></>
              : <Text style={p.bold}>{post.likes.toLocaleString()} {post.likes === 1 ? 'like' : 'likes'}</Text>}
          </Text>
        </View>
      }

      {/* caption */}
      <Text style={p.caption}>
        <Text style={p.bold}>{post.author.handle.replace('@', '')} </Text>
        {post.caption}
      </Text>

      {/* comments preview */}
      {(post.commentCount || post.comments.length) > 0 &&
      <TouchableOpacity onPress={() => onComment(post)} activeOpacity={0.7} style={p.commentsBtn}>
          <Icon name="comment-text-outline" size={14} color={DS.textMuted} style={{ marginRight: 5 }} />
          <Text style={p.viewComments}>View all {post.commentCount || post.comments.length} comments</Text>
        </TouchableOpacity>
      }

      <Text style={p.time}>{post.time}</Text>
    </View>);

}

// ── Comment Row with likeable heart ─────────────────────────────────────────
function CommentRow({ item, DS, cm }) {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(item.likes || 0);
  const scaleRef = useRef(new Animated.Value(1)).current;

  const toggleLike = () => {
    haptic.tick();
    const next = !liked;
    setLiked(next);
    setLikes((v) => v + (next ? 1 : -1));
    if (next) {
      scaleRef.setValue(0.5);
      Animated.spring(scaleRef, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }).start();
    }
  };

  return (
    <View style={cm.commentRow}>
      <Avatar initial={item.user[0].toUpperCase()} color={item.color || DS.surfaceHighest} size={34} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={cm.commentUser}>{item.user}</Text>
        <Text style={cm.commentTxt}>{item.text}</Text>
        {likes > 0 && <Text style={{ color: DS.textMuted, fontSize: 11, marginTop: 3, fontWeight: '600' }}>{likes} {likes === 1 ? 'like' : 'likes'}</Text>}
      </View>
      <TouchableOpacity hitSlop={12} onPress={toggleLike} activeOpacity={0.7}>
        <Animated.View style={{ transform: [{ scale: scaleRef }] }}>
          <Icon name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? DS.live : DS.textMuted} />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
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
              renderItem={({ item }) => <CommentRow item={item} DS={DS} cm={cm} />
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
  const meUser = useCurrentUser();
  const [posts, setPosts] = useState([]);
  const [matches, setMatches] = useState([]);
  const [activity, setActivity] = useState([]);   // ActivityFeed highlight cards
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activePost, setActivePost] = useState(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [composeImage, setComposeImage] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [posting, setPosting] = useState(false);
  const mapPost = useCallback((po) => ({
    id: po.id,
    author: {
      name: po.authorName || 'Player',
      handle: '@' + (po.authorName || 'player').toLowerCase().replace(/\s+/g, '_'),
      team: po.team || '',
      color: colorFor(po.authorName),
      initial: (po.authorName || 'P').charAt(0).toUpperCase(),
      avatar: po.authorAvatar || null,
      verified: false,
    },
    time: timeAgo(po.createdAt),
    kind: po.mediaUrl ? 'photo' : 'text',
    media: po.mediaUrl || null,
    caption: po.text || '',
    likedBy: null,
    likes: po.likes || 0,
    liked: !!po.liked,   // authoritative per-user state from the server (persists across app restarts)
    comments: [],
    commentCount: po.commentCount || 0,
  }), []);

  const mapMatch = useCallback((m) => ({
    id: m.id,
    status: m.status,
    tag: m.status === 'live' ? 'Live' : m.status === 'scheduled' ? 'Upcoming' : 'Match',
    live: m.status === 'live',
    // Only the assigned scorer gets the interactive scoring entry point; everyone
    // else (team members, followers) watches the live score, Cricbuzz/Cricinfo-style.
    // Server-authoritative flag from /circle — never derived from a cached local id.
    isScorer: !!m.isScorer,
    when: m.status === 'live' ? '' : timeAgo(m.createdAt),
    a: { name: sideName(m.team1), short: initials(sideName(m.team1)), color: colorFor(sideName(m.team1)), score: m.score1 ?? '—', overs: '' },
    b: { name: sideName(m.team2), short: initials(sideName(m.team2)), color: colorFor(sideName(m.team2) + 'x'), score: m.score2 ?? '—', overs: '' },
    result: m.result || (m.status === 'completed' ? 'Completed' : m.status === 'live' ? 'In progress' : 'Tap to start'),
    // raw fields needed to launch the toss → scoring flow for a scheduled match
    team1Id: m.team1Id, team2Id: m.team2Id,
    overs: m.overs, matchType: m.matchType,
  }), []);

  const fetchFeed = useCallback(() => Promise.all([
    legendsApi.getCircleMatches({ sport: 'cricket' }),
    legendsApi.getPosts({ sport: 'cricket' }),
    legendsApi.getFeed({ sport: 'cricket', limit: 12 }),
  ]).then(([mr, pr, fr]) => {
    setMatches((mr?.data || []).map(mapMatch));
    setActivity(fr?.data || []);
    // Merge, not replace: refresh like/comment counts + surface new posts, but
    // keep already-loaded comment threads and the optimistic like highlight —
    // so a background poll makes likes/comments populate live without flicker.
    setPosts((prev) => {
      const byId = Object.fromEntries(prev.map((p) => [p.id, p]));
      return (pr?.data || []).map((sp) => {
        const m = mapPost(sp), ex = byId[sp.id];
        return ex ? { ...m, comments: ex.comments?.length ? ex.comments : m.comments } : m;
      });
    });
  }), [mapMatch, mapPost]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchFeed().finally(() => setLoading(false));
    // Poll every 5s while the feed is focused so likes, comment counts and new
    // posts populate live (current-resources stand-in for a realtime socket).
    const poll = setInterval(() => { fetchFeed(); }, 5000);
    return () => clearInterval(poll);
  }, [fetchFeed]));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFeed().finally(() => setRefreshing(false));
  }, [fetchFeed]);

  const toggleLike = useCallback(async (id) => {
    haptic.tick();
    // Optimistic flip, then reconcile with the server's real { liked, likes } —
    // persisted per-user (Like table) so it's still correct after the app restarts.
    setPosts((prev) => prev.map((po) =>
      po.id === id ? { ...po, liked: !po.liked, likes: Math.max(0, po.likes + (po.liked ? -1 : 1)) } : po));
    const res = await legendsApi.likePost(id);
    if (res.success) {
      setPosts((prev) => prev.map((po) => (po.id === id ? { ...po, liked: res.liked, likes: res.likes } : po)));
    }
  }, []);

  const loadComments = useCallback(async (postId) => {
    const res = await legendsApi.getComments(postId);
    if (res.success) {
      const mapped = (res.data || []).map((c) => ({ id: c.id, user: c.authorName || 'Player', text: c.text, color: colorFor(c.authorName) }));
      setPosts((prev) => prev.map((po) => (po.id === postId ? { ...po, comments: mapped, commentCount: mapped.length } : po)));
    }
  }, []);

  // Idempotent like on a highlight card — optimistic, then reconcile with the
  // server's authoritative { liked, likes }.
  const toggleHighlightLike = useCallback(async (id) => {
    haptic.tick();
    setActivity((prev) => prev.map((c) =>
      c.id === id ? { ...c, liked: !c.liked, likes: Math.max(0, (c.likes || 0) + (c.liked ? -1 : 1)) } : c));
    const res = await legendsApi.toggleFeedLike(id);
    if (res.success) {
      setActivity((prev) => prev.map((c) => (c.id === id ? { ...c, liked: res.data.liked, likes: res.data.likes } : c)));
    }
  }, []);

  const openComments = useCallback(async (post) => {
    setActivePost(post);
    loadComments(post.id);
  }, [loadComments]);

  // While the comments sheet is open, poll every 4s so comments others post
  // populate live.
  useEffect(() => {
    if (!activePost) return;
    const poll = setInterval(() => loadComments(activePost.id), 4000);
    return () => clearInterval(poll);
  }, [activePost, loadComments]);

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

  // Circle card tap: scheduled → toss & lineup; live → scoring for the assigned
  // scorer, the live (auto-refreshing) scorecard for everyone else watching;
  // completed → scorecard.
  const openCircleMatch = useCallback(async (mt) => {
    if (mt.status === 'live') {
      navigation.navigate(mt.isScorer ? 'Scoring' : 'Scorecard', mt.isScorer ? { resume: true, matchId: mt.id } : { matchId: mt.id });
      return;
    }
    if (mt.status !== 'scheduled') { navigation.navigate('Scorecard', { matchId: mt.id }); return; }
    let firstInningId;
    const innRes = await legendsApi.getMatchInnings(mt.id);
    if (innRes.success && innRes.data?.length) firstInningId = innRes.data[0].id;
    navigation.navigate('TossLineup', {
      matchId: mt.id,
      team1: mt.a.name, team2: mt.b.name,
      team1Id: mt.team1Id, team2Id: mt.team2Id,
      overs: String(mt.overs || 20),
      matchType: mt.matchType || 'T20',
      firstInningId,
      sport: 'cricket',
    });
  }, [navigation]);

  const submitPost = useCallback(async () => {
    const text = composeText.trim();
    if (!text && !composeImage) return;
    setPosting(true);
    try {
      const res = await legendsApi.createPost({ sport: 'cricket', text: text || '📷', mediaUrl: composeImage });
      if (res.success) {
        setPosts((prev) => [mapPost(res.data), ...prev]);
        setComposeText('');
        setComposeImage(null);
        setComposeOpen(false);
      }
    } finally {
      setPosting(false);
    }
  }, [composeText, composeImage, mapPost]);

  const addComposePhoto = useCallback(async () => {
    setUploadingPhoto(true);
    const r = await pickAndUploadImage('feed');
    setUploadingPhoto(false);
    if (r.url) setComposeImage(r.url);
    else if (r.error) Alert.alert('Upload failed', r.error);
  }, []);

  // keep the open sheet in sync with the latest comments
  const sheetPost = activePost ? posts.find((po) => po.id === activePost.id) : null;

  // Only the assigned scorer gets the "jump back into scoring" banner at the top —
  // for everyone else the red LIVE pill on the circle card is enough; the card
  // already taps through to the live scorecard, no separate banner needed.
  const liveMatch = matches.find((mt) => mt.live && mt.isScorer);

  const renderHeader =
  <View>
      {liveMatch && (
        <TouchableOpacity
          style={s.resumeBanner}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('Scoring', { resume: true, matchId: liveMatch.id })}>
          <View style={s.resumeDot} />
          <View style={{ flex: 1 }}>
            <Text style={s.resumeTitle}>LIVE MATCH · TAP TO RESUME SCORING</Text>
            <Text style={s.resumeSub} numberOfLines={1}>{liveMatch.a.name} vs {liveMatch.b.name}</Text>
          </View>
          <View style={s.resumeCta}>
            <Icon name="play" size={16} color={DS.onBlue} />
            <Text style={s.resumeCtaTxt}>SCORE</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* From Your Circle rail */}
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>From Your Circle</Text>
        <TouchableOpacity onPress={() => navigation.navigate('MyMatches')}>
          <Text style={s.seeAll}>See all</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.sectionSub}>Teams you’ve played for · friends’ recent matches</Text>
      <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.railContent}>

        {matches.length > 0
        ? matches.map((mt) => <CircleMatchCard key={mt.id} match={mt} onPress={() => openCircleMatch(mt)} />)
        : <View style={s.railEmpty}><Text style={s.railEmptyTxt}>No recent matches yet</Text></View>}
      </ScrollView>

      {/* Highlights rail — milestone + match-result cards from the activity feed */}
      {activity.length > 0 && (
        <>
          <View style={[s.sectionHead, { marginTop: 18 }]}>
            <Text style={s.sectionTitle}>Highlights</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.railContent}>
            {activity.map((it) => (
              <HighlightCard
                key={it.id}
                item={it}
                onLike={toggleHighlightLike}
                onOpen={() => it.payload?.matchId && navigation.navigate('Scorecard', { matchId: it.payload.matchId })}
              />
            ))}
          </ScrollView>
        </>
      )}

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
        <BrandLogo />
        <View style={s.topActions}>
          <TouchableOpacity hitSlop={8} onPress={() => setComposeOpen(true)}>
            <Icon name="plus-box-outline" size={24} color={DS.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('Notification')}>
            <Icon name="bell-outline" size={22} color={DS.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('Profile')}>
            {meUser?.avatarUrl ? (
              <Image source={{ uri: meUser.avatarUrl }} style={{ width: 24, height: 24, borderRadius: 12 }} />
            ) : (
              <Icon name="account-circle-outline" size={24} color={DS.textPrimary} />
            )}
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
        ListEmptyComponent={!loading ?
          <View style={s.feedEmpty}>
            <Icon name="cricket" size={40} color={DS.surfaceHighest} />
            <Text style={s.feedEmptyTxt}>No posts yet</Text>
            <Text style={s.feedEmptySub}>Be the first to share a cricket moment.</Text>
          </View>
          : <FeedSkeleton DS={DS} />
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }} />


      <CommentsSheet post={sheetPost} onClose={() => setActivePost(null)} onAdd={addComment} />

      {/* Create-post FAB */}
      <TouchableOpacity style={s.fab} activeOpacity={0.9} onPress={() => setComposeOpen(true)}>
        <Icon name="plus" size={28} color={DS.onBlue} />
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
                  disabled={posting || (!composeText.trim() && !composeImage)}
                  hitSlop={8}>
                  {posting
                    ? <ActivityIndicator color={DS.lime} />
                    : <Text style={[s.composePost, (!composeText.trim() && !composeImage) && s.composePostOff]}>Post</Text>}
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
              {composeImage &&
                <View style={s.composePreviewWrap}>
                  <Image source={{ uri: composeImage }} style={s.composePreview} resizeMode="cover" />
                  <TouchableOpacity style={s.composePreviewX} onPress={() => setComposeImage(null)}>
                    <Icon name="close" size={16} color={DS.white} />
                  </TouchableOpacity>
                </View>
              }
              <View style={s.composeToolbar}>
                <TouchableOpacity style={s.composePhotoBtn} onPress={addComposePhoto} disabled={uploadingPhoto}>
                  {uploadingPhoto ? <ActivityIndicator size="small" color={DS.lime} />
                    : <><Icon name="image-plus" size={20} color={DS.lime} /><Text style={s.composePhotoTxt}>Photo</Text></>}
                </TouchableOpacity>
                <Text style={s.composeCount}>{composeText.length}/500</Text>
              </View>
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
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandText: { fontSize: 20, fontWeight: '800', color: DS.textPrimary, letterSpacing: 1.5 },
  brandBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: DS.lime, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  brandBadgeText: { fontSize: 13, fontWeight: '800', color: DS.bg, letterSpacing: 0.8 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 18 },

  // Live-match resume banner (top of feed)
  resumeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 14, padding: 14, borderRadius: 16,
    backgroundColor: DS.blueDeep,
  },
  resumeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: DS.live },
  resumeTitle: { color: DS.onBlue, fontSize: 11, fontWeight: '900', letterSpacing: 0.6, opacity: 0.9 },
  resumeSub: { color: DS.onBlue, fontSize: 15, fontWeight: '800', marginTop: 2 },
  resumeCta: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DS.surfaceHighest, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7,
  },
  resumeCtaTxt: { color: DS.onBlue, fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },

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

  // Solid electric blue — the theme's primary action identity ("Stadium Under
  // Lights" #0052ff), with an illuminated-scoreboard glow instead of plain black.
  fab: {
    position: 'absolute', right: 18, bottom: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: DS.blueDeep, alignItems: 'center', justifyContent: 'center',
    shadowColor: DS.blueDeep, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  composeBackdrop: { flex: 1, backgroundColor: DS.overlay, justifyContent: 'flex-end' },
  composeSheet: { backgroundColor: DS.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 28 },
  composeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  composeTitle: { color: DS.textPrimary, fontSize: 16, fontWeight: '800' },
  composeCancel: { color: DS.textMuted, fontSize: 15, fontWeight: '600' },
  composePost: { color: DS.blueSoft, fontSize: 15, fontWeight: '800' },
  composePostOff: { opacity: 0.4 },
  composeInput: { color: DS.textPrimary, fontSize: 16, lineHeight: 22, minHeight: 120, maxHeight: 240, textAlignVertical: 'top', backgroundColor: DS.surfaceLow, borderRadius: 14, borderWidth: 1, borderColor: DS.line, padding: 14 },
  composeCount: { color: DS.textMuted, fontSize: 12 },
  composeToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  composePhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: DS.surfaceHigh, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  composePhotoTxt: { color: DS.lime, fontSize: 13, fontWeight: '800' },
  composePreviewWrap: { marginTop: 12, borderRadius: 14, overflow: 'hidden' },
  composePreview: { width: '100%', height: 200, borderRadius: 14 },
  composePreviewX: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: DS.overlay, alignItems: 'center', justifyContent: 'center' }
});

const makeH = (DS) => StyleSheet.create({
  card: { width: 190, backgroundColor: DS.surfaceLow, borderRadius: 18, padding: 14, gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeTxt: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  title: { color: DS.textPrimary, fontSize: 15, fontWeight: '800', marginTop: 2 },
  score: { color: DS.textPrimary, fontSize: 18, fontWeight: '900', letterSpacing: 0.4 },
  sub: { color: DS.textMuted, fontSize: 12, fontWeight: '600' },
  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  likeTxt: { color: DS.textMuted, fontSize: 12, fontWeight: '700' },
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
  teamBadgeTxt: { color: DS.white, fontSize: 10, fontWeight: '800' },
  teamName: { flex: 1, color: DS.textVariant, fontSize: 13, fontWeight: '600', marginLeft: 9 },
  teamScore: { color: DS.textPrimary, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },

  cardDivider: { height: 1, backgroundColor: DS.line, marginTop: 10, marginBottom: 8 },
  resultTxt: { color: DS.lime, fontSize: 11.5, fontWeight: '700' },
  resumeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: DS.blueDeep, borderRadius: 10, paddingVertical: 8,
  },
  resumeTxt: { color: DS.onBlue, fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
});

const makeM = (DS) => StyleSheet.create({
  wrap: { marginHorizontal: 0, paddingVertical: 22, paddingHorizontal: 16, overflow: 'hidden' },
  photo: { width: '100%', backgroundColor: DS.surfaceHigh },   // height set dynamically by FeedPhoto (real aspect ratio)
  glow: {
    position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80,
    backgroundColor: DS.lime + '1A'
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
  card: { backgroundColor: DS.surfaceLow, marginTop: 8, paddingBottom: 14, borderRadius: 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { color: DS.textPrimary, fontSize: 14, fontWeight: '800' },
  sub: { color: DS.textMuted, fontSize: 12, marginTop: 1 },

  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, gap: 16 },
  actionBtn: {},

  likesRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10 },
  likes: { color: DS.textPrimary, fontSize: 13, fontWeight: '600' },
  bold: { fontWeight: '800', color: DS.textPrimary },
  caption: { color: DS.textVariant, fontSize: 13.5, lineHeight: 19, paddingHorizontal: 14, paddingTop: 5 },
  commentsBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8 },
  viewComments: { color: DS.textMuted, fontSize: 13 },
});

const makeCm = (DS) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: DS.overlay },
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
  post: { color: DS.blueSoft, fontSize: 14, fontWeight: '800' }
});