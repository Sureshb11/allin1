import React, { useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Dimensions } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Reanimated, { FadeInDown, SlideInRight, ZoomIn } from 'react-native-reanimated';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { useHideTabBarOnScroll, useTabBarClearance } from '../components/AutoHideTabBar';
import AnimatedPressable from '../components/AnimatedPressable';
import AmbientBackground from '../components/AmbientBackground';
import { useCurrentUser } from '../utils/currentUser';

const { width } = Dimensions.get('window');

const SPOTLIGHT = { icon: 'cricket', label: 'My Matches', sub: 'View all matches', screen: 'MyMatches' };

const SECTIONS = [
  {
    title: 'Analyze',
    data: [
      { icon: 'chart-line', label: 'My Performance', sub: 'Batting & bowling', screen: 'MyPerformance' },
      { icon: 'video-outline', label: 'Highlights', sub: 'Watch & analyse', screen: 'VideoAnalysis' },
      { icon: 'chart-bar', label: 'Rankings', sub: 'Player & team boards', screen: 'Statistics' },
    ]
  },
  {
    title: 'Community',
    data: [
      { icon: 'account-group', label: 'My Teams', sub: 'Manage squads', screen: 'TeamManagement' },
      { icon: 'trophy', label: 'Tournaments', sub: 'Join & track', screen: 'Tournaments' },
      { icon: 'telescope', label: 'Looking For', sub: 'Find players & teams', screen: 'LookingFor' },
    ]
  },
  {
    title: 'More',
    data: [
      { icon: 'teach', label: 'Coaching', sub: 'Book a coach', screen: 'Coaching' },
    ]
  }
];

export default function MyCricketScreen({ navigation }) {
  const { colors: DS, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const hideTabBar = useHideTabBarOnScroll();
  const tabClear = useTabBarClearance();
  const user = useCurrentUser();
  const firstName = user?.name ? user.name.split(' ')[0] : 'Player';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />
      
      <View style={styles.hero}>
        <View style={styles.heroLeft}>
          <Text style={styles.heroGreeting}>Good {new Date().getHours() < 12 ? 'morning' : 'evening'},</Text>
          <Text style={styles.brandText}>{firstName}</Text>
        </View>
        <View style={styles.heroRight}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.navigate('Notification')}>
            <Icon name="bell-outline" size={24} color={DS.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.headerBtn, { paddingLeft: 12 }]} onPress={() => navigation.navigate('ProfileTab')}>
            <Icon name="account-circle-outline" size={26} color={DS.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} {...hideTabBar} contentContainerStyle={{ paddingBottom: tabClear }}>
        <View style={{ padding: 16 }}>
          {/* Spotlight Hero Card */}
          <Reanimated.View entering={FadeInDown.duration(400).springify().damping(14)}>
            <AnimatedPressable 
              style={styles.spotlightCard} 
              activeOpacity={0.8}
              onPress={() => navigation.navigate(SPOTLIGHT.screen)}>
              <AmbientBackground color={DS.lime} />
              <View style={styles.spotlightContent}>
                <View style={[styles.tileIconWrap, { backgroundColor: '#ffffff33', width: 52, height: 52, borderRadius: 16 }]}>
                  <Icon name={SPOTLIGHT.icon} size={28} color="#fff" />
                </View>
                <View style={styles.spotlightTextWrap}>
                  <Text style={styles.spotlightLabel}>{SPOTLIGHT.label}</Text>
                  <Text style={styles.spotlightSub}>{SPOTLIGHT.sub}</Text>
                </View>
                <Icon name="arrow-right-circle" size={28} color="#fff" style={{ opacity: 0.8 }} />
              </View>
            </AnimatedPressable>
          </Reanimated.View>

          {/* Categorized Sections */}
          {SECTIONS.map((section, sIndex) => (
            <Reanimated.View key={section.title} entering={FadeInDown.delay((sIndex + 1) * 100).duration(400).springify().damping(14)} style={{ marginTop: 24 }}>
              <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
              <View style={styles.grid}>
                {section.data.map((t) => (
                  <AnimatedPressable
                    key={t.screen}
                    style={styles.tile}
                    onPress={() => navigation.navigate(t.screen)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.tileShine} />
                    <View style={styles.tileTopRow}>
                      <View style={[styles.tileIconWrap, { backgroundColor: DS.lime + '22' }]}>
                        <Icon name={t.icon} size={24} color={DS.lime} />
                      </View>
                      <Icon name="arrow-top-right" size={18} color={DS.faint} />
                    </View>
                    <View style={styles.tileTextWrap}>
                      <Text style={styles.tileLabel}>{t.label}</Text>
                      <Text style={styles.tileSub}>{t.sub}</Text>
                    </View>
                  </AnimatedPressable>
                ))}
              </View>
            </Reanimated.View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  hero: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: DS.bg, paddingTop: 16, paddingBottom: 10, paddingHorizontal: 16,
  },
  heroLeft: { flexDirection: 'column', alignItems: 'flex-start' },
  heroGreeting: { fontSize: 13, fontWeight: '600', color: DS.textMuted, marginBottom: -2 },
  brandText: { fontSize: 24, fontWeight: '900', color: DS.textPrimary, letterSpacing: 0.5 },
  heroRight: { flexDirection: 'row', gap: 2, flexShrink: 0 },
  headerBtn: { padding: 6, flexShrink: 0 },
  
  spotlightCard: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: DS.border,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0f4c3a',
    padding: 20,
    minHeight: 110,
    justifyContent: 'center',
    shadowColor: DS.lime, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 6
  },
  spotlightContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    zIndex: 1,
  },
  spotlightTextWrap: { flex: 1, gap: 4 },
  spotlightLabel: { fontSize: 20, fontWeight: '800', color: '#fff' },
  spotlightSub: { fontSize: 13, color: '#ecfdf5', fontWeight: '500', opacity: 0.8 },

  sectionTitle: { fontSize: 11, fontWeight: '800', color: DS.textMuted, letterSpacing: 1.2, marginBottom: 12, paddingLeft: 4 },
  
  grid: { 
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    gap: 12 
  },
  tile: {
    width: '48%', 
    flexDirection: 'column', alignItems: 'flex-start',
    backgroundColor: DS.surface, borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: DS.border,
    overflow: 'hidden', position: 'relative',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1
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
