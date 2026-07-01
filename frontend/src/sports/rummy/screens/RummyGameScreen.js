// RummyGameScreen — the Pool-Rummy score board (real data via /rummy).
// Settings header, per-player totals, round-by-round table, ENTER SCORE modal
// (with drop/full quick-fills), add-player & share. Winner derived server-side.

import { useState, useCallback, useMemo, useLayoutEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar,
  Modal, TextInput, ActivityIndicator, Alert, Share, KeyboardAvoidingView, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../../../services/LegendsApi';
import { useTheme } from '../../../theme/ThemeContext';

export default function RummyGameScreen({ navigation, route }) {
  const C = useTheme().colors;
  // Rummy/Arena screens use the brighter lime accent (per the design system).
  const A = useMemo(() => ({ ...C, lime: C.limeBright }), [C]);
  const s = useMemo(() => makeStyles(A), [A]);
  const { gameId } = route.params || {};
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(false);
  const [enter, setEnter] = useState(false);
  const [vals, setVals] = useState({});           // { playerId: "score" }
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: game?.name || 'Game',
    });
  }, [navigation, game?.name]);

  const refresh = useCallback(() => {
    legendsApi.getRummyGame(gameId).then((res) => {
      if (res.success) setGame(res.data);
      setLoading(false);
    });
  }, [gameId]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  if (loading || !game) {
    return <View style={[s.root, { justifyContent: 'center' }]}><ActivityIndicator color={A.lime} /></View>;
  }

  const activePlayers = game.players.filter((p) => !p.eliminated);
  const openEnter = () => {
    const init = {};
    activePlayers.forEach((p) => { init[p.id] = ''; });
    setVals(init);
    setEnter(true);
  };

  const submitRound = async () => {
    setSaving(true);
    const scores = activePlayers.map((p) => ({ playerId: p.id, value: parseInt(vals[p.id], 10) || 0 }));
    const res = await legendsApi.addRummyRound(gameId, scores);
    setSaving(false);
    if (res.success) { setGame(res.data); setEnter(false); }
    else Alert.alert('Error', res.error || 'Could not save the round.');
  };

  const addPlayer = () => {
    setMenu(false);
    Alert.prompt?.('Add Player', 'New player name', async (name) => {
      if (name?.trim()) { const res = await legendsApi.addRummyPlayer(gameId, name.trim()); if (res.success) setGame(res.data); }
    }) ?? Alert.alert('Add Player', 'Use the New Game screen to add players on this device.');
  };

  const shareGame = async () => {
    setMenu(false);
    const lines = game.players.map((p) => `${p.name}: ${p.total}${p.eliminated ? ' (OUT)' : ''}`).join('\n');
    try { await Share.share({ message: `🃏 ${game.name}\nPool ${game.totalScore} · ${game.roundsCompleted} rounds\n\n${lines}${game.winner ? `\n\n🏆 ${game.winner.name} wins!` : ''}` }); } catch {}
  };

  const cols = game.players.length;

  return (
    <View style={s.root}>
      <StatusBar barStyle={C.mode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={A.navy1} />

      {/* header */}
      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color={A.ink} />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{game.name}</Text>
        <TouchableOpacity style={s.iconBtn} onPress={shareGame}><Icon name="share-variant" size={20} color={A.ink} /></TouchableOpacity>
        <TouchableOpacity style={s.iconBtn} onPress={() => setMenu(true)}><Icon name="dots-vertical" size={22} color={A.ink} /></TouchableOpacity>
      </View>

      {/* settings strip */}
      <View style={s.settings}>
        <View style={s.setRow}><Text style={s.setItem}>Pool: <Text style={s.setVal}>{game.totalScore}</Text></Text><Text style={s.setItem}>Open drop: <Text style={s.setVal}>{game.openDrop}</Text></Text></View>
        <View style={s.setRow}><Text style={s.setItem}>Middle: <Text style={s.setVal}>{game.middleDrop}</Text></Text><Text style={s.setItem}>Full: <Text style={s.setVal}>{game.fullCount}</Text></Text></View>
        <Text style={s.rounds}>Rounds Completed: {game.roundsCompleted}</Text>
      </View>

      {/* player totals header */}
      <View style={s.playerRow}>
        {game.players.map((p) => (
          <View key={p.id} style={[s.playerCol, p.eliminated && s.playerColOut]}>
            <Text style={[s.playerName, p.eliminated && s.outName]} numberOfLines={1}>{p.name}</Text>
            <Text style={[s.playerTotal, p.eliminated ? { color: A.dangerTxt } : (p.id === game.winner?.id ? { color: A.lime } : null)]}>{p.total}</Text>
            <Text style={[s.playerLeft, p.eliminated && { color: A.dangerTxt }]}>{p.eliminated ? 'OUT' : `${game.totalScore - p.total} left`}</Text>
          </View>
        ))}
      </View>

      {/* rounds table */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
        {game.rounds.length === 0 ? (
          <View style={s.empty}><Icon name="cards-outline" size={40} color={A.faint} /><Text style={s.emptyTxt}>No rounds yet. Tap ENTER SCORE.</Text></View>
        ) : (
          game.rounds.map((r) => (
            <View key={r.id} style={s.roundRow}>
              <Text style={s.roundNum}>{String(r.roundNumber).padStart(2, '0')}</Text>
              {game.players.map((p) => {
                const v = r.scores[p.id];
                return <Text key={p.id} style={[s.roundCell, v === 0 ? { color: A.lime } : null]}>{v == null ? '·' : (v === 0 ? '—' : v)}</Text>;
              })}
            </View>
          ))
        )}
      </ScrollView>

      {/* footer */}
      <View style={s.footer}>
        {game.winner ? (
          <View style={s.winBanner}><Text style={s.winTxt}>{game.winner.name} WINS 🏆</Text></View>
        ) : (
          <TouchableOpacity style={s.enterBtn} onPress={openEnter}><Text style={s.enterTxt}>ENTER SCORE</Text></TouchableOpacity>
        )}
      </View>

      {/* menu */}
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <TouchableOpacity style={s.menuBackdrop} activeOpacity={1} onPress={() => setMenu(false)}>
          <View style={s.menu}>
            <TouchableOpacity style={s.menuItem} onPress={addPlayer}><Icon name="account-plus" size={18} color={A.ink} /><Text style={s.menuTxt}>Add Player</Text></TouchableOpacity>
            <TouchableOpacity style={s.menuItem} onPress={shareGame}><Icon name="share-variant" size={18} color={A.ink} /><Text style={s.menuTxt}>Share</Text></TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* enter score */}
      <Modal visible={enter} transparent animationType="slide" onRequestClose={() => setEnter(false)}>
        <View style={s.sheetBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setEnter(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.sheet}>
              <View style={s.grab} />
              <Text style={s.sheetTitle}>Round {game.roundsCompleted + 1} — enter scores</Text>
              <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                {activePlayers.map((p) => (
                  <View key={p.id} style={s.entRow}>
                    <Text style={s.entName} numberOfLines={1}>{p.name}</Text>
                    <View style={s.quickRow}>
                      {[['W', 0], ['OD', game.openDrop], ['MD', game.middleDrop], ['F', game.fullCount]].map(([lbl, val]) => (
                        <TouchableOpacity key={lbl} style={s.quick} onPress={() => setVals((v) => ({ ...v, [p.id]: String(val) }))}>
                          <Text style={s.quickTxt}>{lbl}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TextInput
                      style={s.entInput}
                      value={vals[p.id]}
                      onChangeText={(t) => setVals((v) => ({ ...v, [p.id]: t.replace(/[^0-9]/g, '') }))}
                      keyboardType="number-pad" placeholder="0" placeholderTextColor={A.inkDim} maxLength={3}
                    />
                  </View>
                ))}
              </ScrollView>
              <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={submitRound} disabled={saving}>
                <Text style={s.saveTxt}>{saving ? 'SAVING…' : 'SAVE ROUND'}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (A) => StyleSheet.create({
  root: { flex: 1, backgroundColor: A.navy1, paddingTop: 44 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 6, paddingBottom: 8 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: A.ink, fontSize: 17, fontWeight: '800', marginHorizontal: 4 },

  settings: { backgroundColor: A.navy2, paddingHorizontal: 18, paddingVertical: 10, gap: 4 },
  setRow: { flexDirection: 'row', justifyContent: 'space-between' },
  setItem: { color: A.inkDim, fontSize: 13 },
  setVal: { color: A.ink, fontWeight: '800' },
  rounds: { color: A.lime, fontSize: 13, fontWeight: '800', textAlign: 'center', marginTop: 2 },

  playerRow: { flexDirection: 'row', backgroundColor: A.cell, borderBottomWidth: 1, borderBottomColor: A.line },
  playerCol: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRightWidth: 1, borderRightColor: A.line },
  playerColOut: { backgroundColor: 'rgba(255,90,90,0.06)' },
  playerName: { color: A.ink, fontSize: 13, fontWeight: '800' },
  outName: { color: A.dangerTxt, textDecorationLine: 'line-through' },
  playerTotal: { color: A.ink, fontSize: 24, fontWeight: '900', marginTop: 2 },
  playerLeft: { color: A.inkDim, fontSize: 9.5, fontWeight: '700', marginTop: 1 },

  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTxt: { color: A.inkDim, fontSize: 13 },
  roundRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  roundNum: { width: 40, textAlign: 'center', color: A.inkDim, fontSize: 14, fontWeight: '800' },
  roundCell: { flex: 1, textAlign: 'center', color: A.ink, fontSize: 16, fontWeight: '700' },

  footer: { padding: 16, paddingBottom: 28, borderTopWidth: 1, borderTopColor: A.line },
  enterBtn: { backgroundColor: A.lime, borderRadius: 26, paddingVertical: 15, alignItems: 'center' },
  enterTxt: { color: A.navy0, fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  winBanner: { backgroundColor: A.cellHi, borderRadius: 26, paddingVertical: 15, alignItems: 'center' },
  winTxt: { color: A.lime, fontSize: 17, fontWeight: '900' },

  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  menu: { position: 'absolute', top: 90, right: 12, backgroundColor: A.cell, borderRadius: 12, paddingVertical: 6, minWidth: 180, borderWidth: 1, borderColor: A.line },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  menuTxt: { color: A.ink, fontSize: 15, fontWeight: '600' },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: A.navy2, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 26 },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: A.cellHi, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { color: A.ink, fontSize: 16, fontWeight: '800', marginBottom: 12 },
  entRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  entName: { width: 70, color: A.ink, fontSize: 14, fontWeight: '700' },
  quickRow: { flexDirection: 'row', gap: 6, flex: 1 },
  quick: { flex: 1, backgroundColor: A.cell, borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: A.line },
  quickTxt: { color: A.lime, fontSize: 12, fontWeight: '800' },
  entInput: { width: 54, backgroundColor: A.cell, borderRadius: 8, paddingVertical: 8, textAlign: 'center', color: A.ink, fontSize: 16, fontWeight: '800', borderWidth: 1, borderColor: A.line },
  saveBtn: { backgroundColor: A.lime, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 14 },
  saveTxt: { color: A.navy0, fontSize: 15, fontWeight: '900' },
});
