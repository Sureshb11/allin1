// A shot, drawn small.
//
// The picker shows twenty options and the scorer has about a second to find one.
// Twenty words all set in the same type are twenty things to READ; twenty little
// pictures pointing in different directions are something you recognise. This is
// that picture: a batter at the middle, and the ball leaving in the direction the
// stroke usually sends it.
//
// Hand-aware, like everything else here — a left-hander's cover drive goes to the
// other side of the glyph, because it goes to the other side of the ground.
//
// The directions are representative, not rules. Nothing validates a recorded shot
// against them (see SHOT_DIRECTION): a batter can cut one to mid-on, and the
// scorer is describing what happened.

import React from 'react';
import Svg, { Circle, Path, Line } from 'react-native-svg';
import { SHOT_DIRECTION, wrapAngle } from '../sports/cricket/wagonWheel';

const RAD = Math.PI / 180;
const isLeft = (hand) => String(hand || '').toLowerCase().startsWith('l');

export default function ShotGlyph({ shotKey, hand = 'right', size = 30, color, dim }) {
  const dir = SHOT_DIRECTION[shotKey];
  const c = size / 2;
  const r = size * 0.40;

  // No direction — a defended ball, a leave, a play and miss. Draw the batter
  // and nothing leaving, which is exactly what happened.
  if (!dir) {
    return (
      <Svg width={size} height={size}>
        <Circle cx={c} cy={c} r={size * 0.11} fill={color} />
        <Circle cx={c} cy={c} r={r} fill="none" stroke={dim} strokeWidth={1} strokeDasharray="2 2" />
      </Svg>
    );
  }

  const a = wrapAngle(isLeft(hand) ? 360 - dir.angle : dir.angle);
  const x = c + r * Math.sin(a * RAD);
  const y = c - r * Math.cos(a * RAD);

  return (
    <Svg width={size} height={size}>
      <Circle cx={c} cy={c} r={r} fill="none" stroke={dim} strokeWidth={1} strokeDasharray="2 2" />
      {dir.aerial ? (
        // A curve bulging off the straight line reads as "over the fielder"
        // without needing a second dimension to draw height in.
        <Path
          d={`M ${c} ${c} Q ${c + (x - c) * 0.45 - (y - c) * 0.42} ${c + (y - c) * 0.45 + (x - c) * 0.42} ${x} ${y}`}
          fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round"
        />
      ) : (
        <Line x1={c} y1={c} x2={x} y2={y} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      )}
      <Circle cx={x} cy={y} r={size * 0.075} fill={color} />
      <Circle cx={c} cy={c} r={size * 0.11} fill={color} />
    </Svg>
  );
}
