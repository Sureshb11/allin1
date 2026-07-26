import React, { useLayoutEffect, useState, useRef } from 'react';
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
import AppHeader from '../components/AppHeader';

const TABS = [
  { label: 'My Stats', icon: 'chart-line',  component: MyPerformanceScreen },
  { label: 'Rankings', icon: 'podium',      component: StatisticsScreen },
  { label: 'Scout',    icon: 'telescope',   component: LookingForScreen },
];

const { width: SCREEN_W } = Dimensions.get('window');
const TAB_W = SCREEN_W / TABS.length;
const N = TABS.length;
// One house spring (Reanimated): a quick, barely-overshooting settle shared by
// tap and swipe so both feel like the same material.
const SPRING = { damping: 28, stiffness: 220, mass: 1 };

// Per-tab primary action for the floating button. Rankings has no screen-local
// action, so it falls back to Go Live; My Stats and Scout register their own
// (share the stat card / open the post-a-listing sheet) via onRegisterFab.
const FAB_FOR = (DS) => [
  { icon: 'share-variant', label: 'Share Card',   bg: DS.lime, fg: DS.onLime },
  { icon: 'broadcast',     label: 'Live Action',  bg: DS.live, fg: DS.white },
  { icon: 'plus',          label: 'Post Listing', bg: DS.blue, fg: DS.white },
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
  const meUser = useCurrentUser();
  const tabClear = useTabBarClearance();

  // Land on the deep-linked tab if given, else the one we left on last time.
  const initialTab = resolveTab(route?.params?.tab) ?? lastPavilionTab ?? 0;
  const [activeTab, setActiveTab] = useState(initialTab);

  // Each child screen registers its FAB action here (keyed by tab index); the
  // shared button dispatches to the active tab's action, or Go Live if none.
  const fabActions = useRef({}).current;
  const registerFab = (i) => (fn) => { fabActions[i] = fn; };
  const FABS = FAB_FOR(DS);
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
  // Measured label widths so the underline hugs the actual word, not a fixed slot.
  const labelWRef = useRef([TAB_W * 0.42, TAB_W * 0.42, TAB_W * 0.42]);
  const labelW = useSharedValue(labelWRef.current);
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

  const onLabelLayout = (i) => (e) => {
    const w = e.nativeEvent.layout.width;
    if (!w) return;
    const a = labelWRef.current.slice();
    a[i] = w;
    labelWRef.current = a;
    labelW.value = a;
  };

  // Settle on a page via a tap: same spring, same detent + lazy-mount as a swipe.
  const goToTab = (index) => {
    const p = Math.max(0, Math.min(N - 1, index));
    settled.value = p;
    dragPage.value = p;
    tx.value = withSpring(-p * SCREEN_W, SPRING);
    commitTab(p);
  };

  const swipeGesture = Gesture.Pan()
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
    });

  const trackStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  // Elastic underline: rides the same `tx`, resizes to the active label's width,
  // and stretches slightly at mid-travel between two pages before snapping.
  const underlineStyle = useAnimatedStyle(() => {
    'worklet';
    let p = -tx.value / SCREEN_W;
    if (p < 0) p = 0; else if (p > N - 1) p = N - 1;
    const lo = Math.floor(p), hi = Math.ceil(p), f = p - lo;
    const ws = labelW.value;
    const wLo = ws[lo] || TAB_W * 0.42, wHi = ws[hi] || TAB_W * 0.42;
    const w = wLo + (wHi - wLo) * f;
    const cLo = lo * TAB_W + TAB_W / 2, cHi = hi * TAB_W + TAB_W / 2;
    const center = cLo + (cHi - cLo) * f;
    const stretch = lo === hi ? 1 : 1 + (1 - Math.abs(f - 0.5) * 2) * 0.3;
    return { width: w, transform: [{ translateX: center - w / 2 }, { scaleX: stretch }] };
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />

      {/* ── HEADER ──────────────────────── */}
      <AppHeader />

      {/* ── NAV TABS (elastic underline) ──────────────────────── */}
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
              <Text style={[styles.navTabText, isActive && styles.navTabTextActive]} onLayout={onLabelLayout(i)}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        {/* Sliding + stretching underline indicator */}
        <Animated.View style={[styles.underline, underlineStyle]} />
      </View>

      {/* ── CONTENT (finger-tracked pager: one wide row, translated) ──── */}
      <GestureDetector gesture={swipeGesture}>
        <View style={{ flex: 1, overflow: 'hidden' }}>
          <Animated.View style={[{ flex: 1, flexDirection: 'row', width: SCREEN_W * N }, trackStyle]}>
            {TABS.map((tab, i) => {
              const Comp = tab.component;
              return (
                <PagerPage key={tab.label} index={i} tx={tx}>
                  {visited[i] ? <Comp navigation={navigation} inline={true} route={route} onRegisterFab={registerFab(i)} /> : null}
                </PagerPage>
              );
            })}
          </Animated.View>
        </View>
      </GestureDetector>

      {/* ── FAB: primary action for the active tab ────────────────── */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: fab.bg, shadowColor: fab.bg, bottom: tabClear + 16 }]}
        onPress={() => {
          haptic.impact();
          const action = fabActions[activeTab];
          if (action) action();
          else navigation.navigate('StreamingLanding');
        }}
        activeOpacity={0.85}
      >
        <Icon name={fab.icon} size={20} color={fab.fg} />
        <Text style={[styles.fabText, { color: fab.fg }]}>{fab.label}</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },

  // Underline tab bar: flat row, a lime bar slides + stretches under the active
  // tab. Active state is carried by colour + the bar (bold text doesn't render in
  // the single-weight font, so it can't be the signal).
  navTabs: { flexDirection: 'row', paddingTop: 10, borderBottomWidth: 1, borderBottomColor: DS.line },
  navTab: { flexDirection: 'row', width: TAB_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, gap: 6 },
  navTabText: { fontSize: 12.5, fontWeight: '700', color: DS.textVariant, letterSpacing: 0.4 },
  navTabTextActive: { color: DS.lime },
  // Width + x offset come from the animated `underlineStyle` (measured label
  // width), so it hugs the word and rides the finger during a swipe.
  underline: { position: 'absolute', bottom: -1, left: 0, height: 3, backgroundColor: DS.lime, borderRadius: 2 },

  // Colour, label and `bottom` (dock clearance) are applied inline per active
  // tab; this holds only the shared shape.
  fab: {
    position: 'absolute',
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 28,
    gap: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});
