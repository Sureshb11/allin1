import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export default function Shimmer({ width, height, style, borderRadius = 8 }) {
  const { isDark, colors } = useTheme();
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(animValue, { toValue: 1, duration: 1000, useNativeDriver: false }),
        Animated.timing(animValue, { toValue: 0, duration: 1000, useNativeDriver: false })
      ])
    ).start();
  }, [animValue]);

  const baseColor = isDark ? colors.surfaceHigh : colors.surfaceLow;
  const highlightColor = isDark ? colors.surfaceHighest || '#3a3f58' : colors.surfaceHigh;

  const backgroundColor = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [baseColor, highlightColor]
  });

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor, overflow: 'hidden' },
        style
      ]}
    />
  );
}
