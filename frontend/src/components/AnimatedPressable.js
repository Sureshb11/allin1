import React, { useRef } from 'react';
import { Pressable, Animated } from 'react-native';

export default function AnimatedPressable({ children, onPress, style, contentStyle, scaleTo = 0.95, activeOpacity = 1, ...props }) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = (e) => {
    Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 30, bounciness: 0 }).start();
    if (props.onPressIn) props.onPressIn(e);
  };

  const handlePressOut = (e) => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 12 }).start();
    if (props.onPressOut) props.onPressOut(e);
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={({ pressed }) => [
        style,
        pressed && activeOpacity !== 1 ? { opacity: activeOpacity } : null
      ]}
      {...props}
    >
      <Animated.View style={[contentStyle, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
