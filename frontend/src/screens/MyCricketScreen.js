import React, { useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Dimensions } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Svg, { Defs, RadialGradient, Stop, Rect, Circle } from 'react-native-svg';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { useHideTabBarOnScroll } from '../components/AutoHideTabBar';

const { width } = Dimensions.get('window');

// Single-accent launcher: every tile uses the green accent (resolved from the
// theme via the 'lime' keyword) instead of a rainbow of per-tile hues.
const TILES = [
  { icon: 'cricket',       label: 'My Matches',   sub: 'View all matches',        screen: 'MyMatches',      color: 'lime' },
  { icon: 'trophy',        label: 'Tournaments',   sub: 'Join & track',            screen: 'Tournaments',    color: 'lime' },
  { icon: 'account-group', label: 'My Teams',      sub: 'Manage squads',           screen: 'TeamManagement', color: 'lime' },
  { icon: 'chart-bar',     label: 'Statistics',    sub: 'Player & team stats',     screen: 'Statistics',     color: 'lime' },
  { icon: 'video-outline', label: 'Highlights',    sub: 'Watch & analyse',         screen: 'VideoAnalysis',  color: 'lime' },
  { icon: 'chart-line',    label: 'My Performance',sub: 'Batting & bowling',       screen: 'MyPerformance',  color: 'lime' },
  { icon: 'telescope',     label: 'Looking For',   sub: 'Find players & teams',    screen: 'LookingFor',     color: 'lime' },
  { icon: 'teach',         label: 'Coaching',      sub: 'Book a coach',            screen: 'Coaching',       color: 'lime' },
];

export default function MyCricketScreen({ navigation }) {
  const { colors: DS, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const hideTabBar = useHideTabBarOnScroll();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />
      <View style={styles.hero}>
        {/* Abstract SVG Background */}
        <View style={StyleSheet.absoluteFill}>
          <Svg height="100%" width="100%" style={{ opacity: 0.15 }}>
            <Defs>
              <RadialGradient id="grad1" cx="20%" cy="0%" r="80%" fx="20%" fy="0%">
                <Stop offset="0%" stopColor={DS.lime} stopOpacity="1" />
                <Stop offset="100%" stopColor={DS.lime} stopOpacity="0" />
              </RadialGradient>
              <RadialGradient id="grad2" cx="100%" cy="100%" r="60%" fx="100%" fy="100%">
                <Stop offset="0%" stopColor={DS.lime} stopOpacity="1" />
                <Stop offset="100%" stopColor={DS.lime} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#grad1)" />
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#grad2)" />
          </Svg>
        </View>

        <View style={styles.heroLeft}>
          <Text style={styles.brandText}>EXPLORE</Text>
        </View>
        <View style={styles.heroRight}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.navigate('Notification')}>
            <Icon name="bell-outline" size={22} color={DS.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.headerBtn, { paddingLeft: 10 }]} onPress={() => navigation.navigate('Profile')}>
            <Icon name="account-circle-outline" size={22} color={DS.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} {...hideTabBar}>
        <View style={styles.grid}>
          {TILES.map(t => {
            const color = t.color === 'lime' ? DS.lime : t.color;
            return (
            <TouchableOpacity
              key={t.screen}
              style={styles.tile}
              onPress={() => navigation.navigate(t.screen)}
              activeOpacity={0.82}
            >
              <View style={styles.tileShine} />
              <View style={styles.tileTopRow}>
                <View style={[styles.tileIconWrap, { backgroundColor: color + '22' }]}>
                  <Icon name={t.icon} size={24} color={color} />
                </View>
                <Icon name="arrow-top-right" size={18} color={DS.faint} />
              </View>
              <View style={styles.tileTextWrap}>
                <Text style={styles.tileLabel}>{t.label}</Text>
                <Text style={styles.tileSub}>{t.sub}</Text>
              </View>
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: DS.surfaceLow, paddingTop: 16, paddingBottom: 10, paddingHorizontal: 16,
    overflow: 'hidden', position: 'relative',
  },
  heroLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandText: { fontSize: 22, fontWeight: '900', color: DS.textPrimary, letterSpacing: 2 },
  heroRight: { flexDirection: 'row', gap: 2, flexShrink: 0 },
  headerBtn: { padding: 6, flexShrink: 0 },
  grid: { 
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    padding: 16, gap: 12 
  },
  tile: {
    width: '48%', 
    flexDirection: 'column', alignItems: 'flex-start',
    backgroundColor: DS.surface, borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: DS.border,
    overflow: 'hidden', position: 'relative',
  },
  tileShine: {
    position: 'absolute', top: -50, right: -50, width: 100, height: 200,
    backgroundColor: DS.surfaceHigh, transform: [{ rotate: '45deg' }],
  },
  tileTopRow: {
    width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 16,
  },
  tileIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tileTextWrap: { gap: 4 },
  tileLabel: { fontSize: 14, fontWeight: '800', color: DS.textPrimary },
  tileSub: { fontSize: 11, color: DS.textMuted, lineHeight: 14 },
});
