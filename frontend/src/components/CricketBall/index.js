// ─────────────────────────────────────────────────────────────────────────────
// CricketBall — the app's signature object.
//
// A two-tone leather cricket ball: Test-red left hemisphere, limited-overs
// white right hemisphere, stitched seam on the meridian. Pure react-native-svg
// (no images, no native deps) so it renders identically at any size.
//
// Built in LAYERS so the motion engine (Phase 2) can animate each part with
// the native driver (transform/opacity only):
//   base   — two-tone leather + sphere shading (static)
//   seam   — stitch band (Phase 2: translates inside the circular mask → spin)
//   gloss  — specular highlight (static; sits above the seam like real shine)
//   shadow — ground ellipse (Phase 2: scales/fades against the float)
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import Svg, {
  Circle, Path, Ellipse, Rect, Defs,
  RadialGradient, LinearGradient, Stop, G, ClipPath,
} from 'react-native-svg';

// The signature ball — the full studio composition (ball + neon ring + floor
// glow) extracted from the reference render with luminance alpha. This is the
// app's identity object; the SVG below stays as a code-drawn fallback and as
// overlay layers for match reactions (pulses flash ON TOP of the baked ring).
const BALL_FULL = require('../../../assets/ball/ball_signature.png');
// Geometry of the render (fractions of the image): the leather ball spans
// 84.52% of the width; its top sits at 2.66% and bottom at 81.31% of height.
const IMG = { ballFrac: 0.8452, aspect: 795 / 760 };

// Leather palette (fixed — the ball is a physical object, not a themed control)
export const BALL = {
  redDeep:   '#7f1310',
  red:       '#b71c1c',
  redLight:  '#d4403a',
  white:     '#fafafa',
  whiteDim:  '#dcdcda',
  whiteDeep: '#bdbdb9',
  thread:    '#ecdcb8',
  threadDim: '#c9b183',
};

/** The ball face: two-tone leather, seam band, sphere shading. viewBox 0..100 */
export function BallFace({ seamShift = 0 }) {
  return (
    <Svg viewBox="0 0 100 100" width="100%" height="100%">
      <Defs>
        {/* leather depth per hemisphere */}
        <RadialGradient id="redSkin" cx="38" cy="36" r="70" gradientUnits="userSpaceOnUse">
          <Stop offset="0"   stopColor={BALL.redLight} />
          <Stop offset="0.5" stopColor={BALL.red} />
          <Stop offset="1"   stopColor={BALL.redDeep} />
        </RadialGradient>
        <RadialGradient id="whiteSkin" cx="62" cy="36" r="70" gradientUnits="userSpaceOnUse">
          <Stop offset="0"   stopColor="#ffffff" />
          <Stop offset="0.55" stopColor={BALL.white} />
          <Stop offset="1"   stopColor={BALL.whiteDeep} />
        </RadialGradient>
        {/* seam channel — the strip of natural leather between the stitch rows,
            like a real two-piece ball. It owns the red/white junction, so
            neither skin bleeds into the other. */}
        <LinearGradient id="channel" x1="0" y1="4" x2="0" y2="96" gradientUnits="userSpaceOnUse">
          <Stop offset="0"    stopColor="#ddcfae" />
          <Stop offset="0.35" stopColor="#efe4c8" />
          <Stop offset="0.7"  stopColor="#e2d4b0" />
          <Stop offset="1"    stopColor="#c9b990" />
        </LinearGradient>
        {/* sphere vignette — darkened limb sells the roundness */}
        <RadialGradient id="vignette" cx="42" cy="38" r="62" gradientUnits="userSpaceOnUse">
          <Stop offset="0"    stopColor="#000" stopOpacity="0" />
          <Stop offset="0.72" stopColor="#000" stopOpacity="0.05" />
          <Stop offset="0.92" stopColor="#000" stopOpacity="0.26" />
          <Stop offset="1"    stopColor="#000" stopOpacity="0.42" />
        </RadialGradient>
        <ClipPath id="face"><Circle cx="50" cy="50" r="48" /></ClipPath>
      </Defs>

      <G clipPath="url(#face)">
        {/* hemispheres */}
        <Path d="M50 2 A48 48 0 0 0 50 98 Z" fill="url(#redSkin)" />
        <Path d="M50 2 A48 48 0 0 1 50 98 Z" fill="url(#whiteSkin)" />

        {/* seam — a natural-leather stitch channel riding the meridian;
            seamShift lets the motion engine slide it for the rotation illusion */}
        <G transform={`translate(${seamShift},0)`}>
          {/* the channel itself, gently swelling with the sphere */}
          <Path d="M46.8 2.5 C 44.4 27, 44.4 73, 46.8 97.5 L 53.2 97.5 C 55.6 73, 55.6 27, 53.2 2.5 Z"
                fill="url(#channel)" />
          {/* recessed edges where leather meets thread */}
          <Path d="M46.8 2.5 C 44.4 27, 44.4 73, 46.8 97.5" stroke="#8f7a4e"
                strokeWidth="0.55" fill="none" opacity="0.75" />
          <Path d="M53.2 2.5 C 55.6 27, 55.6 73, 53.2 97.5" stroke="#8f7a4e"
                strokeWidth="0.55" fill="none" opacity="0.75" />
          {/* two rows of machine stitching — short angled ticks hugging each edge */}
          <G stroke="#9c8250" strokeWidth="0.8" strokeLinecap="round" opacity="0.95">
            <Path d="M46.2 9 l1.7 -1.1" /><Path d="M52.1 7.9 l1.7 1.1" />
            <Path d="M45.8 15 l1.7 -1.1" /><Path d="M52.5 13.9 l1.7 1.1" />
            <Path d="M45.5 21 l1.7 -1.0" /><Path d="M52.8 20 l1.7 1.0" />
            <Path d="M45.2 27 l1.8 -0.9" /><Path d="M53 26.1 l1.8 0.9" />
            <Path d="M45.1 33 l1.8 -0.8" /><Path d="M53.1 32.2 l1.8 0.8" />
            <Path d="M45 39 l1.8 -0.7" /><Path d="M53.2 38.3 l1.8 0.7" />
            <Path d="M45 45 l1.8 -0.6" /><Path d="M53.2 44.4 l1.8 0.6" />
            <Path d="M45 51 l1.8 -0.5" /><Path d="M53.2 50.5 l1.8 0.5" />
            <Path d="M45 57 l1.8 -0.5" /><Path d="M53.2 56.5 l1.8 0.5" />
            <Path d="M45.1 63 l1.8 -0.6" /><Path d="M53.1 62.4 l1.8 0.6" />
            <Path d="M45.2 69 l1.8 -0.7" /><Path d="M53 68.3 l1.8 0.7" />
            <Path d="M45.4 75 l1.8 -0.8" /><Path d="M52.8 74.2 l1.8 0.8" />
            <Path d="M45.7 81 l1.7 -0.9" /><Path d="M52.6 80.1 l1.7 0.9" />
            <Path d="M46.1 87 l1.7 -1.0" /><Path d="M52.2 86 l1.7 1.0" />
            <Path d="M46.6 93 l1.7 -1.1" /><Path d="M51.7 91.9 l1.7 1.1" />
          </G>
        </G>

        {/* faint quarter seams (real balls have them) — barely-there texture */}
        <Path d="M14 22 C 30 34, 30 66, 14 78" stroke="#000" strokeWidth="0.7"
              fill="none" opacity="0.07" />
        <Path d="M86 22 C 70 34, 70 66, 86 78" stroke="#000" strokeWidth="0.7"
              fill="none" opacity="0.06" />

        {/* sphere shading */}
        <Circle cx="50" cy="50" r="48" fill="url(#vignette)" />
      </G>
      {/* hairline rim so the white hemisphere holds its edge on bright grounds */}
      <Circle cx="50" cy="50" r="47.6" fill="none" stroke="#000" strokeOpacity="0.16" strokeWidth="0.8" />
    </Svg>
  );
}

/** Specular gloss — kept its own layer so it stays fixed while the seam moves */
export function BallGloss() {
  return (
    <Svg viewBox="0 0 100 100" width="100%" height="100%">
      <Defs>
        <RadialGradient id="spec" cx="36" cy="28" r="26" gradientUnits="userSpaceOnUse">
          <Stop offset="0"   stopColor="#fff" stopOpacity="0.72" />
          <Stop offset="0.4" stopColor="#fff" stopOpacity="0.22" />
          <Stop offset="1"   stopColor="#fff" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="rim" cx="68" cy="86" r="34" gradientUnits="userSpaceOnUse">
          <Stop offset="0"   stopColor="#fff" stopOpacity="0.10" />
          <Stop offset="0.6" stopColor="#fff" stopOpacity="0.03" />
          <Stop offset="1"   stopColor="#fff" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      {/* stadium-light key highlight, top-left */}
      <Ellipse cx="36" cy="28" rx="24" ry="18" fill="url(#spec)" />
      {/* soft bounce light on the lower limb */}
      <Ellipse cx="66" cy="84" rx="26" ry="14" fill="url(#rim)" />
    </Svg>
  );
}

/** Ground shadow — separate so the float loop can scale/fade it in counterphase */
export function BallShadow({ width = 100 }) {
  return (
    <Svg viewBox="0 0 100 26" width={width} height={width * 0.26}>
      <Defs>
        <RadialGradient id="ground" cx="50" cy="13" rx="46" ry="11" gradientUnits="userSpaceOnUse">
          <Stop offset="0"    stopColor="#000" stopOpacity="0.42" />
          <Stop offset="0.55" stopColor="#000" stopOpacity="0.18" />
          <Stop offset="1"    stopColor="#000" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Ellipse cx="50" cy="13" rx="46" ry="11" fill="url(#ground)" />
    </Svg>
  );
}

/** Energy ring — the neon-blue pedestal (#00AEEF→#00E5FF). Its own layer so the
    motion engine can pulse it (idle every 3s) and flash it on match events.
    No blur filters in react-native-svg → bloom is stacked strokes. */
export function BallRing({ width = 100 }) {
  return (
    <Svg viewBox="0 0 120 34" width={width} height={width * 0.284}>
      <Defs>
        <RadialGradient id="floor" cx="60" cy="17" rx="52" ry="13" gradientUnits="userSpaceOnUse">
          <Stop offset="0"   stopColor="#00AEEF" stopOpacity="0.16" />
          <Stop offset="0.7" stopColor="#00AEEF" stopOpacity="0.05" />
          <Stop offset="1"   stopColor="#00AEEF" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      {/* lit floor inside the ring */}
      <Ellipse cx="60" cy="17" rx="50" ry="12.5" fill="url(#floor)" />
      {/* bloom → core, wide to narrow */}
      <Ellipse cx="60" cy="17" rx="46" ry="10.5" fill="none" stroke="#00AEEF" strokeOpacity="0.10" strokeWidth="7" />
      <Ellipse cx="60" cy="17" rx="46" ry="10.5" fill="none" stroke="#00C4F5" strokeOpacity="0.22" strokeWidth="4" />
      <Ellipse cx="60" cy="17" rx="46" ry="10.5" fill="none" stroke="#00E5FF" strokeOpacity="0.55" strokeWidth="1.9" />
      <Ellipse cx="60" cy="17" rx="46" ry="10.5" fill="none" stroke="#bff4ff" strokeOpacity="0.95" strokeWidth="0.8" />
    </Svg>
  );
}

/**
 * The assembled still ball. size = the BALL's diameter in px (the image is a
 * touch wider/taller — the neon ring and floor glow extend past the leather).
 *
 * variant 'photo' (default): the exact reference render — ball, neon-blue ring
 *   and floor glow in one baked image. `ring`/`shadow` props are ignored
 *   (they're part of the render).
 * variant 'vector': code-drawn SVG fallback with separate ring/shadow layers.
 */
export default function CricketBall({ size = 64, shadow = true, ring = true, variant = 'photo', style }) {
  if (variant === 'photo') {
    const w = size / IMG.ballFrac;          // image box from ball diameter
    const h = w * IMG.aspect;
    return (
      <View style={[{ width: w, height: h }, style]}>
        <Image source={BALL_FULL} style={{ width: w, height: h }} resizeMode="contain" />
      </View>
    );
  }
  const ringW = size * 1.26;
  return (
    <View style={[{ width: ringW, alignItems: 'center' }, style]}>
      <View style={{ width: size, height: size, zIndex: 1 }}>
        <View style={StyleSheet.absoluteFill}><BallFace /></View>
        <View style={StyleSheet.absoluteFill} pointerEvents="none"><BallGloss /></View>
      </View>
      {(shadow || ring) && (
        <View style={{ marginTop: -size * 0.16, alignItems: 'center' }} pointerEvents="none">
          {shadow && <BallShadow width={size * 0.92} />}
          {ring && (
            <View style={shadow ? { marginTop: -size * 0.21 } : null}>
              <BallRing width={ringW} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}
