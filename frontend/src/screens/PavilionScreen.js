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
  // ── Finger-tracked pager, no ScrollView anywhere in the pager itself. ──
  // The three pages sit in one 3×-wide row moved by a single native-driven
  // translateX (`tx`). A Pan gesture drags the row 1:1 under the finger and a
  // spring settles it on release; the underline is an interpolation of the SAME
  // value, so it glides with the finger instead of jumping after the fact.
  // Why not a horizontal ScrollView: it must fight the pages' inner vertical
  // lists for the gesture and loses over list content. With a Pan, failOffsetY
  // hands vertical drags to the lists and there's nothing left to fight.
  const tx = useRef(new Animated.Value(0)).current;         // row translateX: 0 … -(N-1)·W
  const settledPage = useRef(0);                            // page the row last settled on
  const dragPage = useRef(0);                               // page under the finger mid-drag
  const [visited, setVisited] = useState({ 0: true, 1: true });

  const markVisited = (i) => setVisited((v) => ({ ...v, [i - 1]: true, [i]: true, [i + 1]: true }));

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
      headerTitle: 'Pavilion',
    });
  }, [navigation]);

  // Settle on a page (tap or swipe release): quick spring, labels + lazy-mount.
  const goToTab = (index) => {
    const p = Math.max(0, Math.min(TABS.length - 1, index));
    settledPage.current = p;
    dragPage.current = p;
    setActiveTab(p);
    markVisited(p);
    Animated.spring(tx, {
      toValue: -p * SCREEN_W,
      useNativeDriver: true,
      stiffness: 220, damping: 28, mass: 1,
    }).start();
  };

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-16, 16])   // claim a horizontal drag early, so it beats a card's tap
    .failOffsetY([-14, 14])     // but yield to a vertical drag first, so lists still scroll
    .onBegin(() => { tx.stopAnimation(); })
    .onUpdate((e) => {
      let v = -settledPage.current * SCREEN_W + e.translationX;
      // Rubber-band past either end instead of a hard stop.
      const min = -(TABS.length - 1) * SCREEN_W;
      if (v > 0) v = v * 0.3;
      else if (v < min) v = min + (v - min) * 0.3;
      tx.setValue(v);
      // Light the tab label as the finger crosses each page's centre.
      const cur = Math.max(0, Math.min(TABS.length - 1, Math.round(-v / SCREEN_W)));
      if (cur !== dragPage.current) { dragPage.current = cur; setActiveTab(cur); markVisited(cur); }
    })
    .onEnd((e) => {
      const raw = -settledPage.current * SCREEN_W + e.translationX;
      let target = Math.round(-raw / SCREEN_W);
      // A committed fling always moves at least one page in its direction.
      if (e.velocityX <= -450) target = Math.max(target, settledPage.current + 1);
      else if (e.velocityX >= 450) target = Math.min(target, settledPage.current - 1);
      goToTab(target);
    });

  // Underline: a short centred bar riding the same animated value as the pages.
  const underlineX = tx.interpolate({
    inputRange: [-(TABS.length - 1) * SCREEN_W, 0],
    outputRange: [(TABS.length - 1) * TAB_W + TAB_W * 0.25, TAB_W * 0.25],
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

      {/* ── CONTENT (finger-tracked pager: one wide row, translated) ──── */}
      <GestureDetector gesture={swipeGesture}>
        <View style={{ flex: 1, overflow: 'hidden' }}>
          <Animated.View style={{ flex: 1, flexDirection: 'row', width: SCREEN_W * TABS.length, transform: [{ translateX: tx }] }}>
            {TABS.map((tab, i) => {
              const Comp = tab.component;
              return (
                <View key={tab.label} style={{ width: SCREEN_W }}>
                  {visited[i] ? <Comp navigation={navigation} inline={true} route={route} /> : null}
                </View>
              );
            })}
          </Animated.View>
        </View>
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
  // Short centred bar (half a tab wide) — its x offset comes from the pager
  // interpolation, so it rides the finger during a swipe.
  underline: { position: 'absolute', bottom: -1, left: 0, height: 3, width: TAB_W * 0.5, backgroundColor: DS.lime, borderRadius: 2 },
  
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
