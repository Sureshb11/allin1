import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

const makeCategoryColors = (DS) => ({
  General:     DS.blue,
  Match:       DS.lime,
  Tournament:  '#c4b5fd',
  Team:        '#7dd3fc',
  Player:      DS.coral,
});

function formatTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function estimateReadTime(text) {
  const words = (text || '').split(' ').length;
  return `${Math.max(1, Math.ceil(words / 200))} min read`;
}

function NewsCard({ item }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const CATEGORY_COLORS = makeCategoryColors(DS);
  const catColor = CATEGORY_COLORS[item.category] || DS.blue;
  return (
    <View style={styles.card}>
      {/* Category + time row */}
      <View style={styles.cardTop}>
        <View style={[styles.catPill, { backgroundColor: catColor }]}>
          <Text style={styles.catPillText}>{item.category}</Text>
        </View>
        <View style={styles.metaRight}>
          <Icon name="clock-outline" size={11} color={DS.textMuted} />
          <Text style={styles.timeText}>{item.time}</Text>
        </View>
      </View>

      {/* Title */}
      <Text style={styles.title}>{item.title}</Text>

      {/* Summary */}
      {!!item.summary && (
        <Text style={styles.summary} numberOfLines={3}>{item.summary}</Text>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.authorRow}>
          <View style={styles.authorAvatar}>
            <Text style={styles.authorInitial}>{(item.author || 'A')[0].toUpperCase()}</Text>
          </View>
          <Text style={styles.authorName} numberOfLines={1}>{item.author}</Text>
        </View>
        <View style={styles.readRow}>
          <Icon name="book-open-outline" size={11} color={DS.textMuted} />
          <Text style={styles.readTime}>{item.readTime}</Text>
        </View>
      </View>
    </View>
  );
}

export default function NewsFeedScreen() {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const [news, setNews]           = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading]     = useState(true);

  const loadNews = async () => {
    try {
      const res = await legendsApi.getCricketNews();
      if (res.success) {
        setNews((res.data || []).map(item => ({
          id:       item.id,
          title:    item.title,
          summary:  item.summary || (item.body || '').substring(0, 140) + '…',
          category: item.category || 'General',
          time:     formatTime(item.createdAt),
          author:   item.author || 'Local Legends',
          readTime: estimateReadTime(item.body || ''),
        })));
      }
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { loadNews(); }, []);

  const onRefresh = async () => { setRefreshing(true); await loadNews(); setRefreshing(false); };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={DS.lime} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Hero header */}
      <View style={styles.hero}>
        <Icon name="newspaper-variant-outline" size={20} color={DS.lime} />
        <Text style={styles.heroTitle}>Cricket News</Text>
        <Text style={styles.heroCount}>{news.length} stories</Text>
      </View>

      <FlatList
        data={news}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} />}
        renderItem={({ item }) => <NewsCard item={item} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="newspaper-variant-outline" size={52} color={DS.textMuted} />
            <Text style={styles.emptyTitle}>No news yet</Text>
            <Text style={styles.emptySub}>Check back soon for cricket updates</Text>
          </View>
        }
      />
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16,
  },
  heroTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: DS.textPrimary },
  heroCount: { fontSize: 12, color: DS.textMuted, fontWeight: '600' },

  list: { padding: 16, gap: 12 },

  card: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  catPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  catPillText: { fontSize: 10, fontWeight: '800', color: DS.bg, letterSpacing: 0.4 },
  metaRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeText: { fontSize: 11, color: DS.textMuted },

  title: { fontSize: 16, fontWeight: '800', color: DS.textPrimary, lineHeight: 22, marginBottom: 6 },
  summary: { fontSize: 13, color: DS.textVariant, lineHeight: 20, marginBottom: 12 },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 10,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  authorAvatar: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center',
  },
  authorInitial: { fontSize: 9, fontWeight: '900', color: DS.lime },
  authorName: { fontSize: 12, color: DS.textVariant, fontWeight: '600', flex: 1 },
  readRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  readTime: { fontSize: 11, color: DS.textMuted },

  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: DS.textVariant },
  emptySub: { fontSize: 13, color: DS.textMuted },
});
