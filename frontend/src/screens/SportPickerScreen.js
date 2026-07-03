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

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Dimensions, PanResponder, Animated, Easing, Vibration, Platform } from
'react-native';
import Svg, { Path, Line, Circle, Rect, Defs, RadialGradient, Stop } from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import SportIcon from '../components/SportIcon';
import SportLogoIcon, { hasSportAnim } from '../components/SportLogoIcon';
import { haptic } from '../utils/haptics';
import legendsApi from '../services/LegendsApi';
import { getSport } from '../sports';
import { getSelectedSport, setSelectedSport } from '../utils/selectedSport';

const { width: SW } = Dimensions.get('window');

// Darken a hex colour (light mode needs deeper accents to stay readable in sun).
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1, 7), 16);
  const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

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

// Per-sport accent from the sports registry — one source of truth with the
// rest of the app (feeds, scoring). Fallback: the Arena's bright lime.
const SPORT_ACCENT = Object.fromEntries(
  SPORTS.map((sp) => [sp.id, getSport(sp.id)?.accent || '#c4f82a'])
);


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

// ── A single disc (memo-free; cheap enough for 22 cells/frame) ──────────────
// Apple-Watch feel: every sport is a full-colour token — accent-tinted fill and
// coloured glyph at rest; the focused disc goes SOLID accent (dark glyph on it)
// with a springy "pop" and a matching pulse ring.
function Disc({ cell, accent, scale, opacity, focused, pulseAnim, onPress }) {const A = useArenaColors();const d = useThemedStyles(makeD);
  // Icon renders at a fixed size; the whole disc is scaled via transform.
  const iconSize = cell.featured ? 36 : 31;
  // Springy pop each time this disc ratchets into focus.
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (focused) {
      pop.setValue(0.78);
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
    }
  }, [focused, pop]);
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
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
        style={[d.pulse, { borderColor: accent,
          opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
          transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.75] }) }]
        }]} />

      }
      <Animated.View style={[
      d.disc,
      // Full-colour tokens read clearly even in direct sun.
      focused ?
      { borderColor: accent, backgroundColor: accent } :
      { borderColor: accent + '66', backgroundColor: accent + '1C' },
      { transform: [{ scale: pop }] }]
      }>
        {hasSportAnim(cell.id) ?
        <SportLogoIcon id={cell.id} size={CELL - 6} color={focused ? A.navy0 : accent} active={focused} /> :
        <SportIcon id={cell.id} size={iconSize} color={focused ? A.navy0 : accent} />}
      </Animated.View>
    </TouchableOpacity>);

}

export default function SportPickerScreen({ navigation }) {const A = useArenaColors();const s = useThemedStyles(makeS);
  const { toggle, isDark } = useTheme();
  const [panOff, setPanOff] = useState({ x: 0, y: 0 });
  const [dim, setDim] = useState({ w: SW, h: 560 });
  const [focusId, setFocusId] = useState('cricket');

  const panRef = useRef({ x: 0, y: 0 });
  const velRef = useRef({ x: 0, y: 0 });
  const startRef = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const movedRef = useRef(false);
  const focusRef = useRef('cricket');
  const rafRef = useRef(null);
  const intRef = useRef(null);
  const animRef = useRef(null);

  // readout slide-up on focus change
  const readoutAnim = useRef(new Animated.Value(1)).current;
  // focused-disc glow pulse (loops) + per-disc entrance scale-in
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const enterAnims = useRef(POSITIONS.map(() => new Animated.Value(0))).current;

  const stopInertia = () => {
    if (intRef.current) {cancelAnimationFrame(intRef.current);intRef.current = null;}
  };
  const stopAnim = () => {
    if (animRef.current) {cancelAnimationFrame(animRef.current);animRef.current = null;}
  };

  // During a drag we coalesce moves to one state commit per frame (rAF throttle).
  const schedulePan = useCallback((x, y) => {
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
    }
  }, [panOff, readoutAnim]);

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
    Animated.stagger(26, enterAnims.map((a) =>
    Animated.spring(a, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true })
    )).start();
    return () => pulse.stop();
  }, [pulseAnim, enterAnims]);

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
  const focusIdx = SPORTS.findIndex((s) => s.id === focusId);
  // Per-sport accents, darkened in light mode so they hold up in sunlight.
  const accentOf = useCallback((id) => isDark ? SPORT_ACCENT[id] : shade(SPORT_ACCENT[id], 0.62), [isDark]);
  const focusAccent = accentOf(focus.id);

  // per-frame fisheye for each disc, computed from current pan offset
  const discs = POSITIONS.map((c) => {
    const sx = panOff.x + c.x,sy = panOff.y + c.y;
    const t = Math.hypot(sx, sy) / FALLOFF;
    let s = MIN_SCALE + (MAX_SCALE - MIN_SCALE) / (1 + t * t * 1.35);
    if (c.featured) s = Math.min(MAX_SCALE * 1.16, s * 1.14);
    s = clamp(s, MIN_SCALE, MAX_SCALE * 1.16);
    const opacity = clamp((s - MIN_SCALE) / (MAX_SCALE - MIN_SCALE) * 1.1 + 0.32, 0.32, 1);
    return { cell: c, left: cx + c.x + panOff.x, top: cy + c.y + panOff.y, scale: s, opacity };
  });

  const readoutStyle = {
    opacity: readoutAnim,
    transform: [{ translateY: readoutAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }]
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={A.navy0} />

      {/* Electric-blue floodlight wash behind the header ("Stadium Under Lights").
          Dimmer in light mode so the title never loses contrast in sunlight. */}
      <Svg pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0 }} width="100%" height={320}>
        <Defs>
          <RadialGradient id="floodlight" cx="50%" cy="0%" r="75%">
            <Stop offset="0" stopColor={A.blueDeep} stopOpacity={isDark ? 0.26 : 0.1} />
            <Stop offset="1" stopColor={A.blueDeep} stopOpacity={0} />
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
        <TouchableOpacity
          style={s.avatar}
          activeOpacity={0.8}
          onPress={() => {
            // Open the (sport-aware) Profile inside MainApp. Use the user's ACTIVE
            // sport (selected-sport singleton) so the tab label + Profile's "Current
            // Sport" always agree; fall back to the focused disc and commit it if
            // nothing's been chosen yet. RESET (not push) so the Arena leaves the
            // stack — once in the app you can't Back to the picker; switch via Profile.
            const sel = getSelectedSport();
            const sport = sel.sport || { ...focus, label: focus.name, icon: focus.mci };
            setSelectedSport(sport, sel.format || null);
            navigation.reset({
              index: 0,
              routes: [{
                name: 'MainApp',
                params: { sport },
                state: { index: 0, routes: [{ name: 'ProfileTab', params: { initialSport: sport } }] }
              }]
            });
          }}>
          <Svg width={20} height={20} viewBox="0 0 20 20" fill={A.inkDim}>
            <Path d="M10 3.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z" />
            <Path d="M3.5 18a6.5 6.5 0 0 1 13 0Z" />
          </Svg>
        </TouchableOpacity>
      </View>

      {/* ── TITLE — the arena line follows the focused sport ── */}
      <View style={s.titleBlock}>
        <Text style={s.title1}>CHOOSE YOUR</Text>
        <Animated.View style={[readoutStyle, { alignSelf: 'stretch', alignItems: 'center' }]}>
          <Text
            style={[s.title2, { color: focusAccent }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}>
            {focus.name.toUpperCase()}
          </Text>
          <View style={s.titleMetaRow}>
            <Text style={[s.titleTag, { color: focusAccent }]}>{focus.tag.toUpperCase()}</Text>
            <Text style={s.titleIdx}>{String(focusIdx + 1).padStart(2, '0')} / {SPORTS.length}</Text>
          </View>
        </Animated.View>
      </View>

      {/* ── HONEYCOMB ── */}
      <View style={s.grid} onLayout={onGridLayout} {...panResponder.panHandlers}>
        {/* depth layer: soft radial glow at centre + faint constellation mesh */}
        <Svg pointerEvents="none" width={dim.w} height={dim.h} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="arenaGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={focusAccent} stopOpacity={0.18} />
              <Stop offset="1" stopColor={focusAccent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={cx} cy={cy} r={175} fill="url(#arenaGlow)" />
          {EDGES.map(([i, j], k) => {
            const a = discs[i],b = discs[j];
            const o = Math.min(a.opacity, b.opacity);
            if (o < 0.42) return null; // skip edges fading out near the rim
            return (
              <Line
                key={k}
                x1={a.left} y1={a.top} x2={b.left} y2={b.top}
                stroke="#8ea3c8" strokeWidth={1} strokeOpacity={(o - 0.3) * 0.22} />);


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
            accent={accentOf(cell.id)}
            scale={scale}
            opacity={opacity}
            focused={cell.id === focusId}
            pulseAnim={pulseAnim}
            onPress={() => selectCell(cell)} />
          
          </Animated.View>
        )}
      </View>

      {/* ── START — solid electric-blue, full width ── */}
      <View style={s.startDock}>
        <TouchableOpacity
          style={s.startSolid}
          activeOpacity={0.88}
          onPress={() => { haptic.impact(); routeSport(focus); }}>
          <Text style={s.startSolidTxt}>START</Text>
          <Icon name="play" size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>);

}

const makeD = (A) => StyleSheet.create({
  disc: {
    width: CELL, height: CELL, borderRadius: CELL / 2,
    borderWidth: 2.5, backgroundColor: A.cell,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',   // clip the square animation frame to the disc circle
  },
  pulse: {
    position: 'absolute', left: 0, top: 0, width: CELL, height: CELL,
    borderRadius: CELL / 2, borderWidth: 2.5, borderColor: A.lime
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

  titleBlock: { alignItems: 'center', paddingTop: 8, paddingBottom: 6, paddingHorizontal: 24 },
  title1: { fontSize: 30, fontWeight: '900', color: A.ink, letterSpacing: 0.5 },
  title2: { fontSize: 40, fontWeight: '900', color: A.blueSoft, letterSpacing: 1, fontStyle: 'italic', lineHeight: 44 },
  titleMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  titleTag: { fontSize: 12, letterSpacing: 1.6, fontWeight: '800' },
  titleIdx: { fontSize: 12, color: A.textVariant, letterSpacing: 0.8, fontWeight: '700' },

  grid: { flex: 1, overflow: 'hidden' },

  // Solid electric-blue START — one unmissable action, sunlight-proof.
  startDock: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 },
  startSolid: {
    height: 58, borderRadius: 17, backgroundColor: A.blueDeep,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: A.blueDeep, shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45, shadowRadius: 16, elevation: 10
  },
  startSolidTxt: { fontSize: 17, fontWeight: '900', color: '#ffffff', letterSpacing: 2 }
});