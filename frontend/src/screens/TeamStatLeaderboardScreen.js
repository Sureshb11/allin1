import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, Pressable, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, useThemedStyles } from '../hooks/useTheme';
import Header from '../components/Header';
import { legendsApi } from '../api/legends';
import { BOARDS } from '../components/TeamStats';

const RANK = ['#d4af37', '#9ca3af', '#b87333']; // gold, silver, bronze

export default function TeamStatLeaderboardScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { teamId, boardKey, category } = route.params;

  const DS = useTheme().colors;
  const s = useThemedStyles(makeStyles);

  const board = BOARDS.find(b => b.key === boardKey);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [options, setOptions] = useState({ years: [], matchTypes: [], oppositions: [] });
  const [filters, setFilters] = useState({});
  const [picker, setPicker] = useState(null); // 'matchType', 'year', 'opposition'

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

  const setFilter = (k, v) => {
    setFilters(prev => ({ ...prev, [k]: v }));
  };

  const getOppName = (id) => {
    return options.oppositions?.find(o => o.id === id)?.name || id;
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <Header title={board ? board.title : 'Leaderboard'} 
              subtitle={category}
              right={<TouchableOpacity onPress={() => setPicker('main')} style={s.filterBtn}><Icon name="filter-variant" size={24} color={DS.textPrimary} /></TouchableOpacity>} 
      />

      {/* Applied Filters Strip */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterStrip}>
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

        {Object.keys(filters).length > 0 && (
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
        <ScrollView style={s.tableWrap} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Table Header */}
          <View style={s.tableHead}>
            <Text style={[s.th, s.thRank]}>#</Text>
            <Text style={[s.th, s.thName]}>PLAYER</Text>
            {board?.cols.map(([label]) => (
              <Text key={label} style={[s.th, s.thNum]}>{label}</Text>
            ))}
            <Text style={[s.th, s.thNum, s.thHighlight]}>{board?.unit || 'VAL'}</Text>
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
                  {row.avatarUrl ? (
                    <Image source={{ uri: row.avatarUrl }} style={s.avatar} />
                  ) : (
                    <View style={s.avatarFallback}>
                      <Text style={s.avatarText}>{String(row.name || '?').charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={s.tdName} numberOfLines={1}>{row.name}</Text>
                </View>
                
                {board?.cols.map(([_, attr]) => (
                  <Text key={attr} style={[s.td, s.tdNum]}>{row[attr]}</Text>
                ))}
                <Text style={[s.td, s.tdNum, s.tdHighlight]}>{board?.value(row)}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Filter Modal */}
      {picker && (
        <Modal transparent animationType="slide" visible={true} onRequestClose={() => setPicker(null)}>
          <Pressable style={s.backdrop} onPress={() => setPicker(null)} />
          <View style={s.sheet}>
            <View style={s.grab} />
            <Text style={s.sheetTitle}>
              {picker === 'year' ? 'Select Year' : picker === 'matchType' ? 'Select Format' : picker === 'opposition' ? 'Select Opposition' : 'Filters'}
            </Text>
            
            <ScrollView style={s.sheetScroll}>
              {picker === 'year' && [null, ...options.years].map(y => (
                <TouchableOpacity key={String(y)} style={s.option} onPress={() => { setFilter('year', y); setPicker(null); }}>
                  <Text style={[s.optionText, filters.year === y && s.optionTextOn]}>{y || 'All Time'}</Text>
                  {filters.year === y && <Icon name="check" size={20} color={DS.primary} />}
                </TouchableOpacity>
              ))}

              {picker === 'matchType' && [null, ...options.matchTypes].map(m => (
                <TouchableOpacity key={String(m)} style={s.option} onPress={() => { setFilter('matchType', m); setPicker(null); }}>
                  <Text style={[s.optionText, filters.matchType === m && s.optionTextOn]}>{m || 'Any Format'}</Text>
                  {filters.matchType === m && <Icon name="check" size={20} color={DS.primary} />}
                </TouchableOpacity>
              ))}

              {picker === 'opposition' && [null, ...options.oppositions].map(opp => {
                const isSelected = opp === null ? (filters.oppositionId == null) : filters.oppositionId === opp.id;
                return (
                  <TouchableOpacity key={String(opp ? opp.id : 'all')} style={s.option} onPress={() => { setFilter('oppositionId', opp ? opp.id : null); setPicker(null); }}>
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
  filterBtn: { padding: 8, marginRight: 8 },
  
  filterStrip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: DS.border },
  filterChipLabel: { fontSize: 12, color: DS.textMuted },
  filterChipVal: { fontSize: 13, fontWeight: '700', color: DS.textPrimary, marginRight: 4, maxWidth: 100 },
  clearBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  clearText: { color: DS.coral, fontWeight: '700', fontSize: 13 },

  tableWrap: { flex: 1, backgroundColor: DS.surface, marginTop: 8 },
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
  sheetTitle: { fontSize: 18, fontWeight: '800', color: DS.textPrimary, paddingHorizontal: 20, marginBottom: 16 },
  sheetScroll: { paddingHorizontal: 20 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: DS.border },
  optionText: { fontSize: 16, color: DS.textPrimary },
  optionTextOn: { color: DS.primary, fontWeight: '800' },
});
