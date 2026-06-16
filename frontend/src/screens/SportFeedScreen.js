// SportFeedScreen — the shared, themed landing-feed TEMPLATE for every match sport
// (cricket keeps its bespoke CricketFeed; rummy has a custom game flow). It renders
// ONE sport at a time — the selected sport — themed from the registry: a featured LIVE
// match, a results rail, quick actions, and a community feed. Real data via
// /matches?sport= and /posts?sport=. Tapping a match opens MatchStats.
//
// Per-sport identity comes from src/sports/<id>/index.js:
//   feed.accent (else scoring colour), feed.scoreUnit, feed.copy.{live,results,community,compose}

import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList,
  StatusBar, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport } from '../utils/selectedSport';
import { getSport } from '../sports';
import { getScoringConfig } from '../sports/scoring';

// Neutral dark base shared by every sport; the accent supplies each sport's identity.
const D = {
  bg: '#0e1116', surfaceLow: '#171b22', surface: '#1c222b', surfaceHigh: '#272f3a',
  ink: '#eaf0f4', inkDim: '#8d98a6', line: 'rgba(160,180,210,0.10)', live: '#ef4444', white: '#f8fafc',
};
const DEFAULT_COPY = { live: 'Live Now', results: 'Results & Fixtures', community: 'From the Community', compose: 'Share a moment' };

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Sport');
const sideName = (t) => (typeof t === 'object' ? (t?.name || 'Team') : String(t || 'Team'));
const initials = (n) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function FeaturedMatch({ m, accent, unit, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.9} style={[s.feature, { borderColor: accent + '33' }]} onPress={onPress}>
      <View style={s.featTop}>
        <View style={s.liveRow}><View style={s.liveDot} /><Text style={s.liveTxt}>LIVE</Text></View>
        <Text style={s.featComp}>{(m.matchType || 'Match').toUpperCase()}</Text>
      </View>
      <View style={s.featTeams}>
        {[[m.team1, m.score1], [m.team2, m.score2]].map(([t, sc], i) => (
          <View key={i} style={s.featCol}>
            <View style={s.featBadge}><Text style={s.featBadgeTxt}>{initials(sideName(t))}</Text></View>
            <Text style={s.featName} numberOfLines={1}>{sideName(t)}</Text>
            <Text style={[s.featScore, { color: accent }]}>{sc ?? '0'}</Text>
            {!!unit && <Text style={s.featUnit}>{unit}</Text>}
          </View>
        ))}
        <Text style={s.featVs}>vs</Text>
      </View>
      <View style={s.featFoot}>
        <Icon name="stadium-variant" size={13} color={D.inkDim} />
        <Text style={s.featVenue} numberOfLines={1}>{m.venue || 'Venue TBD'}</Text>
        <Text style={[s.featCta, { color: accent }]}>View stats ›</Text>
      </View>
    </TouchableOpacity>
  );
}

function ResultCard({ m, accent, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.85} style={s.resCard} onPress={onPress}>
      <Text style={s.resTag}>{m.status === 'completed' ? 'FINISHED' : 'UPCOMING'}</Text>
      {[[m.team1, m.score1], [m.team2, m.score2]].map(([t, sc], i) => (
        <View key={i} style={s.resRow}>
          <View style={s.resBadge}><Text style={s.resBadgeTxt}>{initials(sideName(t))}</Text></View>
          <Text style={s.resName} numberOfLines={1}>{sideName(t)}</Text>
          <Text style={s.resScore}>{sc ?? '—'}</Text>
        </View>
      ))}
      <Text style={[s.resFoot, { color: accent }]} numberOfLines={1}>{m.result || m.venue || `${cap(m.sport)} match`}</Text>
    </TouchableOpacity>
  );
}

export default function SportFeedScreen({ navigation }) {
  const selected = getSelectedSport().sport;
  const sportId = selected?.id || 'cricket';
  const def = getSport(sportId);
  const sportName = def?.name || selected?.name || cap(sportId);
  const sportIcon = def?.icon || selected?.icon || 'trophy';
  const sportObj = { id: sportId, name: sportName, icon: sportIcon };

  // Theme + copy derived from the registry (feed override → scoring colour → default).
  const accent = def?.feed?.accent || getScoringConfig(sportId)?.color || def?.accent || '#abd600';
  const unit = def?.feed?.scoreUnit || null;
  const copy = { ...DEFAULT_COPY, ...(def?.feed?.copy || {}) };

  const [matches, setMatches] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeComments, setActiveComments] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      legendsApi.getLiveScores({ sport: sportId }),
      legendsApi.getPosts({ sport: sportId }),
    ]).then(([mr, pr]) => {
      setMatches(mr?.data || []);
      setPosts(pr?.data || []);
      setLoading(false);
    });
  }, [sportId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openMatch = (m) => navigation.navigate('MatchStats', { matchId: m.id, sportName });

  const submitPost = async () => {
    const t = composeText.trim();
    if (!t) return;
    setSubmitting(true);
    const res = await legendsApi.createPost({ sport: sportId, text: t });
    setSubmitting(false);
    if (res.success) { setComposeText(''); setShowCompose(false); setPosts((prev) => [res.data, ...prev]); }
  };
  const onLike = async (id) => {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, likes: (p.likes || 0) + 1 } : p)));
    legendsApi.likePost(id);
  };
  const openComments = async (post) => {
    setActiveComments(post); setComments([]);
    const res = await legendsApi.getComments(post.id);
    if (res.success) setComments(res.data);
  };
  const submitComment = async () => {
    const t = commentText.trim();
    if (!t || !activeComments) return;
    const res = await legendsApi.addComment(activeComments.id, t);
    if (res.success) {
      setComments((prev) => [...prev, res.data]);
      setCommentText('');
      setPosts((prev) => prev.map((p) => (p.id === activeComments.id ? { ...p, commentCount: (p.commentCount || 0) + 1 } : p)));
    }
  };

  const live = matches.filter((m) => m.status === 'live');
  const others = matches.filter((m) => m.status !== 'live');

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={D.bg} />
      <View style={s.topBar}>
        <View style={s.brand}>
          <Icon name={sportIcon} size={22} color={accent} />
          <Text style={s.brandTxt}>LOCAL LEGENDS</Text>
          <View style={[s.sportTag, { backgroundColor: accent }]}><Text style={s.sportTagTxt}>{sportName.toUpperCase()}</Text></View>
        </View>
        <View style={s.topActions}>
          <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('GlobalSearch')}>
            <Icon name="magnify" size={23} color={D.ink} />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('Notification')}>
            <Icon name="heart-outline" size={22} color={D.ink} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={s.actions}>
          <TouchableOpacity style={[s.action, { backgroundColor: accent }]} onPress={() => navigation.navigate('StartMatch', { sport: sportObj })}>
            <Icon name={sportIcon} size={20} color={D.bg} />
            <Text style={s.actionTxt}>Start Match</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.action, s.actionAlt]} onPress={() => navigation.navigate('FindCricketers', { sport: sportId })}>
            <Icon name="account-search" size={20} color={accent} />
            <Text style={[s.actionTxt, { color: accent }]}>Find Players</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginVertical: 28 }} color={accent} />
        ) : (
          <>
            {live.length > 0 && (
              <>
                <Text style={s.sectionTitle}>{copy.live}</Text>
                {live.map((m) => <FeaturedMatch key={m.id} m={m} accent={accent} unit={unit} onPress={() => openMatch(m)} />)}
              </>
            )}
            {others.length > 0 && (
              <>
                <Text style={[s.sectionTitle, { marginTop: 18 }]}>{copy.results}</Text>
                <FlatList
                  data={others}
                  keyExtractor={(it) => it.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.rail}
                  renderItem={({ item }) => <ResultCard m={item} accent={accent} onPress={() => openMatch(item)} />}
                />
              </>
            )}
            {matches.length === 0 && (
              <View style={s.empty}>
                <Icon name={sportIcon} size={40} color={D.surfaceHigh} />
                <Text style={s.emptyTitle}>No {sportName.toLowerCase()} matches yet</Text>
                <TouchableOpacity style={[s.startBtn, { backgroundColor: accent }]} onPress={() => navigation.navigate('StartMatch', { sport: sportObj })}>
                  <Icon name={sportIcon} size={16} color={D.bg} />
                  <Text style={s.startTxt}>Start a {sportName} Match</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>{copy.community}</Text>
          <TouchableOpacity onPress={() => setShowCompose(true)}><Text style={[s.postLink, { color: accent }]}>+ Post</Text></TouchableOpacity>
        </View>
        {posts.length === 0 ? (
          <View style={s.empty}>
            <Icon name="account-group-outline" size={40} color={D.surfaceHigh} />
            <Text style={s.emptyTitle}>No posts yet</Text>
            <Text style={s.emptySub}>Be the first to share a {sportName.toLowerCase()} moment.</Text>
          </View>
        ) : posts.map((p) => (
          <View key={p.id} style={s.post}>
            <View style={s.postHead}>
              <View style={[s.postAvatar, { backgroundColor: accent }]}><Text style={s.postAvatarTxt}>{initials(p.authorName || 'You')}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.postAuthor}>{p.authorName}</Text>
                {!!p.team && <Text style={s.postTeam}>{p.team}</Text>}
              </View>
              <Icon name={sportIcon} size={16} color={D.inkDim} />
            </View>
            <Text style={s.postText}>{p.text}</Text>
            <View style={s.postActions}>
              <TouchableOpacity style={s.likeRow} onPress={() => onLike(p.id)} hitSlop={8}>
                <Icon name="heart-outline" size={17} color={D.inkDim} />
                <Text style={s.likeTxt}>{p.likes || 0}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.likeRow} onPress={() => openComments(p)} hitSlop={8}>
                <Icon name="comment-outline" size={16} color={D.inkDim} />
                <Text style={s.likeTxt}>{p.commentCount || 0}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* compose modal */}
      <Modal visible={showCompose} transparent animationType="slide" onRequestClose={() => setShowCompose(false)}>
        <View style={s.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowCompose(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.sheet}>
              <View style={s.grab} />
              <Text style={s.sheetTitle}>{copy.compose}</Text>
              <TextInput
                style={s.composeInput}
                placeholder={`What's happening in ${sportName.toLowerCase()}?`}
                placeholderTextColor={D.inkDim}
                value={composeText} onChangeText={setComposeText}
                multiline autoFocus maxLength={500}
              />
              <TouchableOpacity
                style={[s.startBtn, { backgroundColor: accent, alignSelf: 'flex-end', opacity: composeText.trim() ? 1 : 0.5 }]}
                onPress={submitPost} disabled={!composeText.trim() || submitting}
              >
                <Icon name="send" size={15} color={D.bg} />
                <Text style={s.startTxt}>{submitting ? 'Posting…' : 'Post'}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* comments modal */}
      <Modal visible={!!activeComments} transparent animationType="slide" onRequestClose={() => setActiveComments(null)}>
        <View style={s.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setActiveComments(null)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.sheet}>
              <View style={s.grab} />
              <Text style={s.sheetTitle}>Comments</Text>
              <ScrollView style={{ maxHeight: 300 }}>
                {comments.length === 0
                  ? <Text style={s.emptySub}>No comments yet. Be the first.</Text>
                  : comments.map((c) => (
                    <View key={c.id} style={s.commentRow}>
                      <View style={s.commentAvatar}><Text style={s.postAvatarTxt}>{initials(c.authorName || 'You')}</Text></View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={s.commentAuthor}>{c.authorName}</Text>
                        <Text style={s.commentText}>{c.text}</Text>
                      </View>
                    </View>
                  ))}
              </ScrollView>
              <View style={s.commentInputRow}>
                <TextInput
                  style={s.commentInput}
                  placeholder="Add a comment…"
                  placeholderTextColor={D.inkDim}
                  value={commentText} onChangeText={setCommentText}
                  onSubmitEditing={submitComment} returnKeyType="send"
                />
                <TouchableOpacity onPress={submitComment} disabled={!commentText.trim()}>
                  <Text style={[s.postLink, { color: accent, opacity: commentText.trim() ? 1 : 0.4 }]}>Post</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: D.line },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandTxt: { color: D.ink, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  sportTag: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  sportTagTxt: { color: D.bg, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 18 },

  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 16 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 13 },
  actionAlt: { backgroundColor: D.surface, borderWidth: 1, borderColor: D.line },
  actionTxt: { color: D.bg, fontSize: 14, fontWeight: '800' },

  sectionTitle: { color: D.ink, fontSize: 18, fontWeight: '800', paddingHorizontal: 16, paddingTop: 18 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20 },
  postLink: { fontSize: 13, fontWeight: '800' },

  feature: { backgroundColor: D.surfaceLow, borderRadius: 20, marginHorizontal: 16, marginTop: 12, padding: 16, borderWidth: 1 },
  featTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: D.live },
  liveTxt: { color: D.live, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  featComp: { color: D.inkDim, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  featTeams: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  featCol: { flex: 1, alignItems: 'center', gap: 4 },
  featBadge: { width: 52, height: 52, borderRadius: 26, backgroundColor: D.surfaceHigh, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  featBadgeTxt: { color: D.ink, fontWeight: '900', fontSize: 17 },
  featName: { color: D.ink, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  featScore: { fontSize: 28, fontWeight: '900' },
  featUnit: { color: D.inkDim, fontSize: 10, fontWeight: '700', marginTop: -2 },
  featVs: { position: 'absolute', alignSelf: 'center', top: 18, color: D.inkDim, fontSize: 12, fontWeight: '800' },
  featFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: D.line },
  featVenue: { flex: 1, color: D.inkDim, fontSize: 12 },
  featCta: { fontSize: 12, fontWeight: '800' },

  rail: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  resCard: { width: 220, backgroundColor: D.surfaceLow, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: D.line },
  resTag: { color: D.inkDim, fontSize: 9, fontWeight: '800', letterSpacing: 0.6, marginBottom: 10 },
  resRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  resBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: D.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  resBadgeTxt: { color: D.ink, fontSize: 10, fontWeight: '800' },
  resName: { flex: 1, color: D.ink, fontSize: 13, fontWeight: '600', marginLeft: 9 },
  resScore: { color: D.ink, fontSize: 15, fontWeight: '800' },
  resFoot: { fontSize: 11, fontWeight: '700', marginTop: 10 },

  empty: { alignItems: 'center', marginHorizontal: 16, marginTop: 12, paddingVertical: 28, backgroundColor: D.surfaceLow, borderRadius: 18, borderWidth: 1, borderColor: D.line, gap: 6 },
  emptyTitle: { color: D.ink, fontSize: 15, fontWeight: '700', marginTop: 4 },
  emptySub: { color: D.inkDim, fontSize: 13 },
  startBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, marginTop: 8 },
  startTxt: { color: D.bg, fontSize: 13, fontWeight: '800' },

  post: { backgroundColor: D.surfaceLow, marginHorizontal: 16, marginTop: 12, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: D.line },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  postAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  postAvatarTxt: { color: D.white, fontSize: 13, fontWeight: '800' },
  postAuthor: { color: D.ink, fontSize: 14, fontWeight: '800' },
  postTeam: { color: D.inkDim, fontSize: 12, marginTop: 1 },
  postText: { color: D.ink, fontSize: 14, lineHeight: 20 },
  postActions: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 10 },
  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  likeTxt: { color: D.inkDim, fontSize: 13, fontWeight: '700' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: D.surfaceLow, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28 },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: D.surfaceHigh, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { color: D.ink, fontSize: 16, fontWeight: '800', marginBottom: 10 },
  composeInput: { backgroundColor: D.surfaceHigh, borderRadius: 12, padding: 14, color: D.ink, fontSize: 15, minHeight: 90, textAlignVertical: 'top' },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: D.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  commentAuthor: { color: D.ink, fontSize: 13, fontWeight: '800' },
  commentText: { color: D.ink, fontSize: 13.5, marginTop: 1 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: D.line, paddingTop: 12, marginTop: 8 },
  commentInput: { flex: 1, color: D.ink, fontSize: 14, paddingVertical: 6 },
});
