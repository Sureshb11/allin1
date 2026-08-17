// The wagon wheel — one component, two jobs.
//
//   mode="capture"  the scorer taps where the ball went. One tap is a complete
//                   answer: the tap point carries BOTH a direction and a distance,
//                   so nobody has to answer two questions to record one shot.
//   mode="display"  the shots already stored, plotted. Spectators, the match
//                   summary and a player's profile all draw the same picture.
//
// Batter-hand aware throughout: the wedges stay where they are on the ground and
// the LABELS mirror, because a left-hander's cover is the same patch of grass as
// a right-hander's mid-wicket. See src/sports/cricket/wagonWheel.js.
//
// Bowler's end is at the TOP. 0° is straight past the bowler, clockwise positive.

import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Path, G, Line, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { zonesForHand, zoneFromAngle, wrapAngle } from '../sports/cricket/wagonWheel';

const RAD = Math.PI / 180;

/** Polar → screen. 0° is up (the bowler's end), degrees increase clockwise. */
const pt = (cx, cy, r, deg) => [
  cx + r * Math.sin(deg * RAD),
  cy - r * Math.cos(deg * RAD),
];

/** A pie wedge from `from` to `to`, walking clockwise. */
const wedgePath = (cx, cy, r, from, to) => {
  const span = to > from ? to - from : (360 - from) + to;
  const [x1, y1] = pt(cx, cy, r, from);
  const [x2, y2] = pt(cx, cy, r, to);
  // sweep=1 is clockwise once y points down, which matches our angle direction.
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
};

/**
 * Colour a plotted shot by what it produced.
 *
 * Runs are the thing a wagon wheel is read for, so a six and a single must not
 * look alike at a glance. A wicket is red because it is the one line on the
 * chart that is not about runs at all.
 */
const shotColor = (s, C) => {
  if (s.isWicket) return C.wicket;
  if (s.runs >= 6) return C.six;
  if (s.runs === 4) return C.four;
  if (s.runs === 0) return C.dot;
  return C.runs;
};

export default function WagonWheel({
  size = 280,
  hand = 'right',
  mode = 'display',
  shots = [],
  selectedZone = null,
  onPick,
  showLabels = true,
  style,
}) {
  const c = useTheme().colors;
  const [live, setLive] = useState(null);      // { angle, distance } under the finger

  const C = useMemo(() => ({
    field:   c.surfaceHigh,
    fieldAlt:c.surfaceHighest,
    line:    c.textMuted,
    label:   c.textMuted,
    pitch:   c.surface,
    accent:  c.lime,
    onAccent:c.bg,
    six:     c.lime,
    four:    c.limeBright,
    runs:    c.textMuted,
    dot:     c.surfaceHighest,
    // The app's single-accent rule: green carries everything, and red means only
    // wicket / live / danger. A wicket on the wheel is exactly that case.
    wicket:  c.wicketText || c.danger,
  }), [c]);

  const R = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const zones = useMemo(() => zonesForHand(hand), [hand]);

  // ── Touch → a shot ────────────────────────────────────────────────────────
  // The tap point gives the angle AND how far it carried, so one tap records the
  // whole shot. Dragging before letting go just refines the same two numbers,
  // which is why the handlers below all funnel into one function.
  const fromTouch = useCallback((e) => {
    const { locationX, locationY } = e.nativeEvent;
    const dx = locationX - cx;
    const dy = locationY - cy;
    const angle = wrapAngle(Math.atan2(dx, -dy) / RAD);
    // Clamped at the rope: a tap outside the circle is still a boundary, not a
    // shot that travelled 140% of the way to it.
    const distance = Math.min(100, Math.round((Math.hypot(dx, dy) / R) * 100));
    return { angle: Math.round(angle * 10) / 10, distance, zone: zoneFromAngle(angle, hand) };
  }, [cx, cy, R, hand]);

  const capture = mode === 'capture';
  const touch = capture ? {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: (e) => setLive(fromTouch(e)),
    onResponderMove:  (e) => setLive(fromTouch(e)),
    onResponderRelease: (e) => {
      const s = fromTouch(e);
      setLive(null);
      onPick?.(s);
    },
    onResponderTerminate: () => setLive(null),
  } : {};

  const activeZone = live?.zone || selectedZone;

  return (
    <View style={[{ width: size, height: size }, style]} {...touch}>
      <Svg width={size} height={size}>
        {/* Wedges. Alternating fills so sixteen segments read as sixteen without
            sixteen border lines fighting the plotted shots for attention. */}
        <G>
          {zones.map((z, i) => (
            <Path
              key={z.key}
              d={wedgePath(cx, cy, R, z.from, z.to)}
              fill={activeZone === z.key ? C.accent : (i % 2 ? C.fieldAlt : C.field)}
              fillOpacity={activeZone === z.key ? 0.9 : 1}
              stroke={C.line}
              strokeOpacity={0.18}
              strokeWidth={1}
            />
          ))}
        </G>

        {/* The 30-yard ring — the one line on a real field a viewer orients by. */}
        <Circle cx={cx} cy={cy} r={R * 0.52} fill="none" stroke={C.line} strokeOpacity={0.28} strokeWidth={1} />
        <Circle cx={cx} cy={cy} r={R} fill="none" stroke={C.line} strokeOpacity={0.45} strokeWidth={1.5} />

        {/* Zone names, on the ring where the fielders would be. */}
        {showLabels && zones.map((z) => {
          const [lx, ly] = pt(cx, cy, R * 0.78, z.mid);
          const fs = Math.max(7, size * 0.032);
          return (
            <SvgText
              key={z.key}
              x={lx} y={ly}
              // Centred with dy, not alignmentBaseline: that attribute is honoured
              // on iOS and quietly ignored by react-native-svg on Android, which
              // would hang every label off its own baseline on half the devices
              // this app runs on. 0.35em is the usual stand-in for middle.
              dy={fs * 0.35}
              fill={activeZone === z.key ? C.onAccent : C.label}
              fontSize={fs}
              fontWeight={activeZone === z.key ? '800' : '600'}
              textAnchor="middle"
            >
              {z.label.toUpperCase()}
            </SvgText>
          );
        })}

        {/* The pitch, drawn so "the bowler is at the top" is visible rather than
            something you have to be told. */}
        <G>
          <Line x1={cx} y1={cy} x2={cx} y2={cy - R * 0.34} stroke={C.pitch} strokeWidth={Math.max(6, size * 0.038)} strokeLinecap="round" />
          <Line x1={cx} y1={cy} x2={cx} y2={cy - R * 0.34} stroke={C.line} strokeOpacity={0.35} strokeWidth={1} />
        </G>

        {/* Stored shots. Drawn before the live one so the finger is never hidden. */}
        {mode === 'display' && shots.map((s, i) => {
          const [x, y] = pt(cx, cy, R * ((s.distance ?? 85) / 100), s.angle);
          const col = shotColor(s, C);
          return (
            <G key={s.id || i}>
              <Line x1={cx} y1={cy} x2={x} y2={y} stroke={col} strokeWidth={s.runs >= 4 || s.isWicket ? 2 : 1.2}
                    strokeOpacity={s.runs >= 4 || s.isWicket ? 0.95 : 0.5} strokeLinecap="round" />
              <Circle cx={x} cy={y} r={s.runs >= 6 ? 4 : s.runs === 4 ? 3.2 : 2.2} fill={col}
                      fillOpacity={s.runs >= 4 || s.isWicket ? 1 : 0.6} />
            </G>
          );
        })}

        {/* Where the finger is now, in capture mode. */}
        {live && (
          <G>
            {(() => {
              const [x, y] = pt(cx, cy, R * (live.distance / 100), live.angle);
              return (
                <>
                  <Line x1={cx} y1={cy} x2={x} y2={y} stroke={C.accent} strokeWidth={2.5} strokeLinecap="round" />
                  <Circle cx={x} cy={y} r={6} fill={C.accent} />
                </>
              );
            })()}
          </G>
        )}

        {/* The batter. Last, so nothing is drawn over the middle of the wheel. */}
        <Circle cx={cx} cy={cy} r={Math.max(4, size * 0.022)} fill={C.accent} />
      </Svg>
    </View>
  );
}

/** The hand indicator that belongs beside every wheel — the picture is ambiguous without it. */
export function HandBadge({ hand }) {
  const c = useTheme().colors;
  return (
    <View style={[hb.wrap, { backgroundColor: c.surfaceHigh, borderColor: c.surfaceHighest }]}>
      <Text style={[hb.text, { color: c.textMuted }]}>
        {String(hand).toLowerCase().startsWith('l') ? 'LEFT-HAND BAT' : 'RIGHT-HAND BAT'}
      </Text>
    </View>
  );
}

const hb = StyleSheet.create({
  wrap: { alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  text: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
});
