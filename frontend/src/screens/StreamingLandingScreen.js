import { useTheme, useThemedStyles } from "../theme/ThemeContext";import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, StatusBar } from
'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';















function StreamCard({ item, onPress }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const isLive = item.status === 'live';
  return (
    <TouchableOpacity style={styles.streamCard} onPress={onPress} activeOpacity={0.85}>
      {/* Thumbnail */}
      <View style={[styles.streamThumb, isLive && styles.streamThumbLive]}>
        <Icon name={isLive ? 'broadcast' : 'play-circle-outline'} size={32} color={isLive ? DS.live : DS.lime} />
        {isLive &&
        <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        }
      </View>
      <View style={styles.streamBody}>
        <Text style={styles.streamTitle} numberOfLines={2}>{item.title}</Text>
        {!!item.teams && <Text style={styles.streamTeams} numberOfLines={1}>{item.teams}</Text>}
        <View style={styles.streamMeta}>
          {!!item.time &&
          <View style={styles.metaItem}>
              <Icon name="clock-outline" size={11} color={DS.textMuted} />
              <Text style={styles.metaText}>{item.time}</Text>
            </View>
          }
          <View style={styles.metaItem}>
            <Icon name="eye-outline" size={11} color={DS.textMuted} />
            <Text style={styles.metaText}>{item.viewers || 0} viewers</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>);

}

const StreamingLandingScreen = ({ navigation }) => {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const [liveStreams, setLiveStreams] = useState([]);
  const [upcomingStreams, setUpcomingStreams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {loadData();}, []);

  const loadData = async () => {
    try {
      const [lRes, uRes] = await Promise.all([
      legendsApi.getLiveStreams(),
      legendsApi.getUpcomingStreams()]
      );
      if (lRes.success) setLiveStreams(lRes.data);
      if (uRes.success) setUpcomingStreams(uRes.data);
    } catch {Alert.alert('Error', 'Failed to load streams');} finally
    {setLoading(false);}
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <StatusBar barStyle="light-content" backgroundColor={DS.bg} />
        <ActivityIndicator size="large" color={DS.lime} />
      </View>);

  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />
      {/* Hero */}
      <View style={styles.hero}>
        <Icon name="broadcast" size={20} color={DS.textMuted} />
        <Text style={styles.heroTitle}>Live Streaming</Text>
        <TouchableOpacity style={styles.startPill} onPress={() => navigation.navigate('CreateStream')}>
          <Icon name="play" size={13} color={DS.bg} />
          <Text style={styles.startPillText}>Start</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={upcomingStreams}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
        <>
            {/* Live Now */}
            <View style={styles.sectionHeader}>
              <View style={styles.liveDotLarge} />
              <Text style={styles.sectionTitle}>LIVE NOW</Text>
            </View>
            {liveStreams.length > 0 ?
          <FlatList
            data={liveStreams}
            horizontal
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingBottom: 4 }}
            renderItem={({ item }) =>
            <StreamCard item={item} onPress={() => navigation.navigate('VideoStreaming', { streamId: item.id })} />
            } /> :


          <View style={styles.emptyInline}>
                <Icon name="broadcast-off" size={28} color={DS.textMuted} />
                <Text style={styles.emptyInlineText}>No live streams right now</Text>
              </View>
          }

            <View style={[styles.sectionHeader, { marginTop: 16 }]}>
              <Icon name="calendar-clock" size={16} color={DS.lime} />
              <Text style={styles.sectionTitle}>UPCOMING STREAMS</Text>
            </View>
          </>
        }
        renderItem={({ item }) =>
        <StreamCard
          item={item}
          onPress={() => navigation.navigate('VideoStreaming', { streamId: item.id })} />

        }
        ListEmptyComponent={
        <View style={styles.empty}>
            <Icon name="calendar-blank-outline" size={48} color={DS.textMuted} />
            <Text style={styles.emptyTitle}>No upcoming streams</Text>
            <Text style={styles.emptySub}>Be the first to schedule a stream</Text>
          </View>
        } />
      
    </View>);

};

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16
  },
  heroTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: DS.textPrimary },
  startPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DS.lime, borderRadius: 24, paddingHorizontal: 12, paddingVertical: 5
  },
  startPillText: { fontSize: 12, fontWeight: '700', color: DS.bg },

  list: { padding: 16, paddingBottom: 32 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: DS.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' },
  liveDotLarge: { width: 10, height: 10, borderRadius: 5, backgroundColor: DS.live },

  streamCard: {
    width: 260, backgroundColor: DS.surfaceHigh, borderRadius: 16, marginBottom: 12
  },
  streamThumb: {
    height: 110, backgroundColor: DS.surfaceLow, borderTopLeftRadius: 16,
    borderTopRightRadius: 16, alignItems: 'center', justifyContent: 'center'
  },
  streamThumbLive: { backgroundColor: 'rgba(239,68,68,0.15)' },
  livePill: {
    position: 'absolute', top: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DS.live, borderRadius: 24, paddingHorizontal: 8, paddingVertical: 3
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText: { fontSize: 10, fontWeight: '900', color: '#fff' },
  streamBody: { padding: 10, gap: 4 },
  streamTitle: { fontSize: 14, fontWeight: '800', color: DS.textPrimary },
  streamTeams: { fontSize: 12, color: DS.textVariant },
  streamMeta: { flexDirection: 'row', gap: 10, marginTop: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: DS.textMuted },

  emptyInline: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  emptyInlineText: { fontSize: 13, color: DS.textMuted },
  empty: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: DS.textVariant },
  emptySub: { fontSize: 13, color: DS.textMuted }
});

export default StreamingLandingScreen;