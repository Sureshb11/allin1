import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, Pressable, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ViewShot from 'react-native-view-shot';
import Share from 'react-native-share';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import legendsApi from '../services/LegendsApi';
import { BOARDS } from '../components/TeamStats';

const RANK = ['#d4af37', '#9ca3af', '#b87333']; // gold, silver, bronze

export default function TeamStatLeaderboardScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { teamId, boardKey, category } = route.params;

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
  // Staged, because the sheet has an APPLY. Changing four dropdowns should be
  // one refetch, not four — and it lets you back out of a half-made change.
  const [draft, setDraft] = useState({});
  const openFilters = () => { setDraft(filters); setPicker('main'); };
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
  const applyFilters = () => { setFilters(draft); setPicker(null); };
  const draftLabel = (k, fallback) => {
    if (k === 'oppositionId') return draft.oppositionId ? getOppName(draft.oppositionId) : 'All';
    return draft[k] || fallback;
  };

  // Fetch filter options
  useEffect(() => {
    legendsApi.getTeamStatsOptions(teamId).then((r) => {
      if (r.success) setOptions(r.data);
    });
  }, [teamId]);

  // Fetch stats whenever filters change
  useEffect(() => {
    setLoading(true);
    legendsApi.getTeamStats(teamId, filters).then((r) => {
      if (r.success) {
        setData(r.data.leaderboards[boardKey] || []);
      }
      setLoading(false);
    });
  }, [teamId, filters, boardKey]);

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
          <Text style={s.topBarTitle} numberOfLines={1}>{board ? board.title : 'Leaderboard'}</Text>
          {!!category && <Text style={s.topBarSub} numberOfLines={1}>{category}</Text>}
        </View>

        <TouchableOpacity onPress={shareBoard} style={s.iconBtn}
          accessibilityRole="button" accessibilityLabel="Share this leaderboard">
          <Icon name="share-variant" size={21} color={DS.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={openFilters} style={s.iconBtn}
          accessibilityRole="button" accessibilityLabel="Filters">
          <Icon name="tune-variant" size={22} color={active ? DS.lime : DS.textPrimary} />
          {active > 0 && <View style={s.filterDot}><Text style={s.filterDotText}>{active}</Text></View>}
        </TouchableOpacity>
      </View>

      {/* Applied Filters Strip */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.filterStripOuter} contentContainerStyle={s.filterStrip}>
        <TouchableOpacity style={s.filterChip} onPress={() => setPicker('year')}>
          <Text style={s.filterChipLabel}>Year: </Text>
          <Text style={s.filterChipVal}>{filters.year || 'All Time'}</Text>
          <Icon name="chevron-down" size={16} color={DS.textMuted} />
        </TouchableOpacity>
        
        <TouchableOpacity style={s.filterChip} onPress={() => setPicker('matchType')}>
          <Text style={s.filterChipLabel}>Format: </Text>
          <Text style={s.filterChipVal}>{filters.matchType || 'Any'}</Text>
          <Icon name="chevron-down" size={16} color={DS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={s.filterChip} onPress={() => setPicker('opposition')}>
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
          {/* Table Header */}
          <View style={s.tableHead}>
            <Text style={[s.th, s.thRank]}>#</Text>
            <Text style={[s.th, s.thName]}>PLAYER</Text>
            {cols.map(([label]) => (
              <Text key={label} style={[s.th, s.thNum]}>{label}</Text>
            ))}
            <Text style={[s.th, s.thNum, s.thHighlight]}>{board?.head || board?.unit || 'VAL'}</Text>
          </View>

          {/* Table Rows */}
          {data.map((row, index) => {
            const medal = index < 3 ? RANK[index] : null;
            return (
              <View key={row.playerId || index} style={s.tr}>
                <View style={[s.rankBadge, medal && { backgroundColor: medal }]}>
                  <Text style={[s.rankText, medal && { color: '#1a1a1a' }]}>{index + 1}</Text>
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
                  <Text style={s.tdName} numberOfLines={1}>{row.name}</Text>
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

      {/* Filter Modal */}
      {picker && (
        <Modal transparent animationType="slide" visible={true} onRequestClose={() => setPicker(null)}>
          <Pressable style={s.backdrop} onPress={() => setPicker(null)} />
          <View style={s.sheet}>
            <View style={s.grab} />
            {picker === 'main' ? (
              <View style={s.sheetHead}>
                <Text style={s.sheetTitle}>FILTERS</Text>
                <TouchableOpacity style={s.applyBtn} onPress={applyFilters} accessibilityRole="button">
                  <Text style={s.applyText}>APPLY</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={s.sheetTitle}>
                {picker === 'year' ? 'Select Year'
                  : picker === 'matchType' ? 'Select Format'
                  : picker === 'venue' ? 'Select Ground' : 'Select Opposition'}
              </Text>
            )}

            <ScrollView style={s.sheetScroll}>
              {/* The whole set in one place, staged until APPLY. The button in
                  the header opened this sheet and nothing rendered inside it —
                  a filter control that showed an empty tray. */}
              {picker === 'main' && [
                ['matchType', 'Match Type', 'Any', 'matchType'],
                ['year', 'Year', 'All Time', 'year'],
                ['venue', 'Ground', 'All grounds', 'venue'],
                ['oppositionId', 'Opposition', 'All', 'opposition'],
              ].map(([key, label, fallback, sub]) => (
                <TouchableOpacity key={key} style={s.filterRow} onPress={() => setPicker(sub)}>
                  <Text style={s.filterRowLabel}>{label}</Text>
                  <Text style={s.filterRowValue} numberOfLines={1}>{draftLabel(key, fallback)}</Text>
                  <Icon name="chevron-down" size={18} color={DS.textMuted} />
                </TouchableOpacity>
              ))}

              {picker === 'year' && [null, ...options.years].map(y => (
                <TouchableOpacity key={String(y)} style={s.option} onPress={() => { setDraft((d) => ({ ...d, year: y })); setPicker('main'); }}>
                  <Text style={[s.optionText, draft.year === y && s.optionTextOn]}>{y || 'All Time'}</Text>
                  {draft.year === y && <Icon name="check" size={20} color={DS.primary} />}
                </TouchableOpacity>
              ))}

              {picker === 'matchType' && [null, ...options.matchTypes].map(m => (
                <TouchableOpacity key={String(m)} style={s.option} onPress={() => { setDraft((d) => ({ ...d, matchType: m })); setPicker('main'); }}>
                  <Text style={[s.optionText, draft.matchType === m && s.optionTextOn]}>{m || 'Any Format'}</Text>
                  {draft.matchType === m && <Icon name="check" size={20} color={DS.primary} />}
                </TouchableOpacity>
              ))}

              {picker === 'venue' && [null, ...(options.venues || [])].map(v => (
                <TouchableOpacity key={String(v)} style={s.option}
                  onPress={() => { setDraft((d) => ({ ...d, venue: v })); setPicker('main'); }}>
                  <Text style={[s.optionText, draft.venue === v && s.optionTextOn]}>{v || 'All grounds'}</Text>
                  {draft.venue === v && <Icon name="check" size={20} color={DS.primary} />}
                </TouchableOpacity>
              ))}

              {picker === 'opposition' && [null, ...options.oppositions].map(opp => {
                const isSelected = opp === null ? (draft.oppositionId == null) : draft.oppositionId === opp.id;
                return (
                  <TouchableOpacity key={String(opp ? opp.id : 'all')} style={s.option} onPress={() => { setDraft((d) => ({ ...d, oppositionId: opp ? opp.id : null })); setPicker('main'); }}>
                    <Text style={[s.optionText, isSelected && s.optionTextOn]}>{opp ? opp.name : 'All Teams'}</Text>
                    {isSelected && <Icon name="check" size={20} color={DS.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Modal>
      )}
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
  tableHead: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: DS.border, backgroundColor: DS.surfaceHigh },
  th: { fontSize: 11, fontWeight: '800', color: DS.textMuted, textTransform: 'uppercase' },
  thRank: { width: 32 },
  thName: { flex: 1 },
  thNum: { width: 44, textAlign: 'right' },
  thHighlight: { color: DS.primary, width: 56 },

  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: DS.faint },
  rankBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: DS.surfaceHigh, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  rankText: { fontSize: 11, fontWeight: '800', color: DS.textMuted },
  playerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarFallback: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#0a5227', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  tdName: { flex: 1, fontSize: 14, fontWeight: '700', color: DS.textPrimary },
  td: { fontSize: 13, color: DS.textPrimary },
  tdNum: { width: 44, textAlign: 'right', color: DS.textMuted },
  tdHighlight: { fontWeight: '800', width: 56, textAlign: 'right', color: DS.primary, fontSize: 14 },

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
