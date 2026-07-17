// ─────────────────────────────────────────────────────────────────────────────
// GlassDock — the floating bottom navigation with the signature cricket ball.
//
// Five slots, each icon + name (YouTube-style labels):
//   Home · My Cricket — ⚾ Play — Pavilion · Profile
//   · the ball is the create-match action (Toss & Play / schedule)
//   · the selected item tints the app accent (green) — icon, label + underline dot
//   · Profile lives inside the Home stack; the dock highlights it by looking
//     at the focused deep route, not just the active tab
//
// "Liquid glass" finish: a translucent capsule with an SVG gloss sheen (top-lit
// gradient), a bright rim highlight and a soft outer shadow, so it reads as a
// frosted-glass slab floating over the content. (No native blur lib is bundled,
// so the frost is faked with translucency + gloss rather than a real backdrop
// blur — swap in @react-native-community/blur later for a true blur if wanted.)
//
// Rendered inside AutoHideTabBar's animated shell, so scroll-hide, tab-change
// reveal and clearance measurement all keep working unchanged. Hides entirely
// on full-screen scoring routes (same rule the old bar used).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import AnimatedCricketBall from './CricketBall/AnimatedBall';

const FULLSCREEN = ['Scoring', 'SportScoring', 'BallLab'];

export default function GlassDock({
  state, navigation, sportIcon = 'cricket', sportName = 'My Cricket', homeRoute = 'CricketFeed',
}) {
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

  // Selection colour = the app's single green accent (dark #3ecf6e / light #0a5227)
  const accent = DS.lime;
  const idle = isDark ? '#9aa1af' : DS.textMuted;
  const s = makeStyles(isDark, DS);

  // Measure the capsule so the SVG gloss fills it exactly (percentage sizes on
  // <Rect> aren't reliable across react-native-svg versions — pixels are).
  const [size, setSize] = useState({ w: 0, h: 0 });

  const Item = ({ id, icon, onPress, label }) => {
    const on = active === id;
    const tint = on ? accent : idle;
    return (
      <TouchableOpacity
        onPress={onPress} style={s.item} hitSlop={{ top: 8, bottom: 4, left: 4, right: 4 }}
        activeOpacity={0.7}
        accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }}>
        <Icon name={icon} size={23} color={tint} />
        <Text numberOfLines={1} style={[s.label, { color: tint }, on && s.labelOn]}>{label}</Text>
        <View style={[s.dot, on && { backgroundColor: accent }]} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View
        style={s.capsule}
        onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {/* Rounded clip for the glass layers — kept separate so the capsule itself
            stays overflow-visible and the ball can overhang the top edge. */}
        <View style={s.glassClip} pointerEvents="none">
          {/* Liquid-glass sheen: top-lit gloss + a faint diagonal wash. */}
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="glassGloss" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0"    stopColor="#ffffff" stopOpacity={isDark ? 0.14 : 0.9} />
                <Stop offset="0.45" stopColor="#ffffff" stopOpacity={isDark ? 0.03 : 0.14} />
                <Stop offset="1"    stopColor="#ffffff" stopOpacity="0" />
              </LinearGradient>
              <LinearGradient id="glassSide" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0"   stopColor="#ffffff" stopOpacity={isDark ? 0.06 : 0.22} />
                <Stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
                <Stop offset="1"   stopColor="#ffffff" stopOpacity={isDark ? 0.05 : 0.18} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width={size.w || 400} height={size.h || 70} fill="url(#glassSide)" />
            <Rect x="0" y="0" width={size.w || 400} height={size.h || 70} fill="url(#glassGloss)" />
          </Svg>
          {/* Bright rim highlight along the top edge (the glass catching light). */}
          <View style={s.rim} />
        </View>

        <Item id="home"      icon="home-variant"        onPress={goTab('HomeTab', homeRoute)}      label="Home" />
        <Item id="mycricket" icon={sportIcon}           onPress={goTab('MyCricketTab', 'Home')}    label={sportName} />
        <View style={s.ballSlot}>
          <View style={s.ballLift}>
            <AnimatedCricketBall size={52} onPress={startMatch} />
          </View>
        </View>
        <Item id="pavilion"  icon="stadium"             onPress={goTab('PavilionTab', 'Pavilion')} label="Pavilion" />
        <Item id="profile"   icon="account-circle"      onPress={goProfile}                        label="You" />
      </View>
    </View>
  );
}

const makeStyles = (isDark, DS) => StyleSheet.create({
  wrap: { alignItems: 'center', paddingBottom: 10, paddingTop: 6, backgroundColor: 'transparent' },
  capsule: {
    width: '92%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingTop: 8, paddingBottom: 7, borderRadius: 30,
    // Translucent frosted base — content shows through for the "glass" read.
    backgroundColor: isDark ? 'rgba(22,27,31,0.82)' : 'rgba(255,255,255,0.78)',
    borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,20,35,0.10)',
    shadowColor: '#000', shadowOpacity: isDark ? 0.5 : 0.2, shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 }, elevation: 16,
  },
  // Clips the SVG gloss to the capsule's rounded corners without clipping the
  // overhanging ball (which lives outside this layer).
  glassClip: { ...StyleSheet.absoluteFillObject, borderRadius: 30, overflow: 'hidden' },
  // Top edge highlight — 1px of extra brightness where the glass meets the light.
  rim: {
    position: 'absolute', top: 0, left: 16, right: 16, height: 1,
    backgroundColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.95)',
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  label: { fontSize: 10.5, marginTop: 3, letterSpacing: 0.2, fontWeight: '500' },
  labelOn: { fontWeight: '700' },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 3, backgroundColor: 'transparent' },
  ballSlot: { width: 68, alignItems: 'center' },
  ballLift: { marginTop: -30 },
});
