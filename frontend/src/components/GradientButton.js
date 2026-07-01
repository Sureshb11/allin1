// GradientButton — the signature "Action-Taker" CTA from the Kinetic Athlete
// design system. A 135° electric-blue gradient (primary_container #0052ff →
// primary #b7c4ff) that simulates the shimmer of technical sports apparel.
//
// Shared across every sport so primary actions (Start Match, Create, Verify…)
// look identical app-wide. Lime stays reserved for "Live / Go" moments.
//
//   <GradientButton label="Start Match" icon="cricket" onPress={…} />
//
// Props: label, icon (MaterialCommunityIcons name, optional), onPress,
// disabled, loading, style (outer), textStyle, iconRight (bool), height.

import { useState } from 'react';
import { TouchableOpacity, Text, View, ActivityIndicator, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';

export default function GradientButton({
  label,
  icon,
  onPress,
  disabled = false,
  loading = false,
  style,
  textStyle,
  iconRight = false,
  height = 54,
}) {
  const c = useTheme().colors;
  const [size, setSize] = useState({ w: 0, h: height });

  const from = c.blueDeep || '#0052ff';
  const to = c.blueSoft || '#b7c4ff';
  const ink = c.onBlue || '#ffffff';

  const IconEl = icon ? <Icon name={icon} size={20} color={ink} /> : null;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={disabled || loading}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[styles.btn, { height, opacity: disabled ? 0.5 : 1 }, style]}
    >
      {/* 135° gradient fill (top-left → bottom-right) behind the content */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGrad id="cta" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} stopOpacity="1" />
            <Stop offset="1" stopColor={to} stopOpacity="1" />
          </SvgGrad>
        </Defs>
        <Rect x="0" y="0" width={size.w || 400} height={size.h || height} fill="url(#cta)" />
      </Svg>

      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={ink} />
        ) : (
          <>
            {!iconRight && IconEl}
            {!!label && <Text style={[styles.label, { color: ink }, textStyle]}>{label}</Text>}
            {iconRight && IconEl}
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
});
