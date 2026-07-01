// RummyNewGameScreen — configure a new Pool-Rummy game (name, scores, players).

import { useState, useEffect, useMemo, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar,
  TextInput, Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../../../services/LegendsApi';
import { useTheme } from '../../../theme/ThemeContext';

export default function RummyNewGameScreen({ navigation }) {
  const C = useTheme().colors;
  // Rummy/Arena screens use the brighter lime accent (per the design system).
  const A = useMemo(() => ({ ...C, lime: C.limeBright }), [C]);
  const s = useMemo(() => makeStyles(A), [A]);

  const NumField = ({ label, value, onChange }) => (
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

  const Check = ({ on }) => (
    <View style={[s.check, on && { backgroundColor: A.lime, borderColor: A.lime }]}>
      {on && <Icon name="check" size={14} color={A.navy0} />}
    </View>
  );

  const [autoName, setAutoName] = useState(true);
  const [name, setName] = useState('');
  const [totalScore, setTotalScore] = useState('250');
  const [openDrop, setOpenDrop] = useState('25');
  const [middleDrop, setMiddleDrop] = useState('50');
  const [fullCount, setFullCount] = useState('80');
  const [adjustReentry, setAdjustReentry] = useState(false);
  const [roster, setRoster] = useState([]);       // [{ id, name }] managed on the landing screen
  const [selected, setSelected] = useState([]);   // names chosen for THIS game
  const [newPlayer, setNewPlayer] = useState('');
  const [starting, setStarting] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: 'New Game',
    });
  }, [navigation]);

  // Load the saved roster, and pre-select the logged-in user (like the reference's "*you").
  useEffect(() => {
    legendsApi.getRummyRosterPlayers().then((res) => setRoster(res?.data || []));
    legendsApi.getMe().then((res) => {
      const u = res?.success && res.data?.user;
      const me = u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '';
      if (me) {
        setRoster((cur) => (cur.some((p) => p.name.toLowerCase() === me.toLowerCase()) ? cur : [{ id: `me-${me}`, name: me }, ...cur]));
        setSelected((cur) => (cur.includes(me) ? cur : [me, ...cur]));
      }
    });
  }, []);

  const toggle = (nm) =>
    setSelected((cur) => (cur.includes(nm) ? cur.filter((x) => x !== nm) : [...cur, nm]));

  // Add a brand-new player: save to the roster and select for this game.
  const addPlayer = async () => {
    const n = newPlayer.trim();
    if (!n) return;
    setNewPlayer('');
    if (!roster.some((p) => p.name.toLowerCase() === n.toLowerCase())) {
      const res = await legendsApi.addRummyRosterPlayer(n);
      const added = res?.data || { id: `tmp-${n}`, name: n };
      setRoster((cur) => (cur.some((p) => p.name.toLowerCase() === n.toLowerCase()) ? cur : [...cur, added]));
    }
    setSelected((cur) => (cur.some((x) => x.toLowerCase() === n.toLowerCase()) ? cur : [...cur, n]));
  };

  const start = async () => {
    if (selected.length < 2) return Alert.alert('Add players', 'Select at least 2 players.');
    setStarting(true);
    const res = await legendsApi.createRummyGame({
      name: autoName ? undefined : name.trim(),
      totalScore: +totalScore || 250, openDrop: +openDrop || 25,
      middleDrop: +middleDrop || 50, fullCount: +fullCount || 80,
      adjustReentry, players: selected,
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
      <StatusBar barStyle={C.mode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={A.navy1} />
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
          <Text style={[s.hint, { marginBottom: 12 }]}>Tap to include players in this game. Add a new name to save it to your roster.</Text>
          <View style={s.addRow}>
            <TextInput
              style={[s.textInput, { flex: 1, marginBottom: 0 }]}
              placeholder="Add a new player"
              placeholderTextColor={A.inkDim}
              value={newPlayer}
              onChangeText={setNewPlayer}
              onSubmitEditing={addPlayer}
              returnKeyType="done"
              blurOnSubmit={false}
            />
            <TouchableOpacity style={s.addBtn} onPress={addPlayer}>
              <Icon name="plus" size={22} color={A.navy0} />
            </TouchableOpacity>
          </View>
          {roster.length === 0 ? (
            <Text style={[s.hint, { marginTop: 12 }]}>No saved players yet. Type a name above and tap +.</Text>
          ) : (
            <View style={s.chips}>
              {roster.map((p) => {
                const on = selected.includes(p.name);
                return (
                  <TouchableOpacity key={p.id} style={[s.chip, on && s.chipOn]} onPress={() => toggle(p.name)}>
                    <Icon name={on ? 'check' : 'plus'} size={14} color={on ? A.navy0 : A.inkDim} />
                    <Text style={[s.chipTxt, on && s.chipTxtOn]}>{p.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {selected.length < 2 && (
            <Text style={[s.hint, { marginTop: 12 }]}>Select {2 - selected.length} more player{selected.length === 1 ? '' : 's'} to start.</Text>
          )}
        </View>
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={[s.startBtn, (selected.length < 2 || starting) && { opacity: 0.5 }]} onPress={start} disabled={selected.length < 2 || starting}>
          <Text style={s.startTxt}>{starting ? 'STARTING…' : 'START GAME'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (A) => StyleSheet.create({
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
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: A.cellHi, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'transparent' },
  chipOn: { backgroundColor: A.lime, borderColor: A.lime },
  chipTxt: { color: A.ink, fontSize: 13, fontWeight: '700' },
  chipTxtOn: { color: A.navy0 },
  hint: { color: A.inkDim, fontSize: 13 },

  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28, backgroundColor: A.navy1, borderTopWidth: 1, borderTopColor: A.line },
  startBtn: { backgroundColor: A.lime, borderRadius: 26, paddingVertical: 16, alignItems: 'center' },
  startTxt: { color: A.navy0, fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
});
