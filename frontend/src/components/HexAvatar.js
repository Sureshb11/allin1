import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

// Hexagon avatar — carries the Arena honeycomb motif through the whole app
// (leaderboards, team lists, fixtures) instead of generic circles.
export default function HexAvatar({ size = 44, color = '#888', style, children }) {
  const r = size / 2;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90); // pointy-top hexagon
    return `${r + r * Math.cos(a)},${r + r * Math.sin(a)}`;
  }).join(' ');
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Polygon points={pts} fill={color} />
      </Svg>
      {children}
    </View>
  );
}
