import { useTheme, useThemedStyles } from "../theme/ThemeContext";import { useState, useEffect, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';















const MEDAL = ['#FFD700', '#C0C0C0', '#CD7F32'];

const TABS = [
{ id: 'Players', label: 'Players', icon: 'account' },
{ id: 'Teams', label: 'Teams', icon: 'account-group' }];


function initials(name) {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function PlayerCard({ item, rank }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.rankBadge, rank < 3 && { backgroundColor: MEDAL[rank] }]}>
          <Text style={styles.rankText}>{rank + 1}</Text>
        </View>
        <View style={[styles.avatar, { backgroundColor: DS.lime }]}>
          <Text style={[styles.avatarText, { color: DS.bg }]}>{initials(item.name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardSub}>{item.matches} matches</Text>
        </View>
      </View>
      <View style={styles.statRow}>
        {[
        { label: 'Runs', value: item.runs.toLocaleString(), icon: 'cricket', color: DS.lime },
        { label: 'Avg', value: item.average, icon: 'numeric', color: DS.blue },
        { label: 'SR', value: item.strikeRate, icon: 'lightning-bolt', color: DS.coral },
        { label: '100s', value: item.centuries, icon: 'star-circle-outline', color: '#d97706' },
        { label: 'Wkts', value: item.wickets, icon: 'weather-windy', color: '#34d399' }].
        map((s) =>
        <View key={s.label} style={styles.statItem}>
            <Icon name={s.icon} size={14} color={s.color} />
            <Text style={styles.statVal}>{s.value}</Text>
            <Text style={styles.statLbl}>{s.label}</Text>
          </View>
        )}
      </View>
    </View>);

}

function TeamCard({ item, rank }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const pct = item.winRate;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.rankBadge, rank < 3 && { backgroundColor: MEDAL[rank] }]}>
          <Text style={styles.rankText}>{rank + 1}</Text>
        </View>
        <View style={[styles.avatar, { backgroundColor: DS.blue }]}>
          <Text style={[styles.avatarText, { color: DS.bg }]}>{initials(item.name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardSub}>{item.matches} matches played</Text>
        </View>
        <View style={styles.winRatePill}>
          <Text style={styles.winRatePillText}>{pct}%</Text>
          <Text style={styles.winRatePillSub}>Win</Text>
        </View>
      </View>

      {/* Win/Loss bar */}
      <View style={styles.ratioBar}>
        <View style={[styles.ratioFill, { flex: item.wins, backgroundColor: '#34d399' }]}>
          <Text style={styles.ratioFillText}>{item.wins}W</Text>
        </View>
        <View style={[styles.ratioFill, { flex: item.losses, backgroundColor: DS.live }]}>
          <Text style={styles.ratioFillText}>{item.losses}L</Text>
        </View>
      </View>

      <View style={styles.statRow}>
        {[
        { label: 'Wins', value: item.wins, color: '#34d399' },
        { label: 'Losses', value: item.losses, color: DS.live },
        { label: 'Runs', value: item.totalRuns.toLocaleString(), color: DS.lime },
        { label: 'Wickets', value: item.totalWickets, color: DS.blue }].
        map((s) =>
        <View key={s.label} style={styles.statItem}>
            <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLbl}>{s.label}</Text>
          </View>
        )}
      </View>
    </View>);

}

export default function StatisticsScreen({ navigation }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const [tab, setTab] = useState('Players');
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);

  useLayoutEffect(() => {
    navigation?.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: 'Statistics',
    });
  }, [navigation]);

  useEffect(() => {
    let alive = true;
    Promise.all([legendsApi.getPlayers(), legendsApi.getTeams()]).then(([pr, tr]) => {
      if (!alive) return;
      setPlayers((pr?.data || []).map((p) => ({ id: p.id, name: p.name, ...(p.stats || {}) })));
      setTeams((tr?.data || []).map((t) => ({ id: t.id, name: t.name, ...(t.stats || {}) })));
    });
    return () => { alive = false; };
  }, []);

  const data = tab === 'Players' ? players : teams;
  const renderCard = tab === 'Players' ?
  ({ item, index }) => <PlayerCard item={item} rank={index} /> :
  ({ item, index }) => <TeamCard item={item} rank={index} />;

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <Icon name="chart-bar" size={20} color={DS.lime} />
        <Text style={styles.heroTitle}>Statistics</Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map((t) =>
        <TouchableOpacity key={t.id} style={[styles.tabBtn, tab === t.id && styles.tabBtnActive]}
        onPress={() => setTab(t.id)}>
            <Icon name={t.icon} size={15} color={tab === t.id ? DS.bg : DS.textMuted} />
            <Text style={[styles.tabBtnText, tab === t.id && styles.tabBtnTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={data}
        renderItem={renderCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 48, gap: 8 }}>
            <Icon name="chart-bar" size={44} color={DS.surfaceHighest} />
            <Text style={{ color: DS.textMuted, fontSize: 14 }}>No {tab.toLowerCase()} ranked yet</Text>
          </View>}
        showsVerticalScrollIndicator={false} />

    </View>);

}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: DS.textPrimary },

  tabBar: {
    flexDirection: 'row', backgroundColor: DS.surfaceHigh,
    margin: 16, borderRadius: 16, padding: 4
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 12
  },
  tabBtnActive: { backgroundColor: DS.lime },
  tabBtnText: { fontWeight: '700', fontSize: 13, color: DS.textMuted },
  tabBtnTextActive: { color: DS.bg },

  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },

  card: { backgroundColor: DS.surfaceHigh, borderRadius: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, paddingBottom: 10 },
  rankBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: DS.surfaceHighest,
    alignItems: 'center', justifyContent: 'center'
  },
  rankText: { fontSize: 11, fontWeight: '900', color: DS.bg },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '900' },
  cardName: { fontSize: 15, fontWeight: '800', color: DS.textPrimary },
  cardSub: { fontSize: 11, color: DS.textMuted, marginTop: 1 },

  winRatePill: {
    backgroundColor: 'rgba(52,211,153,0.15)', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center'
  },
  winRatePillText: { fontSize: 16, fontWeight: '900', color: '#34d399' },
  winRatePillSub: { fontSize: 9, color: '#34d399', fontWeight: '700' },

  ratioBar: {
    flexDirection: 'row', height: 24, overflow: 'hidden',
    marginHorizontal: 14, marginBottom: 10, borderRadius: 6
  },
  ratioFill: { justifyContent: 'center', alignItems: 'center', minWidth: 20 },
  ratioFillText: { fontSize: 10, fontWeight: '700', color: DS.bg },

  statRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingVertical: 10, paddingHorizontal: 8,
    backgroundColor: DS.surfaceHighest, borderBottomLeftRadius: 16, borderBottomRightRadius: 16
  },
  statItem: { alignItems: 'center', gap: 2 },
  statVal: { fontSize: 15, fontWeight: '900', color: DS.textPrimary },
  statLbl: { fontSize: 10, color: DS.textMuted, fontWeight: '600' }
});