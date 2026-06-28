import { useTheme, useThemedStyles, useArenaColors } from "../theme/ThemeContext"; // MatchStatsScreen — match view for event-based sports (football, basketball, …).
// Shows the live/final score, per-period breakdown, and sport aggregates
// (football: cards & corners) from GET /matches/:id/sport-stats.
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';







const teamName = (t) => (typeof t === 'string' ? t : t?.name) || 'Team';

// team1 vs team2 comparison row
const StatRow = ({ label, a, b, aColor, bColor }) => {
  const A = useArenaColors();
  const s = useThemedStyles(makeS);
  return (
    <View style={s.statRow}>
    <Text style={[s.statVal, { color: aColor || A.ink, textAlign: 'left' }]}>{a}</Text>
    <Text style={s.statLabel}>{label}</Text>
    <Text style={[s.statVal, { color: bColor || A.ink, textAlign: 'right' }]}>{b}</Text>
  </View>);
};


// Humanised labels for the per-player stat fields the backend returns.
const PLAYER_STAT_LABELS = {
  goals: 'goals', assists: 'assists', yellowCards: 'YC', redCards: 'RC',
  points: 'pts', twoPointers: '2pt', threePointers: '3pt', freeThrows: 'FT', fouls: 'fouls',
  penaltyCorners: 'PC', touchPoints: 'touch', tacklePoints: 'tackle', bonusPoints: 'bonus',
  allOuts: 'all-out', punchesLanded: 'punches', knockdowns: 'KD', roundsWon: 'rounds',
  totalPoints: 'pts',
};
const SKIP_PLAYER_KEYS = new Set(['playerId', 'teamId', 'side', 'name', 'totalEvents']);
// Build a compact "2 goals · 1 YC" summary from a player's numeric stat fields.
const summarizePlayer = (p) =>
  Object.entries(p)
    .filter(([k, v]) => !SKIP_PLAYER_KEYS.has(k) && typeof v === 'number' && v > 0)
    .map(([k, v]) => `${v} ${PLAYER_STAT_LABELS[k] || k}`)
    .join(' · ');

export default function MatchStatsScreen({ navigation, route }) {const A = useArenaColors();const s = useThemedStyles(makeS);
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
    return () => {alive = false;};
  }, [matchId]));

  const t1 = teamName(stats?.team1);
  const t2 = teamName(stats?.team2);
  const sc1 = stats?.score?.score1 ?? '—';
  const sc2 = stats?.score?.score2 ?? '—';
  const cards = stats?.cards;
  const corners = stats?.corners;
  const games = stats?.games; // badminton / table tennis
  const points = stats?.points;
  const aces = stats?.aces;
  const doubleFaults = stats?.doubleFaults; // tennis
  const strokes = stats?.strokes; // squash
  const fouls = stats?.fouls; // basketball
  const timeouts = stats?.timeouts; // basketball
  const touchPoints = stats?.touchPoints; // kabaddi
  const tacklePoints = stats?.tacklePoints; // kabaddi
  const bonusPoints = stats?.bonusPoints; // kabaddi
  const allOuts = stats?.allOuts; // kabaddi
  const penaltyCorners = stats?.penaltyCorners; // hockey
  const blocks = stats?.blocks; // volleyball
  const sevenMeters = stats?.sevenMeters; // handball
  const outs = stats?.outs; // kho-kho
  const bonuses = stats?.bonuses; // kho-kho
  const knockdowns = stats?.knockdowns; // boxing
  const punches = stats?.punches; // boxing
  const roundsWon = stats?.roundsWon; // boxing
  const takedowns = stats?.takedowns; // wrestling
  const pins = stats?.pins; // wrestling
  const ippons = stats?.ippons; // judo / karate
  const wazaAri = stats?.wazaAri; // judo / karate
  const runsLanded = stats?.runsLanded; // skateboard
  const crashes = stats?.crashes; // skateboard
  const periods = stats?.periodBreakdown || [];
  const playerStats = (stats?.playerStats || []).filter((p) => summarizePlayer(p));
  const hasStats = cards || corners || games || points || aces || doubleFaults || strokes ||
  fouls || timeouts || touchPoints || tacklePoints || bonusPoints || allOuts ||
  penaltyCorners || blocks || sevenMeters || outs || bonuses ||
  knockdowns || punches || roundsWon || takedowns || pins || ippons || wazaAri ||
  runsLanded || crashes;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={A.bg} />
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="chevron-left" size={26} color={A.ink} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{sportName} · Match Stats</Text>
      </View>

      {loading ?
      <ActivityIndicator style={{ marginTop: 40 }} color={A.lime} /> :
      !stats ?
      <Text style={s.empty}>Couldn’t load match stats.</Text> :

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
          {periods.length > 0 &&
        <View style={s.section}>
              <Text style={s.sectionTitle}>By Period</Text>
              {periods.map((p) =>
          <StatRow key={p.period} label={`Period ${p.period}`} a={p.score1} b={p.score2} />
          )}
            </View>
        }

          {/* Sport aggregates */}
          {hasStats &&
        <View style={s.section}>
              <Text style={s.sectionTitle}>Match Stats</Text>
              {/* football / hockey */}
              {corners && <StatRow label="Corners" a={corners.team1} b={corners.team2} />}
              {penaltyCorners && <StatRow label="Penalty corners" a={penaltyCorners.team1} b={penaltyCorners.team2} />}
              {cards &&
          <>
                  <StatRow label="Yellow cards" a={cards.team1.yellow} b={cards.team2.yellow} aColor={A.yellow} bColor={A.yellow} />
                  <StatRow label="Red cards" a={cards.team1.red} b={cards.team2.red} aColor={A.red} bColor={A.red} />
                </>
          }
              {/* badminton / table tennis */}
              {games && <StatRow label="Games won" a={games.team1} b={games.team2} aColor={A.lime} bColor={A.lime} />}
              {points && <StatRow label="Points" a={points.team1} b={points.team2} />}
              {aces && <StatRow label="Aces" a={aces.team1} b={aces.team2} />}
              {blocks && <StatRow label="Blocks" a={blocks.team1} b={blocks.team2} />}
              {doubleFaults && <StatRow label="Double faults" a={doubleFaults.team1} b={doubleFaults.team2} aColor={A.red} bColor={A.red} />}
              {strokes && <StatRow label="Strokes" a={strokes.team1} b={strokes.team2} />}
              {/* team sports */}
              {fouls && <StatRow label="Fouls" a={fouls.team1} b={fouls.team2} />}
              {timeouts && <StatRow label="Timeouts" a={timeouts.team1} b={timeouts.team2} />}
              {touchPoints && <StatRow label="Touch points" a={touchPoints.team1} b={touchPoints.team2} />}
              {tacklePoints && <StatRow label="Tackle points" a={tacklePoints.team1} b={tacklePoints.team2} />}
              {bonusPoints && <StatRow label="Bonus points" a={bonusPoints.team1} b={bonusPoints.team2} aColor={A.lime} bColor={A.lime} />}
              {allOuts && <StatRow label="All-outs" a={allOuts.team1} b={allOuts.team2} aColor={A.lime} bColor={A.lime} />}
              {sevenMeters && <StatRow label="7m goals" a={sevenMeters.team1} b={sevenMeters.team2} />}
              {/* kho-kho */}
              {outs && <StatRow label="Outs" a={outs.team1} b={outs.team2} />}
              {bonuses && <StatRow label="Bonus points" a={bonuses.team1} b={bonuses.team2} aColor={A.lime} bColor={A.lime} />}
              {/* combat — special moves */}
              {roundsWon && <StatRow label="Rounds won" a={roundsWon.team1} b={roundsWon.team2} />}
              {knockdowns && <StatRow label="Knockdowns" a={knockdowns.team1} b={knockdowns.team2} aColor={A.red} bColor={A.red} />}
              {punches && <StatRow label="Punches landed" a={punches.team1} b={punches.team2} />}
              {takedowns && <StatRow label="Takedowns" a={takedowns.team1} b={takedowns.team2} />}
              {pins && <StatRow label="Pins" a={pins.team1} b={pins.team2} aColor={A.lime} bColor={A.lime} />}
              {ippons && <StatRow label="Ippon" a={ippons.team1} b={ippons.team2} aColor={A.lime} bColor={A.lime} />}
              {wazaAri && <StatRow label="Waza-ari" a={wazaAri.team1} b={wazaAri.team2} />}
              {/* skateboard */}
              {runsLanded && <StatRow label="Runs landed" a={runsLanded.team1} b={runsLanded.team2} />}
              {crashes && <StatRow label="Crashes" a={crashes.team1} b={crashes.team2} aColor={A.red} bColor={A.red} />}
            </View>
        }

          {/* Per-player scorecard — grouped by team */}
          {playerStats.length > 0 &&
        <View style={s.section}>
              <Text style={s.sectionTitle}>Player Scorecard</Text>
              {[['team1', t1], ['team2', t2]].map(([side, tname]) => {
                const ps = playerStats.filter((p) => p.side === side);
                if (!ps.length) return null;
                return (
                  <View key={side} style={s.playerGroup}>
                    <Text style={s.playerGroupTitle}>{tname}</Text>
                    {ps.map((p) => (
                      <View key={p.playerId} style={s.playerRow}>
                        <Text style={s.playerName} numberOfLines={1}>{p.name}</Text>
                        <Text style={s.playerLine} numberOfLines={1}>{summarizePlayer(p)}</Text>
                      </View>
                    ))}
                  </View>);

              })}
            </View>
        }
        </ScrollView>
      }
    </View>);

}

const makeS = (A) => StyleSheet.create({
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

  playerGroup: { marginTop: 6 },
  playerGroupTitle: { color: A.lime, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginTop: 8, marginBottom: 2 },
  playerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: A.line },
  playerName: { flex: 1, color: A.ink, fontSize: 13.5, fontWeight: '700' },
  playerLine: { flexShrink: 0, color: A.inkDim, fontSize: 12, fontWeight: '600' }
});