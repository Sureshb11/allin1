import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
  Modal, Pressable, Image, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import ViewShot from 'react-native-view-shot';
import Share from 'react-native-share';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

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
export const BOARDS = [
  // BATTING
  { category: 'BATTING', key: 'runs', title: 'Most Runs', icon: 'cricket', value: (r) => r.runs, unit: 'runs', cols: [['M', 'matches'], ['Inn', 'innings'], ['R', 'runs'], ['SR', 'strikeRate']] },
  { category: 'BATTING', key: 'highest', title: 'Highest Scores', icon: 'trophy-outline', value: (r) => r.highest, unit: '', cols: [['M', 'matches'], ['Runs', 'runs'], ['SR', 'strikeRate']] },
  { category: 'BATTING', key: 'average', title: 'Best Batting Average', icon: 'calculator', value: (r) => r.average, unit: '', cols: [['M', 'matches'], ['Inn', 'innings'], ['Runs', 'runs'], ['Avg', 'average']] },
  { category: 'BATTING', key: 'strikeRate', title: 'Best Batting Strike Rate', icon: 'flash', value: (r) => r.strikeRate, unit: 'sr', qualified: true, cols: [['Inn', 'innings'], ['Runs', 'runs'], ['Balls', 'balls'], ['SR', 'strikeRate']] },
  { category: 'BATTING', key: 'fours', title: 'Most Fours', icon: 'arrow-right-bold', value: (r) => r.fours, unit: '4s', cols: [['M', 'matches'], ['Runs', 'runs'], ['4s', 'fours']] },
  { category: 'BATTING', key: 'sixes', title: 'Most Sixes', icon: 'arrow-up-bold', value: (r) => r.sixes, unit: '6s', cols: [['M', 'matches'], ['Runs', 'runs'], ['6s', 'sixes']] },
  { category: 'BATTING', key: 'fifties', title: 'Most 50s', icon: 'star-half-full', value: (r) => r.fifties, unit: '50s', cols: [['M', 'matches'], ['Runs', 'runs'], ['50s', 'fifties']] },
  { category: 'BATTING', key: 'hundreds', title: 'Most 100s', icon: 'star-circle', value: (r) => r.hundreds, unit: '100s', cols: [['M', 'matches'], ['Runs', 'runs'], ['100s', 'hundreds']] },
  { category: 'BATTING', key: 'notOuts', title: 'Most Not Outs', icon: 'account-cancel-outline', value: (r) => r.notOuts, unit: 'no', cols: [['M', 'matches'], ['Inn', 'innings'], ['NO', 'notOuts']] },
  { category: 'BATTING', key: 'ducks', title: 'Most Ducks', icon: 'duck', value: (r) => r.ducks, unit: 'ducks', cols: [['M', 'matches'], ['Inn', 'innings'], ['0s', 'ducks']] },
  
  // BOWLING
  { category: 'BOWLING', key: 'wickets', title: 'Most Wickets', icon: 'bowling', value: (r) => r.wickets, unit: 'wkts', cols: [['M', 'matches'], ['Ov', 'overs'], ['W', 'wickets'], ['Econ', 'economy']] },
  { category: 'BOWLING', key: 'bestBowling', title: 'Best Bowling Figures', icon: 'trophy-outline', value: (r) => r.best, unit: '', cols: [['M', 'matches'], ['Ov', 'overs'], ['Best', 'best']] },
  { category: 'BOWLING', key: 'economy', title: 'Best Economy', icon: 'gauge-low', value: (r) => r.economy, unit: 'rpo', qualified: true, cols: [['Ov', 'overs'], ['W', 'wickets'], ['Econ', 'economy']] },
  { category: 'BOWLING', key: 'bowlingAvg', title: 'Best Bowling Average', icon: 'calculator', value: (r) => r.average, unit: '', cols: [['Ov', 'overs'], ['W', 'wickets'], ['Avg', 'average']] },
  { category: 'BOWLING', key: 'bowlingSr', title: 'Best Bowling Strike Rate', icon: 'flash', value: (r) => r.strikeRate, unit: 'sr', cols: [['Ov', 'overs'], ['W', 'wickets'], ['SR', 'strikeRate']] },
  { category: 'BOWLING', key: 'maidens', title: 'Most Maidens', icon: 'shield-outline', value: (r) => r.maidens, unit: 'm', cols: [['M', 'matches'], ['Ov', 'overs'], ['M', 'maidens']] },
  { category: 'BOWLING', key: 'dots', title: 'Most Dot Balls', icon: 'circle-small', value: (r) => r.dots, unit: 'dots', cols: [['M', 'matches'], ['Ov', 'overs'], ['Dots', 'dots']] },
  { category: 'BOWLING', key: 'threes', title: 'Most 3-Wicket Hauls', icon: 'hand-front-right', value: (r) => r.threes, unit: '3W', cols: [['M', 'matches'], ['W', 'wickets'], ['3W', 'threes']] },
  { category: 'BOWLING', key: 'fives', title: 'Most 5-Wicket Hauls', icon: 'hand-front-right', value: (r) => r.fives, unit: '5W', cols: [['M', 'matches'], ['W', 'wickets'], ['5W', 'fives']] },
  
  // FIELDING
  { category: 'FIELDING', key: 'catches', title: 'Most Catches', icon: 'hand-back-right-outline', value: (r) => r.catches, unit: 'ct', cols: [['M', 'matches'], ['RO', 'runOuts'], ['St', 'stumpings']] },
  { category: 'FIELDING', key: 'runOuts', title: 'Most Run Outs', icon: 'run-fast', value: (r) => r.runOuts, unit: 'ro', cols: [['M', 'matches'], ['Ct', 'catches'], ['St', 'stumpings']] },
  { category: 'FIELDING', key: 'directHits', title: 'Most Direct Hit Run Outs', icon: 'target', value: (r) => r.directHits, unit: 'dh', cols: [['M', 'matches'], ['RO', 'runOuts'], ['DH', 'directHits']] },
  { category: 'FIELDING', key: 'assistedRunOuts', title: 'Most Assisted Run Outs', icon: 'account-multiple-outline', value: (r) => r.assistedRunOuts, unit: 'aro', cols: [['M', 'matches'], ['RO', 'runOuts'], ['ARO', 'assistedRunOuts']] },
  { category: 'FIELDING', key: 'stumpings', title: 'Most Stumpings', icon: 'hand-back-left', value: (r) => r.stumpings, unit: 'st', cols: [['M', 'matches'], ['Ct', 'catches'], ['RO', 'runOuts']] },
  { category: 'FIELDING', key: 'dismissals', title: 'Most Dismissals', icon: 'account-remove-outline', value: (r) => r.dismissals, unit: 'dis', cols: [['Ct', 'catches'], ['RO', 'runOuts'], ['St', 'stumpings']] },

  // PARTICIPATION
  { category: 'PARTICIPATION', key: 'matches', title: 'Most Matches Played', icon: 'account-group-outline', value: (r) => r.matches, unit: 'mat', cols: [['Inn (B)', 'inningsBat'], ['Ov (B)', 'oversBowl'], ['M', 'matches']] },
  { category: 'PARTICIPATION', key: 'inningsBat', title: 'Most Innings Batted', icon: 'cricket', value: (r) => r.inningsBat, unit: 'inn', cols: [['M', 'matches'], ['Balls', 'ballsFaced'], ['Inn', 'inningsBat']] },
  { category: 'PARTICIPATION', key: 'inningsBowl', title: 'Most Innings Bowled', icon: 'bowling', value: (r) => r.inningsBowl, unit: 'inn', cols: [['M', 'matches'], ['Ov', 'oversBowl'], ['Inn', 'inningsBowl']] },
  { category: 'PARTICIPATION', key: 'oversBowl', title: 'Most Overs Bowled', icon: 'baseball-diamond-outline', value: (r) => r.oversBowl, unit: 'ov', cols: [['M', 'matches'], ['Inn', 'inningsBowl'], ['Ov', 'oversBowl']] },
  { category: 'PARTICIPATION', key: 'ballsFaced', title: 'Most Balls Faced', icon: 'baseball-outline', value: (r) => r.ballsFaced, unit: 'balls', cols: [['M', 'matches'], ['Inn', 'inningsBat'], ['Balls', 'ballsFaced']] },

  // AWARDS & RECORDS
  { category: 'AWARDS & RECORDS', key: 'fastest50', title: 'Fastest Fifty', icon: 'timer-outline', value: (r) => r.fastest50, unit: 'balls', cols: [['M', 'matches'], ['Inn', 'innings'], ['Balls', 'fastest50']] },
  { category: 'AWARDS & RECORDS', key: 'fastest100', title: 'Fastest Century', icon: 'timer-star-outline', value: (r) => r.fastest100, unit: 'balls', cols: [['M', 'matches'], ['Inn', 'innings'], ['Balls', 'fastest100']] },
  { category: 'OTHERS', key: 'motm', title: 'Player of the Match', icon: 'medal-outline', value: (r) => r.count, unit: 'awards', cols: [] },
  { category: 'OTHERS', key: 'captainWins', title: 'Most Wins as Captain', icon: 'crown-outline', value: (r) => r.wins, unit: 'wins', cols: [] },
];

const RANK = ['#FBBF24', '#94A3B8', '#B45309']; // Gold, Silver, Bronze

const BoardCard = ({ board, players, teamName, s, DS }) => {
  const viewRef = useRef();
  const top3 = players.slice(0, 3);
  const rest = players.slice(3);

  const handleShare = async () => {
    ReactNativeHapticFeedback.trigger("impactLight");
    try {
      const uri = await viewRef.current.capture();
      await Share.open({ url: uri, title: `Team ${teamName} - ${board.title}`, message: `Check out our top players for ${board.title}!` });
    } catch (e) {
      console.log('Share error:', e);
    }
  };

  return (
    <ViewShot ref={viewRef} options={{ format: 'jpg', quality: 0.9 }}>
      <View style={[s.boardCard, { backgroundColor: DS.surfaceHigh }]}> 
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name={board.icon} size={18} color={DS.lime} />
            <Text style={s.boardTitle}>{board.title}</Text>
          </View>
          <TouchableOpacity onPress={handleShare} style={{ padding: 4 }}>
            <Icon name="share-variant" size={20} color={DS.textMuted} />
          </TouchableOpacity>
        </View>
        
        {/* Podium for Top 3 */}
        <View style={s.podiumRow}>
          {top3.map((p, idx) => (
            <View key={p.playerId} style={[s.podiumItem, idx === 0 ? s.podiumFirst : s.podiumOther]}>
              <View style={s.podiumRank}>
                <Text style={[s.podiumRankText, { color: RANK[idx] }]}>#{idx + 1}</Text>
              </View>
              <View style={s.avatarFallback}>
                {p.avatar ? (
                  <Image source={{ uri: p.avatar }} style={s.avatar} />
                ) : (
                  <Text style={s.avatarText}>{p.name.charAt(0)}</Text>
                )}
              </View>
              <Text style={s.podiumName} numberOfLines={1}>{p.name}</Text>
              <View style={s.podiumStat}>
                <Text style={s.podiumValue}>{board.value(p)}</Text>
                {board.unit ? <Text style={s.podiumUnit}>{board.unit}</Text> : null}
              </View>
            </View>
          ))}
        </View>
        
        {/* List for the rest */}
        {rest.length > 0 && (
          <View style={s.boardList}>
            {rest.map((p, idx) => (
              <View key={p.playerId} style={s.boardListItem}>
                <Text style={s.boardListRank}>#{idx + 4}</Text>
                <Text style={s.boardListName} numberOfLines={1}>{p.name}</Text>
                <View style={s.boardListStat}>
                  <Text style={s.boardListValue}>{board.value(p)}</Text>
                  {board.unit ? <Text style={s.boardListUnit}>{board.unit}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ViewShot>
  );
};

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
  const toggle = useCallback((key) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => ({ ...o, [key]: !o[key] }));
  }, []);

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

    // Group boards by category
    const grouped = BOARDS.reduce((acc, board) => {
      (acc[board.category] = acc[board.category] || []).push(board);
      return acc;
    }, {});

    return (
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
        {Object.entries(grouped).map(([category, boards]) => {
          // Only show boards that have at least one player
          const validBoards = boards.filter(b => lds[b.key]?.length > 0);
          if (validBoards.length === 0) return null;

          return (
            <Group key={category} title={category} icon="podium" s={s} DS={DS}>
              <View style={{ width: '100%', gap: 14 }}>
                {validBoards.map(board => {
                  const players = lds[board.key];
                  return (
                    <BoardCard key={board.key} board={board} players={players} teamName={data?.team?.name || 'Local Legends'} s={s} DS={DS} />
                  );
                })}
              </View>
            </Group>
          );
        })}
      </ScrollView>
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
  root: { flex: 1 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 190,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.border,
  },
  chipOn: { backgroundColor: DS.lime, borderColor: DS.lime },
  chipText: { fontSize: 12.5, fontWeight: '700', color: DS.textVariant, flexShrink: 1 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8 },
  clearText: { fontSize: 12.5, fontWeight: '800', color: DS.coral },
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
  legendText: { fontSize: 11.5, fontWeight: '700', color: DS.textVariant },
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
  statLabel: { fontSize: 9.5, fontWeight: '700', color: DS.textMuted, textAlign: 'center', marginTop: 3, letterSpacing: 0.2 },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  avatarFallback: { backgroundColor: '#0a5227', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  leaderName: { fontSize: 14, fontWeight: '800', color: DS.textPrimary },
  colRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 2 },
  colText: { fontSize: 10.5, fontWeight: '700', color: DS.textVariant, fontVariant: ['tabular-nums'] },
  colLabel: { color: DS.textMuted, fontWeight: '600' },
  leaderValue: { fontSize: 18, fontWeight: '900', color: DS.lime, fontVariant: ['tabular-nums'] },
  leaderUnit: { fontSize: 9, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.4 },

  backdrop: { flex: 1, backgroundColor: '#0009' },
  sheet: { backgroundColor: DS.surfaceLow, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 },
  grab: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: DS.faint, marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: DS.textPrimary, marginBottom: 10 },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: DS.faint },
  optionText: { fontSize: 14.5, fontWeight: '600', color: DS.textPrimary },

  empty: { alignItems: 'center', paddingVertical: 48, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: DS.textPrimary, marginTop: 6 },
  emptyHint: { fontSize: 12.5, fontWeight: '600', color: DS.textMuted, textAlign: 'center', maxWidth: 260 },

  skelBar: { height: 12, borderRadius: 6, backgroundColor: DS.surfaceHigh },

  boardCard: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 14, overflow: 'hidden' },
  boardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: DS.border },
  boardTitle: { fontSize: 14.5, fontWeight: '800', color: DS.textPrimary },
  
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
  boardListName: { flex: 1, fontSize: 13, fontWeight: '600', color: DS.textVariant },
  boardListStat: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  boardListValue: { fontSize: 14, fontWeight: '800', color: DS.textPrimary, fontVariant: ['tabular-nums'] },
  boardListUnit: { fontSize: 9, fontWeight: '600', color: DS.textMuted },
});
