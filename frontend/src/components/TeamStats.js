import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Svg, { LinearGradient, Defs, Rect, Stop } from 'react-native-svg';
import Animated, { FadeIn, FadeInDown, FadeInUp, FadeOutUp, Layout, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import legendsApi from '../services/LegendsApi';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import LeaderboardIndex from './LeaderboardIndex';
import StatsFilterSheet from './StatsFilterSheet';
import { BOARDS } from './leaderboardBoards';

// Team → Stats.
//
// Everything here answers one question — "how has THIS team done?" — and every
// number obeys the same rule: a player's figures are what they did for this
// team. That is enforced in the query (lib/teamStats.js), not filtered here, so
// a player with 900 runs for another club shows only what they made for this one.
//
// The filters are the point of the screen, not decoration: every card and every
// leaderboard below re-reads from one request, so "top scorer in July" and
// "best economy at Mangadu" are the same screen with a different answer.
//
// Adapting the brief: this is React Native and plain JS, not React + TypeScript
// web, so a few of the asks land differently and it is worth saying which.
// There is no hover — touch feedback stands in. The filter row is NOT sticky:
// this renders inside the team screen's own ScrollView, and a nested vertical
// scroller gets no height in RN, so the row scrolls with the page. Sections
// collapse rather than lazy load, because the whole payload is one request that
// has already arrived — lazy loading it would add round trips, not remove them.

// Each board: what it ranks on, and the columns worth showing for it. Keeping
// this as data means a new board is a row here, not another block of JSX.
export { BOARDS };

import { useNavigation } from '@react-navigation/native';

// `show` picks which half renders. The team screen mounts ONE of these across
// both the Stats and Leaderboards tabs — same component, same slot — so React
// keeps the instance alive when you switch and the filters, the scroll of the
// filter row and the fetched data all carry over. Two separate mounts would
// have meant two requests and two sets of filters that silently disagreed,
// which is the opposite of what the filter rule asks for: one period, one
// format, one ground, applied to everything on screen.
export default function TeamStats({ teamId, show = 'stats' }) {
  const DS = useTheme().colors;
  const s = useThemedStyles(makeStyles);
  const navigation = useNavigation();

  const [filters, setFilters] = useState({});
  const [options, setOptions] = useState({ years: [], matchTypes: [], venues: [], tournaments: [] });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(null);          // which filter sheet is open

  useEffect(() => {
    legendsApi.getTeamStatsOptions(teamId).then((r) => r.success && setOptions(r.data));
  }, [teamId]);

  // The one request. Every card and board below reads from it, so a filter
  // change is a single round trip rather than fourteen.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    legendsApi.getTeamStats(teamId, filters).then((r) => {
      if (!alive) return;
      setData(r.success ? r.data : null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [teamId, filters]);

  // What is applied, in the pills' own words.
  const oppName = options.oppositions?.find((o) => o.id === filters.oppositionId)?.name;
  const tourName = options.tournaments?.find((t) => t.id === filters.tournamentId)?.name;
  const activeCount = Object.values(filters).filter(Boolean).length;
  const openFilters = () => setPicker('main');

  const st = data?.team_stats;

  const renderFilterBar = () => (
    <View style={s.filterBar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.filterScroll} contentContainerStyle={s.filterRow}>
        <FilterPill label="Year" value={filters.year} icon="calendar-month-outline" onPress={openFilters} s={s} DS={DS} />
        <FilterPill label="Format" value={filters.matchType} icon="cricket" onPress={openFilters} s={s} DS={DS} />
        <FilterPill label="Ground" value={filters.venue} icon="map-marker-outline" onPress={openFilters} s={s} DS={DS} />
        <FilterPill label="Opposition" value={oppName} icon="shield-outline" onPress={openFilters} s={s} DS={DS} />
        {options.tournaments?.length > 0 && (
          <FilterPill label="Tournament" value={tourName} icon="trophy-outline" onPress={openFilters} s={s} DS={DS} />
        )}
        {activeCount > 0 && (
          <TouchableOpacity style={s.clearBtn} onPress={() => {
            ReactNativeHapticFeedback.trigger('impactLight', { enableVibrateFallback: false });
            setFilters({});
          }}>
            <Icon name="close" size={16} color={DS.coral} />
            <Text style={s.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      <TouchableOpacity style={s.tuneBtn} onPress={openFilters}
        accessibilityRole="button" accessibilityLabel="Filters">
        <Icon name="tune-variant" size={20} color={activeCount ? DS.lime : DS.textVariant} />
        {activeCount > 0 && <View style={s.tuneDot}><Text style={s.tuneDotText}>{activeCount}</Text></View>}
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={s.root}>
      {loading ? <Skeleton s={s} DS={DS} />
        : !st ? (
            <View>
              {show === 'stats' && renderFilterBar()}
              <Empty icon="chart-box-outline" title="No stats yet"
                     hint="They appear once this team has a completed match." s={s} DS={DS} />
            </View>
          )
        : show === 'stats' ? (
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            <Animated.View style={s.hero} entering={FadeInDown.duration(400).springify()}>
              <Svg height="100%" width="100%" style={StyleSheet.absoluteFill}>
                <LinearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor={DS.lime} stopOpacity="1" />
                  <Stop offset="100%" stopColor="#052E16" stopOpacity="1" />
                </LinearGradient>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#grad)" />
              </Svg>
              <View style={s.heroContent}>
                <View style={s.heroTop}>
                  <View>
                    <Text style={s.heroValue}>{st.winPct}%</Text>
                    <Text style={s.heroLabel}>WIN RATE · {st.played} {st.played === 1 ? 'MATCH' : 'MATCHES'}</Text>
                  </View>
                  <View style={s.formRow}>
                    {(st.form || []).map((r, i) => (
                      <View key={i} style={[s.formDot, { backgroundColor: r === 'W' ? DS.success : r === 'L' ? DS.coral : 'rgba(255,255,255,0.3)' }]}>
                        <Text style={s.formDotText}>{r}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={s.wlBar}>
                  {[['won', st.won, DS.success], ['tied', st.tied, 'rgba(255,255,255,0.6)'], ['noResult', st.noResult, 'rgba(255,255,255,0.4)'], ['lost', st.lost, DS.coral]]
                    .filter(([, n]) => n > 0)
                    .map(([k, n, c]) => (
                      <View key={k} style={{ flex: n, backgroundColor: c, height: '100%' }} />
                    ))}
                </View>
                <View style={s.wlLegend}>
                  <Legend n={st.won} label="Won" c={DS.success} s={s} />
                  <Legend n={st.lost} label="Lost" c={DS.coral} s={s} />
                  {st.tied > 0 && <Legend n={st.tied} label="Tied" c="rgba(255,255,255,0.6)" s={s} />}
                  {st.noResult > 0 && <Legend n={st.noResult} label="No result" c="rgba(255,255,255,0.4)" s={s} />}
                </View>
              </View>
            </Animated.View>
            
            {renderFilterBar()}
            
            <Group title="MATCH STATISTICS" icon="cricket" s={s} DS={DS} index={1}>
              <Stat label="Total Matches" value={st.played} s={s} />
              <Stat label="Wins" value={st.won} s={s} />
              <Stat label="Losses" value={st.lost} s={s} />
              <Stat label="Ties" value={st.tied} s={s} />
              <Stat label="No Result" value={st.noResult} s={s} />
              <Stat label="Win Percentage" value={`${st.winPct}%`} s={s} />
              <Stat label="Current Streak" value={st.currentStreak} s={s} />
              <Stat label="Longest Win Streak" value={st.longestWinStreak} s={s} />
              <Stat label="Longest Loss Streak" value={st.longestLossStreak} s={s} />
            </Group>

            <Group title="BATTING STATISTICS" icon="baseball-bat" s={s} DS={DS} index={2}>
              <Stat label="Total Runs" value={st.totalRuns} s={s} />
              <Stat label="Highest Team Score" value={st.highestScore} s={s} />
              <Stat label="Lowest Team Score" value={st.lowestScore} s={s} />
              <Stat label="Average Team Score" value={st.avgScore} s={s} />
              <Stat label="Average Run Rate" value={st.runRate} s={s} />
              <Stat label="Highest Successful Chase" value={st.bestChase} s={s} />
              <Stat label="Lowest Defended Score" value={st.lowestDefended} s={s} />
              <Stat label="Total Boundaries" value={st.boundaries} s={s} />
              <Stat label="Total Fours" value={st.fours} s={s} />
              <Stat label="Total Sixes" value={st.sixes} s={s} />
              <Stat label="Total Extras Received" value={st.extras} s={s} />
            </Group>

            <Group title="BOWLING STATISTICS" icon="bowling" s={s} DS={DS} index={3}>
              <Stat label="Total Wickets" value={st.totalWickets} s={s} />
              <Stat label="Runs Conceded" value={st.totalRunsConceded} s={s} />
              <Stat label="Team Economy Rate" value={st.teamEconomy} s={s} />
              <Stat label="Team Bowling Average" value={st.teamBowlingAvg} s={s} />
              <Stat label="Team Strike Rate" value={st.teamBowlingSr} s={s} />
              <Stat label="Total Maidens" value={st.totalMaidens} s={s} />
              <Stat label="Total Dot Balls" value={st.totalDots} s={s} />
              <Stat label="Best Bowling Figures" value={data?.leaderboards?.bestBowling?.[0] ? `${data.leaderboards.bestBowling[0].best} (${data.leaderboards.bestBowling[0].name.split(' ')[0]})` : '—'} s={s} />
            </Group>

            <Group title="FIELDING STATISTICS" icon="hand-back-right-outline" s={s} DS={DS} index={4}>
              <Stat label="Total Catches" value={st.catches} s={s} />
              <Stat label="Total Run Outs" value={st.runOuts} s={s} />
              <Stat label="Direct Hit Run Outs" value={st.directHits} s={s} />
              <Stat label="Assisted Run Outs" value={st.assistedRunOuts} s={s} />
              <Stat label="Total Stumpings" value={st.stumpings} s={s} />
              <Stat label="Total Dismissals" value={st.dismissals} s={s} />
            </Group>

            <Group title="TOSS & MATCH STATISTICS" icon="rotate-360" s={s} DS={DS} index={5}>
              <Stat label="Tosses Won" value={st.tossWon} s={s} />
              <Stat label="Tosses Lost" value={Math.max(0, st.tossKnown - st.tossWon)} s={s} />
              <Stat label="Wins Batting First" value={st.batFirstWins} s={s} />
              <Stat label="Wins Chasing" value={st.fieldFirstWins} s={s} />
              <Stat label="Home Wins" value={st.homeWins} s={s} />
              <Stat label="Away Wins" value={st.awayWins} s={s} />
              <Stat label="Neutral Venue Wins" value={st.neutralWins} s={s} />
            </Group>

            <Group title="TEAM RECORDS" icon="trophy-outline" s={s} DS={DS} index={6}>
              <Stat label="Biggest Win (Runs)" value={st.bestWinRuns !== null ? `${st.bestWinRuns} runs` : '—'} s={s} />
              <Stat label="Biggest Win (Wickets)" value={st.bestWinWickets !== null ? `${st.bestWinWickets} wkts` : '—'} s={s} />
              <Stat label="Closest Win (Runs)" value={st.closestWinRuns !== null ? `${st.closestWinRuns} runs` : '—'} s={s} />
              <Stat label="Closest Win (Wickets)" value={st.closestWinWickets !== null ? `${st.closestWinWickets} wkts` : '—'} s={s} />
              <Stat label="Biggest Defeat" value={st.biggestLossRuns !== null ? `${st.biggestLossRuns} runs` : st.biggestLossWickets !== null ? `${st.biggestLossWickets} wkts` : '—'} s={s} />
              <Stat label="Highest Successful Chase" value={st.bestChase} s={s} />
              <Stat label="Lowest Defended Score" value={st.lowestDefended} s={s} />
            </Group>
          </ScrollView>
        )
        : renderLeaderboardMenu()
      }

      <StatsFilterSheet
        visible={picker === 'main'}
        onClose={() => setPicker(null)}
        onApply={(next) => { setFilters(next); setPicker(null); }}
        options={options}
        filters={filters}
        fields={['matchType', 'year', 'venue', 'oppositionId', 'tournamentId']}
      />
    </View>
  );

  function renderLeaderboardMenu() {
    const lds = data?.leaderboards;
    if (!lds) return <Empty icon="poll" title="No leaderboards" hint="They appear once players have stats for this team." s={s} DS={DS} />;

    // An INDEX, not thirty-four expanded cards — and now a SHARED index, since
    // a tournament asks the same question of the same boards. See
    // components/LeaderboardIndex.js.
    return (
      <LeaderboardIndex
        leaderboards={lds}
        emptyHint="Boards fill in once players have batted or bowled for this team."
        onOpen={(board, category) => navigation.navigate('TeamStatLeaderboard', {
          teamId, boardKey: board.key, category,
        })}
      />
    );
  }

}

function Legend({ n, label, c, s }) {
  return (
    <View style={s.legendItem}>
      <View style={[s.legendDot, { backgroundColor: c }]} />
      <Text style={s.legendText}>{n} {label}</Text>
    </View>
  );
}

// A row, not a tile. The same shape the leaderboard index uses — grey band per
// category, plain rows under it — because these are the same kind of thing: a
// long list of named numbers. As a grid of 47 tiles the labels wrapped to two
// lines, `adjustsFontSizeToFit` clipped the values on Android rather than
// shrinking them, and nothing lined up to scan down.
function Stat({ label, value, s }) {
  if (value === null || value === undefined || value === '' || value === '—') return null;
  return (
    <View style={s.statRow}>
      <Text style={s.statRowLabel} numberOfLines={1}>{label}</Text>
      <Text style={s.statRowValue} numberOfLines={1}>{String(value)}</Text>
    </View>
  );
}

function Group({ title, icon, children, s, DS, index = 0 }) {
  const shown = (Array.isArray(children) ? children : [children]).filter(Boolean);
  if (!shown.length) return null;
  const last = shown.length - 1;
  const [open, setOpen] = useState(index <= 2);
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(open ? '180deg' : '0deg') }]
  }));
  return (
    <Animated.View entering={FadeInDown.delay(index * 100).duration(400).springify()} layout={Layout.springify()}>
      <TouchableOpacity 
        style={[s.catHead, { justifyContent: 'space-between' }]} 
        activeOpacity={0.7} 
        onPress={() => {
          ReactNativeHapticFeedback.trigger('impactLight', { enableVibrateFallback: false });
          setOpen(!open);
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name={icon} size={13} color={DS.textMuted} />
          <Text style={s.catHeadText}>{title}</Text>
        </View>
        <Animated.View style={arrowStyle}>
          <Icon name="chevron-down" size={16} color={DS.textMuted} />
        </Animated.View>
      </TouchableOpacity>
      {open && (
        <Animated.View entering={FadeInUp} exiting={FadeOutUp}>
          {shown.map((child, i) => (
            <View key={i} style={i === last ? s.statRowLast : null}>{child}</View>
          ))}
        </Animated.View>
      )}
    </Animated.View>
  );
}

// Shows the applied value, not just the field name — "Format: T20" is the
// answer to the question the pill asks, and a pill that only ever reads
// "Format" tells you nothing about what you are looking at.
function FilterPill({ label, value, icon, onPress, s, DS }) {
  const on = value !== undefined && value !== null && value !== '';
  return (
    <TouchableOpacity style={[s.chip, on && s.chipOn]} activeOpacity={0.8}
      onPress={() => {
        ReactNativeHapticFeedback.trigger('impactLight', { enableVibrateFallback: false });
        onPress();
      }}
      accessibilityRole="button" accessibilityLabel={`${label}: ${on ? value : 'all'}`}>
      <Icon name={icon} size={13} color={on ? DS.onLime : DS.textVariant} />
      <Text style={[s.chipText, on && s.chipTextOn]} numberOfLines={1}>
        {label}{on ? `: ${value}` : ''}
      </Text>
      <Icon name="chevron-down" size={14} color={on ? DS.onLime : DS.textMuted} />
    </TouchableOpacity>
  );
}

const Empty = ({ icon, title, hint, s, DS }) => (
  <View style={s.emptyState}>
    <View style={s.emptyIconWrap}><Icon name={icon} size={32} color={DS.textMuted} /></View>
    <Text style={s.emptyTitle}>{title}</Text>
    <Text style={s.emptyHint}>{hint}</Text>
  </View>
);

const Skeleton = ({ s }) => {
  const op = useSharedValue(0.4);
  useEffect(() => {
    op.value = withRepeat(withSequence(
      withTiming(1, { duration: 800 }),
      withTiming(0.4, { duration: 800 })
    ), -1, true);
  }, []);
  const animStyle = useAnimatedStyle(() => ({ opacity: op.value }));
  
  return (
    <Animated.View style={animStyle}>
      <View style={[s.hero, { height: 128 }]} />
      <View style={s.group}>
        <View style={[s.skelBar, { width: 110, marginBottom: 12 }]} />
        <View style={s.statGrid}>
          {[0, 1, 2, 3].map((j) => <View key={j} style={[s.stat, { height: 62 }]} />)}
        </View>
      </View>
    </Animated.View>
  );
};

const makeStyles = (DS) => StyleSheet.create({

  root: { flex: 1 },
  filterBar: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: DS.faint },
  filterScroll: { flexGrow: 0, flexShrink: 1 },
  filterRow: { flexDirection: 'row', gap: 8, paddingLeft: 14, paddingRight: 4, paddingVertical: 10 },
  tuneBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  tuneDot: {
    position: 'absolute', top: 6, right: 3,
    minWidth: 15, height: 15, borderRadius: 8, paddingHorizontal: 3,
    backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center',
  },
  tuneDotText: { fontSize: 9.5, fontWeight: '900', color: DS.onLime },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 190,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.border,
  },
  chipOn: { backgroundColor: DS.lime, borderColor: DS.lime },
  chipText: { fontSize: 12, fontWeight: '700', color: DS.textVariant, flexShrink: 1 },
  chipTextOn: { color: DS.onLime },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8 },
  clearText: { fontSize: 12, fontWeight: '800', color: DS.coral },
  hero: {
    borderRadius: 18,
    margin: 14,
    overflow: 'hidden', // Ensure the gradient doesn't bleed out
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  heroContent: {
    padding: 20,
    zIndex: 1, // Stay above the absolute SVG background
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heroValue: { fontSize: 44, fontWeight: '900', color: '#ffffff', letterSpacing: -1 }, // More vibrant, pure white
  heroLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.8)', letterSpacing: 1.2, marginTop: 4 },
  formRow: { flexDirection: 'row', gap: 6 },
  formDot: { width: 22, height: 22, borderRadius: 8, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  formDotText: { fontSize: 11, fontWeight: '900', color: '#fff' },
  wlBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 18, backgroundColor: 'rgba(255,255,255,0.2)' },
  wlLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.9)' },
  // Same bands and rows as the leaderboard index — see LeaderboardIndex.js.
  catHead: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 12,
    backgroundColor: DS.surfaceHigh,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: DS.faint,
  },
  catHeadText: { fontSize: 12, fontWeight: '900', color: DS.lime, letterSpacing: 1.5, textTransform: 'uppercase' }, // enhanced typography
  statRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    minHeight: 52, paddingHorizontal: 18, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: DS.faint,
    backgroundColor: DS.surface,
  },
  statRowLast: { marginBottom: 0, borderBottomWidth: 0 },
  statRowLabel: { flex: 1, fontSize: 14.5, fontWeight: '600', color: DS.textVariant, letterSpacing: 0.2 },
  statRowValue: { fontSize: 16, fontWeight: '900', color: DS.textPrimary, fontVariant: ['tabular-nums'] },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  avatarFallback: { backgroundColor: '#0a5227', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  leaderName: { fontSize: 14, fontWeight: '800', color: DS.textPrimary },
  colRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 2 },
  colText: { fontSize: 10, fontWeight: '700', color: DS.textVariant, fontVariant: ['tabular-nums'] },
  colLabel: { color: DS.textMuted, fontWeight: '600' },
  leaderValue: { fontSize: 18, fontWeight: '900', color: DS.lime, fontVariant: ['tabular-nums'] },
  leaderUnit: { fontSize: 9, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.4 },

  backdrop: { flex: 1, backgroundColor: '#0009' },
  sheet: { backgroundColor: DS.surfaceLow, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 },
  grab: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: DS.faint, marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: DS.textPrimary, marginBottom: 10 },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: DS.faint },
  optionText: { fontSize: 14, fontWeight: '600', color: DS.textPrimary },

  empty: { alignItems: 'center', paddingVertical: 48, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: DS.textPrimary, marginTop: 6 },
  emptyHint: { fontSize: 12, fontWeight: '600', color: DS.textMuted, textAlign: 'center', maxWidth: 260 },

  skelBar: { height: 12, borderRadius: 6, backgroundColor: DS.surfaceHigh },

  boardCard: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 14, overflow: 'hidden' },
  boardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: DS.border },
  boardTitle: { fontSize: 14, fontWeight: '800', color: DS.textPrimary },
  
  podiumRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 8, height: 130, marginBottom: 12 },
  podiumItem: { alignItems: 'center', backgroundColor: DS.surface, borderRadius: 12, padding: 8, flex: 1, borderWidth: 1, borderColor: DS.border },
  podiumFirst: { height: 120 },
  podiumOther: { height: 100 },
  podiumRank: { position: 'absolute', top: -10, backgroundColor: DS.surfaceHigh, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: DS.border },
  podiumRankText: { fontSize: 10, fontWeight: '900' },
  podiumName: { fontSize: 11, fontWeight: '700', color: DS.textPrimary, marginTop: 6, textAlign: 'center' },
  podiumStat: { flexDirection: 'row', alignItems: 'baseline', gap: 2, marginTop: 4 },
  podiumValue: { fontSize: 15, fontWeight: '900', color: DS.lime, fontVariant: ['tabular-nums'] },
  podiumUnit: { fontSize: 9, fontWeight: '700', color: DS.textMuted },
  
  boardList: { borderTopWidth: 1, borderTopColor: DS.border, paddingTop: 8 },
  boardListItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 12 },
  boardListRank: { width: 24, fontSize: 11, fontWeight: '800', color: DS.textMuted, textAlign: 'right' },
  listAvatar: {
    width: 24, height: 24, borderRadius: 12, marginHorizontal: 8,
    backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  listAvatarImg: { width: 24, height: 24 },
  listAvatarText: { fontSize: 11, fontWeight: '800', color: DS.textVariant },
  boardListName: { flex: 1, fontSize: 13, fontWeight: '600', color: DS.textVariant },
  boardListStat: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  boardListValue: { fontSize: 14, fontWeight: '800', color: DS.textPrimary, fontVariant: ['tabular-nums'] },
  boardListUnit: { fontSize: 9, fontWeight: '600', color: DS.textMuted },
});
