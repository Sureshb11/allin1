import React, { useLayoutEffect, useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, useWindowDimensions, Animated as RNAnimated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
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
const PAVILION_TAB_KEY = '@ll_pavilion_tab';

const TABS = [
  { label: 'My Stats', icon: 'chart-line', component: MyPerformanceScreen, id: 'mystats' },
  { label: 'Rankings', icon: 'podium', component: StatisticsScreen, id: 'rankings' },
  { label: 'Scout',    icon: 'telescope', component: LookingForScreen, id: 'scout' },
  { label: 'Grounds',  icon: 'earth', component: GroundsScreen, id: 'grounds' },
];

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
  
  const [activeItem, setActiveItem] = useState(TABS[0]);
  const activeL1 = activeItem.label;

  const fabActions = useRef({}).current;
  const registerFab = (id) => (fn) => {
    fabActions[id] = fn;
    setFabOff((o) => (!!o[id] === !fn ? o : { ...o, [id]: !fn }));
  };
  const FABS = FAB_FOR(P);
  const [fabOff, setFabOff] = useState({});
  const fab = fabOff[activeItem.id] ? null : FABS[activeL1];

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
  const scrollX = useRef(new RNAnimated.Value(0)).current;

  const handleIndexChange = useCallback((idx) => {
    const item = TABS[idx];
    if (item.label !== activeItem.label) {
      haptic.tick();
      setActiveItem(item);
      AsyncStorage.setItem(PAVILION_TAB_KEY, String(idx)).catch(() => {});
    }
  }, [activeItem.label]);

  const handleScroll = RNAnimated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: true }
  );

  const handleMomentumScrollEnd = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / SCREEN_W);
    if (idx >= 0 && idx < TABS.length) {
      handleIndexChange(idx);
    }
  };

  const goToL1 = (label) => {
    const idx = TABS.findIndex(t => t.label === label);
    if (idx >= 0) {
      scrollViewRef.current?.scrollTo({ x: idx * SCREEN_W, animated: true });
    }
  };

  useEffect(() => {
    AsyncStorage.getItem(PAVILION_TAB_KEY).then((v) => {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 0 && n < TABS.length) {
        // Hydrate position
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({ x: n * SCREEN_W, animated: false });
        }, 100);
      }
    }).catch(() => {});
  }, [SCREEN_W]);



  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />
      <AppHeader />
      
      <View style={{ flex: 1 }}>
        <View style={[C.navRow, { paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: DS.border }]}>
          {TABS.map((tab) => {
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
        </View>
        <RNAnimated.ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          scrollEventThrottle={16}
        >
          {TABS.map((tab) => {
            const Comp = tab.component;
            return (
              <View key={tab.id} style={{ width: SCREEN_W, flex: 1 }}>
                <Comp navigation={navigation} route={route} inline={true} onRegisterFab={registerFab(tab.id)} />
              </View>
            );
          })}
        </RNAnimated.ScrollView>
      </View>

      {fab && (
        <RNAnimated.View
          pointerEvents="box-none"
          style={[styles.fabWrap, { bottom: tabClear + 16 },
                  dockY ? { transform: [{ translateY: dockY }] } : null]}>
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: DS.lime }]}
            onPress={() => {
              haptic.impact();
              fabActions[activeItem.id]?.();
            }}
            activeOpacity={0.85}
          >
            <Animated.View style={[styles.fabContent, fabContentStyle]}>
              <Icon name={fab.icon} size={20} color={DS.onLime} />
              <Text style={[styles.fabText, { color: DS.onLime }]}>{fab.label}</Text>
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
  fabContent: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  fabText: {
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});
