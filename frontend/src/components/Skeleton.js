import React, { useRef, useEffect } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

const Skeleton = ({ width = '100%', height = 16, radius = 8, style }) => {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1200, useNativeDriver: false }),
        Animated.timing(shimmer, { toValue: 0, duration: 1200, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const background = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: ['#e5e7eb', '#f3f4f6'],
  });

  return (
    <Animated.View style={[styles.block, { width, height, borderRadius: radius, backgroundColor: background }, style]} />
  );
};

const styles = StyleSheet.create({
  block: {
    overflow: 'hidden',
  },
});

export default Skeleton;

