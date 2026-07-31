import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

export default function AmbientBackground({ color1 = 'rgba(15, 76, 58, 0.1)', color2 = 'rgba(132, 204, 22, 0.08)', color3 = 'rgba(234, 179, 8, 0.05)' }) {
  const t1 = useSharedValue(0);
  const t2 = useSharedValue(0);
  const rot1 = useSharedValue(0);
  const rot2 = useSharedValue(0);
  const rot3 = useSharedValue(0);

  useEffect(() => {
    t1.value = withRepeat(withSequence(
      withTiming(1, { duration: 15000, easing: Easing.inOut(Easing.ease) }),
      withTiming(0, { duration: 15000, easing: Easing.inOut(Easing.ease) })
    ), -1, true);
    
    t2.value = withRepeat(withSequence(
      withTiming(1, { duration: 12000, easing: Easing.inOut(Easing.ease) }),
      withTiming(0, { duration: 12000, easing: Easing.inOut(Easing.ease) })
    ), -1, true);

    rot1.value = withRepeat(withTiming(360, { duration: 40000, easing: Easing.linear }), -1, false);
    rot2.value = withRepeat(withTiming(-360, { duration: 35000, easing: Easing.linear }), -1, false);
    rot3.value = withRepeat(withTiming(360, { duration: 45000, easing: Easing.linear }), -1, false);
  }, []);

  const style1 = useAnimatedStyle(() => ({
    transform: [
      { translateX: t1.value * 80 },
      { translateY: t1.value * -60 },
      { scale: 1 + t1.value * 0.3 },
      { rotate: `${rot1.value}deg` }
    ]
  }));

  const style2 = useAnimatedStyle(() => ({
    transform: [
      { translateX: t2.value * -80 },
      { translateY: t2.value * 60 },
      { scale: 1 + t2.value * 0.4 },
      { rotate: `${rot2.value}deg` }
    ]
  }));

  const style3 = useAnimatedStyle(() => ({
    transform: [
      { translateX: (t1.value - t2.value) * 100 },
      { translateY: (t2.value - t1.value) * 50 },
      { scale: 1 + (t1.value + t2.value) * 0.15 },
      { rotate: `${rot3.value}deg` }
    ]
  }));

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View style={[styles.blob1, { backgroundColor: color1 }, style1]} />
      <Animated.View style={[styles.blob2, { backgroundColor: color2 }, style2]} />
      <Animated.View style={[styles.blob3, { backgroundColor: color3 }, style3]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: -1,
  },
  blob1: {
    position: 'absolute',
    width: width * 1.6,
    height: width * 1.2,
    borderRadius: width * 0.8,
    top: -width * 0.4,
    left: -width * 0.5,
  },
  blob2: {
    position: 'absolute',
    width: width * 1.3,
    height: width * 1.6,
    borderRadius: width * 0.7,
    bottom: -width * 0.3,
    right: -width * 0.5,
  },
  blob3: {
    position: 'absolute',
    width: width * 1.4,
    height: width * 1.1,
    borderRadius: width * 0.6,
    top: height * 0.2,
    left: width * 0.1,
  }
});
