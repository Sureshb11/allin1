import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  withSequence,
  Easing,
  FadeIn,
  FadeOut
} from 'react-native-reanimated';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { haptic } from '../utils/haptics';

const STATUS_MESSAGES = [
  "Extracting scorecard...",
  "Analyzing match rows...",
  "Calculating totals...",
  "Finalizing data..."
];

export default function HistoricalStatsOcrScreen({ navigation, route }) {
  const { colors: DS, isDark } = useTheme();
  const s = useThemedStyles(makeStyles);
  const sport = route.params?.sport;
  const imageUris = route.params?.imageUris || [];

  const [statusIndex, setStatusIndex] = useState(0);

  const scanAnim = useSharedValue(0);
  const pulseAnim = useSharedValue(1);
  const glowOpacity = useSharedValue(0.3);

  useEffect(() => {
    haptic.impact();

    // Scanning laser animation
    scanAnim.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    // Pulse icon animation
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    // Glow effect
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    // Cycle status messages
    const textInterval = setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
      haptic.tick();
    }, 1200);

    // Simulate OCR processing time
    const timer = setTimeout(() => {
      clearInterval(textInterval);
      navigation.replace('HistoricalStatsReview', { sport, imageUris });
    }, 4500);

    return () => {
      clearTimeout(timer);
      clearInterval(textInterval);
    };
  }, [navigation, sport, imageUris, scanAnim, pulseAnim, glowOpacity]);

  const laserStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -80 + (scanAnim.value * 160) }]
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }]
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />
      
      <View style={s.body}>
        <View style={s.scannerBox}>
          <Animated.View style={[s.glowBackground, glowStyle]} />
          
          <Animated.View style={[s.iconBox, iconStyle]}>
            <Icon name="text-recognition" size={64} color={DS.lime} />
          </Animated.View>
          
          <Animated.View style={[s.laser, laserStyle]} />
        </View>

        <Text style={s.h1}>
          {imageUris.length > 1 ? `Reading ${imageUris.length} Scorecards...` : 'Reading Scorecard...'}
        </Text>
        
        {/* Animated Text cycling */}
        <Animated.View key={statusIndex} entering={FadeIn.duration(300)} exiting={FadeOut.duration(300)}>
          <Text style={s.sub}>{STATUS_MESSAGES[statusIndex]}</Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: DS.bg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  
  scannerBox: {
    width: 200, height: 200, borderRadius: 32,
    backgroundColor: DS.surfaceHigh, borderWidth: 2, borderColor: DS.surfaceHighest || '#2a2f42',
    alignItems: 'center', justifyContent: 'center', marginBottom: 40, overflow: 'hidden'
  },
  glowBackground: {
    position: 'absolute',
    width: '100%', height: '100%',
    backgroundColor: DS.lime + '20', // subtle lime glow
  },
  iconBox: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: DS.lime + '1a', alignItems: 'center', justifyContent: 'center',
    zIndex: 2,
  },
  laser: {
    position: 'absolute', width: '100%', height: 4, backgroundColor: DS.lime,
    shadowColor: DS.lime, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 10, elevation: 5,
    zIndex: 3,
  },

  h1: { fontSize: 26, fontWeight: '900', color: DS.textPrimary, letterSpacing: -0.5, textAlign: 'center' },
  sub: { fontSize: 16, fontWeight: '700', color: DS.lime, marginTop: 12, lineHeight: 22, textAlign: 'center' },
});
