import React, { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Polygon, Image as SvgImage, ClipPath, Defs } from 'react-native-svg';

// Hexagon avatar — carries the Arena honeycomb motif through the whole app
// (leaderboards, team lists, fixtures) instead of generic circles.
//
// Pass `uri` to clip a player photo into the hexagon; otherwise it fills with
// `color` and renders `children` (typically the initials) centred on top.
let hexSeq = 0;
export default function HexAvatar({ size = 44, color = '#888', uri, style, children }) {
  const r = size / 2;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90); // pointy-top hexagon
    return `${r + r * Math.cos(a)},${r + r * Math.sin(a)}`;
  }).join(' ');
  const clipId = useRef(`hexclip${++hexSeq}`).current;
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {uri ? (
          <>
            <Defs><ClipPath id={clipId}><Polygon points={pts} /></ClipPath></Defs>
            <SvgImage href={{ uri }} x="0" y="0" width={size} height={size}
              preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />
          </>
        ) : (
          <Polygon points={pts} fill={color} />
        )}
      </Svg>
      {!uri && children}
    </View>
  );
}
