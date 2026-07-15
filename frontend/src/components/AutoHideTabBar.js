// Scroll-aware bottom tab bar: slides down out of view when the user scrolls
// down, springs back when they scroll up (or reach the top / switch tabs).
//
// Usage:
//   1. Wrap the Tab.Navigator in <TabBarVisibilityProvider>.
//   2. Pass tabBar={(props) => <AutoHideTabBar {...props} />} to the navigator.
//   3. In each scrollable screen, spread useHideTabBarOnScroll() onto the
//      ScrollView/FlatList (composes with an existing onScroll via combineScroll).
import React, { createContext, useContext, useRef, useCallback, useEffect } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { BottomTabBar, BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';

const Ctx = createContext(null);

export const TabBarVisibilityProvider = ({ children }) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const barHeight = useRef(90);   // updated from the bar's real height on layout
  const shown = useRef(true);
  const lastY = useRef(0);
  const locked = useRef(false);   // spectator mode: dock held hidden, scroll can't reveal

  const animateTo = useCallback((show, force = false) => {
    if (locked.current && show && !force) return;   // stay hidden while locked
    if (shown.current === show) return;
    shown.current = show;
    Animated.timing(translateY, {
      // +44 clears the dock ball's overhang (it floats above the capsule via a
      // negative margin, which layout — and so barHeight — doesn't include).
      toValue: show ? 0 : barHeight.current + 44,
      duration: show ? 260 : 600,   // slide-away is the slow, cinematic one (spec: 600-800ms)
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  // Direction-based: scrolling down hides, up reveals. Small jitters ignored;
  // at/above the top the bar is always shown.
  const onScroll = useCallback((e) => {
    const y = e?.nativeEvent?.contentOffset?.y ?? 0;
    if (y <= 0) { animateTo(true); lastY.current = y; return; }
    const dy = y - lastY.current;
    if (Math.abs(dy) > 8) {
      animateTo(dy < 0);
      lastY.current = y;
    }
  }, [animateTo]);

  const setBarHeight = useCallback((h) => { if (h) barHeight.current = h; }, []);
  const reveal = useCallback(() => animateTo(true), [animateTo]);

  // Live spectator mode: lock the dock away / release it back.
  const lockHidden = useCallback((lock) => {
    locked.current = lock;
    animateTo(!lock, true);
  }, [animateTo]);

  return (
    <Ctx.Provider value={{ translateY, onScroll, setBarHeight, reveal, lockHidden }}>
      {children}
    </Ctx.Provider>
  );
};

// Spread onto a ScrollView/FlatList: { onScroll, scrollEventThrottle }.
export const useHideTabBarOnScroll = () => {
  const ctx = useContext(Ctx);
  if (!ctx) return {};
  return { onScroll: ctx.onScroll, scrollEventThrottle: 16 };
};

// The tab bar floats over content (so it can fully slide away and reclaim the
// space). Pad the bottom of scrollable content by this so the last items aren't
// stuck behind the bar while it's shown. Returns the bar's real height (0 if
// outside a tab navigator).
export const useTabBarClearance = () => useContext(BottomTabBarHeightContext) || 0;

// Force the bar back into view (e.g. from a tabPress listener).
export const useTabBarReveal = () => useContext(Ctx)?.reveal || (() => {});

// Live spectator mode: lockDock(true) slides the dock away (600ms) and keeps
// it hidden — scrolling can't reveal it — until lockDock(false).
export const useDockLock = () => useContext(Ctx)?.lockHidden || (() => {});

// Merge the auto-hide handler with a screen's own onScroll (e.g. an
// Animated.event) so both run on every scroll frame.
export const combineScroll = (hideProps, ownOnScroll) => ({
  scrollEventThrottle: 16,
  onScroll: (e) => { hideProps.onScroll?.(e); ownOnScroll?.(e); },
});

// Pass `render` to draw a custom bar (e.g. the GlassDock) inside the same
// auto-hiding shell; without it the stock BottomTabBar renders.
export const AutoHideTabBar = ({ render, ...props }) => {
  const ctx = useContext(Ctx);
  const translateY = ctx?.translateY;

  // Always show the bar again when the active tab changes.
  const idx = props.state.index;
  const prevIdx = useRef(idx);
  useEffect(() => {
    if (prevIdx.current !== idx) { prevIdx.current = idx; ctx?.reveal(); }
  }, [idx, ctx]);

  // Absolutely positioned so it doesn't reserve a layout slot — when it slides
  // down the scene fills the space instead of leaving a blank bar behind.
  return (
    <Animated.View
      onLayout={(e) => ctx?.setBarHeight(e.nativeEvent.layout.height)}
      style={[
        styles.floatingBar,
        { transform: translateY ? [{ translateY }] : [] },
      ]}
    >
      {render ? render(props) : <BottomTabBar {...props} />}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  floatingBar: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
