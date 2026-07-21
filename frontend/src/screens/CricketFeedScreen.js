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
import { haptic } from '../utils/haptics';
import { showToast } from '../components/Toast';
import { useCurrentUser } from '../utils/currentUser';
import BrandLogo, { BRAND_NAME, BRAND_TAGLINE } from '../components/BrandLogo';
import AppHeader from '../components/AppHeader';
import HexAvatar from '../components/HexAvatar';
import { useHideTabBarOnScroll, useTabBarClearance } from '../components/AutoHideTabBar';
import { splitScore } from './MyMatchesScreen';

const SW = Dimensions.get('window').width;
const CARD_GAP = 12;
// Carousel card width — leave ~44px of the screen on each side so the previous
// and next match peek in a cover-flow style (centre card shown in full).
const MATCH_CARD_W = Math.round(SW - 90);

// Parse a cricket score string like "217/4 (11.0)" → { runs, wkts, overs }.
const parseScore = (s) => {
  if (!s || typeof s !== 'string') return { runs: null, wkts: null, overs: null };
  const m = s.match(/(\d+)\s*\/?\s*(\d+)?\s*(?:\(([\d.]+)\))?/);
  if (!m) return { runs: null, wkts: null, overs: null };
  return { runs: m[1] != null ? +m[1] : null, wkts: m[2] != null ? +m[2] : null, overs: m[3] != null ? +m[3] : null };
};

// ── helpers (map real API data → the feed's render shapes) ──────────────────
const sideName = (t) => (typeof t === 'object' ? (t?.name || 'Team') : String(t || 'Team'));
const initials = (n) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
// Single-accent: every avatar uses the deep green (white initials read on it in
// both light and dark). Was a per-name rainbow palette.
const colorFor = () => '#0a5227';
const timeAgo = (iso) => {
  if (!iso) return '';
  const sec = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  for (const [label, s] of [['y', 31536000], ['mo', 2592000], ['d', 86400], ['h', 3600], ['m', 60]])
    if (sec >= s) return `${Math.floor(sec / s)}${label} ago`;
  return 'just now';
};

// "X need 45 off 30 balls" for a live 2nd-innings chase. Derived purely from
// fields the /circle API already returns (score strings + toss + currentInnings):
//   • who batted first = toss winner if they chose bat, else the other team
//   • target           = first team's runs + 1 (from their score string)
//   • need / balls left = from the chasing team's score string + total overs
// Returns null for 1st innings, finished chases, or missing toss data.
const chaseLine = (m) => {
  if (String(m.status) !== 'live' || (m.currentInnings || 1) < 2) return null;
  if (!m.tossWinnerId || !m.team1Id || !m.team2Id) return null;
  const other = (id) => (id === m.team1Id ? m.team2Id : m.team1Id);
  const firstId = m.tossDecision === 'bat' ? m.tossWinnerId : other(m.tossWinnerId);
  const chaseId = other(firstId);
  const first = parseScore(firstId === m.team1Id ? m.score1 : m.score2);
  const chase = parseScore(chaseId === m.team1Id ? m.score1 : m.score2);
  if (first.runs == null) return null;
  const need = Math.max(0, first.runs + 1 - (chase.runs || 0));
  if (need <= 0) return null;
  // Overs are "O.B" notation (10.3 = 10 overs, 3 balls) → total balls bowled.
  const ov = chase.overs || 0;
  const whole = Math.floor(ov);
  const ballsBowled = whole * 6 + Math.round((ov - whole) * 10);
  const ballsLeft = Math.max(0, (m.overs || 20) * 6 - ballsBowled);
  if (ballsLeft <= 0) return null;
  const chaseName = sideName(chaseId === m.team1Id ? m.team1 : m.team2);
  return `${chaseName} need ${need} off ${ballsLeft} ball${ballsLeft !== 1 ? 's' : ''}`;
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
        <View key={i} style={{ backgroundColor: DS.surface, borderRadius: 16, padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {/* Hexagon, so the placeholder is the shape of the avatar that
                replaces it — a circle here popped into a hexagon on load. */}
            <Animated.View style={{ opacity }}>
              <HexAvatar size={42} color={DS.surfaceHigh} />
            </Animated.View>
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
// Hexagon, like every other avatar in the app (leaderboards, team badges, the
// profile) — the Arena honeycomb motif. The feed was the last place still
// drawing circles.
//
// The lime `ring` can't be a border: borderWidth follows the View's box, so on a
// hexagon it would draw a square-ish outline around the shape. Instead a lime
// hexagon sits behind a slightly smaller one, and the 2px it peeks out reads as
// an outline that actually follows the silhouette.
function Avatar({ initial, color, size = 40, ring = false, uri = null }) {const DS = useTheme().colors;
  const inner = size - (ring ? 4 : 0);
  const face = (
    <HexAvatar size={inner} color={color} uri={uri || undefined}>
      <Text style={{ color: DS.white, fontWeight: '800', fontSize: inner * 0.4 }}>{initial}</Text>
    </HexAvatar>
  );
  if (!ring) return face;
  return <HexAvatar size={size} color={DS.lime}>{face}</HexAvatar>;
}

const LiveDot = () => {
  const { colors: DS } = useTheme();
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true })
      ])
    ).start();
  }, [anim]);
  return <Animated.View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: DS.live, opacity: anim }} />;
};

// Full match card for the "From Your Circle" snap carousel — mirrors the design:
// LIVE (score, overs/RR, radium progress bar, LIVE SCORECARD) · FINAL (result
// banner, VIEW SUMMARY) · UPCOMING (VS, when, START/VIEW).
function CircleMatchCard({ match, onPress }) {
  const { colors: DS, isDark } = useTheme();
  const c = useThemedStyles(makeC);
  const { live } = match;
  const completed = match.status === 'completed';

  const pa = parseScore(match.a.score);
  const pb = parseScore(match.b.score);
  const batting = pa.overs != null ? pa : pb.overs != null ? pb : null;
  const rr = batting && batting.overs > 0 ? (batting.runs / batting.overs) : null;
  const progress = batting && match.overs ? Math.min(batting.overs / match.overs, 1) : 0;
  const league = (match.matchType || 'T20').toUpperCase() + ' LEAGUE';

  const Team = ({ t, muted }) => {
    const { main, ov } = splitScore(t.score, match.overs);
    return (
      <View style={c.team}>
        <HexAvatar size={40} color={t.color}>
          <Text style={c.teamAvatarTxt}>{t.short}</Text>
        </HexAvatar>
        <Text style={c.teamName} numberOfLines={2}>{t.name}</Text>
        <Text style={[c.teamScore, muted && c.teamScoreMuted]}>
          {main}{ov ? <Text style={[c.teamScoreOvers, muted && c.teamScoreMuted]}> {ov}</Text> : null}
        </Text>
      </View>
    );
  };

  const content = (
    <TouchableOpacity activeOpacity={0.9} style={[c.card, (live || match.status === 'break') && c.cardLive, { minHeight: 208, justifyContent: 'space-between' }]} onPress={onPress}>
      <View>
        {/* header row */}
        <View style={c.head}>
          {live || match.status === 'break' ? (
            <View style={c.liveRow}>
              <LiveDot />
              <Text style={c.liveTxt}>{match.status === 'break' ? 'INNINGS BREAK' : 'LIVE NOW'}</Text>
            </View>
          ) : (
            <Text style={c.statusTxt}>{completed ? 'FINAL RESULT' : 'UPCOMING'}</Text>
          )}
          <View style={[c.leaguePill, c.leaguePillLive]}>
            <Text style={[c.leaguePillTxt, c.leaguePillTxtLive]}>{league}</Text>
          </View>
        </View>

        {/* teams */}
        <View style={c.teamsRow}>
          <Team t={match.a} muted={!pa.runs && !live} />
          {live ? <View style={c.teamDivider} /> : <Text style={c.vs}>VS</Text>}
          <Team t={match.b} muted={!pb.runs} />
        </View>

        {/* Always render this row (empty when there's no chase) so a 2nd-innings
            card with a chase line and a 1st-innings/RESUME card without one are
            the SAME height — otherwise the chase line made some rail cards taller
            than others. */}
        <View style={c.chaseRow}>
          {match.chase ? (
            <>
              <Icon name="target" size={11} color={DS.coral} />
              <Text style={c.chaseLine} numberOfLines={1}>{match.chase}</Text>
            </>
          ) : null}
        </View>
      </View>

      <View style={{ justifyContent: 'flex-end' }}>

        {live || match.status === 'break' ? (
          // Dropped the overs + run-rate meta row and the progress bar — the
          // scores already carry the state, and losing them lets the card sit
          // compact with the CTA straight under the teams.
          <View style={c.primaryBtn}>
            <Icon name="chart-box" size={16} color={DS.onBlue} />
            <Text style={c.primaryBtnTxt}>{match.isScorer ? 'RESUME' : 'LIVE SCORECARD'}</Text>
          </View>
        ) : completed ? (
          <>
            <View style={c.resultBanner}>
              <Text style={c.resultBannerTxt} numberOfLines={1} adjustsFontSizeToFit>{match.result}</Text>
            </View>
            <View style={c.primaryBtn}>
              <Text style={c.primaryBtnTxt}>VIEW SUMMARY</Text>
            </View>
          </>
        ) : (
          <View style={c.primaryBtn}>
            <Text style={c.primaryBtnTxt}>{match.isScorer ? 'START MATCH' : 'NOTIFY ME'}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return content;
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
export default function CricketFeedScreen({ navigation }) {const { colors: DS, isDark } = useTheme();const s = useThemedStyles(makeS);const hideTabBar = useHideTabBarOnScroll();const tabClear = useTabBarClearance();
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
  const scrollX = useRef(new Animated.Value(0)).current;
  // Signatures of the last-applied server payloads. The 5s poll compares against
  // these and only re-renders the (heavy, animated) feed when data actually
  // changed — an unconditional setState every tick was re-rendering the whole
  // match rail + posts constantly and locking up low-end devices.
  const feedSig = useRef({ matches: '', activity: '', posts: '' });

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
    // Chase line ("X need 45 off 30 balls") for the current (2nd) innings — the
    // toss is a static fact that belongs on the Scorecard's INFO tab only, not
    // repeated on every card; this is the thing that's actually live/useful here.
    chase: chaseLine(m),
    // raw fields needed to launch the toss → scoring flow for a scheduled match
    team1Id: m.team1Id, team2Id: m.team2Id,
    overs: m.overs, matchType: m.matchType,
  }), []);

  const fetchFeed = useCallback(() => Promise.all([
    legendsApi.getCircleMatches({ sport: 'cricket' }),
    legendsApi.getPosts({ sport: 'cricket' }),
    legendsApi.getFeed({ sport: 'cricket', limit: 12 }),
  ]).then(([mr, pr, fr]) => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const recentMatches = (mr?.data || []).filter(m => {
      if (!m.date && !m.createdAt) return true;
      return new Date(m.date || m.createdAt) >= oneWeekAgo;
    });
    // Only update each slice of state when its server payload actually changed,
    // so a no-op poll (the common case between balls/likes) doesn't re-render
    // the whole feed. Signatures capture just the display-affecting fields.
    const mSig = JSON.stringify(recentMatches.map(m => [m.id, m.score1, m.score2, m.status, m.result, m.currentInnings]));
    if (mSig !== feedSig.current.matches) { feedSig.current.matches = mSig; setMatches(recentMatches.map(mapMatch)); }

    const aSig = JSON.stringify((fr?.data || []).map(c => [c.id, c.likes, c.liked]));
    if (aSig !== feedSig.current.activity) { feedSig.current.activity = aSig; setActivity(fr?.data || []); }

    const pSig = JSON.stringify((pr?.data || []).map(p => [p.id, p.likes, p.liked, p.commentCount, p.text, p.mediaUrl]));
    if (pSig !== feedSig.current.posts) {
      feedSig.current.posts = pSig;
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
    }
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
      await Share.share({ message: `${post.author.name} on ${BRAND_NAME}:\n\n"${post.caption}"\n\n${BRAND_TAGLINE}` });
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
    // Only the assigned scorer (creator by default) can start a scheduled match;
    // everyone else just views its info. The backend's toss/score endpoints reject
    // non-scorers too, so this keeps the UI honest instead of dead-ending on a 403.
    if (!mt.isScorer) { navigation.navigate('Scorecard', { matchId: mt.id }); return; }
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

      {/* From Your Circle rail */}
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>From Your Circle</Text>
        <TouchableOpacity onPress={() => navigation.navigate('MyCricketTab', { screen: 'Home' })}>
          <Text style={s.seeAll}>See all</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.sectionSub}>Teams you’ve played for · friends’ recent matches</Text>
      <Animated.FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={matches}
        keyExtractor={item => item.id}
        snapToInterval={MATCH_CARD_W}
        decelerationRate="fast"
        bounces={false}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: (SW - MATCH_CARD_W) / 2, paddingVertical: 14 }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true }
        )}
        ListEmptyComponent={<View style={s.railEmpty}><Text style={s.railEmptyTxt}>No recent matches yet</Text></View>}
        renderItem={({ item, index }) => {
          const inputRange = [
            (index - 1) * MATCH_CARD_W,
            index * MATCH_CARD_W,
            (index + 1) * MATCH_CARD_W,
          ];
          // Centre card sits full-size and opaque; neighbours shrink + fade a touch
          // and tilt slightly for a subtle cover-flow depth (kept readable, not edge-on).
          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.86, 1, 0.86],
            extrapolate: 'clamp',
          });
          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.55, 1, 0.55],
            extrapolate: 'clamp',
          });
          const rotateY = scrollX.interpolate({
            inputRange,
            outputRange: ['32deg', '0deg', '-32deg'],
            extrapolate: 'clamp',
          });
          // Nudge each neighbour outward toward the screen edge to counter the inward
          // foreshortening from the rotation + scale, so its slanted near edge stays
          // clearly visible (a readable, tilted cover-flow peek — not edge-on).
          const translateX = scrollX.interpolate({
            inputRange,
            outputRange: [-28, 0, 28],
            extrapolate: 'clamp',
          });
          const zIndex = scrollX.interpolate({
            inputRange,
            outputRange: [0, 100, 0],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View style={{
              width: MATCH_CARD_W,
              opacity,
              zIndex,
              elevation: zIndex,
              transform: [
                { perspective: 1000 },
                { translateX },
                { scale },
                { rotateY },
              ],
            }}>
              <CircleMatchCard match={item} onPress={() => openCircleMatch(item)} />
            </Animated.View>
          );
        }}
      />

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
      <AppHeader showCompose onComposePress={() => setComposeOpen(true)} />

      <FlatList
        {...hideTabBar}
        contentContainerStyle={{ paddingBottom: tabClear }}
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
      {/* Lift clear of the floating dock: the FAB is absolutely positioned, so
          it never got the bottom padding the scroll content has — the dock sat
          on top of it and the + was unreachable. */}
      <TouchableOpacity style={[s.fab, { bottom: 24 + tabClear }]} activeOpacity={0.9} onPress={() => setComposeOpen(true)}>
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
    paddingTop: 16, paddingBottom: 10, paddingHorizontal: 16,
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
  sectionTitle: { color: DS.textPrimary, fontSize: 20, fontWeight: '800', letterSpacing: 0.2 },
  seeAll: { color: DS.blueDeep, fontSize: 14, fontWeight: '700' },
  sectionSub: { color: DS.textVariant, fontSize: 13, fontWeight: '500', paddingHorizontal: 16, marginTop: 2 },

  railContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: CARD_GAP },

  railEmpty: { width: MATCH_CARD_W, paddingVertical: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.line },
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
  composeInput: { color: DS.textPrimary, fontSize: 16, lineHeight: 22, minHeight: 120, maxHeight: 240, textAlignVertical: 'top', backgroundColor: DS.surface, borderRadius: 14, borderWidth: 1, borderColor: DS.line, padding: 14 },
  composeCount: { color: DS.textMuted, fontSize: 12 },
  composeToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  composePhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: DS.surfaceHigh, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  composePhotoTxt: { color: DS.lime, fontSize: 13, fontWeight: '800' },
  composePreviewWrap: { marginTop: 12, borderRadius: 14, overflow: 'hidden' },
  composePreview: { width: '100%', height: 200, borderRadius: 14 },
  composePreviewX: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: DS.overlay, alignItems: 'center', justifyContent: 'center' }
});

const makeH = (DS) => StyleSheet.create({
  card: { width: 190, backgroundColor: DS.surface, borderRadius: 18, padding: 14, gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeTxt: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  title: { color: DS.textPrimary, fontSize: 15, fontWeight: '800', marginTop: 2 },
  score: { color: DS.textPrimary, fontSize: 18, fontWeight: '900', letterSpacing: 0.4 },
  sub: { color: DS.textMuted, fontSize: 12, fontWeight: '600' },
  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  likeTxt: { color: DS.textMuted, fontSize: 12, fontWeight: '700' },
});

const makeC = (DS, TYPO) => StyleSheet.create({
  card: {
    width: MATCH_CARD_W, backgroundColor: DS.surface, borderRadius: 14, padding: 13,
    borderWidth: 1, borderColor: DS.line,
    shadowColor: '#000', shadowOpacity: DS.mode === 'dark' ? 0.3 : 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  cardLive: { borderWidth: 1.5, borderColor: DS.blueDeep + (DS.mode === 'dark' ? '55' : '33') },

  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: DS.live },
  liveTxt: { fontFamily: TYPO.label.fontFamily, color: DS.live, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' },
  statusTxt: { fontFamily: TYPO.label.fontFamily, color: DS.textMuted, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' },
  leaguePill: { backgroundColor: DS.surfaceHigh, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  leaguePillLive: { backgroundColor: DS.blueDeep },
  leaguePillTxt: { fontFamily: TYPO.label.fontFamily, color: DS.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: -0.5, textTransform: 'uppercase' },
  leaguePillTxtLive: { color: DS.onBlue },

  teamsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  team: { flex: 1, alignItems: 'center', gap: 6 },
  teamAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, elevation: 2 },
  teamAvatarTxt: { fontFamily: TYPO.headline.fontFamily, color: '#ffffff', fontSize: 15, fontWeight: '900' },
  teamName: { fontFamily: TYPO.label.fontFamily, color: DS.textPrimary, fontSize: 13, fontWeight: '700', textAlign: 'center', lineHeight: 16 },
  teamScore: { fontFamily: TYPO.headline.fontFamily, color: DS.textPrimary, fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  teamScoreOvers: { fontSize: 11, fontWeight: '700', color: DS.textMuted, fontVariant: ['tabular-nums'] },
  teamScoreMuted: { color: DS.textMuted },
  teamDivider: { width: 1, height: 46, backgroundColor: DS.line, marginHorizontal: 4 },
  vs: { fontFamily: TYPO.headline.fontFamily, color: DS.textMuted, fontSize: 14, fontWeight: '700', marginHorizontal: 4 },
  // Fixed height so the row occupies the same space with or without a chase
  // line — keeps every rail card the same height (see the render note above).
  chaseRow: { height: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 10 },
  chaseLine: { fontSize: 11, fontWeight: '700', color: DS.textMuted, textAlign: 'center' },

  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  metaMuted: { fontFamily: TYPO.label.fontFamily, color: DS.textMuted, fontSize: 12, fontWeight: '700' },
  metaRR: { fontFamily: TYPO.label.fontFamily, fontSize: 12, fontWeight: '700' },
  track: { height: 5, backgroundColor: DS.surfaceHigh, borderRadius: 3, overflow: 'hidden', marginBottom: 12 },
  fill: { height: 5, backgroundColor: DS.lime, borderRadius: 3, shadowColor: DS.lime, shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },

  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: DS.blueDeep, height: 40, borderRadius: 10, shadowColor: DS.blueDeep, shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  primaryBtnTxt: { fontFamily: TYPO.label.fontFamily, color: DS.onBlue, fontSize: 13, fontWeight: '700', letterSpacing: 0.8 },
  // Same style as My Cricket → Matches: soft green-tint fill, green bold text,
  // sentence case (no uppercase) — e.g. "D-Vigo-S XI won by 5 wickets".
  resultBanner: { backgroundColor: DS.success + '14', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14, alignItems: 'center', marginBottom: 10 },
  resultBannerTxt: { fontFamily: TYPO.label.fontFamily, color: DS.success, fontSize: 13, fontWeight: '800', textAlign: 'center' },
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
  card: { backgroundColor: DS.surface, marginTop: 8, paddingBottom: 14, borderRadius: 0 },
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
  sheet: { backgroundColor: DS.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
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