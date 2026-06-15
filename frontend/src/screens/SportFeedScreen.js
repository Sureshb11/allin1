// SportFeedScreen — generic landing feed for non-cricket sports.
// Shows the active sport's recent matches (real data, ?sport=) plus a
// community area. Cricket keeps its dedicated CricketFeedScreen.

import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList,
  StatusBar, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport } from '../utils/selectedSport';

const DS = {
  bg: '#0f131f', surfaceLow: '#171b28', surfaceHigh: '#262a37', surfaceHighest: '#313442',
  lime: '#abd600', blue: '#b7c4ff', textPrimary: '#dfe2f3', textVariant: '#c3c5d9',
  textMuted: '#8d90a2', live: '#ef4444', line: 'rgba(150,170,210,0.10)',
};

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Sport');
const teamName = (t) => (typeof t === 'object' ? (t?.name || 'Team') : String(t || 'Team'));
const initials = (n) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function MatchCard({ m, sportName }) {
  const live = m.status === 'live';
  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <Text style={s.cardTag}>{(m.matchType || sportName).toUpperCase()}</Text>
        {live ? (
          <View style={s.liveRow}><View style={s.liveDot} /><Text style={s.liveTxt}>LIVE</Text></View>
        ) : (
          <Text style={s.cardWhen}>{m.status === 'completed' ? 'FT' : 'Upcoming'}</Text>
        )}
      </View>
      {[[m.team1, m.score1], [m.team2, m.score2]].map(([t, sc], i) => (
        <View key={i} style={s.teamRow}>
          <View style={s.badge}><Text style={s.badgeTxt}>{initials(teamName(t))}</Text></View>
          <Text style={s.teamName} numberOfLines={1}>{teamName(t)}</Text>
          <Text style={s.teamScore}>{sc ?? '—'}</Text>
        </View>
      ))}
      <View style={s.cardDivider} />
      <Text style={s.resultTxt} numberOfLines={1}>{m.result || m.venue || `${sportName} match`}</Text>
    </View>
  );
}

export default function SportFeedScreen({ navigation }) {
  const sport = getSelectedSport().sport;
  const sportId = sport?.id || 'cricket';
  const sportName = sport?.name || cap(sportId);

  const [matches, setMatches] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeComments, setActiveComments] = useState(null); // post being commented on
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

  const submitPost = async () => {
    const t = composeText.trim();
    if (!t) return;
    setSubmitting(true);
    const res = await legendsApi.createPost({ sport: sportId, text: t });
    setSubmitting(false);
    if (res.success) {
      setComposeText('');
      setShowCompose(false);
      setPosts((prev) => [res.data, ...prev]);
    }
  };

  const onLike = async (id) => {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, likes: (p.likes || 0) + 1 } : p)));
    legendsApi.likePost(id);
  };

  const openComments = async (post) => {
    setActiveComments(post);
    setComments([]);
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

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />

      {/* top bar */}
      <View style={s.topBar}>
        <View style={s.brand}>
          <Icon name={sport?.icon || 'trophy'} size={22} color={DS.lime} />
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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {/* recent matches */}
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>Recent {sportName} Matches</Text>
        </View>
        {loading ? (
          <ActivityIndicator style={{ marginVertical: 24 }} color={DS.lime} />
        ) : matches.length === 0 ? (
          <View style={s.emptyMatches}>
            <Icon name={sport?.icon || 'trophy-outline'} size={40} color={DS.surfaceHighest} />
            <Text style={s.emptyTitle}>No {sportName.toLowerCase()} matches yet</Text>
            <TouchableOpacity style={s.startBtn} onPress={() => navigation.navigate('StartMatch', { sport })}>
              <Icon name={sport?.icon || 'plus'} size={16} color={DS.bg} />
              <Text style={s.startTxt}>Start a {sportName} Match</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={matches}
            keyExtractor={(it) => it.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.rail}
            renderItem={({ item }) => <MatchCard m={item} sportName={sportName} />}
          />
        )}

        {/* community */}
        <View style={[s.sectionHead, { marginTop: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
          <Text style={s.sectionTitle}>From the Community</Text>
          <TouchableOpacity onPress={() => setShowCompose(true)}>
            <Text style={{ color: DS.lime, fontSize: 13, fontWeight: '800' }}>+ Post</Text>
          </TouchableOpacity>
        </View>
        {posts.length === 0 ? (
          <View style={s.communityCard}>
            <Icon name="account-group-outline" size={40} color={DS.surfaceHighest} />
            <Text style={s.emptyTitle}>No posts yet</Text>
            <Text style={s.emptySub}>Be the first to share a {sportName.toLowerCase()} moment.</Text>
            <TouchableOpacity style={[s.startBtn, { marginTop: 12 }]} onPress={() => setShowCompose(true)}>
              <Icon name="plus" size={16} color={DS.bg} />
              <Text style={s.startTxt}>Create a post</Text>
            </TouchableOpacity>
          </View>
        ) : (
          posts.map((p) => (
            <View key={p.id} style={s.postCard}>
              <View style={s.postHead}>
                <View style={s.postAvatar}><Text style={s.badgeTxt}>{initials(p.authorName || 'You')}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.postAuthor}>{p.authorName}</Text>
                  {!!p.team && <Text style={s.postTeam}>{p.team}</Text>}
                </View>
              </View>
              <Text style={s.postText}>{p.text}</Text>
              <View style={s.postActions}>
                <TouchableOpacity style={s.likeRow} onPress={() => onLike(p.id)} hitSlop={8}>
                  <Icon name="heart-outline" size={17} color={DS.textMuted} />
                  <Text style={s.likeTxt}>{p.likes || 0}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.likeRow} onPress={() => openComments(p)} hitSlop={8}>
                  <Icon name="comment-outline" size={16} color={DS.textMuted} />
                  <Text style={s.likeTxt}>{p.commentCount || 0}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* compose modal */}
      <Modal visible={showCompose} transparent animationType="slide" onRequestClose={() => setShowCompose(false)}>
        <View style={s.modalBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowCompose(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.sheet}>
              <View style={s.grab} />
              <Text style={s.sheetTitle}>Share a {sportName.toLowerCase()} moment</Text>
              <TextInput
                style={s.composeInput}
                placeholder={`What's happening in ${sportName.toLowerCase()}?`}
                placeholderTextColor={DS.textMuted}
                value={composeText}
                onChangeText={setComposeText}
                multiline
                autoFocus
                maxLength={500}
              />
              <TouchableOpacity
                style={[s.startBtn, { alignSelf: 'flex-end', opacity: composeText.trim() ? 1 : 0.5 }]}
                onPress={submitPost}
                disabled={!composeText.trim() || submitting}
              >
                <Icon name="send" size={15} color={DS.bg} />
                <Text style={s.startTxt}>{submitting ? 'Posting…' : 'Post'}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* comments modal */}
      <Modal visible={!!activeComments} transparent animationType="slide" onRequestClose={() => setActiveComments(null)}>
        <View style={s.modalBackdrop}>
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
                      <View style={s.commentAvatar}><Text style={s.badgeTxt}>{initials(c.authorName || 'You')}</Text></View>
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
                  placeholderTextColor={DS.textMuted}
                  value={commentText}
                  onChangeText={setCommentText}
                  onSubmitEditing={submitComment}
                  returnKeyType="send"
                />
                <TouchableOpacity onPress={submitComment} disabled={!commentText.trim()}>
                  <Text style={[s.postBtnTxt, { opacity: commentText.trim() ? 1 : 0.4 }]}>Post</Text>
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
  root: { flex: 1, backgroundColor: DS.bg },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingBottom: 10, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: DS.line,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandTxt: { color: DS.textPrimary, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 18 },

  sectionHead: { paddingHorizontal: 16, paddingTop: 16 },
  sectionTitle: { color: DS.textPrimary, fontSize: 18, fontWeight: '800' },

  rail: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  card: { width: 248, backgroundColor: DS.surfaceLow, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: DS.line },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardTag: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6, color: DS.lime },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: DS.live },
  liveTxt: { color: DS.live, fontSize: 10, fontWeight: '800' },
  cardWhen: { color: DS.textMuted, fontSize: 11, fontWeight: '700' },
  teamRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  badge: { width: 26, height: 26, borderRadius: 8, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { color: DS.textPrimary, fontSize: 10, fontWeight: '800' },
  teamName: { flex: 1, color: DS.textVariant, fontSize: 13, fontWeight: '600', marginLeft: 9 },
  teamScore: { color: DS.textPrimary, fontSize: 15, fontWeight: '800' },
  cardDivider: { height: 1, backgroundColor: DS.line, marginTop: 10, marginBottom: 8 },
  resultTxt: { color: DS.lime, fontSize: 11.5, fontWeight: '700' },

  emptyMatches: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  communityCard: { alignItems: 'center', marginHorizontal: 16, marginTop: 12, paddingVertical: 28, backgroundColor: DS.surfaceLow, borderRadius: 18, borderWidth: 1, borderColor: DS.line, gap: 6 },
  emptyTitle: { color: DS.textVariant, fontSize: 15, fontWeight: '700', marginTop: 4 },
  emptySub: { color: DS.textMuted, fontSize: 13 },
  startBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: DS.lime, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, marginTop: 8 },
  startTxt: { color: DS.bg, fontSize: 13, fontWeight: '800' },

  postCard: { backgroundColor: DS.surfaceLow, marginHorizontal: 16, marginTop: 12, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: DS.line },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  postAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center' },
  postAuthor: { color: DS.textPrimary, fontSize: 14, fontWeight: '800' },
  postTeam: { color: DS.textMuted, fontSize: 12, marginTop: 1 },
  postText: { color: DS.textVariant, fontSize: 14, lineHeight: 20 },
  postActions: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 10 },
  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  likeTxt: { color: DS.textMuted, fontSize: 13, fontWeight: '700' },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  commentAuthor: { color: DS.textPrimary, fontSize: 13, fontWeight: '800' },
  commentText: { color: DS.textVariant, fontSize: 13.5, marginTop: 1 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: DS.line, paddingTop: 12, marginTop: 8 },
  commentInput: { flex: 1, color: DS.textPrimary, fontSize: 14, paddingVertical: 6 },
  postBtnTxt: { color: DS.lime, fontSize: 14, fontWeight: '800' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: DS.surfaceLow, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28 },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: DS.surfaceHighest, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { color: DS.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: 10 },
  composeInput: { backgroundColor: DS.surfaceHigh, borderRadius: 12, padding: 14, color: DS.textPrimary, fontSize: 15, minHeight: 90, textAlignVertical: 'top' },
});
