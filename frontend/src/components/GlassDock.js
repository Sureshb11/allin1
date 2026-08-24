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
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform, UIManager, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { useCurrentUser } from '../utils/currentUser';
import AnimatedCricketBall from './CricketBall/AnimatedBall';
import { sportColor as sportColorFor } from '../sports/colors';


// Full-screen routes the dock must NOT overlay. The pre-match setup screens
// (MatchSetup = non-cricket toss+squads, TossLineup = cricket) pin their
// START MATCH CTA to the bottom, so the floating dock would sit right on top
// of it — include them alongside the live-scoring routes.
//
// A leaderboard joins them, and by this route list rather than by useDockLock.
// The lock is an acquire/release pair, and on this screen the pair came apart:
// the acquire fired on focus and the matching release fired 357ms later while
// the screen was still the one you were looking at, so the dock slid away and
// came straight back over the table. This list cannot come apart — it is read
// from the focused route on every render, with nothing to keep in balance.
const FULLSCREEN = ['Scoring', 'SportScoring', 'BallLab', 'Chat', 'MatchSetup', 'TossLineup',
  'TeamStatLeaderboard', 'TournamentDetail'];

export default function GlassDock({
  state, navigation, sportIcon = 'cricket', sportName = 'My Cricket', homeRoute = 'Home',
  pavilionLabel = 'Pavilion', sportId = 'cricket',
}) {
  const { colors: DS, isDark } = useTheme();
  const me = useCurrentUser();          // logged-in user → "You" tab avatar

  const tabRoute = state.routes[state.index];
  const deep = tabRoute.state?.routes?.[tabRoute.state.index]?.name;
  
  const active =
    deep === 'StartMatch' ? 'ball' :
    ({ HomeTab: 'home', MyCricketTab: 'mycricket', PavilionTab: 'pavilion', ProfileTab: 'profile' }[tabRoute.name] || 'home');

  if (FULLSCREEN.includes(deep)) return null;

  // Each dock item goes to ITS screen (not just its tab) — otherwise "Home"
  // from Profile would land back on Profile, since Profile/StartMatch live on
  // the Home tab's stack. navigate() pops back if the screen is in the stack.
  const goTab = (name, screen) => () => {
    const target = state.routes.find((r) => r.name === name);
    const ev = navigation.emit({ type: 'tabPress', target: target?.key, canPreventDefault: true });
    if (!ev.defaultPrevented) navigation.navigate(name, screen ? { screen } : undefined);
  };
  const goProfile   = goTab('ProfileTab', 'Profile');
  // Open Create Match on the tab you are ALREADY on, not by jumping to HomeTab
  // first. All four tabs render the same stack, so StartMatch is reachable from
  // any of them — and pushing it onto the current one is what makes closing the
  // drawer put you back where you opened it. Hard-coding HomeTab meant every
  // close landed on the feed, from wherever you had been, because the feed is
  // that tab's root and the drawer had been pushed on top of it.
  const startMatch = () => {
    const here = state.routes[state.index]?.name || 'HomeTab';
    navigation.navigate(here, { screen: 'StartMatch' });
  };

  // The dock wears the active sport, so the whole app reads as that arena.
  // Cricket resolves to the brand green, i.e. unchanged.
  const accent = sportColorFor(sportId, isDark);
  const idle = isDark ? '#9aa1af' : DS.textMuted;
  const s = makeStyles(isDark, DS);

  // Measure the capsule so the SVG gloss fills it exactly (percentage sizes on
  // <Rect> aren't reliable across react-native-svg versions — pixels are).
  
  // `glyph` renders a custom icon (given the current tint) in place of the
  // named MaterialCommunityIcons glyph — used for the floodlit stadium.
  const AnimatedIcon = Animated.createAnimatedComponent(Icon);

  const Item = ({ id, activeIcon, inactiveIcon, glyph, onPress, label }) => {
    const on = active === id;
    
    // Smooth transition between 0 and 1
    const anim = useRef(new Animated.Value(on ? 1 : 0)).current;
    
    useEffect(() => {
      Animated.timing(anim, {
        toValue: on ? 1 : 0,
        duration: 250,
        useNativeDriver: false, // Color interpolation requires JS driver
      }).start();
    }, [on]);

    const tint = anim.interpolate({
      inputRange: [0, 1],
      outputRange: [idle, accent]
    });

    const iconName = on ? (activeIcon || inactiveIcon) : (inactiveIcon || activeIcon);

    // The whole "which screen am I on" signal used to be a tint plus a 4px dot,
    // sitting next to a 52px animated cricket ball lifted 30px out of the bar.
    // The ball won that comparison every time — and it is the CREATE action,
    // not a destination, so the loudest thing in the navigation was not
    // somewhere you could be. A filled pill behind the active icon is the same
    // shape Material's nav bar uses, and it reads at a glance without having to
    // quieten the ball, which is the app's own hero art.
    const pillOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.20] });
    const pillScale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] });

    return (
      <TouchableOpacity style={s.item} onPress={onPress} activeOpacity={0.8} hitSlop={8}
        accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}>
        <View style={s.iconWrap}>
          <Animated.View
            pointerEvents="none"
            style={[s.activePill, { opacity: pillOpacity, transform: [{ scale: pillScale }], backgroundColor: accent }]}
          />
          {glyph ? glyph(on ? accent : idle, on) : <AnimatedIcon name={iconName} size={26} style={{ color: tint }} />}
        </View>
        <Animated.Text numberOfLines={1} style={[s.label, { color: tint, fontWeight: on ? '800' : '600' }]}>{label}</Animated.Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={s.capsule}>
        
        <Item id="home"      activeIcon="home" inactiveIcon="home-outline" onPress={goTab('HomeTab', homeRoute)}      label="Home" />
        <Item id="mycricket" activeIcon={sportIcon} inactiveIcon={sportIcon} onPress={goTab('MyCricketTab', 'MyMatches')}    label={sportName} />
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
            /* On the create screen `active` is 'ball', so none of the four tabs
               light up — right, since you are not on a tab, but it left the bar
               with nothing selected at all. The create button now shows its own
               state instead. */
            <TouchableOpacity
              style={[s.plusBtn, active === 'ball' && { backgroundColor: accent + '33', borderWidth: 1.5, borderColor: accent }]}
              activeOpacity={0.7} onPress={startMatch}
              accessibilityRole="button" accessibilityLabel="Start a match"
              accessibilityState={{ selected: active === 'ball' }}>
              <Icon name="plus" size={26} color={active === 'ball' ? accent : DS.textPrimary} />
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
    borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
    borderTopWidth: isDark ? 0.5 : 1, borderTopColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.06)',
    shadowColor: isDark ? DS.lime : '#000', shadowOpacity: isDark ? 0.25 : 0.15, shadowRadius: isDark ? 20 : 16,
    shadowOffset: { width: 0, height: isDark ? 0 : 8 }, elevation: 12,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  // The icon sits in a fixed box so the pill behind it is the same size on
  // every tab, whatever the glyph — the avatar on "You" is a different shape
  // to the icons beside it.
  iconWrap: { width: 46, height: 30, alignItems: 'center', justifyContent: 'center' },
  activePill: { ...StyleSheet.absoluteFillObject, borderRadius: 15 },
  label: { fontSize: 10.5, marginTop: 2, letterSpacing: 0.3 },
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
