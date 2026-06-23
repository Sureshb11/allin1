import { useTheme, useThemedStyles } from "../theme/ThemeContext"; // MySportsScreen — view & manage the sports the user follows (UserSport).
// Shows the user's sports (primary highlighted), lets them switch primary
// (reloads the app for that sport), and add more via the Arena picker.

import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar,
  ActivityIndicator, Alert } from
'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { setSelectedSport } from '../utils/selectedSport';







// id → { name, icon } for the picker sports.
const SPORT_META = {
  cricket: { name: 'Cricket', icon: 'cricket' }, football: { name: 'Football', icon: 'soccer' },
  kabaddi: { name: 'Kabaddi', icon: 'run-fast' }, hockey: { name: 'Hockey', icon: 'hockey-sticks' },
  badminton: { name: 'Badminton', icon: 'badminton' }, tennis: { name: 'Tennis', icon: 'tennis' },
  basketball: { name: 'Basketball', icon: 'basketball' }, volleyball: { name: 'Volleyball', icon: 'volleyball' },
  boxing: { name: 'Boxing', icon: 'boxing-glove' }, wrestling: { name: 'Wrestling', icon: 'arm-flex' },
  khokho: { name: 'Kho-Kho', icon: 'run' }, handball: { name: 'Handball', icon: 'handball' },
  squash: { name: 'Squash', icon: 'tennis' }, pickleball: { name: 'Pickleball', icon: 'table-tennis' },
  tabletennis: { name: 'Table Tennis', icon: 'table-tennis' }, judo: { name: 'Judo', icon: 'karate' },
  karate: { name: 'Karate', icon: 'karate' },
  skateboard: { name: 'Skateboarding', icon: 'skateboard' }, rummy: { name: 'Rummy', icon: 'cards-playing-outline' }
};
const meta = (id) => SPORT_META[id] || { name: id ? id[0].toUpperCase() + id.slice(1) : 'Sport', icon: 'trophy' };

export default function MySportsScreen({ navigation }) {const DS = useTheme().colors;const s = useThemedStyles(makeS);
  const [sports, setSports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    legendsApi.getMe().then((res) => {
      setSports(res?.success ? res.data.sports || [] : []);
      setLoading(false);
    });
  }, []);

  useFocusEffect(useCallback(() => {load();}, [load]));

  const switchTo = (sportId) => {
    const m = meta(sportId);
    Alert.alert(`Switch to ${m.name}?`, `Local Legends will reload for ${m.name}.`, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Switch',
      onPress: async () => {
        setSwitching(true);
        const sport = { id: sportId, name: m.name, icon: m.icon };
        setSelectedSport(sport, null);
        try {await legendsApi.selectPrimarySport(sportId);} catch {}
        const root = navigation.getParent('RootStack');
        if (root) root.reset({ index: 0, routes: [{ name: 'MainApp', params: { sport } }] });
      }
    }]
    );
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />
      <View style={s.header}>
        <TouchableOpacity hitSlop={8} onPress={() => navigation.goBack()} style={s.backBtn}>
          <Icon name="arrow-left" size={24} color={DS.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>My Sports</Text>
      </View>

      {loading ?
      <ActivityIndicator style={{ marginTop: 40 }} color={DS.lime} /> :

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          <Text style={s.sub}>Sports you follow · tap to make it your active sport</Text>

          {sports.length === 0 ?
        <View style={s.empty}>
              <Icon name="trophy-outline" size={44} color={DS.surfaceHighest} />
              <Text style={s.emptyTitle}>No sports yet</Text>
              <Text style={s.emptySub}>Pick a sport from the Arena to get started.</Text>
            </View> :

        sports.map((us) => {
          const m = meta(us.sport);
          return (
            <TouchableOpacity
              key={us.sport}
              style={[s.card, us.isPrimary && s.cardPrimary]}
              activeOpacity={0.85}
              disabled={us.isPrimary || switching}
              onPress={() => switchTo(us.sport)}>
              
                  <View style={[s.iconWrap, us.isPrimary && { backgroundColor: DS.lime }]}>
                    <Icon name={m.icon} size={24} color={us.isPrimary ? DS.bg : DS.lime} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.name}>{m.name}</Text>
                    {!!us.role && <Text style={s.role}>{us.role}</Text>}
                  </View>
                  {us.isPrimary ?
              <View style={s.badge}><Text style={s.badgeTxt}>ACTIVE</Text></View> :
              <Icon name="swap-horizontal" size={20} color={DS.textMuted} />}
                </TouchableOpacity>);

        })
        }

          <TouchableOpacity style={s.addBtn} activeOpacity={0.85} onPress={() => navigation.navigate('Profile')}>
            <Icon name="swap-horizontal" size={18} color={DS.lime} />
            <Text style={s.addTxt}>Switch sport in Profile</Text>
          </TouchableOpacity>
        </ScrollView>
      }
    </View>);

}

const makeS = (DS) => StyleSheet.create({
  root: { flex: 1, backgroundColor: DS.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 52, paddingBottom: 8, paddingHorizontal: 14 },
  backBtn: { padding: 4 },
  title: { color: DS.textPrimary, fontSize: 20, fontWeight: '800' },
  sub: { color: DS.textMuted, fontSize: 13, marginBottom: 14 },

  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surfaceLow, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: DS.line },
  cardPrimary: { borderColor: DS.lime, backgroundColor: 'rgba(171,214,0,0.08)' },
  iconWrap: { width: 46, height: 46, borderRadius: 14, backgroundColor: DS.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  name: { color: DS.textPrimary, fontSize: 16, fontWeight: '800' },
  role: { color: DS.textMuted, fontSize: 12, marginTop: 1 },
  badge: { backgroundColor: DS.lime, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  badgeTxt: { color: DS.bg, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: DS.lime, borderStyle: 'dashed' },
  addTxt: { color: DS.lime, fontSize: 14, fontWeight: '800' },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 6 },
  emptyTitle: { color: DS.textVariant, fontSize: 16, fontWeight: '700' },
  emptySub: { color: DS.textMuted, fontSize: 13, textAlign: 'center' }
});