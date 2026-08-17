// A batsman, playing the shot.
//
// Not an arrow and not a diagram — a figure in the stance, so the scorer picks
// the cut because it LOOKS like a cut. Twenty options in identical type is
// twenty things to read with the next ball being walked back to the mark; twenty
// postures is something you recognise at a glance.
//
// Drawn rather than photographed because it has to mirror. A left-hander's cover
// drive is the same stroke facing the other way, and a photo cannot flip without
// putting the bat in the wrong hand — the whole figure is reflected for a
// left-hander, which is exactly what the stroke does on the field.
//
// Everything is one 44×44 viewBox so the poses stay comparable: same ground
// line, same height, only the body changes.

import React from 'react';
import Svg, { Circle, Line, G, Path } from 'react-native-svg';

const RAD = Math.PI / 180;
const isLeft = (hand) => String(hand || '').toLowerCase().startsWith('l');

/**
 * One pose per stroke.
 *
 *   bat     — bat angle in degrees, 0 = straight up, growing clockwise. 180 is
 *             grounded in front of the stumps, 270 is horizontal to the off.
 *   hands   — where the top hand sits, as [x, y] in the viewBox.
 *   crouch  — 0 upright, 1 fully down (sweeps and scoops).
 *   stride  — how far the front foot is forward; drives stride, cuts do not.
 *   lean    — torso tilt, positive leaning forward into the ball.
 *
 * These are the postures of the strokes, not a coaching manual. The scorer is
 * recording what happened, and nothing validates a shot against its picture.
 */
const POSE = {
  defensive:     { bat: 178, hands: [23, 22], crouch: 0.25, stride: 0.5, lean: 10 },
  leave:         { bat: 8,   hands: [17, 13], crouch: 0,    stride: 0,   lean: -12 },
  beaten:        { bat: 200, hands: [25, 21], crouch: 0.1,  stride: 0.3, lean: 4 },
  other:         { bat: 170, hands: [22, 20], crouch: 0.1,  stride: 0.2, lean: 4 },

  drive:         { bat: 195, hands: [24, 19], crouch: 0.2,  stride: 0.9, lean: 16 },
  straightDrive: { bat: 186, hands: [23, 17], crouch: 0.15, stride: 1,   lean: 14 },
  coverDrive:    { bat: 214, hands: [26, 19], crouch: 0.2,  stride: 1,   lean: 16 },
  onDrive:       { bat: 160, hands: [20, 19], crouch: 0.2,  stride: 0.9, lean: 14 },
  squareDrive:   { bat: 238, hands: [27, 20], crouch: 0.25, stride: 0.7, lean: 12 },

  cut:           { bat: 268, hands: [27, 15], crouch: 0.15, stride: -0.4, lean: 2 },
  lateCut:       { bat: 292, hands: [26, 17], crouch: 0.3,  stride: -0.5, lean: -2 },

  pull:          { bat: 96,  hands: [15, 14], crouch: 0.15, stride: -0.5, lean: 0 },
  hook:          { bat: 66,  hands: [15, 11], crouch: 0,    stride: -0.6, lean: -6 },

  flick:         { bat: 140, hands: [19, 20], crouch: 0.2,  stride: 0.6, lean: 10 },
  legGlance:     { bat: 158, hands: [20, 21], crouch: 0.25, stride: 0.5, lean: 8 },

  sweep:         { bat: 118, hands: [17, 24], crouch: 0.95, stride: 0.8, lean: 14 },
  paddle:        { bat: 146, hands: [19, 25], crouch: 0.9,  stride: 0.7, lean: 12 },
  reverseSweep:  { bat: 246, hands: [26, 24], crouch: 0.9,  stride: 0.8, lean: 12 },

  ramp:          { bat: 26,  hands: [24, 13], crouch: 0.5,  stride: 0.3, lean: -8 },
  scoop:         { bat: 6,   hands: [21, 12], crouch: 0.7,  stride: 0.5, lean: -6 },
  switchHit:     { bat: 250, hands: [26, 13], crouch: 0.15, stride: 0.6, lean: 6 },
  lofted:        { bat: 330, hands: [24, 11], crouch: 0,    stride: 0.8, lean: 8 },
};

export default function BatsmanAvatar({ shotKey, hand = 'right', size = 46, color, accent, ground }) {
  const p = POSE[shotKey] || POSE.other;
  const S = size / 44;                       // everything below is authored at 44

  // Ground, hips and shoulders. Crouching drops the hips and shortens the torso,
  // which is what actually makes a sweep read as a sweep.
  const groundY = 39;
  const hipY = 26 + p.crouch * 5;
  const shoulderY = hipY - (11 - p.crouch * 2.5);
  const cx = 21;
  const shoulderX = cx + p.lean * 0.13;
  const headY = shoulderY - 4.6;

  // Bat: from the hands, out along its angle. 0° points straight up.
  const [hx, hy] = p.hands;
  const blade = 15;
  const bx = hx + blade * Math.sin(p.bat * RAD);
  const by = hy - blade * Math.cos(p.bat * RAD);
  // The handle runs the other way, so the hands sit between bat and body.
  const gx = hx - 4 * Math.sin(p.bat * RAD);
  const gy = hy + 4 * Math.cos(p.bat * RAD);

  const frontFootX = cx + 7 * p.stride;
  const backFootX = cx - 5;

  return (
    <Svg width={size} height={size} viewBox="0 0 44 44">
      {/* Mirrored bodily for a left-hander — same stroke, other way round. */}
      <G transform={isLeft(hand) ? 'translate(44,0) scale(-1,1)' : undefined}>
        <G transform={`scale(${1})`}>
          {/* Crease */}
          <Line x1={4} y1={groundY} x2={40} y2={groundY} stroke={ground} strokeWidth={1} strokeLinecap="round" />

          {/* Legs — back foot planted, front foot strides for the drives */}
          <Line x1={cx} y1={hipY} x2={backFootX} y2={groundY} stroke={color} strokeWidth={2} strokeLinecap="round" />
          <Line x1={cx} y1={hipY} x2={frontFootX} y2={groundY} stroke={color} strokeWidth={2} strokeLinecap="round" />

          {/* Torso + head */}
          <Line x1={cx} y1={hipY} x2={shoulderX} y2={shoulderY} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
          <Circle cx={shoulderX + p.lean * 0.05} cy={headY} r={3.1} fill={color} />

          {/* Arms to the top hand */}
          <Line x1={shoulderX} y1={shoulderY} x2={hx} y2={hy} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
          <Line x1={shoulderX} y1={shoulderY + 1.6} x2={hx} y2={hy + 1} stroke={color} strokeWidth={1.5} strokeLinecap="round" opacity={0.75} />

          {/* The bat — the accent, because it is the part that tells the strokes apart */}
          <Line x1={gx} y1={gy} x2={hx} y2={hy} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
          <Line x1={hx} y1={hy} x2={bx} y2={by} stroke={accent} strokeWidth={3.2} strokeLinecap="round" />
        </G>
      </G>
    </Svg>
  );
}

export { POSE };
