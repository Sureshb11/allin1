import React, { useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

const PAVILION_ITEMS = [
  { label: 'My Performance', icon: 'chart-line',           screen: 'MyPerformance',    color: '#22c55e' },
  { label: 'Leaderboard',    icon: 'podium',               screen: 'Statistics',       color: '#a855f7' },
  { label: 'Awards & Badges',icon: 'trophy-variant',       screen: 'BadgeDetail',      color: '#f59e0b' },
  { label: 'Challenges',     icon: 'target',               screen: 'Quiz',             color: '#ef4444' },
  { label: 'Go Live',        icon: 'broadcast',            screen: 'StreamingLanding', color: '#EF4444' },
  { label: 'Looking For',    icon: 'telescope',            screen: 'LookingFor',       color: '#6366F1' },
];

export default function PavilionScreen({ navigation }) {
  const { colors: DS, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: 'Pavilion',
    });
  }, [navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />
      
      <View style={styles.hero}>
        <Icon name="stadium" size={24} color={DS.lime} />
        <Text style={styles.heroTitle}>Pavilion</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.grid}>
          {PAVILION_ITEMS.map(t => {
            return (
            <TouchableOpacity
              key={t.screen}
              style={styles.tile}
              onPress={() => navigation.navigate(t.screen)}
              activeOpacity={0.82}
            >
              <View style={[styles.tileIconWrap, { backgroundColor: t.color + '22' }]}>
                <Icon name={t.icon} size={26} color={t.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tileLabel}>{t.label}</Text>
              </View>
              <Icon name="chevron-right" size={18} color={DS.faint} />
            </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 20, paddingHorizontal: 20,
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: DS.textPrimary },
  content: { padding: 16 },
  grid: { gap: 12 },
  tile: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16,
  },
  tileIconWrap: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: 16, fontWeight: '700', color: DS.textPrimary },
});
