import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Animated, RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import CareerBoard, { hasCareer } from '../components/CareerBoard';
import ShotBoard from '../components/ShotBoard';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

// A player's career, opened from Rankings.
//
// It draws the SAME board as My Stats (components/CareerBoard) off the SAME
// payload (/players/:id/career → backend lib/playerCareer.js). It used to draw
// its own: colour-tinted bento tiles in Batting / Bowling / Fielding sections,
// fed by /players/:id/insights, which computed cricket a third way and got a
// two-ball over counted as a whole over. So the same career read differently
// depending on whether you were looking at yourself or at someone else, and
// there was no way to tell which screen was right.
//
// What stays particular to this screen: the hero (who this is), the standing
// carried in from the board you tapped, and the scouting read underneath.

const makeTrendConfig = (DS) => ({
  upward:   { icon: 'trending-up',      color: DS.lime,  label: 'Improving' },
  downward: { icon: 'trending-down',    color: DS.live,  label: 'Declining' },
  stable:   { icon: 'trending-neutral', color: DS.coral, label: 'Stable'    },
});

// Module scope, not inside the skeleton's render body. Declared there it was a
// new component type every render, so React remounted every bar instead of
// updating it — which restarts the shimmer, so the one continuous sweep this
// is meant to be was stuttering back to the start.
const Bar = ({ w, h, r = 6, DS, pulse }) => (
  <Animated.View style={{ width: w, height: h, borderRadius: r, backgroundColor: DS.surfaceHigh, opacity: pulse }} />
);

function Section({ title, icon, children }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon && <Icon name={icon} size={16} color={DS.lime} />}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

// Same shape-matching placeholder as My Stats, so both screens settle the same way.
function BoardSkeleton({ DS }) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.75, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border, padding: 13, gap: 12 }}>
        <Bar DS={DS} pulse={pulse} w="45%" h={10} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[0, 1, 2, 3, 4].map((i) => <Bar DS={DS} pulse={pulse} key={i} w={28} h={28} r={14} />)}
        </View>
      </View>
      <View style={{ backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border, padding: 13 }}>
        {[0, 1, 2].map((r) => (
          <View key={r} style={{ flexDirection: 'row', paddingVertical: 9 }}>
            {[0, 1, 2].map((c) => (
              <View key={c} style={{ flex: 1, gap: 6 }}>
                <Bar DS={DS} pulse={pulse} w="55%" h={16} />
                <Bar DS={DS} pulse={pulse} w="72%" h={8} />
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

export default function PlayerInsightsScreen({ route, navigation }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const TREND_CONFIG = makeTrendConfig(DS);
  const { playerId, player: passed, standing, boardLabel } = route.params || {};

  const [career, setCareer] = useState(null);
  const [insights, setInsights] = useState({});
  const [shotData, setShotData] = useState(null);   // { shots, analytics, insights, player }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useLayoutEffect(() => {
    // This screen draws its own hero — back button, avatar, name, role and team —
    // so the navigator's default header was a second bar above it, in the light
    // system styling every other screen in this stack opts out of.
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const load = useCallback(() => Promise.all([
    legendsApi.getPlayerCareer(playerId),
    legendsApi.getPlayerInsights(playerId),
    // Kept a SEPARATE fetch from the career on purpose: shot data covers only
    // the deliveries somebody chose to capture, which for a long time will be a
    // thin and uneven slice. Folding it into the career board would make those
    // numbers quietly mean something different depending on whether a scorer
    // happened to switch the feature on that day.
    legendsApi.getPlayerShots(playerId),
  ]).then(([c, ins, sh]) => {
    if (c.success) setCareer(c.data);
    if (ins.success) setInsights(ins.data);
    if (sh.success) setShotData(sh.data);
  }), [playerId]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const perf  = insights.performance || {};
  const trend = TREND_CONFIG[perf.trend] || TREND_CONFIG.stable;
  const stats = career?.stats || null;

  // Who this is. The tapped row already carries most of it, so the hero paints
  // before the fetch returns.
  const name = passed?.name || career?.player?.name || 'Player';
  const role = passed?.role || career?.role || career?.player?.role || 'Cricketer';
  const teamName = passed?.team || career?.team || '';
  const sportId = career?.sport || passed?.sport || 'cricket';
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  // Rankings passes the row through, which carries the linked account's photo.
  const avatarUrl = passed?.avatarUrl || passed?.user?.avatarUrl || career?.player?.avatarUrl || null;

  const strong = perf.strongPoints || [];
  const improve = perf.improvementAreas || [];
  const recs = insights.recommendations || [];

  return (
    <View style={styles.container}>
      {/* Hero — who this is, and why you opened them */}
      <View style={styles.hero}>
        {navigation && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
            <Icon name="arrow-left" size={22} color={DS.textPrimary} />
          </TouchableOpacity>
        )}
        {avatarUrl
          ? <Image source={{ uri: avatarUrl }} style={styles.heroAvatarImg} />
          : <View style={styles.heroAvatar}><Text style={styles.heroAvatarTxt}>{initials}</Text></View>}
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle} numberOfLines={1}>{name}</Text>
          <Text style={styles.heroSub} numberOfLines={1}>
            {role}{teamName ? ` · ${teamName}` : ''}
          </Text>
        </View>
        {/* Carried from Rankings — the reason you opened this profile. */}
        {standing != null && (
          <View style={styles.rankPill}>
            <Text style={styles.rankPillNum}>#{standing}</Text>
            <Text style={styles.rankPillLbl} numberOfLines={1}>{(boardLabel || '').toLowerCase()}</Text>
          </View>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} colors={[DS.lime]} />}>
        <View style={styles.body}>
          {loading ? (
            <BoardSkeleton DS={DS} />
          ) : hasCareer(stats, sportId) ? (
            <CareerBoard stats={stats} sportId={sportId} navigation={navigation} />
          ) : (
            <View style={styles.empty}>
              <Icon name="chart-line" size={44} color={DS.textMuted} />
              <Text style={styles.emptyTitle}>No career numbers yet</Text>
              <Text style={styles.emptySub}>{name} hasn't played a scored match on Local Legends.</Text>
            </View>
          )}

          {/* Where this batter actually scores. Rendered only when there is shot
              data at all — the feature is optional, so an empty wagon wheel on
              every player who has never been tracked would be noise, not a gap
              they need telling about. */}
          {!loading && !!shotData?.shots?.length && (
            <ShotBoard
              shots={shotData.shots}
              summary={{
                topZones: shotData.analytics?.byZone?.slice(0, 5) || [],
                topShots: shotData.analytics?.byShot?.slice(0, 5) || [],
              }}
              insights={shotData.insights}
              dna={shotData.dna}
              benchmark={shotData.benchmark}
              hand={shotData.player?.hand || 'right'}
              showHand   // one player, so naming the hand is the fact that makes the wheel readable
              title="SHOT PROFILE"
              subtitle="Across every tracked innings"
              style={{ marginTop: 16 }}
            />
          )}

          {/* The scouting read — what the board above adds up to. Its thresholds
              run on those same numbers now, so it can't tell you an economy is
              fine while the table over it says otherwise. */}
          {!loading && (strong.length > 0 || improve.length > 0) && (
            <Section title="Analysis" icon="chart-donut">
              <View style={styles.trendRow}>
                <Icon name={trend.icon} size={18} color={trend.color} />
                <Text style={[styles.trendLabel, { color: trend.color }]}>{trend.label}</Text>
                {!!perf.recentForm && perf.recentForm !== 'N/A' && (
                  <Text style={styles.trendForm}>· form {perf.recentForm.toLowerCase()}</Text>
                )}
              </View>
              <View style={styles.analysisRow}>
                <View style={styles.analysisBox}>
                  <View style={styles.analysisHeader}>
                    <Icon name="star-circle" size={14} color={DS.lime} />
                    <Text style={[styles.analysisTitle, { color: DS.lime }]}>Strong Points</Text>
                  </View>
                  {strong.length > 0
                    ? strong.map((p, i) => (
                      <View key={i} style={styles.bulletRow}>
                        <View style={[styles.bullet, { backgroundColor: DS.lime }]} />
                        <Text style={styles.bulletText}>{p}</Text>
                      </View>
                    ))
                    : <Text style={styles.noData}>No data yet</Text>}
                </View>
                <View style={styles.analysisBox}>
                  <View style={styles.analysisHeader}>
                    <Icon name="arrow-up-circle" size={14} color={DS.coral} />
                    <Text style={[styles.analysisTitle, { color: DS.coral }]}>To Improve</Text>
                  </View>
                  {improve.length > 0
                    ? improve.map((a, i) => (
                      <View key={i} style={styles.bulletRow}>
                        <View style={[styles.bullet, { backgroundColor: DS.coral }]} />
                        <Text style={styles.bulletText}>{a}</Text>
                      </View>
                    ))
                    : <Text style={styles.noData}>No data yet</Text>}
                </View>
              </View>
            </Section>
          )}

          {!loading && recs.length > 0 && (
            <Section title="Recommendations" icon="lightbulb-outline">
              {recs.map((rec, i) => (
                <View key={i} style={styles.recRow}>
                  <View style={styles.recNum}><Text style={styles.recNumText}>{i + 1}</Text></View>
                  <Text style={styles.recText}>{rec}</Text>
                </View>
              ))}
            </Section>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 18, paddingHorizontal: 16,
  },
  backBtn: { padding: 4 },
  heroAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center' },
  heroAvatarImg: { width: 44, height: 44, borderRadius: 22, backgroundColor: DS.surfaceHighest },
  heroAvatarTxt: { color: DS.onLime, fontWeight: '800', fontSize: 16 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: DS.textPrimary },
  heroSub: { fontSize: 12, color: DS.textMuted, marginTop: 2 },
  rankPill: {
    alignItems: 'center', justifyContent: 'center', minWidth: 54,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: DS.lime + '1f', borderRadius: 12, borderWidth: 1, borderColor: DS.lime,
  },
  rankPillNum: { fontSize: 16, fontWeight: '900', color: DS.lime, letterSpacing: -0.4 },
  rankPillLbl: { fontSize: 8.5, fontWeight: '800', color: DS.lime, letterSpacing: 0.4, textTransform: 'uppercase' },

  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, gap: 10 },

  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: DS.textVariant, marginTop: 6 },
  emptySub: { fontSize: 12.5, color: DS.textMuted, textAlign: 'center', paddingHorizontal: 28, lineHeight: 18 },

  /* Scouting read — same card chrome as the board above it. */
  section: { backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border, padding: 13, gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: DS.textPrimary, letterSpacing: 0.2 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trendLabel: { fontSize: 12.5, fontWeight: '800' },
  trendForm: { fontSize: 11.5, color: DS.textMuted, fontWeight: '600' },
  analysisRow: { flexDirection: 'row', gap: 12 },
  analysisBox: { flex: 1, gap: 6 },
  analysisHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  analysisTitle: { fontSize: 11.5, fontWeight: '800' },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  bullet: { width: 5, height: 5, borderRadius: 2.5, marginTop: 6 },
  bulletText: { flex: 1, fontSize: 12, color: DS.textPrimary, lineHeight: 18 },
  noData: { fontSize: 11.5, color: DS.textMuted, fontStyle: 'italic' },

  recRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  recNum: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  recNumText: { fontSize: 10.5, fontWeight: '900', color: DS.onLime },
  recText: { flex: 1, fontSize: 12.5, color: DS.textPrimary, lineHeight: 19 },
});
