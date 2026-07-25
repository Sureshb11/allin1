import React, { useLayoutEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Animated, Image, Dimensions } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

import MyPerformanceScreen from './MyPerformanceScreen';
import StatisticsScreen from './StatisticsScreen';
import LookingForScreen from './LookingForScreen';
import { useCurrentUser } from '../utils/currentUser';
import AppHeader from '../components/AppHeader';

const TABS = [
  { label: 'My Stats', icon: 'chart-line',  component: MyPerformanceScreen },
  { label: 'Rankings', icon: 'podium',      component: StatisticsScreen },
  { label: 'Scout',    icon: 'telescope',   component: LookingForScreen },
];

const { width: SCREEN_W } = Dimensions.get('window');
const TAB_W = SCREEN_W / TABS.length;

export default function PavilionScreen({ navigation, route }) {
  const { colors: DS, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const meUser = useCurrentUser();

  const [activeTab, setActiveTab] = useState(0);
  // Pager: the pages live in a horizontal ScrollView driven programmatically (user
  // scroll disabled); scrollX drives the sliding underline. A "visited" set
  // lazy-mounts each tab's full-screen content once reached (+ its neighbour).
  const pagerRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [visited, setVisited] = useState({ 0: true, 1: true });

  const markVisited = (i) => setVisited((v) => ({ ...v, [i - 1]: true, [i]: true, [i + 1]: true }));

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
      headerTitle: 'Pavilion',
    });
  }, [navigation]);

  // Tap or swipe → animate the page across; the underline follows via scrollX.
  const goToTab = (index) => {
    const clamped = Math.max(0, Math.min(TABS.length - 1, index));
    pagerRef.current?.scrollTo?.({ x: clamped * SCREEN_W, animated: true });
    setActiveTab(clamped);
    markVisited(clamped);
  };

  // Horizontal swipe via gesture-handler — NOT the ScrollView's own scroll. A plain
  // horizontal ScrollView loses the gesture to the pages' inner vertical lists over
  // list content; a Pan with failOffsetY lets vertical drags fall through to those
  // lists and claims only clearly-horizontal ones, so a swipe pages the tab
  // reliably anywhere. Recreated each render so it reads the current activeTab.
  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-16, 16])
    .onEnd((e) => {
      const goNext = e.translationX <= -60 || e.velocityX <= -450;
      const goPrev = e.translationX >= 60 || e.velocityX >= 450;
      if (goNext && activeTab < TABS.length - 1) goToTab(activeTab + 1);
      else if (goPrev && activeTab > 0) goToTab(activeTab - 1);
    });

  // The underline slides continuously with the swipe.
  const underlineX = scrollX.interpolate({
    inputRange: [0, (TABS.length - 1) * SCREEN_W],
    outputRange: [0, (TABS.length - 1) * TAB_W],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />
      
      {/* ── HEADER ──────────────────────── */}
      <AppHeader />

      {/* ── NAV TABS (underline) ──────────────────────── */}
      <View style={styles.navTabs}>
        {TABS.map((tab, i) => {
          const isActive = activeTab === i;
          return (
            <TouchableOpacity
              key={tab.label}
              style={styles.navTab}
              onPress={() => goToTab(i)}
              activeOpacity={0.7}
            >
              <Icon name={tab.icon} size={17} color={isActive ? DS.lime : DS.textVariant} />
              <Text style={[styles.navTabText, isActive && styles.navTabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        {/* Sliding underline indicator */}
        <Animated.View style={[styles.underline, { transform: [{ translateX: underlineX }] }]} />
      </View>

      {/* ── CONTENT (horizontal swipe pager) ──────────────────────────── */}
      <GestureDetector gesture={swipeGesture}>
        <Animated.ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: true },
          )}
          style={{ flex: 1 }}
        >
          {TABS.map((tab, i) => {
            const Comp = tab.component;
            return (
              <View key={tab.label} style={{ width: SCREEN_W }}>
                {visited[i] ? <Comp navigation={navigation} inline={true} route={route} /> : null}
              </View>
            );
          })}
        </Animated.ScrollView>
      </GestureDetector>

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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: DS.surfaceLow, paddingTop: 16, paddingBottom: 10, paddingHorizontal: 16,
  },
  heroLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandText: { fontSize: 20, fontWeight: '800', color: DS.textPrimary, letterSpacing: 1.5 },
  brandBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: DS.lime, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  brandBadgeText: { fontSize: 13, fontWeight: '800', color: DS.bg, letterSpacing: 0.8 },
  heroRight: { flexDirection: 'row', alignItems: 'center' },
  
  // Underline tab bar: flat row, a lime bar slides under the active tab. Active
  // state is carried by colour + the bar (bold text doesn't render in the single-
  // weight font, so it can't be the signal).
  navTabs: { flexDirection: 'row', paddingTop: 10, borderBottomWidth: 1, borderBottomColor: DS.line },
  navTab: { flexDirection: 'row', width: TAB_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, gap: 6 },
  navTabText: { fontSize: 12.5, fontWeight: '700', color: DS.textVariant, letterSpacing: 0.4 },
  navTabTextActive: { color: DS.lime },
  underline: { position: 'absolute', bottom: -1, left: 0, height: 2.5, width: TAB_W, backgroundColor: DS.lime, borderRadius: 2 },
  
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
