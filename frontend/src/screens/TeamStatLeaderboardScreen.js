import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, Pressable, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ViewShot from 'react-native-view-shot';
import Share from 'react-native-share';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import legendsApi from '../services/LegendsApi';
import { BOARDS } from '../components/leaderboardBoards';
import CricketCap, { CAP_COLORS, CAP_LABELS } from '../components/CricketCap';
import StatsFilterSheet from '../components/StatsFilterSheet';

const RANK = ['#d4af37', '#9ca3af', '#b87333']; // gold, silver, bronze

export default function TeamStatLeaderboardScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { teamId, tournamentId, boardKey, category } = route.params;
  // A tournament is already a window — one competition, one season, one set of
  // teams — so it gets the same boards with no filters at all: a year picker
  // would offer the year it was played in, an opposition picker everyone in it.
  // The team boards need filters because a club's history runs for years.
  const isTournament = !!tournamentId;

  const DS = useTheme().colors;
  const s = useThemedStyles(makeStyles);

  const board = BOARDS.find(b => b.key === boardKey);
  // Most Runs listed R and then RUNS, both 263 — the board's own stat appearing
  // once as a supporting column and again as the headline. A board key and its
  // attribute are the same word, so the duplicate is droppable generically
  // rather than by editing thirty-four column lists by hand.
  const cols = (board?.cols || []).filter(([, attr]) => attr !== board?.key);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [options, setOptions] = useState({ years: [], matchTypes: [], oppositions: [] });
  const [filters, setFilters] = useState({});
  const [picker, setPicker] = useState(null); // 'main' | 'matchType' | 'year' | 'venue' | 'opposition'
  // The chips are shortcuts into the same sheet, not a second way of setting
  // the same filter — two controls that stage differently is how a screen ends
  // up disagreeing with itself.
  const openFilters = () => setPicker('main');
  // Clearing a filter leaves the key behind holding null, so counting keys
  // would badge "3 filters" on a board showing everything.
  const active = Object.values(filters).filter(Boolean).length;

  // Share the board as a picture. This lived on the old expanded card and went
  // with it; a leaderboard on its own screen is the better thing to send
  // anyway, because it carries the filters that produced it.
  // A leaderboard is a full-screen table; the dock belongs over none of it, and
  // it was covering the last two rows. That is handled in GlassDock's FULLSCREEN
  // route list now, not by useDockLock from here — see the note there.

  const shotRef = useRef(null);
  const shareBoard = async () => {
    try {
      const uri = await shotRef.current?.capture?.();
      if (!uri) return;
      await Share.open({
        url: uri, type: 'image/jpeg', failOnCancel: false,
        message: board?.title || 'Leaderboard',
      });
    } catch { /* cancelled, or nothing to capture */ }
  };

  // Fetch filter options — nothing to fetch when there are no filters.
  useEffect(() => {
    if (isTournament) return;
    legendsApi.getTeamStatsOptions(teamId).then((r) => {
      if (r.success) setOptions(r.data);
    });
  }, [teamId, isTournament]);

  // Fetch stats whenever filters change
  useEffect(() => {
    setLoading(true);
    const req = isTournament
      ? legendsApi.getTournamentStats(tournamentId)
      : legendsApi.getTeamStats(teamId, filters);
    req.then((r) => {
      if (r.success) setData(r.data.leaderboards?.[boardKey] || []);
      setLoading(false);
    });
  }, [teamId, tournamentId, isTournament, filters, boardKey]);

  // ── Podium ─────────────────────────────────────────────────────────────────
  // It REPLACES rows 1-3 rather than sitting above them, which is what makes it
  // affordable: three table rows are about 168dp and this is about 150, so the
  // ceremony costs the table nothing and nothing is shown twice.
  //
  // Not shared with the Rankings podium — that one says in its own comment that
  // it is tied to that screen's data shape, and it carries a confetti cannon,
  // levitating avatars and shimmer text. Same 2-1-3 arrangement so they read as
  // the same idea; none of the machinery.
  //
  // Not on Most Ducks. A gold-silver-bronze podium for the most ducks is a joke
  // at the expense of whoever is on top of it, and this app is played by people
  // who know each other.
  const NO_PODIUM = ['ducks'];
  const showPodium = data.length >= 3 && !NO_PODIUM.includes(boardKey);
  const podium = showPodium ? [data[1], data[0], data[2]] : [];   // 2 · 1 · 3
  const tableRows = showPodium ? data.slice(3) : data;

  const getOppName = (id) => {
    return options.oppositions?.find(o => o.id === id)?.name || id;
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* Its own header row, not the shared <Header>. That component takes
          `title`, `onMenuPress`, `onSearchPress` and `onNotificationsPress` and
          nothing else — it is the app bar for a tab root. This screen was
          handing it `subtitle` and a `right` slot holding the share and filter
          buttons, and it dropped both on the floor: the two controls this screen
          exists to offer had never once appeared on a device, and there was no
          way back either. Hence "filter is not using" — there was no filter
          button to press.

          It is also 44pt of hard-coded top padding meant to sit under a status
          bar, which doubled the inset SafeAreaView had already added. */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.iconBtn}
          accessibilityRole="button" accessibilityLabel="Go back">
          <Icon name="arrow-left" size={22} color={DS.textPrimary} />
        </TouchableOpacity>

        <View style={s.topBarText}>
          <View style={s.topBarTitleRow}>
            {!!board?.cap && <CricketCap cap={board.cap} size={19} />}
            <Text style={s.topBarTitle} numberOfLines={1}>{board ? board.title : 'Leaderboard'}</Text>
          </View>
          {/* On a cap board the subtitle names the prize rather than repeating
              the category, which the row you tapped to get here already said. */}
          {board?.cap
            ? <Text style={[s.topBarSub, { color: CAP_COLORS[board.cap] }]} numberOfLines={1}>
                {CAP_LABELS[board.cap].toUpperCase()}
              </Text>
            : !!category && <Text style={s.topBarSub} numberOfLines={1}>{category}</Text>}
        </View>

        <TouchableOpacity onPress={shareBoard} style={s.iconBtn}
          accessibilityRole="button" accessibilityLabel="Share this leaderboard">
          <Icon name="share-variant" size={21} color={DS.textPrimary} />
        </TouchableOpacity>
        {!isTournament && (
          <TouchableOpacity onPress={openFilters} style={s.iconBtn}
            accessibilityRole="button" accessibilityLabel="Filters">
            <Icon name="tune-variant" size={22} color={active ? DS.lime : DS.textPrimary} />
            {active > 0 && <View style={s.filterDot}><Text style={s.filterDotText}>{active}</Text></View>}
          </TouchableOpacity>
        )}
      </View>

      {/* Applied Filters Strip — team boards only. */}
      {!isTournament && (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.filterStripOuter} contentContainerStyle={s.filterStrip}>
        <TouchableOpacity style={s.filterChip} onPress={openFilters}>
          <Text style={s.filterChipLabel}>Year: </Text>
          <Text style={s.filterChipVal}>{filters.year || 'All Time'}</Text>
          <Icon name="chevron-down" size={16} color={DS.textMuted} />
        </TouchableOpacity>
        
        <TouchableOpacity style={s.filterChip} onPress={openFilters}>
          <Text style={s.filterChipLabel}>Format: </Text>
          <Text style={s.filterChipVal}>{filters.matchType || 'Any'}</Text>
          <Icon name="chevron-down" size={16} color={DS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={s.filterChip} onPress={openFilters}>
          <Text style={s.filterChipLabel}>Opposition: </Text>
          <Text style={s.filterChipVal} numberOfLines={1}>{filters.oppositionId ? getOppName(filters.oppositionId) : 'All'}</Text>
          <Icon name="chevron-down" size={16} color={DS.textMuted} />
        </TouchableOpacity>

        {active > 0 && (
          <TouchableOpacity style={s.clearBtn} onPress={() => setFilters({})}>
            <Text style={s.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      )}

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={DS.primary} /></View>
      ) : data.length === 0 ? (
        <View style={s.center}>
          <Icon name="podium" size={48} color={DS.border} />
          <Text style={s.emptyText}>No data available for these filters.</Text>
        </View>
      ) : (
        // No tab-bar clearance here: the dock does not render on this screen, so
        // reserving its height just parks a blank band under the last row. Same
        // mistake as the drawer footers earlier — padding kept for a thing that
        // is no longer there.
        <ScrollView style={s.tableWrap} contentContainerStyle={{ paddingBottom: 24 }}>
          <ViewShot ref={shotRef} options={{ format: 'jpg', quality: 0.9 }}>
          {showPodium && (
            <View style={s.podium}>
              {podium.map((row, i) => {
                const place = i === 1 ? 1 : i === 0 ? 2 : 3;
                // The leader of a cap board stands in the cap's colour.
                const tint = place === 1 && board?.cap ? CAP_COLORS[board.cap] : RANK[place - 1];
                return (
                  <View key={row.playerId || place} style={[s.podCol, place === 1 && s.podColLead]}>
                    {place === 1 && !!board?.cap && <CricketCap cap={board.cap} size={20} />}
                    {row.avatar
                      ? <Image source={{ uri: row.avatar }} style={[s.podAvatar, place === 1 && s.podAvatarLead, { borderColor: tint }]} />
                      : <View style={[s.podAvatar, place === 1 && s.podAvatarLead, s.podAvatarFallback, { borderColor: tint }]}>
                          <Text style={s.podInitial}>{String(row.name || '?').charAt(0).toUpperCase()}</Text>
                        </View>}
                    {/* Two lines here too — the podium is the last place a name
                        should be cut down to an initial and an ellipsis. */}
                    <Text style={[s.podName, place === 1 && s.podNameLead]} numberOfLines={2}>{row.name}</Text>
                    <Text style={[s.podVal, { color: tint }]} numberOfLines={1}>{board?.value(row)}</Text>
                    {/* The bar says the same thing the number does. */}
                    <View style={[s.podBar, { backgroundColor: tint, height: place === 1 ? 34 : place === 2 ? 24 : 18 }]}>
                      <Text style={s.podPlace}>{place}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Table Header — only if there is a table. A board with exactly three
              players is entirely on the podium, and a header above nothing reads
              as a list that failed to load. */}
          {tableRows.length > 0 && (
          <View style={s.tableHead}>
            <Text style={[s.th, s.thRank]}>#</Text>
            <Text style={[s.th, s.thName]}>PLAYER</Text>
            {cols.map(([label]) => (
              <Text key={label} style={[s.th, s.thNum]}>{label}</Text>
            ))}
            <Text style={[s.th, s.thNum, s.thHighlight]}>{board?.head || board?.unit || 'VAL'}</Text>
          </View>
          )}

          {/* Table Rows — from 4th down when the podium has the top three, so the
              rank numbers have to be offset rather than taken from the index. */}
          {tableRows.map((row, i) => {
            const rank = showPodium ? i + 4 : i + 1;
            // The leader of a cap board wears its colour, not gold — the cap is
            // the award, and #1 here is not just a medal position.
            const medal = rank === 1 && board?.cap ? CAP_COLORS[board.cap]
              : rank <= 3 ? RANK[rank - 1] : null;
            const onMedal = rank === 1 && board?.cap ? '#fff' : '#1a1a1a';
            return (
              <View key={row.playerId || rank} style={s.tr}>
                <View style={[s.rankBadge, medal && { backgroundColor: medal }]}>
                  <Text style={[s.rankText, medal && { color: onMedal }]}>{rank}</Text>
                </View>
                
                <View style={s.playerInfo}>
                  {/* `avatar` is what the API sends. This read `avatarUrl`, so
                      every row fell through to an initial no matter who had a
                      photo on file. */}
                  {row.avatar ? (
                    <Image source={{ uri: row.avatar }} style={s.avatar} />
                  ) : (
                    <View style={s.avatarFallback}>
                      <Text style={s.avatarText}>{String(row.name || '?').charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={s.tdName} numberOfLines={2}>{row.name}</Text>
                  {rank === 1 && !!board?.cap && <CricketCap cap={board.cap} size={17} />}
                </View>
                
                {cols.map(([_, attr]) => (
                  <Text key={attr} style={[s.td, s.tdNum]}>{row[attr]}</Text>
                ))}
                <Text style={[s.td, s.tdNum, s.tdHighlight]}>{board?.value(row)}</Text>
              </View>
            );
          })}
          </ViewShot>
        </ScrollView>
      )}

      <StatsFilterSheet
        visible={!isTournament && picker === 'main'}
        onClose={() => setPicker(null)}
        onApply={(next) => { setFilters(next); setPicker(null); }}
        options={options}
        filters={filters}
      />
    </SafeAreaView>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: DS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { marginTop: 16, fontSize: 16, color: DS.textMuted, textAlign: 'center' },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingLeft: 4, paddingRight: 8, paddingVertical: 6,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topBarText: { flex: 1, paddingHorizontal: 4 },
  topBarTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topBarTitle: { fontSize: 17, fontWeight: '800', color: DS.textPrimary, letterSpacing: -0.2 },
  topBarSub: { fontSize: 11, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.8, marginTop: 1 },
  filterDot: {
    position: 'absolute', top: 4, right: 2,
    minWidth: 15, height: 15, borderRadius: 8, paddingHorizontal: 3,
    backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center',
  },
  filterDotText: { fontSize: 9.5, fontWeight: '900', color: DS.onLime },


  // flexGrow:0 or it fills the column. Without it this ScrollView and the
  // table below both flexed, so the screen split into two large voids with the
  // chips floating in the middle of one of them.
  filterStripOuter: { flexGrow: 0, flexShrink: 0 },
  filterStrip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: DS.border },
  filterChipLabel: { fontSize: 12, color: DS.textMuted },
  filterChipVal: { fontSize: 13, fontWeight: '700', color: DS.textPrimary, marginRight: 4, maxWidth: 100 },
  clearBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  clearText: { color: DS.coral, fontWeight: '700', fontSize: 13 },

  // The table takes every pixel below the strip — this is a full-screen table
  // and the point of putting it on its own screen was the room.
  tableWrap: { flex: 1, backgroundColor: DS.surface },

  // ── Podium ──
  // 2 · 1 · 3, bottom-aligned so the bars form the steps. ~150dp all in, which
  // is less than the three table rows it stands in for.
  podium: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center',
    gap: 6, paddingHorizontal: 12, paddingTop: 14, paddingBottom: 0,
    backgroundColor: DS.surface,
    borderBottomWidth: 1, borderBottomColor: DS.faint,
  },
  podCol: { flex: 1, alignItems: 'center', gap: 3 },
  podColLead: { flex: 1.15 },
  podAvatar: { width: 42, height: 42, borderRadius: 21, borderWidth: 2 },
  podAvatarLead: { width: 54, height: 54, borderRadius: 27, borderWidth: 2.5 },
  podAvatarFallback: { backgroundColor: '#0a5227', alignItems: 'center', justifyContent: 'center' },
  podInitial: { fontSize: 16, fontWeight: '800', color: '#fff' },
  podName: { fontSize: 11, fontWeight: '700', color: DS.textPrimary, textAlign: 'center', lineHeight: 14 },
  podNameLead: { fontSize: 12.5, fontWeight: '800' },
  podVal: { fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  podBar: {
    alignSelf: 'stretch', marginTop: 2,
    borderTopLeftRadius: 6, borderTopRightRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  podPlace: { fontSize: 12, fontWeight: '900', color: '#1a1a1a' },
  tableHead: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: DS.border, backgroundColor: DS.surfaceHigh },
  th: { fontSize: 11, fontWeight: '800', color: DS.textMuted, textTransform: 'uppercase' },
  thRank: { width: 32 },
  thName: { flex: 1 },
  thNum: { width: 38, textAlign: 'right' },
  thHighlight: { color: DS.primary, width: 50 },

  tr: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 16, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: DS.faint },
  rankBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: DS.surfaceHigh, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  rankText: { fontSize: 11, fontWeight: '800', color: DS.textMuted },
  playerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  avatarFallback: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#0a5227', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  tdName: { flex: 1, fontSize: 13.5, lineHeight: 17, fontWeight: '700', color: DS.textPrimary },
  td: { fontSize: 13, color: DS.textPrimary },
  tdNum: { width: 38, textAlign: 'right', color: DS.textMuted, fontSize: 12.5 },
  tdHighlight: { fontWeight: '800', width: 50, textAlign: 'right', color: DS.primary, fontSize: 14 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: DS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: '80%' },
  grab: { width: 40, height: 4, backgroundColor: DS.border, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  applyBtn: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 8, backgroundColor: DS.lime },
  applyText: { fontSize: 13, fontWeight: '900', color: DS.onLime, letterSpacing: 0.8 },
  filterRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    minHeight: 56, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: DS.faint,
  },
  filterRowLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: DS.textPrimary },
  filterRowValue: { fontSize: 14, fontWeight: '700', color: DS.textVariant, maxWidth: 140 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: DS.textPrimary, paddingHorizontal: 20, marginBottom: 16 },
  sheetScroll: { paddingHorizontal: 20 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: DS.border },
  optionText: { fontSize: 16, color: DS.textPrimary },
  optionTextOn: { color: DS.primary, fontWeight: '800' },
});
