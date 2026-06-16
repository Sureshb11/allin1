// FootballFeedScreen — dedicated landing feed for Football (real data via /matches
// ?sport=football and /posts?sport=football). Bespoke pitch-green look: a featured
// LIVE match, a recent-results rail, quick actions, and an Instagram-style community
// feed with like / comment / compose. Tapping a match opens MatchStats.
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList,
  StatusBar, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';

const F = {
  bg: '#0c1116', surfaceLow: '#141c22', surface: '#18222a', surfaceHigh: '#22303a',
  pitch: '#16a34a', pitchDim: '#15803d', mint: '#4ade80', ink: '#eaf2ee',
  inkDim: '#8ea0a0', line: 'rgba(120,200,150,0.12)', live: '#ef4444', white: '#f8fafc',
};
const SPORT = { id: 'football', name: 'Football', icon: 'soccer' };

const teamName = (t) => (typeof t === 'object' ? (t?.name || 'Team') : String(t || 'Team'));
const initials = (n) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function FeaturedMatch({ m, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.9} style={f.feature} onPress={onPress}>
      <View style={f.featTop}>
        <View style={f.liveRow}><View style={f.liveDot} /><Text style={f.liveTxt}>LIVE</Text></View>
        <Text style={f.featComp}>{(m.matchType || 'Match').toUpperCase()}</Text>
      </View>
      <View style={f.featTeams}>
        {[[m.team1, m.score1], [m.team2, m.score2]].map(([t, sc], i) => (
          <View key={i} style={f.featCol}>
            <View style={f.featBadge}><Text style={f.featBadgeTxt}>{initials(teamName(t))}</Text></View>
            <Text style={f.featName} numberOfLines={1}>{teamName(t)}</Text>
            <Text style={f.featScore}>{sc ?? '0'}</Text>
          </View>
        ))}
        <Text style={f.featVs}>vs</Text>
      </View>
      <View style={f.featFoot}>
        <Icon name="stadium-variant" size={13} color={F.inkDim} />
        <Text style={f.featVenue} numberOfLines={1}>{m.venue || 'Football ground'}</Text>
        <Text style={f.featCta}>View stats ›</Text>
      </View>
    </TouchableOpacity>
  );
}

function ResultCard({ m, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.85} style={f.resCard} onPress={onPress}>
      <Text style={f.resTag}>{m.status === 'completed' ? 'FULL TIME' : 'UPCOMING'}</Text>
      {[[m.team1, m.score1], [m.team2, m.score2]].map(([t, sc], i) => (
        <View key={i} style={f.resRow}>
          <View style={f.resBadge}><Text style={f.resBadgeTxt}>{initials(teamName(t))}</Text></View>
          <Text style={f.resName} numberOfLines={1}>{teamName(t)}</Text>
          <Text style={f.resScore}>{sc ?? '—'}</Text>
        </View>
      ))}
      <Text style={f.resFoot} numberOfLines={1}>{m.result || m.venue || 'Football match'}</Text>
    </TouchableOpacity>
  );
}

export default function FootballFeedScreen({ navigation }) {
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
      legendsApi.getLiveScores({ sport: 'football' }),
      legendsApi.getPosts({ sport: 'football' }),
    ]).then(([mr, pr]) => {
      setMatches(mr?.data || []);
      setPosts(pr?.data || []);
      setLoading(false);
    });
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openMatch = (m) => navigation.navigate('MatchStats', { matchId: m.id, sportName: 'Football' });

  const submitPost = async () => {
    const t = composeText.trim();
    if (!t) return;
    setSubmitting(true);
    const res = await legendsApi.createPost({ sport: 'football', text: t });
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
    <View style={f.root}>
      <StatusBar barStyle="light-content" backgroundColor={F.bg} />
      <View style={f.topBar}>
        <View style={f.brand}>
          <Icon name="soccer" size={22} color={F.mint} />
          <Text style={f.brandTxt}>LOCAL LEGENDS</Text>
          <View style={f.sportTag}><Text style={f.sportTagTxt}>FOOTBALL</Text></View>
        </View>
        <View style={f.topActions}>
          <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('GlobalSearch')}>
            <Icon name="magnify" size={23} color={F.ink} />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('Notification')}>
            <Icon name="heart-outline" size={22} color={F.ink} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>
        {/* Quick actions */}
        <View style={f.actions}>
          <TouchableOpacity style={f.action} onPress={() => navigation.navigate('StartMatch', { sport: SPORT })}>
            <Icon name="whistle" size={20} color={F.bg} />
            <Text style={f.actionTxt}>Start Match</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[f.action, f.actionAlt]} onPress={() => navigation.navigate('FindCricketers', { sport: 'football' })}>
            <Icon name="account-search" size={20} color={F.mint} />
            <Text style={[f.actionTxt, { color: F.mint }]}>Find Players</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginVertical: 28 }} color={F.mint} />
        ) : (
          <>
            {/* Featured live */}
            {live.length > 0 && (
              <>
                <Text style={f.sectionTitle}>Live Now</Text>
                {live.map((m) => <FeaturedMatch key={m.id} m={m} onPress={() => openMatch(m)} />)}
              </>
            )}

            {/* Recent results rail */}
            {others.length > 0 && (
              <>
                <Text style={[f.sectionTitle, { marginTop: 18 }]}>Results & Fixtures</Text>
                <FlatList
                  data={others}
                  keyExtractor={(it) => it.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={f.rail}
                  renderItem={({ item }) => <ResultCard m={item} onPress={() => openMatch(item)} />}
                />
              </>
            )}

            {matches.length === 0 && (
              <View style={f.empty}>
                <Icon name="soccer" size={40} color={F.surfaceHigh} />
                <Text style={f.emptyTitle}>No football matches yet</Text>
                <TouchableOpacity style={f.startBtn} onPress={() => navigation.navigate('StartMatch', { sport: SPORT })}>
                  <Icon name="whistle" size={16} color={F.bg} />
                  <Text style={f.startTxt}>Start a Match</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* Community */}
        <View style={f.sectionRow}>
          <Text style={f.sectionTitle}>The Dressing Room</Text>
          <TouchableOpacity onPress={() => setShowCompose(true)}><Text style={f.postLink}>+ Post</Text></TouchableOpacity>
        </View>
        {posts.length === 0 ? (
          <View style={f.empty}>
            <Icon name="account-group-outline" size={40} color={F.surfaceHigh} />
            <Text style={f.emptyTitle}>No posts yet</Text>
            <Text style={f.emptySub}>Be the first to share a football moment.</Text>
          </View>
        ) : posts.map((p) => (
          <View key={p.id} style={f.post}>
            <View style={f.postHead}>
              <View style={f.postAvatar}><Text style={f.postAvatarTxt}>{initials(p.authorName || 'You')}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={f.postAuthor}>{p.authorName}</Text>
                {!!p.team && <Text style={f.postTeam}>{p.team}</Text>}
              </View>
              <Icon name="soccer" size={16} color={F.pitchDim} />
            </View>
            <Text style={f.postText}>{p.text}</Text>
            <View style={f.postActions}>
              <TouchableOpacity style={f.likeRow} onPress={() => onLike(p.id)} hitSlop={8}>
                <Icon name="heart-outline" size={17} color={F.inkDim} />
                <Text style={f.likeTxt}>{p.likes || 0}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={f.likeRow} onPress={() => openComments(p)} hitSlop={8}>
                <Icon name="comment-outline" size={16} color={F.inkDim} />
                <Text style={f.likeTxt}>{p.commentCount || 0}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* compose modal */}
      <Modal visible={showCompose} transparent animationType="slide" onRequestClose={() => setShowCompose(false)}>
        <View style={f.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowCompose(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={f.sheet}>
              <View style={f.grab} />
              <Text style={f.sheetTitle}>Share a football moment</Text>
              <TextInput
                style={f.composeInput}
                placeholder="What's happening on the pitch?"
                placeholderTextColor={F.inkDim}
                value={composeText} onChangeText={setComposeText}
                multiline autoFocus maxLength={500}
              />
              <TouchableOpacity
                style={[f.startBtn, { alignSelf: 'flex-end', opacity: composeText.trim() ? 1 : 0.5 }]}
                onPress={submitPost} disabled={!composeText.trim() || submitting}
              >
                <Icon name="send" size={15} color={F.bg} />
                <Text style={f.startTxt}>{submitting ? 'Posting…' : 'Post'}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* comments modal */}
      <Modal visible={!!activeComments} transparent animationType="slide" onRequestClose={() => setActiveComments(null)}>
        <View style={f.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setActiveComments(null)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={f.sheet}>
              <View style={f.grab} />
              <Text style={f.sheetTitle}>Comments</Text>
              <ScrollView style={{ maxHeight: 300 }}>
                {comments.length === 0
                  ? <Text style={f.emptySub}>No comments yet. Be the first.</Text>
                  : comments.map((c) => (
                    <View key={c.id} style={f.commentRow}>
                      <View style={f.commentAvatar}><Text style={f.postAvatarTxt}>{initials(c.authorName || 'You')}</Text></View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={f.commentAuthor}>{c.authorName}</Text>
                        <Text style={f.commentText}>{c.text}</Text>
                      </View>
                    </View>
                  ))}
              </ScrollView>
              <View style={f.commentInputRow}>
                <TextInput
                  style={f.commentInput}
                  placeholder="Add a comment…"
                  placeholderTextColor={F.inkDim}
                  value={commentText} onChangeText={setCommentText}
                  onSubmitEditing={submitComment} returnKeyType="send"
                />
                <TouchableOpacity onPress={submitComment} disabled={!commentText.trim()}>
                  <Text style={[f.postLink, { opacity: commentText.trim() ? 1 : 0.4 }]}>Post</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const f = StyleSheet.create({
  root: { flex: 1, backgroundColor: F.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: F.line },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandTxt: { color: F.ink, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  sportTag: { backgroundColor: F.pitch, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  sportTagTxt: { color: F.bg, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 18 },

  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 16 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: F.mint, borderRadius: 14, paddingVertical: 13 },
  actionAlt: { backgroundColor: F.surface, borderWidth: 1, borderColor: F.line },
  actionTxt: { color: F.bg, fontSize: 14, fontWeight: '800' },

  sectionTitle: { color: F.ink, fontSize: 18, fontWeight: '800', paddingHorizontal: 16, paddingTop: 18 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20 },
  postLink: { color: F.mint, fontSize: 13, fontWeight: '800' },

  feature: { backgroundColor: F.surfaceLow, borderRadius: 20, marginHorizontal: 16, marginTop: 12, padding: 16, borderWidth: 1, borderColor: F.line },
  featTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: F.live },
  liveTxt: { color: F.live, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  featComp: { color: F.inkDim, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  featTeams: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  featCol: { flex: 1, alignItems: 'center', gap: 6 },
  featBadge: { width: 52, height: 52, borderRadius: 26, backgroundColor: F.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  featBadgeTxt: { color: F.ink, fontWeight: '900', fontSize: 17 },
  featName: { color: F.ink, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  featScore: { color: F.mint, fontSize: 30, fontWeight: '900' },
  featVs: { position: 'absolute', alignSelf: 'center', top: 18, color: F.inkDim, fontSize: 12, fontWeight: '800' },
  featFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: F.line },
  featVenue: { flex: 1, color: F.inkDim, fontSize: 12 },
  featCta: { color: F.mint, fontSize: 12, fontWeight: '800' },

  rail: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  resCard: { width: 220, backgroundColor: F.surfaceLow, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: F.line },
  resTag: { color: F.inkDim, fontSize: 9, fontWeight: '800', letterSpacing: 0.6, marginBottom: 10 },
  resRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  resBadge: { width: 26, height: 26, borderRadius: 8, backgroundColor: F.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  resBadgeTxt: { color: F.ink, fontSize: 10, fontWeight: '800' },
  resName: { flex: 1, color: F.ink, fontSize: 13, fontWeight: '600', marginLeft: 9 },
  resScore: { color: F.ink, fontSize: 15, fontWeight: '800' },
  resFoot: { color: F.mint, fontSize: 11, fontWeight: '700', marginTop: 10 },

  empty: { alignItems: 'center', marginHorizontal: 16, marginTop: 12, paddingVertical: 28, backgroundColor: F.surfaceLow, borderRadius: 18, borderWidth: 1, borderColor: F.line, gap: 6 },
  emptyTitle: { color: F.ink, fontSize: 15, fontWeight: '700', marginTop: 4 },
  emptySub: { color: F.inkDim, fontSize: 13 },
  startBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: F.mint, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, marginTop: 8 },
  startTxt: { color: F.bg, fontSize: 13, fontWeight: '800' },

  post: { backgroundColor: F.surfaceLow, marginHorizontal: 16, marginTop: 12, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: F.line },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  postAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: F.pitch, alignItems: 'center', justifyContent: 'center' },
  postAvatarTxt: { color: F.white, fontSize: 13, fontWeight: '800' },
  postAuthor: { color: F.ink, fontSize: 14, fontWeight: '800' },
  postTeam: { color: F.inkDim, fontSize: 12, marginTop: 1 },
  postText: { color: F.ink, fontSize: 14, lineHeight: 20 },
  postActions: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 10 },
  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  likeTxt: { color: F.inkDim, fontSize: 13, fontWeight: '700' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: F.surfaceLow, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28 },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: F.surfaceHigh, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { color: F.ink, fontSize: 16, fontWeight: '800', marginBottom: 10 },
  composeInput: { backgroundColor: F.surfaceHigh, borderRadius: 12, padding: 14, color: F.ink, fontSize: 15, minHeight: 90, textAlignVertical: 'top' },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: F.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  commentAuthor: { color: F.ink, fontSize: 13, fontWeight: '800' },
  commentText: { color: F.ink, fontSize: 13.5, marginTop: 1 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: F.line, paddingTop: 12, marginTop: 8 },
  commentInput: { flex: 1, color: F.ink, fontSize: 14, paddingVertical: 6 },
});
