import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, StatusBar } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { haptic } from '../utils/haptics';

export default function HistoricalStatsQuestionScreen({ navigation, route }) {
  const { colors: DS, isDark } = useTheme();
  const s = useThemedStyles(makeStyles);
  const sport = route.params?.sport;

  const handleImport = () => {
    haptic.tick();
    navigation.navigate('HistoricalStatsSource', { sport });
  };

  const handleStartFresh = () => {
    haptic.tick();
    navigation.reset({ index: 0, routes: [{ name: 'MainApp', params: { sport } }] });
  };

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />
      
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="chevron-left" size={26} color={DS.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={s.body}>
        <View style={s.iconWrapper}>
          <Icon name="history" size={32} color={DS.lime} />
        </View>
        <Text style={s.h1}>Do you have existing cricket stats?</Text>
        <Text style={s.sub}>Local Legends is better when your history comes with you.</Text>

        <TouchableOpacity style={s.choice} activeOpacity={0.85} onPress={handleImport}>
          <View style={[s.choiceIcon, { backgroundColor: DS.lime }]}>
            <Icon name="database-import" size={24} color="#ffffff" />
          </View>
          <View style={s.choiceText}>
            <Text style={s.choiceTitle}>Yes, I have stats to import</Text>
            <Text style={s.choiceBlurb}>Bring in your past matches, runs, and wickets.</Text>
          </View>
          <Icon name="chevron-right" size={20} color={DS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={s.choice} activeOpacity={0.85} onPress={handleStartFresh}>
          <View style={[s.choiceIcon, { backgroundColor: DS.surfaceHighest }]}>
            <Icon name="cricket" size={24} color={DS.textVariant} />
          </View>
          <View style={s.choiceText}>
            <Text style={s.choiceTitle}>No, I'll start fresh</Text>
            <Text style={s.choiceBlurb}>Build your Local Legends stats from scratch.</Text>
          </View>
          <Icon name="chevron-right" size={20} color={DS.textMuted} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: DS.bg },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12,
  },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 20 },
  iconWrapper: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: DS.lime + '1a', alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  h1: { fontSize: 32, fontWeight: '900', color: DS.textPrimary, letterSpacing: -0.6, lineHeight: 38 },
  sub: { fontSize: 15, fontWeight: '600', color: DS.textMuted, marginTop: 12, lineHeight: 22, marginBottom: 40 },
  choice: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, marginBottom: 16,
    borderRadius: 20, backgroundColor: DS.surfaceHigh, borderWidth: 1.5, borderColor: DS.surfaceHighest || '#2a2f42',
  },
  choiceIcon: {
    width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  choiceText: { flex: 1 },
  choiceTitle: { fontSize: 16, fontWeight: '800', color: DS.textPrimary },
  choiceBlurb: { fontSize: 13, fontWeight: '600', color: DS.textMuted, marginTop: 4, lineHeight: 18 },
});
