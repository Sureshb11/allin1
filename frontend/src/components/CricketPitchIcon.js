// CricketPitchIcon — animated flat-design cricket scene for the Arena picker.
// A minimal side-on pitch: bowler winds up and releases (left), the ball
// travels the strip with a little bounce, and the batsman swings just as it
// arrives (right). Stumps stay static; the crease lines carry a soft pulse.
//
// RN has no CSS/Tailwind, so the loop is driven by a single Animated master
// value (2.4s, JS driver — react-native-svg props aren't native-animatable)
// interpolated into arm/ball/bat keyframes. `active` gates the loop so the
// honeycomb stays cheap: unfocused discs show a static frame of the scene.
//
//   <CricketPitchIcon size={40} color={A.navy0} active />

import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { G, Rect, Line, Circle } from 'react-native-svg';

const AG = Animated.createAnimatedComponent(G);
const ACircle = Animated.createAnimatedComponent(Circle);
const ALine = Animated.createAnimatedComponent(Line);

const VB_W = 64, VB_H = 46;

export default function CricketPitchIcon({ size = 40, color = '#0a0e18', ball = '#ef4444', active = false }) {
  const t = useRef(new Animated.Value(0)).current;      // master timeline 0→1
  const glow = useRef(new Animated.Value(0)).current;   // crease pulse

  useEffect(() => {
    if (!active) { t.stopAnimation(); glow.stopAnimation(); t.setValue(0.72); glow.setValue(0.5); return; }
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: false })
    );
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      Animated.timing(glow, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
    ]));
    t.setValue(0);
    loop.start();
    pulse.start();
    return () => { loop.stop(); pulse.stop(); };
  }, [active, t, glow]);

  // ── Keyframes off the master timeline ─────────────────────────────────────
  // Bowler arm: windmill over the shoulder, release at t≈0.30.
  const armRot = t.interpolate({
    inputRange: [0, 0.08, 0.30, 0.42, 1],
    outputRange: [-150, -150, 40, 55, 55],
  });
  // Ball: hidden until release, crosses the strip, one gentle bounce mid-pitch.
  const ballX = t.interpolate({
    inputRange: [0, 0.30, 0.74, 1],
    outputRange: [13, 13, 50, 50],
  });
  const ballY = t.interpolate({
    inputRange: [0, 0.30, 0.52, 0.60, 0.74, 1],
    outputRange: [22, 22, 30.5, 26.5, 24, 24],
  });
  const ballOpacity = t.interpolate({
    inputRange: [0, 0.29, 0.31, 0.72, 0.76, 1],
    outputRange: [0, 0, 1, 1, 0, 0],
  });
  // Bat: waits in backlift, swings through exactly as the ball arrives (t≈0.74).
  const batRot = t.interpolate({
    inputRange: [0, 0.60, 0.70, 0.80, 0.92, 1],
    outputRange: [24, 24, 38, -46, 24, 24],
  });
  // Crease glow pulse.
  const creaseOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.30, 0.95] });
  const creaseHalo = glow.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.28] });

  const sw = 2.6; // limb stroke
  return (
    <Svg width={size} height={size * (VB_H / VB_W)} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      {/* pitch strip */}
      <Rect x="5" y="31" width="54" height="7" rx="3.5" fill={color} opacity="0.16" />

      {/* crease lines — halo underneath + pulsing core */}
      <ALine x1="12" y1="29" x2="12" y2="40" stroke={color} strokeWidth="4.5" strokeLinecap="round" opacity={creaseHalo} />
      <ALine x1="52" y1="29" x2="52" y2="40" stroke={color} strokeWidth="4.5" strokeLinecap="round" opacity={creaseHalo} />
      <ALine x1="12" y1="30" x2="12" y2="39" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity={creaseOpacity} />
      <ALine x1="52" y1="30" x2="52" y2="39" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity={creaseOpacity} />

      {/* stumps — static, both ends */}
      {[15.5, 18, 20.5].map((x) => (
        <Line key={`sl${x}`} x1={x} y1="23.5" x2={x} y2="31.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      ))}
      {[43.5, 46, 48.5].map((x) => (
        <Line key={`sr${x}`} x1={x} y1="23.5" x2={x} y2="31.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      ))}
      <Line x1="14.6" y1="23.2" x2="21.4" y2="23.2" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <Line x1="42.6" y1="23.2" x2="49.4" y2="23.2" stroke={color} strokeWidth="1.2" strokeLinecap="round" />

      {/* bowler (left of the strip) */}
      <Circle cx="8" cy="10.5" r="3.1" fill={color} />
      <Line x1="8" y1="14" x2="8" y2="24" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <Line x1="8" y1="24" x2="4.6" y2="31.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <Line x1="8" y1="24" x2="11.6" y2="31.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      {/* bowling arm — rotates around the shoulder (8,15.5) */}
      <AG origin="8, 15.5" rotation={armRot}>
        <Line x1="8" y1="15.5" x2="8" y2="23.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      </AG>

      {/* ball */}
      <ACircle cx={ballX} cy={ballY} r="2" fill={ball} opacity={ballOpacity} />

      {/* batsman (right of the strip, facing the bowler) */}
      <Circle cx="56.5" cy="11" r="3.1" fill={color} />
      <Line x1="56.5" y1="14.5" x2="56.5" y2="24.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <Line x1="56.5" y1="24.5" x2="53.4" y2="31.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <Line x1="56.5" y1="24.5" x2="59.6" y2="31.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      {/* bat — swings around the hands (55,18) through the ball's arrival */}
      <AG origin="55, 18" rotation={batRot}>
        <Line x1="55" y1="18" x2="55" y2="27.5" stroke={color} strokeWidth="3.4" strokeLinecap="round" />
      </AG>
    </Svg>
  );
}
