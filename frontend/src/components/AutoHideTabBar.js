// Scroll-aware bottom tab bar: slides down out of view when the user scrolls
// down, springs back when they scroll up (or reach the top / switch tabs).
//
// Usage:
//   1. Wrap the Tab.Navigator in <TabBarVisibilityProvider>.
//   2. Pass tabBar={(props) => <AutoHideTabBar {...props} />} to the navigator.
//   3. In each scrollable screen, spread useHideTabBarOnScroll() onto the
//      ScrollView/FlatList (composes with an existing onScroll via combineScroll).
import React, { createContext, useContext, useRef, useCallback, useEffect } from 'react';
import { Animated } from 'react-native';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { useTheme } from '../theme/ThemeContext';

const Ctx = createContext(null);

export const TabBarVisibilityProvider = ({ children }) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const barHeight = useRef(90);   // updated from the bar's real height on layout
  const shown = useRef(true);
  const lastY = useRef(0);

  const animateTo = useCallback((show) => {
    if (shown.current === show) return;
    shown.current = show;
    Animated.timing(translateY, {
      toValue: show ? 0 : barHeight.current,
      duration: 220,
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

  return (
    <Ctx.Provider value={{ translateY, onScroll, setBarHeight, reveal }}>
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

// Force the bar back into view (e.g. from a tabPress listener).
export const useTabBarReveal = () => useContext(Ctx)?.reveal || (() => {});

// Merge the auto-hide handler with a screen's own onScroll (e.g. an
// Animated.event) so both run on every scroll frame.
export const combineScroll = (hideProps, ownOnScroll) => ({
  scrollEventThrottle: 16,
  onScroll: (e) => { hideProps.onScroll?.(e); ownOnScroll?.(e); },
});

export const AutoHideTabBar = (props) => {
  const { colors: DS } = useTheme();
  const ctx = useContext(Ctx);
  const translateY = ctx?.translateY;

  // Always show the bar again when the active tab changes.
  const idx = props.state.index;
  const prevIdx = useRef(idx);
  useEffect(() => {
    if (prevIdx.current !== idx) { prevIdx.current = idx; ctx?.reveal(); }
  }, [idx, ctx]);

  return (
    <Animated.View
      onLayout={(e) => ctx?.setBarHeight(e.nativeEvent.layout.height)}
      // Match the scene background so the strip the bar vacates blends in.
      style={{ backgroundColor: DS.bg, transform: translateY ? [{ translateY }] : [] }}
    >
      <BottomTabBar {...props} />
    </Animated.View>
  );
};
