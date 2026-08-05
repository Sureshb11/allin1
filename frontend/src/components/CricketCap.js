// The Orange / Purple / Green cap.
//
// Drawn rather than picked from an icon set: MaterialCommunityIcons has no
// cricket cap, and the near-misses (a fedora, a crown, a helmet) all say
// something else. It is a dome, a peak and a button — the smallest shape that
// still reads as a cap at 18px, which is the size it renders at in a table row.
//
// The colour IS the meaning here, so it is the only required prop.

import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

// Who wears which. Named rather than passed as hex from the call site, so a
// leaderboard cannot invent a fourth cap or draw the Orange Cap in green.
export const CAP_COLORS = {
  orange: '#f57c1f',   // most runs
  purple: '#7c3aed',   // most wickets
  green:  '#16a34a',   // best fielder
};

export const CAP_LABELS = {
  orange: 'Orange Cap',
  purple: 'Purple Cap',
  green:  'Green Cap',
};

export default function CricketCap({ cap = 'orange', size = 18 }) {
  const fill = CAP_COLORS[cap] || CAP_COLORS.orange;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Dome: a half-circle sitting on the brim line. */}
      <Path d="M4 15a8 8 0 0 1 16 0Z" fill={fill} />
      {/* Peak, angled to the right so the cap has a front to face. */}
      <Path d="M12 15h10.2a1.3 1.3 0 0 0 .5-2.5l-4.2-1.6a1 1 0 0 0-.4-.1H12Z"
        fill={fill} opacity={0.82} />
      {/* Button on the crown — the detail that stops it reading as a bowl. */}
      <Circle cx="12" cy="6.6" r="1.15" fill={fill} />
    </Svg>
  );
}
