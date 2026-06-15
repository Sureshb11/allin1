// SportPickerScreen — "Choose Your Arena" honeycomb picker.
// Ported from the design handoff (design_handoff_arena), V2 "Spotlight":
// an Apple-Watch-style honeycomb of sport discs the user drags to pan, with a
// fisheye falloff (centre disc largest, edges shrink & fade). The centred disc
// is the current selection; a docked readout card + START button reflect it.
//
// Note: the design calls for the Anton/Archivo fonts, which aren't bundled in
// this app — we match the existing screens' approach (heavy system weight +
// letter-spacing) instead. Tapping a disc keeps the app's navigation contract
// (→ SportSetup with the chosen sport).

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Dimensions, PanResponder, Animated, Easing,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import SportIcon from '../components/SportIcon';
import legendsApi from '../services/LegendsApi';

const { width: SW } = Dimensions.get('window');

// ── ARENA palette (from design_handoff_arena/app/data.jsx) ──────────────────
const A = {
  navy0: '#0a0e18', navy1: '#0d1320', navy2: '#111a2b',
  cell: '#161f30', cellHi: '#1d2942',
  line: 'rgba(150,180,230,0.10)',
  ink: '#eaf0fb', inkDim: '#8a97b0',
  lime: '#c4f82a', lime2: '#a6e814',
};

// Sports — index 0 is the focal point (Cricket), then rings outward.
// `mci` = a MaterialCommunityIcons fallback name so the downstream
// SportSetupScreen (which renders sport.icon) keeps working.
const SPORTS = [
  { id: 'cricket',    name: 'Cricket',            tag: 'Bat & Ball',     featured: true, mci: 'cricket' },
  { id: 'football',   name: 'Football',           tag: '11-a-side',      mci: 'soccer' },
  { id: 'kabaddi',    name: 'Kabaddi',            tag: 'Raid & Tackle',  mci: 'run-fast' },
  { id: 'hockey',     name: 'Hockey',             tag: 'Field',          mci: 'hockey-sticks' },
  { id: 'badminton',  name: 'Badminton',          tag: 'Racquet',        mci: 'badminton' },
  { id: 'tennis',     name: 'Tennis',             tag: 'Racquet',        mci: 'tennis' },
  { id: 'basketball', name: 'Basketball',         tag: 'Court',          mci: 'basketball' },
  { id: 'volleyball', name: 'Volleyball',         tag: 'Court',          mci: 'volleyball' },
  { id: 'boxing',     name: 'Boxing',             tag: 'Combat',         mci: 'boxing-glove' },
  { id: 'wrestling',  name: 'Wrestling',          tag: 'Combat',         mci: 'arm-flex' },
  { id: 'tabletennis',name: 'Table Tennis',       tag: 'Paddle',         mci: 'table-tennis' },
  { id: 'khokho',     name: 'Kho-Kho',            tag: 'Chase',          mci: 'run' },
  { id: 'handball',   name: 'Handball',           tag: 'Court',          mci: 'handball' },
  { id: 'squash',     name: 'Squash',             tag: 'Racquet',        mci: 'tennis' },
  { id: 'pickleball', name: 'Pickleball',         tag: 'Paddle',         mci: 'table-tennis' },
  { id: 'judo',       name: 'Judo',               tag: 'Combat',         mci: 'karate' },
  { id: 'karate',     name: 'Karate',             tag: 'Combat',         mci: 'karate' },
  { id: 'golf',       name: 'Golf',               tag: 'Links',          mci: 'golf' },
  { id: 'archery',    name: 'Archery & Shooting', tag: 'Target',         mci: 'bullseye-arrow' },
  { id: 'bowling',    name: 'Bowling & Billiards',tag: 'Precision',      mci: 'bowling' },
  { id: 'snowboard',  name: 'Snowboarding',       tag: 'Snow',           mci: 'snowboard' },
  { id: 'rummy',      name: 'Rummy',              tag: '13 Cards',       scored: true, mci: 'cards-playing-outline' },
];

// ── Honeycomb params (V2 Spotlight) ─────────────────────────────────────────
const SPACING   = 78;   // neighbour distance
const CELL      = 62;   // disc design size
const FALLOFF   = 120;
const MIN_SCALE = 0.36;
const MAX_SCALE = 1;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ── Hex layout (axial coords) — fill whole rings from the centre, then spread
// any remainder evenly so the cluster stays one balanced blob (no stragglers).
function hexRing(radius) {
  if (radius === 0) return [{ q: 0, r: 0 }];
  const dirs = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  const out = [];
  let q = dirs[4][0] * radius, r = dirs[4][1] * radius;
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      out.push({ q, r });
      q += dirs[i][0]; r += dirs[i][1];
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
      y: size * (Math.sqrt(3) / 2) * r,
    };
  });
}

const POSITIONS = layoutHoney(SPACING);

// pan clamp bounds: every disc must be reachable to the centre (+margin).
const BOUNDS = (() => {
  const xs = POSITIONS.map(c => c.x), ys = POSITIONS.map(c => c.y);
  const m = SPACING * 0.55;
  return {
    x: [-Math.max(...xs) - m, -Math.min(...xs) + m],
    y: [-Math.max(...ys) - m, -Math.min(...ys) + m],
  };
})();
const clampPan = p => ({
  x: clamp(p.x, BOUNDS.x[0], BOUNDS.x[1]),
  y: clamp(p.y, BOUNDS.y[0], BOUNDS.y[1]),
});

// ── A single disc (memo-free; cheap enough for 22 cells/frame) ──────────────
function Disc({ cell, scale, opacity, focused, onPress }) {
  // Icon renders at a fixed size; the whole disc is scaled via transform.
  const iconSize = cell.featured ? 36 : 31;
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
        transform: [{ scale }],
      }}>
      <View style={[
        d.disc,
        focused ? d.discFocus : null,
        { borderColor: focused ? A.lime : 'transparent' },
      ]}>
        <SportIcon id={cell.id} size={iconSize} color={focused ? A.lime : 'rgba(196,248,42,0.9)'} />
      </View>
    </TouchableOpacity>
  );
}

export default function SportPickerScreen({ navigation }) {
  const [panOff, setPanOff] = useState({ x: 0, y: 0 });
  const [dim, setDim] = useState({ w: SW, h: 560 });
  const [focusId, setFocusId] = useState('cricket');

  const panRef   = useRef({ x: 0, y: 0 });
  const velRef   = useRef({ x: 0, y: 0 });
  const startRef = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const movedRef = useRef(false);
  const focusRef = useRef('cricket');
  const rafRef   = useRef(null);
  const intRef   = useRef(null);
  const animRef  = useRef(null);

  // readout slide-up on focus change
  const readoutAnim = useRef(new Animated.Value(1)).current;

  const stopInertia = () => {
    if (intRef.current) { clearInterval(intRef.current); intRef.current = null; }
  };
  const stopAnim = () => {
    if (animRef.current) { clearInterval(animRef.current); animRef.current = null; }
  };

  const schedulePan = useCallback((x, y) => {
    panRef.current = { x, y };
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setPanOff({ ...panRef.current });
      });
    }
  }, []);

  // ── focus = nearest disc to centre; updates readout ──
  useEffect(() => {
    let best = null, bestD = Infinity;
    for (const c of POSITIONS) {
      const d2 = Math.hypot(panOff.x + c.x, panOff.y + c.y);
      if (d2 < bestD) { bestD = d2; best = c; }
    }
    if (best && best.id !== focusRef.current) {
      focusRef.current = best.id;
      setFocusId(best.id);
      readoutAnim.setValue(0);
      Animated.timing(readoutAnim, {
        toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start();
    }
  }, [panOff, readoutAnim]);

  // ── inertia with edge clamp ──
  const startInertia = useCallback(() => {
    stopInertia();
    intRef.current = setInterval(() => {
      velRef.current.x *= 0.92;
      velRef.current.y *= 0.92;
      const np = { x: panRef.current.x + velRef.current.x, y: panRef.current.y + velRef.current.y };
      const cl = clampPan(np);
      if (cl.x !== np.x) velRef.current.x = 0;
      if (cl.y !== np.y) velRef.current.y = 0;
      schedulePan(cl.x, cl.y);
      if (Math.hypot(velRef.current.x, velRef.current.y) < 0.25) stopInertia();
    }, 16);
  }, [schedulePan]);

  // ── eased pan animation (tap-to-centre, spring-back) ──
  const animateTo = useCallback((target, dur, cb) => {
    stopInertia();
    stopAnim();
    const from = { ...panRef.current };
    const t0 = Date.now();
    const ease = x => 1 - Math.pow(1 - x, 3);
    animRef.current = setInterval(() => {
      const k = clamp((Date.now() - t0) / dur, 0, 1);
      const e = ease(k);
      schedulePan(from.x + (target.x - from.x) * e, from.y + (target.y - from.y) * e);
      if (k >= 1) { stopAnim(); cb && cb(); }
    }, 16);
  }, [schedulePan]);

  useEffect(() => () => { stopInertia(); stopAnim(); }, []);

  // rubber-band: drift past bounds with resistance (Apple-Watch edge bounce)
  const rb = (v, lo, hi) => (v < lo ? lo + (v - lo) * 0.42 : v > hi ? hi + (v - hi) * 0.42 : v);

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
        animateTo(cl, 320);          // spring back from overscroll
      } else {
        startInertia();
      }
      setTimeout(() => { movedRef.current = false; }, 0);
    },
    onPanResponderTerminate: () => { startInertia(); movedRef.current = false; },
  })).current;

  // Tapping a disc only centres/selects it (updates focus + readout).
  // Entering the sport happens via the START button.
  const selectCell = useCallback((cell) => {
    if (movedRef.current) return;
    animateTo({ x: -cell.x, y: -cell.y }, 300);
  }, [animateTo]);

  const routeSport = useCallback((cell) => {
    const sport = { ...cell, label: cell.name, icon: cell.mci };
    // Record the chosen sport on the user's profile (no-op if not logged in).
    legendsApi.selectPrimarySport(cell.id);
    // Rummy opens its dedicated Pool-Rummy scorecard (per the design handoff).
    if (cell.id === 'rummy') {
      navigation.push('RummyScorecard');
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

  const cx = dim.w / 2, cy = dim.h / 2;
  const focus = useMemo(() => SPORTS.find(s => s.id === focusId) || SPORTS[0], [focusId]);
  const focusIdx = SPORTS.findIndex(s => s.id === focusId);
  const nameSize = focus.name.length > 13 ? 19 : focus.name.length > 9 ? 23 : 27;

  // per-frame fisheye for each disc, computed from current pan offset
  const discs = POSITIONS.map((c) => {
    const sx = panOff.x + c.x, sy = panOff.y + c.y;
    const t = Math.hypot(sx, sy) / FALLOFF;
    let s = MIN_SCALE + (MAX_SCALE - MIN_SCALE) / (1 + t * t * 1.35);
    if (c.featured) s = Math.min(MAX_SCALE * 1.16, s * 1.14);
    s = clamp(s, MIN_SCALE, MAX_SCALE * 1.16);
    const opacity = clamp((s - MIN_SCALE) / (MAX_SCALE - MIN_SCALE) * 1.1 + 0.32, 0.32, 1);
    return { cell: c, left: cx + c.x + panOff.x, top: cy + c.y + panOff.y, scale: s, opacity };
  });

  const readoutStyle = {
    opacity: readoutAnim,
    transform: [{ translateY: readoutAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={A.navy0} />

      {/* ── TOP BAR ── */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
            <Path d="M14 4 7 11l7 7" stroke={A.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
        <Text style={s.brand}>LOCAL LEGENDS</Text>
        <View style={s.avatar}>
          <Svg width={20} height={20} viewBox="0 0 20 20" fill={A.inkDim}>
            <Path d="M10 3.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z" />
            <Path d="M3.5 18a6.5 6.5 0 0 1 13 0Z" />
          </Svg>
        </View>
      </View>

      {/* ── TITLE ── */}
      <View style={s.titleBlock}>
        <Text style={s.title1}>CHOOSE YOUR</Text>
        <Text style={s.title2}>ARENA</Text>
      </View>

      {/* ── HONEYCOMB ── */}
      <View style={s.grid} onLayout={onGridLayout} {...panResponder.panHandlers}>
        {/* centre-stage spotlight glow */}
        <View pointerEvents="none" style={[s.spotlight, { left: cx - 120, top: cy - 120 }]} />
        {discs.map(({ cell, left, top, scale, opacity }) => (
          <View key={cell.id} pointerEvents="box-none" style={{ position: 'absolute', left, top, zIndex: 1000 + Math.round(scale * 100) }}>
            <Disc
              cell={cell}
              scale={scale}
              opacity={opacity}
              focused={cell.id === focusId}
              onPress={() => selectCell(cell)}
            />
          </View>
        ))}
      </View>

      {/* ── READOUT CARD ── */}
      <View style={s.readoutWrap}>
        <View style={s.readout}>
          <Animated.View style={[s.readoutIcon, readoutStyle]}>
            <SportIcon id={focus.id} size={28} color={A.lime} />
          </Animated.View>
          <Animated.View style={[{ flex: 1, minWidth: 0 }, readoutStyle]}>
            <View style={s.readoutTagRow}>
              <Text style={s.readoutTag} numberOfLines={1}>{focus.tag.toUpperCase()}</Text>
              <Text style={s.readoutIdx}>
                {String(focusIdx + 1).padStart(2, '0')} / {SPORTS.length}
              </Text>
            </View>
            <Text style={[s.readoutName, { fontSize: nameSize }]} numberOfLines={1}>
              {focus.name.toUpperCase()}
            </Text>
          </Animated.View>
          <TouchableOpacity style={s.startBtn} activeOpacity={0.85} onPress={() => routeSport(focus)}>
            <Text style={s.startTxt}>START</Text>
            <Svg width={15} height={15} viewBox="0 0 18 18" fill={A.navy0}>
              <Path d="M5 3.5v11l9-5.5z" />
            </Svg>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const d = StyleSheet.create({
  disc: {
    width: CELL, height: CELL, borderRadius: CELL / 2,
    borderWidth: 2.5, backgroundColor: '#16203a',
    alignItems: 'center', justifyContent: 'center',
  },
  discFocus: { backgroundColor: '#27374f' },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: A.navy0 },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52, paddingHorizontal: 18, paddingBottom: 2,
  },
  backBtn: { padding: 6, marginLeft: -6 },
  brand: { flex: 1, marginLeft: 8, fontSize: 16, fontWeight: '900', color: A.ink, letterSpacing: 1 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: A.cellHi, alignItems: 'center', justifyContent: 'center',
  },

  titleBlock: { alignItems: 'center', paddingTop: 8, paddingBottom: 6 },
  title1: { fontSize: 30, fontWeight: '900', color: A.ink, letterSpacing: 0.5 },
  title2: { fontSize: 40, fontWeight: '900', color: A.lime, letterSpacing: 1, fontStyle: 'italic', lineHeight: 44 },

  grid: { flex: 1, overflow: 'hidden' },
  spotlight: {
    position: 'absolute', width: 240, height: 240, borderRadius: 120,
    backgroundColor: 'rgba(196,248,42,0.06)',
  },

  readoutWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 },
  readout: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: A.cellHi, borderRadius: 22, padding: 12,
    borderWidth: 1, borderColor: A.line,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
  },
  readoutIcon: {
    width: 50, height: 50, borderRadius: 15,
    backgroundColor: 'rgba(196,248,42,0.12)',
    borderWidth: 1, borderColor: 'rgba(196,248,42,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  readoutTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  readoutTag: { fontSize: 10, color: A.lime, letterSpacing: 1.4, fontWeight: '800' },
  readoutIdx: { fontSize: 10, color: A.inkDim, letterSpacing: 0.8, fontWeight: '700' },
  readoutName: { fontWeight: '900', color: A.ink, letterSpacing: 0.4, marginTop: 3 },

  startBtn: {
    height: 50, paddingHorizontal: 17, borderRadius: 15,
    backgroundColor: A.lime, flexDirection: 'row', alignItems: 'center', gap: 7,
  },
  startTxt: { fontSize: 15, fontWeight: '900', color: A.navy0, letterSpacing: 0.5 },
});
