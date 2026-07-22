// SportPickerScreen — "Choose Your Arena" honeycomb picker.
// Ported from the design handoff (design_handoff_arena), V2 "Spotlight":
// an Apple-Watch-style honeycomb of sport discs the user drags to pan, with a
// fisheye falloff (centre disc largest, edges shrink & fade). The centred disc
// is the current selection; the headline + a solid-blue START button reflect it.
//
// Note: the design calls for the Anton/Archivo fonts, which aren't bundled in
// this app — we match the existing screens' approach (heavy system weight +
// letter-spacing) instead. Tapping a disc keeps the app's navigation contract
// (→ straight into MainApp with the chosen sport).

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Dimensions, PanResponder, Animated, Easing, Vibration, Platform, Image, Alert } from
'react-native';
import Svg, { Path, Line, Circle, Rect, Defs, RadialGradient, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCurrentUser } from '../utils/currentUser';
import SportIcon from '../components/SportIcon';
import SportLogoIcon, { hasSportAnim } from '../components/SportLogoIcon';
import { haptic } from '../utils/haptics';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport, setSelectedSport } from '../utils/selectedSport';
import { isSportLive } from '../sports';
import { rawSportColor, sportColor } from '../sports/colors';
import { useTheme, useThemedStyles, useArenaColors } from '../theme/ThemeContext';
import BrandLogo from '../components/BrandLogo';

const { width: SW } = Dimensions.get('window');

// ── ARENA palette (from design_handoff_arena/app/data.jsx) ──────────────────








// Sports — index 0 is the focal point (Cricket), then rings outward.
// `mci` = a MaterialCommunityIcons fallback name so the downstream
// downstream screens that render sport.icon keep working.
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
  const { isDark } = useTheme();
  // The lit disc takes the sport's own signature colour (matching the ARENA
  // title + stage glow), so each selection feels like its own arena.
  const accent = sportAccent(cell.id, isDark, A.lime);
  // Not-yet-shipped sports stay visible (they preview the roadmap) but sit back:
  // dimmer glyph plus a small build marker, so the cluster reads at a glance.
  const live = isSportLive(cell.id);
  // Icon renders at a fixed size; the whole disc is scaled via transform.
  const iconSize = cell.featured ? 38 : 33;
  // Legible at rest — near-ink instead of dim grey, so every sport reads clearly
  // on the pale stage; full-ink once lit. Focus is carried by the lime ring/glow.
  const glyph = live ? (focused ? A.ink : A.ink + 'C8') : (focused ? A.ink + 'B0' : A.ink + '66');
  // Springy pop each time this disc ratchets into focus; the focused disc also
  // rests a touch larger, so the selection reads as physically raised off the mat.
  const FOCUS_SCALE = 1.12;
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (focused) {
      pop.setValue(0.82);
      Animated.spring(pop, { toValue: FOCUS_SCALE, friction: 4, tension: 160, useNativeDriver: true }).start();
    } else {
      Animated.timing(pop, { toValue: 1, duration: 180, useNativeDriver: true }).start();
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
        style={[d.pulse, { borderColor: accent,
          opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0] }),
          transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }]
        }]} />

      }
      <Animated.View style={[
      d.disc,
      focused && d.discFocused,
      focused && { borderColor: accent, backgroundColor: accent + '26', shadowColor: accent },
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


// The sport colours above are neon — tuned for a dark stage. On the light
// theme they'd be invisible, so darken to a readable ink while keeping the hue
// (proportional RGB scale down to a target luminance). Lets the ARENA title
// take on each sport's colour in both themes.
function readableInk(hex) {
  const h = hex.replace('#', '');
  let r = parseInt(h.slice(0, 2), 16);
  let g = parseInt(h.slice(2, 4), 16);
  let b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const target = 0.42;
  if (lum > target) {
    const f = target / lum;
    r = Math.round(r * f); g = Math.round(g * f); b = Math.round(b * f);
  }
  // hex so callers can append '33'-style alpha suffixes
  const to2 = (v) => v.toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/** The sport's own accent, readable on the current theme. */
const sportAccent = (id, isDark) => sportColor(id, isDark);

/** Linear mix of two #rrggbb colours (t=0 → a, t=1 → b). */
function mixHex(a, b, t) {
  const px = (h, i) => parseInt(h.slice(i, i + 2), 16);
  const ha = a.replace('#', ''), hb = b.replace('#', '');
  const to2 = (v) => Math.round(v).toString(16).padStart(2, '0');
  return '#' + [0, 2, 4].map((i) => to2(px(ha, i) + (px(hb, i) - px(ha, i)) * t)).join('');
}

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
  const btnPulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const breath = Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 0.72, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    breath.start();

    const btnPulse = Animated.loop(Animated.sequence([
      Animated.timing(btnPulseAnim, { toValue: 1.04, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(btnPulseAnim, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    btnPulse.start();

    return () => { breath.stop(); btnPulse.stop(); };
  }, [glowAnim, btnPulseAnim]);

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
    // Publish the selection to the app-wide singleton BEFORE navigating. Every
    // sport-scoped screen reads this to filter its data, and it used to be set
    // only by the old format screen — so entering cricket (which already
    // skipped that screen) left it null and the feeds fell back to unfiltered.
    setSelectedSport(sport, null);
    // Rummy opens its dedicated Pool-Rummy score-board flow. Reset (not push) so the
    // Arena picker isn't left underneath — back must not return to sport selection.
    if (cell.id === 'rummy') {
      navigation.reset({ index: 0, routes: [{ name: 'RummyHome' }] });
      return;
    }
    // Every other sport goes straight to its feed. Choosing a match format is
    // part of creating a match (StartMatch already asks), not of entering a
    // sport, so the old SportSetup step in between was just friction.
    navigation.reset({ index: 0, routes: [{ name: 'MainApp', params: { sport } }] });
  }, [navigation]);

  // Unfinished sport: say so plainly rather than dropping the user into a
  // half-built flow. Sports go live one at a time via LIVE_SPORTS in src/sports.
  const showComingSoon = useCallback((cell) => {
    Alert.alert(
      `${cell.name} is coming soon`,
      `We're building ${cell.name} out properly — scoring, stats and teams. Cricket is ready to play now.`,
      [{ text: 'Got it' }],
    );
  }, []);

  const onGridLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    setDim({ w: width, h: height });
  }, []);

  const cx = dim.w / 2,cy = dim.h / 2;
  const focus = useMemo(() => SPORTS.find((s) => s.id === focusId) || SPORTS[0], [focusId]);
  const focusLive = isSportLive(focus.id);

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
    
    // 3D Spherical Wrap: Tilt discs slightly away from the camera based on distance from center
    const tiltStrength = 0.08;
    const rotateX = `${clamp(sy * tiltStrength, -40, 40)}deg`;
    const rotateY = `${clamp(-sx * tiltStrength, -40, 40)}deg`;

    return { cell: c, left: cx + c.x + panOff.x, top: cy + c.y + panOff.y, scale: s, opacity, rotateX, rotateY };
  }), [panOff.x, panOff.y, cx, cy]);

  const moodColor = rawSportColor(focus.id);
  // ARENA title tint: the neon colour on dark, a readable darkened hue on light.
  // sportColor() already returns a theme-correct value (and keeps cricket on
  // the brand green rather than darkening a neon), so no readableInk pass.
  const moodInk = sportColor(focus.id, isDark);

  return (
    <View style={s.root}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={A.navy0} />

      {/* Sport-specific room-light wash behind the header. */}
      <Svg pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0 }} width="100%" height={320}>
        <Defs>
          <RadialGradient id="floodlight" cx="50%" cy="0%" r="75%">
            <Stop offset="0" stopColor={moodColor} stopOpacity={isDark ? 0.15 : 0.08} />
            <Stop offset="1" stopColor={moodColor} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="320" fill="url(#floodlight)" />
      </Svg>

      {/* ── TOP BAR ── */}
      <View style={s.topBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
              <Path d="M14 4 7 11l7 7" stroke={A.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
          {/* The brand logo stays the house cricket-green here — it's the app's
              identity, not the focused sport. Pin it explicitly, because the
              committed theme accent (BrandLogo's default) could be any sport. */}
          <BrandLogo scale={0.8} textColor={A.ink} badgeColor={sportColor('cricket', isDark)} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
      </View>

      {/* ── TITLE — 3D parallax effect against the honeycomb ── */}
      <Animated.View style={[s.titleBlock, {
        opacity: titleAnim,
        transform: [
          { translateY: titleAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
          { translateX: panOff.x * -0.05 },
          { translateY: panOff.y * -0.05 }
        ],
      }]}>
        <Text style={s.title1}>CHOOSE YOUR</Text>
        {/* ARENA as SVG display type: true 900 weight (the app's bundled font
            is single-weight, so RN Text can't go heavy), a vertical gradient in
            the sport's colour, a soft neon halo on dark, and a speed-line
            underline. Pops with each new selection via readoutAnim. */}
        <Animated.View style={{
          // pop each time a new sport lands in focus (ties into the colour swap)
          transform: [{ scale: readoutAnim.interpolate({ inputRange: [0, 1], outputRange: [1.09, 1] }) }],
        }}>
          <Svg width={320} height={68} viewBox="0 0 320 68">
            <Defs>
              <LinearGradient id="arenaType" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={isDark ? mixHex(moodColor, '#ffffff', 0.55) : mixHex(moodInk, '#ffffff', 0.18)} />
                <Stop offset="1" stopColor={moodInk} />
              </LinearGradient>
            </Defs>
            {isDark &&
            <SvgText x="160" y="46" textAnchor="middle" fontSize="48" fontWeight="900"
              letterSpacing="4" fill="none" stroke={moodColor} strokeWidth="7"
              strokeOpacity="0.13">ARENA</SvgText>}
            <SvgText x="160" y="46" textAnchor="middle" fontSize="48" fontWeight="900"
              letterSpacing="4" fill="url(#arenaType)">ARENA</SvgText>
            {/* speed lines — motion streak under the wordmark */}
            <Rect x="96" y="58" width="104" height="3.5" rx="1.75" fill={moodInk} />
            <Rect x="206" y="58" width="18" height="3.5" rx="1.75" fill={moodInk} opacity="0.5" />
          </Svg>
        </Animated.View>
      </Animated.View>

      {/* ── HONEYCOMB ── */}
      <View style={s.grid} onLayout={onGridLayout} {...panResponder.panHandlers}>
        {/* Dynamic stage light at the centre — breathes slowly, flares when a new
            disc lands, and parallaxes at ~1/3 pan speed for depth. */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, {
            opacity: glowOpacity,
            transform: [{ translateX: panOff.x * 0.35 }, { translateY: panOff.y * 0.35 }],
          }]}>
          <Svg width={dim.w} height={dim.h}>
            <Defs>
              <RadialGradient id="arenaGlow" cx="50%" cy="50%" r="55%">
                <Stop offset="0" stopColor={moodColor} stopOpacity={isDark ? 0.3 : 0.17} />
                <Stop offset="0.5" stopColor={moodColor} stopOpacity={isDark ? 0.1 : 0.06} />
                <Stop offset="1" stopColor={moodColor} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={cx} cy={cy} r={235} fill="url(#arenaGlow)" />
          </Svg>
        </Animated.View>

        {/* Vignette — the stage darkens toward the edges so the spotlit centre
            reads as the focal point instead of a flat field. */}
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={dim.w} height={dim.h}>
          <Defs>
            <RadialGradient id="vignette" cx="50%" cy="42%" r="72%">
              <Stop offset="0.5" stopColor={A.navy0} stopOpacity={0} />
              <Stop offset="1" stopColor={isDark ? '#000000' : A.ink} stopOpacity={isDark ? 0.38 : 0.07} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={dim.w} height={dim.h} fill="url(#vignette)" />
        </Svg>
        {discs.map(({ cell, left, top, scale, opacity, rotateX, rotateY }, i) =>
        <Animated.View
          key={cell.id}
          pointerEvents="box-none"
          style={{
            position: 'absolute', left, top,
            zIndex: 1000 + Math.round(scale * 100),
            opacity: enterAnims[i],
            transform: [
              { perspective: 1000 },
              { rotateX },
              { rotateY },
              { scale: enterAnims[i] }
            ]
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
        {/* tag chip — the sport's discipline in its signature colour, slides
            up with each new selection */}
        <Animated.View style={[s.tagBadge, {
          borderColor: moodInk + '59', backgroundColor: moodInk + '14',
          opacity: readoutAnim,
          transform: [{ translateY: readoutAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        }]}>
          <Text style={[s.tagText, { color: moodInk }]}>
            {focusLive ? (focus.tag || '').toUpperCase() : 'IN THE NETS'}
          </Text>
        </Animated.View>
        {/* Only finished sports can be entered; the rest read as Coming Soon and
            sit still (no pulse) so the button doesn't invite a tap. */}
        <Animated.View style={{ transform: [{ scale: focusLive ? btnPulseAnim : 1 }] }}>
          <TouchableOpacity
            style={[s.startSolid,
              // The button wears the sport you're about to enter — same colour
              // as its disc, the ARENA title and the stage glow, so the choice
              // carries through instead of every sport sharing one green.
              focusLive && { backgroundColor: moodInk, shadowColor: moodInk },
              !focusLive && s.startSoon]}
            activeOpacity={focusLive ? 0.88 : 1}
            onPress={() => {
              haptic.impact();
              if (focusLive) return routeSport(focus);
              showComingSoon(focus);
            }}>
            <Text style={[s.startSolidTxt, !focusLive && s.startSoonTxt]}
              numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {focusLive ? `PLAY ${focus.name.toUpperCase()}` : 'COMING SOON'}
            </Text>
            <Icon name={focusLive ? 'play' : 'progress-wrench'} size={20}
              color={focusLive ? '#ffffff' : A.textMuted} />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>);

}

const makeD = (A) => StyleSheet.create({
  // Barely-there bubble: 5% fill, hairline rim. The cluster reads as one
  // quiet, precise object — no colour until the light lands on a disc.
  // Tangible glass bubble: a defined rim + faint fill lift it off the stage.
  // NB: no elevation/shadow here — Android renders an elevation shadow through
  // a translucent background as a dark rim + bright centre, which reads as a
  // white circle baked behind the glyph.
  disc: {
    width: CELL, height: CELL, borderRadius: CELL / 2,
    borderWidth: 1, borderColor: A.ink + '2E',
    backgroundColor: A.ink + '14',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',   // clip the square animation frame to the disc circle
  },
  // Lit, not painted: lime-tinted glass, a bold lime ring, and a strong lime
  // glow so the centred selection clearly pops out of the pack.
  discFocused: {
    borderWidth: 2, borderColor: A.lime, backgroundColor: A.lime + '26',
    shadowColor: A.lime, shadowOpacity: 0.6, shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 }, elevation: 14,
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
  title2: { fontSize: 48, fontWeight: '900', color: A.lime, letterSpacing: 2, lineHeight: 52 },

  grid: { flex: 1, overflow: 'hidden' },

  // Solid electric-blue START — the screen's one loud element, kept tailored:
  // tighter radius, restrained glow, tracked label.
  startDock: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 30 },
  startSolid: {
    alignSelf: 'center', paddingHorizontal: 40,
    height: 56, borderRadius: 16, backgroundColor: A.blueDeep,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: A.blueDeep, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 14, elevation: 8
  },
  startSolidTxt: { fontSize: 15, fontWeight: '800', color: '#ffffff', letterSpacing: 3 },
  // Not-yet-shipped sport: a quiet outlined slab instead of the loud solid CTA,
  // so it reads as unavailable at a glance rather than as a broken button.
  startSoon: {
    backgroundColor: 'transparent',
    borderWidth: 1.5, borderColor: A.textMuted + '66',
    shadowOpacity: 0, elevation: 0,
  },
  startSoonTxt: { color: A.textMuted },
  tagBadge: {
    alignSelf: 'center', marginBottom: 16,
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: 20, backgroundColor: A.lime + '1A',
    borderWidth: 1, borderColor: A.lime + '40',
    shadowColor: A.lime, shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }
  },
  tagText: { color: A.lime, fontSize: 11, fontWeight: '800', letterSpacing: 2 }
});