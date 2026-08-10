import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, StatusBar } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { haptic } from '../utils/haptics';

export default function HistoricalStatsSourceScreen({ navigation, route }) {
  const { colors: DS, isDark } = useTheme();
  const s = useThemedStyles(makeStyles);
  const sport = route.params?.sport;

  const handleUpload = () => {
    haptic.tick();
    navigation.navigate('HistoricalStatsUpload', { sport });
  };

  const comingSoon = () => {
    haptic.tick();
    alert('Coming soon! We are still building this integration.');
  };

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />
      
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="chevron-left" size={26} color={DS.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.skip}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={s.body}>
        <Text style={s.h1}>Where are your stats?</Text>
        <Text style={s.sub}>Choose how you want to bring your cricket history into Local Legends.</Text>

        <TouchableOpacity style={[s.choice, { borderColor: DS.lime, backgroundColor: DS.lime + '1a' }]} activeOpacity={0.85} onPress={handleUpload}>
          <View style={[s.choiceIcon, { backgroundColor: DS.lime }]}>
            <Icon name="camera-plus" size={24} color="#ffffff" />
          </View>
          <View style={s.choiceText}>
            <Text style={s.choiceTitle}>Upload Scorecard</Text>
            <Text style={s.choiceBlurb}>Screenshot your stats from another app and we'll extract them.</Text>
          </View>
          <Icon name="chevron-right" size={20} color={DS.lime} />
        </TouchableOpacity>

        <TouchableOpacity style={s.choice} activeOpacity={0.85} onPress={comingSoon}>
          <View style={[s.choiceIcon, { backgroundColor: DS.surfaceHighest }]}>
            <Icon name="link-variant" size={24} color={DS.textVariant} />
          </View>
          <View style={s.choiceText}>
            <Text style={s.choiceTitle}>Connect Platform</Text>
            <Text style={s.choiceBlurb}>Log in to CricHeroes, Crichq, etc. to sync directly. (Coming Soon)</Text>
          </View>
          <Icon name="lock-outline" size={20} color={DS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={s.choice} activeOpacity={0.85} onPress={comingSoon}>
          <View style={[s.choiceIcon, { backgroundColor: DS.surfaceHighest }]}>
            <Icon name="pencil-outline" size={24} color={DS.textVariant} />
          </View>
          <View style={s.choiceText}>
            <Text style={s.choiceTitle}>Enter Manually</Text>
            <Text style={s.choiceBlurb}>Type in your total runs, wickets, and matches played.</Text>
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12,
  },
  skip: { fontSize: 15, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.2 },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 10 },
  h1: { fontSize: 32, fontWeight: '900', color: DS.textPrimary, letterSpacing: -0.6, lineHeight: 38 },
  sub: { fontSize: 15, fontWeight: '600', color: DS.textMuted, marginTop: 12, lineHeight: 22, marginBottom: 32 },
  
  choice: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, marginBottom: 14,
    borderRadius: 20, backgroundColor: DS.surfaceHigh, borderWidth: 1.5, borderColor: DS.surfaceHighest || '#2a2f42',
  },
  choiceIcon: {
    width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  choiceText: { flex: 1 },
  choiceTitle: { fontSize: 16, fontWeight: '800', color: DS.textPrimary },
  choiceBlurb: { fontSize: 13, fontWeight: '600', color: DS.textMuted, marginTop: 4, lineHeight: 18 },
});
