import React, { useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedProps, 
  withTiming, 
  withSpring,
  Easing,
  FadeInDown,
  FadeIn
} from 'react-native-reanimated';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { haptic } from '../utils/haptics';
import GradientButton from '../components/GradientButton';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function HistoricalStatsSuccessScreen({ navigation }) {
  const { colors: DS, isDark } = useTheme();
  const s = useThemedStyles(makeStyles);

  const checkProgress = useSharedValue(0);
  const circleProgress = useSharedValue(0);
  const scaleAnim = useSharedValue(0.5);

  useEffect(() => {
    // Sequence the success animations
    scaleAnim.value = withSpring(1, { damping: 12, stiffness: 90 });
    circleProgress.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
    
    setTimeout(() => {
      checkProgress.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) });
      haptic.success();
    }, 400);

  }, [scaleAnim, circleProgress, checkProgress]);

  const circleProps = useAnimatedProps(() => {
    const circumference = 2 * Math.PI * 46; // r=46
    return {
      strokeDasharray: circumference,
      strokeDashoffset: circumference * (1 - circleProgress.value),
    };
  });

  const checkProps = useAnimatedProps(() => {
    const length = 100; // approximate length of checkmark path
    return {
      strokeDasharray: length,
      strokeDashoffset: length * (1 - checkProgress.value),
    };
  });

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />
      
      <View style={s.body}>
        <Animated.View style={[s.iconContainer, { transform: [{ scale: scaleAnim }] }]}>
          <Svg width="120" height="120" viewBox="0 0 100 100">
            {/* Background glowing circle */}
            <Circle cx="50" cy="50" r="46" fill={DS.lime + '1a'} />
            
            {/* Animated border circle */}
            <AnimatedCircle 
              cx="50" cy="50" r="46" 
              fill="transparent" 
              stroke={DS.lime} 
              strokeWidth="4"
              strokeLinecap="round"
              animatedProps={circleProps}
              transform="rotate(-90 50 50)" // Start from top
            />

            {/* Animated Checkmark */}
            <AnimatedPath
              d="M30 50 L45 65 L70 35"
              fill="transparent"
              stroke={DS.lime}
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              animatedProps={checkProps}
            />
          </Svg>
        </Animated.View>

        <Animated.Text entering={FadeInDown.duration(500).delay(600)} style={s.h1}>
          Stats Submitted!
        </Animated.Text>
        
        <Animated.Text entering={FadeInDown.duration(500).delay(700)} style={s.sub}>
          Your historical stats have been securely saved and submitted for verification. They will appear on your profile once approved.
        </Animated.Text>
      </View>

      <Animated.View entering={FadeIn.duration(600).delay(900)} style={s.footer}>
        <GradientButton
          label="Continue to App"
          icon="arrow-right"
          iconRight
          onPress={() => {
            haptic.impact();
            // Reset navigation stack to MainApp so they can't swipe back to the success screen
            navigation.reset({
              index: 0,
              routes: [{ name: 'MainApp' }],
            });
          }}
          height={56}
          style={s.primaryBtn}
          textStyle={{ fontSize: 16 }}
          colors={[DS.lime, DS.lime]}
        />
      </Animated.View>
    </SafeAreaView>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: DS.bg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  
  iconContainer: {
    width: 120, height: 120,
    marginBottom: 40,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: DS.lime,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },

  h1: { fontSize: 32, fontWeight: '900', color: DS.textPrimary, letterSpacing: -0.5, textAlign: 'center' },
  sub: { fontSize: 16, fontWeight: '600', color: DS.textMuted, marginTop: 16, lineHeight: 24, textAlign: 'center' },

  footer: { paddingHorizontal: 24, paddingBottom: 32 },
  primaryBtn: { borderRadius: 16 },
});
