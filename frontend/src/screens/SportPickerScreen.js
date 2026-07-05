import { useTheme, useThemedStyles, useArenaColors } from "../theme/ThemeContext"; // SportPickerScreen — "Choose Your Arena" honeycomb picker.
// Ported from the design handoff (design_handoff_arena), V2 "Spotlight":
// an Apple-Watch-style honeycomb of sport discs the user drags to pan, with a
// fisheye falloff (centre disc largest, edges shrink & fade). The centred disc
// is the current selection; the headline + a solid-blue START button reflect it.
//
// Note: the design calls for the Anton/Archivo fonts, which aren't bundled in
// this app — we match the existing screens' approach (heavy system weight +
// letter-spacing) instead. Tapping a disc keeps the app's navigation contract
// (→ SportSetup with the chosen sport).

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Dimensions, PanResponder, Animated, Easing, Vibration, Platform, Image } from
'react-native';
import Svg, { Path, Line, Circle, Rect, Defs, RadialGradient, LinearGradient, Stop } from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCurrentUser } from '../utils/currentUser';
import SportIcon from '../components/SportIcon';
import SportLogoIcon, { hasSportAnim } from '../components/SportLogoIcon';
import { haptic } from '../utils/haptics';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport, setSelectedSport } from '../utils/selectedSport';

const { width: SW } = Dimensions.get('window');

// ── ARENA palette (from design_handoff_arena/app/data.jsx) ──────────────────








// Sports — index 0 is the focal point (Cricket), then rings outward.
// `mci` = a MaterialCommunityIcons fallback name so the downstream
// SportSetupScreen (which renders sport.icon) keeps working.
const SPORTS = [
{ id: 'cricket', name: 'Cricket', tag: 'Bat & Ball', featured: true, mci: 'cricket' },
{ id: 'football', name: 'Football', tag: '11-a-side', mci: 'soccer' },
{ id: 'kabaddi', name: 'Kabaddi', tag: 'Raid & Tackle', mci: 'run-fast' },
{ id: 'hockey', name: 'Hockey', tag: 'Field', mci: 'hockey-sticks' },
{ id: 'badminton', name: 'Badminton', tag: 'Racquet', mci: 'badminton' },
{ id: 'tennis', name: 'Tennis', tag: 'Racquet', mci: 'tennis' },
{ id: 'basketball', name: 'Basketball', tag: 'Court', mci: 'basketball' },
{ id: 'volleyball', name: 'Volleyball', tag: 'Court', mci: 'volleyball' },
{ id: 'boxing', name: 'Boxing', tag: 'Combat', mci: 'boxing-glove' },
{ id: 'wrestling', name: 'Wrestling', tag: 'Combat', mci: 'arm-flex' },
{ id: 'tabletennis', name: 'Table Tennis', tag: 'Paddle', mci: 'table-tennis' },
{ id: 'khokho', name: 'Kho-Kho', tag: 'Chase', mci: 'run' },
{ id: 'handball', name: 'Handball', tag: 'Court', mci: 'handball' },
{ id: 'squash', name: 'Squash', tag: 'Racquet', mci: 'racquetball' },
{ id: 'pickleball', name: 'Pickleball', tag: 'Paddle', mci: 'table-tennis' },
{ id: 'judo', name: 'Judo', tag: 'Combat', mci: 'karate' },
{ id: 'karate', name: 'Karate', tag: 'Combat', mci: 'karate' },
{ id: 'skateboard', name: 'Skateboarding', tag: 'Street', mci: 'skateboard' },
{ id: 'rummy', name: 'Rummy', tag: '13 Cards', scored: true, mci: 'cards-playing-outline' }];



// ── Honeycomb params (V2 Spotlight) ─────────────────────────────────────────
const SPACING = 78; // neighbour distance
const CELL = 62; // disc design size
const FALLOFF = 120;
const MIN_SCALE = 0.36;
const MAX_SCALE = 1;

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

// ── Hex layout (axial coords) — fill whole rings from the centre, then spread
// any remainder evenly so the cluster stays one balanced blob (no stragglers).
function hexRing(radius) {
  if (radius === 0) return [{ q: 0, r: 0 }];
  const dirs = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  const out = [];
  let q = dirs[4][0] * radius,r = dirs[4][1] * radius;
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      out.push({ q, r });
      q += dirs[i][0];r += dirs[i][1];
    }
  }
  return out;
}
function layoutHoney(size) {
  const n = SPORTS.length;
  let cells = [];
  for (let radius = 0; cells.length < n; radius++) {
    const ring = hexRing(radius);
    if (cells.length + ring.length <= n) {
      cells = cells.concat(ring);
    } else {
      const need = n - cells.length;
      const step = ring.length / need;
      for (let i = 0; i < need; i++) cells.push(ring[Math.round(i * step) % ring.length]);
    }
  }
  return SPORTS.map((s, i) => {
    const { q, r } = cells[i];
    return {
      ...s,
      x: size * (q + r / 2),
      y: size * (Math.sqrt(3) / 2) * r
    };
  });
}

const POSITIONS = layoutHoney(SPACING);

// Neighbour pairs (adjacent discs ~SPACING apart) for the constellation mesh.
const EDGES = (() => {
  const out = [];
  for (let i = 0; i < POSITIONS.length; i++)
  for (let j = i + 1; j < POSITIONS.length; j++)
  if (Math.hypot(POSITIONS[i].x - POSITIONS[j].x, POSITIONS[i].y - POSITIONS[j].y) < SPACING * 1.15)
  out.push([i, j]);
  return out;
})();

// pan clamp bounds: every disc must be reachable to the centre (+margin).
const BOUNDS = (() => {
  const xs = POSITIONS.map((c) => c.x),ys = POSITIONS.map((c) => c.y);
  const m = SPACING * 0.55;
  return {
    x: [-Math.max(...xs) - m, -Math.min(...xs) + m],
    y: [-Math.max(...ys) - m, -Math.min(...ys) + m]
  };
})();
const clampPan = (p) => ({
  x: clamp(p.x, BOUNDS.x[0], BOUNDS.x[1]),
  y: clamp(p.y, BOUNDS.y[0], BOUNDS.y[1])
});

// ── A single disc ────────────────────────────────────────────────────────────
// Quiet luxury: the whole cluster is near-monochrome — barely-there bubbles
// with hairline rims and dim grey glyphs. The centred disc isn't painted, it's
// LIT: same dark material, a fine lime ring, a soft glow, and the glyph turns
// full-bright. Selection reads as light hitting the disc, not a colour fill.
//
// Perf: memoized with a threshold comparator (below) so the 19 discs skip
// re-rendering for invisible sub-pixel fisheye changes, and the 30-frame logo
// stack only mounts once focus has SETTLED (~0.25s) — a fast fling ratcheting
// through discs never pays the mount/unmount cost.
const Disc = React.memo(function Disc({ cell, scale, opacity, focused, attract, pulseAnim, onSelect }) {const A = useArenaColors();const d = useThemedStyles(makeD);
  // Icon renders at a fixed size; the whole disc is scaled via transform.
  const iconSize = cell.featured ? 36 : 31;
  const glyph = focused ? A.ink : A.inkDim;
  // Springy pop each time this disc ratchets into focus.
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (focused) {
      pop.setValue(0.78);
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
    }
  }, [focused, pop]);
  // Play the logo only after focus settles, not while discs ratchet past.
  const [play, setPlay] = useState(false);
  useEffect(() => {
    if (!focused) { setPlay(false); return; }
    const t = setTimeout(() => setPlay(true), 250);
    return () => clearTimeout(t);
  }, [focused]);
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => onSelect(cell)}
      style={{
        position: 'absolute',
        left: -CELL / 2,
        top: -CELL / 2,
        width: CELL,
        height: CELL,
        opacity,
        transform: [{ scale }]
      }}>
      {focused &&
      <Animated.View
        pointerEvents="none"
        style={[d.pulse, {
          opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0] }),
          transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }]
        }]} />

      }
      <Animated.View style={[
      d.disc,
      focused && d.discFocused,
      { transform: [{ scale: pop }] }]
      }>
        {hasSportAnim(cell.id) ?
        <SportLogoIcon id={cell.id} size={CELL + 6} color={glyph} active={play || attract} /> :
        <SportIcon id={cell.id} size={iconSize} color={glyph} />}
      </Animated.View>
    </TouchableOpacity>);

}, (prev, next) =>
  prev.cell.id === next.cell.id &&
  prev.focused === next.focused &&
  prev.attract === next.attract &&
  prev.onSelect === next.onSelect &&
  Math.abs(prev.scale - next.scale) < 0.012 &&
  Math.abs(prev.opacity - next.opacity) < 0.03
);

// Open centred on the last-played sport (in-session; fresh launch → cricket).
const initialArena = () => {
  const selId = getSelectedSport().sport?.id;
  const cell = POSITIONS.find((p) => p.id === selId);
  return cell ? { id: cell.id, pan: { x: -cell.x, y: -cell.y } } : { id: 'cricket', pan: { x: 0, y: 0 } };
};

export default function SportPickerScreen({ navigation }) {const A = useArenaColors();const s = useThemedStyles(makeS);const me = useCurrentUser();
  const { toggle, isDark } = useTheme();
  const initial = useRef(initialArena()).current;
  const [panOff, setPanOff] = useState(initial.pan);
  const [dim, setDim] = useState({ w: SW, h: 560 });
  const [focusId, setFocusId] = useState(initial.id);

  const panRef = useRef({ ...initial.pan });
  const velRef = useRef({ x: 0, y: 0 });
  const startRef = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const movedRef = useRef(false);
  const focusRef = useRef(initial.id);
  const rafRef = useRef(null);
  const intRef = useRef(null);
  const animRef = useRef(null);

  // readout slide-up on focus change
  const readoutAnim = useRef(new Animated.Value(1)).current;
  // focused-disc glow pulse (loops) + per-disc entrance scale-in
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const enterAnims = useRef(POSITIONS.map(() => new Animated.Value(0))).current;
  // headline fade-up, choreographed with the disc ripple
  const titleAnim = useRef(new Animated.Value(0)).current;
  // centre stage-light breathing (slow 0.72↔1 opacity loop) × a flare that
  // spikes when a new disc ratchets into focus — the light reacts to you.
  const glowAnim = useRef(new Animated.Value(1)).current;
  const flareAnim = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(Animated.multiply(glowAnim, flareAnim)).current;
  useEffect(() => {
    const breath = Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 0.72, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    breath.start();
    return () => breath.stop();
  }, [glowAnim]);

  // Idle attract: after ~7s untouched, a random disc quietly plays its logo
  // for a beat — the cluster feels inhabited (Watch-style breathing gallery).
  const lastTouchRef = useRef(Date.now());
  const [attractId, setAttractId] = useState(null);
  useEffect(() => {
    const iv = setInterval(() => {
      if (Date.now() - lastTouchRef.current < 6500) return;
      const pool = POSITIONS.filter((p) => p.id !== focusRef.current && hasSportAnim(p.id));
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick) {
        setAttractId(pick.id);
        setTimeout(() => setAttractId(null), 2600);
      }
    }, 7000);
    return () => clearInterval(iv);
  }, []);

  const stopInertia = () => {
    if (intRef.current) {cancelAnimationFrame(intRef.current);intRef.current = null;}
  };
  const stopAnim = () => {
    if (animRef.current) {cancelAnimationFrame(animRef.current);animRef.current = null;}
  };

  // During a drag we coalesce moves to one state commit per frame (rAF throttle).
  const schedulePan = useCallback((x, y) => {
    lastTouchRef.current = Date.now();
    panRef.current = { x, y };
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setPanOff({ ...panRef.current });
      });
    }
  }, []);

  // Animation loops already run on a frame, so they commit directly (no nested rAF).
  const commitPan = useCallback((x, y) => {
    panRef.current = { x, y };
    setPanOff({ x, y });
  }, []);

  // ── focus = nearest disc to centre; updates readout ──
  useEffect(() => {
    let best = null,bestD = Infinity;
    for (const c of POSITIONS) {
      const d2 = Math.hypot(panOff.x + c.x, panOff.y + c.y);
      if (d2 < bestD) {bestD = d2;best = c;}
    }
    if (best && best.id !== focusRef.current) {
      focusRef.current = best.id;
      setFocusId(best.id);
      // light haptic "tick" as each disc ratchets into focus (Android only —
      // iOS Vibration has no short-tick duration and would feel heavy).
      if (Platform.OS === 'android') Vibration.vibrate(8);
      readoutAnim.setValue(0);
      Animated.timing(readoutAnim, {
        toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true
      }).start();
      // stage light flares as the selection lands, then settles into its breath
      flareAnim.setValue(1.5);
      Animated.timing(flareAnim, {
        toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true
      }).start();
    }
  }, [panOff, readoutAnim, flareAnim]);

  // ── eased pan animation (tap-to-centre, spring-back, magnetic snap) ──
  // rAF-driven and vsync-aligned; progress is measured from the real frame
  // timestamp so the easing curve stays smooth on any refresh rate.
  const animateTo = useCallback((target, dur, cb, easeFn) => {
    stopInertia();
    stopAnim();
    const from = { ...panRef.current };
    const ease = easeFn || ((x) => 1 - Math.pow(1 - x, 3));
    let t0 = null;
    const tick = (now) => {
      if (t0 == null) t0 = now;
      const k = clamp((now - t0) / dur, 0, 1);
      const e = ease(k);
      commitPan(from.x + (target.x - from.x) * e, from.y + (target.y - from.y) * e);
      if (k < 1) {animRef.current = requestAnimationFrame(tick);} else
      {animRef.current = null;cb && cb();}
    };
    animRef.current = requestAnimationFrame(tick);
  }, [commitPan]);

  // ── magnetic snap: glide whichever disc is nearest centre exactly onto it ──
  const snapToNearest = useCallback(() => {
    let best = null,bestD = Infinity;
    for (const c of POSITIONS) {
      const d2 = Math.hypot(panRef.current.x + c.x, panRef.current.y + c.y);
      if (d2 < bestD) {bestD = d2;best = c;}
    }
    if (best) animateTo({ x: -best.x, y: -best.y }, 260);
  }, [animateTo]);

  // ── inertia with edge clamp; snaps to the nearest disc once it settles ──
  // Frame-rate-independent: decay and travel scale by real elapsed time (dt),
  // so the glide feels identical at 60Hz and 120Hz and never jumps after a stall.
  const startInertia = useCallback(() => {
    stopInertia();
    let last = null;
    const tick = (now) => {
      if (last == null) last = now;
      const dt = Math.min(now - last, 48) || 16; // clamp dt (e.g. after a stall)
      last = now;
      const k = dt / 16; // 1 == a nominal 60Hz frame
      const f = Math.pow(0.92, k); // per-frame friction, time-scaled
      velRef.current.x *= f;
      velRef.current.y *= f;
      const np = {
        x: panRef.current.x + velRef.current.x * k,
        y: panRef.current.y + velRef.current.y * k
      };
      const cl = clampPan(np);
      if (cl.x !== np.x) velRef.current.x = 0;
      if (cl.y !== np.y) velRef.current.y = 0;
      commitPan(cl.x, cl.y);
      if (Math.hypot(velRef.current.x, velRef.current.y) < 0.4) {intRef.current = null;snapToNearest();} else
      {intRef.current = requestAnimationFrame(tick);}
    };
    intRef.current = requestAnimationFrame(tick);
  }, [commitPan, snapToNearest]);

  useEffect(() => () => {stopInertia();stopAnim();}, []);

  // looping glow pulse on the focused disc + one-shot entrance scale-in
  useEffect(() => {
    const pulse = Animated.loop(Animated.sequence([
    Animated.timing(pulseAnim, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    Animated.timing(pulseAnim, { toValue: 0, duration: 0, useNativeDriver: true })]
    ));
    pulse.start();
    // Curtain up: discs ripple outward from the centre (delay ∝ radius)
    // while the headline fades up in step with the first ring.
    Animated.parallel(enterAnims.map((a, i) =>
    Animated.spring(a, {
      toValue: 1, friction: 6, tension: 70, useNativeDriver: true,
      delay: Math.hypot(POSITIONS[i].x, POSITIONS[i].y) * 1.15,
    })
    )).start();
    Animated.timing(titleAnim, {
      toValue: 1, duration: 520, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true
    }).start();
    return () => pulse.stop();
  }, [pulseAnim, enterAnims, titleAnim]);

  // rubber-band: drift past bounds with resistance (Apple-Watch edge bounce)
  const rb = (v, lo, hi) => v < lo ? lo + (v - lo) * 0.42 : v > hi ? hi + (v - hi) * 0.42 : v;

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
    onPanResponderGrant: () => {
      stopInertia();
      stopAnim();
      movedRef.current = true;
      startRef.current = { px: panRef.current.x, py: panRef.current.y };
      velRef.current = { x: 0, y: 0 };
    },
    onPanResponderMove: (_, g) => {
      const nx = rb(startRef.current.px + g.dx, BOUNDS.x[0], BOUNDS.x[1]);
      const ny = rb(startRef.current.py + g.dy, BOUNDS.y[0], BOUNDS.y[1]);
      velRef.current.x = velRef.current.x * 0.6 + (nx - panRef.current.x) * 0.4;
      velRef.current.y = velRef.current.y * 0.6 + (ny - panRef.current.y) * 0.4;
      schedulePan(nx, ny);
    },
    onPanResponderRelease: () => {
      const cl = clampPan(panRef.current);
      if (cl.x !== panRef.current.x || cl.y !== panRef.current.y) {
        animateTo(cl, 320, snapToNearest); // spring back from overscroll, then snap
      } else {
        startInertia();
      }
      setTimeout(() => {movedRef.current = false;}, 0);
    },
    onPanResponderTerminate: () => {startInertia();movedRef.current = false;}
  })).current;

  // Tapping a disc only centres/selects it (updates focus + readout).
  // Entering the sport happens via the START button.
  const selectCell = useCallback((cell) => {
    lastTouchRef.current = Date.now();
    if (movedRef.current) return;
    const target = { x: -cell.x, y: -cell.y };
    // Scale duration with travel distance so a nearby disc settles quickly while a
    // far one glides in smoothly & slowly. Ease-in-out gives a gentle start + landing.
    const dist = Math.hypot(target.x - panRef.current.x, target.y - panRef.current.y);
    const dur = clamp(dist * 3.4, 300, 1150);
    const easeInOut = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    animateTo(target, dur, undefined, easeInOut);
  }, [animateTo]);

  const routeSport = useCallback((cell) => {
    const sport = { ...cell, label: cell.name, icon: cell.mci };
    // Record the chosen sport on the user's profile (no-op if not logged in).
    legendsApi.selectPrimarySport(cell.id);
    // Rummy opens its dedicated Pool-Rummy score-board flow. Reset (not push) so the
    // Arena picker isn't left underneath — back must not return to sport selection.
    if (cell.id === 'rummy') {
      navigation.reset({ index: 0, routes: [{ name: 'RummyHome' }] });
      return;
    }
    // Cricket skips the "select format" screen and goes straight into the app.
    // Reset so the Arena picker isn't left under MainApp (back must not return here).
    if (cell.id === 'cricket') {
      navigation.reset({ index: 0, routes: [{ name: 'MainApp', params: { sport } }] });
    } else {
      navigation.push('SportSetup', { sport });
    }
  }, [navigation]);

  const onGridLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    setDim({ w: width, h: height });
  }, []);

  const cx = dim.w / 2,cy = dim.h / 2;
  const focus = useMemo(() => SPORTS.find((s) => s.id === focusId) || SPORTS[0], [focusId]);

  // Fisheye layout for the current pan offset. useMemo so non-pan re-renders
  // (focus tick, attract, glow) reuse the identical array and the memoized
  // Discs bail out instantly.
  const discs = useMemo(() => POSITIONS.map((c) => {
    const sx = panOff.x + c.x,sy = panOff.y + c.y;
    const t = Math.hypot(sx, sy) / FALLOFF;
    let s = MIN_SCALE + (MAX_SCALE - MIN_SCALE) / (1 + t * t * 1.35);
    if (c.featured) s = Math.min(MAX_SCALE * 1.16, s * 1.14);
    s = clamp(s, MIN_SCALE, MAX_SCALE * 1.16);
    const opacity = clamp((s - MIN_SCALE) / (MAX_SCALE - MIN_SCALE) * 1.1 + 0.32, 0.32, 1);
    return { cell: c, left: cx + c.x + panOff.x, top: cy + c.y + panOff.y, scale: s, opacity };
  }), [panOff.x, panOff.y, cx, cy]);

  return (
    <View style={s.root}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={A.navy0} />

      {/* Lime room-light wash behind the header — the Arena is the app's
          lime-branded space. Dimmer in light mode to protect title contrast. */}
      <Svg pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0 }} width="100%" height={320}>
        <Defs>
          <RadialGradient id="floodlight" cx="50%" cy="0%" r="75%">
            <Stop offset="0" stopColor={A.lime} stopOpacity={isDark ? 0.1 : 0.06} />
            <Stop offset="1" stopColor={A.lime} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="320" fill="url(#floodlight)" />
      </Svg>

      {/* ── TOP BAR ── */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
            <Path d="M14 4 7 11l7 7" stroke={A.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
        <Text style={s.brand}>LOCAL LEGENDS</Text>
        <TouchableOpacity
          style={[s.avatar, { marginRight: 8 }]}
          activeOpacity={0.8}
          onPress={toggle}
        >
          <Icon name={isDark ? 'white-balance-sunny' : 'weather-night'} size={18} color={A.ink} />
        </TouchableOpacity>
        {/* Just the user's photo — display only, no navigation on tap. */}
        <View style={s.avatar}>
          {me?.avatarUrl
            ? <Image source={{ uri: me.avatarUrl }} style={s.avatarImg} />
            : <Svg width={20} height={20} viewBox="0 0 20 20" fill={A.inkDim}>
                <Path d="M10 3.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z" />
                <Path d="M3.5 18a6.5 6.5 0 0 1 13 0Z" />
              </Svg>}
        </View>
      </View>

      {/* ── TITLE — static; the lit disc alone says what's selected ── */}
      <Animated.View style={[s.titleBlock, {
        opacity: titleAnim,
        transform: [{ translateY: titleAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      }]}>
        <Text style={s.title1}>CHOOSE YOUR</Text>
        <Text style={s.title2}>ARENA</Text>
      </Animated.View>

      {/* ── HONEYCOMB ── */}
      <View style={s.grid} onLayout={onGridLayout} {...panResponder.panHandlers}>
        {/* Lime stage light at the centre — breathes slowly, flares when a new
            disc lands, and parallaxes at ~1/3 pan speed for depth. */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, {
            opacity: glowOpacity,
            transform: [{ translateX: panOff.x * 0.35 }, { translateY: panOff.y * 0.35 }],
          }]}>
          <Svg width={dim.w} height={dim.h}>
            <Defs>
              <RadialGradient id="arenaGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={A.lime} stopOpacity={0.16} />
                <Stop offset="1" stopColor={A.lime} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={cx} cy={cy} r={185} fill="url(#arenaGlow)" />
          </Svg>
        </Animated.View>
        {/* faint constellation mesh between neighbouring discs. Coordinates are
            rounded to whole pixels so rn-svg skips native updates for
            sub-pixel pan deltas — the lines are too faint for it to show. */}
        <Svg pointerEvents="none" width={dim.w} height={dim.h} style={StyleSheet.absoluteFill}>
          {EDGES.map(([i, j], k) => {
            const a = discs[i],b = discs[j];
            const o = Math.min(a.opacity, b.opacity);
            if (o < 0.42) return null; // skip edges fading out near the rim
            return (
              <Line
                key={k}
                x1={Math.round(a.left)} y1={Math.round(a.top)}
                x2={Math.round(b.left)} y2={Math.round(b.top)}
                stroke={A.lime} strokeWidth={1} strokeOpacity={Math.round((o - 0.3) * 0.09 * 100) / 100} />);


          })}
        </Svg>
        {discs.map(({ cell, left, top, scale, opacity }, i) =>
        <Animated.View
          key={cell.id}
          pointerEvents="box-none"
          style={{
            position: 'absolute', left, top,
            zIndex: 1000 + Math.round(scale * 100),
            opacity: enterAnims[i],
            transform: [{ scale: enterAnims[i] }]
          }}>
            <Disc
            cell={cell}
            scale={scale}
            opacity={opacity}
            focused={cell.id === focusId}
            attract={cell.id === attractId}
            pulseAnim={pulseAnim}
            onSelect={selectCell} />
          
          </Animated.View>
        )}

        {/* edge melt: outer discs dissolve into the background instead of
            hard-clipping at the stage bounds */}
        <Svg pointerEvents="none" width={dim.w} height={54}
          style={{ position: 'absolute', top: 0, left: 0, zIndex: 3000 }}>
          <Defs>
            <LinearGradient id="meltTop" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={A.navy0} stopOpacity={1} />
              <Stop offset="1" stopColor={A.navy0} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="54" fill="url(#meltTop)" />
        </Svg>
        <Svg pointerEvents="none" width={dim.w} height={54}
          style={{ position: 'absolute', bottom: 0, left: 0, zIndex: 3000 }}>
          <Defs>
            <LinearGradient id="meltBot" x1="0" y1="1" x2="0" y2="0">
              <Stop offset="0" stopColor={A.navy0} stopOpacity={1} />
              <Stop offset="1" stopColor={A.navy0} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="54" fill="url(#meltBot)" />
        </Svg>
      </View>

      {/* ── START — solid electric-blue, names the selection ── */}
      <View style={s.startDock}>
        <TouchableOpacity
          style={s.startSolid}
          activeOpacity={0.88}
          onPress={() => { haptic.impact(); routeSport(focus); }}>
          <Text style={s.startSolidTxt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            START {focus.name.toUpperCase()}
          </Text>
          <Icon name="play" size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>);

}

const makeD = (A) => StyleSheet.create({
  // Barely-there bubble: 5% fill, hairline rim. The cluster reads as one
  // quiet, precise object — no colour until the light lands on a disc.
  disc: {
    width: CELL, height: CELL, borderRadius: CELL / 2,
    borderWidth: 1, borderColor: A.ink + '1A',
    backgroundColor: A.ink + '0D',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',   // clip the square animation frame to the disc circle
  },
  // Lit, not painted: same dark material, a fine lime ring + soft glow.
  // Lit by the lime stage light: lime-tinted glass, fine lime ring, lime glow.
  discFocused: {
    borderWidth: 1.5, borderColor: A.lime, backgroundColor: A.lime + '1A',
    shadowColor: A.lime, shadowOpacity: 0.45, shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 }, elevation: 9,
  },
  pulse: {
    position: 'absolute', left: 0, top: 0, width: CELL, height: CELL,
    borderRadius: CELL / 2, borderWidth: 1, borderColor: A.lime
  }
});

const makeS = (A) => StyleSheet.create({
  root: { flex: 1, backgroundColor: A.navy0 },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 18, paddingBottom: 2
  },
  backBtn: { padding: 6, marginLeft: -6 },
  brand: { flex: 1, marginLeft: 8, fontSize: 16, fontWeight: '900', color: A.ink, letterSpacing: 1 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: A.cellHi, alignItems: 'center', justifyContent: 'center'
  },
  avatarImg: { width: 36, height: 36, borderRadius: 18 },

  titleBlock: { alignItems: 'center', paddingTop: 8, paddingBottom: 6, paddingHorizontal: 24 },
  // Editorial type: a quiet tracked kicker over a big clean white headline —
  // scale contrast does the work, not colour or italics.
  title1: { fontSize: 11, fontWeight: '700', color: A.textMuted, letterSpacing: 4.5, marginBottom: 6 },
  // Lime Signature (approved mock, option 4): the Arena is the app's
  // lime-branded room — italic lime headline over a muted tracked kicker.
  title2: { fontSize: 42, fontWeight: '900', color: A.lime, letterSpacing: 1, fontStyle: 'italic', lineHeight: 46 },

  grid: { flex: 1, overflow: 'hidden' },

  // Solid electric-blue START — the screen's one loud element, kept tailored:
  // tighter radius, restrained glow, tracked label.
  startDock: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 30 },
  startSolid: {
    height: 56, borderRadius: 16, backgroundColor: A.blueDeep,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: A.blueDeep, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 14, elevation: 8
  },
  startSolidTxt: { fontSize: 15, fontWeight: '800', color: '#ffffff', letterSpacing: 3 }
});