// FindCricketersScreen — browse all cricketers with a search + role filter.
// Opened from the search screen's "Find cricketers" shortcut.
// Data is mock for now; wire to legendsApi.getPlayers() when the API is ready.

import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity,
  StatusBar, ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';

// Normalise the backend role string to one of our filter buckets.
const roleFromDb = (role = '') => {
  const r = role.toLowerCase();
  if (r.includes('keep') || r.includes('wicket')) return 'Wicketkeeper';
  if (r.includes('all')) return 'All-rounder';
  if (r.includes('bowl')) return 'Bowler';
  return 'Batter';
};

const PALETTE = ['#2d7a3a', '#b45309', '#7c3aed', '#b91c1c', '#0d7c8f', '#1a5fa8', '#c2490d', '#0f766e', '#9333ea', '#be185d', '#4d7c0f', '#a16207'];

// Map a backend Player → the shape this screen renders.
const mapPlayer = (p, i) => {
  if (!p?.name) return null;
  const s = p.stats || {};
  return {
    id: p.id || String(i),
    name: p.name,
    role: roleFromDb(p.role),
    team: p.team?.name || 'Free agent',
    city: p.team?.city || '—',
    style: s.style || p.role || '',
    matches: s.matches || 0,
    color: PALETTE[i % PALETTE.length],
    verified: (s.matches || 0) > 150,
  };
};

const DS = {
  bg: '#0f131f', surfaceLow: '#171b28', surfaceHigh: '#262a37', surfaceHighest: '#313442',
  lime: '#abd600', blue: '#b7c4ff', coral: '#ffb59e', amber: '#ffb24a',
  textPrimary: '#dfe2f3', textVariant: '#c3c5d9', textMuted: '#8d90a2',
  line: 'rgba(150,170,210,0.10)',
};

// role → { short label, accent colour }
const ROLE_META = {
  'Batter':       { short: 'BAT', color: '#abd600' },
  'Bowler':       { short: 'BOWL', color: '#b7c4ff' },
  'All-rounder':  { short: 'ALL', color: '#ffb24a' },
  'Wicketkeeper': { short: 'WK', color: '#ffb59e' },
};

const FILTERS = ['All', 'Batter', 'Bowler', 'All-rounder', 'Wicketkeeper'];

const CRICKETERS = [
  { id: 'c1',  name: 'Rohan Mehta',     role: 'Batter',       team: 'Sunday Strikers',    city: 'Chennai',   style: 'Right-hand bat',            matches: 142, color: '#2d7a3a', verified: true },
  { id: 'c2',  name: 'Aman Verma',      role: 'All-rounder',  team: 'Galaxy Gladiators',  city: 'Chennai',   style: 'RH bat · Off break',        matches: 98,  color: '#b45309' },
  { id: 'c3',  name: 'Priya Nair',      role: 'Bowler',       team: 'Metro Mavericks',    city: 'Bengaluru', style: 'Right-arm fast-medium',     matches: 76,  color: '#7c3aed', verified: true },
  { id: 'c4',  name: 'Kabir Singh',     role: 'Wicketkeeper', team: 'City Cobras',        city: 'Chennai',   style: 'RH bat · Keeper',           matches: 120, color: '#b91c1c' },
  { id: 'c5',  name: 'Dev Sharma',      role: 'Bowler',       team: 'North Riders',       city: 'Pune',      style: 'Left-arm orthodox',         matches: 64,  color: '#0d7c8f' },
  { id: 'c6',  name: 'Isha Patel',      role: 'Batter',       team: 'Park Avenue XI',     city: 'Mumbai',    style: 'Left-hand bat',             matches: 88,  color: '#1a5fa8' },
  { id: 'c7',  name: 'Vikram Rao',      role: 'All-rounder',  team: 'Royal Challengers',  city: 'Hyderabad', style: 'RH bat · Leg break',        matches: 156, color: '#c2490d', verified: true },
  { id: 'c8',  name: 'Sana Khan',       role: 'Bowler',       team: 'Sunday Strikers',    city: 'Chennai',   style: 'Right-arm off break',       matches: 52,  color: '#0f766e' },
  { id: 'c9',  name: 'Arjun NADAR',     role: 'Batter',       team: 'City Cobras',        city: 'Chennai',   style: 'Right-hand bat',            matches: 110, color: '#7f1d1d' },
  { id: 'c10', name: 'Meera Iyer',      role: 'Wicketkeeper', team: 'Metro Mavericks',    city: 'Bengaluru', style: 'RH bat · Keeper',           matches: 70,  color: '#a16207' },
  { id: 'c11', name: 'Rahul Dixit',     role: 'All-rounder',  team: 'North Riders',       city: 'Pune',      style: 'LH bat · Medium',           matches: 134, color: '#4d7c0f' },
  { id: 'c12', name: 'Neha Joshi',      role: 'Batter',       team: 'Galaxy Gladiators',  city: 'Chennai',   style: 'Right-hand bat',            matches: 47,  color: '#9333ea' },
  { id: 'c13', name: 'Sameer Gupta',    role: 'Bowler',       team: 'Royal Challengers',  city: 'Hyderabad', style: 'Right-arm fast',            matches: 91,  color: '#0e7490' },
  { id: 'c14', name: 'Tara Menon',      role: 'All-rounder',  team: 'Park Avenue XI',     city: 'Mumbai',    style: 'RH bat · Off break',        matches: 63,  color: '#be185d', verified: true },
];

function Avatar({ name, color }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <View style={[s.avatar, { backgroundColor: color }]}>
      <Text style={s.avatarTxt}>{initials}</Text>
    </View>
  );
}

export default function FindCricketersScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [players, setPlayers] = useState(CRICKETERS); // mock fallback until loaded

  useEffect(() => {
    let alive = true;
    legendsApi.getPlayers().then((res) => {
      if (!alive) return;
      const list = (res?.data || []).map(mapPlayer).filter(Boolean);
      if (list.length) setPlayers(list);
    });
    return () => { alive = false; };
  }, []);

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
            <Text style={[s.roleTxt, { color: rm.color }]}>{rm.short}</Text>
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
        <Text style={s.title}>Find Cricketers</Text>
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
      <Text style={s.count}>{data.length} cricketer{data.length === 1 ? '' : 's'}</Text>

      {/* list */}
      <FlatList
        data={data}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Icon name="account-search-outline" size={56} color={DS.surfaceHighest} />
            <Text style={s.emptyTitle}>No cricketers found</Text>
            <Text style={s.emptySub}>Try a different name or filter</Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },

  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 52, paddingBottom: 8, paddingHorizontal: 14 },
  backBtn: { padding: 4 },
  title: { color: DS.textPrimary, fontSize: 20, fontWeight: '800' },

  searchWrap: { paddingHorizontal: 16, paddingTop: 6 },
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
