import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
  Modal, Pressable, Image, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

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
const BOARDS = [
  { key: 'runs', title: 'Top Run Scorers', icon: 'cricket', value: (r) => r.runs, unit: 'runs',
    cols: [['M', 'matches'], ['Inn', 'innings'], ['Avg', 'average'], ['SR', 'strikeRate'], ['HS', 'highest'], ['50s', 'fifties'], ['100s', 'hundreds'], ['NO', 'notOuts']] },
  { key: 'wickets', title: 'Top Wicket Takers', icon: 'bowling', value: (r) => r.wickets, unit: 'wkts',
    cols: [['M', 'matches'], ['Ov', 'overs'], ['Econ', 'economy'], ['Avg', 'average'], ['Best', 'best'], ['3W', 'threes'], ['5W', 'fives'], ['Dots', 'dots']] },
  { key: 'economy', title: 'Best Economy', icon: 'gauge-low', value: (r) => r.economy, unit: 'rpo', qualified: true,
    cols: [['Ov', 'overs'], ['Runs', 'runs'], ['Wkts', 'wickets']] },
  { key: 'strikeRate', title: 'Best Strike Rate', icon: 'flash', value: (r) => r.strikeRate, unit: 'sr', qualified: true,
    cols: [['Inn', 'innings'], ['Runs', 'runs'], ['Balls', 'balls']] },
  { key: 'highest', title: 'Highest Individual Score', icon: 'trophy-outline', value: (r) => r.highest, unit: '',
    cols: [['M', 'matches'], ['Runs', 'runs'], ['SR', 'strikeRate']] },
  { key: 'sixes', title: 'Most Sixes', icon: 'arrow-up-bold', value: (r) => r.sixes, unit: '6s',
    cols: [['M', 'matches'], ['Runs', 'runs'], ['4s', 'fours']] },
  { key: 'fours', title: 'Most Fours', icon: 'arrow-right-bold', value: (r) => r.fours, unit: '4s',
    cols: [['M', 'matches'], ['Runs', 'runs'], ['6s', 'sixes']] },
  { key: 'catches', title: 'Most Catches', icon: 'hand-back-right-outline', value: (r) => r.catches, unit: 'ct',
    cols: [['RO', 'runOuts'], ['St', 'stumpings']] },
  { key: 'runOuts', title: 'Most Run Outs', icon: 'run-fast', value: (r) => r.runOuts, unit: 'ro',
    cols: [['Ct', 'catches'], ['St', 'stumpings']] },
  { key: 'stumpings', title: 'Most Stumpings', icon: 'hand-back-left', value: (r) => r.stumpings, unit: 'st',
    cols: [['Ct', 'catches'], ['RO', 'runOuts']] },
  { key: 'dismissals', title: 'Most Dismissals', icon: 'shield-star-outline', value: (r) => r.dismissals, unit: '',
    cols: [['Ct', 'catches'], ['RO', 'runOuts'], ['St', 'stumpings']] },
  { key: 'motm', title: 'Player of the Match', icon: 'medal-outline', value: (r) => r.count, unit: 'awards', cols: [] },
  { key: 'appearances', title: 'Most Matches Played', icon: 'calendar-check', value: (r) => r.matches, unit: 'matches',
    cols: [['Runs', 'runs'], ['Inn', 'innings']] },
  { key: 'captainWins', title: 'Most Wins as Captain', icon: 'crown-outline', value: (r) => r.wins, unit: 'wins', cols: [] },
];

const RANK = ['#d4af37', '#9ca3af', '#b87333'];   // gold, silver, bronze

export default function TeamStats({ teamId }) {
  const DS = useTheme().colors;
  const s = useThemedStyles(makeStyles);

  const [filters, setFilters] = useState({});
  const [options, setOptions] = useState({ years: [], matchTypes: [], venues: [], tournaments: [] });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(null);          // which filter sheet is open
  const [open, setOpen] = useState({ runs: true, wickets: true });

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
    // Plain content, NOT its own scroll view: this renders inside the team
    // screen's ScrollView, and a nested vertical scroller in React Native gets
    // no height and never scrolls. The filter row therefore scrolls with the
    // page rather than sticking — the brief asked for sticky, and honestly
    // reporting that it isn't beats shipping a bar that eats the gesture.
    <View>
      <View style={s.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          <FilterChip label={filters.year ? (filters.month != null ? `${MONTHS[filters.month].slice(0, 3)} ${filters.year}` : String(filters.year)) : 'All time'}
                      icon="calendar-range" on={!!filters.year} onPress={() => setPicker('period')} s={s} DS={DS} />
          <FilterChip label={filters.matchType || 'Any format'} icon="cricket" on={!!filters.matchType}
                      onPress={() => setPicker('matchType')} s={s} DS={DS} />
          <FilterChip label={filters.venue || 'All grounds'} icon="map-marker-outline" on={!!filters.venue}
                      onPress={() => setPicker('venue')} s={s} DS={DS} />
          {options.tournaments.length > 0 && (
            <FilterChip label={active.find((a) => a.key === 'tournamentId')?.label || 'All tournaments'}
                        icon="trophy-outline" on={!!filters.tournamentId}
                        onPress={() => setPicker('tournament')} s={s} DS={DS} />
          )}
          {active.length > 0 && (
            <TouchableOpacity style={s.clearAll} onPress={() => setFilters({})}>
              <Icon name="close" size={13} color={DS.coral} />
              <Text style={s.clearAllText}>Clear</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      <View style={{ padding: 14, paddingBottom: 24 }}>
        {loading ? <Skeleton s={s} DS={DS} />
          : !st ? <Empty icon="chart-box-outline" title="No stats yet"
                         hint="They appear once this team has a completed match." s={s} DS={DS} />
          : st.played === 0 ? <Empty icon="filter-remove-outline" title="Nothing matches those filters"
                         hint="Try a wider period, or clear a filter." s={s} DS={DS} />
          : (
            <>
              {/* Headline: the record, and how it's trending. */}
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
                {/* One bar carrying the whole record — wider than any number. */}
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

              <Group title="Scoring" icon="chart-line" s={s} DS={DS}>
                <Stat label="Highest score" value={st.highestScore} s={s} />
                <Stat label="Lowest score" value={st.lowestScore} s={s} />
                <Stat label="Average score" value={st.avgScore} s={s} />
                <Stat label="Runs per over" value={st.runRate} s={s} />
                <Stat label="Total runs" value={st.totalRuns} s={s} />
                <Stat label="Avg wickets lost" value={st.avgWicketsLost} s={s} />
              </Group>

              <Group title="Boundaries & extras" icon="format-list-numbered" s={s} DS={DS}>
                <Stat label="Fours" value={st.fours} s={s} />
                <Stat label="Sixes" value={st.sixes} s={s} />
                <Stat label="Boundaries" value={st.boundaries} s={s} />
                <Stat label="Extras" value={st.extras} s={s} />
                <Stat label="Wickets taken" value={st.totalWickets} s={s} />
              </Group>

              <Group title="Chasing & defending" icon="target" s={s} DS={DS}>
                <Stat label="Best chase" value={st.bestChase} s={s} />
                <Stat label="Lowest defended" value={st.lowestDefended} s={s} />
                <Stat label="Best win (runs)" value={st.bestWinRuns} s={s} />
                <Stat label="Best win (wkts)" value={st.bestWinWickets} s={s} />
                <Stat label="Avg 1st innings" value={st.avgFirstInnings} s={s} />
                <Stat label="Avg 2nd innings" value={st.avgSecondInnings} s={s} />
              </Group>

              <Group title="Toss, ends & streaks" icon="rotate-360" s={s} DS={DS}>
                <Stat label="Toss won" value={`${st.tossWinPct}%`} s={s} />
                <Stat label="Batting first" value={`${st.batFirstWins}/${st.batFirstPlayed}`} s={s} />
                <Stat label="Fielding first" value={`${st.fieldFirstWins}/${st.fieldFirstPlayed}`} s={s} />
                <Stat label="Current streak" value={st.currentStreak} s={s} />
                <Stat label="Longest win run" value={st.longestWinStreak} s={s} />
                <Stat label="Longest losing run" value={st.longestLossStreak} s={s} />
                {st.homePlayed + st.awayPlayed > 0 && <Stat label="Home wins" value={`${st.homeWins}/${st.homePlayed}`} s={s} />}
                {st.homePlayed + st.awayPlayed > 0 && <Stat label="Away wins" value={`${st.awayWins}/${st.awayPlayed}`} s={s} />}
              </Group>

              {/* ── Leaderboards ── */}
              <Text style={s.sectionHead}>Leaderboards</Text>
              {BOARDS.map((b) => {
                const rows = data.leaderboards[b.key] || [];
                if (!rows.length) return null;
                const isOpen = !!open[b.key];
                return (
                  <View key={b.key} style={s.board}>
                    <TouchableOpacity style={s.boardHead} onPress={() => toggle(b.key)} activeOpacity={0.7}>
                      <View style={s.boardIcon}><Icon name={b.icon} size={15} color={DS.lime} /></View>
                      <Text style={s.boardTitle}>{b.title}</Text>
                      {b.qualified && (
                        <Text style={s.qualNote}>
                          min {b.key === 'economy' ? `${data.qualification.minOvers} ov` : `${data.qualification.minInnings} inn`}
                        </Text>
                      )}
                      <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={DS.textMuted} />
                    </TouchableOpacity>

                    {/* Collapsed still shows the leader — a closed section that
                        says nothing is just a row you have to open. */}
                    {!isOpen ? (
                      <LeaderRow row={rows[0]} rank={0} board={b} compact s={s} DS={DS} />
                    ) : (
                      rows.map((r, i) => <LeaderRow key={(r.playerId || r.name) + i} row={r} rank={i} board={b} s={s} DS={DS} />)
                    )}
                  </View>
                );
              })}
            </>
          )}
      </View>

      {/* ── Filter sheets ── */}
      <PickerSheet
        visible={picker === 'period'} onClose={() => setPicker(null)} title="Period" s={s} DS={DS}
        options={[
          { label: 'All time', value: null },
          ...options.years.map((y) => ({ label: String(y), value: y })),
        ]}
        selected={filters.year ?? null}
        onPick={(v) => { applyPeriod(v, null); setPicker(v == null ? null : 'month'); }}
      />
      <PickerSheet
        visible={picker === 'month'} onClose={() => setPicker(null)} title={`Month in ${filters.year || ''}`} s={s} DS={DS}
        options={[{ label: 'Whole year', value: null }, ...MONTHS.map((m, i) => ({ label: m, value: i }))]}
        selected={filters.month ?? null}
        onPick={(v) => { applyPeriod(filters.year, v); setPicker(null); }}
      />
      <PickerSheet
        visible={picker === 'matchType'} onClose={() => setPicker(null)} title="Format" s={s} DS={DS}
        options={[{ label: 'Any format', value: null }, ...options.matchTypes.map((m) => ({ label: m, value: m }))]}
        selected={filters.matchType ?? null}
        onPick={(v) => { v == null ? clear('matchType') : set({ matchType: v }); setPicker(null); }}
      />
      <PickerSheet
        visible={picker === 'venue'} onClose={() => setPicker(null)} title="Ground" s={s} DS={DS}
        options={[{ label: 'All grounds', value: null }, ...options.venues.map((v) => ({ label: v, value: v }))]}
        selected={filters.venue ?? null}
        onPick={(v) => { v == null ? clear('venue') : set({ venue: v }); setPicker(null); }}
      />
      <PickerSheet
        visible={picker === 'tournament'} onClose={() => setPicker(null)} title="Tournament" s={s} DS={DS}
        options={[{ label: 'All tournaments', value: null }, ...options.tournaments.map((t) => ({ label: t.name, value: t.id }))]}
        selected={filters.tournamentId ?? null}
        onPick={(v) => { v == null ? clear('tournamentId') : set({ tournamentId: v }); setPicker(null); }}
      />
    </View>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function FilterChip({ label, icon, on, onPress, s, DS }) {
  return (
    <TouchableOpacity style={[s.chip, on && s.chipOn]} onPress={onPress} activeOpacity={0.8}>
      <Icon name={icon} size={13} color={on ? DS.onLime : DS.textVariant} />
      <Text style={[s.chipText, on && { color: DS.onLime }]} numberOfLines={1}>{label}</Text>
      <Icon name="chevron-down" size={14} color={on ? DS.onLime : DS.textMuted} />
    </TouchableOpacity>
  );
}

const Legend = ({ n, label, c, s }) => (
  <View style={s.legendItem}>
    <View style={[s.legendDot, { backgroundColor: c }]} />
    <Text style={s.legendText}>{n} {label}</Text>
  </View>
);

// A stat is only drawn when it HAS a value. A grid of dashes reads as broken;
// an absent card reads as "this hasn't happened yet", which is the truth.
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

function LeaderRow({ row, rank, board, compact, s, DS }) {
  if (!row) return null;
  const medal = rank < 3 ? RANK[rank] : null;
  return (
    <View style={[s.leaderRow, compact && { borderBottomWidth: 0 }]}>
      <View style={[s.rankBadge, medal ? { backgroundColor: medal } : null]}>
        <Text style={[s.rankText, medal ? { color: '#1a1a1a' } : null]}>{rank + 1}</Text>
      </View>
      {row.avatarUrl
        ? <Image source={{ uri: row.avatarUrl }} style={s.avatar} />
        : (
          <View style={[s.avatar, s.avatarFallback]}>
            <Text style={s.avatarText}>{String(row.name || '?').charAt(0).toUpperCase()}</Text>
          </View>
        )}
      <View style={{ flex: 1 }}>
        <Text style={s.leaderName} numberOfLines={1}>{row.name}</Text>
        {board.cols.length > 0 && (
          <View style={s.colRow}>
            {board.cols.map(([label, key]) => (
              row[key] === undefined || row[key] === null ? null : (
                <Text key={key} style={s.colText}>
                  <Text style={s.colLabel}>{label} </Text>{String(row[key])}
                </Text>
              )
            ))}
          </View>
        )}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={s.leaderValue}>{board.value(row)}</Text>
        {!!board.unit && <Text style={s.leaderUnit}>{board.unit}</Text>}
      </View>
    </View>
  );
}

function PickerSheet({ visible, onClose, title, options, selected, onPick, s, DS }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.grab} />
        <Text style={s.sheetTitle}>{title}</Text>
        <ScrollView style={{ maxHeight: 340 }}>
          {options.map((o) => {
            const on = o.value === selected;
            return (
              <TouchableOpacity key={String(o.value)} style={s.optionRow} onPress={() => onPick(o.value)}>
                <Text style={[s.optionText, on && { color: DS.lime, fontWeight: '800' }]}>{o.label}</Text>
                {on && <Icon name="check" size={17} color={DS.lime} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const Empty = ({ icon, title, hint, s, DS }) => (
  <View style={s.empty}>
    <Icon name={icon} size={40} color={DS.textMuted} />
    <Text style={s.emptyTitle}>{title}</Text>
    <Text style={s.emptyHint}>{hint}</Text>
  </View>
);

// Shaped like what's coming, so the screen doesn't jump when it lands.
const Skeleton = ({ s }) => (
  <View>
    <View style={[s.hero, { height: 128 }]} />
    {[0, 1].map((i) => (
      <View key={i} style={s.group}>
        <View style={[s.skelBar, { width: 110, marginBottom: 12 }]} />
        <View style={s.statGrid}>
          {[0, 1, 2, 3].map((j) => <View key={j} style={[s.stat, { height: 62 }]} />)}
        </View>
      </View>
    ))}
    <View style={{ alignItems: 'center', paddingTop: 8 }}><ActivityIndicator /></View>
  </View>
);

const makeStyles = (DS) => StyleSheet.create({
  filterBar: { backgroundColor: DS.bg, borderBottomWidth: 1, borderBottomColor: DS.faint },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 190,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.border,
  },
  chipOn: { backgroundColor: DS.lime, borderColor: DS.lime },
  chipText: { fontSize: 12.5, fontWeight: '700', color: DS.textVariant, flexShrink: 1 },
  clearAll: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8 },
  clearAllText: { fontSize: 12.5, fontWeight: '800', color: DS.coral },

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

  sectionHead: { fontSize: 15, fontWeight: '900', color: DS.textPrimary, marginBottom: 10, marginTop: 4, letterSpacing: 0.2 },
  board: { backgroundColor: DS.surface, borderRadius: 18, borderWidth: 1, borderColor: DS.border, marginBottom: 12, overflow: 'hidden' },
  boardHead: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 14 },
  boardIcon: { width: 26, height: 26, borderRadius: 9, backgroundColor: DS.lime + '1f', alignItems: 'center', justifyContent: 'center' },
  boardTitle: { flex: 1, fontSize: 13.5, fontWeight: '800', color: DS.textPrimary },
  qualNote: { fontSize: 10, fontWeight: '700', color: DS.textMuted },

  leaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: DS.faint,
  },
  rankBadge: { width: 22, height: 22, borderRadius: 7, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 11, fontWeight: '900', color: DS.textVariant },
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
});
