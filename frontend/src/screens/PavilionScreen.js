import React, { useLayoutEffect, useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Dimensions } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, cancelAnimation, runOnJS } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

import MyPerformanceScreen from './MyPerformanceScreen';
import StatisticsScreen from './StatisticsScreen';
import LookingForScreen from './LookingForScreen';
import { useCurrentUser } from '../utils/currentUser';
import { useTabBarClearance } from '../components/AutoHideTabBar';
import { haptic } from '../utils/haptics';
import { pav } from '../theme/pavilion';
import AppHeader from '../components/AppHeader';

const TABS = [
  { label: 'My Stats', icon: 'chart-line',  component: MyPerformanceScreen },
  { label: 'Rankings', icon: 'podium',      component: StatisticsScreen },
  { label: 'Scout',    icon: 'telescope',   component: LookingForScreen },
];

const { width: SCREEN_W } = Dimensions.get('window');
const N = TABS.length;
// One house spring (Reanimated): a quick, barely-overshooting settle shared by
// tap and swipe so both feel like the same material.
const SPRING = { damping: 28, stiffness: 220, mass: 1 };

// Per-tab primary action for the floating button. All share the near-black
// control fill; the icon carries the accent (lime, or the live-red on Rankings'
// Go Live). Rankings has no screen-local action → falls back to Go Live; My Stats
// and Scout register their own (share the stat card / open the post sheet).
const FAB_FOR = (P) => [
  { icon: 'share-variant', label: 'Share Card',   accent: P.accent },
  { icon: 'broadcast',     label: 'Live Action',  accent: P.live },
  { icon: 'plus',          label: 'Post Listing', accent: P.accent },
];

// Remembered across mounts so re-entering the clubhouse lands where you left it
// (a route `tab` param — index or label — still wins for deep links).
let lastPavilionTab = 0;

const resolveTab = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return Math.max(0, Math.min(N - 1, v));
  const i = TABS.findIndex((t) => t.label.toLowerCase() === String(v).toLowerCase());
  return i >= 0 ? i : null;
};

// One page of the pager. Owns its own animated style so the off-screen dim/scale
// runs on the UI thread off the shared drag value — no per-frame JS.
function PagerPage({ index, tx, children }) {
  const style = useAnimatedStyle(() => {
    'worklet';
    let d = Math.abs(index - (-tx.value / SCREEN_W));
    if (d > 1) d = 1;
    return { opacity: 1 - d * 0.6, transform: [{ scale: 1 - d * 0.06 }] };
  });
  return <Animated.View style={[{ width: SCREEN_W }, style]}>{children}</Animated.View>;
}

export default function PavilionScreen({ navigation, route }) {
  const { colors: DS, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const P = pav(DS);
  const meUser = useCurrentUser();
  const tabClear = useTabBarClearance();

  // Land on the deep-linked tab if given, else the one we left on last time.
  const initialTab = resolveTab(route?.params?.tab) ?? lastPavilionTab ?? 0;
  const [activeTab, setActiveTab] = useState(initialTab);

  // Each child screen registers its FAB action here (keyed by tab index); the
  // shared button dispatches to the active tab's action, or Go Live if none.
  const fabActions = useRef({}).current;
  const registerFab = (i) => (fn) => { fabActions[i] = fn; };
  const FABS = FAB_FOR(P);
  const fab = FABS[activeTab] || FABS[0];

  // ── Reanimated finger-tracked pager (no ScrollView anywhere in the pager). ──
  // Three pages sit in one N×-wide row moved by a single UI-thread shared value
  // `tx`. A Pan gesture (worklet) drags the row 1:1 and a spring settles it; the
  // underline and every page's dim/scale read the SAME `tx`, so nothing lags the
  // finger. failOffsetY hands vertical drags to the inner lists, so the pager and
  // the lists never fight for the gesture.
  const tx = useSharedValue(-initialTab * SCREEN_W);   // row translateX: 0 … -(N-1)·W
  const settled = useSharedValue(initialTab);          // page the row last settled on
  const dragPage = useSharedValue(initialTab);         // page under the finger mid-drag
  const [visited, setVisited] = useState({ [initialTab]: true, [initialTab + 1]: true, [Math.max(0, initialTab - 1)]: true });

  const markVisited = (i) => setVisited((v) => ({ ...v, [i - 1]: true, [i]: true, [i + 1]: true }));

  // Update React state + fire ONE light haptic detent per distinct page, however
  // it was reached (crossed mid-drag, tapped, or flung).
  const lastAnnounced = useRef(initialTab);
  const announceTab = (page) => {
    setActiveTab(page);
    markVisited(page);
    if (page !== lastAnnounced.current) { lastAnnounced.current = page; haptic.tick(); }
  };
  const commitTab = (page) => { lastPavilionTab = page; announceTab(page); };

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false, headerTitle: 'Pavilion' });
  }, [navigation]);

  // Settle on a page via a tap: same spring, same detent + lazy-mount as a swipe.
  const goToTab = (index) => {
    const p = Math.max(0, Math.min(N - 1, index));
    settled.value = p;
    dragPage.value = p;
    tx.value = withSpring(-p * SCREEN_W, SPRING);
    commitTab(p);
  };

  // Memoised so its identity is stable across renders — child screens with their
  // own horizontal drag (Scout's filter row) reference it to block the pager.
  const swipeGesture = useMemo(() => Gesture.Pan()
    .activeOffsetX([-16, 16])   // claim a horizontal drag early, so it beats a card's tap
    .failOffsetY([-14, 14])     // but yield to a vertical drag first, so lists still scroll
    .onBegin(() => { cancelAnimation(tx); })
    .onUpdate((e) => {
      let v = -settled.value * SCREEN_W + e.translationX;
      // Rubber-band past either end instead of a hard stop.
      const min = -(N - 1) * SCREEN_W;
      if (v > 0) v = v * 0.3;
      else if (v < min) v = min + (v - min) * 0.3;
      tx.value = v;
      // Light the tab label + tick as the finger crosses each page's centre.
      let cur = Math.round(-v / SCREEN_W);
      if (cur < 0) cur = 0; else if (cur > N - 1) cur = N - 1;
      if (cur !== dragPage.value) { dragPage.value = cur; runOnJS(announceTab)(cur); }
    })
    .onEnd((e) => {
      const raw = -settled.value * SCREEN_W + e.translationX;
      let target = Math.round(-raw / SCREEN_W);
      // A committed fling always moves at least one page in its direction.
      if (e.velocityX <= -450) target = Math.max(target, settled.value + 1);
      else if (e.velocityX >= 450) target = Math.min(target, settled.value - 1);
      if (target < 0) target = 0; else if (target > N - 1) target = N - 1;
      settled.value = target;
      dragPage.value = target;
      tx.value = withSpring(-target * SCREEN_W, SPRING);
      runOnJS(commitTab)(target);
    }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const trackStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />

      {/* ── HEADER ──────────────────────── */}
      <AppHeader />

      {/* ── L1 NAV (separate pills; active = green + icon) ──────────── */}
      <View style={styles.navRow}>
        {TABS.map((tab, i) => {
          const isActive = activeTab === i;
          return (
            <TouchableOpacity
              key={tab.label}
              style={[styles.navPill, { backgroundColor: isActive ? DS.lime : DS.surfaceHigh }]}
              onPress={() => goToTab(i)}
              activeOpacity={0.85}
            >
              {isActive && <Icon name={tab.icon} size={15} color={DS.onLime} />}
              <Text style={[styles.navPillText, { color: isActive ? DS.onLime : DS.textMuted }]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── CONTENT (finger-tracked pager: one wide row, translated) ──── */}
      <GestureDetector gesture={swipeGesture}>
        <View style={{ flex: 1, overflow: 'hidden' }}>
          <Animated.View style={[{ flex: 1, flexDirection: 'row', width: SCREEN_W * N }, trackStyle]}>
            {TABS.map((tab, i) => {
              const Comp = tab.component;
              return (
                <PagerPage key={tab.label} index={i} tx={tx}>
                  {visited[i] ? <Comp navigation={navigation} inline={true} route={route} onRegisterFab={registerFab(i)} pagerGesture={swipeGesture} /> : null}
                </PagerPage>
              );
            })}
          </Animated.View>
        </View>
      </GestureDetector>

      {/* ── FAB: green primary action, label per active tab ─────── */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: DS.lime, bottom: tabClear + 16 }]}
        onPress={() => {
          haptic.impact();
          const action = fabActions[activeTab];
          if (action) action();
          else navigation.navigate('StreamingLanding');
        }}
        activeOpacity={0.85}
      >
        <Icon name={fab.icon} size={20} color={DS.onLime} />
        <Text style={[styles.fabText, { color: DS.onLime }]}>{fab.label}</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },

  // L1 nav: three separate rounded pills. Inactive = grey, text-only; active =
  // green with its icon (matches the reference's single filled tab).
  navRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  navPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999 },
  navPillText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },

  // Green primary; a rounded rectangle (not a full pill). `bottom` is dock clearance.
  fab: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 22,
    borderRadius: 18,
    gap: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 8,
  },
  fabText: {
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});
