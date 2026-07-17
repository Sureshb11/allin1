// StadiumLightsIcon — a floodlit stadium glyph: two light towers flanking a
// stadium bowl. Used for the dock's "Pavilion" slot so it reads unmistakably as
// a stadium (MaterialCommunityIcons has no floodlight-stadium icon). Draws in
// the current tint (`color`) so it lights up green when the tab is selected,
// matching the vector icons in the other slots.
import React from 'react';
import Svg, { Path, Ellipse, Polygon } from 'react-native-svg';

export default function StadiumLightsIcon({ size = 24, color = '#000' }) {
  const sw = 1.7;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Left floodlight — lamp bank + pole */}
      <Polygon points="1.6,6.6 5.8,5.4 6.2,7.0 2.0,8.2" fill={color} />
      <Path d="M4.1 7.3 L4.1 21" stroke={color} strokeWidth={sw} strokeLinecap="round" />

      {/* Right floodlight — lamp bank + pole (mirrored) */}
      <Polygon points="22.4,6.6 18.2,5.4 17.8,7.0 22.0,8.2" fill={color} />
      <Path d="M19.9 7.3 L19.9 21" stroke={color} strokeWidth={sw} strokeLinecap="round" />

      {/* Stadium bowl + inner field */}
      <Ellipse cx="12" cy="17.4" rx="5.4" ry="2.7" stroke={color} strokeWidth={sw} />
      <Ellipse cx="12" cy="17.4" rx="2.5" ry="1.2" stroke={color} strokeWidth={sw} />
    </Svg>
  );
}
