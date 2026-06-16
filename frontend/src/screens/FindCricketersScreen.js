// FindCricketersScreen — browse players across sports with search + role filter.
// Sport tabs (Cricket / Football / Badminton) drive a sport-scoped query to
// legendsApi.getPlayers({ sport }); role chips + title adapt per sport.
// Opened from the search screen's "Find cricketers" shortcut (defaults to cricket).

import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity,
  StatusBar, ScrollView, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { getFind, FIND_CONFIG } from '../sports/find';

const DS = {
  bg: '#0f131f', surfaceLow: '#171b28', surfaceHigh: '#262a37', surfaceHighest: '#313442',
  lime: '#abd600', blue: '#b7c4ff', coral: '#ffb59e', amber: '#ffb24a',
  textPrimary: '#dfe2f3', textVariant: '#c3c5d9', textMuted: '#8d90a2',
  line: 'rgba(150,170,210,0.10)',
};

// Sport tabs shown at the top.
const SPORTS = [
  { id: 'cricket',   label: 'Cricket' },
  { id: 'football',  label: 'Football' },
  { id: 'badminton', label: 'Badminton' },
];

// Per-sport title + role buckets (used for the filter chips).

// role → { short label, accent colour }
const ROLE_META = {
  // cricket
  'Batter':       { short: 'BAT',  color: '#abd600' },
  'Bowler':       { short: 'BOWL', color: '#b7c4ff' },
  'All-rounder':  { short: 'ALL',  color: '#ffb24a' },
  'Wicketkeeper': { short: 'WK',   color: '#ffb59e' },
  // football
  'Striker':      { short: 'ST',   color: '#abd600' },
  'Midfielder':   { short: 'MID',  color: '#b7c4ff' },
  'Defender':     { short: 'DEF',  color: '#ffb24a' },
  'Goalkeeper':   { short: 'GK',   color: '#ffb59e' },
  // badminton
  'Singles':      { short: 'SGL',  color: '#abd600' },
  'Doubles':      { short: 'DBL',  color: '#b7c4ff' },
};

const PALETTE = ['#2d7a3a', '#b45309', '#7c3aed', '#b91c1c', '#0d7c8f', '#1a5fa8', '#c2490d', '#0f766e', '#9333ea', '#be185d', '#4d7c0f', '#a16207'];

// Map a backend role string to one of the sport's filter buckets.
const roleBucket = (role = '', sport) => {
  const r = role.toLowerCase();
  if (sport === 'cricket') {
    if (r.includes('keep') || r.includes('wicket')) return 'Wicketkeeper';
    if (r.includes('all')) return 'All-rounder';
    if (r.includes('bowl')) return 'Bowler';
    return 'Batter';
  }
  const match = (FIND_CONFIG[sport]?.roles || []).find((x) => x.toLowerCase() === r);
  return match || role || 'Player';
};

// Map a backend Player → the shape this screen renders.
const mapPlayer = (p, i, sport) => {
  if (!p?.name) return null;
  const s = p.stats || {};
  return {
    id: p.id || String(i),
    name: p.name,
    role: roleBucket(p.role, sport),
    team: p.team?.name || 'Free agent',
    city: p.team?.city || '—',
    style: s.style || p.role || '',
    matches: s.matches || 0,
    color: PALETTE[i % PALETTE.length],
    verified: (s.matches || 0) > 120,
  };
};

function Avatar({ name, color }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <View style={[s.avatar, { backgroundColor: color }]}>
      <Text style={s.avatarTxt}>{initials}</Text>
    </View>
  );
}

export default function FindCricketersScreen({ navigation, route }) {
  const [sport, setSport] = useState(route?.params?.sport || 'cricket');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  const cfg = getFind(sport);
  const FILTERS = ['All', ...cfg.roles];

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFilter('All');
    legendsApi.getPlayers({ sport }).then((res) => {
      if (!alive) return;
      const list = (res?.data || []).map((p, i) => mapPlayer(p, i, sport)).filter(Boolean);
      setPlayers(list);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [sport]);

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((c) => {
      const roleOk = filter === 'All' || c.role === filter;
      const textOk = !q ||
        c.name.toLowerCase().includes(q) ||
        c.team.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q);
      return roleOk && textOk;
    });
  }, [players, query, filter]);

  const renderItem = ({ item }) => {
    const rm = ROLE_META[item.role] || { short: '', color: DS.textMuted };
    return (
      <TouchableOpacity
        style={s.row}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('PlayerInsights', { playerId: item.id, player: item })}>
        <Avatar name={item.name} color={item.color} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={s.nameRow}>
            <Text style={s.name} numberOfLines={1}>{item.name}</Text>
            {item.verified && <Icon name="check-decagram" size={14} color={DS.lime} style={{ marginLeft: 4 }} />}
          </View>
          <Text style={s.meta} numberOfLines={1}>{item.team} · {item.city}</Text>
          <Text style={s.style} numberOfLines={1}>{item.style}</Text>
        </View>
        <View style={s.right}>
          <View style={[s.roleChip, { backgroundColor: rm.color + '22', borderColor: rm.color + '55' }]}>
            <Text style={[s.roleTxt, { color: rm.color }]}>{rm.short || item.role}</Text>
          </View>
          <Text style={s.matches}>{item.matches} <Text style={s.matchesUnit}>mts</Text></Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />

      {/* header */}
      <View style={s.header}>
        <TouchableOpacity hitSlop={8} onPress={() => navigation.goBack()} style={s.backBtn}>
          <Icon name="arrow-left" size={24} color={DS.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>{cfg.title}</Text>
      </View>

      {/* sport tabs */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sportTabs}>
          {SPORTS.map((sp) => {
            const active = sp.id === sport;
            return (
              <TouchableOpacity key={sp.id} onPress={() => setSport(sp.id)} activeOpacity={0.85}
                style={[s.sportTab, active && s.sportTabActive]}>
                <Text style={[s.sportTabTxt, active && s.sportTabTxtActive]}>{sp.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* search */}
      <View style={s.searchWrap}>
        <View style={s.searchBox}>
          <Icon name="magnify" size={20} color={DS.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search by name, team or city…"
            placeholderTextColor={DS.textMuted}
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 && (
            <TouchableOpacity hitSlop={8} onPress={() => setQuery('')}>
              <Icon name="close-circle" size={18} color={DS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* role filter chips */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {FILTERS.map((f) => {
            const active = f === filter;
            return (
              <TouchableOpacity key={f} onPress={() => setFilter(f)} activeOpacity={0.8}
                style={[s.chip, active && s.chipActive]}>
                <Text style={[s.chipTxt, active && s.chipTxtActive]}>{f}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* count */}
      <Text style={s.count}>{data.length} {sport === 'cricket' ? 'cricketer' : 'player'}{data.length === 1 ? '' : 's'}</Text>

      {/* list */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={DS.lime} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Icon name="account-search-outline" size={56} color={DS.surfaceHighest} />
              <Text style={s.emptyTitle}>No players found</Text>
              <Text style={s.emptySub}>Try a different name or filter</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },

  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 52, paddingBottom: 8, paddingHorizontal: 14 },
  backBtn: { padding: 4 },
  title: { color: DS.textPrimary, fontSize: 20, fontWeight: '800' },

  sportTabs: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4, gap: 8 },
  sportTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 22, backgroundColor: DS.surfaceLow, borderWidth: 1, borderColor: DS.line },
  sportTabActive: { backgroundColor: DS.surfaceHighest, borderColor: DS.lime },
  sportTabTxt: { color: DS.textMuted, fontSize: 14, fontWeight: '800' },
  sportTabTxtActive: { color: DS.lime },

  searchWrap: { paddingHorizontal: 16, paddingTop: 8 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: DS.surfaceHigh, borderRadius: 12, paddingHorizontal: 14,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, color: DS.textPrimary },

  chips: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.line },
  chipActive: { backgroundColor: DS.lime, borderColor: DS.lime },
  chipTxt: { color: DS.textVariant, fontSize: 13, fontWeight: '700' },
  chipTxtActive: { color: DS.bg },

  count: { color: DS.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 4 },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: DS.line },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { color: DS.textPrimary, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  meta: { color: DS.textVariant, fontSize: 12.5, marginTop: 2 },
  style: { color: DS.textMuted, fontSize: 11.5, marginTop: 1 },
  right: { alignItems: 'flex-end', gap: 6 },
  roleChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, borderWidth: 1 },
  roleTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  matches: { color: DS.textPrimary, fontSize: 13, fontWeight: '800' },
  matchesUnit: { color: DS.textMuted, fontSize: 10, fontWeight: '600' },

  empty: { alignItems: 'center', paddingTop: 70, gap: 6 },
  emptyTitle: { color: DS.textVariant, fontSize: 16, fontWeight: '700' },
  emptySub: { color: DS.textMuted, fontSize: 13 },
});
