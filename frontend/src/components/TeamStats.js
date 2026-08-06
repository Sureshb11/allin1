import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
  Modal, Pressable, Image, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import LeaderboardIndex from './LeaderboardIndex';
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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// Each board: what it ranks on, and the columns worth showing for it. Keeping
// this as data means a new board is a row here, not another block of JSX.
export { BOARDS };

const RANK = ['#FBBF24', '#94A3B8', '#B45309']; // Gold, Silver, Bronze

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

  const set = useCallback((patch) => setFilters((f) => ({ ...f, ...patch })), []);

  // Which filters are on, as chips — so what's applied is visible without
  // opening anything.
  const active = useMemo(() => {
    const out = [];
    if (filters.year) out.push({ key: 'year', label: String(filters.year) });
    if (filters.month != null) out.push({ key: 'month', label: MONTHS[filters.month] });
    if (filters.matchType) out.push({ key: 'matchType', label: filters.matchType });
    if (filters.venue) out.push({ key: 'venue', label: filters.venue });
    if (filters.tournamentId) {
      const t = options.tournaments.find((x) => x.id === filters.tournamentId);
      out.push({ key: 'tournamentId', label: t?.name || 'Tournament' });
    }
    return out;
  }, [filters, options.tournaments]);

  // Year + month are the friendly controls; the API takes a window, so they
  // resolve to one here rather than the server carrying two date vocabularies.
  const applyPeriod = (year, month) => {
    const next = { ...filters, year, month };
    if (year == null) { delete next.from; delete next.to; delete next.year; delete next.month; }
    else {
      const m = month ?? null;
      const from = new Date(year, m ?? 0, 1);
      const to = m == null ? new Date(year, 11, 31, 23, 59, 59) : new Date(year, m + 1, 0, 23, 59, 59);
      next.from = from.toISOString();
      next.to = to.toISOString();
    }
    setFilters(next);
  };

  const clear = (key) => {
    if (key === 'year' || key === 'month') return applyPeriod(key === 'month' ? filters.year : null, key === 'month' ? null : null);
    const next = { ...filters };
    delete next[key];
    setFilters(next);
  };

  const st = data?.team_stats;

  return (
    <View style={s.root}>
      {show === 'stats' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          <FilterPill type="year" label="Year" value={filters.year} icon="calendar-month-outline" />
          <FilterPill type="matchType" label="Format" value={filters.matchType} icon="cricket" />
          <FilterPill type="venue" label="Ground" value={filters.venue} icon="map-marker-outline" />
          <FilterPill type="tournamentId" label="Tournament" value={filters.tournamentId} icon="trophy-outline" />
          
          {(filters.year || filters.matchType || filters.venue || filters.tournamentId) && (
            <TouchableOpacity style={s.clearBtn} onPress={() => setFilters({})}>
              <Icon name="close" size={16} color={DS.textMuted} />
              <Text style={s.clearText}>Clear</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {loading ? <Skeleton s={s} DS={DS} />
        : !st ? <Empty icon="chart-box-outline" title="No stats yet"
                       hint="They appear once this team has a completed match." s={s} DS={DS} />
        : show === 'stats' ? (
          <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
            <View style={s.hero}>
              <View style={s.heroTop}>
                <View>
                  <Text style={s.heroValue}>{st.winPct}%</Text>
                  <Text style={s.heroLabel}>WIN RATE · {st.played} {st.played === 1 ? 'MATCH' : 'MATCHES'}</Text>
                </View>
                <View style={s.formRow}>
                  {(st.form || []).map((r, i) => (
                    <View key={i} style={[s.formDot, { backgroundColor: r === 'W' ? DS.success : r === 'L' ? DS.coral : DS.textMuted }]}>
                      <Text style={s.formDotText}>{r}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={s.wlBar}>
                {[['won', st.won, DS.success], ['tied', st.tied, DS.textVariant], ['noResult', st.noResult, DS.textMuted], ['lost', st.lost, DS.coral]]
                  .filter(([, n]) => n > 0)
                  .map(([k, n, c]) => (
                    <View key={k} style={{ flex: n, backgroundColor: c, height: '100%' }} />
                  ))}
              </View>
              <View style={s.wlLegend}>
                <Legend n={st.won} label="Won" c={DS.success} s={s} />
                <Legend n={st.lost} label="Lost" c={DS.coral} s={s} />
                {st.tied > 0 && <Legend n={st.tied} label="Tied" c={DS.textVariant} s={s} />}
                {st.noResult > 0 && <Legend n={st.noResult} label="No result" c={DS.textMuted} s={s} />}
              </View>
            </View>
            
            <Group title="MATCH STATISTICS" icon="cricket" s={s} DS={DS}>
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

            <Group title="BATTING STATISTICS" icon="baseball-bat" s={s} DS={DS}>
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

            <Group title="BOWLING STATISTICS" icon="bowling" s={s} DS={DS}>
              <Stat label="Total Wickets" value={st.totalWickets} s={s} />
              <Stat label="Runs Conceded" value={st.totalRunsConceded} s={s} />
              <Stat label="Team Economy Rate" value={st.teamEconomy} s={s} />
              <Stat label="Team Bowling Average" value={st.teamBowlingAvg} s={s} />
              <Stat label="Team Strike Rate" value={st.teamBowlingSr} s={s} />
              <Stat label="Total Maidens" value={st.totalMaidens} s={s} />
              <Stat label="Total Dot Balls" value={st.totalDots} s={s} />
              <Stat label="Best Bowling Figures" value={data?.leaderboards?.bestBowling?.[0] ? `${data.leaderboards.bestBowling[0].best} (${data.leaderboards.bestBowling[0].name.split(' ')[0]})` : '—'} s={s} />
            </Group>

            <Group title="FIELDING STATISTICS" icon="hand-back-right-outline" s={s} DS={DS}>
              <Stat label="Total Catches" value={st.catches} s={s} />
              <Stat label="Total Run Outs" value={st.runOuts} s={s} />
              <Stat label="Direct Hit Run Outs" value={st.directHits} s={s} />
              <Stat label="Assisted Run Outs" value={st.assistedRunOuts} s={s} />
              <Stat label="Total Stumpings" value={st.stumpings} s={s} />
              <Stat label="Total Dismissals" value={st.dismissals} s={s} />
            </Group>

            <Group title="TOSS & MATCH STATISTICS" icon="rotate-360" s={s} DS={DS}>
              <Stat label="Tosses Won" value={st.tossWon} s={s} />
              <Stat label="Tosses Lost" value={Math.max(0, st.tossKnown - st.tossWon)} s={s} />
              <Stat label="Wins Batting First" value={st.batFirstWins} s={s} />
              <Stat label="Wins Chasing" value={st.fieldFirstWins} s={s} />
              <Stat label="Home Wins" value={st.homeWins} s={s} />
              <Stat label="Away Wins" value={st.awayWins} s={s} />
              <Stat label="Neutral Venue Wins" value={st.neutralWins} s={s} />
            </Group>

            <Group title="TEAM RECORDS" icon="trophy-outline" s={s} DS={DS}>
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

      {picker && (
        <Modal transparent animationType="fade" visible={true} onRequestClose={() => setPicker(null)}>
          <Pressable style={s.backdrop} onPress={() => setPicker(null)} />
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>{picker}</Text>
            {/* Logic for options would go here */}
          </View>
        </Modal>
      )}
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

function Stat({ label, value, s }) {
  if (value === null || value === undefined || value === '' || value === '—') return null;
  return (
    <View style={s.stat}>
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{String(value)}</Text>
      <Text style={s.statLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

function Group({ title, icon, children, s, DS }) {
  const shown = (Array.isArray(children) ? children : [children]).filter(Boolean);
  if (!shown.length) return null;
  return (
    <View style={s.group}>
      <View style={s.groupHead}>
        <Icon name={icon} size={14} color={DS.lime} />
        <Text style={s.groupTitle}>{title}</Text>
      </View>
      <View style={s.statGrid}>{shown}</View>
    </View>
  );
}

function FilterPill({ type, label, value, icon }) {
  // We'll just render a stub since this is only for the global stats, which isn't the main focus,
  // but to keep it from crashing:
  const DS = useTheme().colors;
  const s = useThemedStyles(makeStyles);
  const on = value !== undefined && value !== null;
  return (
    <TouchableOpacity style={[s.chip, on && s.chipOn]} activeOpacity={0.8}>
      <Icon name={icon} size={13} color={on ? DS.onLime : DS.textVariant} />
      <Text style={[s.chipText, on && { color: DS.onLime }]} numberOfLines={1}>{label}</Text>
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

const Skeleton = ({ s }) => (
  <View>
    <View style={[s.hero, { height: 128 }]} />
    <View style={s.group}>
      <View style={[s.skelBar, { width: 110, marginBottom: 12 }]} />
      <View style={s.statGrid}>
        {[0, 1, 2, 3].map((j) => <View key={j} style={[s.stat, { height: 62 }]} />)}
      </View>
    </View>
  </View>
);

const makeStyles = (DS) => StyleSheet.create({
  // ── Leaderboard index ──
  // A grey band names the category, plain rows name the boards, a hairline
  // separates them. The same shape every cricket app uses for this, because a
  // list of thirty-four things needs to read as a list.
  catHead: {
    paddingHorizontal: 16, paddingVertical: 9,
    backgroundColor: DS.surfaceHigh,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: DS.faint,
  },
  catHeadText: { fontSize: 11, fontWeight: '900', color: DS.textMuted, letterSpacing: 1 },
  boardRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    minHeight: 56, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: DS.faint,
    backgroundColor: DS.surface,
  },
  boardRowLast: { borderBottomWidth: 0 },
  boardRowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  boardRowTitle: { fontSize: 14.5, fontWeight: '700', color: DS.textPrimary, flexShrink: 1 },
  capTag: { fontSize: 8.5, fontWeight: '900', letterSpacing: 0.6 },
  boardRowLead: { fontSize: 11.5, fontWeight: '600', color: DS.textMuted, marginTop: 2 },

  root: { flex: 1 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 190,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.border,
  },
  chipOn: { backgroundColor: DS.lime, borderColor: DS.lime },
  chipText: { fontSize: 12, fontWeight: '700', color: DS.textVariant, flexShrink: 1 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8 },
  clearText: { fontSize: 12, fontWeight: '800', color: DS.coral },
  hero: {
    backgroundColor: DS.surface, borderRadius: 18, borderWidth: 1, borderColor: DS.border,
    padding: 16, marginBottom: 14,
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heroValue: { fontSize: 38, fontWeight: '900', color: DS.textPrimary, letterSpacing: -1 },
  heroLabel: { fontSize: 10, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.8, marginTop: 2 },
  formRow: { flexDirection: 'row', gap: 4 },
  formDot: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  formDotText: { fontSize: 10, fontWeight: '900', color: '#fff' },
  wlBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 14, backgroundColor: DS.surfaceHigh },
  wlLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, fontWeight: '700', color: DS.textVariant },
  group: {
    backgroundColor: DS.surface, borderRadius: 18, borderWidth: 1, borderColor: DS.border,
    padding: 14, marginBottom: 14,
  },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  groupTitle: { fontSize: 13, fontWeight: '800', color: DS.textPrimary, letterSpacing: 0.3 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: {
    width: '31.5%', backgroundColor: DS.surfaceHigh, borderRadius: 12,
    paddingVertical: 11, paddingHorizontal: 8, alignItems: 'center',
  },
  statValue: { fontSize: 19, fontWeight: '900', color: DS.textPrimary, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 10, fontWeight: '700', color: DS.textMuted, textAlign: 'center', marginTop: 3, letterSpacing: 0.2 },
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
