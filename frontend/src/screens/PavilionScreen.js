import React, { useLayoutEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Animated, Image, Dimensions } from 'react-native';
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
  // Horizontal swipe pager (same proven shape as ScorecardScreen's tabs): scrollX
  // drives the sliding underline natively; a "visited" set lazy-mounts each tab's
  // full-screen content once reached (+ its neighbour), so the three don't all
  // fetch on first paint but a swipe target is never blank.
  const pagerRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const swipingRef = useRef(false);   // true only during a finger drag, so a tap's
                                      // programmatic scroll isn't read back as a swipe
  const [visited, setVisited] = useState({ 0: true, 1: true });

  const markVisited = (i) => setVisited((v) => ({ ...v, [i - 1]: true, [i]: true, [i + 1]: true }));

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
      headerTitle: 'Pavilion',
    });
  }, [navigation]);

  // Tap → animate the page across; the underline follows via scrollX. State is set
  // here because a programmatic scroll doesn't fire onMomentumScrollEnd.
  const goToTab = (index) => {
    pagerRef.current?.scrollTo?.({ x: index * SCREEN_W, animated: true });
    setActiveTab(index);
    markVisited(index);
  };

  // Swipe → track the active tab live as the finger passes each page centre, and
  // finalise on settle. Guarded by swipingRef so the tap path doesn't double-fire.
  const onPagerScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: true, listener: (e) => {
        if (!swipingRef.current) return;
        const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
        if (i !== activeTab) { setActiveTab(i); markVisited(i); }
      } },
  );
  const onPagerSettle = (e) => {
    swipingRef.current = false;
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (i !== activeTab) setActiveTab(i);
    markVisited(i);
  };

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
      <Animated.ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        contentOffset={{ x: activeTab * SCREEN_W, y: 0 }}
        onScrollBeginDrag={() => { swipingRef.current = true; }}
        onScroll={onPagerScroll}
        onScrollEndDrag={() => { swipingRef.current = false; }}
        onMomentumScrollEnd={onPagerSettle}
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
