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
import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, Image, Animated, Easing, Pressable, AppState } from 'react-native';
import haptic from '../../utils/haptics';

// Green edition — the app-accent version of the signature composition
// (sources: assets/ball/ball_green.png + ring_green.png).
const BALL = require('../../../assets/ball/ball_layer_green.png');
const RING = require('../../../assets/ball/ring_layer_green.png');

// Ring geometry (fractions of ring_layer_green.png, 1229×386):
const RING_AR   = 386 / 1229;   // height / width
const RING_CY   = 0.482;        // main ellipse centre line within the image
const CORE_FRAC = 1038 / 1229;  // main bright-ring width / image width
// Calibration (from the reference render): ring core ≈ 0.973 × ball diameter.
const RING_SCALE = 0.973 / CORE_FRAC;

/**
 * spinOnTap: play the full compress→360°→spring on tap (default). LiveBall
 * turns this off — its tap opens the radial menu with just a soft press.
 * ref.react(type): match reactions — 'run' | 'four' | 'six' | 'wicket' | 'over'.
 */
export default forwardRef(function AnimatedCricketBall({ size = 64, onPress, spinOnTap = true, style }, ref) {
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
  const shake = useRef(new Animated.Value(0)).current;   // wicket wobble (-1..1)
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

  // ── motion vocabulary (shared by tap + match reactions) ──
  const bounce = (dip = 0.92, peak = 1.06) => Animated.sequence([
    Animated.spring(press, { toValue: dip,  speed: 40, bounciness: 0,  useNativeDriver: true }),
    Animated.spring(press, { toValue: peak, speed: 20, bounciness: 7,  useNativeDriver: true }),
    Animated.spring(press, { toValue: 1,    speed: 14, bounciness: 11, useNativeDriver: true }),
  ]);
  const doSpin = (duration = 380) => {
    rot.setValue(0);
    return Animated.timing(rot, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true });
  };
  const doShake = () => {
    shake.setValue(0);
    return Animated.sequence([
      Animated.timing(shake, { toValue: 1,    duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1,   duration: 90, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0.55, duration: 80, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0,    duration: 70, useNativeDriver: true }),
    ]);
  };

  // Match reactions (Phase 4 · spectator mode) — subtle by design: they support
  // the app's celebration overlays, never compete with them.
  useImperativeHandle(ref, () => ({
    react(type) {
      switch (type) {
        case 'four':   Animated.parallel([doSpin(430), bounce(0.95, 1.05)]).start(); break;
        case 'six':    Animated.parallel([doSpin(620), bounce(0.88, 1.12)]).start(); break;
        case 'wicket': doShake().start(); haptic.warn?.(); break;
        case 'over':   bounce(0.96, 1.05).start(); break;
        case 'run':
        default:       bounce(0.97, 1.03).start(); break;
      }
    },
  }));

  const onTap = () => {
    haptic.tick?.();
    if (spinOnTap) {
      Animated.sequence([
        Animated.spring(press, { toValue: 0.88, speed: 40, bounciness: 0, useNativeDriver: true }),
        Animated.parallel([
          doSpin(380),
          Animated.spring(press, { toValue: 1.06, speed: 20, bounciness: 6, useNativeDriver: true }),
        ]),
        Animated.spring(press, { toValue: 1, speed: 14, bounciness: 12, useNativeDriver: true }),
      ]).start();
    } else {
      bounce(0.93, 1.03).start();
    }
    onPress?.();
  };

  const ballY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -floatAmp] });
  const spin  = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const wob   = shake.interpolate({ inputRange: [-1, 1], outputRange: ['-8deg', '8deg'] });

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
                 transform: [{ translateY: ballY }, { scale: press }, { rotate: spin }, { rotate: wob }] }}
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
});
