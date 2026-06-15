// SportFeedScreen — generic landing feed for non-cricket sports.
// Shows the active sport's recent matches (real data, ?sport=) plus a
// community area. Cricket keeps its dedicated CricketFeedScreen.

import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList,
  StatusBar, ActivityIndicator,
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
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    legendsApi.getLiveScores({ sport: sportId }).then((res) => {
      setMatches(res?.data || []);
      setLoading(false);
    });
  }, [sportId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
        <View style={[s.sectionHead, { marginTop: 18 }]}>
          <Text style={s.sectionTitle}>From the Community</Text>
        </View>
        <View style={s.communityCard}>
          <Icon name="account-group-outline" size={40} color={DS.surfaceHighest} />
          <Text style={s.emptyTitle}>No posts yet</Text>
          <Text style={s.emptySub}>Be the first to share a {sportName.toLowerCase()} moment.</Text>
          <TouchableOpacity style={[s.startBtn, { marginTop: 12 }]} onPress={() => navigation.navigate('CreatePost')}>
            <Icon name="plus" size={16} color={DS.bg} />
            <Text style={s.startTxt}>Create a post</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
});
