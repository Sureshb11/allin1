import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { BRAND_TAGLINE } from './BrandLogo';
import ThemeToggleButton from './ThemeToggleButton';

export default function SplashScreen() {
  const C = useTheme().colors;
  const s = useThemedStyles(makeS);
  const animScale = useRef(new Animated.Value(0.7)).current;
  const animOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const animX = useRef(new Animated.Value(0)).current;
  const animY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(animScale, { toValue: 1, friction: 7, tension: 50, useNativeDriver: true }),
      Animated.timing(animOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 900, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    // Slowly wandering gradient mesh
    Animated.loop(
      Animated.sequence([
        Animated.timing(animX, { toValue: 40, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(animY, { toValue: -30, duration: 3500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(animX, { toValue: -20, duration: 4500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(animY, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(animX, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const logoStyle = {
    opacity: animOpacity,
    transform: [{ scale: animScale }],
  };

  const pulseStyle = {
    opacity: pulseAnim,
    transform: [{
      scale: pulseAnim.interpolate({
        inputRange: [0.3, 1],
        outputRange: [0.95, 1.05]
      })
    }]
  };

  return (
    <View style={s.root}>
      {/* Stadium Background Glow */}
      <Animated.View style={[StyleSheet.absoluteFill, { 
        width: '120%', height: '120%', top: '-10%', left: '-10%',
        transform: [{ translateX: animX }, { translateY: animY }] 
      }]}>
        <Svg pointerEvents="none" width="100%" height="100%">
          <Defs>
            <RadialGradient id="splashGlow" cx="50%" cy="45%" r="60%">
              <Stop offset="0" stopColor={C.lime} stopOpacity={0.25} />
              <Stop offset="0.7" stopColor={C.blueSoft} stopOpacity={0.08} />
              <Stop offset="1" stopColor={C.bg} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#splashGlow)" />
        </Svg>
      </Animated.View>

      <ThemeToggleButton style={{ position: 'absolute', top: 56, right: 24, zIndex: 10 }} />

      <Animated.View style={[s.centerContainer, logoStyle]}>
        {/* Pulsing Outer Ring */}
        <Animated.View style={[s.glowRing, pulseStyle]} />

        {/* Logo Badge Row */}
        <View style={s.row}>
          <View style={s.logoBox}>
            <Icon name="star-four-points" size={24} color={C.bg} />
          </View>
          <Text style={s.local}>LOCAL</Text>
          <View style={s.badge}>
            <Text style={s.badgeTxt}>LEGENDS</Text>
          </View>
        </View>

        <Text style={s.tagline}>{BRAND_TAGLINE}</Text>
      </Animated.View>

      {/* Modern Loader Track */}
      <View style={s.loaderContainer}>
        <Animated.View style={[s.loaderBar, { opacity: pulseAnim }]} />
      </View>
    </View>
  );
}

const makeS = (C) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    width: 220,
    height: 100,
    borderRadius: 50,
    backgroundColor: C.lime + '15',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.lime,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.lime,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  local: {
    fontSize: 24,
    fontWeight: '900',
    color: C.ink,
    letterSpacing: 2.5,
  },
  badge: {
    backgroundColor: C.lime,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeTxt: {
    fontSize: 17,
    fontWeight: '900',
    color: C.bg,
    letterSpacing: 1.5,
  },
  tagline: {
    fontSize: 11,
    fontWeight: '700',
    color: C.ink,
    opacity: 0.65,
    letterSpacing: 2.8,
    textTransform: 'uppercase',
    marginTop: 16,
  },
  loaderContainer: {
    position: 'absolute',
    bottom: 60,
    width: 120,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.surfaceLow || '#1e2333',
    overflow: 'hidden',
  },
  loaderBar: {
    flex: 1,
    backgroundColor: C.lime,
    borderRadius: 2,
  },
});