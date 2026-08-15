import React, { useLayoutEffect, useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, useWindowDimensions, ScrollView, Animated as RNAnimated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { makeControls, controlColors } from '../theme/controls';

import MyPerformanceScreen from './MyPerformanceScreen';
import StatisticsScreen from './StatisticsScreen';
import LookingForScreen from './LookingForScreen';
import GroundsScreen from './GroundsScreen';
import { useCurrentUser } from '../utils/currentUser';
import { useTabBarClearance, useDockTranslate } from '../components/AutoHideTabBar';
import { haptic } from '../utils/haptics';
import { pav } from '../theme/pavilion';
import AppHeader from '../components/AppHeader';
import { getSelectedSport } from '../utils/selectedSport';
const PAVILION_TAB_KEY = '@ll_pavilion_tab';

const L1_TABS = [
  { label: 'My Stats', icon: 'chart-line', component: MyPerformanceScreen, id: 'mystats' },
  { label: 'Rankings', icon: 'podium', component: StatisticsScreen, id: 'rankings' },
  { label: 'Scout',    icon: 'telescope', component: LookingForScreen, id: 'scout' },
  { label: 'Grounds',  icon: 'earth', component: GroundsScreen, id: 'grounds' },
];

// `label` is no longer drawn — the button is a circular icon now — but it is
// still the button's ACCESSIBLE NAME. An icon-only control with no label is
// announced as just "button", so this is load-bearing, not leftover.
const FAB_FOR = (P) => ({
  'My Stats': { icon: 'share-variant', label: 'Share Card', accent: P.accent },
  'Rankings': null,
  'Scout': { icon: 'plus', label: 'Post Listing', accent: P.accent },
  'Grounds': { icon: 'plus', label: 'Add Ground', accent: P.accent }
});

export default function PavilionScreen({ navigation, route }) {
  const { width: SCREEN_W } = useWindowDimensions();
  const { colors: DS, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const C = useThemedStyles(makeControls);
  const CONTROL = controlColors(DS);
  const P = pav(DS);
  const meUser = useCurrentUser();
  const tabClear = useTabBarClearance();
  const insets = useSafeAreaInsets();
  
  const sportId = getSelectedSport().sport?.id || 'cricket';

  const PAGES = React.useMemo(() => {
    const pages = [];
    L1_TABS.forEach(tab => {
      if (tab.id === 'mystats' && sportId === 'cricket') {
        pages.push({ ...tab, l2: 'overall', l2Label: 'Overall', key: 'mystats-overall' });
        pages.push({ ...tab, l2: 'leather', l2Label: 'Leather', key: 'mystats-leather' });
        pages.push({ ...tab, l2: 'tennis', l2Label: 'Tennis', key: 'mystats-tennis' });
        pages.push({ ...tab, l2: 'indoor', l2Label: 'Box Cricket', key: 'mystats-indoor' });
      } else {
        pages.push({ ...tab, l2: null, l2Label: null, key: tab.id });
      }
    });
    return pages;
  }, [sportId]);

  const [activeIdx, setActiveIdx] = useState(0);
  const activePage = PAGES[activeIdx] || PAGES[0];
  const activeL1 = activePage.label;

  const fabActions = useRef({}).current;
  const fabRegisterers = useRef({});
  const registerFab = (id) => {
    if (!fabRegisterers.current[id]) {
      fabRegisterers.current[id] = (fn) => {
        fabActions[id] = fn;
        setFabOff((o) => (!!o[id] === !fn ? o : { ...o, [id]: !fn }));
      };
    }
    return fabRegisterers.current[id];
  };
  const FABS = FAB_FOR(P);
  const [fabOff, setFabOff] = useState({});
  const fab = fabOff[activePage.id] ? null : FABS[activeL1];

  const dockY = useDockTranslate();

  const fabPop = useSharedValue(1);
  useEffect(() => {
    fabPop.value = 0;
    fabPop.value = withTiming(1, { duration: 280 });
  }, [activeL1, fabPop]);
  
  const fabContentStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + fabPop.value * 0.65,
    transform: [{ translateY: (1 - fabPop.value) * 7 }, { scale: 0.9 + fabPop.value * 0.1 }],
  }));

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false, headerTitle: 'Pavilion' });
  }, [navigation]);

  const scrollViewRef = useRef(null);

  const handleIndexChange = useCallback((idx) => {
    if (idx !== activeIdx && idx >= 0 && idx < PAGES.length) {
      haptic.tick();
      setActiveIdx(idx);
      AsyncStorage.setItem(PAVILION_TAB_KEY, String(idx)).catch(() => {});
    }
  }, [activeIdx, PAGES.length]);

  const handleMomentumScrollEnd = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / SCREEN_W);
    if (idx >= 0 && idx < PAGES.length) {
      handleIndexChange(idx);
    }
  };

  const goToL1 = (label) => {
    const idx = PAGES.findIndex(t => t.label === label);
    if (idx >= 0) {
      handleIndexChange(idx);
      scrollViewRef.current?.scrollTo({ x: idx * SCREEN_W, animated: true });
    }
  };

  const goToL2 = (l2) => {
    const idx = PAGES.findIndex(t => t.label === activeL1 && t.l2 === l2);
    if (idx >= 0) {
      handleIndexChange(idx);
      scrollViewRef.current?.scrollTo({ x: idx * SCREEN_W, animated: true });
    }
  };

  useEffect(() => {
    AsyncStorage.getItem(PAVILION_TAB_KEY).then((v) => {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 0 && n < PAGES.length) {
        // Hydrate position
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({ x: n * SCREEN_W, animated: false });
        }, 100);
      }
    }).catch(() => {});
  }, [SCREEN_W, PAGES.length]);



  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
      
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          scrollEventThrottle={16}
        >
          {PAGES.map((page, idx) => {
            const Comp = page.component;
            // Lazy load: only render the active tab and its immediate neighbors
            const isVisible = Math.abs(idx - activeIdx) <= 1;

            return (
              <View key={page.key} style={{ width: SCREEN_W, flex: 1, paddingTop: (page.l2 ? 175 : 130) + insets.top }}>
                {isVisible ? (
                  <Comp navigation={navigation} route={route} inline={true} onRegisterFab={registerFab(page.id)} ballTypeOverride={page.l2} />
                ) : null}
              </View>
            );
          })}
        </ScrollView>

        {/* Floating Header & Tabs */}
        {/* No paddingTop here any more — AppHeader clears the status bar itself
            now, and this screen padding for it too would push the header down
            by the inset twice. This was the only screen of the four that
            compensated, which is why Pavilion looked right and Profile, Home
            and the feed did not. */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: DS.bg + 'E6' }}> 
          <AppHeader transparent />
          <View style={{ borderBottomWidth: 1, borderBottomColor: DS.border }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[C.navRow, { paddingHorizontal: 16, borderBottomWidth: 0, paddingBottom: 10 }]}>
              {L1_TABS.map((tab) => {
                const isActive = activeL1 === tab.label;
                return (
                  <TouchableOpacity
                    key={tab.label}
                    style={[C.navPillTight, isActive ? C.navPillActive : C.navPillInactive]}
                    onPress={() => goToL1(tab.label)}
                    activeOpacity={0.85}
                  >
                    <Icon name={tab.icon} size={14} color={isActive ? CONTROL.onGreen : CONTROL.slate} />
                    <Text
                      style={[C.navPillTextTight, { color: isActive ? CONTROL.onGreen : CONTROL.slate }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >{tab.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            
            {/* Level 2 Tabs */}
            {PAGES.filter(p => p.label === activeL1 && p.l2).length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 24, paddingHorizontal: 16, paddingBottom: 0 }}>
                {PAGES.filter(p => p.label === activeL1 && p.l2).map((p) => {
                  const isActive = activePage.l2 === p.l2;
                  return (
                    <TouchableOpacity
                      key={p.l2}
                      style={{ paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: isActive ? DS.lime : 'transparent' }}
                      onPress={() => goToL2(p.l2)}
                      activeOpacity={0.85}
                    >
                      <Text style={{ fontSize: 12, letterSpacing: 0.5, color: isActive ? DS.lime : DS.textMuted, fontWeight: isActive ? '800' : '600' }}>
                        {p.l2Label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </View>


      {fab && (
        <RNAnimated.View
          pointerEvents="box-none"
          style={[styles.fabWrap, { bottom: tabClear + 16 },
                  dockY ? { transform: [{ translateY: dockY }] } : null]}>
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: DS.lime }]}
            accessibilityRole="button"
            accessibilityLabel={fab.label}
            onPress={() => {
              haptic.impact();
              fabActions[activePage.id]?.();
            }}
            activeOpacity={0.85}
          >
            <Animated.View style={[styles.fabContent, fabContentStyle]}>
              <Icon name={fab.icon} size={26} color={DS.onLime} />
            </Animated.View>
          </TouchableOpacity>
        </RNAnimated.View>
      )}
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  fabWrap: { position: 'absolute', right: 20 },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 8,
  },
  fabContent: { alignItems: 'center', justifyContent: 'center' },
});
