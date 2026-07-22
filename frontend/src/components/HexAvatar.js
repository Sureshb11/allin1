import React, { useRef } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import Svg, { Polygon, Image as SvgImage, ClipPath, Defs } from 'react-native-svg';

// Avatar for the app. By default it's the Arena honeycomb HEXAGON — the badge/
// crest motif we use for TEAMS & emblems (leaderboards of teams, fixtures, the
// match card, the sport switcher).
//
// Pass `round` for PEOPLE (post authors, players, award winners): it renders a
// CIRCLE instead. A person reads as a circle everywhere in mobile UI, and a
// photo crops naturally into a circle where a hexagon clips the face at its
// corners. Same API either way (size / color / uri / children).
//
// `uri` clips a photo into the shape; otherwise it fills with `color` and
// centres `children` (typically the initials) on top.
let hexSeq = 0;
export default function HexAvatar({ size = 44, color = '#888', uri, style, children, round }) {
  const clipId = useRef(`hexclip${++hexSeq}`).current;   // hoisted: hooks run every render
  const r = size / 2;
  const wrap = [{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style];

  // People → circle. A plain Image/View with borderRadius is crisper than an SVG
  // mask and needs no clip path.
  if (round) {
    return (
      <View style={wrap}>
        {uri
          ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: r }} resizeMode="cover" />
          : <View style={[StyleSheet.absoluteFill, { borderRadius: r, backgroundColor: color }]} />}
        {!uri && children}
      </View>
    );
  }

  // Teams / emblems → hexagon.
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90); // pointy-top hexagon
    return `${r + r * Math.cos(a)},${r + r * Math.sin(a)}`;
  }).join(' ');
  return (
    <View style={wrap}>
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
