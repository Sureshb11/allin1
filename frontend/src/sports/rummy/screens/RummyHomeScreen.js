// RummyHomeScreen — entry for the Pool-Rummy score board.
// Start a new game or continue/view existing ones (real data via /rummy).

import { useState, useCallback, useMemo, useLayoutEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator, TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import SportIcon from '../../../components/SportIcon';
import SportSwitcher from '../../../components/SportSwitcher';
import legendsApi from '../../../services/LegendsApi';
import { useTheme } from '../../../theme/ThemeContext';

export default function RummyHomeScreen({ navigation }) {
  const C = useTheme().colors;
  // Rummy/Arena screens use the brighter lime accent (per the design system).
  const A = useMemo(() => ({ ...C, lime: C.limeBright }), [C]);
  const s = useMemo(() => makeStyles(A), [A]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState([]);
  const [newPlayer, setNewPlayer] = useState('');
  const [adding, setAdding] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: 'Rummy',
    });
  }, [navigation]);

  const loadRoster = useCallback(() => {
    legendsApi.getRummyRosterPlayers().then((res) => setRoster(res?.data || []));
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    legendsApi.getRummyGames().then((res) => {
      setGames(res?.data || []);
      setLoading(false);
    });
    loadRoster();
  }, [loadRoster]));

  const addPlayer = async () => {
    const name = newPlayer.trim();
    if (!name || adding) return;
    if (roster.some((p) => p.name.toLowerCase() === name.toLowerCase())) { setNewPlayer(''); return; }
    setAdding(true);
    const res = await legendsApi.addRummyRosterPlayer(name);
    setAdding(false);
    if (res.success && res.data) {
      setRoster((cur) => (cur.some((p) => p.id === res.data.id) ? cur : [...cur, res.data]));
      setNewPlayer('');
    }
  };

  const removePlayer = async (id) => {
    setRoster((cur) => cur.filter((p) => p.id !== id));
    // Synthetic `game:<name>` ids come from past-game history (no roster row to delete).
    if (typeof id === 'string' && id.startsWith('game:')) return;
    await legendsApi.deleteRummyRosterPlayer(id);
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={A.navy1} />
      <View style={s.header}>
        <SportIcon id="rummy" size={22} color={A.lime} />
        <Text style={s.title}>RUMMY</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <View style={{ marginBottom: 16 }}>
          <SportSwitcher navigation={navigation} current={{ id: 'rummy', name: 'Rummy', icon: 'cards-playing-outline' }} />
        </View>

        <TouchableOpacity style={s.cta} activeOpacity={0.9} onPress={() => navigation.navigate('RummyNewGame')}>
          <View style={s.ctaIcon}><Icon name="plus" size={26} color={A.navy0} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.ctaTitle}>Start New Game</Text>
            <Text style={s.ctaSub}>Pool rummy · set scores & players</Text>
          </View>
          <Icon name="chevron-right" size={24} color={A.navy0} />
        </TouchableOpacity>

        <Text style={s.sectionTitle}>Players</Text>
        <Text style={s.sectionHint}>Add the people who play. They’ll be ready to pick when you start a game.</Text>
        <View style={s.addRow}>
          <TextInput
            style={s.input}
            value={newPlayer}
            onChangeText={setNewPlayer}
            onSubmitEditing={addPlayer}
            placeholder="Add a player name"
            placeholderTextColor={A.inkDim}
            returnKeyType="done"
            blurOnSubmit={false}
          />
          <TouchableOpacity style={[s.addBtn, (!newPlayer.trim() || adding) && { opacity: 0.5 }]} onPress={addPlayer} disabled={!newPlayer.trim() || adding}>
            <Icon name="plus" size={22} color={A.navy0} />
          </TouchableOpacity>
        </View>
        {roster.length === 0 ? (
          <Text style={s.hint}>No players yet. Add at least two to start a game.</Text>
        ) : (
          <View style={s.chips}>
            {roster.map((p) => (
              <TouchableOpacity key={p.id} style={s.chip} activeOpacity={0.7} onPress={() => removePlayer(p.id)}>
                <Text style={s.chipTxt}>{p.name}</Text>
                <Icon name="close" size={14} color={A.inkDim} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={s.sectionTitle}>Your Games</Text>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={A.lime} />
        ) : games.length === 0 ? (
          <View style={s.empty}>
            <Icon name="cards-playing-outline" size={44} color={A.faint} />
            <Text style={s.emptyTxt}>No games yet. Start one above.</Text>
          </View>
        ) : (
          games.map((g) => (
            <TouchableOpacity key={g.id} style={s.gameCard} activeOpacity={0.85}
              onPress={() => navigation.navigate('RummyGame', { gameId: g.id })}>
              <View style={{ flex: 1 }}>
                <Text style={s.gameName} numberOfLines={1}>{g.name}</Text>
                <Text style={s.gameMeta}>
                  {g.players.length} players · {g.roundsCompleted} rounds · pool {g.totalScore}
                </Text>
              </View>
              {g.winner
                ? <View style={s.wonPill}><Icon name="trophy" size={12} color={A.navy0} /><Text style={s.wonTxt}>{g.winner.name}</Text></View>
                : <View style={s.livePill}><Text style={s.liveTxt}>ACTIVE</Text></View>}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (A) => StyleSheet.create({
  root: { flex: 1, backgroundColor: A.navy1, paddingTop: 44 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: A.cell, alignItems: 'center', justifyContent: 'center', marginRight: 2 },
  title: { fontSize: 20, fontWeight: '900', color: A.ink, letterSpacing: 0.6 },

  cta: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: A.lime, borderRadius: 18, padding: 18 },
  ctaIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(10,14,24,0.12)', alignItems: 'center', justifyContent: 'center' },
  ctaTitle: { color: A.navy0, fontSize: 18, fontWeight: '900' },
  ctaSub: { color: 'rgba(10,14,24,0.7)', fontSize: 12, fontWeight: '600', marginTop: 2 },

  sectionTitle: { color: A.ink, fontSize: 16, fontWeight: '800', marginTop: 22, marginBottom: 4 },
  sectionHint: { color: A.inkDim, fontSize: 12, marginBottom: 12 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, backgroundColor: A.navy2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: A.ink, fontSize: 15, borderWidth: 1, borderColor: A.line },
  addBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: A.lime, alignItems: 'center', justifyContent: 'center' },
  hint: { color: A.inkDim, fontSize: 13, marginTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: A.cellHi, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  chipTxt: { color: A.ink, fontSize: 14, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  emptyTxt: { color: A.inkDim, fontSize: 13 },

  gameCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: A.cell, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: A.line },
  gameName: { color: A.ink, fontSize: 15, fontWeight: '800' },
  gameMeta: { color: A.inkDim, fontSize: 12, marginTop: 2 },
  livePill: { backgroundColor: 'rgba(196,248,42,0.15)', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  liveTxt: { color: A.lime, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  wonPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: A.lime, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  wonTxt: { color: A.navy0, fontSize: 10, fontWeight: '900' },
});
