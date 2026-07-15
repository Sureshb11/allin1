// ─────────────────────────────────────────────────────────────────────────────
// GlassDock — the floating bottom navigation with the signature cricket ball.
//
// Five slots, icons only:  Home · My Cricket — ⚾ Ball — Pavilion · Profile
//   · the ball is the create-match action (Toss & Play / schedule)
//   · the selected item tints electric blue (#00AEEF) with a dot beneath
//   · Profile lives inside the Home stack; the dock highlights it by looking
//     at the focused deep route, not just the active tab
//
// Rendered inside AutoHideTabBar's animated shell, so scroll-hide, tab-change
// reveal and clearance measurement all keep working unchanged. Hides entirely
// on full-screen scoring routes (same rule the old bar used).
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import AnimatedCricketBall from './CricketBall/AnimatedBall';

const BLUE = '#00AEEF';
const FULLSCREEN = ['Scoring', 'SportScoring'];

export default function GlassDock({ state, navigation, sportIcon = 'cricket', homeRoute = 'CricketFeed' }) {
  const { colors: DS, isDark } = useTheme();

  const tabRoute = state.routes[state.index];
  const deep = tabRoute.state?.routes?.[tabRoute.state.index]?.name;
  if (FULLSCREEN.includes(deep)) return null;

  const active =
    deep === 'Profile'    ? 'profile' :
    deep === 'StartMatch' ? 'ball' :
    ({ HomeTab: 'home', MyCricketTab: 'mycricket', PavilionTab: 'pavilion' }[tabRoute.name] || 'home');

  // Each dock item goes to ITS screen (not just its tab) — otherwise "Home"
  // from Profile would land back on Profile, since Profile/StartMatch live on
  // the Home tab's stack. navigate() pops back if the screen is in the stack.
  const goTab = (name, screen) => () => {
    const target = state.routes.find((r) => r.name === name);
    const ev = navigation.emit({ type: 'tabPress', target: target?.key, canPreventDefault: true });
    if (!ev.defaultPrevented) navigation.navigate(name, screen ? { screen } : undefined);
  };
  const goProfile   = () => navigation.navigate('HomeTab', { screen: 'Profile' });
  const startMatch  = () => navigation.navigate('HomeTab', { screen: 'StartMatch' });

  const s = makeStyles(isDark, DS);

  const Item = ({ id, icon, onPress, label }) => {
    const on = active === id;
    return (
      <TouchableOpacity
        onPress={onPress} style={s.item} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }}>
        <Icon name={icon} size={25} color={on ? BLUE : (isDark ? '#8b93a8' : DS.textMuted)} />
        <View style={[s.dot, on && s.dotOn]} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={s.capsule}>
        <Item id="home"      icon="home-variant-outline"   onPress={goTab('HomeTab', homeRoute)}     label="Home" />
        <Item id="mycricket" icon={sportIcon}              onPress={goTab('MyCricketTab', 'Home')}   label="My Cricket" />
        <View style={s.ballSlot}>
          <View style={s.ballLift}>
            <AnimatedCricketBall size={60} onPress={startMatch} />
          </View>
        </View>
        <Item id="pavilion"  icon="stadium"                onPress={goTab('PavilionTab', 'Pavilion')} label="Pavilion" />
        <Item id="profile"   icon="account-circle-outline" onPress={goProfile}             label="Profile" />
      </View>
    </View>
  );
}

const makeStyles = (isDark, DS) => StyleSheet.create({
  wrap: { alignItems: 'center', paddingBottom: 10, paddingTop: 6, backgroundColor: 'transparent' },
  capsule: {
    width: '88%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 9, borderRadius: 34,
    backgroundColor: isDark ? 'rgba(17,23,40,0.97)' : '#ffffff',
    borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(15,20,35,0.08)',
    shadowColor: '#000', shadowOpacity: isDark ? 0.45 : 0.18, shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 }, elevation: 14,
  },
  item: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 3, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: BLUE },
  ballSlot: { width: 68, alignItems: 'center' },
  ballLift: { marginTop: -30 },
});
