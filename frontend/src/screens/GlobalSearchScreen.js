import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, SectionList, TouchableOpacity,
  ScrollView, Alert, StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';

const DS = {
  bg: '#0f131f', surfaceLow: '#171b28', surfaceHigh: '#262a37', surfaceHighest: '#313442',
  lime: '#abd600', blue: '#b7c4ff', coral: '#ffb59e', danger: '#ff5a5a',
  textPrimary: '#dfe2f3', textVariant: '#c3c5d9', textMuted: '#8d90a2',
  line: 'rgba(150,170,210,0.10)',
};

// "Go to" shortcuts shown before the user types anything (per the reference).
const GO_TO = [
  { id: 'stream', label: 'Live streaming matches', icon: 'video-outline',           badge: 'NEW', screen: 'StreamingLanding' },
  { id: 'near',   label: 'Matches near me',         icon: 'map-marker-radius-outline',             screen: 'MyMatches' },
  { id: 'tourn',  label: 'Tournaments near me',     icon: 'trophy-outline',                        screen: 'Tournaments' },
  { id: 'find',   label: 'Find cricketers',         icon: 'account-search-outline',                screen: 'FindCricketers' },
];

// "Looking for" shortcuts — the Explore (LookingFor) page categories plus extra
// discovery shortcuts. Each deep-links to the relevant screen/category.
const LOOKING_FOR = [
  { id: 'player',    label: 'Player',               icon: 'account-outline',               screen: 'LookingFor',   params: { initialType: 'player' } },
  { id: 'team',      label: 'Team',                 icon: 'account-group',                 screen: 'LookingFor',   params: { initialType: 'team' } },
  { id: 'umpire',    label: 'Umpire',               icon: 'whistle',                       screen: 'LookingFor',   params: { initialType: 'umpire' } },
  { id: 'scorer',    label: 'Scorer',               icon: 'scoreboard-outline',            screen: 'LookingFor',   params: { initialType: 'scorer' } },
  { id: 'coach',     label: 'Coach',                icon: 'school-outline',                screen: 'LookingFor',   params: { initialType: 'coach' } },
  { id: 'opponent',  label: 'Opponent',             icon: 'sword-cross',                   screen: 'LookingFor',   params: { initialType: 'opponent' } },
  { id: 'teamtourn', label: 'Teams for tournament', icon: 'account-multiple-plus-outline', screen: 'LookingFor',   params: { initialType: 'teamtourn' } },
  { id: 'tourn2',    label: 'Tournaments',          icon: 'trophy-outline',                screen: 'Tournaments' },
  { id: 'ground',    label: 'Ground',               icon: 'stadium',                       screen: 'GroundBooking' },
  { id: 'comm',      label: 'Commentator',          icon: 'account-voice',                 screen: 'LookingFor',   params: { initialType: 'commentator' } },
];

// Bottom action pills.
const PILLS = [
  { label: 'Start a match',          screen: 'StartMatch' },
  { label: 'Add a tournament/series', screen: 'Tournaments' },
  { label: 'Go live',                screen: 'CreateStream' },
];

const TYPE_ICONS = { player: 'account', team: 'cricket', match: 'scoreboard-outline' };

const GlobalSearchScreen = ({ navigation }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (searchQuery.trim().length > 2) {
      const t = setTimeout(performSearch, 500);
      return () => clearTimeout(t);
    }
    setShowResults(false);
  }, [searchQuery]);

  const performSearch = async () => {
    if (searchQuery.trim().length === 0) return;
    setLoading(true);
    try {
      const response = await legendsApi.globalSearch(searchQuery);
      if (response.success) {
        setSearchResults(response.data);
        setShowResults(true);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to perform search');
    } finally {
      setLoading(false);
    }
  };

  const go = (screen, params) => screen && navigation.navigate(screen, params);

  const renderRow = (it) => (
    <TouchableOpacity key={it.id} style={st.row} activeOpacity={0.7} onPress={() => go(it.screen, it.params)}>
      <View style={st.rowIconWrap}>
        <Icon name={it.icon} size={22} color={DS.textPrimary} />
      </View>
      <Text style={st.rowLabel}>{it.label}</Text>
      {it.badge && (
        <View style={st.badge}><Text style={st.badgeTxt}>{it.badge}</Text></View>
      )}
      <Icon name="chevron-right" size={22} color={DS.textMuted} />
    </TouchableOpacity>
  );

  const onResultPress = (item) => {
    const map = { player: ['PlayerProfile', { playerId: item.id }], team: ['TeamDetail', { teamId: item.id }], match: ['MatchDetail', { matchId: item.id }] };
    const dest = map[item.type];
    if (dest) navigation.navigate(...dest);
  };

  // ── search results (when typing) ──
  const sections = (() => {
    const s = [];
    if (searchResults.players?.length) s.push({ title: 'Players', data: searchResults.players });
    if (searchResults.teams?.length)   s.push({ title: 'Teams',   data: searchResults.teams });
    if (searchResults.matches?.length) s.push({ title: 'Matches', data: searchResults.matches });
    return s;
  })();

  const renderResult = ({ item }) => (
    <TouchableOpacity style={st.resultItem} onPress={() => onResultPress(item)}>
      <View style={st.resultIconWrap}>
        <Icon name={TYPE_ICONS[item.type] || 'file-outline'} size={18} color={DS.lime} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.resultTitle}>{item.name || item.title}</Text>
        <Text style={st.resultSub}>{item.team || item.location || item.date}</Text>
      </View>
      <Icon name="chevron-right" size={20} color={DS.textMuted} />
    </TouchableOpacity>
  );

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />

      {/* ── search bar ── */}
      <View style={st.header}>
        <TouchableOpacity hitSlop={8} onPress={() => navigation.goBack()} style={st.backBtn}>
          <Icon name="arrow-left" size={24} color={DS.textPrimary} />
        </TouchableOpacity>
        <View style={st.searchBox}>
          <TextInput
            style={st.searchInput}
            placeholder="Search players, teams, umpires…"
            placeholderTextColor={DS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity hitSlop={8} onPress={() => setSearchQuery('')}>
              <Icon name="close-circle" size={18} color={DS.textMuted} />
            </TouchableOpacity>
          ) : (
            <View style={st.searchIcons}>
              <TouchableOpacity hitSlop={6} onPress={() => Alert.alert('Scan', 'QR scanner coming soon')}>
                <Icon name="qrcode-scan" size={20} color={DS.textVariant} />
              </TouchableOpacity>
              <TouchableOpacity hitSlop={6} onPress={() => Alert.alert('Voice', 'Voice search coming soon')}>
                <Icon name="microphone" size={20} color={DS.textVariant} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* ── body ── */}
      {showResults ? (
        <SectionList
          sections={sections}
          keyExtractor={(item, i) => (item.id ?? i).toString()}
          renderItem={renderResult}
          renderSectionHeader={({ section }) => (
            <Text style={st.sectionHead}>{section.title.toUpperCase()}</Text>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
          ListEmptyComponent={
            <View style={st.empty}>
              <Icon name="magnify" size={56} color={DS.surfaceHighest} />
              <Text style={st.emptyTitle}>No results found</Text>
              <Text style={st.emptySub}>Try a different keyword</Text>
            </View>
          }
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>
          <Text style={st.goToLabel}>Go to</Text>
          <View>{GO_TO.map(renderRow)}</View>

          <Text style={st.sectionLabel}>Looking for</Text>
          <View>{LOOKING_FOR.map(renderRow)}</View>
        </ScrollView>
      )}

      {/* ── bottom action pills ── */}
      <View style={st.pills}>
        {PILLS.map((p) => (
          <TouchableOpacity key={p.label} style={st.pill} activeOpacity={0.8} onPress={() => go(p.screen)}>
            <Text style={st.pillTxt} numberOfLines={1}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingTop: 52, paddingBottom: 12, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: DS.line,
  },
  backBtn: { padding: 4 },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: DS.surfaceHigh, borderRadius: 12, paddingHorizontal: 14, gap: 10,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: DS.textPrimary },
  searchIcons: { flexDirection: 'row', alignItems: 'center', gap: 16 },

  goToLabel: { color: DS.textPrimary, fontSize: 22, fontWeight: '800', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 6 },
  sectionLabel: { color: DS.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', paddingHorizontal: 18, paddingTop: 22, paddingBottom: 6 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 16, paddingHorizontal: 18, gap: 14,
    borderBottomWidth: 1, borderBottomColor: DS.line,
  },
  rowIconWrap: { width: 30, alignItems: 'center' },
  rowLabel: { flex: 1, color: DS.textPrimary, fontSize: 16, fontWeight: '500' },
  badge: { backgroundColor: DS.danger, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  sectionHead: { backgroundColor: DS.bg, color: DS.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: 18, paddingVertical: 8 },
  resultItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: DS.line },
  resultIconWrap: { width: 38, height: 38, borderRadius: 11, backgroundColor: DS.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  resultTitle: { color: DS.textPrimary, fontSize: 15, fontWeight: '700' },
  resultSub: { color: DS.textMuted, fontSize: 12, marginTop: 1 },

  empty: { alignItems: 'center', paddingTop: 70, gap: 6 },
  emptyTitle: { color: DS.textVariant, fontSize: 16, fontWeight: '700' },
  emptySub: { color: DS.textMuted, fontSize: 13 },

  pills: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 10,
    paddingHorizontal: 12, paddingTop: 12, paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: DS.line,
  },
  pill: { borderWidth: 1.5, borderColor: DS.lime, borderRadius: 24, paddingVertical: 9, paddingHorizontal: 16 },
  pillTxt: { color: DS.lime, fontSize: 13, fontWeight: '700' },
});

export default GlobalSearchScreen;
