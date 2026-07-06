import React, { useLayoutEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

import MyPerformanceScreen from './MyPerformanceScreen';
import StatisticsScreen from './StatisticsScreen';
import LookingForScreen from './LookingForScreen';

const TABS = [
  { label: 'My Stats', icon: 'chart-line',  component: MyPerformanceScreen },
  { label: 'Rankings', icon: 'podium',      component: StatisticsScreen },
  { label: 'Scout',    icon: 'telescope',   component: LookingForScreen },
];

export default function PavilionScreen({ navigation, route }) {
  const { colors: DS, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [activeTab, setActiveTab] = useState(0);
  const contentAnim = useRef(new Animated.Value(1)).current;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
      headerTitle: 'Pavilion',
    });
  }, [navigation]);

  const handleTabPress = (index) => {
    if (index === activeTab) return;
    Animated.timing(contentAnim, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true,
    }).start(() => {
      setActiveTab(index);
      Animated.timing(contentAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    });
  };

  const ActiveComponent = TABS[activeTab].component;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />
      
      {/* ── HEADER ──────────────────────── */}
      <View style={styles.hero}>
        <Icon name="stadium" size={24} color={DS.lime} />
        <Text style={styles.heroTitle}>Pavilion</Text>
      </View>

      {/* ── NAV TABS ──────────────────────── */}
      <View style={styles.navTabs}>
        {TABS.map((tab, i) => {
          const isActive = activeTab === i;
          return (
            <TouchableOpacity
              key={tab.label}
              style={[styles.navTab, isActive && styles.navTabActive]}
              onPress={() => handleTabPress(i)}
              activeOpacity={0.8}
            >
              <Icon name={tab.icon} size={18} color={isActive ? DS.bg : DS.textMuted} />
              <Text style={[styles.navTabText, isActive && styles.navTabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── CONTENT ──────────────────────────── */}
      <Animated.View style={[{ flex: 1 }, { opacity: contentAnim }]}>
        <ActiveComponent navigation={navigation} inline={true} route={route} />
      </Animated.View>

      {/* ── FAB for Go Live ────────────────── */}
      <TouchableOpacity 
        style={styles.fab}
        onPress={() => navigation.navigate('StreamingLanding')}
        activeOpacity={0.85}
      >
        <Icon name="broadcast" size={20} color={DS.bg} />
        <Text style={styles.fabText}>Live Action</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: DS.surfaceLow, paddingTop: 16, paddingBottom: 16, paddingHorizontal: 20,
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: DS.textPrimary },
  
  navTabs: {
    flexDirection: 'row',
    backgroundColor: DS.surfaceLow,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: DS.surfaceHigh,
    gap: 8,
  },
  navTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: DS.surfaceHigh,
    borderRadius: 12,
    gap: 6,
  },
  navTabActive: {
    backgroundColor: DS.lime,
  },
  navTabText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: DS.textMuted,
    letterSpacing: 0.2,
  },
  navTabTextActive: {
    color: DS.bg,
  },
  
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 28,
    gap: 8,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    color: DS.bg,
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});
