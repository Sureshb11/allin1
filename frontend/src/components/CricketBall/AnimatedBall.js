// ─────────────────────────────────────────────────────────────────────────────
// AnimatedCricketBall — Phase 2 motion engine for the signature ball.
//
// Two layers from the supplied art (assets/ball):
//   ball_layer.png — the two-tone leather ball, transparent bg (603×603)
//   ring_layer.png — the blue energy ring alone (875×256, luminance alpha)
//
// The RING IS COMPLETELY STATIC — it never animates. It is drawn twice: full
// ring behind the ball, then just its front (lower) arc clipped in front, so
// the ball's foot sits inside it exactly like the reference render.
//
// Only the BALL moves:
//   float  gentle 3–4px 2.5s sine hover
//   tap    compress → 360° spin flick → spring back (+ haptic)
//
// All animation is transform-only with useNativeDriver; loops pause when the
// app is backgrounded.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef } from 'react';
import { View, Image, Animated, Easing, Pressable, AppState } from 'react-native';
import haptic from '../../utils/haptics';

const BALL = require('../../../assets/ball/ball_layer.png');
const RING = require('../../../assets/ball/ring_layer.png');

// Ring geometry (fractions of ring_layer.png):
const RING_AR   = 256 / 875;   // height / width
const RING_CY   = 0.457;       // ellipse centre line within the image
const CORE_FRAC = 783 / 875;   // bright core width / image width
// Reference calibration: ring core ≈ 0.973 × ball diameter.
const RING_SCALE = 0.973 / CORE_FRAC;

export default function AnimatedCricketBall({ size = 64, onPress, style }) {
  const ringW = size * RING_SCALE;
  const ringH = ringW * RING_AR;
  const W = Math.max(size, ringW);
  const ringTop = size - ringH * RING_CY;   // ball bottom on the ring centre line
  const H = ringTop + ringH;
  const ballLeft = (W - size) / 2;
  const ringLeft = (W - ringW) / 2;
  const floatAmp = Math.min(4, Math.max(2, size * 0.04));

  const float = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const rot   = useRef(new Animated.Value(0)).current;
  const loop  = useRef(null);

  const startLoop = () => {
    stopLoop();
    loop.current = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 1250, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 1250, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.current.start();
  };
  const stopLoop = () => { loop.current?.stop(); loop.current = null; };

  useEffect(() => {
    startLoop();
    const sub = AppState.addEventListener('change', (s) =>
      s === 'active' ? startLoop() : stopLoop());
    return () => { sub.remove(); stopLoop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTap = () => {
    haptic.tick?.();
    rot.setValue(0);
    Animated.sequence([
      Animated.spring(press, { toValue: 0.88, speed: 40, bounciness: 0, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(rot,   { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(press, { toValue: 1.06, speed: 20, bounciness: 6, useNativeDriver: true }),
      ]),
      Animated.spring(press, { toValue: 1, speed: 14, bounciness: 12, useNativeDriver: true }),
    ]).start();
    onPress?.();
  };

  const ballY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -floatAmp] });
  const spin  = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Pressable onPress={onTap} style={[{ width: W, height: H }, style]}
      accessibilityRole="button" accessibilityLabel="Score a match">
      {/* static ring — back arc (full image) behind the ball */}
      <Image source={RING}
        style={{ position: 'absolute', left: ringLeft, top: ringTop, width: ringW, height: ringH }} />
      {/* the ball — the only thing that moves */}
      <Animated.Image
        source={BALL}
        style={{ position: 'absolute', left: ballLeft, top: 0, width: size, height: size,
                 transform: [{ translateY: ballY }, { scale: press }, { rotate: spin }] }}
      />
      {/* static ring — front (lower) arc clipped in front of the ball's foot */}
      <View pointerEvents="none"
        style={{ position: 'absolute', left: ringLeft, top: ringTop + ringH * RING_CY,
                 width: ringW, height: ringH * (1 - RING_CY), overflow: 'hidden' }}>
        <Image source={RING}
          style={{ position: 'absolute', top: -ringH * RING_CY, width: ringW, height: ringH }} />
      </View>
    </Pressable>
  );
}
