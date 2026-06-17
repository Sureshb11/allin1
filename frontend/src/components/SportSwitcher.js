// SportSwitcher — change the active sport. Lives on the Profile screen; switching
// confirms, persists the primary sport, and reloads the app scoped to the new sport
// (resets RootStack → MainApp). Sports list mirrors the dashboard set (no Rummy, which
// has its own dedicated flow). Pass `navigation`.
import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport, setSelectedSport } from '../utils/selectedSport';
import { SPORTS } from '../sports/dashboard';

const C = {
  bg: '#0f131f', surfaceHigh: '#262a37', surfaceHighest: '#313442', lime: '#abd600',
  textPrimary: '#dfe2f3', textMuted: '#8d90a2', line: 'rgba(150,180,230,0.10)',
};

export default function SportSwitcher({ navigation }) {
  const [open, setOpen] = useState(false);
  const current = getSelectedSport().sport || SPORTS[0];

  const switchTo = (sport) => {
    setOpen(false);
    if (sport.id === current.id) return;
    Alert.alert(
      `Switch to ${sport.name}?`,
      `Local Legends will reload and show everything for ${sport.name}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          onPress: async () => {
            setSelectedSport(sport, null);
            try { await legendsApi.selectPrimarySport(sport.id); } catch {}
            const root = navigation?.getParent?.('RootStack');
            if (root) root.reset({ index: 0, routes: [{ name: 'MainApp', params: { sport } }] });
          },
        },
      ],
    );
  };

  return (
    <View>
      <Text style={s.label}>CURRENT SPORT</Text>
      <TouchableOpacity style={s.selector} activeOpacity={0.85} onPress={() => setOpen(true)}>
        <View style={s.iconBox}><Icon name={current.icon} size={18} color={C.lime} /></View>
        <Text style={s.selectorText} numberOfLines={1}>{current.name}</Text>
        <View style={s.right}>
          <Text style={s.hint}>Change sport</Text>
          <Icon name="chevron-down" size={16} color={C.textMuted} />
        </View>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={s.modalContainer}>
          <TouchableOpacity style={s.dismiss} activeOpacity={1} onPress={() => setOpen(false)} />
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Select Sport</Text>
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
              {SPORTS.map((sport) => {
                const active = current.id === sport.id;
                return (
                  <TouchableOpacity key={sport.id} style={[s.item, active && s.itemActive]} onPress={() => switchTo(sport)}>
                    <View style={[s.itemIcon, { backgroundColor: active ? C.lime : C.surfaceHighest }]}>
                      <Icon name={sport.icon} size={24} color={active ? C.bg : C.textMuted} />
                    </View>
                    <Text style={[s.itemLabel, active && { color: C.lime, fontWeight: '700' }]}>{sport.name}</Text>
                    {active && <Icon name="check-circle" size={20} color={C.lime} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  label: { color: C.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 8 },
  selector: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surfaceHigh, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 12 },
  iconBox: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceHighest },
  selectorText: { flex: 1, fontSize: 15, fontWeight: '700', color: C.textPrimary },
  right: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hint: { fontSize: 11, color: C.textMuted, fontWeight: '500' },

  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  dismiss: { flex: 1 },
  sheet: { maxHeight: '70%', backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, borderTopWidth: 1, borderColor: C.line },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.surfaceHighest, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { color: C.textPrimary, fontSize: 17, fontWeight: '800', marginBottom: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  itemActive: {},
  itemIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemLabel: { flex: 1, color: C.textPrimary, fontSize: 15, fontWeight: '600' },
});
