// TennisFeedScreen — dedicated landing feed for Tennis (individual / 1v1 sport).
// Real data via /matches?sport=tennis and /posts?sport=tennis. Court-green theme:
// featured LIVE singles match (Player vs Player, sets score), results rail, quick
// actions, community feed. Tapping a match → MatchStats.
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList,
  StatusBar, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../../../services/LegendsApi';

const T = {
  bg: '#0c130a', surfaceLow: '#141d10', surface: '#1a2615', surfaceHigh: '#26331c',
  court: '#4d7c0f', ball: '#bef264', lime: '#a3e635', ink: '#eef3e8', inkDim: '#9aa890',
  line: 'rgba(163,230,53,0.12)', live: '#ef4444', white: '#f8fafc',
};
const SPORT = { id: 'tennis', name: 'Tennis', icon: 'tennis' };

const sideName = (t) => (typeof t === 'object' ? (t?.name || 'Player') : String(t || 'Player'));
const initials = (n) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function FeaturedMatch({ m, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.9} style={f.feature} onPress={onPress}>
      <View style={f.featTop}>
        <View style={f.liveRow}><View style={f.liveDot} /><Text style={f.liveTxt}>LIVE</Text></View>
        <Text style={f.featComp}>{(m.matchType || 'Singles').toUpperCase()}</Text>
      </View>
      <View style={f.featTeams}>
        {[[m.team1, m.score1], [m.team2, m.score2]].map(([t, sc], i) => (
          <View key={i} style={f.featCol}>
            <View style={f.featBadge}><Text style={f.featBadgeTxt}>{initials(sideName(t))}</Text></View>
            <Text style={f.featName} numberOfLines={1}>{sideName(t)}</Text>
            <Text style={f.featScore}>{sc ?? '0'}</Text>
            <Text style={f.featUnit}>sets</Text>
          </View>
        ))}
        <Text style={f.featVs}>vs</Text>
      </View>
      <View style={f.featFoot}>
        <Icon name="stadium-variant" size={13} color={T.inkDim} />
        <Text style={f.featVenue} numberOfLines={1}>{m.venue || 'Tennis court'}</Text>
        <Text style={f.featCta}>View stats ›</Text>
      </View>
    </TouchableOpacity>
  );
}

function ResultCard({ m, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.85} style={f.resCard} onPress={onPress}>
      <Text style={f.resTag}>{m.status === 'completed' ? 'FINISHED' : 'UPCOMING'}</Text>
      {[[m.team1, m.score1], [m.team2, m.score2]].map(([t, sc], i) => (
        <View key={i} style={f.resRow}>
          <View style={f.resBadge}><Text style={f.resBadgeTxt}>{initials(sideName(t))}</Text></View>
          <Text style={f.resName} numberOfLines={1}>{sideName(t)}</Text>
          <Text style={f.resScore}>{sc ?? '—'}</Text>
        </View>
      ))}
      <Text style={f.resFoot} numberOfLines={1}>{m.result || m.venue || 'Tennis match'}</Text>
    </TouchableOpacity>
  );
}

export default function TennisFeedScreen({ navigation }) {
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
      legendsApi.getLiveScores({ sport: 'tennis' }),
      legendsApi.getPosts({ sport: 'tennis' }),
    ]).then(([mr, pr]) => {
      setMatches(mr?.data || []);
      setPosts(pr?.data || []);
      setLoading(false);
    });
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openMatch = (m) => navigation.navigate('MatchStats', { matchId: m.id, sportName: 'Tennis' });

  const submitPost = async () => {
    const t = composeText.trim();
    if (!t) return;
    setSubmitting(true);
    const res = await legendsApi.createPost({ sport: 'tennis', text: t });
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
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      <View style={f.topBar}>
        <View style={f.brand}>
          <Icon name="tennis" size={22} color={T.ball} />
          <Text style={f.brandTxt}>LOCAL LEGENDS</Text>
          <View style={f.sportTag}><Text style={f.sportTagTxt}>TENNIS</Text></View>
        </View>
        <View style={f.topActions}>
          <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('GlobalSearch')}>
            <Icon name="magnify" size={23} color={T.ink} />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('Notification')}>
            <Icon name="heart-outline" size={22} color={T.ink} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={f.actions}>
          <TouchableOpacity style={f.action} onPress={() => navigation.navigate('StartMatch', { sport: SPORT })}>
            <Icon name="tennis" size={20} color={T.bg} />
            <Text style={f.actionTxt}>Start Match</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[f.action, f.actionAlt]} onPress={() => navigation.navigate('FindCricketers', { sport: 'tennis' })}>
            <Icon name="account-search" size={20} color={T.ball} />
            <Text style={[f.actionTxt, { color: T.ball }]}>Find Players</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginVertical: 28 }} color={T.ball} />
        ) : (
          <>
            {live.length > 0 && (
              <>
                <Text style={f.sectionTitle}>On Court</Text>
                {live.map((m) => <FeaturedMatch key={m.id} m={m} onPress={() => openMatch(m)} />)}
              </>
            )}
            {others.length > 0 && (
              <>
                <Text style={[f.sectionTitle, { marginTop: 18 }]}>Results & Draw</Text>
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
                <Icon name="tennis" size={40} color={T.surfaceHigh} />
                <Text style={f.emptyTitle}>No tennis matches yet</Text>
                <TouchableOpacity style={f.startBtn} onPress={() => navigation.navigate('StartMatch', { sport: SPORT })}>
                  <Icon name="tennis" size={16} color={T.bg} />
                  <Text style={f.startTxt}>Start a Match</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        <View style={f.sectionRow}>
          <Text style={f.sectionTitle}>Baseline Banter</Text>
          <TouchableOpacity onPress={() => setShowCompose(true)}><Text style={f.postLink}>+ Post</Text></TouchableOpacity>
        </View>
        {posts.length === 0 ? (
          <View style={f.empty}>
            <Icon name="account-group-outline" size={40} color={T.surfaceHigh} />
            <Text style={f.emptyTitle}>No posts yet</Text>
            <Text style={f.emptySub}>Be the first to share a tennis moment.</Text>
          </View>
        ) : posts.map((p) => (
          <View key={p.id} style={f.post}>
            <View style={f.postHead}>
              <View style={f.postAvatar}><Text style={f.postAvatarTxt}>{initials(p.authorName || 'You')}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={f.postAuthor}>{p.authorName}</Text>
                {!!p.team && <Text style={f.postTeam}>{p.team}</Text>}
              </View>
              <Icon name="tennis" size={16} color={T.court} />
            </View>
            <Text style={f.postText}>{p.text}</Text>
            <View style={f.postActions}>
              <TouchableOpacity style={f.likeRow} onPress={() => onLike(p.id)} hitSlop={8}>
                <Icon name="heart-outline" size={17} color={T.inkDim} />
                <Text style={f.likeTxt}>{p.likes || 0}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={f.likeRow} onPress={() => openComments(p)} hitSlop={8}>
                <Icon name="comment-outline" size={16} color={T.inkDim} />
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
              <Text style={f.sheetTitle}>Share a tennis moment</Text>
              <TextInput
                style={f.composeInput}
                placeholder="What's happening on court?"
                placeholderTextColor={T.inkDim}
                value={composeText} onChangeText={setComposeText}
                multiline autoFocus maxLength={500}
              />
              <TouchableOpacity
                style={[f.startBtn, { alignSelf: 'flex-end', opacity: composeText.trim() ? 1 : 0.5 }]}
                onPress={submitPost} disabled={!composeText.trim() || submitting}
              >
                <Icon name="send" size={15} color={T.bg} />
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
                  placeholderTextColor={T.inkDim}
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
  root: { flex: 1, backgroundColor: T.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: T.line },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandTxt: { color: T.ink, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  sportTag: { backgroundColor: T.court, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  sportTagTxt: { color: T.white, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 18 },

  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 16 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: T.ball, borderRadius: 14, paddingVertical: 13 },
  actionAlt: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.line },
  actionTxt: { color: T.bg, fontSize: 14, fontWeight: '800' },

  sectionTitle: { color: T.ink, fontSize: 18, fontWeight: '800', paddingHorizontal: 16, paddingTop: 18 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20 },
  postLink: { color: T.ball, fontSize: 13, fontWeight: '800' },

  feature: { backgroundColor: T.surfaceLow, borderRadius: 20, marginHorizontal: 16, marginTop: 12, padding: 16, borderWidth: 1, borderColor: T.line },
  featTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: T.live },
  liveTxt: { color: T.live, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  featComp: { color: T.inkDim, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  featTeams: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  featCol: { flex: 1, alignItems: 'center', gap: 4 },
  featBadge: { width: 52, height: 52, borderRadius: 26, backgroundColor: T.surfaceHigh, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  featBadgeTxt: { color: T.ink, fontWeight: '900', fontSize: 17 },
  featName: { color: T.ink, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  featScore: { color: T.ball, fontSize: 28, fontWeight: '900' },
  featUnit: { color: T.inkDim, fontSize: 10, fontWeight: '700', marginTop: -2 },
  featVs: { position: 'absolute', alignSelf: 'center', top: 18, color: T.inkDim, fontSize: 12, fontWeight: '800' },
  featFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.line },
  featVenue: { flex: 1, color: T.inkDim, fontSize: 12 },
  featCta: { color: T.ball, fontSize: 12, fontWeight: '800' },

  rail: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  resCard: { width: 220, backgroundColor: T.surfaceLow, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: T.line },
  resTag: { color: T.inkDim, fontSize: 9, fontWeight: '800', letterSpacing: 0.6, marginBottom: 10 },
  resRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  resBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: T.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  resBadgeTxt: { color: T.ink, fontSize: 10, fontWeight: '800' },
  resName: { flex: 1, color: T.ink, fontSize: 13, fontWeight: '600', marginLeft: 9 },
  resScore: { color: T.ink, fontSize: 15, fontWeight: '800' },
  resFoot: { color: T.ball, fontSize: 11, fontWeight: '700', marginTop: 10 },

  empty: { alignItems: 'center', marginHorizontal: 16, marginTop: 12, paddingVertical: 28, backgroundColor: T.surfaceLow, borderRadius: 18, borderWidth: 1, borderColor: T.line, gap: 6 },
  emptyTitle: { color: T.ink, fontSize: 15, fontWeight: '700', marginTop: 4 },
  emptySub: { color: T.inkDim, fontSize: 13 },
  startBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: T.ball, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, marginTop: 8 },
  startTxt: { color: T.bg, fontSize: 13, fontWeight: '800' },

  post: { backgroundColor: T.surfaceLow, marginHorizontal: 16, marginTop: 12, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: T.line },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  postAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: T.court, alignItems: 'center', justifyContent: 'center' },
  postAvatarTxt: { color: T.white, fontSize: 13, fontWeight: '800' },
  postAuthor: { color: T.ink, fontSize: 14, fontWeight: '800' },
  postTeam: { color: T.inkDim, fontSize: 12, marginTop: 1 },
  postText: { color: T.ink, fontSize: 14, lineHeight: 20 },
  postActions: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 10 },
  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  likeTxt: { color: T.inkDim, fontSize: 13, fontWeight: '700' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: T.surfaceLow, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28 },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: T.surfaceHigh, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { color: T.ink, fontSize: 16, fontWeight: '800', marginBottom: 10 },
  composeInput: { backgroundColor: T.surfaceHigh, borderRadius: 12, padding: 14, color: T.ink, fontSize: 15, minHeight: 90, textAlignVertical: 'top' },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: T.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  commentAuthor: { color: T.ink, fontSize: 13, fontWeight: '800' },
  commentText: { color: T.ink, fontSize: 13.5, marginTop: 1 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: T.line, paddingTop: 12, marginTop: 8 },
  commentInput: { flex: 1, color: T.ink, fontSize: 14, paddingVertical: 6 },
});
