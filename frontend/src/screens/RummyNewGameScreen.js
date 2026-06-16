// RummyNewGameScreen — configure a new Pool-Rummy game (name, scores, players).

import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar,
  TextInput, Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';

const A = {
  navy0: '#0a0e18', navy1: '#0d1320', navy2: '#111a2b', cell: '#161f30', cellHi: '#1d2942',
  line: 'rgba(150,180,230,0.10)', ink: '#eaf0fb', inkDim: '#8a97b0', lime: '#c4f82a', danger: '#ff5a5a',
};

function NumField({ label, value, onChange }) {
  return (
    <View style={s.numField}>
      <Text style={s.numLabel}>{label}</Text>
      <TextInput
        style={s.numInput}
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        maxLength={4}
      />
    </View>
  );
}

const Check = ({ on }) => (
  <View style={[s.check, on && { backgroundColor: A.lime, borderColor: A.lime }]}>
    {on && <Icon name="check" size={14} color={A.navy0} />}
  </View>
);

export default function RummyNewGameScreen({ navigation }) {
  const [autoName, setAutoName] = useState(true);
  const [name, setName] = useState('');
  const [totalScore, setTotalScore] = useState('250');
  const [openDrop, setOpenDrop] = useState('25');
  const [middleDrop, setMiddleDrop] = useState('50');
  const [fullCount, setFullCount] = useState('80');
  const [adjustReentry, setAdjustReentry] = useState(false);
  const [players, setPlayers] = useState([]);
  const [newPlayer, setNewPlayer] = useState('');
  const [starting, setStarting] = useState(false);

  const addPlayer = () => {
    const n = newPlayer.trim();
    if (!n) return;
    if (players.some((p) => p.toLowerCase() === n.toLowerCase())) return;
    setPlayers((p) => [...p, n]);
    setNewPlayer('');
  };
  const removePlayer = (n) => setPlayers((p) => p.filter((x) => x !== n));

  const start = async () => {
    if (players.length < 2) return Alert.alert('Add players', 'Add at least 2 players.');
    setStarting(true);
    const res = await legendsApi.createRummyGame({
      name: autoName ? undefined : name.trim(),
      totalScore: +totalScore || 250, openDrop: +openDrop || 25,
      middleDrop: +middleDrop || 50, fullCount: +fullCount || 80,
      adjustReentry, players,
    });
    setStarting(false);
    if (res.success) {
      navigation.replace('RummyGame', { gameId: res.data.id });
    } else {
      Alert.alert('Error', res.error || 'Could not start the game.');
    }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={A.navy1} />
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color={A.ink} />
        </TouchableOpacity>
        <Text style={s.title}>New Game</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
        {/* Name */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Game Name</Text>
          <TextInput
            style={[s.textInput, autoName && { opacity: 0.4 }]}
            placeholder="Game Name"
            placeholderTextColor={A.inkDim}
            value={autoName ? '' : name}
            onChangeText={setName}
            editable={!autoName}
          />
          <TouchableOpacity style={s.checkRow} onPress={() => setAutoName((v) => !v)}>
            <Check on={autoName} />
            <Text style={s.checkLabel}>Use auto generated name</Text>
          </TouchableOpacity>
        </View>

        {/* Scores */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Game Scores</Text>
          <View style={s.numRow}>
            <NumField label="Total score" value={totalScore} onChange={setTotalScore} />
            <NumField label="Open drop" value={openDrop} onChange={setOpenDrop} />
          </View>
          <View style={s.numRow}>
            <NumField label="Middle drop" value={middleDrop} onChange={setMiddleDrop} />
            <NumField label="Full count" value={fullCount} onChange={setFullCount} />
          </View>
          <TouchableOpacity style={s.checkRow} onPress={() => setAdjustReentry((v) => !v)}>
            <Check on={adjustReentry} />
            <Text style={s.checkLabel}>Adjust re-entry score to highest player score +1</Text>
          </TouchableOpacity>
        </View>

        {/* Players */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Select Players</Text>
          <View style={s.addRow}>
            <TextInput
              style={[s.textInput, { flex: 1, marginBottom: 0 }]}
              placeholder="Player name"
              placeholderTextColor={A.inkDim}
              value={newPlayer}
              onChangeText={setNewPlayer}
              onSubmitEditing={addPlayer}
              returnKeyType="done"
            />
            <TouchableOpacity style={s.addBtn} onPress={addPlayer}>
              <Icon name="plus" size={22} color={A.navy0} />
            </TouchableOpacity>
          </View>
          <View style={s.chips}>
            {players.length === 0
              ? <Text style={s.hint}>Add at least 2 players.</Text>
              : players.map((p) => (
                <TouchableOpacity key={p} style={s.chip} onPress={() => removePlayer(p)}>
                  <Text style={s.chipTxt}>{p}</Text>
                  <Icon name="close" size={14} color={A.inkDim} />
                </TouchableOpacity>
              ))}
          </View>
        </View>
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={[s.startBtn, (players.length < 2 || starting) && { opacity: 0.5 }]} onPress={start} disabled={players.length < 2 || starting}>
          <Text style={s.startTxt}>{starting ? 'STARTING…' : 'START GAME'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: A.navy1, paddingTop: 44 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontWeight: '800', color: A.ink },

  card: { backgroundColor: A.cell, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: A.line },
  cardTitle: { color: A.ink, fontSize: 16, fontWeight: '800', marginBottom: 12 },
  textInput: { backgroundColor: A.navy2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: A.ink, fontSize: 15, marginBottom: 12, borderWidth: 1, borderColor: A.line },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: A.inkDim, alignItems: 'center', justifyContent: 'center' },
  checkLabel: { color: A.ink, fontSize: 13.5, flex: 1 },

  numRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  numField: { flex: 1, backgroundColor: A.navy2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: A.line },
  numLabel: { color: A.lime, fontSize: 11, fontWeight: '700' },
  numInput: { color: A.ink, fontSize: 18, fontWeight: '800', paddingVertical: 2 },

  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: A.lime, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: A.cellHi, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  chipTxt: { color: A.ink, fontSize: 13, fontWeight: '700' },
  hint: { color: A.inkDim, fontSize: 13 },

  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28, backgroundColor: A.navy1, borderTopWidth: 1, borderTopColor: A.line },
  startBtn: { backgroundColor: A.lime, borderRadius: 26, paddingVertical: 16, alignItems: 'center' },
  startTxt: { color: A.navy0, fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
});
