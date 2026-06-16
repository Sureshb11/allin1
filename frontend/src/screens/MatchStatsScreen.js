// MatchStatsScreen — match view for event-based sports (football, basketball, …).
// Shows the live/final score, per-period breakdown, and sport aggregates
// (football: cards & corners) from GET /matches/:id/sport-stats.
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';

const A = {
  bg: '#0f131f', surfaceLow: '#171b28', surface: '#1b1f2c', surfaceHigh: '#262a37',
  line: 'rgba(150,170,210,0.10)', ink: '#dfe2f3', inkDim: '#8d90a2', lime: '#abd600',
  yellow: '#eab308', red: '#ef4444',
};

const teamName = (t) => (typeof t === 'string' ? t : t?.name) || 'Team';

// team1 vs team2 comparison row
const StatRow = ({ label, a, b, aColor = A.ink, bColor = A.ink }) => (
  <View style={s.statRow}>
    <Text style={[s.statVal, { color: aColor, textAlign: 'left' }]}>{a}</Text>
    <Text style={s.statLabel}>{label}</Text>
    <Text style={[s.statVal, { color: bColor, textAlign: 'right' }]}>{b}</Text>
  </View>
);

export default function MatchStatsScreen({ navigation, route }) {
  const { matchId, sportName = 'Match' } = route.params || {};
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let alive = true;
    setLoading(true);
    legendsApi.getSportStats(matchId).then((res) => {
      if (!alive) return;
      setStats(res?.success ? res.data : null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [matchId]));

  const t1 = teamName(stats?.team1);
  const t2 = teamName(stats?.team2);
  const sc1 = stats?.score?.score1 ?? '—';
  const sc2 = stats?.score?.score2 ?? '—';
  const cards = stats?.cards;
  const corners = stats?.corners;
  const games = stats?.games;     // badminton / table tennis
  const points = stats?.points;
  const aces = stats?.aces;
  const doubleFaults = stats?.doubleFaults;   // tennis
  const periods = stats?.periodBreakdown || [];
  const hasStats = cards || corners || games || points || aces || doubleFaults;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={A.bg} />
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="chevron-left" size={26} color={A.ink} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{sportName} · Match Stats</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={A.lime} />
      ) : !stats ? (
        <Text style={s.empty}>Couldn’t load match stats.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Scoreboard */}
          <View style={s.scoreCard}>
            <View style={s.teamCol}>
              <View style={s.badge}><Text style={s.badgeTxt}>{t1.slice(0, 2).toUpperCase()}</Text></View>
              <Text style={s.teamName} numberOfLines={2}>{t1}</Text>
            </View>
            <View style={s.scoreMid}>
              <Text style={s.score}>{sc1} <Text style={s.scoreDash}>–</Text> {sc2}</Text>
            </View>
            <View style={s.teamCol}>
              <View style={s.badge}><Text style={s.badgeTxt}>{t2.slice(0, 2).toUpperCase()}</Text></View>
              <Text style={s.teamName} numberOfLines={2}>{t2}</Text>
            </View>
          </View>

          {/* Period breakdown */}
          {periods.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>By Period</Text>
              {periods.map((p) => (
                <StatRow key={p.period} label={`Period ${p.period}`} a={p.score1} b={p.score2} />
              ))}
            </View>
          )}

          {/* Sport aggregates */}
          {hasStats && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Match Stats</Text>
              {/* football */}
              {corners && <StatRow label="Corners" a={corners.team1} b={corners.team2} />}
              {cards && (
                <>
                  <StatRow label="Yellow cards" a={cards.team1.yellow} b={cards.team2.yellow} aColor={A.yellow} bColor={A.yellow} />
                  <StatRow label="Red cards" a={cards.team1.red} b={cards.team2.red} aColor={A.red} bColor={A.red} />
                </>
              )}
              {/* badminton / table tennis */}
              {games && <StatRow label="Games won" a={games.team1} b={games.team2} aColor={A.lime} bColor={A.lime} />}
              {points && <StatRow label="Points" a={points.team1} b={points.team2} />}
              {aces && <StatRow label="Aces" a={aces.team1} b={aces.team2} />}
              {doubleFaults && <StatRow label="Double faults" a={doubleFaults.team1} b={doubleFaults.team2} aColor={A.red} bColor={A.red} />}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: A.bg, paddingTop: 44 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  backBtn: { padding: 2 },
  headerTitle: { color: A.ink, fontSize: 17, fontWeight: '800' },
  empty: { color: A.inkDim, textAlign: 'center', marginTop: 40 },

  scoreCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: A.surfaceLow, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: A.line },
  teamCol: { flex: 1, alignItems: 'center', gap: 8 },
  badge: { width: 48, height: 48, borderRadius: 24, backgroundColor: A.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { color: A.ink, fontWeight: '900', fontSize: 16 },
  teamName: { color: A.ink, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  scoreMid: { paddingHorizontal: 8 },
  score: { color: A.lime, fontSize: 30, fontWeight: '900' },
  scoreDash: { color: A.inkDim },

  section: { backgroundColor: A.surfaceLow, borderRadius: 16, padding: 14, marginTop: 14, borderWidth: 1, borderColor: A.line },
  sectionTitle: { color: A.ink, fontSize: 14, fontWeight: '800', marginBottom: 8 },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: A.line },
  statVal: { flex: 1, color: A.ink, fontSize: 16, fontWeight: '800' },
  statLabel: { flex: 2, color: A.inkDim, fontSize: 12.5, textAlign: 'center', fontWeight: '600' },
});
