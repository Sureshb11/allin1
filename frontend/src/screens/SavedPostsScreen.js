// SavedPostsScreen — the posts you bookmarked from the feed, opened from Profile.
//
// Sport-scoped, like every other post surface: it shows saves for the sport the
// Arena is currently on, so switching sport shows that sport's saves rather than
// one undivided pile. It follows getSelectedSport() and draws no sport control of
// its own — switching sport belongs to the Arena picker and the Profile dock.
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, StatusBar, Share,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport } from '../utils/selectedSport';
import { getSport } from '../sports';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { useHideTabBarOnScroll, useTabBarClearance } from '../components/AutoHideTabBar';
import PostCard from '../components/PostCard';
import FeedSkeleton from '../components/FeedSkeleton';
import CommentsSheet from '../components/CommentsSheet';
// The API returns posts FLAT (authorName, authorAvatar, …). <PostCard> wants the
// nested `author` shape, so everything goes through the shared mapper — rendering
// a raw API post is what blanked the home feed once already.
import { mapPost } from '../components/FeedShared';

export default function SavedPostsScreen({ navigation }) {
  const { colors: DS, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const hideTabBar = useHideTabBarOnScroll();
  const tabClear = useTabBarClearance();

  const sportId = getSelectedSport().sport?.id || 'cricket';
  const sport = getSport(sportId);

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activePost, setActivePost] = useState(null);

  const load = useCallback(async () => {
    const res = await legendsApi.getSavedPosts(sportId);
    if (res.success) setPosts((res.data || []).map(mapPost));
  }, [sportId]);

  useFocusEffect(useCallback(() => {
    // Reload on every focus, not just on mount: unsaving from the feed has to be
    // reflected here when you come back, and this list is short.
    load().finally(() => setLoading(false));
  }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const toggleLike = useCallback(async (id) => {
    const res = await legendsApi.likePost(id);
    if (res.success) {
      setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, liked: res.liked, likes: res.likes } : p)));
    }
  }, []);

  // Unsaving here removes the row — this list IS the saved set, so leaving a
  // now-unsaved post sitting in it would be lying about what is saved.
  const toggleSave = useCallback(async (post) => {
    const res = await legendsApi.toggleSavePost(post.id);
    if (res.success && !res.saved) setPosts((prev) => prev.filter((p) => p.id !== post.id));
  }, []);

  const sharePost = useCallback((post) => {
    Share.share({ message: `${post.author?.name || 'A player'} on Local Legends: ${post.caption || ''}`.trim() });
  }, []);

  const addComment = useCallback(async (text) => {
    if (!activePost) return;
    const res = await legendsApi.request(`/posts/${activePost.id}/comments`, { method: 'POST', body: { text } });
    if (res.comment) {
      setPosts((prev) => prev.map((p) => (p.id === activePost.id
        ? { ...p, comments: [...(p.comments || []), res.comment], commentCount: (p.commentCount || 0) + 1 }
        : p)));
    }
  }, [activePost]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
          <Icon name="arrow-left" size={22} color={DS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Saved posts</Text>
          <Text style={styles.subtitle}>{sport?.name || 'Cricket'}</Text>
        </View>
      </View>

      <FlatList
        style={styles.feed}
        contentContainerStyle={[styles.feedContent, { paddingBottom: 16 + tabClear }]}
        data={posts}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} />}
        showsVerticalScrollIndicator={false}
        {...hideTabBar}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onLike={toggleLike}
            onShare={sharePost}
            onComment={setActivePost}
            onSave={toggleSave}
            onAuthor={(po) => navigation.navigate('PlayerProfile', {
              playerId: po.authorPlayerId, player: { id: po.authorPlayerId, name: po.author?.name },
            })}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
        ListEmptyComponent={!loading ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconBox}>
              <Icon name="bookmark-outline" size={40} color={DS.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>Nothing saved yet</Text>
            <Text style={styles.emptySub}>
              Tap the bookmark icon under any {(sport?.name || 'cricket').toLowerCase()} post to save it here.
            </Text>
          </View>
        ) : <FeedSkeleton DS={DS} />}
      />

      <CommentsSheet post={activePost} onClose={() => setActivePost(null)} onAdd={addComment} />
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  root: { flex: 1, backgroundColor: DS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: DS.faint,
  },
  back: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, fontWeight: '800', color: DS.textPrimary, letterSpacing: 0.2 },
  subtitle: { fontSize: 12, color: DS.textMuted, fontWeight: '600', marginTop: 1 },
  feed: { flex: 1 },
  feedContent: { paddingHorizontal: 16, paddingTop: 14 },
  emptyCard: { backgroundColor: DS.surface, borderRadius: 20, padding: 40, alignItems: 'center', gap: 8, marginBottom: 16 },
  emptyIconBox: {
    width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
    marginBottom: 4, backgroundColor: DS.surfaceHighest,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: DS.textVariant },
  emptySub: { fontSize: 13, color: DS.textMuted, textAlign: 'center', lineHeight: 19 },
});
