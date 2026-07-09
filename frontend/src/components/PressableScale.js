import React, { useRef } from 'react';
import { Animated, Pressable } from 'react-native';

// Shared springy press feedback — the same compression feel as the Arena
// honeycomb picker, so tactility isn't a one-off gimmick on the first screen.
export default function PressableScale({ children, style, scaleTo = 0.96, ...props }) {
  const scale = useRef(new Animated.Value(1)).current;
  const springTo = (v) =>
    Animated.spring(scale, { toValue: v, friction: 6, tension: 120, useNativeDriver: true }).start();
  return (
    <Pressable onPressIn={() => springTo(scaleTo)} onPressOut={() => springTo(1)} {...props}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
