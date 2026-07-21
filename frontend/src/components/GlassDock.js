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
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { useCurrentUser } from '../utils/currentUser';
import AnimatedCricketBall from './CricketBall/AnimatedBall';
import { sportColor as sportColorFor } from '../sports/colors';


// Full-screen routes the dock must NOT overlay. The pre-match setup screens
// (MatchSetup = non-cricket toss+squads, TossLineup = cricket) pin their
// START MATCH CTA to the bottom, so the floating dock would sit right on top
// of it — include them alongside the live-scoring routes.
const FULLSCREEN = ['Scoring', 'SportScoring', 'BallLab', 'Chat', 'MatchSetup', 'TossLineup'];

export default function GlassDock({
  state, navigation, sportIcon = 'cricket', sportName = 'My Cricket', homeRoute = 'CricketFeed',
  pavilionLabel = 'Pavilion', sportId = 'cricket',
}) {
  const { colors: DS, isDark } = useTheme();
  const me = useCurrentUser();          // logged-in user → "You" tab avatar
  const [size, setSize] = useState({ w: 0, h: 0 });

  const tabRoute = state.routes[state.index];
  const deep = tabRoute.state?.routes?.[tabRoute.state.index]?.name;
  if (FULLSCREEN.includes(deep)) return null;

  const active =
    deep === 'StartMatch' ? 'ball' :
    ({ HomeTab: 'home', MyCricketTab: 'mycricket', PavilionTab: 'pavilion', ProfileTab: 'profile' }[tabRoute.name] || 'home');

  // Each dock item goes to ITS screen (not just its tab) — otherwise "Home"
  // from Profile would land back on Profile, since Profile/StartMatch live on
  // the Home tab's stack. navigate() pops back if the screen is in the stack.
  const goTab = (name, screen) => () => {
    const target = state.routes.find((r) => r.name === name);
    const ev = navigation.emit({ type: 'tabPress', target: target?.key, canPreventDefault: true });
    if (!ev.defaultPrevented) navigation.navigate(name, screen ? { screen } : undefined);
  };
  const goProfile   = goTab('ProfileTab', 'Profile');
  const startMatch  = () => navigation.navigate('HomeTab', { screen: 'StartMatch' });

  // The dock wears the active sport, so the whole app reads as that arena.
  // Cricket resolves to the brand green, i.e. unchanged.
  const accent = sportColorFor(sportId, isDark);
  const idle = isDark ? '#9aa1af' : DS.textMuted;
  const s = makeStyles(isDark, DS);

  // Measure the capsule so the SVG gloss fills it exactly (percentage sizes on
  // <Rect> aren't reliable across react-native-svg versions — pixels are).
  
  // `glyph` renders a custom icon (given the current tint) in place of the
  // named MaterialCommunityIcons glyph — used for the floodlit stadium.
  const Item = ({ id, activeIcon, inactiveIcon, glyph, onPress, label }) => {
    const on = active === id;
    const tint = on ? accent : idle;
    const iconName = on ? (activeIcon || inactiveIcon) : (inactiveIcon || activeIcon);
    return (
      <TouchableOpacity
        onPress={onPress} style={s.item} hitSlop={{ top: 8, bottom: 4, left: 4, right: 4 }}
        activeOpacity={0.7}
        accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }}>
        {glyph ? glyph(tint, on) : <Icon name={iconName} size={28} color={tint} />}
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
        
        <Item id="home"      activeIcon="home" inactiveIcon="home-outline" onPress={goTab('HomeTab', homeRoute)}      label="Home" />
        <Item id="mycricket" activeIcon={sportIcon} inactiveIcon={sportIcon} onPress={goTab('MyCricketTab', 'Home')}    label={sportName} />
        <View style={s.ballSlot}>
          {/* The signature animated ball is cricket's own hero art, so it stays on
              cricket only — and keeps its lift above the capsule. Every other
              sport gets a neutral "+" create button sitting inline with the rest
              of the dock (YouTube-style), which reads as "add" in any sport. */}
          {sportIcon === 'cricket' ? (
            <View style={s.ballLift}>
              <AnimatedCricketBall size={52} onPress={startMatch} />
            </View>
          ) : (
            <TouchableOpacity style={s.plusBtn} activeOpacity={0.7} onPress={startMatch}
              accessibilityRole="button" accessibilityLabel="Start a match">
              <Icon name="plus" size={26} color={DS.textPrimary} />
            </TouchableOpacity>
          )}
        </View>
        <Item id="pavilion"  activeIcon="stadium" inactiveIcon="stadium"
              onPress={goTab('PavilionTab', 'Pavilion')} label={pavilionLabel} />
        <Item id="profile"   onPress={goProfile}                        label="You"
              glyph={(c, on) => (me?.avatarUrl
                ? <Image source={{ uri: me.avatarUrl }} style={[s.avatar, { borderColor: c }]} />
                : <Icon name={on ? "account-circle" : "account-circle-outline"} size={28} color={c} />)} />
      </View>
    </View>
  );
}

const makeStyles = (isDark, DS) => StyleSheet.create({
  wrap: { alignItems: 'center', paddingBottom: 10, paddingTop: 6, backgroundColor: 'transparent' },
  capsule: {
    width: '92%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingTop: 8, paddingBottom: 7, borderRadius: 30,
    backgroundColor: isDark ? DS.surfaceHigh : '#ffffff',
    borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    shadowColor: '#000', shadowOpacity: isDark ? 0.4 : 0.15, shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }, elevation: 10,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  label: { fontSize: 10.5, marginTop: 3, letterSpacing: 0.2, fontWeight: '500' },
  labelOn: { fontWeight: '700' },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 3, backgroundColor: 'transparent' },
  // "You" tab avatar — ring takes the current tint (green when selected).
  avatar: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.6, backgroundColor: DS.surfaceHigh },
  ballSlot: { width: 68, alignItems: 'center' },
  // Neutral create button for non-cricket sports: a soft grey disc with a dark
  // glyph, flat and inline — deliberately quiet, so it doesn't compete with the
  // cricket ball's hero treatment.
  plusBtn: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : DS.surfaceHigh,
  },
  ballLift: { marginTop: -30 },
});
